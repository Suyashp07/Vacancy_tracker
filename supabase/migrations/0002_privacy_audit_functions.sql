-- Yash Honda Vacancy & Hiring Tracker - privacy, audit, functions, views
-- Depends on 0001_init.sql

-- ===========================================================================
-- DPDP Act 2023 / DPDP Rules 2025 records
-- ===========================================================================
create table public.privacy_consent_records (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid references public.users (id) on delete set null,
  subject_email text,
  subject_category public.data_subject_category not null default 'Portal User',
  purpose text not null,
  notice_version text not null,
  status public.privacy_consent_status not null,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  -- 'declined' may still carry granted_at: that is a consent that was given
  -- and later withdrawn, and the fact it existed must remain visible.
  constraint consent_result_coherent check (
    (status = 'accepted' and granted_at is not null and withdrawn_at is null)
    or (status = 'declined' and (granted_at is null or withdrawn_at is not null))
  )
);
create index on public.privacy_consent_records (subject_email);
create index on public.privacy_consent_records (status, created_at desc);

-- Candidate-facing collection notice acceptance (shown before any PII is typed)
create table public.candidate_notice_acks (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  notice_version text not null,
  lawful_basis text not null,
  acknowledged_by text not null,
  acknowledged_at timestamptz not null default now(),
  ip inet,
  unique (candidate_id, notice_version)
);

create table public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  data_category text not null unique,
  legal_basis public.retention_basis not null default 'organisation_policy',
  purpose text not null,
  retention_days integer not null check (retention_days > 0),
  is_active boolean not null default true,
  version text not null default '1',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Computed retention due date per record; the deletion queue consumes this.
create table public.retention_items (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.retention_policies (id),
  entity_type text not null,
  entity_id uuid not null,
  finalized_at timestamptz not null,
  due_at timestamptz not null,
  deleted_at timestamptz,
  purge_batch text,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);
create index on public.retention_items (due_at) where deleted_at is null;

