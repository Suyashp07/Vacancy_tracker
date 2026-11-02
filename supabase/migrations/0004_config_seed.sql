-- Yash Honda Vacancy & Hiring Tracker - configuration seed
-- This is the DEFAULT workflow. It lives in tables, not in code, so the Admin
-- panel can display and later edit it without a deploy. Re-seeding is idempotent.

-- ===========================================================================
-- facilities (the nine Yash Honda locations)
-- ===========================================================================
insert into public.facilities (code, name, facility_type, city) values
  ('HRD-RW',  'Hadapsar RedWing',        'Sales & Service', 'Pune'),
  ('SVC-RW',  'Service RedWing',         'Service',         'Pune'),
  ('SVC-BW',  'Service BigWing',         'Service',         'Pune'),
  ('IZL-BO',  'Izeil office',            'Back Office',     'Pune'),
  ('BW-SAL',  'BigWing Sales',           'Sales',           'Pune'),
  ('FRS-GD',  'Fursungi',                'Godown',          'Pune'),
  ('WDK-SAL', 'Wadki',                   'Sales',           'Pune'),
  ('ESD-GD',  'ESD Godown',              'Godown',          'Pune'),
  ('HP-SV',   'HP Salunke Vihar',        'Sales',           'Pune')
on conflict (code) do nothing;

-- ===========================================================================
-- retention policy (DPDP: purpose-bound, finite, reviewable)
-- ===========================================================================
insert into public.retention_policies (data_category, legal_basis, purpose, retention_days) values
  ('candidate_unsuccessful', 'dpdp_compliance',      'Delete unsuccessful candidate data once the hiring decision is final and any grievance window has passed', 180),
  ('candidate_hired',        'organisation_policy',  'Employment record retention for statutory and payroll reference',                                        1095),
  ('candidate_documents',    'dpdp_compliance',      'Resume and photograph destroyed with the candidate record they belong to',                                180),
  ('vacancy_request',        'organisation_policy',  'Business audit of hiring demand per fiscal year',                                                           1095),
  ('audit_event',            'dpdp_compliance',      'Security and accountability register; contains no candidate PII',                                           1825),
  ('consent_record',         'dpdp_compliance',      'Proof of notice and consent for as long as the data is processed, plus limitation period',                1825),
  ('dsr_request',            'dpdp_compliance',      'Data-subject request evidence for regulator queries',                                                     1095),
  ('security_incident',      'dpdp_compliance',      'Breach detection and notification obligations',                                                           1095)
on conflict (data_category) do update
  set purpose = excluded.purpose,
      retention_days = excluded.retention_days,
      legal_basis = excluded.legal_basis,
      updated_at = now();

-- ===========================================================================
-- workflow definitions
-- ===========================================================================
insert into public.workflow_definitions (key, name, entity_type) values
  ('vacancy_request_default', 'Vacancy request lifecycle', 'vacancy_request'),
  ('position_default',        'Position hiring workflow', 'position'),
  ('candidate_default',       'Candidate approval workflow', 'candidate')
on conflict (key) do nothing;

-- ===========================================================================
-- position steps (12-stage default)
-- A VALUES list resolves its own column types before the INSERT sees them, so
-- step_type would arrive as plain text and the enum column refuses that. The
-- select list casts the non-text targets (step_type, the two SLA ints, sort
-- order, is_terminal) explicitly. Same approach for all three step blocks.
-- ===========================================================================
with w as (select id from public.workflow_definitions where key = 'position_default')
insert into public.workflow_steps
  (workflow_id, status_key, label, step_type, required_fields, required_documents,
   allowed_actions, allowed_roles, max_sla_days, overdue_sla_days, sort_order, is_terminal)
select w.id, s.status_key, s.label, s.step_type::public.workflow_step_type,
       s.required_fields, s.required_documents, s.allowed_actions, s.allowed_roles,
       s.max_sla_days::integer, s.overdue_sla_days::integer,
       s.sort_order::integer, s.is_terminal::boolean
