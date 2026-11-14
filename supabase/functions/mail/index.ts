import { createMailHandler } from './handler.ts'

Deno.serve(createMailHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  // Ontvangen mail lezen vraagt een sleutel met Full access; de journal-sleutel mag beperkt blijven tot versturen.
  resendKey: Deno.env.get('RESEND_INBOX_API_KEY') || Deno.env.get('RESEND_API_KEY') || '',
  // Afzender voor persoonlijke e-mails uit de beheeromgeving; valt terug op het journal-adres.
  mailFrom: Deno.env.get('MAIL_INBOX_FROM') || Deno.env.get('MAIL_FROM') || '',
  webhookSecret: Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '',
}))
