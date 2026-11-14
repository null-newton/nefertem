-- Nefertem: rate limiter voor het contactformulier. Uitvoeren na 004_about_translations.sql.
-- De edge function 'mail' bewaart per inzending een SHA-256-hash van het IP-adres (nooit het adres zelf)
-- en weigert nieuwe berichten wanneer een limiet bereikt is. Rijen ouder dan een dag worden automatisch opgeruimd.
begin;
create table public.contact_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.contact_attempts enable row level security;
-- Alleen de service-role (edge function) leest en schrijft; geen toegang voor bezoekers of beheerders via de API.
revoke all on public.contact_attempts from anon, authenticated;
create index contact_attempts_ip_created on public.contact_attempts(ip_hash, created_at desc);
create index contact_attempts_created on public.contact_attempts(created_at);
commit;