from w, (values
  ('draft',                            'Draft',                     'system',
    array[]::text[], array[]::text[],
    array['edit','submit_for_vacancy_approval','close_position'],
    array['Employee','HR','HrHead'], null, null, 10, false),
  ('awaiting_vacancy_approval',        'Awaiting vacancy approval', 'approval',
    array['justification','quantity','ctc_max','target_fill_date'], array[]::text[],
    array['approve','return_for_information','reject'],
    array['Owner','CEO'], 3, 5, 20, false),
  ('approved',                         'Vacancy approved',          'system',
    array[]::text[], array[]::text[],
    array['start_sourcing','hold','close_position'],
    array['HR','HrHead','Owner','CEO'], null, null, 30, false),
  ('sourcing',                         'Sourcing candidates',       'system',
    array[]::text[], array[]::text[],
    array['add_candidate','hold','close_position'],
    array['HR','HrHead','Owner','CEO'], 14, 21, 40, false),
  ('candidate_available',              'Candidate available',       'system',
    -- the person's own record is gated when it is created and when it is sent;
    -- what this stage cannot be entered without is the paperwork
    array[]::text[], array['Resume','Photograph'],
    array['submit_for_candidate_approval','reject_candidature','hold'],
    array['HR','HrHead'], null, null, 50, false),
  ('sent_for_candidate_approval',      'Sent for candidate approval','approval',
    array['full_name','expected_ctc'], array['Resume','Photograph'],
    array['approve_for_joining','reject_candidature','return_for_modifications'],
    array['Owner','CEO'], 3, 5, 60, false),
  ('hold',                             'On hold',                   'system',
    array['hold_reason','hold_start_date'], array[]::text[],
    array['resume','close_position'],
    array['HR','HrHead','Owner','CEO'], null, 30, 70, false),
  ('approved_for_joining',             'Approved for joining',      'system',
    -- the expected joining date is a preference on the request, not a condition
    -- of releasing the person; the date that matters is the one they actually came
    array[]::text[], array[]::text[],
    array['confirm_joining','withdraw_offer'],
    array['HR','HrHead','Owner','CEO'], 30, 45, 80, false),
  ('hired',                            'Hired',                     'system',
    array['actual_joining_date'], array[]::text[],
    array[]::text[],
    array['HR','HrHead'], null, null, 90, true),
  ('position_closed',                  'Position closed',           'system',
    -- a position carries no closure column: the reason lives on the transition and
    -- in the audit entry, which is where a closed position is explained
    array[]::text[], array[]::text[],
    array[]::text[],
    array['HR','HrHead','Owner','CEO'], null, null, 100, true),
  ('candidature_unsuccessful',         'Candidature unsuccessful',  'system',
    array['rejection_reason'], array[]::text[],
    array['restart_sourcing'],
    array['HR','HrHead','Owner','CEO'], null, null, 110, false)
) as s(status_key, label, step_type, required_fields, required_documents,
       allowed_actions, allowed_roles, max_sla_days, overdue_sla_days, sort_order, is_terminal)
on conflict (workflow_id, status_key) do update
  set label = excluded.label,
      required_fields = excluded.required_fields,
      required_documents = excluded.required_documents,
      allowed_actions = excluded.allowed_actions,
      allowed_roles = excluded.allowed_roles,
      max_sla_days = excluded.max_sla_days,
      overdue_sla_days = excluded.overdue_sla_days,
      sort_order = excluded.sort_order,
      is_terminal = excluded.is_terminal;

with w as (select id from public.workflow_definitions where key = 'position_default')
insert into public.workflow_transitions
  (workflow_id, from_status, action, to_status, allowed_roles, requires_reason, requires_comment)
