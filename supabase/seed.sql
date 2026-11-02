-- ===========================================================================
-- Yash Honda Vacancy & Hiring Tracker - DEMO data
-- ===========================================================================
-- WHAT THIS IS
--   A synthetic hiring register that spans every stage of the configured
--   workflow, so the portal can be walked through end to end: approvals waiting,
--   a returned request, a rejected one, a closed one, a position on hold, a
--   candidate awaiting a decision, one approved for joining, one already hired,
--   and two records in the previous fiscal year so the period control has
--   something to switch between.
--
-- HOW TO RUN
--   1. Apply supabase/migrations/0001..0009 in order, then supabase/storage.sql.
--   2. Run this whole file in the Supabase SQL editor (it runs as the project
--      owner, which is the only role that may write auth.users).
--   Both steps are automated by `node scripts/provision-supabase.mjs`.
--   It refuses to run twice; to load it again, run seed_teardown.sql first.
--
-- LOGINS (all share the development password  Yh-Dev-2026!)
--   admin@yashhonda.test      System Admin    - configuration, no hiring power
--   owner@yashhonda.test      Owner           - vacancy approvals
--   ceo@yashhonda.test        CEO             - vacancy and candidate decisions
--   hr@yashhonda.test         HR Team         - sourcing, documents, joining
--   hrhead@yashhonda.test     HR Head         - HR plus scope, DSR, exceptions
--   finance@yashhonda.test    Finance Team    - money view, cannot open CVs
--   employee@yashhonda.test   Employee        - raises requests
--
--   Deliberately: the Employee account has NOT accepted the published notice,
--   so signing in as them shows the acknowledgement gate - the read-only banner
--   and the refusal if they try to write. Everyone else has accepted.
--
-- HONEST LIMITATIONS
--   * candidate_documents rows are metadata only. No bytes were uploaded to the
--     private bucket, so opening one in the demo returns a storage error. Names
--     are prefixed DEMO- to make that unmistakable. Upload a real file through
--     the candidate rail to see the working path.
--   * Everything else is ordinary committed data: it was written the way a
--     `supabase db reset` seed writes it, i.e. directly, so the status-history
--     and audit rows here were authored rather than produced by the transition
--     functions. The workflow rules still apply to anything you do next.
--   * Nothing here is a real person. Candidate names, phones and emails are
--     invented; phone numbers use the +91 90000 00000 documentation range.

-- ===========================================================================
-- 0. refuse to double-load
-- ===========================================================================
do $$
begin
  if exists (select 1 from public.vacancy_requests
             where id = '22222222-2222-4222-8222-000000000001') then
    raise exception 'the demo register is already loaded - run the teardown at the bottom of seed.sql first';
  end if;
end $$;

-- ===========================================================================
-- 1. auth accounts
-- ===========================================================================
-- crypt()/gen_salt() come from pgcrypto, which the first migration installs.
-- Pin the search path so this file resolves them the same way whether it runs
-- from the SQL editor, psql, or `supabase db reset`.
set search_path = "$user", public, extensions;

-- Fixed ids so every later row can be traced back to a named person.
-- The column list is the subset of auth.users that exists in every GoTrue
-- release this project might run: no authentication_method, no is_anonymous.
--
-- Every text column GoTrue scans into a Go string MUST be non-NULL, or the
-- whole read path 500s ("Database error querying schema" / "finding users").
-- confirmation_token and recovery_token default to NULL, so they are set to ''
-- explicitly here along with the email/phone-change columns. See supabase/auth#1940.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token,
                        email_change, email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token)
