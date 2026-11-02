-- Yash Honda Vacancy & Hiring Tracker - initial schema
-- Target: Supabase Postgres 15+. Apply with `supabase db push` or the SQL editor.
--
-- Integrity posture:
--   * status enums + cross-field CHECK constraints, so an invalid state cannot be
--     written even by a bug in the application
--   * every table carries created_at / created_by and, where mutable, updated_at
--   * audit_events is append-only and enforced by trigger in 0002
--   * money is always numeric(12,2); timestamptz is always UTC

create extension if not exists pgcrypto;

-- ===========================================================================
-- enums
-- ===========================================================================
create type public.user_role as enum (
  'Admin', 'Owner', 'CEO', 'HR', 'HrHead', 'Finance', 'Employee'
);

create type public.request_status as enum (
  'draft', 'submitted_for_vacancy_approval', 'approved', 'returned_for_information',
  'rejected', 'closed'
);

create type public.position_status as enum (
  'draft', 'awaiting_vacancy_approval', 'approved', 'sourcing', 'candidate_available',
  'sent_for_candidate_approval', 'hold', 'approved_for_joining', 'hired',
  'position_closed', 'candidature_unsuccessful'
);

create type public.candidate_status as enum (
  'draft', 'submitted_for_recruitment_approval', 'approved_for_joining', 'hired',
  'rejected', 'hold', 'returned_for_modifications', 'candidature_unsuccessful'
);

create type public.task_type as enum (
  'vacancy_approval', 'candidate_approval', 'hold_review', 'joining_confirmation',
  'budget_review', 'clarification'
);

create type public.task_status as enum ('pending', 'acted', 'cancelled', 'expired');

create type public.document_type as enum (
  'Resume', 'Photograph', 'Education certificate', 'Experience letter',
  'Identity proof', 'Relieving letter', 'Medical fitness', 'Offer acknowledgement'
);

create type public.verification_status as enum ('Not Verified', 'Under Review', 'Verified', 'Rejected');

create type public.workflow_step_type as enum ('approval', 'system');

create type public.privacy_consent_status as enum ('accepted', 'declined');

create type public.data_subject_category as enum ('Candidate', 'Employee', 'Portal User');

create type public.retention_basis as enum ('dpdp_compliance', 'organisation_policy');

create type public.security_incident_type as enum (
  'failed_login', 'unauthorized_access_attempt', 'session_anomaly', 'rate_limit_breach'
);

create type public.notification_channel as enum ('in_app');

-- ===========================================================================
-- organisation
-- ===========================================================================
create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  facility_type text not null default 'Sales' check (facility_type in
    ('Sales','Service','Sales & Service','Back Office','Godown')),
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz
);

-- Portal accounts. `users.id` mirrors auth.users.id; profiles are created by
-- an Admin inviting someone (v1: admin-generated invite link, no outbound email).
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.user_role not null,
  primary_facility_id uuid references public.facilities (id),
  department text,
  designation text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz
);
create index on public.users (role);
create index on public.users (primary_facility_id);

-- Facility membership beyond the primary facility (multi-facility HR etc.)
create table public.user_facilities (
  user_id uuid not null references public.users (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, facility_id)
);