select w.id, t.* from w, (values
  ('draft',                        'submit_for_vacancy_approval','awaiting_vacancy_approval', array['Employee','HR','HrHead'], false, false),
  -- a position nobody wants any more is closed, not deleted: the number stays in
  -- the register and the reason stays readable
  ('draft',                        'close_position',             'position_closed',            array['HR','HrHead','Owner','CEO'],      true,  true),
  ('awaiting_vacancy_approval',    'approve',                    'approved',                   array['Owner','CEO'],                    false, false),
  ('awaiting_vacancy_approval',    'return_for_information',     'draft',                      array['Owner','CEO'],                    true,  true),
  ('awaiting_vacancy_approval',    'reject',                     'position_closed',            array['Owner','CEO'],                    true,  true),
  ('approved',                     'start_sourcing',             'sourcing',                   array['HR','HrHead'],                    false, false),
  ('approved',                     'close_position',             'position_closed',            array['HR','HrHead','Owner','CEO'], true,  true),
  ('approved',                     'hold',                       'hold',                       array['HR','HrHead','Owner','CEO'], true, false),
  ('sourcing',                     'add_candidate',              'sourcing',                   array['HR','HrHead'],                    false, false),
  ('sourcing',                     'hold',                       'hold',                       array['HR','HrHead','Owner','CEO'], true,  false),
  ('sourcing',                     'close_position',             'position_closed',            array['HR','HrHead','Owner','CEO'], true,  true),
  ('candidate_available',          'submit_for_candidate_approval','sent_for_candidate_approval', array['HR','HrHead'],                 false, false),
  ('candidate_available',          'reject_candidature',         'candidature_unsuccessful',   array['HR','HrHead','Owner','CEO'],       true,  true),
  ('candidate_available',          'hold',                       'hold',                       array['HR','HrHead','Owner','CEO'], true, false),
  ('sent_for_candidate_approval',  'approve_for_joining',        'approved_for_joining',       array['Owner','CEO'],                    false, false),
  ('sent_for_candidate_approval',  'reject_candidature',         'candidature_unsuccessful',   array['Owner','CEO'],                    true,  true),
  ('sent_for_candidate_approval',  'return_for_modifications',   'candidate_available',        array['Owner','CEO'],                    true,  true),
  ('hold',                         'resume',                     'sourcing',                   array['HR','HrHead','Owner','CEO'], false, false),
  ('hold',                         'close_position',             'position_closed',            array['HR','HrHead','Owner','CEO'], true,  true),
  ('approved_for_joining',         'confirm_joining',            'hired',                      array['HR','HrHead'],                    false, false),
  ('approved_for_joining',         'withdraw_offer',             'candidature_unsuccessful',   array['Owner','CEO'],                    true,  true),
  ('candidature_unsuccessful',     'restart_sourcing',           'sourcing',                   array['HR','HrHead'],                    false, false)
) as t(from_status, action, to_status, allowed_roles, requires_reason, requires_comment)
on conflict (workflow_id, from_status, action) do update
  set to_status = excluded.to_status,
      allowed_roles = excluded.allowed_roles,
      requires_reason = excluded.requires_reason,
      requires_comment = excluded.requires_comment;

-- ===========================================================================
-- vacancy request steps
-- ===========================================================================
with w as (select id from public.workflow_definitions where key = 'vacancy_request_default')
insert into public.workflow_steps
  (workflow_id, status_key, label, step_type, required_fields, required_documents,
   allowed_actions, allowed_roles, max_sla_days, overdue_sla_days, sort_order, is_terminal)
select w.id, s.status_key, s.label, s.step_type::public.workflow_step_type,
       s.required_fields, s.required_documents, s.allowed_actions, s.allowed_roles,
       s.max_sla_days::integer, s.overdue_sla_days::integer,
       s.sort_order::integer, s.is_terminal::boolean
