-- Yash Honda Vacancy & Hiring Tracker - transactional core
--
-- WHY FUNCTIONS RATHER THAN REST WRITES
--   A status change in this product is never one row: it is the row, its
--   status-history entry, the approval task it resolves, the follow-up task it
--   creates, notifications, and the audit event. PostgREST gives one function
--   call one transaction; it cannot give that to four sequential REST requests.
--   So every mutation that matters is a single SECURITY DEFINER call, and an
--   audit line that failed to write rolls the business change back with it.
--
--   Each function re-checks authorization itself (definer bypasses RLS) and
--   refuses when the actor passed is not the caller.

-- ===========================================================================
-- shared helpers
-- ===========================================================================
create or replace function public.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_actor uuid,
  p_result text default 'success',
  p_reason text default null,
  p_old jsonb default null,
  p_new jsonb default null,
  p_meta jsonb default '{}'::jsonb,
  p_request_id uuid default null,
  p_position_id uuid default null,
  p_candidate_id uuid default null,
  p_facility_id uuid default null
) returns void language plpgsql as $$
begin
  insert into public.audit_events (
    occurred_at, actor_id, actor_role, action, entity_type, entity_id,
    request_id, position_id, candidate_id, facility_id,
    old_value, new_value, reason, result, metadata
  ) values (
    now(), p_actor,
    (select role from public.users where id = p_actor),
    p_action, p_entity_type, p_entity_id,
    p_request_id, p_position_id, p_candidate_id, p_facility_id,
    p_old, p_new, p_reason, p_result, p_meta
  );
end;
$$;

-- The actor argument must be the authenticated caller, or the session-less
-- retention worker. Without this, a definer function would be an impersonation
-- machine.
create or replace function public.assert_actor(p_actor uuid)
returns void language plpgsql as $$
begin
  if auth.uid() is not null and p_actor is distinct from auth.uid() then
    insert into public.security_incidents
      (incident_type, severity, actor_user_id, detail, target_entity_id)
    values ('unauthorized_access_attempt', 'high', auth.uid(),
            format('actor parameter %s did not match session %s', p_actor, auth.uid()), p_actor);
    raise exception 'forbidden: actor does not match the authenticated session'
      using errcode = '42501';
  end if;
  if p_actor is not null then
    -- transaction-local, visible to the status-history triggers, dies with the
    -- transaction so it can never leak through the connection pool
    perform set_config('app.user_id', p_actor::text, true);
  end if;
end;
$$;

create or replace function public.actor_role_for(p_actor uuid)
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = p_actor and is_active = true;
$$;

-- Read the configured move. Returns null when the workflow does not allow it.
create or replace function public.configured_transition(
  p_workflow_key text, p_from text, p_action text
) returns setof public.workflow_transitions
language sql stable security definer set search_path = public as $$
  select t.* from public.workflow_transitions t
  join public.workflow_definitions d on d.id = t.workflow_id
  where d.key = p_workflow_key and d.is_active
    and t.from_status = p_from and t.action = p_action;
$$;

create or replace function public.require_role(p_actor uuid, p_allowed text[], p_action text)
returns void language plpgsql as $$
declare r public.user_role;
begin
  r := public.actor_role_for(p_actor);
  if r is null then
    raise exception 'forbidden: account is inactive or missing' using errcode = '42501';
  end if;
  if array_length(p_allowed, 1) > 0 and not (r = any (p_allowed::public.user_role[])) then
    raise exception 'forbidden: % cannot perform %', r, p_action using errcode = '42501';
  end if;
end;
$$;

-- Close whichever task this decision answers, if one is still open.
create or replace function public.settle_task(
  p_entity_type text, p_entity_id uuid, p_actor uuid, p_action text, p_comment text
) returns void language plpgsql as $$
begin
  update public.approval_tasks
     set status = 'acted', acted_at = now(), acted_by = p_actor, action = p_action,
         comment = coalesce(p_comment, comment)
   where entity_type = p_entity_type and entity_id = p_entity_id and status = 'pending';
  -- the raiser may not settle their own request through a stale task row
  update public.notification_outbox
     set read_at = now()
   where entity_type = p_entity_type and entity_id = p_entity_id and read_at is null;
end;
$$;

create or replace function public.cancel_tasks(
  p_entity_type text, p_entity_ids uuid[], p_reason text
) returns void language plpgsql as $$
begin
  update public.approval_tasks
     set status = 'cancelled', acted_at = now(), comment = p_reason
   where entity_type = p_entity_type
     and entity_id = any (p_entity_ids)
     and status = 'pending';