-- Position catalogue per facility (accounting head + default CTC)
create table public.position_types (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name text not null,
  accounting_head text not null default 'Operations' check (accounting_head in
    ('Sales','Service','Parts','Administration','Back Office','Operations')),
  default_ctc numeric(12,2) check (default_ctc is null or default_ctc >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (facility_id, name)
);

-- ===========================================================================
-- vacancy request -> positions -> candidates -> documents
-- ===========================================================================
create table public.vacancy_requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  title text not null check (char_length(title) between 3 and 255),
  reason text not null check (reason in
    ('New','Replacement — employee left','Replacement — planned exit','Business expansion')),
  facility_id uuid not null references public.facilities (id),
  position_type text not null,
  min_qualification text,
  experience_text text,
  has_backfill_ref boolean not null default false,
  backfill_ref_note text,
  budget_available boolean,
  ctc_min numeric(12,2),
  ctc_max numeric(12,2),
  joining_date date,
  is_urgent boolean not null default false,
  status public.request_status not null default 'draft',
  quantity integer not null check (quantity > 0),
  target_fill_date date,
  justification text not null check (char_length(justification) >= 5),
  previous_employee_name text,
  acknowledgement_accepted boolean not null default false,
  acknowledgement_version text,
  submitted_at timestamptz,
  submitted_by uuid references public.users (id),
  closed_at timestamptz,
  closure_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id),
  updated_at timestamptz not null default now(),
  constraint ctc_range_ok check (ctc_min is null or ctc_max is null or ctc_max >= ctc_min),
  constraint closed_needs_reason check (status <> 'closed' or closure_reason is not null)
);
create index on public.vacancy_requests (facility_id, status);
create index on public.vacancy_requests (status, submitted_at desc);

-- Status history is a first-class record, not a log line: it is what ageing
-- reports are computed from.
create table public.vacancy_request_status_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.vacancy_requests (id) on delete cascade,
  from_status public.request_status,
  to_status public.request_status not null,
  changed_by uuid,
  reason text,
  changed_at timestamptz not null default now()
);
create index on public.vacancy_request_status_history (request_id, changed_at);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.vacancy_requests (id) on delete cascade,
  position_number text not null unique,
  label text not null,
  facility_id uuid not null references public.facilities (id),
  status public.position_status not null default 'draft',
  previous_status_before_hold public.position_status,
  hold_reason text,
  hold_start_date date,
  hold_end_date_expected date,
  resume_required boolean not null default true,
  photo_required boolean not null default true,
  ctc_min numeric(12,2),
  ctc_max numeric(12,2),
  target_fill_date date,
  hired_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  -- hold is an overlay: it may only ever be entered from, and returned to, a
  -- real stage. hiring / awaiting approval / draft are the allowed sources.
  constraint hold_overlay_coherent check (
    (status = 'hold' and previous_status_before_hold is not null
       and previous_status_before_hold <> 'hold')
    or (status <> 'hold' and previous_status_before_hold is null)
  ),
  -- a position is only 'hired' once it actually joined
  constraint hired_is_final check (status <> 'hired' or hired_at is not null)
);
create index on public.positions (request_id);
create index on public.positions (facility_id, status);

create table public.position_status_history (
  id bigint generated always as identity primary key,
  position_id uuid not null references public.positions (id) on delete cascade,
  from_status public.position_status,
  to_status public.position_status not null,
  changed_by uuid,
  reason text,
  changed_at timestamptz not null default now()
);
create index on public.position_status_history (position_id, changed_at);

-- Audited deviation from the approved position terms
create table public.position_adjustments (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions (id) on delete cascade,
  field text not null check (field in
    ('ctc_min','ctc_max','target_fill_date','quantity','joining_date','justification')),
  old_value text,
  new_value text,
  reason text not null check (char_length(reason) >= 5),
  authority_basis text not null,
  adjusted_by uuid not null,
  adjusted_at timestamptz not null default now()
);
create index on public.position_adjustments (position_id);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 255),
  email text,
  phone text,
  current_location text,
  expected_ctc numeric(12,2),
  experience_text text,
  qualifications text,
  notice_period_days integer check (notice_period_days is null or notice_period_days >= 0),
  source text,
  status public.candidate_status not null default 'draft',
  rejection_reason text,
  submitted_for_approval_at timestamptz,
  decision_at timestamptz,
  approved_for_joining_at timestamptz,
  actual_joining_date date,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  -- DPDP data minimisation: nothing identifying beyond what hiring needs.
  constraint no_prohibited_fields check (
    email is null or email !~* '(aadhaar|pan|bank)'
  )
);
create index on public.candidates (position_id, status);