from w, (values
  ('draft',                          'Draft',                      'system',
    array['title','reason','facility_id','position_type','quantity','justification'], array[]::text[],
    array['submit_for_vacancy_approval','cancel'], array['Employee','HR','HrHead'], null, null, 10, false),
  ('submitted_for_vacancy_approval', 'Awaiting vacancy approval',   'approval',
    array['justification','quantity'], array[]::text[],
    array['approve','return_for_information','reject'], array['Owner','CEO'], 3, 5, 20, false),
  ('approved',                       'Approved',                    'system',
    array[]::text[], array[]::text[], array['close'], array['HR','HrHead','Owner','CEO'], null, null, 30, false),
  ('returned_for_information',       'Returned for information',    'system',
    array[]::text[], array[]::text[], array['resubmit','cancel'], array['Employee','HR','HrHead'], 7, 14, 40, false),
  ('rejected',                       'Rejected',                    'system',
    array['closure_reason'], array[]::text[], array[]::text[], array['Owner','CEO'], null, null, 50, true),
  ('closed',                         'Closed',                      'system',
    array['closure_reason'], array[]::text[], array[]::text[], array['HR','HrHead','Owner','CEO'], null, null, 60, true)
) as s(status_key, label, step_type, required_fields, required_documents,
       allowed_actions, allowed_roles, max_sla_days, overdue_sla_days, sort_order, is_terminal)
on conflict (workflow_id, status_key) do update set label = excluded.label;

with w as (select id from public.workflow_definitions where key = 'vacancy_request_default')
insert into public.workflow_transitions
  (workflow_id, from_status, action, to_status, allowed_roles, requires_reason, requires_comment)
select w.id, t.* from w, (values
  ('draft', 'submit_for_vacancy_approval', 'submitted_for_vacancy_approval', array['Employee','HR','HrHead'], false, false),
  -- a requester may withdraw their own draft before anyone has spent time on it;
  -- the step advertises cancel, so the move has to exist or the word is a lie
  ('draft', 'cancel', 'closed', array['Employee','HR','HrHead'], true, false),
  ('submitted_for_vacancy_approval', 'approve', 'approved', array['Owner','CEO'], false, false),
  ('submitted_for_vacancy_approval', 'return_for_information', 'returned_for_information', array['Owner','CEO'], true, true),
  ('submitted_for_vacancy_approval', 'reject', 'rejected', array['Owner','CEO'], true, true),
  ('returned_for_information', 'resubmit', 'submitted_for_vacancy_approval', array['Employee','HR','HrHead'], false, false),
  ('returned_for_information', 'cancel', 'closed', array['Employee','HR','HrHead'], true, true),
  ('approved', 'close', 'closed', array['HR','HrHead','Owner','CEO'], true, true)
) as t(from_status, action, to_status, allowed_roles, requires_reason, requires_comment)
on conflict (workflow_id, from_status, action) do update set to_status = excluded.to_status;

-- ===========================================================================
-- candidate steps
-- ===========================================================================
with w as (select id from public.workflow_definitions where key = 'candidate_default')
insert into public.workflow_steps
  (workflow_id, status_key, label, step_type, required_fields, required_documents,
   allowed_actions, allowed_roles, max_sla_days, overdue_sla_days, sort_order, is_terminal)
select w.id, s.status_key, s.label, s.step_type::public.workflow_step_type,
       s.required_fields, s.required_documents, s.allowed_actions, s.allowed_roles,
       s.max_sla_days::integer, s.overdue_sla_days::integer,
       s.sort_order::integer, s.is_terminal::boolean
