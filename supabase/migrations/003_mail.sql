-- Nefertem: e-mail versturen en ontvangen via Resend in de beheeromgeving. Uitvoeren na 002_journal_subscribers.sql.
begin;
create table public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  -- ID bij Resend: voorkomt dubbele berichten wanneer webhook en synchronisatie hetzelfde bericht aanleveren.
  resend_id text not null unique,
  direction text not null check(direction in ('in','out')),
  from_address text not null default '', to_addresses text[] not null default '{}', cc_addresses text[] not null default '{}',
  reply_to text[] not null default '{}', subject text not null default '', text_body text not null default '', html_body text not null default '',
  -- RFC Message-ID, gebruikt voor In-Reply-To/References zodat antwoorden in dezelfde conversatie verschijnen.
  message_id text not null default '', in_reply_to text not null default '',
  attachments jsonb not null default '[]', is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.mail_messages enable row level security;
-- Opslaan gebeurt door de edge function 'mail' met de service-role-sleutel. Beheerders lezen, markeren als gelezen en verwijderen.
revoke all on public.mail_messages from anon, authenticated;
grant select, delete on public.mail_messages to authenticated;
grant update(is_read) on public.mail_messages to authenticated;
create policy "admin mail" on public.mail_messages for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create index mail_messages_direction_created on public.mail_messages(direction, created_at desc);
commit;
