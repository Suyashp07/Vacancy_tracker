-- Yash Honda Vacancy & Hiring Tracker - activity timeline
--
-- Built from the status-history tables, not from audit_events: the audit
-- register is Admin-only by design, while the timeline is for everyone. The
-- projection is PII-free by construction - it names requests and positions,
-- refers to people by role, and never renders a candidate name or a file path.

create or replace view public.activity_feed
with (security_invoker = true) as
with events as (
  select
    'request-' || h.id as key,
    h.changed_at as occurred_at,
    h.changed_by as actor_id,
    'vacancy_request' as entity_type,
    h.request_id::text as entity_id,
    h.request_id,
    null::uuid as position_id,
    null::uuid as candidate_id,
    r.facility_id,
    'to_' || h.to_status::text as action,
    case h.to_status
      when 'submitted_for_vacancy_approval' then 'awaiting vacancy approval'
      when 'approved' then 'approved'
      when 'returned_for_information' then 'returned for information'
      when 'rejected' then 'rejected'
      when 'closed' then 'closed'
      else h.to_status::text
    end as outcome,
    h.reason
  from public.vacancy_request_status_history h
  join public.vacancy_requests r on r.id = h.request_id

  union all

  select
    'position-' || h.id,
    h.changed_at,
    h.changed_by,
    'position',
    h.position_id::text,
    p.request_id,
    p.id,
    null,
    p.facility_id,
    'to_' || h.to_status::text,
    case h.to_status
      when 'awaiting_vacancy_approval' then 'awaiting vacancy approval'
      when 'sourcing' then 'released to sourcing'
      when 'candidate_available' then 'has a candidate'
      when 'sent_for_candidate_approval' then 'sent for candidate approval'
      when 'hold' then 'placed on hold'
      when 'approved_for_joining' then 'approved for joining'
      when 'hired' then 'filled - someone joined'
      when 'position_closed' then 'closed'
      when 'candidature_unsuccessful' then 'closed without a hire'
      else h.to_status::text
    end,
    h.reason
  from public.position_status_history h
  join public.positions p on p.id = h.position_id

  union all

  select
    'candidate-' || h.id,
    h.changed_at,
    h.changed_by,
    'candidate',
    h.candidate_id::text,
    p.request_id,
    p.id,
    h.candidate_id,
    p.facility_id,
    'to_' || h.to_status::text,
    case h.to_status
      when 'submitted_for_recruitment_approval' then 'sent for candidate approval'
      when 'approved_for_joining' then 'approved for joining'
      when 'hired' then 'confirmed as joined'
      when 'rejected' then 'rejected'
      when 'candidature_unsuccessful' then 'candidature unsuccessful'
      when 'returned_for_modifications' then 'returned for modification'
      else h.to_status::text
    end,
    -- the reason field can quote a candidate; the timeline never repeats it
    null
  from public.candidate_status_history h
  -- a candidate record hangs off a position, so the position is reached through
  -- the candidate: candidate_status_history carries candidate_id, not position_id
  join public.candidates c on c.id = h.candidate_id
  join public.positions p on p.id = c.position_id

  union all

  select
    'decision-' || l.id,
    l.created_at,
    l.actor_id,
    l.entity_type,
    l.entity_id::text,
    null,
    null,
    null,
    null,
    l.action,
    l.action || ' recorded',
    null
  from public.approval_logs l

  union all

  select
    'document-' || d.id,
    d.accessed_at,
    d.actor_id,
    'candidate_document',
    d.document_id::text,
    null,
    null,
    null,
    null,
    'document_' || d.action,
    d.action || ' a candidate document',
    null
  from public.document_access_logs d
)
select
  e.key,
  e.occurred_at,
  e.actor_id,
  u.role as actor_role,
  coalesce(u.full_name, 'A former account') as actor_name,
  e.entity_type,
  e.entity_id,
  e.request_id,
  e.position_id,
  e.candidate_id,
  e.facility_id,
  e.action,
  coalesce(vr.number, po.position_number, split_part(e.entity_type, '_', 1)) as entity_ref,
  f.name as facility_name,
  e.outcome as detail,
  e.reason,
  case
    when e.action in ('to_rejected','to_position_closed','to_candidature_unsuccessful',
                      'to_returned_for_information','to_returned_for_modifications') then 'risk'
    when e.action in ('to_hold') then 'hold'
    when e.action in ('to_hired','to_approved','to_approved_for_joining') then 'ok'
    else 'neutral'
  end as tone
from events e
left join public.users u on u.id = e.actor_id
left join public.vacancy_requests vr on vr.id = e.request_id
left join public.positions po on po.id = e.position_id
left join public.facilities f on f.id = e.facility_id;

grant select on public.activity_feed to authenticated;

-- Document access, expressed as a count rather than a list of names, so a
-- manager can see concentration of access without being shown who was read.
create or replace view public.v_document_access_summary
with (security_invoker = true) as
select
  dal.actor_id,
  u.full_name as actor_name,
  u.role as actor_role,
  count(*) as accesses,
  count(*) filter (where dal.action = 'download') as downloads,
  max(dal.accessed_at) as last_access_at,
  count(distinct dal.document_id) as distinct_documents
from public.document_access_logs dal
join public.users u on u.id = dal.actor_id
group by dal.actor_id, u.full_name, u.role;

grant select on public.v_document_access_summary to authenticated;

-- Open positions per stage, ready for the pipeline strip, scoped by RLS because
-- security_invoker makes the underlying position policies apply to the caller.
create or replace view public.v_position_pipeline
with (security_invoker = true) as
select
  p.status,
  count(*) as positions,
  count(*) filter (where p.status = 'hold') as held,
  min(p.created_at) as oldest_at
from public.positions p
join public.vacancy_requests r on r.id = p.request_id and r.status <> 'closed'
group by p.status;

grant select on public.v_position_pipeline to authenticated;

-- Approver load: how many decisions each person is currently sitting on. This
-- is the "who is blocking" question the portal exists to answer.
create or replace view public.v_approver_load
with (security_invoker = true) as
select
  t.assigned_role::text as assigned_role,
  u.id as actor_id,
  coalesce(u.full_name, t.assigned_role::text || ' pool') as holder,
  count(*) filter (where t.status = 'pending') as pending,
  count(*) filter (where t.status = 'pending'
                     and now() > t.created_at + (coalesce(t.sla_hours, 72) * 2 || ' hours')::interval) as overdue,
  count(*) filter (where t.status = 'acted' and t.acted_at > now() - interval '30 days') as acted_30d
from public.approval_tasks t
left join public.users u on u.id = t.assigned_user_id
group by t.assigned_role, u.id, u.full_name;

grant select on public.v_approver_load to authenticated;
