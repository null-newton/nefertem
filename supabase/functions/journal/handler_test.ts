import { createJournalHandler } from './handler.ts'

const config = { supabaseUrl: 'https://test.supabase.co', anonKey: 'public-key', serviceKey: 'service-key', resendKey: 'resend-key', mailFrom: 'Nefertem <journal@test.be>', siteUrl: 'https://site.test/' }
const token = '11111111-2222-4333-8444-555555555555'
const postId = '99999999-2222-4333-8444-555555555555'
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
type Call = { url: string; method: string; body: unknown }
// Fake Supabase REST/Auth and Resend; `db` maps a URL prefix to a JSON response.
function mockFetch(calls: Call[], db: Record<string, unknown> = {}, opts: { admin?: boolean; resendOk?: boolean } = {}) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? 'GET', body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined
    calls.push({ url, method, body })
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user' })
    if (url.endsWith('/rpc/is_admin')) return Response.json(opts.admin ?? true)
    if (url.startsWith('https://api.resend.com')) return opts.resendOk === false ? new Response('nope', { status: 500 }) : Response.json({ data: [] })
    const key = Object.keys(db).find(k => url.includes(k) && (k.split(' ')[1] ?? 'GET') === method) ?? Object.keys(db).find(k => url.includes(k.split(' ')[0]) && k.split(' ')[1] === method)
    return Response.json(key ? db[key] : [])
  }) as typeof fetch
}
const post = (body: object, auth?: string) => new Request('https://test/functions/v1/journal', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) })
const resendCalls = (calls: Call[]) => calls.filter(c => c.url.startsWith('https://api.resend.com'))

Deno.test('rejects invalid email without touching the database', async () => {
  const calls: Call[] = []
  const r = await createJournalHandler(config, mockFetch(calls))(post({ action: 'subscribe', email: 'geen-mail' }))
  assert(r.status === 400 && !calls.length, 'invalid email must be rejected locally')
})
Deno.test('new subscriber gets a confirmation link, stored lowercase', async () => {
  const calls: Call[] = []
  const r = await createJournalHandler(config, mockFetch(calls, { 'subscribers POST': [{ email: 'a@b.be', token, confirmed: false }] }))(post({ action: 'subscribe', email: ' A@B.be ' }))
  assert(r.status === 200, 'subscribe must succeed')
  assert((calls.find(c => c.method === 'POST' && c.url.endsWith('/subscribers'))?.body as { email: string }).email === 'a@b.be', 'email must be normalised')
  const [mail] = resendCalls(calls)
  assert(JSON.stringify(mail.body).includes(`https://site.test/?bevestig=${token}`), 'confirmation link must point to the site')
})
Deno.test('confirmed or recently mailed addresses get no extra email', async () => {
  for (const sub of [{ confirmed: true, confirm_sent_at: null }, { confirmed: false, confirm_sent_at: new Date().toISOString() }]) {
    const calls: Call[] = []
    const r = await createJournalHandler(config, mockFetch(calls, { 'subscribers?email': [{ email: 'a@b.be', token, ...sub }] }))(post({ action: 'subscribe', email: 'a@b.be' }))
    assert(r.status === 200 && !resendCalls(calls).length, 'no email may be sent')
  }
})
Deno.test('honeypot submissions are silently ignored', async () => {
  const calls: Call[] = []
  const r = await createJournalHandler(config, mockFetch(calls))(post({ action: 'subscribe', email: 'a@b.be', website: 'spam' }))
  assert(r.status === 200 && !calls.length, 'bots get a success without side effects')
})
Deno.test('confirm and unsubscribe validate the token', async () => {
  const calls: Call[] = []
  const h = createJournalHandler(config, mockFetch(calls, { 'subscribers?token PATCH': [{ token }] }))
  assert((await h(post({ action: 'confirm', token: 'x' }))).status === 400, 'bad token rejected')
  assert((await h(post({ action: 'confirm', token }))).status === 200, 'valid token confirms')
  assert((await h(post({ action: 'unsubscribe', token }))).status === 200, 'unsubscribe succeeds')
  assert(calls.some(c => c.method === 'DELETE' && c.url.includes(`token=eq.${token}`)), 'unsubscribe deletes the row')
})
Deno.test('notify requires an admin', async () => {
  const calls: Call[] = []
  assert((await createJournalHandler(config, mockFetch(calls))(post({ action: 'notify', postId }))).status === 401, 'no token → 401')
  assert((await createJournalHandler(config, mockFetch(calls, {}, { admin: false }))(post({ action: 'notify', postId }, 'Bearer u'))).status === 403, 'non-admin → 403')
  assert(!resendCalls(calls).length, 'no emails for unauthorised calls')
})
Deno.test('notify mails each confirmed subscriber once with their own unsubscribe link', async () => {
  const calls: Call[] = []
  const subs = Array.from({ length: 150 }, (_, i) => ({ email: `s${i}@b.be`, token: token.replace(/5{12}$/, String(i).padStart(12, '0')) }))
  const r = await createJournalHandler(config, mockFetch(calls, { 'posts?id PATCH': [{ id: postId, title: '<Nieuw>', excerpt: 'Kort', kind: 'blog', image_url: '' }], 'subscribers?confirmed': subs }))(post({ action: 'notify', postId }, 'Bearer u'))
  const data = await r.json()
  assert(r.status === 200 && data.sent === 150, 'all subscribers must be mailed')
  const batches = resendCalls(calls)
  assert(batches.length === 2, 'batches of at most 100')
  const first = (batches[0].body as { html: string; to: string[] }[])[0]
  assert(first.html.includes('&lt;Nieuw&gt;') && first.html.includes(`afmelden=${subs[0].token}`) && first.html.includes(`#/journal/${postId}`), 'escaped title, personal unsubscribe and post link')
  assert(calls.some(c => c.url.includes('notified_at=is.null') && c.method === 'PATCH'), 'post must be claimed atomically')
})
Deno.test('already announced posts are skipped; total failure releases the claim', async () => {
  let calls: Call[] = []
  const skipped = await (await createJournalHandler(config, mockFetch(calls))(post({ action: 'notify', postId }, 'Bearer u'))).json()
  assert(skipped.skipped && !resendCalls(calls).length, 'no claim → no emails')
  calls = []
  const r = await createJournalHandler(config, mockFetch(calls, { 'posts?id PATCH': [{ id: postId, title: 'T', excerpt: '', kind: 'blog', image_url: '' }], 'subscribers?confirmed': [{ email: 'a@b.be', token }] }, { resendOk: false }))(post({ action: 'notify', postId }, 'Bearer u'))
  assert(r.status === 502, 'failure reported')
  assert(calls.some(c => c.method === 'PATCH' && (c.body as { notified_at: unknown })?.notified_at === null), 'claim released for retry')
})