from w, (values
  ('draft',                             'Draft',                 'system',
    array['full_name'], array['Resume','Photograph'],
    array['submit_for_recruitment_approval'], array['HR','HrHead'], null, null, 10, false),
  ('submitted_for_recruitment_approval','Awaiting decision',     'approval',
    array['full_name','expected_ctc'], array['Resume','Photograph'],
    array['approve_for_joining','reject','return_for_modifications'], array['Owner','CEO'], 3, 5, 20, false),
  ('returned_for_modifications',        'Returned for modification','system',
    array[]::text[], array['Resume','Photograph'],
    array['submit_for_recruitment_approval'], array['HR','HrHead'], 7, 14, 30, false),
  -- there is no candidate hold stage on purpose: pausing is something a position
  -- does, and a held position already refuses to let a candidate be sent
  ('approved_for_joining',              'Approved for joining',  'system',
    array['actual_joining_date'], array[]::text[],
    array['confirm_joining','reject'], array['HR','HrHead','Owner','CEO'], 30, 45, 50, false),
  ('hired',                             'Hired',                 'system',
    array['actual_joining_date'], array[]::text[],
    array[]::text[], array['HR','HrHead'], null, null, 60, true),
  ('rejected',                          'Rejected',              'system',
    array['rejection_reason'], array[]::text[], array[]::text[], array['Owner','CEO'], null, null, 70, true),
  ('candidature_unsuccessful',          'Candidature unsuccessful','system',
    array['rejection_reason'], array[]::text[], array[]::text[], array['HR','HrHead','Owner','CEO'], null, null, 80, true)
) as s(status_key, label, step_type, required_fields, required_documents,
       allowed_actions, allowed_roles, max_sla_days, overdue_sla_days, sort_order, is_terminal)
on conflict (workflow_id, status_key) do update set label = excluded.label;

with w as (select id from public.workflow_definitions where key = 'candidate_default')
insert into public.workflow_transitions
  (workflow_id, from_status, action, to_status, allowed_roles, requires_reason, requires_comment)
select w.id, t.* from w, (values
  ('draft', 'submit_for_recruitment_approval', 'submitted_for_recruitment_approval', array['HR','HrHead'], false, false),
  ('submitted_for_recruitment_approval', 'approve_for_joining', 'approved_for_joining', array['Owner','CEO'], false, false),
  ('submitted_for_recruitment_approval', 'reject', 'rejected', array['Owner','CEO'], true, true),
  ('submitted_for_recruitment_approval', 'return_for_modifications', 'returned_for_modifications', array['Owner','CEO'], true, true),
  ('returned_for_modifications', 'submit_for_recruitment_approval', 'submitted_for_recruitment_approval', array['HR','HrHead'], false, false),
  ('approved_for_joining', 'confirm_joining', 'hired', array['HR','HrHead'], false, false),
  ('approved_for_joining', 'reject', 'candidature_unsuccessful', array['Owner','CEO'], true, true)
) as t(from_status, action, to_status, allowed_roles, requires_reason, requires_comment)
on conflict (workflow_id, from_status, action) do update set to_status = excluded.to_status;

-- ===========================================================================
-- field definitions (forms and the required-field gate read these)
-- ===========================================================================
insert into public.workflow_field_definitions
  (entity_type, field_key, label, input_type, is_mandatory, max_length, options, sort_order, visible_roles, editable_roles)
