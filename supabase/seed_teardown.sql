-- ===========================================================================
-- Yash Honda Vacancy & Hiring Tracker - demo register teardown
-- ===========================================================================
-- Removes everything supabase/seed.sql inserted, so the demo can be loaded
-- again from clean. Every statement is keyed on the fixed uuid prefixes the
-- seed uses, so it cannot touch records created through the portal itself.
--
-- The numbering sequences are deliberately left alone: the next request or
-- position continues where the demo left off, which is what a real register
-- would do after the previous year's data was archived.
--
--   node scripts/provision-supabase.mjs --reseed     (applies this, then seed.sql)
--   or run this file in the Supabase SQL editor.

-- children first
delete from public.security_incidents              where id::text like 'bbbbbbbb%';
delete from public.dsr_requests                    where id::text like 'aaaaaaaa%';
delete from public.audit_events                    where metadata->>'source' = 'demo seed';
delete from public.document_access_logs
 where document_id in (select id from public.candidate_documents where id::text like '77777777%');
delete from public.notification_outbox             where id::text like '99999999%';
delete from public.comments                        where id::text like '66666666%';
delete from public.approval_logs
 where task_id in (select id from public.approval_tasks where id::text like '55555555%');
delete from public.approval_tasks                  where id::text like '55555555%';
delete from public.candidate_status_history
 where candidate_id in (select id from public.candidates where id::text like '44444444%');
delete from public.candidate_documents             where id::text like '77777777%';
delete from public.candidates                      where id::text like '44444444%';
delete from public.position_status_history
 where position_id in (select id from public.positions where id::text like '33333333%');
delete from public.positions                       where id::text like '33333333%';
delete from public.vacancy_request_status_history
 where request_id in (select id from public.vacancy_requests where id::text like '22222222%');
delete from public.vacancy_requests                where id::text like '22222222%';

-- then the people and their scope
delete from public.legal_document_acks
 where user_id in (select id from public.users where email like '%@yashhonda.test');
delete from public.user_facilities
 where user_id in (select id from public.users where email like '%@yashhonda.test');
delete from public.users                           where email like '%@yashhonda.test';
delete from auth.users                             where email like '%@yashhonda.test';

-- the notices the seed published go back to draft, so the acknowledgement gate
-- can be demonstrated again from the beginning
update public.legal_documents
   set status = 'draft', effective_from = null, published_at = null, published_by = null
 where status = 'published';