values
  ('11111111-1111-4111-8111-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@yashhonda.test',
   crypt('Yh-Dev-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Ankur Jaiswal"}', now() - interval '120 days', now(), '', '', '', '', '', '', '', ''),
  ('11111111-1111-4111-8111-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@yashhonda.test',
   crypt('Yh-Dev-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Deepak Sanghvi"}', now() - interval '120 days', now(), '', '', '', '', '', '', '', ''),
  ('11111111-1111-4111-8111-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ceo@yashhonda.test',
   crypt('Yh-Dev-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Ranjit Bhandari"}', now() - interval '120 days', now(), '', '', '', '', '', '', '', ''),
  ('11111111-1111-4111-8111-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hr@yashhonda.test',
   crypt('Yh-Dev-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Sneha Kale"}', now() - interval '118 days', now(), '', '', '', '', '', '', '', ''),
  ('11111111-1111-4111-8111-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hrhead@yashhonda.test',
   crypt('Yh-Dev-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Swati Mane"}', now() - interval '118 days', now(), '', '', '', '', '', '', '', ''),
  ('11111111-1111-4111-8111-000000000006', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'finance@yashhonda.test',
   crypt('Yh-Dev-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Nilesh Patil"}', now() - interval '90 days', now(), '', '', '', '', '', '', '', ''),
  ('11111111-1111-4111-8111-000000000007', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'employee@yashhonda.test',
   crypt('Yh-Dev-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Amit Zode"}', now() - interval '60 days', now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

-- Each email user needs a matching identity or GoTrue's login cannot resolve the
-- account. provider_id is unique per (provider_id, provider); the user id works.
-- identity_data.email backs the generated "email" column on this table.
insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                             last_sign_in_at, created_at, updated_at)
select gen_random_uuid(),
       u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email',
       u.id::text,
       u.last_sign_in_at,
       u.created_at,
       now()
from auth.users u
where u.email like '%@yashhonda.test'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  )
on conflict do nothing;

insert into public.users (id, email, full_name, role, primary_facility_id, department,
                          designation, is_active, last_login_at, created_at)
values
  ('11111111-1111-4111-8111-000000000001', 'admin@yashhonda.test', 'Ankur Jaiswal', 'Admin',
   null, 'IT', 'Portal Administrator', true, now() - interval '9 hours', now() - interval '120 days'),
  ('11111111-1111-4111-8111-000000000002', 'owner@yashhonda.test', 'Deepak Sanghvi', 'Owner',
   null, 'Management', 'Principal', true, now() - interval '26 hours', now() - interval '120 days'),
  ('11111111-1111-4111-8111-000000000003', 'ceo@yashhonda.test', 'Ranjit Bhandari', 'CEO',
   null, 'Management', 'Principal', true, now() - interval '5 hours', now() - interval '120 days'),
  ('11111111-1111-4111-8111-000000000004', 'hr@yashhonda.test', 'Sneha Kale', 'HR',
   (select id from public.facilities where code = 'HRD-RW'), 'Human Resources', 'HR Executive',
   true, now() - interval '3 hours', now() - interval '118 days'),
  ('11111111-1111-4111-8111-000000000005', 'hrhead@yashhonda.test', 'Swati Mane', 'HrHead',
   (select id from public.facilities where code = 'IZL-BO'), 'Human Resources', 'HR Head',
   true, now() - interval '2 days', now() - interval '118 days'),
  ('11111111-1111-4111-8111-000000000006', 'finance@yashhonda.test', 'Nilesh Patil', 'Finance',
   (select id from public.facilities where code = 'IZL-BO'), 'Finance', 'Finance Manager',
   true, now() - interval '6 days', now() - interval '90 days'),
  ('11111111-1111-4111-8111-000000000007', 'employee@yashhonda.test', 'Amit Zode', 'Employee',
   (select id from public.facilities where code = 'HRD-RW'), 'Sales', 'Sales Consultant',
   true, now() - interval '4 days', now() - interval '60 days')
on conflict (id) do nothing;

-- Scope: HR covers three Pune points, the HR Head sees the whole map.
insert into public.user_facilities (user_id, facility_id)
select u.id, f.id
from public.users u, public.facilities f
where u.email = 'hr@yashhonda.test' and f.code in ('HRD-RW', 'SVC-RW', 'WDK-SAL')
on conflict do nothing;

-- ===========================================================================
-- 2. position catalogue per facility
-- ===========================================================================
insert into public.position_types (facility_id, name, accounting_head, default_ctc)
select f.id, t.name, t.head, t.ctc
from public.facilities f,
     (values
       ('Sales Consultant',      'Sales',          32000::numeric),
       ('Service Advisor',       'Service',        34500::numeric),
       ('Technician (2W)',       'Service',        24500::numeric),
       ('Spare Parts Executive', 'Parts',          28000::numeric),
       ('Back Office Executive', 'Administration', 26500::numeric),
       ('Store Keeper',          'Back Office',    23000::numeric)
     ) as t(name, head, ctc)
where f.code in ('HRD-RW', 'SVC-RW', 'SVC-BW', 'BW-SAL', 'WDK-SAL', 'IZL-BO', 'FRS-GD', 'ESD-GD', 'HP-SV')
  and (f.code not in ('IZL-BO', 'ESD-GD') or t.name in ('Back Office Executive', 'Store Keeper'))
on conflict (facility_id, name) do nothing;

-- ===========================================================================
-- 3. publish the notices, then record who has accepted them
-- ===========================================================================
-- Every policy the portal runs on is published, not just the two that gate
-- writes: the Policies screen should read like a live document set.
update public.legal_documents
   set status = 'published',
       effective_from = (current_date - 14),
       published_at = now() - interval '14 days',
       published_by = '11111111-1111-4111-8111-000000000001'
 where status = 'draft'
   and key in ('privacy_policy', 'terms_of_use', 'consent_notice', 'grievance',
               'retention_policy', 'access_policy', 'prohibited_data');

-- Acceptances for everyone except the Employee account, which is left pending on
-- purpose so the gate can be demonstrated.
insert into public.legal_document_acks (legal_document_id, user_id, accepted_at, ip, user_agent)
select d.id, u.id, now() - interval '13 days', '103.21.55.18'::inet,
       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/138.0 Safari/537.36'
from public.legal_documents d
cross join public.users u
where d.status = 'published'
  and u.email <> 'employee@yashhonda.test'
on conflict (legal_document_id, user_id) do nothing;

-- ===========================================================================
-- 4. vacancy requests
-- ===========================================================================
-- Two fiscal years are represented so the period control on the dashboard and
-- the register has a real choice to make.
insert into public.vacancy_requests
  (id, number, title, reason, facility_id, position_type, min_qualification,
   experience_text, has_backfill_ref, backfill_ref_note, budget_available,
   ctc_min, ctc_max, is_urgent, status, quantity, target_fill_date, justification,
   previous_employee_name, acknowledgement_accepted, acknowledgement_version,
   submitted_at, submitted_by, closed_at, closure_reason, created_at, created_by, updated_at)
values
  -- 01 waiting on the Owner desk right now, and already past its SLA
  ('22222222-2222-4222-8222-000000000001', 'YH-2627-0101',
   'Sales consultants - Hadapsar RedWing showroom', 'New',
   (select id from public.facilities where code = 'HRD-RW'), 'Sales Consultant',
   'HSC or Diploma', '0 to 2 years in two-wheeler retail', false, null, true,
   26000, 34000, false, 'submitted_for_vacancy_approval', 2,
   (current_date + 45),
   'Walk-in traffic at Hadapsar RedWing has grown since the Baji Patwardan road junction listings opened. The two present consultants cannot cover test-ride handovers on weekends, and delivery promises are slipping.',
   null, true, '1.0-draft',
   now() - interval '4 days', '11111111-1111-4111-8111-000000000007',
   null, null, now() - interval '4 days', '11111111-1111-4111-8111-000000000007',
   now() - interval '4 days'),

  -- 02 approved and sourcing, two CVs gathered so far
  ('22222222-2222-4222-8222-000000000002', 'YH-2627-0102',
   'Service advisor backfill - Service RedWing', 'Replacement — employee left',
   (select id from public.facilities where code = 'SVC-RW'), 'Service Advisor',
   'Diploma in Automobile Engineering', '2 to 5 years, Honda or comparable OEM exposure',
   true, 'Must be seated before month end to protect job-card throughput', true,
   30000, 42000, true, 'approved', 1,
   (current_date + 21),
   'The advisor who handled the fleet pipeline left on 30 September. Two service-advisor desks are running one short and the B2B card queue now waits on the workshop manager personally.',
   'Sanjay Uke (left 30 Sep)', true, '1.0-draft',
   now() - interval '11 days', '11111111-1111-4111-8111-000000000004',
   null, null, now() - interval '11 days', '11111111-1111-4111-8111-000000000004',
   now() - interval '8 days'),

  -- 03 sent back for a budget line, so the requester has a move to make
  ('22222222-2222-4222-8222-000000000003', 'YH-2627-0103',
   'Two-wheeler technicians - Fursungi parts store', 'Business expansion',
   (select id from public.facilities where code = 'FRS-GD'), 'Technician (2W)',
   'ITI Mechanic Motor Vehicle', '1 to 4 years, two-wheeler workshop', false, null, null,
   22000, 28000, false, 'returned_for_information', 2,
   (current_date + 60),
   'The Fursungi parts counter is attending assembly work for the southern network on Saturdays. Two technicians on the floor would keep that work from displacing regular job cards.',
   null, true, '1.0-draft',
   now() - interval '14 days', '11111111-1111-4111-8111-000000000004',
   null, null, now() - interval '14 days', '11111111-1111-4111-8111-000000000004',
   now() - interval '6 days'),

  -- 04 fully served: approved, sourced, decided, joined
  ('22222222-2222-4222-8222-000000000004', 'YH-2627-0104',
   'Back office executive - Izeil office', 'Replacement — planned exit',
   (select id from public.facilities where code = 'IZL-BO'), 'Back Office Executive',
   'BCom', '1 to 3 years in dealership back office', true,
   'Retirement of the incumbent; handover period agreed', true,
   24000, 29000, false, 'approved', 1,
   (current_date - 12),
   'The incumbent retires this quarter. The billing and insurance desk cannot absorb a vacancy because the same person files the IRNP returns for three facilities.',
   'Usha Salunkhe (retiring)', true, '1.0-draft',
   now() - interval '30 days', '11111111-1111-4111-8111-000000000005',
   null, null, now() - interval '31 days', '11111111-1111-4111-8111-000000000005',
   now() - interval '27 days'),

  -- 05 refused on budget, with the reason on the record
  ('22222222-2222-4222-8222-000000000005', 'YH-2627-0105',
   'Store keeper - BigWing sales warehouse', 'Business expansion',
   (select id from public.facilities where code = 'BW-SAL'), 'Store Keeper',
   'HSC', '0 to 2 years in parts storing', false, null, false,
   21000, 24000, false, 'rejected', 1,
   (current_date + 30),
   'Fast-moving parts at BigWing are being picked from the open floor because there is no dedicated keeper on the evening shift. Two mis-picks reached customers last month.',
   null, true, '1.0-draft',
   now() - interval '17 days', '11111111-1111-4111-8111-000000000004',
   null, null, now() - interval '18 days', '11111111-1111-4111-8111-000000000004',
   now() - interval '13 days'),

  -- 06 approved, then closed when the plan changed - the /closed register
  ('22222222-2222-4222-8222-000000000006', 'YH-2627-0106',
   'Sales consultant - Wadki counter', 'New',
   (select id from public.facilities where code = 'WDK-SAL'), 'Sales Consultant',
   'HSC or Diploma', '0 to 2 years', false, null, true,
   24000, 30000, false, 'closed', 1,
   (current_date + 15),
   'The Wadki counter has been running on a shared consultant from Hadapsar. A resident consultant would cut the test-ride cancellation rate.',
   null, true, '1.0-draft',
   now() - interval '39 days', '11111111-1111-4111-8111-000000000007',
   now() - interval '9 days', 'Role made redundant', now() - interval '40 days',
   '11111111-1111-4111-8111-000000000007', now() - interval '9 days'),

  -- 07 the busiest live record: one held, one awaiting decision, one awaiting joining
  ('22222222-2222-4222-8222-000000000007', 'YH-2627-0107',
   'Spare parts executives - Hadapsar RedWing', 'Business expansion',
   (select id from public.facilities where code = 'HRD-RW'), 'Spare Parts Executive',
   'Diploma or BCom', '1 to 3 years in parts counters', false, null, true,
   25000, 32000, false, 'approved', 3,
   (current_date + 25),
   'Parts revenue at Hadapsar grew nineteen percent over the last two quarters and the counter is answering enquiries from the floor. Three executives would separate counter duty from indenting.',
   null, true, '1.0-draft',
   now() - interval '26 days', '11111111-1111-4111-8111-000000000004',
   null, null, now() - interval '27 days', '11111111-1111-4111-8111-000000000004',
   now() - interval '24 days'),

  -- 08 a draft nobody has submitted yet, to show the editable stage
  ('22222222-2222-4222-8222-000000000008', 'YH-2627-0108',
   'Service advisor - Service BigWing (draft)', 'New',
   (select id from public.facilities where code = 'SVC-BW'), 'Service Advisor',
   'Diploma in Automobile Engineering', null, false, null, null,
   null, null, false, 'draft', 1,
   null,
   'BigWing workshop is opening a second advisory desk. Numbers and budget still to be confirmed with Finance before this is raised.',
   null, false, null,
   null, null, null, null, now() - interval '2 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '2 days'),

  -- 09 and 10 belong to the previous fiscal year
  ('22222222-2222-4222-8222-000000000009', 'YH-2526-0088',
   'Sales consultant - HP Salunke Vihar', 'New',
   (select id from public.facilities where code = 'HP-SV'), 'Sales Consultant',
   'HSC or Diploma', '0 to 2 years', false, null, true,
   24000, 30000, false, 'approved', 1,
   date '2026-03-18',
   'The Salunke Vihar counter opened in January with one consultant. A second desk is needed to keep weekend footfall from waiting on a single test-ride slot.',
   null, true, '0.9-draft',
   timestamp with time zone '2026-02-21 10:15:00+05:30',
   '11111111-1111-4111-8111-000000000004', null, null,
   timestamp with time zone '2026-02-20 17:40:00+05:30',
   '11111111-1111-4111-8111-000000000004',
   timestamp with time zone '2026-02-27 12:05:00+05:30'),

  ('22222222-2222-4222-8222-000000000010', 'YH-2526-0091',
   'Store keeper - ESD godown', 'Business expansion',
   (select id from public.facilities where code = 'ESD-GD'), 'Store Keeper',
   'HSC', '1 to 3 years', false, null, true,
   21000, 25000, false, 'closed', 1,
   date '2026-04-10',
   'ESD godown receipts are being entered twice because there is no keeper on the second shift. Errors have to be unwound at month end.',
   null, true, '0.9-draft',
   timestamp with time zone '2026-03-03 09:20:00+05:30',
   '11111111-1111-4111-8111-000000000007',
   timestamp with time zone '2026-03-27 16:00:00+05:30', 'Duplicate position',
   timestamp with time zone '2026-03-02 11:00:00+05:30',
   '11111111-1111-4111-8111-000000000007',
   timestamp with time zone '2026-03-27 16:00:00+05:30')
on conflict (id) do nothing;

-- ===========================================================================
-- 5. positions
-- ===========================================================================
-- position_number is written here instead of being left to the numbering
-- trigger: several positions share one request, and the trigger counts rows
-- already committed, which a multi-row insert has not committed yet.
insert into public.positions
  (id, request_id, position_number, label, facility_id, status,
   previous_status_before_hold, hold_reason, hold_start_date, hold_end_date_expected,
   resume_required, photo_required, ctc_min, ctc_max, target_fill_date, hired_at,
   created_at, created_by, updated_at)
values
  ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000001',
   'YH-2627-0101-P1', 'Sales Consultant 1',
   (select id from public.facilities where code = 'HRD-RW'),
   'awaiting_vacancy_approval', null, null, null, null, true, true, 26000, 34000,
   (current_date + 45), null, now() - interval '4 days',
   '11111111-1111-4111-8111-000000000007', now() - interval '4 days'),

  ('33333333-3333-4333-8333-000000000002', '22222222-2222-4222-8222-000000000001',
   'YH-2627-0101-P2', 'Sales Consultant 2',
   (select id from public.facilities where code = 'HRD-RW'),
   'awaiting_vacancy_approval', null, null, null, null, true, true, 26000, 34000,
   (current_date + 45), null, now() - interval '4 days',
   '11111111-1111-4111-8111-000000000007', now() - interval '4 days'),

  ('33333333-3333-4333-8333-000000000003', '22222222-2222-4222-8222-000000000002',
   'YH-2627-0102-P1', 'Service Advisor 1',
   (select id from public.facilities where code = 'SVC-RW'),
   'sourcing', null, null, null, null, true, true, 30000, 42000,
   (current_date + 21), null, now() - interval '11 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '8 days'),

  ('33333333-3333-4333-8333-000000000004', '22222222-2222-4222-8222-000000000003',
   'YH-2627-0103-P1', 'Technician 1',
   (select id from public.facilities where code = 'FRS-GD'),
   'draft', null, null, null, null, true, true, 22000, 28000,
   (current_date + 60), null, now() - interval '14 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '6 days'),

  ('33333333-3333-4333-8333-000000000005', '22222222-2222-4222-8222-000000000003',
   'YH-2627-0103-P2', 'Technician 2',
   (select id from public.facilities where code = 'FRS-GD'),
   'draft', null, null, null, null, true, true, 22000, 28000,
   (current_date + 60), null, now() - interval '14 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '6 days'),

  -- the filled one, including a hold that was resumed two days later
  ('33333333-3333-4333-8333-000000000006', '22222222-2222-4222-8222-000000000004',
   'YH-2627-0104-P1', 'Back Office Executive 1',
   (select id from public.facilities where code = 'IZL-BO'),
   'hired', null, null, null, null, true, true, 24000, 29000,
   (current_date - 12), (now() - interval '12 days'),
   now() - interval '30 days', '11111111-1111-4111-8111-000000000005',
   now() - interval '12 days'),

  ('33333333-3333-4333-8333-000000000007', '22222222-2222-4222-8222-000000000005',
   'YH-2627-0105-P1', 'Store Keeper 1',
   (select id from public.facilities where code = 'BW-SAL'),
   'position_closed', null, null, null, null, true, true, 21000, 24000,
   (current_date + 30), null, now() - interval '17 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '13 days'),

  ('33333333-3333-4333-8333-000000000008', '22222222-2222-4222-8222-000000000006',
   'YH-2627-0106-P1', 'Sales Consultant 1',
   (select id from public.facilities where code = 'WDK-SAL'),
   'position_closed', null, null, null, null, true, true, 24000, 30000,
   (current_date + 15), null, now() - interval '39 days',
   '11111111-1111-4111-8111-000000000007', now() - interval '9 days'),

  -- held, with the review already overdue
  ('33333333-3333-4333-8333-000000000009', '22222222-2222-4222-8222-000000000007',
   'YH-2627-0107-P1', 'Spare Parts Executive 1',
   (select id from public.facilities where code = 'HRD-RW'),
   'hold', 'sourcing',
   'The southern network assembly allocation was shelved for the month by the Owner. Sourcing is paused rather than stopped; the CVs already gathered are retained against the position.',
   (current_date - 16), (current_date + 7), true, true, 25000, 32000,
   (current_date + 25), null, now() - interval '26 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '16 days'),

  -- one candidate sitting on the CEO's desk
  ('33333333-3333-4333-8333-000000000010', '22222222-2222-4222-8222-000000000007',
   'YH-2627-0107-P2', 'Spare Parts Executive 2',
   (select id from public.facilities where code = 'HRD-RW'),
   'sent_for_candidate_approval', null, null, null, null, true, true, 25000, 32000,
   (current_date + 25), null, now() - interval '26 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '9 days'),

  -- approved for joining, waiting on the joining confirmation
  ('33333333-3333-4333-8333-000000000011', '22222222-2222-4222-8222-000000000007',
   'YH-2627-0107-P3', 'Spare Parts Executive 3',
   (select id from public.facilities where code = 'HRD-RW'),
   'approved_for_joining', null, null, null, null, true, true, 25000, 32000,
   (current_date + 25), null, now() - interval '26 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '3 days'),

  ('33333333-3333-4333-8333-000000000012', '22222222-2222-4222-8222-000000000009',
   'YH-2526-0088-P1', 'Sales Consultant 1',
   (select id from public.facilities where code = 'HP-SV'),
   'hired', null, null, null, null, true, true, 24000, 30000,
   date '2026-03-18', timestamp with time zone '2026-03-18 09:30:00+05:30',
   timestamp with time zone '2026-02-21 10:15:00+05:30',
   '11111111-1111-4111-8111-000000000004',
   timestamp with time zone '2026-03-18 09:30:00+05:30'),

  ('33333333-3333-4333-8333-000000000013', '22222222-2222-4222-8222-000000000010',
   'YH-2526-0091-P1', 'Store Keeper 1',
   (select id from public.facilities where code = 'ESD-GD'),
   'position_closed', null, null, null, null, true, true, 21000, 25000,
   date '2026-04-10', null,
   timestamp with time zone '2026-03-03 09:20:00+05:30',
   '11111111-1111-4111-8111-000000000007',
   timestamp with time zone '2026-03-27 16:00:00+05:30'),

  -- the draft request's own seat: create_request fans quantity into positions at
  -- once, so an unsubmitted request still shows its pipeline
  ('33333333-3333-4333-8333-000000000014', '22222222-2222-4222-8222-000000000008',
   'YH-2627-0108-P1', 'Service Advisor 1',
   (select id from public.facilities where code = 'SVC-BW'),
   'draft', null, null, null, null, true, true, null, null,
   null, null, now() - interval '2 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '2 days')
on conflict (id) do nothing;

-- ===========================================================================
-- 6. candidates
-- ===========================================================================
insert into public.candidates
  (id, position_id, full_name, email, phone, current_location, expected_ctc,
   experience_text, qualifications, notice_period_days, source, status,
   rejection_reason, submitted_for_approval_at, decision_at, approved_for_joining_at,
   actual_joining_date, created_at, created_by, updated_at)
values
  -- ready to submit except that the photograph is missing: the gate is visible
  ('44444444-4444-4444-8444-000000000001', '33333333-3333-4333-8333-000000000003',
   'Pravin Jadhav', 'pravin.jadhav@example.test', '+91 90000 00114', 'Pune, Hadapsar',
   38000,
   'Four years at a Maruti two-wheeler agency in Pune, then two years as a service advisor at a competing Honda outlet on Kathkulam road.',
   'Diploma Automobile Engineering, Pune', 30, 'Walk-in application', 'draft',
   null, null, null, null, null, now() - interval '9 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '2 days'),

  ('44444444-4444-4444-8444-000000000002', '33333333-3333-4333-8333-000000000003',
   'Kunal Bhosale', 'kunal.bhosale@example.test', '+91 90000 00227', 'Pune, Kothrud',
   35500,
   'Two and a half years handling job cards, moved to advisory work in the last year. Owns a two-wheeler, comfortable with the Honda service application.',
   'BCom, certificate in automobile service management', 45, 'Naukri inbound', 'draft',
   null, null, null, null, null, now() - interval '6 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '6 days'),

  ('44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-000000000006',
   'Reshma Pawar', 'reshma.pawar@example.test', '+91 90000 00339', 'Pune, Bhosari',
   27500,
   'Three years in a dealership back office handling billing, insurance endorsements and IRNP filing for a two-brand outlet.',
   'BCom, Tally and SAP Business One exposure', 15, 'Employee referral', 'hired',
   null, now() - interval '18 days', now() - interval '16 days',
   now() - interval '16 days', (current_date - 12), now() - interval '21 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '12 days'),

  ('44444444-4444-4444-8444-000000000004', '33333333-3333-4333-8333-000000000010',
   'Ajay More', 'ajay.more@example.test', '+91 90000 00451', 'Pune, Chakan',
   29000,
   'Two years at a parts distributor in Chakan, indenting and counter sales for two-wheeler spares. Known the Hadapsar counter from supplier visits.',
   'Diploma Mechanical', 30, 'Supplier reference', 'submitted_for_recruitment_approval',
   null, now() - interval '9 days', null, null, null, now() - interval '12 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '9 days'),

  ('44444444-4444-4444-8444-000000000005', '33333333-3333-4333-8333-000000000010',
   'Nilesh Kamble', 'nilesh.kamble@example.test', '+91 90000 00563', 'Pune, Warje',
   31000,
   'Five years in general-store inventory, no two-wheeler parts background. Strong on ERP, weak on the parts catalogue.',
   'BCom', 60, 'Job portal', 'rejected',
   'No two-wheeler parts catalogue experience and a sixty-day notice period; the counter needs someone productive within the month.',
   now() - interval '7 days', now() - interval '5 days', null, null,
   now() - interval '10 days', '11111111-1111-4111-8111-000000000004',
   now() - interval '5 days'),

  -- approved for joining and then withdrawn: the other way into an unsuccessful
  -- candidature, and the reason the Izeil desk had to be filled by someone else
  ('44444444-4444-4444-8444-000000000010', '33333333-3333-4333-8333-000000000006',
   'Sushil Langar', 'sushil.langar@example.test', '+91 90000 01012', 'Pune, Katraj',
   28500,
   'Three years in a dealership back office on billing and insurance endorsements. Cleared the desk test and was approved, then did not join on the agreed date.',
   'BCom', 30, 'Naukri inbound', 'candidature_unsuccessful',
   'Did not report on the confirmed joining date; the desk was needed the same week.',
   now() - interval '20 days', now() - interval '14 days', now() - interval '17 days',
   null, now() - interval '23 days', '11111111-1111-4111-8111-000000000004',
   now() - interval '14 days'),

  ('44444444-4444-4444-8444-000000000006', '33333333-3333-4333-8333-000000000011',
   'Vikram Santram', 'vikram.santram@example.test', '+91 90000 00675', 'Pune, Ambegaon',
   28000,
   'One and a half years on a parts counter at a Bajaj outlet in Ambegaon, shifting to Honda for the larger catalogue.',
   'HSC, diploma in supply chain (part-time)', 30, 'Walk-in application', 'approved_for_joining',
   null, now() - interval '6 days', now() - interval '3 days', now() - interval '3 days',
   null, now() - interval '8 days', '11111111-1111-4111-8111-000000000004',
   now() - interval '3 days'),

  -- returned for modification, with an authorised document exception on record
  ('44444444-4444-4444-8444-000000000009', '33333333-3333-4333-8333-000000000011',
   'Farida Shaikh', 'farida.shaikh@example.test', '+91 90000 00788', 'Pune, Kondhwa',
   26500,
   'Two years in back-office documentation at a car dealership; the parts catalogue would be new but the countersheet discipline is not.',
   'BCom', 20, 'Reference from the Izeil office', 'returned_for_modifications',
   null, now() - interval '4 days', now() - interval '2 days', null, null,
   now() - interval '5 days', '11111111-1111-4111-8111-000000000004',
   now() - interval '2 days'),

  -- parked while its position is on hold
  ('44444444-4444-4444-8444-000000000008', '33333333-3333-4333-8333-000000000009',
   'Deepa Rane', 'deepa.rane@example.test', '+91 90000 00891', 'Pune, Sinhagad Road',
   27000,
   'One year on a spare-parts helpline, took orders and checked stock availability in an ERP she still uses.',
   'HSC, diploma in business process', 30, 'Bpo lateral', 'draft',
   null, null, null, null, null, now() - interval '14 days',
   '11111111-1111-4111-8111-000000000004', now() - interval '16 days'),

  ('44444444-4444-4444-8444-000000000007', '33333333-3333-4333-8333-000000000012',
   'Mahesh Choudhary', 'mahesh.choudhary@example.test', '+91 90000 00902', 'Pune, Salunke Vihar',
   28500,
   'Three years selling two-wheelers in the same catchment; knew the counter before the expansion.',
   'HSC', 30, 'Walk-in application', 'hired',
   null, timestamp with time zone '2026-03-05 11:00:00+05:30',
   timestamp with time zone '2026-03-12 15:20:00+05:30',
   timestamp with time zone '2026-03-12 15:20:00+05:30', date '2026-03-18',
   timestamp with time zone '2026-03-02 12:00:00+05:30',
   '11111111-1111-4111-8111-000000000004',
   timestamp with time zone '2026-03-18 09:30:00+05:30')
on conflict (id) do nothing;

-- ===========================================================================
-- 7. candidate documents (metadata only - see the limitation at the top)
-- ===========================================================================
insert into public.candidate_documents
  (id, candidate_id, document_type, file_path, file_name, mime_type, file_size_bytes,
   uploaded_by, uploaded_at, verified_by, verified_at, verification_status,
   is_mandatory, is_exception, exception_reason, exception_authorized_by)
values
  ('77777777-7777-4777-8777-000000000001', '44444444-4444-4444-8444-000000000001',
   'Resume', 'demo/44444444-4444-4444-8444-000000000001/resume.pdf',
   'DEMO-pravin-jadhav-resume.pdf', 'application/pdf', 284113,
   '11111111-1111-4111-8111-000000000004', now() - interval '9 days',
   null, null, 'Not Verified', true, false, null, null),

  ('77777777-7777-4777-8777-000000000002', '44444444-4444-4444-8444-000000000002',
   'Resume', 'demo/44444444-4444-4444-8444-000000000002/resume.pdf',
   'DEMO-kunal-bhosale-resume.pdf', 'application/pdf', 196304,
   '11111111-1111-4111-8111-000000000004', now() - interval '6 days',
   null, null, 'Not Verified', true, false, null, null),

  ('77777777-7777-4777-8777-000000000003', '44444444-4444-4444-8444-000000000002',
   'Photograph', 'demo/44444444-4444-4444-8444-000000000002/photograph.jpg',
   'DEMO-kunal-bhosale-photo.jpg', 'image/jpeg', 84120,
   '11111111-1111-4111-8111-000000000004', now() - interval '6 days',
   null, null, 'Not Verified', true, false, null, null),

  ('77777777-7777-4777-8777-000000000004', '44444444-4444-4444-8444-000000000003',
   'Resume', 'demo/44444444-4444-4444-8444-000000000003/resume.pdf',
   'DEMO-reshma-pawar-resume.pdf', 'application/pdf', 240881,
   '11111111-1111-4111-8111-000000000004', now() - interval '21 days',
   '11111111-1111-4111-8111-000000000005', now() - interval '19 days', 'Verified',
   true, false, null, null),

  ('77777777-7777-4777-8777-000000000005', '44444444-4444-4444-8444-000000000003',
   'Photograph', 'demo/44444444-4444-4444-8444-000000000003/photograph.jpg',
   'DEMO-reshma-pawar-photo.jpg', 'image/jpeg', 61204,
   '11111111-1111-4111-8111-000000000004', now() - interval '21 days',
   '11111111-1111-4111-8111-000000000005', now() - interval '19 days', 'Verified',
   true, false, null, null),

  ('77777777-7777-4777-8777-000000000006', '44444444-4444-4444-8444-000000000003',
   'Education certificate', 'demo/44444444-4444-4444-8444-000000000003/education.pdf',
   'DEMO-reshma-pawar-bcom.pdf', 'application/pdf', 512004,
   '11111111-1111-4111-8111-000000000004', now() - interval '20 days',
   '11111111-1111-4111-8111-000000000005', now() - interval '14 days', 'Verified',
   false, false, null, null),

  ('77777777-7777-4777-8777-000000000007', '44444444-4444-4444-8444-000000000004',
   'Resume', 'demo/44444444-4444-4444-8444-000000000004/resume.pdf',
   'DEMO-ajay-more-resume.pdf', 'application/pdf', 218774,
   '11111111-1111-4111-8111-000000000004', now() - interval '12 days',
   null, null, 'Under Review', true, false, null, null),

  ('77777777-7777-4777-8777-000000000008', '44444444-4444-4444-8444-000000000004',
   'Photograph', 'demo/44444444-4444-4444-8444-000000000004/photograph.jpg',
   'DEMO-ajay-more-photo.jpg', 'image/jpeg', 55921,
   '11111111-1111-4111-8111-000000000004', now() - interval '12 days',
   null, null, 'Under Review', true, false, null, null),

  ('77777777-7777-4777-8777-000000000009', '44444444-4444-4444-8444-000000000005',
   'Resume', 'demo/44444444-4444-4444-8444-000000000005/resume.pdf',
   'DEMO-nilesh-kamble-resume.pdf', 'application/pdf', 301224,
   '11111111-1111-4111-8111-000000000004', now() - interval '10 days',
   null, null, 'Not Verified', true, false, null, null),

  ('77777777-7777-4777-8777-000000000010', '44444444-4444-4444-8444-000000000005',
   'Photograph', 'demo/44444444-4444-4444-8444-000000000005/photograph.jpg',
   'DEMO-nilesh-kamble-photo.jpg', 'image/jpeg', 48330,
   '11111111-1111-4111-8111-000000000004', now() - interval '10 days',
   null, null, 'Not Verified', true, false, null, null),

  ('77777777-7777-4777-8777-000000000011', '44444444-4444-4444-8444-000000000006',
   'Resume', 'demo/44444444-4444-4444-8444-000000000006/resume.pdf',
   'DEMO-vikram-santram-resume.pdf', 'application/pdf', 175400,
   '11111111-1111-4111-8111-000000000004', now() - interval '8 days',
   '11111111-1111-4111-8111-000000000005', now() - interval '4 days', 'Verified',
   true, false, null, null),

  ('77777777-7777-4777-8777-000000000012', '44444444-4444-4444-8444-000000000006',
   'Photograph', 'demo/44444444-4444-4444-8444-000000000006/photograph.jpg',
   'DEMO-vikram-santram-photo.jpg', 'image/jpeg', 52118,
   '11111111-1111-4111-8111-000000000004', now() - interval '8 days',
   '11111111-1111-4111-8111-000000000005', now() - interval '4 days', 'Verified',
   true, false, null, null),

  -- Farida was allowed through the photograph gate on an authorised exception;
  -- the exception itself lives in the audit register, as a decision with a
  -- reason and a name behind it.
  ('77777777-7777-4777-8777-000000000013', '44444444-4444-4444-8444-000000000009',
   'Resume', 'demo/44444444-4444-4444-8444-000000000009/resume.pdf',
   'DEMO-farida-shaikh-resume.pdf', 'application/pdf', 209113,
   '11111111-1111-4111-8111-000000000004', now() - interval '5 days',
   null, null, 'Not Verified', true, false, null, null),

  ('77777777-7777-4777-8777-000000000014', '44444444-4444-4444-8444-000000000008',
   'Resume', 'demo/44444444-4444-4444-8444-000000000008/resume.pdf',
   'DEMO-deepa-rane-resume.pdf', 'application/pdf', 188240,
   '11111111-1111-4111-8111-000000000004', now() - interval '14 days',
   null, null, 'Not Verified', true, false, null, null),

  ('77777777-7777-4777-8777-000000000015', '44444444-4444-4444-8444-000000000007',
   'Resume', 'demo/44444444-4444-4444-8444-000000000007/resume.pdf',
   'DEMO-mahesh-choudhary-resume.pdf', 'application/pdf', 226100,
   '11111111-1111-4111-8111-000000000004',
   timestamp with time zone '2026-03-02 12:30:00+05:30',
   '11111111-1111-4111-8111-000000000005',
   timestamp with time zone '2026-03-10 10:00:00+05:30', 'Verified',
   true, false, null, null),

  ('77777777-7777-4777-8777-000000000016', '44444444-4444-4444-8444-000000000007',
   'Photograph', 'demo/44444444-4444-4444-8444-000000000007/photograph.jpg',
   'DEMO-mahesh-choudhary-photo.jpg', 'image/jpeg', 44120,
   '11111111-1111-4111-8111-000000000004',
   timestamp with time zone '2026-03-02 12:32:00+05:30',
   '11111111-1111-4111-8111-000000000005',
   timestamp with time zone '2026-03-10 10:00:00+05:30', 'Verified',
   true, false, null, null),

  ('77777777-7777-4777-8777-000000000017', '44444444-4444-4444-8444-000000000010',
   'Resume', 'demo/44444444-4444-4444-8444-000000000010/resume.pdf',
   'DEMO-sushil-langar-resume.pdf', 'application/pdf', 231908,
   '11111111-1111-4111-8111-000000000004', now() - interval '23 days',
   '11111111-1111-4111-8111-000000000005', now() - interval '21 days', 'Verified',
   true, false, null, null),

  ('77777777-7777-4777-8777-000000000018', '44444444-4444-4444-8444-000000000010',
   'Photograph', 'demo/44444444-4444-4444-8444-000000000010/photograph.jpg',
   'DEMO-sushil-langar-photo.jpg', 'image/jpeg', 50318,
   '11111111-1111-4111-8111-000000000004', now() - interval '23 days',
   '11111111-1111-4111-8111-000000000005', now() - interval '21 days', 'Verified',
   true, false, null, null)
on conflict (id) do nothing;

-- ===========================================================================
-- 8. status history - what the timeline on a request is actually built from
-- ===========================================================================
-- The transition functions write these rows in normal operation. Here they are
-- authored, so that the history carries the dates the record is supposed to have
-- rather than the moment the seed happened to run.
insert into public.vacancy_request_status_history
  (request_id, from_status, to_status, changed_by, reason, changed_at)
values
  ('22222222-2222-4222-8222-000000000001', 'draft', 'submitted_for_vacancy_approval',
   '11111111-1111-4111-8111-000000000007', null, now() - interval '4 days'),

  ('22222222-2222-4222-8222-000000000002', 'draft', 'submitted_for_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '11 days'),
  ('22222222-2222-4222-8222-000000000002', 'submitted_for_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000002',
   'Funded from the service headcount line.', now() - interval '8 days'),

  ('22222222-2222-4222-8222-000000000003', 'draft', 'submitted_for_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '14 days'),
  ('22222222-2222-4222-8222-000000000003', 'submitted_for_vacancy_approval', 'returned_for_information',
   '11111111-1111-4111-8111-000000000002',
   'Confirm the Fursungi budget line before this reaches the Owner desk.', now() - interval '6 days'),

  ('22222222-2222-4222-8222-000000000004', 'draft', 'submitted_for_vacancy_approval',
   '11111111-1111-4111-8111-000000000005', null, now() - interval '30 days'),
  ('22222222-2222-4222-8222-000000000004', 'submitted_for_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000002', null, now() - interval '27 days'),

  ('22222222-2222-4222-8222-000000000005', 'draft', 'submitted_for_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '17 days'),
  ('22222222-2222-4222-8222-000000000005', 'submitted_for_vacancy_approval', 'rejected',
   '11111111-1111-4111-8111-000000000002',
   'Budget withdrawn for FY27 warehouse consolidation.', now() - interval '13 days'),

  ('22222222-2222-4222-8222-000000000006', 'draft', 'submitted_for_vacancy_approval',
   '11111111-1111-4111-8111-000000000007', null, now() - interval '39 days'),
  ('22222222-2222-4222-8222-000000000006', 'submitted_for_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000003', null, now() - interval '35 days'),
  ('22222222-2222-4222-8222-000000000006', 'approved', 'closed',
   '11111111-1111-4111-8111-000000000002', 'Role made redundant', now() - interval '9 days'),

  ('22222222-2222-4222-8222-000000000007', 'draft', 'submitted_for_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '26 days'),
  ('22222222-2222-4222-8222-000000000007', 'submitted_for_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000002', null, now() - interval '24 days'),

  ('22222222-2222-4222-8222-000000000009', 'draft', 'submitted_for_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, timestamp with time zone '2026-02-21 10:15:00+05:30'),
  ('22222222-2222-4222-8222-000000000009', 'submitted_for_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000002', null, timestamp with time zone '2026-02-27 12:05:00+05:30'),

  ('22222222-2222-4222-8222-000000000010', 'draft', 'submitted_for_vacancy_approval',
   '11111111-1111-4111-8111-000000000007', null, timestamp with time zone '2026-03-03 09:20:00+05:30'),
  ('22222222-2222-4222-8222-000000000010', 'submitted_for_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000003', null, timestamp with time zone '2026-03-06 11:30:00+05:30'),
  ('22222222-2222-4222-8222-000000000010', 'approved', 'closed',
   '11111111-1111-4111-8111-000000000002', 'Duplicate position',
   timestamp with time zone '2026-03-27 16:00:00+05:30');

insert into public.position_status_history
  (position_id, from_status, to_status, changed_by, reason, changed_at)
values
  ('33333333-3333-4333-8333-000000000001', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000007', null, now() - interval '4 days'),
  ('33333333-3333-4333-8333-000000000002', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000007', null, now() - interval '4 days'),

  ('33333333-3333-4333-8333-000000000003', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '11 days'),
  ('33333333-3333-4333-8333-000000000003', 'awaiting_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000002', null, now() - interval '8 days'),
  ('33333333-3333-4333-8333-000000000003', 'approved', 'sourcing',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '8 days'),

  ('33333333-3333-4333-8333-000000000004', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '14 days'),
  ('33333333-3333-4333-8333-000000000004', 'awaiting_vacancy_approval', 'draft',
   '11111111-1111-4111-8111-000000000002', 'Parent request returned for information',
   now() - interval '6 days'),
  ('33333333-3333-4333-8333-000000000005', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '14 days'),
  ('33333333-3333-4333-8333-000000000005', 'awaiting_vacancy_approval', 'draft',
   '11111111-1111-4111-8111-000000000002', 'Parent request returned for information',
   now() - interval '6 days'),

  -- a full chain, ending in a person who joined
  ('33333333-3333-4333-8333-000000000006', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000005', null, now() - interval '30 days'),
  ('33333333-3333-4333-8333-000000000006', 'awaiting_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000002', null, now() - interval '27 days'),
  ('33333333-3333-4333-8333-000000000006', 'approved', 'hold',
   '11111111-1111-4111-8111-000000000004',
   'Paused pending confirmation of how the IRNP workload splits between the two desks.',
   now() - interval '26 days'),
  ('33333333-3333-4333-8333-000000000006', 'hold', 'approved',
   '11111111-1111-4111-8111-000000000005', 'Workload split confirmed with the HR Head.',
   now() - interval '25 days'),
  ('33333333-3333-4333-8333-000000000006', 'approved', 'sourcing',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '24 days'),
  ('33333333-3333-4333-8333-000000000006', 'sourcing', 'candidate_available',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '21 days'),
  ('33333333-3333-4333-8333-000000000006', 'candidate_available', 'sent_for_candidate_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '18 days'),
  ('33333333-3333-4333-8333-000000000006', 'sent_for_candidate_approval', 'approved_for_joining',
   '11111111-1111-4111-8111-000000000003', null, now() - interval '16 days'),
  ('33333333-3333-4333-8333-000000000006', 'approved_for_joining', 'hired',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '12 days'),

  ('33333333-3333-4333-8333-000000000007', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '17 days'),
  ('33333333-3333-4333-8333-000000000007', 'awaiting_vacancy_approval', 'position_closed',
   '11111111-1111-4111-8111-000000000002', 'Parent request rejected', now() - interval '13 days'),

  ('33333333-3333-4333-8333-000000000008', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000007', null, now() - interval '39 days'),
  ('33333333-3333-4333-8333-000000000008', 'awaiting_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000003', null, now() - interval '35 days'),
  ('33333333-3333-4333-8333-000000000008', 'approved', 'position_closed',
   '11111111-1111-4111-8111-000000000002', 'Role made redundant', now() - interval '9 days'),

  ('33333333-3333-4333-8333-000000000009', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '26 days'),
  ('33333333-3333-4333-8333-000000000009', 'awaiting_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000002', null, now() - interval '24 days'),
  ('33333333-3333-4333-8333-000000000009', 'approved', 'sourcing',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '23 days'),
  ('33333333-3333-4333-8333-000000000009', 'sourcing', 'hold',
   '11111111-1111-4111-8111-000000000004',
   'The southern network assembly allocation was shelved for the month by the Owner.',
   now() - interval '16 days'),

  ('33333333-3333-4333-8333-000000000010', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '26 days'),
  ('33333333-3333-4333-8333-000000000010', 'awaiting_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000002', null, now() - interval '24 days'),
  ('33333333-3333-4333-8333-000000000010', 'approved', 'sourcing',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '22 days'),
  ('33333333-3333-4333-8333-000000000010', 'sourcing', 'candidate_available',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '12 days'),
  ('33333333-3333-4333-8333-000000000010', 'candidate_available', 'sent_for_candidate_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '9 days'),

  ('33333333-3333-4333-8333-000000000011', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '26 days'),
  ('33333333-3333-4333-8333-000000000011', 'awaiting_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000002', null, now() - interval '24 days'),
  ('33333333-3333-4333-8333-000000000011', 'approved', 'sourcing',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '22 days'),
  ('33333333-3333-4333-8333-000000000011', 'sourcing', 'candidate_available',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '8 days'),
  ('33333333-3333-4333-8333-000000000011', 'candidate_available', 'sent_for_candidate_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '6 days'),
  ('33333333-3333-4333-8333-000000000011', 'sent_for_candidate_approval', 'approved_for_joining',
   '11111111-1111-4111-8111-000000000003', null, now() - interval '3 days'),

  ('33333333-3333-4333-8333-000000000012', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000004', null, timestamp with time zone '2026-02-21 10:15:00+05:30'),
  ('33333333-3333-4333-8333-000000000012', 'awaiting_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000002', null, timestamp with time zone '2026-02-27 12:05:00+05:30'),
  ('33333333-3333-4333-8333-000000000012', 'approved', 'sourcing',
   '11111111-1111-4111-8111-000000000004', null, timestamp with time zone '2026-02-28 09:40:00+05:30'),
  ('33333333-3333-4333-8333-000000000012', 'sourcing', 'candidate_available',
   '11111111-1111-4111-8111-000000000004', null, timestamp with time zone '2026-03-02 12:10:00+05:30'),
  ('33333333-3333-4333-8333-000000000012', 'candidate_available', 'sent_for_candidate_approval',
   '11111111-1111-4111-8111-000000000004', null, timestamp with time zone '2026-03-05 11:00:00+05:30'),
  ('33333333-3333-4333-8333-000000000012', 'sent_for_candidate_approval', 'approved_for_joining',
   '11111111-1111-4111-8111-000000000003', null, timestamp with time zone '2026-03-12 15:20:00+05:30'),
  ('33333333-3333-4333-8333-000000000012', 'approved_for_joining', 'hired',
   '11111111-1111-4111-8111-000000000004', null, timestamp with time zone '2026-03-18 09:30:00+05:30'),

  ('33333333-3333-4333-8333-000000000013', 'draft', 'awaiting_vacancy_approval',
   '11111111-1111-4111-8111-000000000007', null, timestamp with time zone '2026-03-03 09:20:00+05:30'),
  ('33333333-3333-4333-8333-000000000013', 'awaiting_vacancy_approval', 'approved',
   '11111111-1111-4111-8111-000000000003', null, timestamp with time zone '2026-03-06 11:30:00+05:30'),
  ('33333333-3333-4333-8333-000000000013', 'approved', 'position_closed',
   '11111111-1111-4111-8111-000000000002', 'Duplicate position',
   timestamp with time zone '2026-03-27 16:00:00+05:30');

insert into public.candidate_status_history
  (candidate_id, from_status, to_status, changed_by, reason, changed_at)
values
  ('44444444-4444-4444-8444-000000000003', 'draft', 'submitted_for_recruitment_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '18 days'),
  ('44444444-4444-4444-8444-000000000003', 'submitted_for_recruitment_approval', 'approved_for_joining',
   '11111111-1111-4111-8111-000000000003', null, now() - interval '16 days'),
  ('44444444-4444-4444-8444-000000000003', 'approved_for_joining', 'hired',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '12 days'),

  ('44444444-4444-4444-8444-000000000004', 'draft', 'submitted_for_recruitment_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '9 days'),

  ('44444444-4444-4444-8444-000000000005', 'draft', 'submitted_for_recruitment_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '7 days'),
  ('44444444-4444-4444-8444-000000000005', 'submitted_for_recruitment_approval', 'rejected',
   '11111111-1111-4111-8111-000000000003',
   'No two-wheeler parts catalogue experience and a sixty-day notice period.',
   now() - interval '5 days'),

  ('44444444-4444-4444-8444-000000000010', 'draft', 'submitted_for_recruitment_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '20 days'),
  ('44444444-4444-4444-8444-000000000010', 'submitted_for_recruitment_approval', 'approved_for_joining',
   '11111111-1111-4111-8111-000000000003', null, now() - interval '17 days'),
  ('44444444-4444-4444-8444-000000000010', 'approved_for_joining', 'candidature_unsuccessful',
   '11111111-1111-4111-8111-000000000003',
   'Did not report on the confirmed joining date; the desk was needed the same week.',
   now() - interval '14 days'),

  ('44444444-4444-4444-8444-000000000006', 'draft', 'submitted_for_recruitment_approval',
   '11111111-1111-4111-8111-000000000004', null, now() - interval '6 days'),
  ('44444444-4444-4444-8444-000000000006', 'submitted_for_recruitment_approval', 'approved_for_joining',
   '11111111-1111-4111-8111-000000000003', null, now() - interval '3 days'),

  ('44444444-4444-4444-8444-000000000009', 'draft', 'submitted_for_recruitment_approval',
   '11111111-1111-4111-8111-000000000004',
   'Photograph outstanding; released under an authorised document exception.',
   now() - interval '4 days'),
  ('44444444-4444-4444-8444-000000000009', 'submitted_for_recruitment_approval', 'returned_for_modifications',
   '11111111-1111-4111-8111-000000000003',
   'The file supplied as a photograph is a scanned identity document. Re-share the photograph.',
   now() - interval '2 days'),

  ('44444444-4444-4444-8444-000000000007', 'draft', 'submitted_for_recruitment_approval',
   '11111111-1111-4111-8111-000000000004', null, timestamp with time zone '2026-03-05 11:00:00+05:30'),
  ('44444444-4444-4444-8444-000000000007', 'submitted_for_recruitment_approval', 'approved_for_joining',
   '11111111-1111-4111-8111-000000000003', null, timestamp with time zone '2026-03-12 15:20:00+05:30'),
  ('44444444-4444-4444-8444-000000000007', 'approved_for_joining', 'hired',
   '11111111-1111-4111-8111-000000000004', null, timestamp with time zone '2026-03-18 09:30:00+05:30');

-- ===========================================================================
-- 9. approval tasks - the queue that My Actions reads
-- ===========================================================================
insert into public.approval_tasks
  (id, entity_type, entity_id, position_id, task_type, assigned_role, assigned_user_id,
   requested_by, status, priority, sla_hours, due_at, acted_at, acted_by, action,
   comment, created_at)
values
  -- pending, and already past its due date: the overdue case on the dashboard
  ('55555555-5555-4555-8555-000000000001', 'vacancy_request',
   '22222222-2222-4222-8222-000000000001', null, 'vacancy_approval', 'Owner', null,
   '11111111-1111-4111-8111-000000000007', 'pending', 'high', 72,
   now() - interval '4 days' + interval '72 hours', null, null, null, null,
   now() - interval '4 days'),

  -- hold review, overdue: the /on-hold screen has something to chase
  ('55555555-5555-4555-8555-000000000002', 'position',
   '33333333-3333-4333-8333-000000000009', '33333333-3333-4333-8333-000000000009',
   'hold_review', 'HrHead', null, '11111111-1111-4111-8111-000000000004', 'pending',
   'normal', 168, now() - interval '2 days', null, null, null, null,
   now() - interval '16 days'),

  -- a candidate waiting on the CEO for nine days, well past a 48-hour SLA
  ('55555555-5555-4555-8555-000000000003', 'candidate',
   '44444444-4444-4444-8444-000000000004', '33333333-3333-4333-8333-000000000010',
   'candidate_approval', 'CEO', null, '11111111-1111-4111-8111-000000000004', 'pending',
   'normal', 48, now() - interval '7 days', null, null, null, null, now() - interval '9 days'),

  -- inside its window, so the wait tone rather than the risk tone shows
  ('55555555-5555-4555-8555-000000000004', 'candidate',
   '44444444-4444-4444-8444-000000000006', '33333333-3333-4333-8333-000000000011',
   'joining_confirmation', 'HR', null, '11111111-1111-4111-8111-000000000003', 'pending',
   'normal', 72, now() + interval '20 hours', null, null, null, null, now() - interval '3 days'),

  -- a clarification addressed to a named person rather than a role
  ('55555555-5555-4555-8555-000000000005', 'vacancy_request',
   '22222222-2222-4222-8222-000000000003', null, 'clarification', null,
   '11111111-1111-4111-8111-000000000004', '11111111-1111-4111-8111-000000000002',
   'pending', 'urgent', 48, now() - interval '12 hours', null, null, null, null,
   now() - interval '6 days'),

  -- the decided ones, so the history of a decision is visible
  ('55555555-5555-4555-8555-000000000006', 'vacancy_request',
   '22222222-2222-4222-8222-000000000002', null, 'vacancy_approval', 'Owner', null,
   '11111111-1111-4111-8111-000000000004', 'acted', 'high', 72,
   now() - interval '8 days', now() - interval '8 days',
   '11111111-1111-4111-8111-000000000002', 'approved',
   'Funded from the service headcount line. Keep the CTC inside 42,000.',
   now() - interval '11 days'),

  ('55555555-5555-4555-8555-000000000007', 'vacancy_request',
   '22222222-2222-4222-8222-000000000003', null, 'vacancy_approval', 'Owner', null,
   '11111111-1111-4111-8111-000000000004', 'acted', 'normal', 72,
   now() - interval '11 days', now() - interval '6 days',
   '11111111-1111-4111-8111-000000000002', 'returned_for_information',
   'Confirm the Fursungi budget line before this reaches the Owner desk.',
   now() - interval '14 days'),

  ('55555555-5555-4555-8555-000000000008', 'vacancy_request',
   '22222222-2222-4222-8222-000000000004', null, 'vacancy_approval', 'Owner', null,
   '11111111-1111-4111-8111-000000000005', 'acted', 'normal', 72,
   now() - interval '28 days', now() - interval '27 days',
   '11111111-1111-4111-8111-000000000002', 'approved', null, now() - interval '30 days'),

  ('55555555-5555-4555-8555-000000000009', 'vacancy_request',
   '22222222-2222-4222-8222-000000000005', null, 'vacancy_approval', 'Owner', null,
   '11111111-1111-4111-8111-000000000004', 'acted', 'normal', 72,
   now() - interval '14 days', now() - interval '13 days',
   '11111111-1111-4111-8111-000000000002', 'rejected',
   'Budget withdrawn for FY27 warehouse consolidation.', now() - interval '17 days'),

  ('55555555-5555-4555-8555-000000000010', 'candidate',
   '44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-000000000006',
   'candidate_approval', 'CEO', null, '11111111-1111-4111-8111-000000000004', 'acted',
   'normal', 48, now() - interval '17 days', now() - interval '16 days',
   '11111111-1111-4111-8111-000000000003', 'approved',
   'Documentation experience is the point of this role. Good fit.', now() - interval '18 days'),

  ('55555555-5555-4555-8555-000000000011', 'candidate',
   '44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-000000000006',
   'joining_confirmation', 'HR', null, '11111111-1111-4111-8111-000000000003', 'acted',
   'normal', 72, now() - interval '13 days', now() - interval '12 days',
   '11111111-1111-4111-8111-000000000004', 'approved',
   'Joined 12 days ago; onboarding pack issued.', now() - interval '16 days'),

  ('55555555-5555-4555-8555-000000000012', 'candidate',
   '44444444-4444-4444-8444-000000000005', '33333333-3333-4333-8333-000000000010',
   'candidate_approval', 'CEO', null, '11111111-1111-4111-8111-000000000004', 'acted',
   'normal', 48, now() - interval '5 days', now() - interval '5 days',
   '11111111-1111-4111-8111-000000000003', 'rejected',
   'No two-wheeler parts catalogue experience and a sixty-day notice period.',
   now() - interval '7 days'),

  ('55555555-5555-4555-8555-000000000013', 'candidate',
   '44444444-4444-4444-8444-000000000006', '33333333-3333-4333-8333-000000000011',
   'candidate_approval', 'CEO', null, '11111111-1111-4111-8111-000000000004', 'acted',
   'normal', 48, now() - interval '4 days', now() - interval '3 days',
   '11111111-1111-4111-8111-000000000003', 'approved',
   'Counter manner is right for Hadapsar. Confirm the joining date with HR.',
   now() - interval '6 days'),

  ('55555555-5555-4555-8555-000000000014', 'candidate',
   '44444444-4444-4444-8444-000000000009', '33333333-3333-4333-8333-000000000011',
   'candidate_approval', 'CEO', null, '11111111-1111-4111-8111-000000000004', 'acted',
   'normal', 48, now() - interval '3 days', now() - interval '2 days',
   '11111111-1111-4111-8111-000000000003', 'returned_for_information',
   'The file supplied as a photograph is a scanned identity document.',
   now() - interval '4 days'),

  ('55555555-5555-4555-8555-000000000015', 'vacancy_request',
   '22222222-2222-4222-8222-000000000006', null, 'vacancy_approval', 'CEO', null,
   '11111111-1111-4111-8111-000000000007', 'acted', 'normal', 72,
   now() - interval '36 days', now() - interval '35 days',
   '11111111-1111-4111-8111-000000000003', 'approved', null, now() - interval '39 days'),

  ('55555555-5555-4555-8555-000000000016', 'vacancy_request',
   '22222222-2222-4222-8222-000000000007', null, 'vacancy_approval', 'Owner', null,
   '11111111-1111-4111-8111-000000000004', 'acted', 'normal', 72,
   now() - interval '25 days', now() - interval '24 days',
   '11111111-1111-4111-8111-000000000002', 'approved',
   'Three counters, staged over the quarter.', now() - interval '26 days'),

  -- cancelled when its parent request closed, so the queue is not left lying
  ('55555555-5555-4555-8555-000000000017', 'position',
   '33333333-3333-4333-8333-000000000008', '33333333-3333-4333-8333-000000000008',
   'candidate_approval', 'CEO', null, '11111111-1111-4111-8111-000000000004',
   'cancelled', 'normal', 48, null, now() - interval '9 days',
   '11111111-1111-4111-8111-000000000002', 'cancelled',
   'Parent request closed: role made redundant.', now() - interval '12 days'),

  ('55555555-5555-4555-8555-000000000018', 'vacancy_request',
   '22222222-2222-4222-8222-000000000009', null, 'vacancy_approval', 'Owner', null,
   '11111111-1111-4111-8111-000000000004', 'acted', 'normal', 72,
   timestamp with time zone '2026-02-24 10:15:00+05:30',
   timestamp with time zone '2026-02-27 12:05:00+05:30',
   '11111111-1111-4111-8111-000000000002', 'approved', null,
   timestamp with time zone '2026-02-21 10:15:00+05:30'),

  ('55555555-5555-4555-8555-000000000019', 'candidate',
   '44444444-4444-4444-8444-000000000007', '33333333-3333-4333-8333-000000000012',
   'candidate_approval', 'CEO', null, '11111111-1111-4111-8111-000000000004', 'acted',
   'normal', 48, timestamp with time zone '2026-03-08 16:00:00+05:30',
   timestamp with time zone '2026-03-12 15:20:00+05:30',
   '11111111-1111-4111-8111-000000000003', 'approved',
   'Already known to the counter.', timestamp with time zone '2026-03-05 11:00:00+05:30'),

  ('55555555-5555-4555-8555-000000000020', 'vacancy_request',
   '22222222-2222-4222-8222-000000000010', null, 'vacancy_approval', 'CEO', null,
   '11111111-1111-4111-8111-000000000007', 'acted', 'normal', 72,
   timestamp with time zone '2026-03-05 09:20:00+05:30',
   timestamp with time zone '2026-03-06 11:30:00+05:30',
   '11111111-1111-4111-8111-000000000003', 'approved', null,
   timestamp with time zone '2026-03-03 09:20:00+05:30'),

  -- the two decisions that took Sushil Langar from CV to a withdrawn offer
  ('55555555-5555-4555-8555-000000000021', 'candidate',
   '44444444-4444-4444-8444-000000000010', '33333333-3333-4333-8333-000000000006',
   'candidate_approval', 'CEO', null, '11111111-1111-4111-8111-000000000004', 'acted',
   'normal', 48, now() - interval '18 days', now() - interval '17 days',
   '11111111-1111-4111-8111-000000000003', 'approved',
   'The billing work was clean. Offer the desk.', now() - interval '20 days'),

  ('55555555-5555-4555-8555-000000000022', 'candidate',
   '44444444-4444-4444-8444-000000000010', '33333333-3333-4333-8333-000000000006',
   'joining_confirmation', 'CEO', null, '11111111-1111-4111-8111-000000000003', 'acted',
   'high', 72, now() - interval '15 days', now() - interval '14 days',
   '11111111-1111-4111-8111-000000000003', 'rejected',
   'No show on the confirmed date and no reply on the phone given to us.',
   now() - interval '17 days')
on conflict (id) do nothing;

-- The decision record behind each acted task.
insert into public.approval_logs
  (task_id, entity_type, entity_id, actor_id, action, reason, created_at)
values
  ('55555555-5555-4555-8555-000000000006', 'vacancy_request',
   '22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000002',
   'approved', null, now() - interval '8 days'),
  ('55555555-5555-4555-8555-000000000007', 'vacancy_request',
   '22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000002',
   'returned_for_information', 'Confirm the Fursungi budget line.', now() - interval '6 days'),
  ('55555555-5555-4555-8555-000000000008', 'vacancy_request',
   '22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-000000000002',
   'approved', null, now() - interval '27 days'),
  ('55555555-5555-4555-8555-000000000009', 'vacancy_request',
   '22222222-2222-4222-8222-000000000005', '11111111-1111-4111-8111-000000000002',
   'rejected', 'Budget withdrawn for FY27 warehouse consolidation.', now() - interval '13 days'),
  ('55555555-5555-4555-8555-000000000010', 'candidate',
   '44444444-4444-4444-8444-000000000003', '11111111-1111-4111-8111-000000000003',
   'approved_for_joining', null, now() - interval '16 days'),
  ('55555555-5555-4555-8555-000000000011', 'candidate',
   '44444444-4444-4444-8444-000000000003', '11111111-1111-4111-8111-000000000004',
   'confirmed_joining', null, now() - interval '12 days'),
  ('55555555-5555-4555-8555-000000000012', 'candidate',
   '44444444-4444-4444-8444-000000000005', '11111111-1111-4111-8111-000000000003',
   'rejected', 'Notice period of sixty days against a requirement for the month.',
   now() - interval '5 days'),
  ('55555555-5555-4555-8555-000000000013', 'candidate',
   '44444444-4444-4444-8444-000000000006', '11111111-1111-4111-8111-000000000003',
   'approved_for_joining', null, now() - interval '3 days'),
  ('55555555-5555-4555-8555-000000000014', 'candidate',
   '44444444-4444-4444-8444-000000000009', '11111111-1111-4111-8111-000000000003',
   'return_for_modifications', 'Photograph file is a scanned identity document.',
   now() - interval '2 days'),
  ('55555555-5555-4555-8555-000000000015', 'vacancy_request',
   '22222222-2222-4222-8222-000000000006', '11111111-1111-4111-8111-000000000003',
   'approved', null, now() - interval '35 days'),
  ('55555555-5555-4555-8555-000000000016', 'vacancy_request',
   '22222222-2222-4222-8222-000000000007', '11111111-1111-4111-8111-000000000002',
   'approved', null, now() - interval '24 days'),
  ('55555555-5555-4555-8555-000000000019', 'candidate',
   '44444444-4444-4444-8444-000000000007', '11111111-1111-4111-8111-000000000003',
   'approved_for_joining', null, timestamp with time zone '2026-03-12 15:20:00+05:30'),
  ('55555555-5555-4555-8555-000000000020', 'vacancy_request',
   '22222222-2222-4222-8222-000000000010', '11111111-1111-4111-8111-000000000003',
   'approved', null, timestamp with time zone '2026-03-06 11:30:00+05:30'),
  ('55555555-5555-4555-8555-000000000021', 'candidate',
   '44444444-4444-4444-8444-000000000010', '11111111-1111-4111-8111-000000000003',
   'approved_for_joining', null, now() - interval '17 days'),
  ('55555555-5555-4555-8555-000000000022', 'candidate',
   '44444444-4444-4444-8444-000000000010', '11111111-1111-4111-8111-000000000003',
   'rejected', 'Did not report on the confirmed joining date.', now() - interval '14 days');

-- ===========================================================================
-- 10. comments
-- ===========================================================================
insert into public.comments (id, entity_type, entity_id, body, author_id, created_at)
values
  ('66666666-6666-4666-8666-000000000001', 'vacancy_request',
   '22222222-2222-4222-8222-000000000001',
   'Both desks are needed before the Diwali delivery peak. I can carry one consultant from the counter for two more weekends, not four.',
   '11111111-1111-4111-8111-000000000007', now() - interval '3 days'),
  ('66666666-6666-4666-8666-000000000002', 'vacancy_request',
   '22222222-2222-4222-8222-000000000001',
   'Is the second desk funded from the FY27 expansion line or from the showroom operating budget? The answer decides the CTC ceiling.',
   '11111111-1111-4111-8111-000000000002', now() - interval '2 days'),
  ('66666666-6666-4666-8666-000000000003', 'vacancy_request',
   '22222222-2222-4222-8222-000000000003',
   'Budget confirmation requested from Finance; the store head has approved the requirement verbally.',
   '11111111-1111-4111-8111-000000000004', now() - interval '5 days'),
  ('66666666-6666-4666-8666-000000000004', 'vacancy_request',
   '22222222-2222-4222-8222-000000000002',
   'Shortlisting from the walk-in register now. Two CVs on file, neither has joined a competitor in the last year.',
   '11111111-1111-4111-8111-000000000004', now() - interval '7 days'),
  ('66666666-6666-4666-8666-000000000005', 'position',
   '33333333-3333-4333-8333-000000000009',
   'Owner has shelved the southern assembly allocation for the month. Holding the position rather than closing it, so the two CVs already gathered stay against it.',
   '11111111-1111-4111-8111-000000000004', now() - interval '16 days'),
  ('66666666-6666-4666-8666-000000000006', 'candidate',
   '44444444-4444-4444-8444-000000000004',
   'Ran the workshop floor test with the counter. Comfortable on the indent screen, honest about the catalogue he has not met.',
   '11111111-1111-4111-8111-000000000004', now() - interval '9 days'),
  ('66666666-6666-4666-8666-000000000007', 'candidate',
   '44444444-4444-4444-8444-000000000009',
   'Photograph to be re-shared. The file supplied was a scanned identity document, which must not be kept against a candidate.',
   '11111111-1111-4111-8111-000000000005', now() - interval '2 days'),
  ('66666666-6666-4666-8666-000000000008', 'candidate',
   '44444444-4444-4444-8444-000000000003',
   'Joined and already handling the IRNP filings for three facilities. Handover with the retiring incumbent went cleanly.',
   '11111111-1111-4111-8111-000000000005', now() - interval '10 days')
on conflict (id) do nothing;

-- ===========================================================================
-- 11. in-app notifications
-- ===========================================================================
insert into public.notification_outbox
  (id, recipient_id, entity_type, entity_id, title, body, link, severity, read_at, created_at)
values
  ('99999999-9999-4999-8999-000000000001', '11111111-1111-4111-8111-000000000002',
   'vacancy_request', '22222222-2222-4222-8222-000000000001',
   'YH-2627-0101 is past its approval window',
   'Two sales consultant positions from Hadapsar RedWing have been waiting four days. The SLA was 72 hours.',
   '/requests/22222222-2222-4222-8222-000000000001', 'risk', null, now() - interval '2 days'),
  ('99999999-9999-4999-8999-000000000002', '11111111-1111-4111-8111-000000000003',
   'candidate', '44444444-4444-4444-8444-000000000004',
   'One candidate has waited nine days for a decision',
   'Sent for candidate approval on YH-2627-0107-P2. The candidate has asked HR twice.',
   '/requests/22222222-2222-4222-8222-000000000007', 'risk', null, now() - interval '1 day'),
  ('99999999-9999-4999-8999-000000000003', '11111111-1111-4111-8111-000000000004',
   'vacancy_request', '22222222-2222-4222-8222-000000000003',
   'YH-2627-0103 returned for information',
   'The Owner asked for the Fursungi budget line to be confirmed before it is approved.',
   '/requests/22222222-2222-4222-8222-000000000003', 'warn', null, now() - interval '6 days'),
  ('99999999-9999-4999-8999-000000000004', '11111111-1111-4111-8111-000000000005',
   'position', '33333333-3333-4333-8333-000000000009',
   'Hold review overdue on YH-2627-0107-P1',
   'Spare parts executive 1 has been on hold sixteen days. The expected resume date is next week.',
   '/on-hold', 'warn', null, now() - interval '2 days'),
  ('99999999-9999-4999-8999-000000000005', '11111111-1111-4111-8111-000000000004',
   'candidate', '44444444-4444-4444-8444-000000000009',
   'Candidate returned for modifications',
   'Farida Shaikh was sent back by the CEO: the photograph on file is a scanned identity document.',
   '/requests/22222222-2222-4222-8222-000000000007', 'info', null, now() - interval '2 days'),
  ('99999999-9999-4999-8999-000000000006', '11111111-1111-4111-8111-000000000007',
   'vacancy_request', '22222222-2222-4222-8222-000000000001',
   'Your request is with the Owner',
   'YH-2627-0101 is awaiting vacancy approval. Two positions move forward with it.',
   '/requests/22222222-2222-4222-8222-000000000001', 'info',
   now() - interval '3 days', now() - interval '4 days'),
  ('99999999-9999-4999-8999-000000000007', '11111111-1111-4111-8111-000000000004',
   'vacancy_request', '22222222-2222-4222-8222-000000000002',
   'YH-2627-0102 approved - sourcing can start',
   'One service advisor position released to sourcing.',
   '/requests/22222222-2222-4222-8222-000000000002', 'info',
   now() - interval '8 days', now() - interval '8 days'),
  ('99999999-9999-4999-8999-000000000008', '11111111-1111-4111-8111-000000000006',
   'vacancy_request', '22222222-2222-4222-8222-000000000005',
   'YH-2627-0105 closed against the FY27 warehouse line',
   'The store keeper position at BigWing was rejected on budget. Nothing is required from Finance.',
   '/closed', 'info', now() - interval '12 days', now() - interval '13 days')
on conflict (id) do nothing;

-- ===========================================================================
-- 12. document access log - every read of a candidate file is an event
-- ===========================================================================
insert into public.document_access_logs (document_id, actor_id, action, accessed_at, ip, user_agent, note)
values
  ('77777777-7777-4777-8777-000000000007', '11111111-1111-4111-8111-000000000003',
   'view', now() - interval '2 days', '103.21.55.18'::inet, 'Chrome/138 Windows', null),
  ('77777777-7777-4777-8777-000000000008', '11111111-1111-4111-8111-000000000003',
   'view', now() - interval '2 days', '103.21.55.18'::inet, 'Chrome/138 Windows', null),
  ('77777777-7777-4777-8777-000000000004', '11111111-1111-4111-8111-000000000002',
   'view', now() - interval '17 days', '103.21.55.24'::inet, 'Chrome/138 Windows', null),
  ('77777777-7777-4777-8777-000000000006', '11111111-1111-4111-8111-000000000005',
   'verify', now() - interval '14 days', '103.21.55.24'::inet, 'Chrome/138 Windows',
   'Degree certificate matched against the application.'),
  ('77777777-7777-4777-8777-000000000009', '11111111-1111-4111-8111-000000000004',
   'download', now() - interval '5 days', '103.21.55.31'::inet, 'Chrome/138 Windows',
   'Shared with the workshop manager for the floor test.'),
  ('77777777-7777-4777-8777-000000000001', '11111111-1111-4111-8111-000000000004',
   'upload', now() - interval '9 days', '103.21.55.31'::inet, 'Chrome/138 Windows', null),
  ('77777777-7777-4777-8777-000000000013', '11111111-1111-4111-8111-000000000005',
   'view', now() - interval '2 days', '103.21.55.24'::inet, 'Chrome/138 Windows', null);

-- ===========================================================================
-- 13. audit register
-- ===========================================================================
-- The register deliberately includes refusals, not only successes: the point of
-- it is to answer "who tried what, and did the portal say no".
insert into public.audit_events
  (occurred_at, actor_id, actor_role, actor_ip, action, entity_type, entity_id,
   request_id, position_id, candidate_id, facility_id, old_value, new_value, reason,
   result, metadata)
values
  -- access refused, which is the most important kind of row here
  (now() - interval '2 days', '11111111-1111-4111-8111-000000000007', 'Employee', '103.21.55.31',
   'access.attempt', 'vacancy_request', '22222222-2222-4222-8222-000000000001',
   '22222222-2222-4222-8222-000000000001', null, null,
   (select id from public.facilities where code = 'HRD-RW'),
   null, null, 'approve_vacancy is not held by this role; the requester also cannot decide',
   'denied', '{"source":"demo seed","permission":"approve_vacancy"}'::jsonb),
  (now() - interval '20 hours', '11111111-1111-4111-8111-000000000001', 'Admin', '103.21.55.18',
   'access.attempt', 'vacancy_request', '22222222-2222-4222-8222-000000000002',
   '22222222-2222-4222-8222-000000000002', null, null,
   (select id from public.facilities where code = 'SVC-RW'),
   null, null, 'Administration is not hiring: the admin role holds no approval permission',
   'denied', '{"source":"demo seed","permission":"approve_vacancy"}'::jsonb),
  (now() - interval '4 days', '11111111-1111-4111-8111-000000000006', 'Finance', '103.21.55.40',
   'document.open', 'candidate_document', '77777777-7777-4777-8777-000000000004',
   '22222222-2222-4222-8222-000000000004', '33333333-3333-4333-8333-000000000006',
   '44444444-4444-4444-8444-000000000003',
   (select id from public.facilities where code = 'IZL-BO'),
   null, null, 'role has no document access', 'denied',
   '{"source":"demo seed","document_type":"Resume"}'::jsonb),

  -- a validation refusal and a state conflict
  (now() - interval '2 days', '11111111-1111-4111-8111-000000000004', 'HR', '103.21.55.31',
   'candidate.submit', 'candidate', '44444444-4444-4444-8444-000000000001',
   '22222222-2222-4222-8222-000000000002', '33333333-3333-4333-8333-000000000003',
   '44444444-4444-4444-8444-000000000001',
   (select id from public.facilities where code = 'SVC-RW'),
   '{"status":"draft"}'::jsonb, null, 'missing: Photograph', 'validation_error',
   '{"source":"demo seed","missing_documents":"Photograph"}'::jsonb),
  (now() - interval '3 days', '11111111-1111-4111-8111-000000000002', 'Owner', '103.21.55.18',
   'vacancy_request.approve', 'vacancy_request', '22222222-2222-4222-8222-000000000008',
   '22222222-2222-4222-8222-000000000008', null, null,
   (select id from public.facilities where code = 'SVC-BW'),
   '{"status":"draft"}'::jsonb, null, 'A draft has not been submitted; approval is not a move from draft',
   'conflict', '{"source":"demo seed","action":"approve"}'::jsonb),

  -- the hiring decisions themselves
  (now() - interval '4 days', '11111111-1111-4111-8111-000000000007', 'Employee', '103.21.55.31',
   'vacancy_request.submit', 'vacancy_request', '22222222-2222-4222-8222-000000000001',
   '22222222-2222-4222-8222-000000000001', null, null,
   (select id from public.facilities where code = 'HRD-RW'),
   '{"status":"draft"}'::jsonb, '{"status":"submitted_for_vacancy_approval"}'::jsonb,
   null, 'success', '{"source":"demo seed","quantity":2}'::jsonb),
  (now() - interval '8 days', '11111111-1111-4111-8111-000000000002', 'Owner', '103.21.55.18',
   'vacancy_request.approve', 'vacancy_request', '22222222-2222-4222-8222-000000000002',
   '22222222-2222-4222-8222-000000000002', null, null,
   (select id from public.facilities where code = 'SVC-RW'),
   '{"status":"submitted_for_vacancy_approval"}'::jsonb, '{"status":"approved"}'::jsonb,
   'Funded from the service headcount line.', 'success',
   '{"source":"demo seed","positions_affected":1}'::jsonb),
  (now() - interval '6 days', '11111111-1111-4111-8111-000000000002', 'Owner', '103.21.55.18',
   'vacancy_request.return_for_information', 'vacancy_request', '22222222-2222-4222-8222-000000000003',
   '22222222-2222-4222-8222-000000000003', null, null,
   (select id from public.facilities where code = 'FRS-GD'),
   '{"status":"submitted_for_vacancy_approval"}'::jsonb,
   '{"status":"returned_for_information"}'::jsonb,
   'Confirm the Fursungi budget line before this reaches the Owner desk.', 'success',
   '{"source":"demo seed","positions_affected":2}'::jsonb),
  (now() - interval '13 days', '11111111-1111-4111-8111-000000000002', 'Owner', '103.21.55.18',
   'vacancy_request.reject', 'vacancy_request', '22222222-2222-4222-8222-000000000005',
   '22222222-2222-4222-8222-000000000005', null, null,
   (select id from public.facilities where code = 'BW-SAL'),
   '{"status":"submitted_for_vacancy_approval"}'::jsonb, '{"status":"rejected"}'::jsonb,
   'Budget withdrawn for FY27 warehouse consolidation.', 'success',
   '{"source":"demo seed","positions_affected":1}'::jsonb),
  (now() - interval '9 days', '11111111-1111-4111-8111-000000000002', 'Owner', '103.21.55.18',
   'vacancy_request.close', 'vacancy_request', '22222222-2222-4222-8222-000000000006',
   '22222222-2222-4222-8222-000000000006', null, null,
   (select id from public.facilities where code = 'WDK-SAL'),
   '{"status":"approved"}'::jsonb, '{"status":"closed"}'::jsonb, 'Role made redundant',
   'success', '{"source":"demo seed"}'::jsonb),

  -- hold and resume
  (now() - interval '16 days', '11111111-1111-4111-8111-000000000004', 'HR', '103.21.55.31',
   'position.hold', 'position', '33333333-3333-4333-8333-000000000009',
   '22222222-2222-4222-8222-000000000007', '33333333-3333-4333-8333-000000000009', null,
   (select id from public.facilities where code = 'HRD-RW'),
   '{"status":"sourcing"}'::jsonb, '{"status":"hold"}'::jsonb,
   'The southern network assembly allocation was shelved for the month by the Owner.',
   'success', '{"source":"demo seed","expected_end":"next month"}'::jsonb),
  (now() - interval '26 days', '11111111-1111-4111-8111-000000000004', 'HR', '103.21.55.31',
   'position.hold', 'position', '33333333-3333-4333-8333-000000000006',
   '22222222-2222-4222-8222-000000000004', '33333333-3333-4333-8333-000000000006', null,
   (select id from public.facilities where code = 'IZL-BO'),
   '{"status":"approved"}'::jsonb, '{"status":"hold"}'::jsonb,
   'Paused pending confirmation of the IRNP workload split.', 'success',
   '{"source":"demo seed"}'::jsonb),
  (now() - interval '25 days', '11111111-1111-4111-8111-000000000005', 'HrHead', '103.21.55.24',
   'position.resume', 'position', '33333333-3333-4333-8333-000000000006',
   '22222222-2222-4222-8222-000000000004', '33333333-3333-4333-8333-000000000006', null,
   (select id from public.facilities where code = 'IZL-BO'),
   '{"status":"hold"}'::jsonb, '{"status":"approved"}'::jsonb,
   'Workload split confirmed with the HR Head.', 'success',
   '{"source":"demo seed","restored_from":"approved"}'::jsonb),

  -- candidates
  (now() - interval '9 days', '11111111-1111-4111-8111-000000000004', 'HR', '103.21.55.31',
   'candidate.submit', 'candidate', '44444444-4444-4444-8444-000000000004',
   '22222222-2222-4222-8222-000000000007', '33333333-3333-4333-8333-000000000010',
   '44444444-4444-4444-8444-000000000004',
   (select id from public.facilities where code = 'HRD-RW'),
   '{"status":"draft"}'::jsonb, '{"status":"submitted_for_recruitment_approval"}'::jsonb,
   null, 'success', '{"source":"demo seed","exception_attached":false}'::jsonb),
  (now() - interval '5 days', '11111111-1111-4111-8111-000000000003', 'CEO', '103.21.55.18',
   'candidate.reject', 'candidate', '44444444-4444-4444-8444-000000000005',
   '22222222-2222-4222-8222-000000000007', '33333333-3333-4333-8333-000000000010',
   '44444444-4444-4444-8444-000000000005',
   (select id from public.facilities where code = 'HRD-RW'),
   '{"status":"submitted_for_recruitment_approval"}'::jsonb,
   '{"status":"rejected"}'::jsonb,
   'No two-wheeler parts catalogue experience and a sixty-day notice period.', 'success',
   '{"source":"demo seed"}'::jsonb),
  (now() - interval '14 days', '11111111-1111-4111-8111-000000000003', 'CEO', '103.21.55.18',
   'candidate.reject', 'candidate', '44444444-4444-4444-8444-000000000010',
   '22222222-2222-4222-8222-000000000004', '33333333-3333-4333-8333-000000000006',
   '44444444-4444-4444-8444-000000000010',
   (select id from public.facilities where code = 'IZL-BO'),
   '{"status":"approved_for_joining"}'::jsonb,
   '{"status":"candidature_unsuccessful"}'::jsonb,
   'Did not report on the confirmed joining date.', 'success',
   '{"source":"demo seed","was_already_approved":true}'::jsonb),
  (now() - interval '3 days', '11111111-1111-4111-8111-000000000003', 'CEO', '103.21.55.18',
   'candidate.approve_for_joining', 'candidate', '44444444-4444-4444-8444-000000000006',
   '22222222-2222-4222-8222-000000000007', '33333333-3333-4333-8333-000000000011',
   '44444444-4444-4444-8444-000000000006',
   (select id from public.facilities where code = 'HRD-RW'),
   '{"status":"submitted_for_recruitment_approval"}'::jsonb, '{"status":"approved_for_joining"}'::jsonb,
   null, 'success', '{"source":"demo seed"}'::jsonb),
  (now() - interval '2 days', '11111111-1111-4111-8111-000000000003', 'CEO', '103.21.55.18',
   'candidate.return_for_modifications', 'candidate', '44444444-4444-4444-8444-000000000009',
   '22222222-2222-4222-8222-000000000007', '33333333-3333-4333-8333-000000000011',
   '44444444-4444-4444-8444-000000000009',
   (select id from public.facilities where code = 'HRD-RW'),
   '{"status":"submitted_for_recruitment_approval"}'::jsonb,
   '{"status":"returned_for_modifications"}'::jsonb,
   'The file supplied as a photograph is a scanned identity document.', 'success',
   '{"source":"demo seed"}'::jsonb),
  (now() - interval '12 days', '11111111-1111-4111-8111-000000000004', 'HR', '103.21.55.31',
   'candidate.confirm_joining', 'candidate', '44444444-4444-4444-8444-000000000003',
   '22222222-2222-4222-8222-000000000004', '33333333-3333-4333-8333-000000000006',
   '44444444-4444-4444-8444-000000000003',
   (select id from public.facilities where code = 'IZL-BO'),
   '{"status":"approved_for_joining"}'::jsonb,
   '{"status":"hired","actual_joining_date":"twelve days ago"}'::jsonb,
   null, 'success', '{"source":"demo seed","peers_closed":0}'::jsonb),

  -- documents, including the one audited exception
  (now() - interval '9 days', '11111111-1111-4111-8111-000000000004', 'HR', '103.21.55.31',
   'document.upload', 'candidate_document', '77777777-7777-4777-8777-000000000001',
   '22222222-2222-4222-8222-000000000002', '33333333-3333-4333-8333-000000000003',
   '44444444-4444-4444-8444-000000000001',
   (select id from public.facilities where code = 'SVC-RW'),
   null, '{"document_type":"Resume"}'::jsonb, null, 'success',
   '{"source":"demo seed","size_bytes":284113}'::jsonb),
  (now() - interval '14 days', '11111111-1111-4111-8111-000000000005', 'HrHead', '103.21.55.24',
   'document.verify', 'candidate_document', '77777777-7777-4777-8777-000000000006',
   '22222222-2222-4222-8222-000000000004', '33333333-3333-4333-8333-000000000006',
   '44444444-4444-4444-8444-000000000003',
   (select id from public.facilities where code = 'IZL-BO'),
   '{"status":"Not Verified"}'::jsonb, '{"status":"Verified"}'::jsonb,
   'Degree certificate matched against the application.', 'success',
   '{"source":"demo seed"}'::jsonb),
  (now() - interval '4 days', '11111111-1111-4111-8111-000000000005', 'HrHead', '103.21.55.24',
   'document.exception', 'candidate', '44444444-4444-4444-8444-000000000009',
   '22222222-2222-4222-8222-000000000007', '33333333-3333-4333-8333-000000000011',
   '44444444-4444-4444-8444-000000000009',
   (select id from public.facilities where code = 'HRD-RW'),
   null, '{"documents":"Photograph"}'::jsonb,
   'Photograph to follow within two days; the CV is complete and the interview is scheduled.',
   'success', '{"source":"demo seed","authority_basis":"HR Head, delegated in the privacy notice"}'::jsonb),

  -- accountability work
  (now() - interval '14 days', '11111111-1111-4111-8111-000000000001', 'Admin', '103.21.55.18',
   'legal.publish', 'legal_document', 'privacy_policy', null, null, null, null,
   '{"status":"draft","version":"1.0-draft"}'::jsonb, '{"status":"published"}'::jsonb,
   'Notices reviewed by counsel before publication.', 'success',
   '{"source":"demo seed"}'::jsonb),
  (now() - interval '14 days', '11111111-1111-4111-8111-000000000001', 'Admin', '103.21.55.18',
   'legal.publish', 'legal_document', 'terms_of_use', null, null, null, null,
   '{"status":"draft","version":"1.0-draft"}'::jsonb, '{"status":"published"}'::jsonb,
   null, 'success', '{"source":"demo seed"}'::jsonb),
  (now() - interval '20 days', '11111111-1111-4111-8111-000000000001', 'Admin', '103.21.55.18',
   'retention.configure', 'retention_policy', 'candidate_unsuccessful', null, null, null, null,
   '{"retention_days":365}'::jsonb, '{"retention_days":180}'::jsonb,
   'Unsuccessful candidate data is the shortest retention the Act allows us to justify.',
   'success', '{"source":"demo seed"}'::jsonb),
  (now() - interval '10 days', '11111111-1111-4111-8111-000000000001', 'Admin', '103.21.55.18',
   'user.role_change', 'user', '11111111-1111-4111-8111-000000000005', null, null, null, null,
   '{"role":"HR"}'::jsonb, '{"role":"HrHead"}'::jsonb, 'Promotion effective this month.',
   'success', '{"source":"demo seed"}'::jsonb),
  (now() - interval '5 days', '11111111-1111-4111-8111-000000000004', 'HR', '103.21.55.31',
   'dsr.record', 'dsr_request', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', null, null, null, null,
   null, '{"status":"open","request_type":"erasure"}'::jsonb, null, 'success',
   '{"source":"demo seed"}'::jsonb),

  -- sign-ins, including one that failed
  (now() - interval '5 hours', '11111111-1111-4111-8111-000000000003', 'CEO', '103.21.55.18',
   'auth.login', 'session', 'ceo@yashhonda.test', null, null, null, null, null, null, null,
   'success', '{"source":"demo seed"}'::jsonb),
  (now() - interval '9 hours', '11111111-1111-4111-8111-000000000001', 'Admin', '103.21.55.18',
   'auth.login', 'session', 'admin@yashhonda.test', null, null, null, null, null, null, null,
   'success', '{"source":"demo seed"}'::jsonb),
  (now() - interval '26 hours', null, null, '103.21.55.77',
   'auth.login_failed', 'session', 'owner@yashhonda.test', null, null, null, null,
   null, null, 'Five consecutive failed attempts from one address', 'failure',
   '{"source":"demo seed","attempts":5}'::jsonb);

-- ===========================================================================
-- 14. privacy register: data-subject requests and security incidents
-- ===========================================================================
insert into public.dsr_requests
  (id, reference, subject_email, subject_name, subject_category, request_type, detail,
   status, statutory_due_at, fulfilled_at, response_summary, handler_id, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'DSR-2627-0001', 'pravin.jadhav@example.test',
   'Pravin Jadhav', 'Candidate', 'erasure',
   'Asks what the portal holds about him and requests removal of the phone number, which he supplied for a single interview.',
   'open', now() + interval '5 days', null, null,
   '11111111-1111-4111-8111-000000000004', now() - interval '2 days', now() - interval '2 days'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'DSR-2627-0002', 'sanjay.uke@example.test',
   'Sanjay Uke', 'Employee', 'access',
   'Former service advisor asking for a copy of what remains after leaving.',
   'fulfilled', timestamp with time zone '2026-10-02 18:00:00+05:30',
   now() - interval '20 days',
   'Shared the two service records HR still held. No candidate data was attached to the response.',
   '11111111-1111-4111-8111-000000000005', now() - interval '25 days', now() - interval '20 days'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000003', 'DSR-2627-0003', 'nilesh.kamble@example.test',
   'Nilesh Kamble', 'Candidate', 'grievance',
   'Objects to the photograph requirement for a parts counter role.',
   'in_progress', now() + interval '21 days', null, null,
   '11111111-1111-4111-8111-000000000005', now() - interval '5 days', now() - interval '4 days')
on conflict (id) do nothing;

insert into public.security_incidents
  (id, incident_type, severity, actor_user_id, actor_ip, target_entity_type,
   target_entity_id, detail, detected_at, acknowledged_at, acknowledged_by, closed_at, created_at)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'unauthorized_access_attempt', 'high',
   '11111111-1111-4111-8111-000000000007', '103.21.55.31'::inet, 'vacancy_request',
   '22222222-2222-4222-8222-000000000001',
   'An employee account attempted to approve the request it raised. Refused by the permission check.',
   now() - interval '2 days', now() - interval '1 day',
   '11111111-1111-4111-8111-000000000001', null, now() - interval '2 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 'failed_login', 'medium', null,
   '103.21.55.77'::inet, 'session', null,
   'Five failed password attempts against owner@yashhonda.test from a single address in twenty minutes.',
   now() - interval '26 hours', null, null, null, now() - interval '26 hours'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000003', 'rate_limit_breach', 'low', null,
   '103.21.55.90'::inet, 'candidate_document', null,
   'Forty requests for a signed document URL in sixty seconds from one address. Links were already expired.',
   now() - interval '6 days', now() - interval '5 days',
   '11111111-1111-4111-8111-000000000001',
   now() - interval '5 days', now() - interval '6 days'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000004', 'session_anomaly', 'high',
   '11111111-1111-4111-8111-000000000006', '103.21.55.40'::inet, 'candidate_document',
   '77777777-7777-4777-8777-000000000004',
   'A Finance session attempted to open a candidate resume. The role has no document path; the attempt is logged.',
   now() - interval '4 days', null, null, null, now() - interval '4 days')
on conflict (id) do nothing;

-- ===========================================================================
-- 15. what you should now see
-- ===========================================================================
select
  u.email                              as login,
  u.role::text                         as role,
  (select count(*) from public.approval_tasks t
    where t.status = 'pending'
      and (t.assigned_user_id = u.id
           or t.assigned_role = u.role
           or (t.assigned_role is null and t.requested_by = u.id))) as open_actions,
  (select count(*) from public.notification_outbox n
    where n.recipient_id = u.id and n.read_at is null)              as unread
from public.users u
order by u.role::text;

-- ===========================================================================
-- TEARDOWN
-- ===========================================================================
-- supabase/seed_teardown.sql removes exactly what this file inserts, keyed on
-- the fixed uuid prefixes used here, so nothing created through the portal is
-- touched. Run it, then re-run this file, to reload the demo register.