end;
$$;

-- ===========================================================================
-- 1. raise a vacancy request: one request, N positions, never the reverse
-- ===========================================================================
create or replace function public.create_vacancy_request(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor       uuid := (p->>'actor')::uuid;
  v_qty         int  := coalesce((p->>'quantity')::int, 0);
  v_submit      boolean := coalesce((p->>'submit')::boolean, true);
  v_role        public.user_role;
  v_request_id  uuid;
  v_number      text;
  v_status      public.request_status;
  v_pos_status  public.position_status;
  v_facility    uuid;
  v_position_ids uuid[];
begin
  perform public.assert_actor(v_actor);
  v_role := public.actor_role_for(v_actor);
  if v_role not in ('Employee','HR','HrHead','Admin') then
    raise exception 'forbidden: % may not raise a vacancy request', coalesce(v_role, 'unknown')
      using errcode = '42501';
  end if;

  -- required before anything exists, so a half-filled request is not a state
  if coalesce(p->>'title','') = '' or length(trim(p->>'title')) < 3 then
    raise exception 'validation: title is required';
  end if;
  if coalesce(p->>'reason','') = '' then raise exception 'validation: reason is required'; end if;
  if coalesce(p->>'position_type','') = '' then raise exception 'validation: role/position type is required'; end if;
  if length(coalesce(p->>'justification','')) < 5 then
    raise exception 'validation: business justification is required';
  end if;
  if v_qty < 1 then raise exception 'validation: at least one position is required'; end if;
  if v_qty > 50 then raise exception 'validation: a single request cannot exceed 50 positions'; end if;
  if coalesce((p->>'acknowledgement_accepted')::boolean, false) is not true then
    raise exception 'validation: the requester must accept the vacancy request acknowledgement';
  end if;
  if (p->>'ctc_min') is not null and (p->>'ctc_max') is not null
     and (p->>'ctc_min')::numeric > (p->>'ctc_max')::numeric then
    raise exception 'validation: CTC ceiling is below the floor';
  end if;

  v_facility := (p->>'facility_id')::uuid;
  if not exists (select 1 from public.facilities f where f.id = v_facility and f.is_active) then
    raise exception 'validation: facility is unknown or inactive';
  end if;
  -- an Employee may only raise for a facility they belong to
  if v_role = 'Employee' and not public.can_view(v_facility) then
    raise exception 'forbidden: you may only raise requests for your own facility'
      using errcode = '42501';
  end if;

  v_status := case when v_submit then 'submitted_for_vacancy_approval'::public.request_status
                   else 'draft'::public.request_status end;
  v_pos_status := case when v_submit then 'awaiting_vacancy_approval'::public.position_status
                       else 'draft'::public.position_status end;

  insert into public.vacancy_requests (
    number, title, reason, facility_id, position_type, min_qualification, experience_text,
    has_backfill_ref, backfill_ref_note, budget_available, ctc_min, ctc_max, joining_date,
    is_urgent, status, quantity, target_fill_date, justification, previous_employee_name,
    acknowledgement_accepted, acknowledgement_version, submitted_at, submitted_by, created_by
  ) values (
    null, p->>'title', (p->>'reason')::text, v_facility, p->>'position_type',
    p->>'min_qualification', p->>'experience_text',
    coalesce((p->>'has_backfill_ref')::boolean, false), p->>'backfill_ref_note',
    (p->>'budget_available')::boolean, (p->>'ctc_min')::numeric, (p->>'ctc_max')::numeric,
    (p->>'joining_date')::date, coalesce((p->>'is_urgent')::boolean, false),
    v_status, v_qty, (p->>'target_fill_date')::date, p->>'justification',
    p->>'previous_employee_name', true, coalesce(p->>'acknowledgement_version','1.0-draft'),
    case when v_submit then now() end, v_actor, v_actor
  )
  returning id, number into v_request_id, v_number;

  -- the quantity becomes positions. It is never a candidate count.
  with generated as (
    insert into public.positions (request_id, label, facility_id, status, resume_required,
                                  photo_required, ctc_min, ctc_max, target_fill_date, created_by)
    select v_request_id,
           coalesce(p->>'position_type','Position') || ' ' || n,
           v_facility, v_pos_status,
           coalesce((p->>'resume_required')::boolean, true),
           coalesce((p->>'photo_required')::boolean, true),
           (p->>'ctc_min')::numeric, (p->>'ctc_max')::numeric, (p->>'target_fill_date')::date,
           v_actor
    from generate_series(1, v_qty) n
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_position_ids from generated;

  if v_submit then
    insert into public.approval_tasks
      (entity_type, entity_id, task_type, assigned_role, requested_by, priority, sla_hours, due_at)
    values ('vacancy_request', v_request_id, 'vacancy_approval', 'Owner', v_actor,
            case when coalesce((p->>'is_urgent')::boolean,false) then 'urgent' else 'normal' end,
            72, now() + interval '72 hours');
    insert into public.notification_outbox
      (recipient_id, entity_type, entity_id, title, body, link, severity)
    select u.id, 'vacancy_request', v_request_id,
           format('%s: %s position(s) awaiting vacancy approval', v_number, v_qty),
           p->>'title', '/requests/' || v_request_id,
           case when coalesce((p->>'is_urgent')::boolean,false) then 'warn' else 'info' end
    from public.users u
    where u.role in ('Owner','CEO') and u.is_active;
  end if;

  perform public.write_audit(
    case when v_submit then 'vacancy_request.submit' else 'vacancy_request.create_draft' end,
    'vacancy_request', v_request_id::text, v_actor, 'success', null,
    null,
    jsonb_build_object('number', v_number, 'quantity', v_qty, 'positions', v_position_ids),
    jsonb_build_object('reason', p->>'reason', 'facility_id', v_facility),
    v_request_id, null, null, v_facility
  );

  return jsonb_build_object('id', v_request_id, 'number', v_number, 'positions', v_position_ids);
end;
$$;

-- ===========================================================================
-- 2. request-level transition (approve / return / reject / close)
-- ===========================================================================
create or replace function public.transition_request(
  p_request_id uuid,
  p_action text,
  p_actor uuid,
  p_reason text default null,
  p_comment text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.vacancy_requests%rowtype;
  t public.workflow_transitions%rowtype;
  v_to public.request_status;
  v_affected uuid[];
begin
  perform public.assert_actor(p_actor);

  select * into r from public.vacancy_requests where id = p_request_id for update;
  if not found then raise exception 'not found: vacancy request %', p_request_id; end if;

  select * into t from public.configured_transition('vacancy_request_default', r.status::text, p_action);
  if not found then
    perform public.write_audit('vacancy_request.'||p_action, 'vacancy_request', p_request_id::text,
                               p_actor, 'conflict', p_reason, jsonb_build_object('status', r.status), null,
                               jsonb_build_object('action', p_action), p_request_id, null, null, r.facility_id);
    raise exception 'invalid transition: % cannot be % from %', r.number, p_action, r.status;
  end if;

  perform public.require_role(p_actor, t.allowed_roles, p_action);

  -- no one approves what they raised
  if p_action in ('approve','reject','return_for_information')
     and r.submitted_by = p_actor then
    perform public.write_audit('vacancy_request.'||p_action, 'vacancy_request', p_request_id::text,
                               p_actor, 'denied', 'self-approval attempt', null, null,
                               jsonb_build_object('submitted_by', r.submitted_by), p_request_id);
    raise exception 'forbidden: you raised this request and cannot decide it' using errcode = '42501';
  end if;

  if t.requires_reason and coalesce(trim(p_reason),'') = '' then
    raise exception 'validation: a reason is required for %', p_action;
  end if;
  if t.requires_comment and coalesce(trim(p_comment),'') = '' then
    raise exception 'validation: a comment is required for %', p_action;
  end if;

  v_to := t.to_status::public.request_status;

  update public.vacancy_requests
     set status = v_to,
         closure_reason = case when v_to = 'closed' then coalesce(p_reason, p_comment) else closure_reason end,
         closed_at = case when v_to = 'closed' then now() else closed_at end
   where id = p_request_id;

  -- the request decision cascades to its positions; positions are the unit of
  -- hiring, so each one gets its own history row
  if v_to = 'approved' then
    update public.positions set status = 'approved'
      where request_id = p_request_id and status = 'awaiting_vacancy_approval';
  elsif v_to in ('rejected','closed') then
    update public.positions set status = 'position_closed'
      where request_id = p_request_id and status not in ('hired','position_closed');
  elsif v_to = 'returned_for_information' then
    update public.positions set status = 'draft'
      where request_id = p_request_id and status = 'awaiting_vacancy_approval';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_affected
    from public.positions where request_id = p_request_id;

  if v_to in ('approved','rejected','closed','returned_for_information') then
    perform public.settle_task('vacancy_request', p_request_id, p_actor, p_action, p_comment);
  end if;
  if v_to in ('rejected','closed') then
    perform public.cancel_tasks('position', v_affected, 'Parent request ' || p_action);
  end if;

  if v_to = 'approved' then
    insert into public.notification_outbox (recipient_id, entity_type, entity_id, title, body, link, severity)
    select r.created_by, 'vacancy_request', p_request_id,
           r.number || ' approved - sourcing can start',
           format('%s position(s) released to sourcing.', array_length(v_affected, 1)),
           '/requests/' || p_request_id, 'info'
    where r.created_by is not null;
  end if;

  perform public.write_audit(
    'vacancy_request.' || p_action, 'vacancy_request', p_request_id::text, p_actor, 'success',
    p_reason, jsonb_build_object('status', r.status), jsonb_build_object('status', v_to),
    jsonb_build_object('comment', p_comment, 'positions_affected', v_affected),
    p_request_id, null, null, r.facility_id
  );

  return jsonb_build_object('id', p_request_id, 'status', v_to, 'positions', v_affected);
end;
$$;

-- ===========================================================================
-- 3. position-level transition
-- ===========================================================================
create or replace function public.transition_position(
  p_position_id uuid,
  p_action text,
  p_actor uuid,
  p_reason text default null,
  p_comment text default null,
  p_patch jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p0 public.positions%rowtype;
  r  public.vacancy_requests%rowtype;
  t  public.workflow_transitions%rowtype;
  v_to public.position_status;
begin
  perform public.assert_actor(p_actor);

  select * into p0 from public.positions where id = p_position_id for update;
  if not found then raise exception 'not found: position %', p_position_id; end if;
  select * into r from public.vacancy_requests where id = p0.request_id;

  select * into t from public.configured_transition('position_default', p0.status::text, p_action);
  if not found then
    perform public.write_audit('position.'||p_action, 'position', p_position_id::text, p_actor,
                               'conflict', p_reason, jsonb_build_object('status', p0.status), null,
                               jsonb_build_object('action', p_action), p0.request_id, p_position_id, null, p0.facility_id);
    raise exception 'invalid transition: % cannot be % from %', p0.position_number, p_action, p0.status;
  end if;

  perform public.require_role(p_actor, t.allowed_roles, p_action);

  if t.requires_reason and coalesce(trim(p_reason),'') = '' then
    raise exception 'validation: a reason is required for %', p_action;
  end if;
  if t.requires_comment and coalesce(trim(p_comment),'') = '' then
    raise exception 'validation: a comment is required for %', p_action;
  end if;

  -- the parent must still be alive: an approved vacancy that was later closed
  -- cannot keep producing hires
  if r.status in ('rejected','closed') and t.to_status not in ('position_closed') then
    raise exception 'conflict: request % is %, the position cannot move forward', r.number, r.status;
  end if;

  v_to := t.to_status::public.position_status;

  update public.positions set
    status = v_to,
    ctc_min        = coalesce((p_patch->>'ctc_min')::numeric, ctc_min),
    ctc_max        = coalesce((p_patch->>'ctc_max')::numeric, ctc_max),
    target_fill_date = coalesce((p_patch->>'target_fill_date')::date, target_fill_date),
    hold_reason    = case when v_to = 'hold' then coalesce(p_reason, hold_reason) end,
    hold_start_date = case when v_to = 'hold' then coalesce((p_patch->>'hold_start_date')::date, current_date) end,
    hold_end_date_expected = case when v_to = 'hold' then (p_patch->>'hold_end_date_expected')::date end,
    previous_status_before_hold = case when v_to = 'hold' then p0.status else null end,
    hired_at = case when v_to = 'hired' then coalesce(hired_at, now()) else hired_at end
  where id = p_position_id;

  -- hold creates a review obligation, so the paused position cannot be lost
  if v_to = 'hold' then
    insert into public.approval_tasks
      (entity_type, entity_id, position_id, task_type, assigned_role, requested_by,
       priority, sla_hours, due_at)
    values ('position', p_position_id, p_position_id, 'hold_review', 'Owner', p_actor,
            'normal', 720, now() + interval '30 days');
    perform public.cancel_tasks('position', array[p_position_id], 'Position placed on hold');
  end if;

  if p_action = 'resume' then
    update public.approval_tasks
       set status = 'cancelled', acted_at = now(), comment = 'Hold reviewed and resumed'
     where position_id = p_position_id and task_type = 'hold_review' and status = 'pending';
  end if;

  perform public.write_audit(
    'position.' || p_action, 'position', p_position_id::text, p_actor, 'success', p_reason,
    jsonb_build_object('status', p0.status, 'previous_status_before_hold', p0.previous_status_before_hold),
    jsonb_build_object('status', v_to),
    jsonb_build_object('comment', p_comment, 'patch', p_patch),
    p0.request_id, p_position_id, null, p0.facility_id
  );

  return jsonb_build_object('id', p_position_id, 'status', v_to,
                            'previous_status_before_hold',
                            case when v_to = 'hold' then p0.status else null end);
end;
$$;

-- ===========================================================================
-- 4. hold a whole request, or selected positions within it
-- ===========================================================================
create or replace function public.hold_positions(
  p_position_ids uuid[],
  p_actor uuid,
  p_reason text,
  p_start_date date default current_date,
  p_expected_end date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  v_count int := 0;
  v_blocked text[] := '{}';
begin
  perform public.assert_actor(p_actor);
  if coalesce(trim(p_reason),'') = '' then
    raise exception 'validation: a hold reason is required and is shown to everyone';
  end if;
  perform public.require_role(p_actor, array['HR','HrHead','Owner','CEO','Admin'], 'hold');

  foreach pid in array p_position_ids loop
    declare cur public.positions%rowtype;
    begin
      select * into cur from public.positions where id = pid for update;
      if not found then continue; end if;
      if cur.status = 'hold' then continue; end if;
      if cur.status in ('draft','hired','position_closed') then
        v_blocked := v_blocked || cur.position_number;
        continue;
      end if;

      update public.positions set
        status = 'hold',
        previous_status_before_hold = cur.status,
        hold_reason = p_reason,
        hold_start_date = p_start_date,
        hold_end_date_expected = p_expected_end
      where id = pid;

      insert into public.approval_tasks
        (entity_type, entity_id, position_id, task_type, assigned_role, requested_by, sla_hours, due_at)
      values ('position', pid, pid, 'hold_review', 'Owner', p_actor, 720,
              p_start_date + interval '30 days');
      perform public.cancel_tasks('position', array[pid], 'Position placed on hold');
      v_count := v_count + 1;
    end;
  end loop;

  perform public.write_audit(
    'position.hold', 'position', p_position_ids::text, p_actor, 'success', p_reason,
    null, jsonb_build_object('held', v_count, 'blocked', v_blocked),
    jsonb_build_object('expected_end', p_expected_end), null, null, null, null
  );

  return jsonb_build_object('held', v_count, 'not_holdable', v_blocked);
end;
$$;

-- resume restores exactly the stage recorded before the pause
create or replace function public.resume_position(
  p_position_id uuid, p_actor uuid, p_comment text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cur public.positions%rowtype;
begin
  perform public.assert_actor(p_actor);
  select * into cur from public.positions where id = p_position_id for update;
  if not found then raise exception 'not found: position %', p_position_id; end if;
  if cur.status <> 'hold' then
    raise exception 'conflict: % is not on hold', cur.position_number;
  end if;
  if cur.previous_status_before_hold is null then
    raise exception 'conflict: no prior stage recorded for this hold';
  end if;
  perform public.require_role(p_actor, array['HR','HrHead','Owner','CEO','Admin'], 'resume');

  update public.positions
     set status = cur.previous_status_before_hold,
         previous_status_before_hold = null,
         hold_reason = null,
         hold_start_date = null,
         hold_end_date_expected = null
   where id = p_position_id;

  update public.approval_tasks
     set status = 'cancelled', acted_at = now(), comment = coalesce(p_comment, 'Hold reviewed and resumed')
   where position_id = p_position_id and task_type = 'hold_review' and status = 'pending';

  perform public.write_audit(
    'position.resume', 'position', p_position_id::text, p_actor, 'success', p_comment,
    jsonb_build_object('status', 'hold'), jsonb_build_object('status', cur.previous_status_before_hold),
    jsonb_build_object('restored_from', cur.previous_status_before_hold),
    cur.request_id, p_position_id, null, cur.facility_id
  );

  return jsonb_build_object('id', p_position_id, 'status', cur.previous_status_before_hold);
end;
$$;