create table public.deletion_queue (
  id bigint generated always as identity primary key,
  retention_item_id uuid references public.retention_items (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  reason text not null,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  outcome text check (outcome in ('deleted','anonymised','blocked_legal_hold','failed')),
  detail text
);

-- Data-subject requests (access, correction, erasure, grievance)
create table public.dsr_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  subject_email text not null,
  subject_name text,
  subject_category public.data_subject_category not null default 'Candidate',
  request_type text not null check (request_type in
    ('access','correction','erasure','withdraw_consent','grievance','nominee')),
  detail text,
  status text not null default 'open' check (status in
    ('open','in_progress','fulfilled','partially_fulfilled','rejected','closed')),
  statutory_due_at timestamptz not null,
  fulfilled_at timestamptz,
  response_summary text,
  handler_id uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.dsr_requests (status, statutory_due_at);

create table public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_type public.security_incident_type not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  actor_user_id uuid,
  actor_ip inet,
  target_entity_type text,
  target_entity_id uuid,
  detail text not null,
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.security_incidents (detected_at desc);

-- Legal documents (policy, consent notice, grievance redressal) with the
-- publish gate: an unpublished draft must never be reachable by users.
create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  title text not null,
  version text not null,
  body_md text not null,
  status text not null default 'draft' check (status in ('draft','published','superseded')),
  effective_from date,
  published_at timestamptz,
  published_by uuid,
  superseded_by uuid references public.legal_documents (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_needs_effective check (
    status <> 'published' or (effective_from is not null and published_at is not null)
  ),
  unique (key, version)
);

-- One acceptance row per user per legal-document version: the audit-grade proof
-- that the acknowledgement was actually read.
create table public.legal_document_acks (
  id uuid primary key default gen_random_uuid(),
  legal_document_id uuid not null references public.legal_documents (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  unique (legal_document_id, user_id)
);

-- Every read of a candidate document is logged. This is the DPDP "access log"
-- that makes a signed URL an auditable act rather than an invisible one.
create table public.document_access_logs (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.candidate_documents (id) on delete cascade,
  actor_id uuid not null,
  action text not null check (action in ('view','download','upload','verify','delete')),
  accessed_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  note text
);
create index on public.document_access_logs (document_id, accessed_at desc);
create index on public.document_access_logs (actor_id, accessed_at desc);

-- ===========================================================================
-- audit log: append-only, no PII payload, survives everything else
-- ===========================================================================
create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_role public.user_role,
  actor_ip text,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_id uuid,
  position_id uuid,
  candidate_id uuid,
  facility_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  result text not null check (result in
    ('success','failure','denied','validation_error','conflict')),
  metadata jsonb not null default '{}'::jsonb
);
create index on audit_events (occurred_at desc);
create index on audit_events (entity_type, entity_id);
create index on audit_events (actor_id, occurred_at desc);
create index on audit_events (action, occurred_at desc);
create index on audit_events (facility_id, occurred_at desc);

-- Append-only enforcement. Even the table owner cannot UPDATE/DELETE once this
-- is installed; a policy change is expressed by writing a new event, not by
-- editing history.
create or replace function public.audit_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only: % is not permitted', tg_op;
end;
$$;
create trigger audit_events_no_update
  before update or delete on public.audit_events
  for each row execute function public.audit_events_immutable();

-- ===========================================================================
-- helpers
-- ===========================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Business-year request numbers: YH-<FY 2627>-<zero-padded sequence>.
-- The sequence resets per fiscal year so reports read cleanly.
create or replace function public.next_request_number()
returns text language plpgsql security definer set search_path = public as $$
declare
  fy_start int;
  fy_tag text;
  seq int;
begin
  -- Indian fiscal year begins 1 April
  if extract(month from now() at time zone 'Asia/Kolkata') >= 4 then
    fy_start := extract(year from now() at time zone 'Asia/Kolkata')::int;
  else
    fy_start := extract(year from now() at time zone 'Asia/Kolkata')::int - 1;
  end if;
  fy_tag := to_char(fy_start % 100, 'FM00') || to_char((fy_start + 1) % 100, 'FM00');
  execute format('create sequence if not exists vacancy_req_%s start 1', fy_tag);
  seq := nextval(format('vacancy_req_%s', fy_tag));
  return format('YH-%s-%s', fy_tag, lpad(seq::text, 4, '0'));
end;
$$;

create or replace function public.set_request_number()
returns trigger language plpgsql as $$
begin
  if new.number is null or new.number = '' then
    new.number := next_request_number();
  end if;
  return new;
end;
$$;
create trigger vacancy_requests_number
  before insert on public.vacancy_requests
  for each row execute function public.set_request_number();

-- Position numbers derive from the parent request: YH-2627-0147-P3
create or replace function public.set_position_number()
returns trigger language plpgsql as $$
declare
  n int;
begin
  select count(*) + 1 into n from public.positions where request_id = new.request_id;
  new.position_number := (select number from public.vacancy_requests where id = new.request_id)
                         || '-P' || n::text;
  return new;
end;
$$;
create trigger positions_number
  before insert on public.positions
  for each row when (new.position_number is null or new.position_number = '')
  execute function public.set_position_number();

-- Status history is written by the database so no code path can skip it.
create or replace function public.log_request_status()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into public.vacancy_request_status_history (request_id, from_status, to_status, changed_by)
      values (new.id, old.status, new.status, current_setting('app.user_id', true)::uuid);
  end if;
  return new;
end;
$$;
create trigger vacancy_requests_status_history
  after update of status on public.vacancy_requests
  for each row execute function public.log_request_status();

create or replace function public.log_position_status()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into public.position_status_history (position_id, from_status, to_status, changed_by)
      values (new.id, old.status, new.status, current_setting('app.user_id', true)::uuid);
  end if;
  return new;
end;
$$;
create trigger positions_status_history
  after update of status on public.positions
  for each row execute function public.log_position_status();

create or replace function public.log_candidate_status()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into public.candidate_status_history (candidate_id, from_status, to_status, changed_by)
      values (new.id, old.status, new.status, current_setting('app.user_id', true)::uuid);
  end if;
  return new;
end;
$$;
create trigger candidates_status_history
  after update of status on public.candidates
  for each row execute function public.log_candidate_status();

-- Gating rule expressed in the database as well as the app: a candidate cannot
-- enter the approval flow without both mandatory documents present.
create or replace function public.assert_candidate_docs_ready()
returns trigger language plpgsql as $$
declare
  missing int;
begin
  if new.status in ('submitted_for_recruitment_approval','approved_for_joining','hired')
     and old.status is distinct from new.status then
    select count(*) into missing from (
      select d.document_type
      from unnest(array['Resume','Photograph']::public.document_type[]) as d(document_type)
      where not exists (
        select 1 from public.candidate_documents c
        where c.candidate_id = new.id and c.document_type = d.document_type
      )
    ) x;
    if missing > 0 then
      raise exception
        'candidate % cannot move to %: missing mandatory document(s)', new.id, new.status;
    end if;
  end if;
  return new;
end;
$$;
create trigger candidates_docs_gate
  before update of status on public.candidates
  for each row execute function public.assert_candidate_docs_ready();

-- A position cannot be marked hired without exactly one hired candidate.
create or replace function public.assert_position_hired()
returns trigger language plpgsql as $$
declare
  hired int;
begin
  if new.status = 'hired' and old.status is distinct from new.status then
    select count(*) into hired from public.candidates
      where position_id = new.id and status = 'hired';
    if hired <> 1 then
      raise exception
        'position % cannot be hired: expected exactly 1 hired candidate, found %',
        new.id, hired;
    end if;
  end if;
  return new;
end;
$$;
create trigger positions_hired_gate
  before update of status on public.positions
  for each row execute function public.assert_position_hired();

-- Facilities referenced by live requests cannot be deleted, only deactivated.
create or replace function public.assert_facility_in_use()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.vacancy_requests where facility_id = old.id)
     or exists (select 1 from public.positions p
                join public.vacancy_requests r on r.id = p.request_id
                where r.facility_id = old.id
                  and p.status not in ('hired','position_closed')) then
    raise exception 'facility % is referenced by vacancy data and cannot be deleted; deactivate it instead', old.id;
  end if;
  return old;