values
  ('vacancy_request','title','Position title','text',true,255,null,10,'{}','{Employee,HR,HrHead,Admin}'),
  ('vacancy_request','reason','Reason for vacancy','select',true,null,
    ARRAY['New','Replacement — employee left','Replacement — planned exit','Business expansion'],20,'{}','{Employee,HR,HrHead,Admin}'),
  ('vacancy_request','facility_id','Facility','select',true,null,null,30,'{}','{Employee,HR,HrHead,Admin}'),
  ('vacancy_request','position_type','Role / position type','text',true,120,null,40,'{}','{Employee,HR,HrHead,Admin}'),
  ('vacancy_request','quantity','Number of positions','number',true,null,null,50,'{}','{Employee,HR,HrHead,Admin}'),
  ('vacancy_request','justification','Business justification','textarea',true,2000,null,60,'{}','{Employee,HR,HrHead,Admin}'),
  ('vacancy_request','previous_employee_name','Employee being replaced','text',false,255,null,70,
    '{HR,HrHead,Owner,CEO,Finance,Admin}','{Employee,HR,HrHead}'),
  ('vacancy_request','budget_available','Budget available','checkbox',false,null,null,80,
    '{HR,HrHead,Owner,CEO,Finance,Admin}','{HR,HrHead}'),
  ('vacancy_request','ctc_min','CTC from','currency',false,null,null,90,
    '{HR,HrHead,Owner,CEO,Finance,Admin}','{HR,HrHead,Owner,CEO}'),
  ('vacancy_request','ctc_max','CTC up to','currency',false,null,null,100,
    '{HR,HrHead,Owner,CEO,Finance,Admin}','{HR,HrHead,Owner,CEO}'),
  ('vacancy_request','target_fill_date','Target fill date','date',false,null,null,110,'{}','{HR,HrHead,Employee}'),
  ('vacancy_request','is_urgent','Urgent','checkbox',false,null,null,120,'{}','{Employee,HR,HrHead}'),
  ('position','label','Position label','text',true,120,null,10,'{}','{HR,HrHead,Admin}'),
  ('position','ctc_max','Approved CTC','currency',false,null,null,20,'{HR,HrHead,Owner,CEO,Finance,Admin}','{Owner,CEO,Admin}'),
  ('position','target_fill_date','Target fill date','date',false,null,null,30,'{}','{HR,HrHead,Owner,CEO}'),
  ('position','hold_reason','Reason for hold','textarea',true,1000,null,40,'{}','{HR,HrHead,Owner,CEO,Admin}'),
  ('position','hold_start_date','Hold start date','date',true,null,null,50,'{}','{HR,HrHead,Owner,CEO,Admin}'),
  ('position','closure_reason','Closure reason','select',true,null,
    ARRAY['Candidature unsuccessful','Withdrawn','Budget withdrawn','Role made redundant','Duplicate position'],60,'{}','{HR,HrHead,Owner,CEO,Admin}'),
  ('candidate','full_name','Candidate name','text',true,255,null,10,'{}','{HR,HrHead}'),
  ('candidate','email','Email','email',false,null,null,20,'{HR,HrHead,Owner,CEO,Admin}','{HR,HrHead}'),
  ('candidate','phone','Phone','phone',false,null,null,30,'{HR,HrHead,Owner,CEO,Admin}','{HR,HrHead}'),
  ('candidate','current_location','Current location','text',false,null,null,40,'{HR,HrHead,Owner,CEO,Admin}','{HR,HrHead}'),
  ('candidate','expected_ctc','Expected CTC','currency',false,null,null,50,'{HR,HrHead,Owner,CEO,Finance,Admin}','{HR,HrHead}'),
  ('candidate','experience_text','Experience','textarea',false,null,null,60,'{}','{HR,HrHead}'),
  ('candidate','qualifications','Qualifications','textarea',false,null,null,70,'{}','{HR,HrHead}'),
  ('candidate','notice_period_days','Notice period (days)','number',false,null,null,80,'{HR,HrHead,Owner,CEO,Admin}','{HR,HrHead}'),
  ('candidate','source','Sourcing channel','text',false,null,null,90,'{HR,HrHead,Owner,CEO,Admin}','{HR,HrHead}'),
  ('candidate','rejection_reason','Rejection reason','textarea',true,1000,null,100,'{}','{Owner,CEO,HR,HrHead}'),
  ('candidate','actual_joining_date','Actual joining date','date',true,null,null,110,'{}','{HR,HrHead,Owner,CEO}')
on conflict (entity_type, field_key) do update
  set label = excluded.label,
      is_mandatory = excluded.is_mandatory,
      visible_roles = excluded.visible_roles,
      editable_roles = excluded.editable_roles,
      sort_order = excluded.sort_order;

