-- Nefertem: journal-abonnees en e-mailmeldingen. Uitvoeren na 001_initial.sql.
begin;
create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check(email = lower(trim(email)) and length(email) between 6 and 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  token uuid not null unique default gen_random_uuid(), confirmed boolean not null default false,
  confirm_sent_at timestamptz, created_at timestamptz not null default now()
);
alter table public.subscribers enable row level security;
-- Inschrijven, bevestigen en afmelden lopen via de edge function 'journal' met de service-role-sleutel.
revoke all on public.subscribers from anon, authenticated;
grant select(id, confirmed, created_at) on public.subscribers to authenticated;
create policy "admin subscribers" on public.subscribers for select to authenticated using((select public.is_admin()));
-- Tijdstip waarop abonnees een melding kregen. Bestaande gepubliceerde berichten tellen als al gemeld.
alter table public.posts add column notified_at timestamptz;
update public.posts set notified_at = now() where published;
commit;