end;
$$;
create trigger facilities_delete_guard
  before delete on public.facilities
  for each row execute function public.assert_facility_in_use();

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array[
    'facilities','users','position_types','vacancy_requests','positions','candidates',
    'workflow_definitions','workflow_steps','retention_policies','dsr_requests',
    'legal_documents'
  ] loop
    execute format('create trigger trg_%s_touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ===========================================================================
-- reporting views (reads, never writes)
-- ===========================================================================
-- Four ageing clocks. Hold time is excluded from "active" age because a
-- paused position must not look overdue. The last status change defines
-- stage_started_at; the last transition into hold defines the hold clock.
create or replace view public.v_position_ageing as
with stage as (
  select p.id as position_id, coalesce(h.changed_at, p.created_at) as stage_started_at
  from public.positions p
  left join lateral (
    select hs.changed_at
    from public.position_status_history hs
    where hs.position_id = p.id
    order by hs.changed_at desc
    limit 1
  ) h on true
), holdlog as (
  select p.id as position_id, hl.changed_at as hold_started_at
  from public.positions p
  join lateral (
    select h2.changed_at
    from public.position_status_history h2
    where h2.position_id = p.id and h2.to_status = 'hold'
      and not exists (
        select 1 from public.position_status_history nx
        where nx.position_id = p.id and nx.changed_at > h2.changed_at
      )
    order by h2.changed_at desc
    limit 1
  ) hl on p.status = 'hold'
)
select
  p.id,
  p.position_number,
  p.request_id,
  r.number as request_number,
  p.facility_id,
  f.name as facility_name,
  p.status,
  r.status as request_status,
  p.created_at,
  s.stage_started_at,
  now() - p.created_at as total_age,
  now() - s.stage_started_at as stage_age,
  coalesce(now() - hd.hold_started_at, interval '0') as hold_age,
  greatest(now() - p.created_at - coalesce(now() - hd.hold_started_at, interval '0'),
           interval '0') as active_age
from public.positions p
join public.vacancy_requests r on r.id = p.request_id
join public.facilities f on f.id = p.facility_id
join stage s on s.position_id = p.id
left join holdlog hd on hd.position_id = p.id;

-- Pending-approval ageing drives the overdue ledger and My Actions SLA rails.
create or replace view public.v_pending_approvals as
select
  t.id as task_id,
  t.task_type,
  t.assigned_role::text,
  t.assigned_user_id,
  t.entity_type,
  t.entity_id,
  t.position_id,
  t.requested_by,
  t.due_at,
  t.created_at,
  now() - t.created_at as waiting_for,
  t.created_at + (coalesce(t.sla_hours, 72) || ' hours')::interval as sla_due_at,
  case
    when now() > t.created_at + (coalesce(t.sla_hours, 72) * 2 || ' hours')::interval then 'overdue'
    when now() > t.created_at + (coalesce(t.sla_hours, 72) || ' hours')::interval then 'warning'
    else 'within'
  end as sla_state
from public.approval_tasks t
where t.status = 'pending';

-- Open positions per facility - the stacked bar on the dashboard.
create or replace view public.v_facility_open_positions as
select
  f.id as facility_id,
  f.name as facility_name,
  count(*) filter (where p.status in ('sourcing','candidate_available','sent_for_candidate_approval')) as sourcing,
  count(*) filter (where p.status = 'awaiting_vacancy_approval') as awaiting_vacancy,
  count(*) filter (where p.status = 'hold') as on_hold,
  count(*) filter (where p.status = 'approved_for_joining') as awaiting_joining,
  count(*) filter (where p.status = 'hired') as hired,
  count(*) filter (where p.status not in ('hired','position_closed')) as open_positions
from public.facilities f
join public.positions p on p.facility_id = f.id
join public.vacancy_requests r on r.id = p.request_id and r.status <> 'closed'
group by f.id, f.name;

-- Retention exposure: personal data held past its due date.
create or replace view public.v_retention_due as
select ri.id, ri.entity_type, ri.entity_id, ri.due_at, rp.data_category, rp.retention_days,
       now() - ri.due_at as overdue_by
from public.retention_items ri
join public.retention_policies rp on rp.id = ri.policy_id
where ri.deleted_at is null and rp.retention_days is not null;