-- ===========================================================================
-- legal documents: seeded as drafts, so the publish gate is exercised rather
-- than bypassed. Admin must publish each one before users see it.
-- ===========================================================================
insert into public.legal_documents (key, title, version, body_md, status) values
  ('privacy_policy','Privacy notice and consent','1.0-draft','
# Privacy notice

This portal is used only to raise vacancy requests and to progress candidates for
Honda two-wheeler dealership positions at Yash Honda facilities in Pune.

## What we collect
For a candidate we collect name, email, phone, current location, qualifications,
experience, expected CTC, notice period, resume and a recent photograph.

## What we deliberately never collect
Aadhaar number, PAN, bank account details, date of birth, health data, biometrics,
political or religious information. Forms are configured so these fields do not exist.

## Why we process it
To assess the candidate against an approved position and, on approval, to raise the
joining record. The lawful basis is consent plus legitimate use for employment
management under the Digital Personal Data Protection Act, 2023.

## Who can see it
HR and the HR head for the facility, the Owner and CEO when approving a candidate,
and the Portal Admin only for accountability work. Finance cannot open resumes or
photographs. Every document open is logged.

## How long we keep it
Unsuccessful candidate data is deleted 180 days after the final decision. Hired
candidate records are retained for 3 years as an employment record. Deletion runs
automatically against these periods and the run is logged.

## Your rights
Access, correction, erasure, withdrawal of consent, and nomination of another
person in the event of death. Raise a request with the Grievance Officer below.
','draft'),
  ('grievance','Grievance officer and redressal','1.0-draft','
# Grievance officer

Grievance redressal under DPDP Act 2023, section 10(4).

Contact the designated officer with your name, the subject category you fall into
and what you are asking for. Acknowledgement within 48 hours. Resolution within 30
days; a data-access request is answered within 30 days as well, and we will tell you
sooner if it needs longer and why.

If you are not satisfied with the response you may approach the Data Protection
Board of India.
','draft'),
  ('consent_notice','Candidate consent notice','1.0-draft','
# Candidate consent notice

Shown to HR before any candidate record is created.

I confirm that the candidate has been told their personal data is being collected
for this specific hiring process at Yash Honda, that a resume and photograph are
required for assessment, that they may withdraw consent at any time by contacting
the grievance officer, and that unsuccessful candidate data is deleted after 180
days.
','draft'),
  ('retention_policy','Data retention policy','1.0-draft','
# Data retention

Retention is purpose-bound. Each category is deleted when the purpose ends.

- Unsuccessful candidate: 180 days after the final decision
- Hired candidate: 3 years from date of joining
- Candidate documents: destroyed with the record they belong to
- Vacancy request: 3 years (fiscal audit)
- Audit log: 5 years, and it never contains candidate personal data
- Consent and DSR evidence: 5 years
','draft'),
  ('access_policy','Internal access and role policy','1.0-draft','
# Who sees what

Access is by role and by facility. A person sees the facilities they are attached
to, plus anything they personally raised.

- Employee: raises requests for their own facility, sees their own requests
- HR / HR head: full hiring workflow for their facilities, candidate data
- Owner / CEO: company-wide decisions, candidate data while approving
- Finance: budget and CTC information only, never candidate documents
- Admin: configuration and accountability data; no vacancy approvals

No one can approve their own submission. Admin cannot turn off the audit log, the
consent record, the access log or retention - those are locked.
','draft'),
  ('prohibited_data','Prohibited data notice','1.0-draft','
# Never upload these

Do not enter or attach: Aadhaar, PAN, bank details, date of birth, caste or
religion, health or medical records, biometrics, political opinion, or any document
containing them. If a candidate sends such a document, delete it and record only
what the process needs. The portal refuses oversized files and does not offer
fields for these categories, and uploading them is a policy violation.
','draft'),
  ('terms_of_use','Portal terms of use','1.0-draft','
# Terms of use

This is an internal Yash Honda system. Accounts are individual and never shared.
Information in the portal is confidential to the hiring process. Use it only for
the purpose it exists for, report suspected misuse to the administrator, and expect
that actions taken here are recorded in the audit log.
','draft')
on conflict (key, version) do nothing;
