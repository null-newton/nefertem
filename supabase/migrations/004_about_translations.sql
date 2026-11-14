-- Nefertem: tekst "Over Veronique" ook in het Frans en Engels. Uitvoeren na 003_mail.sql.
-- Leeg = de website toont de Nederlandse tekst (kolom about).
alter table public.practice_settings
  add column about_fr text not null default '',
  add column about_en text not null default '';
