-- Yash Honda Vacancy & Hiring Tracker - private storage
-- Candidate documents are personal data under DPDP. Buckets are private; the
-- application mints short-lived signed URLs (default 60 seconds) and records
-- every open in document_access_logs. No public bucket exists for a reason.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('candidate-documents', 'candidate-documents', false,
   104857600,
   array['application/pdf','image/jpeg','image/png','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('report-exports', 'report-exports', false, 52428800,
   array['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: <facility_id>/<candidate_id>/<document_type>-<uploadId>.<ext>
-- Facility prefix in the path lets a storage policy enforce the same scope the
-- database already enforces.

drop policy if exists "docs read by scoped staff" on storage.objects;
create policy "docs read by scoped staff" on storage.objects
  for select to authenticated
using (
  bucket_id = 'candidate-documents'
  and public.actor_role() in ('HR','HrHead','Owner','CEO','Admin')
  -- first path segment is the facility id
  and public.can_view((split_part(name, '/', 1))::uuid)
);

drop policy if exists "docs written by hr" on storage.objects;
create policy "docs written by hr" on storage.objects
  for insert to authenticated
with check (
  bucket_id = 'candidate-documents'
  and public.actor_role() in ('HR','HrHead','Admin')
  and public.can_view((split_part(name, '/', 1))::uuid)
);

-- Replacing a document is an audited act: only HR may overwrite, never delete.
drop policy if exists "docs updated by hr" on storage.objects;
create policy "docs updated by hr" on storage.objects
  for update to authenticated
using (bucket_id = 'candidate-documents' and public.actor_role() in ('HR','HrHead','Admin'))
with check (bucket_id = 'candidate-documents' and public.actor_role() in ('HR','HrHead','Admin'));

-- Deletion is performed by the retention worker using the service-role key, so
-- no authenticated role may destroy evidence out from under the audit log.
drop policy if exists "docs delete forbidden for users" on storage.objects;
create policy "docs delete forbidden for users" on storage.objects
  for delete to authenticated using (false);

drop policy if exists "exports read by owner" on storage.objects;
create policy "exports read by owner" on storage.objects
  for select to authenticated
using (
  bucket_id = 'report-exports'
  and public.actor_role() in ('Admin','Owner','CEO','HR','HrHead','Finance')
);

drop policy if exists "exports written by admin" on storage.objects;
create policy "exports written by admin" on storage.objects
  for insert to authenticated
with check (bucket_id = 'report-exports' and public.actor_role() in ('Admin','Owner','CEO','HR','HrHead','Finance'));