-- Hard-minimum document policy lives here, not in code comments: a candidate
-- cannot leave draft without a Resume and a Photograph row present (0002).
create table public.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  document_type public.document_type not null,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes between 1 and 104857600),
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  verified_by uuid,
  verified_at timestamptz,
  verification_status public.verification_status not null default 'Not Verified',
  is_mandatory boolean not null default false,
  is_exception boolean not null default false,
  exception_reason text,
  exception_authorized_by uuid,
  constraint exception_needs_reason check (
    not is_exception or (exception_reason is not null and exception_authorized_by is not null)
  ),
  unique (candidate_id, document_type)
);
create index on public.candidate_documents (candidate_id);

create table public.candidate_status_history (
  id bigint generated always as identity primary key,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  from_status public.candidate_status,
  to_status public.candidate_status not null,
  changed_by uuid,
  reason text,
  changed_at timestamptz not null default now()
);
create index on public.candidate_status_history (candidate_id, changed_at);

-- ===========================================================================
-- approvals
-- ===========================================================================
create table public.approval_tasks (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('vacancy_request','position','candidate')),
  entity_id uuid not null,
  position_id uuid references public.positions (id) on delete cascade,
  task_type public.task_type not null,
  assigned_role public.user_role,
  assigned_user_id uuid references public.users (id) on delete set null,
  requested_by uuid,
  status public.task_status not null default 'pending',
  priority text check (priority in ('normal','high','urgent')),
  sla_hours integer,
  due_at timestamptz,
  acted_at timestamptz,
  acted_by uuid,
  action text check (action in ('approved','rejected','returned_for_information','cancelled')),
  comment text,
  created_at timestamptz not null default now(),
  -- a task must name exactly one accountable party: a role or a person
  constraint accountable_party_required check (
    assigned_role is not null or assigned_user_id is not null
  )
);
create index on public.approval_tasks (assigned_user_id, status);
create index on public.approval_tasks (assigned_role, status);
create index on public.approval_tasks (entity_type, entity_id);

create table public.approval_logs (
  id bigint generated always as identity primary key,
  task_id uuid references public.approval_tasks (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index on public.approval_logs (entity_type, entity_id);

-- ===========================================================================
-- config-driven workflow (read at runtime - nothing about the process is
-- hard-coded in the UI layer)
-- ===========================================================================
create table public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  entity_type text not null check (entity_type in ('vacancy_request','position','candidate')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_definitions (id) on delete cascade,
  status_key text not null,
  label text not null,
  step_type public.workflow_step_type not null default 'approval',
  required_fields text[] not null default '{}',
  required_documents text[] not null default '{}',
  allowed_actions text[] not null default '{}',
  allowed_roles text[] not null default '{}',
  max_sla_days integer,
  overdue_sla_days integer,
  sort_order integer not null default 0,
  is_terminal boolean not null default false,
  unique (workflow_id, status_key)
);

create table public.workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_definitions (id) on delete cascade,
  from_status text not null,
  action text not null,
  to_status text not null,
  allowed_roles text[] not null default '{}',
  requires_reason boolean not null default false,
  requires_comment boolean not null default false,
  unique (workflow_id, from_status, action)
);

-- Field definitions drive both the forms and the "required fields" gate
create table public.workflow_field_definitions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('vacancy_request','position','candidate')),
  field_key text not null,
  label text not null,
  input_type text not null check (input_type in
    ('text','textarea','number','currency','date','select','checkbox','file','email','phone')),
  is_mandatory boolean not null default false,
  max_length integer,
  options text[],
  sort_order integer not null default 0,
  visible_roles text[] not null default '{}',
  editable_roles text[] not null default '{}',
  unique (entity_type, field_key)
);

-- ===========================================================================
-- collaboration and notifications (in-app only in v1)
-- ===========================================================================
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('vacancy_request','position','candidate')),
  entity_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000),
  author_id uuid not null,
  created_at timestamptz not null default now()
);
create index on public.comments (entity_type, entity_id, created_at);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('vacancy_request','position','candidate')),
  entity_id uuid not null,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now()
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  body text,
  link text,
  severity text not null default 'info' check (severity in ('info','warn','risk')),
  channel public.notification_channel not null default 'in_app',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notification_outbox (recipient_id, read_at, created_at desc);
