import { createJournalHandler } from './handler.ts'

Deno.serve(createJournalHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  resendKey: Deno.env.get('RESEND_API_KEY') ?? '',
  mailFrom: Deno.env.get('MAIL_FROM') ?? '',
  siteUrl: Deno.env.get('SITE_URL') ?? '',
  replyTo: Deno.env.get('MAIL_REPLY_TO') ?? '',
}))
