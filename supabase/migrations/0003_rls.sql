-- Yash Honda Vacancy & Hiring Tracker - row level security
--
-- Posture: the application layer performs authorization before any query is
-- built; RLS is the second wall, so that a leaked URL, a stolen anon key or a
-- bug in a page handler still cannot read data the actor is not entitled to.
-- Views are created with security_invoker so they inherit these policies
-- instead of silently bypassing them as the owner.

-- ===========================================================================
-- actor helpers
-- ===========================================================================
create or replace function public.actor_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select u.role from public.users u
  where u.id = auth.uid() and u.is_active = true;
$$;

create or replace function public.actor_id()
returns uuid language sql stable as $$ select auth.uid() $$;

-- The roles that see the whole company. Everything else is facility scoped.
-- Finance is company-wide for the money view only; it never sees candidate
-- documents (no documents policy grants it).
create or replace function public.is_global()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.actor_role() in ('Admin','Owner','CEO'), false);
$$;

-- Facilities the actor is attached to (primary + explicit assignments)
create or replace function public.actor_facility_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select primary_facility_id from public.users where id = auth.uid() and primary_facility_id is not null
  union
  select facility_id from public.user_facilities where user_id = auth.uid();
$$;

create or replace function public.can_view(entity_facility_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global()
      -- Finance reviews budget/CTC across facilities but holds no candidate PII
      or public.actor_role() = 'Finance'
      or entity_facility_id = any (array(select public.actor_facility_ids()))
      -- an actor always sees what they raised
      or exists (
        select 1 from public.vacancy_requests r
        where r.facility_id = entity_facility_id and r.created_by = auth.uid()
      );
$$;

-- ===========================================================================
-- enable RLS everywhere
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'facilities','users','user_facilities','position_types',
    'vacancy_requests','vacancy_request_status_history','positions','position_status_history',
    'position_adjustments','candidates','candidate_status_history','candidate_documents',
    'approval_tasks','approval_logs','comments','attachments',
    'workflow_definitions','workflow_steps','workflow_transitions','workflow_field_definitions',
    'notification_outbox',
    'privacy_consent_records','candidate_notice_acks','retention_policies','retention_items',
    'deletion_queue','dsr_requests','security_incidents','legal_documents','legal_document_acks',
    'document_access_logs','audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Views must evaluate policies as the calling user.
do $$
declare v text;
begin
  foreach v in array array['v_position_ageing','v_pending_approvals','v_facility_open_positions','v_retention_due'] loop
    execute format('alter view public.%I set (security_invoker = true)', v);
  end loop;
end $$;

-- ===========================================================================
-- organisation
-- ===========================================================================
create policy facilities_read on public.facilities
  for select to authenticated using (is_active = true or public.actor_role() = 'Admin');
create policy facilities_write on public.facilities
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');

create policy users_read on public.users
  for select to authenticated using (
    id = auth.uid()
    or public.actor_role() in ('Admin','Owner','CEO')
    -- HR and Finance need the roster to route work; they see identity + role,
    -- and the column-level view in the app hides everything else.
    or public.actor_role() in ('HR','HrHead','Finance')
  );
create policy users_admin_write on public.users
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');
-- nobody may change their own role: only the Admin policy above writes users
create policy users_self_update on public.users
  for update to authenticated
  using (id = auth.uid() and role = (select u.role from public.users u where u.id = auth.uid()))
  with check (id = auth.uid() and role = (select u.role from public.users u where u.id = auth.uid()));

create policy user_facilities_read on public.user_facilities
  for select to authenticated using (user_id = auth.uid() or public.actor_role() = 'Admin');
create policy user_facilities_write on public.user_facilities
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');

create policy position_types_read on public.position_types
  for select to authenticated using (public.can_view(facility_id));
create policy position_types_write on public.position_types
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');

-- ===========================================================================
-- vacancy requests
-- ===========================================================================
create policy requests_select on public.vacancy_requests
  for select to authenticated using (
    public.is_global()
    or public.can_view(facility_id)
    or created_by = auth.uid()
    -- an approver must be able to open the thing they are being asked to decide
    or exists (
      select 1 from public.approval_tasks t
      where t.entity_type = 'vacancy_request'
        and t.entity_id = vacancy_requests.id
        and (t.assigned_user_id = auth.uid() or t.assigned_role = public.actor_role())
    )
  );

create policy requests_insert on public.vacancy_requests
  for insert to authenticated with check (
    public.actor_role() in ('Employee','HR','HrHead','Admin')
    and created_by = auth.uid()
    and (acknowledgement_accepted = false or acknowledgement_version is not null)
  );

-- Only a draft the actor raised may be edited; every later change goes through
-- a server action that writes its own audit row.
create policy requests_update_drafts on public.vacancy_requests
  for update to authenticated
  using (status = 'draft' and created_by = auth.uid())
  with check (status = 'draft' and created_by = auth.uid());

create policy requests_update_workflow on public.vacancy_requests
  for update to authenticated
  using (public.actor_role() in ('Owner','CEO','HR','HrHead','Admin'))
  with check (public.actor_role() in ('Owner','CEO','HR','HrHead','Admin'));

create policy requests_no_delete on public.vacancy_requests
  for delete to authenticated using (false);

create policy req_history_select on public.vacancy_request_status_history
  for select to authenticated using (
    exists (select 1 from public.vacancy_requests r where r.id = request_id
            and (public.is_global() or public.can_view(r.facility_id) or r.created_by = auth.uid()))
  );

-- ===========================================================================
-- positions
-- ===========================================================================
create policy positions_select on public.positions
  for select to authenticated using (
    exists (select 1 from public.vacancy_requests r where r.id = request_id
      and (public.is_global() or public.can_view(r.facility_id) or r.created_by = auth.uid()))
    or public.can_view(facility_id)
  );
create policy positions_write on public.positions
  for all to authenticated
  using (public.actor_role() in ('HR','HrHead','Owner','CEO','Admin'))
  with check (public.actor_role() in ('HR','HrHead','Owner','CEO','Admin'));
create policy pos_history_select on public.position_status_history
  for select to authenticated using (public.actor_role() is not null);
create policy adjustments_select on public.position_adjustments
  for select to authenticated using (public.actor_role() in ('Admin','Owner','CEO','HR','HrHead','Finance'));
create policy adjustments_insert on public.position_adjustments
  for insert to authenticated with check (adjusted_by = auth.uid());

-- ===========================================================================
-- candidates and documents (PII)
-- ===========================================================================
create policy candidates_select on public.candidates
  for select to authenticated using (
    exists (
      select 1 from public.positions p
      join public.vacancy_requests r on r.id = p.request_id
      where p.id = candidates.position_id
        and (public.is_global() or public.can_view(p.facility_id) or r.created_by = auth.uid())
    )
  );
create policy candidates_write on public.candidates
  for all to authenticated
  using (public.actor_role() in ('HR','HrHead','Owner','CEO','Admin'))
  with check (public.actor_role() in ('HR','HrHead','Owner','CEO','Admin'));
create policy cand_history_select on public.candidate_status_history
  for select to authenticated using (public.actor_role() is not null);

-- Documents are the most sensitive rows in the system. Read is limited to HR
-- functions plus the approver of that specific candidate; Admin reads are
-- allowed but are expected to be rare and are logged by the app.
create policy documents_select on public.candidate_documents
  for select to authenticated using (
    public.actor_role() in ('HR','HrHead','Owner','CEO','Admin')
    and exists (
      select 1 from public.candidates c
      join public.positions p on p.id = c.position_id
      where c.id = candidate_documents.candidate_id and public.can_view(p.facility_id)
    )
  );
create policy documents_write on public.candidate_documents
  for all to authenticated
  using (public.actor_role() in ('HR','HrHead','Admin'))
  with check (public.actor_role() in ('HR','HrHead','Admin'));

-- Finance must never read candidate documents (resume/photograph). No policy
-- above grants Finance documents_select, so the denial is structural, not a UI
-- convention.

-- ===========================================================================
-- approvals
-- ===========================================================================
create policy tasks_select on public.approval_tasks
  for select to authenticated using (
    assigned_user_id = auth.uid()
    or assigned_role = public.actor_role()
    or requested_by = auth.uid()
    or public.actor_role() in ('Admin','Owner','CEO')
  );
create policy tasks_write on public.approval_tasks
  for all to authenticated
  using (public.actor_role() in ('HR','HrHead','Owner','CEO','Admin','Finance'))
  with check (public.actor_role() in ('HR','HrHead','Owner','CEO','Admin','Finance'));

create policy approval_logs_select on public.approval_logs
  for select to authenticated using (public.actor_role() is not null);

-- A task can never be resolved by the person who raised the underlying record.
-- Enforced in the workflow engine and mirrored here so a direct insert cannot
-- forge an approval.
create policy tasks_no_self_approval_on_insert on public.approval_tasks
  for insert to authenticated with check (
    assigned_user_id is distinct from requested_by
  );

-- ===========================================================================
-- workflow configuration
-- ===========================================================================
create policy workflow_read on public.workflow_definitions
  for select to authenticated using (true);
create policy workflow_steps_read on public.workflow_steps
  for select to authenticated using (true);
create policy workflow_transitions_read on public.workflow_transitions
  for select to authenticated using (true);
create policy workflow_fields_read on public.workflow_field_definitions
  for select to authenticated using (true);
create policy workflow_admin_write on public.workflow_definitions
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');
create policy workflow_steps_admin_write on public.workflow_steps
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');
create policy workflow_transitions_admin_write on public.workflow_transitions
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');
create policy workflow_fields_admin_write on public.workflow_field_definitions
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');

-- ===========================================================================
-- collaboration and notifications
-- ===========================================================================
create policy comments_select on public.comments
  for select to authenticated using (public.actor_role() is not null);
create policy comments_insert on public.comments
  for insert to authenticated with check (author_id = auth.uid());
create policy comments_no_mutation on public.comments
  for update to authenticated using (false) with check (false);
create policy comments_no_delete on public.comments
  for delete to authenticated using (false);

create policy attachments_select on public.attachments
  for select to authenticated using (public.actor_role() is not null);
create policy attachments_write on public.attachments
  for all to authenticated
  using (public.actor_role() in ('HR','HrHead','Employee','Admin'))
  with check (public.actor_role() in ('HR','HrHead','Employee','Admin'));

create policy notifications_select on public.notification_outbox
  for select to authenticated using (recipient_id = auth.uid());
create policy notifications_update on public.notification_outbox
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_insert on public.notification_outbox
  for insert to authenticated with check (public.actor_role() in ('HR','HrHead','Admin','Owner','CEO'));

-- ===========================================================================
-- DPDP: privacy, retention, legal, security
-- ===========================================================================
create policy consent_self_read on public.privacy_consent_records
  for select to authenticated using (subject_user_id = auth.uid() or public.actor_role() = 'Admin');
create policy consent_insert on public.privacy_consent_records
  for insert to authenticated with check (
    subject_user_id = auth.uid() or public.actor_role() = 'Admin'
  );
-- consent records are evidence: no update, no delete
create policy consent_no_mutation on public.privacy_consent_records
  for update to authenticated using (false) with check (false);

create policy notice_acks_read on public.candidate_notice_acks
  for select to authenticated using (public.actor_role() in ('HR','HrHead','Admin','Owner','CEO'));
create policy notice_acks_insert on public.candidate_notice_acks
  for insert to authenticated with check (
    exists (select 1 from public.candidates c where c.id = candidate_id)
  );

create policy retention_read on public.retention_policies
  for select to authenticated using (public.actor_role() is not null);
create policy retention_write on public.retention_policies
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');
create policy retention_items_read on public.retention_items
  for select to authenticated using (public.actor_role() = 'Admin');
create policy retention_items_write on public.retention_items
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');
create policy deletion_queue_read on public.deletion_queue
  for select to authenticated using (public.actor_role() = 'Admin');
create policy deletion_queue_write on public.deletion_queue
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');

create policy dsr_read on public.dsr_requests
  for select to authenticated using (public.actor_role() = 'Admin');
create policy dsr_write on public.dsr_requests
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');

create policy incidents_read on public.security_incidents
  for select to authenticated using (public.actor_role() in ('Admin','Owner','CEO'));
create policy incidents_insert on public.security_incidents
  for insert to authenticated with check (true);
create policy incidents_update on public.security_incidents
  for update to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');

create policy legal_select on public.legal_documents
  for select to authenticated using (status = 'published' or public.actor_role() = 'Admin');
create policy legal_write on public.legal_documents
  for all to authenticated using (public.actor_role() = 'Admin') with check (public.actor_role() = 'Admin');
create policy legal_acks_select on public.legal_document_acks
  for select to authenticated using (user_id = auth.uid() or public.actor_role() = 'Admin');
create policy legal_acks_insert on public.legal_document_acks
  for insert to authenticated with check (user_id = auth.uid());

-- Document access log: every authenticated actor can record their own access,
-- only Admin can read the register back.
create policy docaccess_insert on public.document_access_logs
  for insert to authenticated with check (actor_id = auth.uid());
create policy docaccess_select on public.document_access_logs
  for select to authenticated using (
    public.actor_role() = 'Admin'
    or (actor_id = auth.uid() and public.actor_role() in ('HR','HrHead','Owner','CEO'))
  );

-- ===========================================================================
-- audit_events: append-only for the whole world
-- ===========================================================================
create policy audit_insert on public.audit_events
  for insert to authenticated with check (true);
create policy audit_select on public.audit_events
  for select to authenticated using (public.actor_role() = 'Admin');
-- no update policy, no delete policy: RLS denies both, and 0002 installs a
-- trigger that raises even for the table owner.
