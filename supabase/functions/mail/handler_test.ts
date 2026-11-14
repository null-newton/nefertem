import { createMailHandler, verifyWebhook } from './handler.ts'

const secretBytes = new TextEncoder().encode('super-secret-webhook-key-123456')
const secret = `whsec_${btoa(String.fromCharCode(...secretBytes))}`
const config = { supabaseUrl: 'https://test.supabase.co', anonKey: 'public-key', serviceKey: 'service-key', resendKey: 'resend-key', mailFrom: 'Veronique <info@test.be>', webhookSecret: secret }
const msgId = '99999999-2222-4333-8444-555555555555'
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
type Call = { url: string; method: string; body: unknown; headers?: HeadersInit }
const received = { id: 'em_1', from: 'klant@b.be', to: ['info@test.be'], subject: 'Afspraak', html: '<p>Hallo</p>', text: 'Hallo', headers: { from: 'Klant <klant@b.be>' }, message_id: '<abc@b.be>', created_at: '2026-11-01T10:00:00Z', attachments: [{ id: 'att_1', filename: 'a.pdf', content_type: 'application/pdf', size: 10 }] }
// Fake Supabase REST/Auth and Resend; `db` maps "url-part METHOD" to a JSON response.
function mockFetch(calls: Call[], db: Record<string, unknown> = {}, opts: { admin?: boolean; resendOk?: boolean; list?: { id: string }[] } = {}) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? 'GET', body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined
    calls.push({ url, method, body, headers: init?.headers })
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user' })
    if (url.endsWith('/rpc/is_admin')) return Response.json(opts.admin ?? true)
    if (url.startsWith('https://api.resend.com')) {
      if (opts.resendOk === false) return new Response('nope', { status: 500 })
      if (url.includes('/emails/receiving?')) return Response.json({ object: 'list', has_more: false, data: opts.list ?? [] })
      if (url.includes('/attachments/')) return Response.json({ download_url: 'https://inbound-cdn.resend.com/x?sig=1' })
      if (url.includes('/emails/receiving/')) return Response.json({ ...received, id: url.split('/').pop() })
      return Response.json({ id: 'sent_1' })
    }
    const key = Object.keys(db).find(k => url.includes(k.split(' ')[0]) && (k.split(' ')[1] ?? 'GET') === method)
    return Response.json(key ? db[key] : [])
  }) as typeof fetch
}
const action = (body: object, auth = 'Bearer u') => new Request('https://test/functions/v1/mail', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body) })
async function signed(body: string, ts = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`msg_1.${ts}.${body}`)))))
  return new Request('https://test/functions/v1/mail', { method: 'POST', headers: { 'svix-id': 'msg_1', 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}` }, body })
}
const resendCalls = (calls: Call[]) => calls.filter(c => c.url.startsWith('https://api.resend.com'))

Deno.test('webhook signature: valid, tampered, expired and missing', async () => {
  const body = '{"type":"email.received"}'
  const r = await signed(body)
  const h = r.headers
  assert(await verifyWebhook(secret, h.get('svix-id'), h.get('svix-timestamp'), h.get('svix-signature'), body), 'valid signature accepted')
  assert(!await verifyWebhook(secret, h.get('svix-id'), h.get('svix-timestamp'), h.get('svix-signature'), body + ' '), 'tampered body rejected')
  assert(!await verifyWebhook(secret, h.get('svix-id'), h.get('svix-timestamp'), h.get('svix-signature'), body, Date.now() + 10 * 60 * 1000), 'old timestamp rejected')
  assert(!await verifyWebhook(secret, null, null, null, body), 'missing headers rejected')
})
Deno.test('signed email.received webhook fetches the full email and stores it once', async () => {
  const calls: Call[] = []
  const r = await createMailHandler(config, mockFetch(calls))(await signed(JSON.stringify({ type: 'email.received', data: { email_id: 'em_1' } })))
  assert(r.status === 200, 'webhook accepted')
  assert(resendCalls(calls).some(c => c.url.endsWith('/emails/receiving/em_1')), 'full email retrieved')
  const insert = calls.find(c => c.method === 'POST' && c.url.includes('/mail_messages'))!
  const row = insert.body as Record<string, unknown>
  assert(insert.url.includes('on_conflict=resend_id') && String(new Headers(insert.headers).get('Prefer')).includes('ignore-duplicates'), 'duplicates ignored')
  assert(row.direction === 'in' && row.from_address === 'Klant <klant@b.be>' && row.html_body === '<p>Hallo</p>' && row.message_id === '<abc@b.be>', 'stored with display name, body and message id')
})
Deno.test('unsigned or badly signed webhooks are rejected without side effects', async () => {
  const calls: Call[] = []
  const bad = new Request('https://test/functions/v1/mail', { method: 'POST', headers: { 'svix-id': 'x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,AAAA' }, body: '{"type":"email.received","data":{"email_id":"em_1"}}' })
  assert((await createMailHandler(config, mockFetch(calls))(bad)).status === 401, 'bad signature → 401')
  assert(!calls.length, 'nothing fetched or stored')
})
Deno.test('admin actions require an admin', async () => {
  const calls: Call[] = []
  assert((await createMailHandler(config, mockFetch(calls))(action({ action: 'sync' }, ''))).status === 401, 'no token → 401')
  assert((await createMailHandler(config, mockFetch(calls, {}, { admin: false }))(action({ action: 'send', to: 'a@b.be', subject: 'x', text: 'y' }))).status === 403, 'non-admin → 403')
  assert(!resendCalls(calls).length, 'no Resend calls')
})
Deno.test('send validates input, escapes html and stores the sent mail', async () => {
  let calls: Call[] = []
  const h = createMailHandler(config, mockFetch(calls, { 'mail_messages POST': [{ id: msgId }] }))
  assert((await h(action({ action: 'send', to: 'geen-mail', subject: 'x', text: 'y' }))).status === 400, 'bad address rejected')
  assert((await h(action({ action: 'send', to: 'a@b.be', subject: '', text: 'y' }))).status === 400, 'empty subject rejected')
  calls.length = 0
  const r = await h(action({ action: 'send', to: 'A@b.be, c@d.be', subject: 'Hallo', text: '<b>Hoi</b>\nTot dan' }))
  assert(r.status === 200, 'sent')
  const mail = resendCalls(calls)[0].body as { from: string; to: string[]; html: string }
  assert(mail.from === config.mailFrom && mail.to.join() === 'a@b.be,c@d.be', 'sender and normalised recipients')
  assert(mail.html.includes('&lt;b&gt;Hoi&lt;/b&gt;<br>Tot dan'), 'text escaped, line breaks kept')
  assert((calls.find(c => c.method === 'POST' && c.url.endsWith('/mail_messages'))?.body as { direction: string }).direction === 'out', 'stored as sent')
  calls = []
})
Deno.test('replies carry In-Reply-To and References', async () => {
  const calls: Call[] = []
  const h = createMailHandler(config, mockFetch(calls, { 'mail_messages?id': [{ id: msgId, message_id: '<abc@b.be>' }], 'mail_messages POST': [{ id: 'x' }] }))
  const r = await h(action({ action: 'send', to: 'klant@b.be', subject: 'Re: Afspraak', text: 'Graag', replyTo: msgId }))
  assert(r.status === 200, 'reply sent')
  const mail = resendCalls(calls)[0].body as { headers: Record<string, string> }
  assert(mail.headers['In-Reply-To'] === '<abc@b.be>' && mail.headers.References === '<abc@b.be>', 'threading headers set')
})
Deno.test('sync imports only unknown received emails', async () => {
  const calls: Call[] = []
  const r = await createMailHandler(config, mockFetch(calls, { 'mail_messages?select=resend_id': [{ resend_id: 'em_1' }] }, { list: [{ id: 'em_1' }, { id: 'em_2' }] }))(action({ action: 'sync' }))
  assert((await r.json()).added === 1, 'one new email')
  assert(resendCalls(calls).some(c => c.url.endsWith('/emails/receiving/em_2')) && !resendCalls(calls).some(c => c.url.endsWith('/emails/receiving/em_1')), 'known email skipped')
})
Deno.test('attachment returns a signed download link for received mail', async () => {
  const calls: Call[] = []
  const h = createMailHandler(config, mockFetch(calls, { 'mail_messages?id': [{ resend_id: 'em_1' }] }))
  assert((await h(action({ action: 'attachment', messageId: 'x', attachmentId: 'att_1' }))).status === 400, 'bad id rejected')
  const r = await h(action({ action: 'attachment', messageId: msgId, attachmentId: 'att_1' }))
  assert((await r.json()).url.startsWith('https://inbound-cdn.resend.com/'), 'download link returned')
  assert(calls.some(c => c.url.includes('direction=eq.in')), 'only received mail has attachments')
})
