-- Yash Honda Vacancy & Hiring Tracker - admin, legal and privacy operations
--
-- Everything in this file is an accountability surface: the actions here are
-- the ones a regulator would ask about, so each one writes an audit row and,
-- where the rule could be circumvented by configuration, refuses outright.

-- ===========================================================================
-- retention
-- ===========================================================================
create or replace function public.enqueue_retention(
  p_entity_type text, p_entity_id uuid, p_category text, p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_policy public.retention_policies%rowtype;
  v_days int;
begin
  select * into v_policy from public.retention_policies
   where data_category = p_category and is_active limit 1;
  if not found then
    -- no silent indefinite retention: if nothing is configured, say so loudly
    raise exception 'retention: no active policy for category %', p_category;
  end if;
  v_days := v_policy.retention_days;

  insert into public.retention_items (policy_id, entity_type, entity_id, finalized_at, due_at)
  values (v_policy.id, p_entity_type, p_entity_id, now(), now() + (v_days || ' days')::interval)
  on conflict (entity_type, entity_id) do update
    set due_at = greatest(public.retention_items.due_at, excluded.due_at);

  insert into public.deletion_queue (retention_item_id, entity_type, entity_id, reason, requested_by)
  select ri.id, ri.entity_type, ri.entity_id,
         format('auto purge after %s days under %s', v_days, v_policy.data_category), p_actor
  from public.retention_items ri
  where ri.entity_type = p_entity_type and ri.entity_id = p_entity_id
    and not exists (select 1 from public.deletion_queue q where q.retention_item_id = ri.id
                                               and q.completed_at is null);

  return jsonb_build_object('due_in_days', v_days);
end;
$$;

-- Called by the scheduled worker with the service-role key (no interactive
-- session). Deletes the personal data, keeps the audit trail.
create or replace function public.purge_due_retention(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_paths jsonb := '[]'::jsonb;
  v_done int := 0;
  v_batch text := to_char(now(), 'YYYYMMDDHH24MISS');
begin
  -- no session, or Admin with a session
  if auth.uid() is not null and public.actor_role_for(auth.uid()) <> 'Admin' then
    raise exception 'forbidden: only the retention worker or Admin may purge' using errcode = '42501';
  end if;

  for v_row in
    select ri.id, ri.entity_type, ri.entity_id
    from public.retention_items ri
    where ri.deleted_at is null and ri.due_at <= now()
    order by ri.due_at
    limit p_limit
    for update skip locked
  loop
    -- a legal hold outranks the clock
    if exists (select 1 from public.dsr_requests d
               where d.status in ('open','in_progress')
                 and d.subject_email = coalesce(
                   (select email from public.candidates c where c.id = v_row.entity_id), '')) then
      update public.deletion_queue
         set completed_at = now(), outcome = 'blocked_legal_hold',
             detail = 'An open data-subject request covers this record'
       where retention_item_id = v_row.id and completed_at is null;
      continue;
    end if;

    if v_row.entity_type = 'candidate' then
      select jsonb_agg(jsonb_build_object('bucket', 'candidate-documents', 'path', d.file_path))
        into v_paths
        from public.candidate_documents d where d.candidate_id = v_row.entity_id;

      delete from public.candidate_documents where candidate_id = v_row.entity_id;
      delete from public.candidate_notice_acks where candidate_id = v_row.entity_id;
      delete from public.comments where entity_type = 'candidate' and entity_id = v_row.entity_id;
      delete from public.notification_outbox where entity_type = 'candidate' and entity_id = v_row.entity_id;
      delete from public.approval_tasks where entity_type = 'candidate' and entity_id = v_row.entity_id;
      delete from public.candidates where id = v_row.entity_id;
    elsif v_row.entity_type = 'vacancy_request' then
      delete from public.vacancy_requests where id = v_row.entity_id;
    end if;

    update public.retention_items
       set deleted_at = now(), purge_batch = v_batch
     where id = v_row.id;

    update public.deletion_queue
       set completed_at = now(),
           outcome = case when coalesce(jsonb_array_length(v_paths), 0) > 0
                          then 'anonymised' else 'deleted' end,
           detail = jsonb_build_object('storage_paths', v_paths, 'batch', v_batch)::text
     where retention_item_id = v_row.id and completed_at is null;

    -- the fact of deletion is retained even though the data is not
    insert into public.audit_events
      (actor_id, actor_role, action, entity_type, entity_id, result, reason, metadata)
    values (auth.uid(), public.actor_role_for(auth.uid()), 'retention.purge',
            v_row.entity_type, v_row.entity_id::text, 'success',
            'Scheduled deletion after retention period',
            jsonb_build_object('batch', v_batch, 'storage_cleanup_required', v_paths));

    v_done := v_done + 1;
  end loop;

  return jsonb_build_object('purged', v_done, 'batch', v_batch);
end;
$$;

create or replace function public.configure_retention(
  p_policy_id uuid, p_actor uuid, p_retention_days integer, p_basis text, p_purpose text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old public.retention_policies%rowtype;
begin
  perform public.assert_actor(p_actor);
  if public.actor_role_for(p_actor) <> 'Admin' then
    perform public.write_audit('retention.configure', 'retention_policy', p_policy_id::text, p_actor,
                               'denied', 'non-admin attempt', null, null, null);
    raise exception 'forbidden: only Admin may change retention' using errcode = '42501';
  end if;
  -- privacy invariants the Admin cannot configure away
  if p_retention_days is null or p_retention_days < 1 or p_retention_days > 2555 then
    raise exception 'validation: retention must be between 1 day and 7 years';
  end if;
  if not exists (select 1 from public.retention_policies where id = p_policy_id) then
    raise exception 'not found: retention policy %', p_policy_id;
  end if;

  select * into v_old from public.retention_policies where id = p_policy_id for update;

  update public.retention_policies
     set retention_days = p_retention_days,
         legal_basis = coalesce(p_basis, legal_basis),
         purpose = coalesce(p_purpose, purpose),
         version = (coalesce(nullif(split_part(version,'.',1),''),'1')::int + 1)::text,
         approved_by = p_actor, approved_at = now()
   where id = p_policy_id;

  -- items already scheduled keep their original clock; changing the policy is
  -- not retroactive, which is what the audit log needs to show
  perform public.write_audit('retention.configure', 'retention_policy', p_policy_id::text, p_actor,
                             'success', p_purpose,
                             jsonb_build_object('retention_days', v_old.retention_days,
                                                'version', v_old.version),
                             jsonb_build_object('retention_days', p_retention_days,
                                                'basis', p_basis));
  return jsonb_build_object('id', p_policy_id, 'retention_days', p_retention_days);
end;
$$;

-- ===========================================================================
-- legal documents: draft, publish, acknowledge
-- ===========================================================================
create or replace function public.publish_legal_document(
  p_document_id uuid, p_actor uuid, p_effective_from date default current_date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_doc public.legal_documents%rowtype;
begin
  perform public.assert_actor(p_actor);
  if public.actor_role_for(p_actor) <> 'Admin' then
    perform public.write_audit('legal.publish', 'legal_document', p_document_id::text, p_actor,
                               'denied', 'non-admin publish attempt');
    raise exception 'forbidden: only Admin may publish legal documents' using errcode = '42501';
  end if;

  select * into v_doc from public.legal_documents where id = p_document_id for update;
  if not found then raise exception 'not found: legal document %', p_document_id; end if;
  if v_doc.status = 'published' then
    raise exception 'conflict: % version % is already published; draft a new version instead',
      v_doc.title, v_doc.version;
  end if;
  if length(trim(v_doc.body_md)) < 40 then
    raise exception 'validation: the document body is too short to be a real notice';
  end if;
  if p_effective_from is null then
    raise exception 'validation: an effective date is required';
  end if;

  -- exactly one published version per key
  update public.legal_documents
     set status = 'superseded'
   where key = v_doc.key and status = 'published' and id <> p_document_id;

  update public.legal_documents
     set status = 'published', published_at = now(), published_by = p_actor,
         effective_from = p_effective_from, superseded_by = null
   where id = p_document_id;

  perform public.write_audit('legal.publish', 'legal_document', p_document_id::text, p_actor,
                             'success', null,
                             jsonb_build_object('status', v_doc.status),
                             jsonb_build_object('status', 'published', 'version', v_doc.version,
                                                'effective_from', p_effective_from));
  return jsonb_build_object('id', p_document_id, 'version', v_doc.version, 'published', true);
end;
$$;

create or replace function public.save_legal_document(p jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.assert_actor(p_actor);
  if public.actor_role_for(p_actor) <> 'Admin' then
    raise exception 'forbidden: only Admin may author legal documents' using errcode = '42501';
  end if;
  if length(coalesce(p->>'body_md','')) < 40 then
    raise exception 'validation: content is too short to publish';
  end if;

  insert into public.legal_documents (key, title, version, body_md, status)
  values (p->>'key', p->>'title', p->>'version', p->>'body_md', 'draft')
  on conflict (key, version) do update
    set title = excluded.title, body_md = excluded.body_md, updated_at = now()
  returning id into v_id;

  perform public.write_audit('legal.save_draft', 'legal_document', v_id::text, p_actor, 'success',
                             null, null, jsonb_build_object('key', p->>'key', 'version', p->>'version'));
  return jsonb_build_object('id', v_id, 'status', 'draft');
end;
$$;

-- Acknowledgement is consent evidence, so it is stored as its own record.
create or replace function public.acknowledge_legal_document(
  p_document_id uuid, p_actor uuid, p_ip text default null, p_user_agent text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_doc public.legal_documents%rowtype;
begin
  perform public.assert_actor(p_actor);
  select * into v_doc from public.legal_documents where id = p_document_id;
  if not found then raise exception 'not found: legal document %', p_document_id; end if;
  if v_doc.status <> 'published' then
    raise exception 'conflict: that document version is not published; users cannot be asked to accept a draft';
  end if;

  insert into public.legal_document_acks (legal_document_id, user_id, ip, user_agent)
  values (p_document_id, p_actor, p_ip::inet, p_user_agent)
  on conflict (legal_document_id, user_id) do nothing;

  insert into public.privacy_consent_records
    (subject_user_id, subject_email, subject_category, purpose, notice_version, status,
     granted_at, ip, user_agent)
  select p_actor, u.email, 'Portal User',
         format('Acceptance of %s', v_doc.title), v_doc.version, 'accepted', now(),
         p_ip::inet, p_user_agent
  from public.users u where u.id = p_actor
  on conflict do nothing;

  update public.users set updated_at = now() where id = p_actor;

  perform public.write_audit('legal.acknowledge', 'legal_document', p_document_id::text, p_actor,
                             'success', null, null, jsonb_build_object('version', v_doc.version));
  return jsonb_build_object('acknowledged', true, 'version', v_doc.version);
end;
$$;

-- ===========================================================================
-- users and roles
-- ===========================================================================
create or replace function public.admin_create_user(p jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_auth_id uuid;
  v_email text := lower(trim(coalesce(p->>'email','')));
  v_role public.user_role := (p->>'role')::public.user_role;
begin
  perform public.assert_actor(p_actor);
  if public.actor_role_for(p_actor) <> 'Admin' then
    raise exception 'forbidden: only Admin may create accounts' using errcode = '42501';
  end if;
  if v_email = '' or v_email !~ '@' then raise exception 'validation: a valid email is required'; end if;
  if v_role is null then raise exception 'validation: a role is required'; end if;
  if exists (select 1 from public.users where email = v_email) then
    raise exception 'conflict: that email already has an account';
  end if;

  -- v1 creates a confirmed account and the Admin sends the invite link out of
  -- band; no outbound email is sent by this application
  insert into auth.users (instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
          encode(gen_random_bytes(32), 'hex'), now(),
          jsonb_build_object('provider','email','providers',array['email']),
          jsonb_build_object('full_name', p->>'full_name'), now(), now(), '', '')
  returning id into v_auth_id;

  insert into public.users (id, email, full_name, role, primary_facility_id, department, designation, created_by)
  values (v_auth_id, v_email, coalesce(p->>'full_name', split_part(v_email,'@',1)), v_role,
          (p->>'primary_facility_id')::uuid, p->>'department', p->>'designation', p_actor);

  if (p->>'facility_ids') is not null then
    insert into public.user_facilities (user_id, facility_id)
    select v_auth_id, f from jsonb_array_elements_text(p->'facility_ids') as f(uuid)
    on conflict do nothing;
  end if;

  perform public.write_audit('user.create', 'user', v_auth_id::text, p_actor, 'success', null,
                             null, jsonb_build_object('email', v_email, 'role', v_role));
  return jsonb_build_object('id', v_auth_id, 'email', v_email, 'role', v_role);
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_actor uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_target public.users%rowtype;
begin
  perform public.assert_actor(p_actor);
  if public.actor_role_for(p_actor) <> 'Admin' then
    perform public.write_audit('user.grant_role', 'user', p_user_id::text, p_actor, 'denied',
                               'non-admin role change');
    raise exception 'forbidden: only Admin may change roles' using errcode = '42501';
  end if;
  -- the locked invariant: no one grants a role to their own account
  if p_user_id = p_actor then
    perform public.write_audit('user.grant_role', 'user', p_user_id::text, p_actor, 'denied',
                               'self-grant attempt');
    raise exception 'forbidden: roles must be granted by a different administrator' using errcode = '42501';
  end if;

  select * into v_target from public.users where id = p_user_id for update;
  if not found then raise exception 'not found: user %', p_user_id; end if;

  -- never strand the portal without an Admin or without an approver
  if v_target.role = 'Admin' and p_role <> 'Admin'
     and (select count(*) from public.users where role = 'Admin' and is_active) <= 1 then
    raise exception 'conflict: this is the last active Admin account';
  end if;
  if v_target.role in ('Owner','CEO') and p_role not in ('Owner','CEO')
     and (select count(*) from public.users where role in ('Owner','CEO') and is_active) <= 1 then
    raise exception 'conflict: this is the only approver account; approvals would stop';
  end if;

  update public.users set role = p_role::public.user_role where id = p_user_id;

  perform public.write_audit('user.change_role', 'user', p_user_id::text, p_actor, 'success', null,
                             jsonb_build_object('role', v_target.role), jsonb_build_object('role', p_role));
  return jsonb_build_object('id', p_user_id, 'role', p_role);
end;
$$;

create or replace function public.admin_set_user_active(p_user_id uuid, p_actor uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_target public.users%rowtype;
begin
  perform public.assert_actor(p_actor);
  if public.actor_role_for(p_actor) <> 'Admin' then
    raise exception 'forbidden: only Admin may disable accounts' using errcode = '42501';
  end if;
  if not p_active and p_user_id = p_actor then
    raise exception 'validation: you cannot disable your own account';
  end if;
  select * into v_target from public.users where id = p_user_id for update;
  if not found then raise exception 'not found: user %', p_user_id; end if;
  if not p_active and v_target.role = 'Admin'
     and (select count(*) from public.users where role = 'Admin' and is_active) <= 1 then
    raise exception 'conflict: this is the last active Admin account';
  end if;

  update public.users set is_active = p_active where id = p_user_id;
  perform public.write_audit(
    case when p_active then 'user.enable' else 'user.disable' end,
    'user', p_user_id::text, p_actor, 'success', null,
    jsonb_build_object('is_active', v_target.is_active), jsonb_build_object('is_active', p_active));
  return jsonb_build_object('id', p_user_id, 'is_active', p_active);
end;
$$;

-- ===========================================================================
-- audited deviation from approved position terms
-- ===========================================================================
create or replace function public.adjust_position_terms(
  p_position_id uuid, p_actor uuid, p_field text, p_new_value text,
  p_reason text, p_authority_basis text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pos public.positions%rowtype;
  v_old text;
begin
  perform public.assert_actor(p_actor);
  perform public.require_role(p_actor, array['Owner','CEO','HrHead','Admin'], 'adjust_position_terms');
  if length(coalesce(trim(p_reason),'')) < 5 then
    raise exception 'validation: a reason is required and is permanently attached to this change';
  end if;
  if length(coalesce(trim(p_authority_basis),'')) < 3 then
    raise exception 'validation: state whose authority the change rests on';
  end if;
  if p_field not in ('ctc_min','ctc_max','target_fill_date','quantity','joining_date','justification') then
    raise exception 'validation: % is not an adjustable field', p_field;
  end if;

  select * into v_pos from public.positions where id = p_position_id for update;
  if not found then raise exception 'not found: position %', p_position_id; end if;
  v_old := to_jsonb(v_pos) ->> p_field;

  insert into public.position_adjustments
    (position_id, field, old_value, new_value, reason, authority_basis, adjusted_by)
  values (p_position_id, p_field, v_old, p_new_value, p_reason, p_authority_basis, p_actor);

  if p_field = 'target_fill_date' then
    update public.positions set target_fill_date = p_new_value::date where id = p_position_id;
  elsif p_field = 'ctc_min' then
    update public.positions set ctc_min = p_new_value::numeric where id = p_position_id;
  elsif p_field = 'ctc_max' then
    update public.positions set ctc_max = p_new_value::numeric where id = p_position_id;
  end if;

  perform public.write_audit('position.adjust', 'position', p_position_id::text, p_actor, 'success',
                             p_reason, jsonb_build_object(p_field, v_old),
                             jsonb_build_object(p_field, p_new_value),
                             jsonb_build_object('authority_basis', p_authority_basis),
                             v_pos.request_id, p_position_id, null, v_pos.facility_id);
  return jsonb_build_object('position_id', p_position_id, 'field', p_field,
                            'old', v_old, 'new', p_new_value);
end;
$$;

-- ===========================================================================
-- data-subject requests
-- ===========================================================================
create or replace function public.record_dsr(p jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_ref text;
  v_type text := p->>'request_type';
begin
  if p_actor is not null then perform public.assert_actor(p_actor); end if;
  if v_type not in ('access','correction','erasure','withdraw_consent','grievance','nominee') then
    raise exception 'validation: unknown request type';
  end if;
  if length(coalesce(p->>'subject_email','')) < 5 then
    raise exception 'validation: the subject must be identifiable by email';
  end if;

  v_ref := format('DSR-%s-%s', to_char(now(),'YYMM'),
                  lpad((select count(*) + 1 from public.dsr_requests)::text, 3, '0'));

  insert into public.dsr_requests
    (reference, subject_email, subject_name, subject_category, request_type, detail,
     statutory_due_at, handler_id, status)
  values (v_ref, lower(trim(p->>'subject_email')), p->>'subject_name',
          coalesce(p->>'subject_category','Candidate')::public.data_subject_category,
          v_type, p->'detail',
          -- DPDP Rules: respond within the notified period; 30 days as the
          -- internal working deadline
          now() + interval '30 days', p_actor, 'open')
  returning id into v_id;

  if v_type = 'withdraw_consent' then
    insert into public.privacy_consent_records
      (subject_email, subject_category, purpose, notice_version, status, granted_at, withdrawn_at)
    select lower(trim(p->>'subject_email')),
           coalesce(p->>'subject_category','Candidate')::public.data_subject_category,
           coalesce(p->>'purpose','Processing for hiring'), 'withdrawn', 'declined',
           granted_at, now()
    from public.privacy_consent_records c
    where c.subject_email = lower(trim(p->>'subject_email')) and c.status = 'accepted'
      and c.withdrawn_at is null;
  end if;

  perform public.write_audit('dsr.record', 'dsr', v_id::text, p_actor, 'success', p->>'detail',
                             null, jsonb_build_object('reference', v_ref, 'type', v_type));
  return jsonb_build_object('id', v_id, 'reference', v_ref, 'due_in_days', 30);
end;
$$;

create or replace function public.fulfil_dsr(
  p_dsr_id uuid, p_actor uuid, p_outcome text, p_summary text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.dsr_requests%rowtype;
        v_row record;
begin
  perform public.assert_actor(p_actor);
  if public.actor_role_for(p_actor) not in ('Admin','HrHead') then
    raise exception 'forbidden: only Admin or HR head may fulfil a data-subject request'
      using errcode = '42501';
  end if;
  select * into v from public.dsr_requests where id = p_dsr_id for update;
  if not found then raise exception 'not found: DSR %', p_dsr_id; end if;
  if p_outcome not in ('fulfilled','partially_fulfilled','rejected','closed') then
    raise exception 'validation: unknown outcome';
  end if;
  if length(coalesce(trim(p_summary),'')) < 10 then
    raise exception 'validation: record what was actually done for the subject';
  end if;

  update public.dsr_requests
     set status = p_outcome, fulfilled_at = now(), response_summary = p_summary, handler_id = p_actor
   where id = p_dsr_id;

  -- an erasure request puts the subject's own records on the deletion clock;
  -- the worker, not this call, performs the destruction
  if p_outcome = 'fulfilled' and v.request_type = 'erasure' then
    for v_row in
      select c.id as cid from public.candidates c
      where lower(coalesce(c.email,'')) = lower(v.subject_email)
    loop
      perform public.enqueue_retention('candidate', v_row.cid, 'candidate_unsuccessful', p_actor);
    end loop;
  end if;

  perform public.write_audit('dsr.fulfil', 'dsr', p_dsr_id::text, p_actor, 'success', p_summary,
                             jsonb_build_object('status', v.status), jsonb_build_object('status', p_outcome));
  return jsonb_build_object('id', p_dsr_id, 'status', p_outcome);
end;
$$;

-- ===========================================================================
-- comments
-- ===========================================================================
create or replace function public.add_comment(
  p_entity_type text, p_entity_id uuid, p_actor uuid, p_body text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.assert_actor(p_actor);
  if length(coalesce(trim(p_body),'')) < 1 then raise exception 'validation: comment body is empty'; end if;
  if length(p_body) > 4000 then raise exception 'validation: comment too long'; end if;

  insert into public.comments (entity_type, entity_id, body, author_id)
  values (p_entity_type, p_entity_id, trim(p_body), p_actor)
  returning id into v_id;

  perform public.write_audit('comment.add', p_entity_type, p_entity_id::text, p_actor, 'success',
                             null, null, jsonb_build_object('length', length(p_body)));
  return jsonb_build_object('id', v_id, 'created_at', now());
end;
$$;

-- ===========================================================================
-- failed attempts are recorded, not swallowed
-- ===========================================================================
create or replace function public.record_denial(
  p_action text, p_entity_type text, p_entity_id text, p_actor uuid, p_reason text, p_severity text default 'medium'
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events
    (occurred_at, actor_id, actor_role, action, entity_type, entity_id, reason, result)
  values (now(), p_actor, public.actor_role_for(p_actor), p_action, p_entity_type, p_entity_id,
          p_reason, 'denied');
  if p_severity in ('high','critical') then
    insert into public.security_incidents
      (incident_type, severity, actor_user_id, target_entity_type, target_entity_id, detail)
    values ('unauthorized_access_attempt', p_severity, p_actor, p_entity_type,
            try_cast_uuid(p_entity_id), p_reason);
  end if;
end;
$$;

-- Postgres has no try_cast; a helper keeps record_denial tolerant of ids that
-- are not uuids at all (a probe for a guessed URL arrives as text).
create or replace function public.try_cast_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;
