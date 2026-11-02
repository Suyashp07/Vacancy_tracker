-- Yash Honda Vacancy & Hiring Tracker - consent gate on hiring writes
--
-- The shell tells a signed-in person that hiring records stay read-only until the
-- current notice is accepted. That promise has to be held by the database, not by
-- a banner: an approval recorded under a notice the approver was never shown is
-- processing without a demonstrable basis, and a regulator will not care that the
-- interface looked polite.

-- ===========================================================================
-- the rule
-- ===========================================================================

-- Is there a published notice this account has not accepted yet?
create or replace function public.has_pending_ack(p_actor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.legal_documents d
    where d.status = 'published'
      and d.key in ('privacy_policy', 'terms_of_use')
      and not exists (
        select 1 from public.legal_document_acks a
        where a.legal_document_id = d.id
          and a.user_id = p_actor
      )
  );
$$;

grant execute on function public.has_pending_ack(uuid) to authenticated;

-- ===========================================================================
-- enforcement
-- ===========================================================================
-- Written as a row trigger on the business tables rather than patched into every
-- workflow function, so a code path added next month cannot forget the gate. The
-- actor is read from the transaction-local setting that assert_actor() already
-- establishes, which means it is the same identity the rest of the transaction
-- was audited under - or it is absent, which only a worker without a session can
-- be, and a worker is not a person who owes consent.
create or replace function public.guard_unacknowledged_write()
returns trigger language plpgsql as $$
declare
  v_actor uuid := public.try_cast_uuid(current_setting('app.user_id', true));
begin
  if v_actor is null then
    return new;
  end if;

  if public.has_pending_ack(v_actor) then
    -- A fixed sentence, because this text is what the interface shows the person.
    raise exception
      'validation: accept the current privacy notice and terms on the Policies screen before changing any hiring record'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- The five tables a person can touch while deciding about a human being.
do $$
declare t text;
begin
  foreach t in array array['vacancy_requests', 'positions', 'candidates', 'candidate_documents', 'comments'] loop
    execute format('drop trigger if exists trg_%s_ack_gate on public.%I', t, t);
    execute format(
      'create trigger trg_%s_ack_gate before insert or update on public.%I
         for each row execute function public.guard_unacknowledged_write()', t, t);
  end loop;
end $$;

-- Admins are deliberately outside the gate on their own accountability tables:
-- publishing the notice is the act that starts the obligation, so it must never
-- be blocked by it.
comment on function public.guard_unacknowledged_write() is
  'Blocks a hiring write by an account that has not accepted the published notice.';
comment on function public.has_pending_ack(uuid) is
  'True when a published privacy notice or set of terms has no acceptance row for this account.';
