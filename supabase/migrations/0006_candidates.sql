-- Yash Honda Vacancy & Hiring Tracker - candidate lifecycle
--
-- The candidate is a person; the position is the vacancy. These functions keep
-- the two from ever being confused, and make the DPDP document gate impossible
-- to bypass from any client.

-- ===========================================================================
-- add a candidate to a position
-- ===========================================================================
create or replace function public.add_candidate(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor   uuid := (p->>'actor')::uuid;
  v_pos     public.positions%rowtype;
  v_cid     uuid;
  v_notice  text := coalesce(p->>'notice_version','1.0-draft');
begin
  perform public.assert_actor(v_actor);
  perform public.require_role(v_actor, array['HR','HrHead'], 'add_candidate');

  select * into v_pos from public.positions where id = (p->>'position_id')::uuid for update;
  if not found then raise exception 'not found: position %', p->>'position_id'; end if;
  if v_pos.status in ('hired','position_closed','awaiting_vacancy_approval','draft','sent_for_candidate_approval') then
    raise exception 'conflict: % cannot take a new candidate while %', v_pos.position_number, v_pos.status;
  end if;
  if not public.can_view(v_pos.facility_id) and auth.uid() is not null then
    raise exception 'forbidden: that position belongs to a facility outside your scope'
      using errcode = '42501';
  end if;

  if length(coalesce(p->>'full_name','')) < 2 then
    raise exception 'validation: candidate name is required';
  end if;
  -- collection notice must have been accepted before any personal data lands
  if coalesce((p->>'notice_acknowledged')::boolean, false) is not true then
    raise exception 'validation: the collection notice must be acknowledged before a candidate is created';
  end if;
  -- data minimisation is enforced, not merely advised
  if coalesce(p->>'email','') ~* 'aadhaar|aadin|pan card|\bpan\b'
     or coalesce(p->>'current_location','') ~* 'aadhaar|pan'
     or coalesce(p->>'qualifications','') ~* '(aadhaar|pan number|bank account)' then
    raise exception 'validation: prohibited identifier detected - this portal must never hold Aadhaar, PAN or bank details';
  end if;

  insert into public.candidates (
    position_id, full_name, email, phone, current_location, expected_ctc, experience_text,
    qualifications, notice_period_days, source, status, created_by
  ) values (
    v_pos.id, p->>'full_name', nullif(trim(coalesce(p->>'email','')),''),
    nullif(trim(coalesce(p->>'phone','')),''), nullif(trim(coalesce(p->>'current_location','')),''),
    (p->>'expected_ctc')::numeric, p->>'experience_text', p->>'qualifications',
    (p->>'notice_period_days')::int, p->>'source', 'draft', v_actor
  ) returning id into v_cid;

  insert into public.candidate_notice_acks (candidate_id, notice_version, lawful_basis, acknowledged_by, ip)
  values (v_cid, v_notice,
          'Consent under DPDP Act 2023 section 6; legitimate use for employment',
          coalesce(p->>'acknowledged_by', v_actor::text) , (p->>'ip')::inet)
  on conflict (candidate_id, notice_version) do nothing;

  -- sourcing becomes "we have somebody", which is a real change of state
  if v_pos.status = 'sourcing' then
    update public.positions set status = 'candidate_available' where id = v_pos.id;
  end if;

  perform public.write_audit(
    'candidate.create', 'candidate', v_cid::text, v_actor, 'success', null, null,
    jsonb_build_object('full_name', p->>'full_name', 'status', 'draft'),
    jsonb_build_object('notice_version', v_notice, 'source', p->>'source'),
    v_pos.request_id, v_pos.id, v_cid, v_pos.facility_id
  );

  return jsonb_build_object('id', v_cid, 'position_status',
                            case when v_pos.status = 'sourcing' then 'candidate_available' else v_pos.status end);
end;
$$;

-- ===========================================================================
-- attach a document that is already in private storage
-- ===========================================================================
create or replace function public.record_candidate_document(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := (p->>'actor')::uuid;
  v_cand  public.candidates%rowtype;
  v_pos   public.positions%rowtype;
  v_type  public.document_type := (p->>'document_type')::public.document_type;
  v_did   uuid;
  v_existing uuid;
begin
  perform public.assert_actor(v_actor);
  perform public.require_role(v_actor, array['HR','HrHead','Admin'], 'upload_document');

  select * into v_cand from public.candidates where id = (p->>'candidate_id')::uuid for update;
  if not found then raise exception 'not found: candidate %', p->>'candidate_id'; end if;
  select * into v_pos from public.positions where id = v_cand.position_id;

  if v_cand.status not in ('draft','returned_for_modifications','hold') then
    raise exception 'conflict: documents may not be changed once the candidate is in the decision stage';
  end if;

  if coalesce((p->>'size_bytes')::bigint, 0) > 104857600 then
    raise exception 'validation: file exceeds the 100 MB ceiling';
  end if;
  if coalesce(p->>'mime_type','') !~* '^(application/pdf|image/jpeg|image/png|application/msword|application/vnd\.openxmlformats)' then
    raise exception 'validation: unsupported file type';
  end if;

  -- a replaced document keeps its history row: the old one is overwritten in
  -- storage but never erased from the record
  select id into v_existing from public.candidate_documents
   where candidate_id = v_cand.id and document_type = v_type;
  if v_existing is not null then
    update public.candidate_documents
       set file_path = p->>'file_path', file_name = p->>'file_name', mime_type = p->>'mime_type',
           file_size_bytes = (p->>'size_bytes')::bigint, uploaded_at = now(), uploaded_by = v_actor,
           verification_status = 'Not Verified', is_exception = false, exception_reason = null
     where id = v_existing
     returning id into v_did;
  else
    insert into public.candidate_documents
      (candidate_id, document_type, file_path, file_name, mime_type, file_size_bytes,
       uploaded_by, is_mandatory)
    values (v_cand.id, v_type, p->>'file_path', p->>'file_name', p->>'mime_type',
            (p->>'size_bytes')::bigint, v_actor,
            v_type in ('Resume','Photograph'))
    returning id into v_did;
  end if;

  perform public.write_audit(
    'document.upload', 'candidate_document', v_did::text, v_actor, 'success', null, null,
    jsonb_build_object('document_type', v_type, 'file_name', p->>'file_name'),
    jsonb_build_object('size_bytes', (p->>'size_bytes')::bigint, 'replaced', v_existing is not null),
    v_pos.request_id, v_pos.id, v_cand.id, v_pos.facility_id
  );

  return jsonb_build_object('id', v_did, 'document_type', v_type);
end;
$$;

-- ===========================================================================
-- the DPDP gate: send a candidate for approval
-- ===========================================================================
create or replace function public.submit_candidate(
  p_candidate_id uuid,
  p_actor uuid,
  p_exception jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cand public.candidates%rowtype;
  v_pos  public.positions%rowtype;
  v_missing text;
begin
  perform public.assert_actor(p_actor);
  perform public.require_role(p_actor, array['HR','HrHead'], 'submit_candidate');

  select * into v_cand from public.candidates where id = p_candidate_id for update;
  if not found then raise exception 'not found: candidate %', p_candidate_id; end if;
  select * into v_pos from public.positions where id = v_cand.position_id for update;

  if v_cand.status not in ('draft','returned_for_modifications') then
    raise exception 'conflict: candidate is already %', v_cand.status;
  end if;
  if v_pos.status = 'hold' then
    raise exception 'conflict: the position is on hold; resume it before sending a candidate';
  end if;

  if length(trim(coalesce(v_cand.full_name,''))) < 2 then
    raise exception 'validation: candidate name is required';
  end if;

  -- mandatory documents, exactly as configured on the step
  select string_agg(d.t, ', ') into v_missing
  from unnest(array['Resume','Photograph']::public.document_type[]) as d(t)
  where not exists (
    select 1 from public.candidate_documents x
    where x.candidate_id = p_candidate_id and x.document_type = d.t
  );

  if v_missing is not null then
    if p_exception is null
       or length(coalesce(p_exception->>'reason','')) < 10
       or length(coalesce(p_exception->>'authority_basis','')) < 3 then
      perform public.write_audit(
        'candidate.submit', 'candidate', p_candidate_id::text, p_actor, 'validation_error',
        'missing: ' || v_missing, null, null,
        jsonb_build_object('missing_documents', v_missing),
        v_pos.request_id, v_pos.id, p_candidate_id, v_pos.facility_id);
      raise exception 'missing_documents: cannot send for approval without %', v_missing;
    end if;
    -- a recorded exception satisfies the gate but is itself an audited deviation
    insert into public.candidate_documents
      (candidate_id, document_type, file_path, file_name, mime_type, file_size_bytes,
       uploaded_by, is_mandatory, is_exception, exception_reason, exception_authorized_by)
    select p_candidate_id, d.t, 'exception://not-provided', 'exception', 'application/x-none', 1,
           p_actor, true, true, p_exception->>'reason', (p_exception->>'authorized_by')::uuid
    from unnest(string_to_array(v_missing, ', ')) as d(t);

    perform public.write_audit(
      'document.exception', 'candidate', p_candidate_id::text, p_actor, 'success',
      p_exception->>'reason', null, jsonb_build_object('documents', v_missing),
      jsonb_build_object('authority_basis', p_exception->>'authority_basis'),
      v_pos.request_id, v_pos.id, p_candidate_id, v_pos.facility_id);
  end if;

  update public.candidates
     set status = 'submitted_for_recruitment_approval',
         submitted_for_approval_at = now()
   where id = p_candidate_id;

  if v_pos.status = 'candidate_available' then
    update public.positions set status = 'sent_for_candidate_approval' where id = v_pos.id;
  end if;

  insert into public.approval_tasks
    (entity_type, entity_id, position_id, task_type, assigned_role, requested_by,
     priority, sla_hours, due_at)
  values ('candidate', p_candidate_id, v_pos.id, 'candidate_approval', 'Owner', p_actor,
          'normal', 72, now() + interval '72 hours');

  insert into public.notification_outbox
    (recipient_id, entity_type, entity_id, title, body, link, severity)
  select u.id, 'candidate', p_candidate_id,
         format('Candidate decision pending: %s', v_cand.full_name),
         format('For %s at %s', v_pos.label,
                (select name from public.facilities where id = v_pos.facility_id)),
         '/requests/' || v_pos.request_id, 'info'
  from public.users u where u.role in ('Owner','CEO') and u.is_active;

  perform public.write_audit(
    'candidate.submit', 'candidate', p_candidate_id::text, p_actor, 'success', null,
    jsonb_build_object('status', v_cand.status),
    jsonb_build_object('status', 'submitted_for_recruitment_approval'),
    jsonb_build_object('exception_attached', p_exception is not null),
    v_pos.request_id, v_pos.id, p_candidate_id, v_pos.facility_id);

  return jsonb_build_object('id', p_candidate_id, 'status', 'submitted_for_recruitment_approval');
end;
$$;

-- ===========================================================================
-- the decision on a person
-- ===========================================================================
create or replace function public.decide_candidate(
  p_candidate_id uuid,
  p_actor uuid,
  p_action text,
  p_reason text default null,
  p_comment text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cand public.candidates%rowtype;
  v_pos  public.positions%rowtype;
  t public.workflow_transitions%rowtype;
  v_to public.candidate_status;
  v_pos_to public.position_status;
  v_peers int;
begin
  perform public.assert_actor(p_actor);

  select * into v_cand from public.candidates where id = p_candidate_id for update;
  if not found then raise exception 'not found: candidate %', p_candidate_id; end if;
  select * into v_pos from public.positions where id = v_cand.position_id for update;

  select * into t from public.configured_transition('candidate_default', v_cand.status::text, p_action);
  if not found then
    perform public.write_audit('candidate.'||p_action, 'candidate', p_candidate_id::text, p_actor,
                               'conflict', p_reason, jsonb_build_object('status', v_cand.status), null,
                               jsonb_build_object('action', p_action), v_pos.request_id, v_pos.id,
                               p_candidate_id, v_pos.facility_id);
    raise exception 'invalid transition: candidate % cannot be % from %', v_cand.full_name, p_action, v_cand.status;
  end if;

  perform public.require_role(p_actor, t.allowed_roles, p_action);

  -- self-approval is blocked for every role including Owner and CEO
  if exists (
    select 1 from public.approval_tasks k
    where k.entity_type = 'candidate' and k.entity_id = p_candidate_id
      and k.requested_by = p_actor and k.status = 'pending'
  ) and p_action in ('approve_for_joining','reject','return_for_modifications') then
    perform public.write_audit('candidate.'||p_action, 'candidate', p_candidate_id::text, p_actor,
                               'denied', 'self-approval attempt', null, null, null,
                               v_pos.request_id, v_pos.id, p_candidate_id, v_pos.facility_id);
    raise exception 'forbidden: you submitted this candidate and cannot decide them'
      using errcode = '42501';
  end if;

  if t.requires_reason and length(coalesce(trim(p_reason),'')) < 3 then
    raise exception 'validation: a reason is required when a candidate is %', p_action;
  end if;
  if t.requires_comment and length(coalesce(trim(p_comment),'')) < 3 then
    raise exception 'validation: a comment is required for %', p_action;
  end if;

  v_to := t.to_status::public.candidate_status;

  update public.candidates
     set status = v_to,
         rejection_reason = case when v_to in ('rejected','candidature_unsuccessful')
                                then coalesce(p_reason, p_comment, rejection_reason)
                                else rejection_reason end,
         decision_at = now(),
         approved_for_joining_at = case when v_to = 'approved_for_joining' then now()
                                        else approved_for_joining_at end
   where id = p_candidate_id;

  -- what the decision does to the vacancy
  select count(*) into v_peers from public.candidates
   where position_id = v_pos.id and status not in ('rejected','candidature_unsuccessful','hired');

  v_pos_to := case
    when v_to = 'approved_for_joining' then 'approved_for_joining'::public.position_status
    when v_to in ('rejected','candidature_unsuccessful') and v_peers > 0 then 'sourcing'::public.position_status
    when v_to in ('rejected','candidature_unsuccessful') then 'candidature_unsuccessful'::public.position_status
    when v_to = 'returned_for_modifications' then 'candidate_available'::public.position_status
    else null
  end;

  if v_pos_to is not null then
    update public.positions set status = v_pos_to where id = v_pos.id;
  end if;

  if v_to in ('rejected','candidature_unsuccessful','approved_for_joining','returned_for_modifications') then
    perform public.settle_task('candidate', p_candidate_id, p_actor, p_action, p_comment);
  end if;

  -- an unsuccessful person's data now has an expiry date
  if v_to in ('rejected','candidature_unsuccessful') then
    perform public.enqueue_retention('candidate', p_candidate_id, 'candidate_unsuccessful', p_actor);
  end if;

  insert into public.notification_outbox
    (recipient_id, entity_type, entity_id, title, body, link, severity)
  select v_cand.created_by, 'candidate', p_candidate_id,
         format('%s: %s', case v_to
           when 'approved_for_joining' then 'Approved for joining'
           when 'rejected' then 'Rejected'
           when 'candidature_unsuccessful' then 'Candidature unsuccessful'
           when 'returned_for_modifications' then 'Returned for modification'
           else v_to::text end, v_cand.full_name),
         coalesce(p_reason, p_comment, 'Decision recorded by ' || public.actor_role_for(p_actor)),
         '/requests/' || v_pos.request_id,
         case when v_to in ('rejected','candidature_unsuccessful','returned_for_modifications')
              then 'warn' else 'info' end
  where v_cand.created_by is not null;

  perform public.write_audit(
    'candidate.' || p_action, 'candidate', p_candidate_id::text, p_actor, 'success', p_reason,
    jsonb_build_object('status', v_cand.status), jsonb_build_object('status', v_to),
    jsonb_build_object('comment', p_comment, 'position_status', v_pos_to),
    v_pos.request_id, v_pos.id, p_candidate_id, v_pos.facility_id);

  return jsonb_build_object('candidate_id', p_candidate_id, 'status', v_to, 'position_status', v_pos_to);
end;
$$;

-- ===========================================================================
-- hired means the person actually joined
-- ===========================================================================
create or replace function public.confirm_joining(
  p_candidate_id uuid,
  p_actor uuid,
  p_joining_date date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cand public.candidates%rowtype;
  v_pos  public.positions%rowtype;
  v_peers uuid[];
  v_peer  uuid;
begin
  perform public.assert_actor(p_actor);
  perform public.require_role(p_actor, array['HR','HrHead'], 'confirm_joining');

  select * into v_cand from public.candidates where id = p_candidate_id for update;
  if not found then raise exception 'not found: candidate %', p_candidate_id; end if;
  select * into v_pos from public.positions where id = v_cand.position_id for update;

  if v_cand.status <> 'approved_for_joining' then
    raise exception 'conflict: only an approved candidate can be marked as joined (status %)', v_cand.status;
  end if;
  if p_joining_date is null then
    raise exception 'validation: the actual joining date is required - approval is not joining';
  end if;
  if p_joining_date > (current_date + 1) then
    raise exception 'validation: a future joining date belongs to approved_for_joining, not hired';
  end if;

  update public.candidates
     set status = 'hired', actual_joining_date = p_joining_date, decision_at = now()
   where id = p_candidate_id;

  update public.positions set status = 'hired', hired_at = now() where id = v_pos.id;

  -- the people who were not chosen are now closed out, and their clock starts
  select coalesce(array_agg(id), '{}'::uuid[]) into v_peers from public.candidates
   where position_id = v_pos.id and id <> p_candidate_id
     and status not in ('hired','rejected','candidature_unsuccessful');

  update public.candidates
     set status = 'candidature_unsuccessful',
         rejection_reason = coalesce(rejection_reason, 'Another candidate joined this position')
   where id = any (v_peers);

  foreach v_peer in array v_peers loop
    perform public.enqueue_retention('candidate', v_peer, 'candidate_unsuccessful', p_actor);
  end loop;

  -- the position itself no longer needs approving or sourcing
  perform public.cancel_tasks('position', array[v_pos.id], 'Position filled');
  update public.approval_tasks set status = 'cancelled', acted_at = now(),
         comment = 'Candidate joined'
   where entity_type = 'candidate' and entity_id = p_candidate_id and status = 'pending';

  -- the notification that the vacancy is filled goes to whoever raised it
  insert into public.notification_outbox
    (recipient_id, entity_type, entity_id, title, body, link, severity)
  select r.created_by, 'position', v_pos.id,
         format('%s filled - %s joins %s', v_pos.position_number, v_cand.full_name,
                to_char(p_joining_date, 'DD Mon YYYY')),
         'The vacancy is closed and the position is hired.', '/requests/' || v_pos.request_id, 'info'
  from public.vacancy_requests r where r.id = v_pos.request_id and r.created_by is not null;

  perform public.write_audit(
    'candidate.confirm_joining', 'candidate', p_candidate_id::text, p_actor, 'success', null,
    jsonb_build_object('status', v_cand.status),
    jsonb_build_object('status', 'hired', 'actual_joining_date', p_joining_date),
    jsonb_build_object('peers_closed', array_length(v_peers, 1)),
    v_pos.request_id, v_pos.id, p_candidate_id, v_pos.facility_id);

  return jsonb_build_object('candidate_id', p_candidate_id, 'position_id', v_pos.id,
                            'status', 'hired', 'peers_closed', array_length(v_peers, 1));
end;
$$;

-- ===========================================================================
-- opening a resume or photograph is an auditable act, not a free read
-- ===========================================================================
create or replace function public.record_document_access(
  p_document_id uuid, p_actor uuid, p_action text, p_ip text default null, p_user_agent text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_doc public.candidate_documents%rowtype;
  v_cand public.candidates%rowtype;
  v_pos  public.positions%rowtype;
begin
  perform public.assert_actor(p_actor);

  select * into v_doc from public.candidate_documents where id = p_document_id;
  if not found then raise exception 'not found: document %', p_document_id; end if;
  select * into v_cand from public.candidates where id = v_doc.candidate_id;
  select * into v_pos from public.positions where id = v_cand.position_id;

  -- Finance has no path to candidate documents, structurally
  if public.actor_role_for(p_actor) = 'Finance' then
    perform public.write_audit('document.open', 'candidate_document', p_document_id::text, p_actor,
                               'denied', 'role has no document access', null, null,
                               jsonb_build_object('document_type', v_doc.document_type),
                               v_pos.request_id, v_pos.id, v_cand.id, v_pos.facility_id);
    insert into public.security_incidents
      (incident_type, severity, actor_user_id, target_entity_type, target_entity_id, detail)
    values ('unauthorized_access_attempt', 'high', p_actor, 'candidate_document', p_document_id,
            'Finance attempted to open a candidate document');
    raise exception 'forbidden: this role cannot open candidate documents' using errcode = '42501';
  end if;
  if not public.can_view(v_pos.facility_id) then
    perform public.write_audit('document.open', 'candidate_document', p_document_id::text, p_actor,
                               'denied', 'facility outside scope', null, null, null,
                               v_pos.request_id, v_pos.id, v_cand.id, v_pos.facility_id);
    raise exception 'forbidden: out of facility scope' using errcode = '42501';
  end if;

  insert into public.document_access_logs
    (document_id, actor_id, action, ip, user_agent)
  values (p_document_id, p_actor, p_action, p_ip::inet, p_user_agent);

  perform public.write_audit(
    case when p_action = 'download' then 'document.download' else 'document.open' end,
    'candidate_document', p_document_id::text, p_actor, 'success', null, null, null,
    jsonb_build_object('document_type', v_doc.document_type,
                       'ttl_seconds', coalesce(current_setting('app.doc_ttl', true)::int, 60)),
    v_pos.request_id, v_pos.id, v_cand.id, v_pos.facility_id);

  return jsonb_build_object('logged', true, 'candidate_id', v_cand.id);
end;
$$;

-- ===========================================================================
-- verify a document (HR head function)
-- ===========================================================================
create or replace function public.verify_document(
  p_document_id uuid, p_actor uuid, p_result text, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_doc public.candidate_documents%rowtype;
begin
  perform public.assert_actor(p_actor);
  perform public.require_role(p_actor, array['HrHead','HR'], 'verify_document');
  select * into v_doc from public.candidate_documents where id = p_document_id for update;
  if not found then raise exception 'not found: document %', p_document_id; end if;
  if p_result not in ('Verified','Rejected','Under Review') then
    raise exception 'validation: unknown verification result';
  end if;
  update public.candidate_documents
     set verification_status = p_result::public.verification_status,
         verified_by = p_actor, verified_at = now()
   where id = p_document_id;
  perform public.write_audit('document.verify', 'candidate_document', p_document_id::text, p_actor,
                             'success', p_note, jsonb_build_object('status', v_doc.verification_status),
                             jsonb_build_object('status', p_result), null,
                             null, null, v_doc.candidate_id, null);
  return jsonb_build_object('id', p_document_id, 'verification_status', p_result);
end;
$$;

-- ===========================================================================
-- notifications
-- ===========================================================================
create or replace function public.mark_notifications_read(p_ids uuid[], p_actor uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  perform public.assert_actor(p_actor);
  with marked as (
    update public.notification_outbox set read_at = now()
     where id = any (p_ids) and recipient_id = p_actor and read_at is null
    returning 1
  ) select count(*) into v from marked;
  return v;
end;
$$;
