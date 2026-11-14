// Inbox for the admin area, built on Resend instead of IMAP/SMTP:
// - Resend receives mail for the domain (MX record) and calls this function with an `email.received` webhook.
// - Admins send mail and replies through the Resend API; both directions are stored in public.mail_messages.
// - `sync` pulls recent received mail from the Resend API, so nothing is lost if a webhook was missed.
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/
const toleranceSeconds = 5 * 60
// Contact form limits: per visitor (IP) short and daily, per sender address, and for the whole site.
export const limits = { ipShort: { max: 3, ms: 10 * 6e4 }, ipDay: { max: 10, ms: 864e5 }, address: { max: 5, ms: 36e5 }, site: { max: 50, ms: 36e5 } }
// Client IP as forwarded by the Supabase edge gateway.
const clientIp = (h: Headers) => (h.get('cf-connecting-ip') || h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim()
export type Config = { supabaseUrl: string; anonKey: string; serviceKey: string; resendKey: string; mailFrom: string; webhookSecret?: string }
type Received = { id: string; from: string; to?: string[]; cc?: string[]; reply_to?: string[]; subject?: string; html?: string | null; text?: string | null; headers?: Record<string, string>; message_id?: string; created_at?: string; attachments?: { id: string; filename?: string; content_type?: string; size?: number }[] }
type Stored = { id: string; resend_id: string; direction: 'in' | 'out'; from_address: string; reply_to: string[]; subject: string; text_body: string; message_id: string; in_reply_to: string; created_at: string }
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)))

// Svix scheme used by Resend webhooks: HMAC-SHA256 over "id.timestamp.body" with the base64 secret after "whsec_".
export async function verifyWebhook(secret: string, id: string | null, timestamp: string | null, signatures: string | null, body: string, now = Date.now()) {
  if (!secret || !id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false
  if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSeconds) return false
  let key: Uint8Array<ArrayBuffer>
  try { key = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0)) } catch { return false }
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = b64(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))
  return signatures.split(' ').some(part => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig || sig.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
    return diff === 0
  })
}

// Accepts "a@b.be, c@d.be" or an array; returns lowercase addresses or null when any is invalid.
function addresses(value: unknown, max = 50): string[] | null {
  const list = (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]/) : []).map(v => typeof v === 'string' ? v.trim().toLowerCase() : '').filter(Boolean)
  if (list.length > max || list.some(a => a.length > 254 || !emailPattern.test(a))) return null
  return [...new Set(list)]
}
// Plain text to simple HTML, keeping line breaks.
const textToHtml = (text: string) => `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">${esc(text).replace(/\r?\n/g, '<br>')}</div>`

export function createMailHandler(c: Config, f: typeof fetch = fetch) {
  const db = (path: string, init: RequestInit = {}) => f(`${c.supabaseUrl}/rest/v1/${path}`, { ...init, signal: AbortSignal.timeout(10000), headers: { apikey: c.serviceKey, ...(c.serviceKey.startsWith('sb_') ? {} : { Authorization: `Bearer ${c.serviceKey}` }), 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers } })
  const rows = async <T>(r: Response): Promise<T[]> => { if (!r.ok) throw new Error(`db ${r.status}`); return await r.json() }
  const resend = (path: string, init: RequestInit = {}) => f(`https://api.resend.com${path}`, { ...init, signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${c.resendKey}`, 'Content-Type': 'application/json', ...init.headers } })

  // Fetches the full received email (webhooks carry no body) and stores it once.
  async function ingest(emailId: string) {
    const r = await resend(`/emails/receiving/${encodeURIComponent(emailId)}`)
    if (!r.ok) throw new Error(`resend ${r.status}`)
    const m: Received = await r.json()
    const row = {
      resend_id: m.id, direction: 'in', from_address: m.headers?.from || m.from || '', to_addresses: m.to ?? [], cc_addresses: m.cc ?? [], reply_to: m.reply_to?.length ? m.reply_to : (m.headers?.['reply-to'] ? [m.headers['reply-to'].match(/<([^>]+)>/)?.[1] ?? m.headers['reply-to'].trim()] : []),
      subject: m.subject ?? '', text_body: m.text ?? '', html_body: m.html ?? '', message_id: m.message_id ?? '',
      in_reply_to: m.headers?.['in-reply-to'] ?? '', created_at: m.created_at ?? new Date().toISOString(),
      attachments: (m.attachments ?? []).map(a => ({ id: a.id, filename: a.filename ?? '', content_type: a.content_type ?? '', size: a.size ?? 0 })),
    }
    const saved = await db('mail_messages?on_conflict=resend_id', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' }, body: JSON.stringify(row) })
    if (!saved.ok) throw new Error(`db ${saved.status}`)
  }

  async function webhook(request: Request) {
    if (!c.webhookSecret) return [503, { error: 'Webhook is niet ingesteld.' }] as const
    const body = await request.text()
    const h = request.headers
    if (!await verifyWebhook(c.webhookSecret, h.get('svix-id'), h.get('svix-timestamp'), h.get('svix-signature'), body)) return [401, { error: 'Ongeldige handtekening.' }] as const
    let event: { type?: string; data?: { email_id?: string } }
    try { event = JSON.parse(body) } catch { return [400, { error: 'Ongeldige aanvraag.' }] as const }
    if (event.type === 'email.received' && typeof event.data?.email_id === 'string') await ingest(event.data.email_id)
    return [200, { ok: true }] as const
  }

  async function requireAdmin(authorization: string | null) {
    if (!authorization?.match(/^Bearer \S+$/i)) return [401, { error: 'Log opnieuw in.' }] as const
    const headers = { Authorization: authorization, apikey: c.anonKey }
    const user = await f(`${c.supabaseUrl}/auth/v1/user`, { headers, signal: AbortSignal.timeout(10000) })
    if (!user.ok || !(await user.json())?.id) return [401, { error: 'Log opnieuw in.' }] as const
    const admin = await f(`${c.supabaseUrl}/rest/v1/rpc/is_admin`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) })
    if (!admin.ok || await admin.json() !== true) return [403, { error: 'Alleen beheerders kunnen e-mail gebruiken.' }] as const
    return null
  }

  async function send(input: Record<string, unknown>) {
    const to = addresses(input.to), cc = addresses(input.cc ?? '')
    if (!to?.length || !cc) return [400, { error: 'Vul geldige e-mailadressen in (maximaal 50).' }] as const
    const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
    const text = typeof input.text === 'string' ? input.text : ''
    if (!subject || subject.length > 300) return [400, { error: 'Vul een onderwerp in (maximaal 300 tekens).' }] as const
    if (!text.trim() || text.length > 50000) return [400, { error: 'Schrijf een bericht (maximaal 50.000 tekens).' }] as const
    // Replies carry In-Reply-To/References so the recipient's mail app threads them.
    let original: Stored | undefined
    if (input.replyTo !== undefined) {
      if (typeof input.replyTo !== 'string' || !uuid.test(input.replyTo)) return [400, { error: 'Onbekend bericht.' }] as const
      ;[original] = await rows<Stored>(await db(`mail_messages?id=eq.${input.replyTo}&select=id,message_id`))
      if (!original) return [404, { error: 'Het oorspronkelijke bericht bestaat niet meer.' }] as const
    }
    const headers = original?.message_id ? { 'In-Reply-To': original.message_id, References: original.message_id } : undefined
    const r = await resend('/emails', { method: 'POST', body: JSON.stringify({ from: c.mailFrom, to, ...(cc.length ? { cc } : {}), subject, text, html: textToHtml(text), ...(headers ? { headers } : {}) }) })
    if (!r.ok) return [502, { error: 'De e-mail kon niet worden verstuurd. Controleer het afzenderdomein bij Resend.' }] as const
    const { id } = await r.json()
    const [saved] = await rows<Stored>(await db('mail_messages', { method: 'POST', body: JSON.stringify({ resend_id: id, direction: 'out', from_address: c.mailFrom, to_addresses: to, cc_addresses: cc, subject, text_body: text, html_body: '', in_reply_to: original?.message_id ?? '', is_read: true }) }))
    return [200, { id: saved?.id, message: 'De e-mail is verstuurd.' }] as const
  }

  // Rate limiter for the public contact form. Counts are kept per hashed IP (contact_attempts), per sender address
  // (the stored messages) and for the whole site, so one visitor cannot flood the inbox and a botnet is capped too.
  async function rateLimit(email: string, ip: string): Promise<string | null> {
    const now = Date.now(), ago = (ms: number) => encodeURIComponent(new Date(now - ms).toISOString())
    const busy = 'Je hebt al enkele berichten gestuurd. Probeer het later opnieuw.'
    const ipHash = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nefertem-contact:${ip}`)))
    const count = async (path: string) => (await rows<unknown>(await db(path))).length
    const [ipShort, ipDay, address, site] = await Promise.all([
      count(`contact_attempts?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${ago(limits.ipShort.ms)}&limit=${limits.ipShort.max}`),
      count(`contact_attempts?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${ago(limits.ipDay.ms)}&limit=${limits.ipDay.max}`),
      count(`mail_messages?select=id&direction=eq.in&reply_to=cs.${encodeURIComponent(`{"${email}"}`)}&created_at=gte.${ago(limits.address.ms)}&limit=${limits.address.max}`),
      count(`contact_attempts?select=id&created_at=gte.${ago(limits.site.ms)}&limit=${limits.site.max}`),
    ])
    if (site >= limits.site.max) return 'Het contactformulier is even erg druk. Probeer het later opnieuw of bel ons.'
    if (ipShort >= limits.ipShort.max || ipDay >= limits.ipDay.max || address >= limits.address.max) return busy
    const logged = await db('contact_attempts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ip_hash: ipHash }) })
    if (!logged.ok) throw new Error(`db ${logged.status}`)
    // Housekeeping: drop attempts older than a day (cheap, indexed on created_at).
    await db(`contact_attempts?created_at=lt.${ago(864e5)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => {})
    return null
  }

  // Public contact form: mailed to the inbox address via Resend, with the visitor as reply address.
  async function contact(input: Record<string, unknown>, ip: string) {
    const str = (v: unknown) => typeof v === 'string' ? v.trim() : ''
    const name = str(input.name).replace(/[\r\n<>"]/g, ' ').slice(0, 120).trim(), email = str(input.email).toLowerCase(), subject = str(input.subject).replace(/[\r\n]/g, ' ')
    const message = typeof input.message === 'string' ? input.message.trim() : ''
    if (!name) return [400, { error: 'Vul je naam in.' }] as const
    if (email.length > 254 || !emailPattern.test(email)) return [400, { error: 'Vul een geldig e-mailadres in.' }] as const
    if (!subject || subject.length > 200) return [400, { error: 'Vul een onderwerp in (maximaal 200 tekens).' }] as const
    if (!message || message.length > 5000) return [400, { error: 'Schrijf een bericht (maximaal 5.000 tekens).' }] as const
    const ok = [200, { message: 'Bedankt! Je bericht is verstuurd. Veronique neemt zo snel mogelijk contact met je op.' }] as const
    if (input.website) return ok // honeypot: bots fill every field
    const limited = await rateLimit(email, ip)
    if (limited) return [429, { error: limited }] as const
    // Sent through Resend to our own receiving address, so it arrives like any other mail: visible in Resend
    // and stored in the inbox by the email.received webhook. Reply-To is the visitor, so "Beantwoorden" reaches them.
    const inbox = c.mailFrom.match(/<([^>]+)>/)?.[1] ?? c.mailFrom
    const text = `${message}\n\n—\nVia het contactformulier van de website\nNaam: ${name}\nE-mail: ${email}`
    const r = await resend('/emails', { method: 'POST', body: JSON.stringify({ from: `${name} via Nefertem <${inbox}>`, to: [inbox], reply_to: email, subject: `Contactformulier: ${subject}`, text, html: textToHtml(text) }) })
    if (!r.ok) throw new Error(`resend ${r.status}`)
    return ok
  }

  // Imports received mail that is not stored yet (newest first, stops at the first known page).
  async function sync() {
    const r = await resend('/emails/receiving?limit=50')
    if (r.status === 401 || r.status === 403) return [502, { error: 'De Resend-sleutel mag geen ontvangen e-mails lezen. Zet een sleutel met "Full access" in RESEND_INBOX_API_KEY.' }] as const
    if (!r.ok) return [502, { error: 'Resend kon niet worden bereikt.' }] as const
    const list: { data?: { id: string }[] } = await r.json()
    const ids = (list.data ?? []).map(m => m.id).filter(id => /^[\w-]{1,100}$/.test(id))
    if (!ids.length) return [200, { added: 0 }] as const
    const known = new Set((await rows<{ resend_id: string }>(await db(`mail_messages?select=resend_id&resend_id=in.(${ids.map(id => `"${id}"`).join(',')})`))).map(k => k.resend_id))
    let added = 0
    for (const id of ids.filter(id => !known.has(id))) {
      try { await ingest(id); added++ } catch { break } // e.g. rate limit: the rest follows on the next sync
    }
    return [200, { added }] as const
  }

  // Returns a short-lived download link for an attachment of a received message.
  async function attachment(messageId: unknown, attachmentId: unknown) {
    if (typeof messageId !== 'string' || !uuid.test(messageId) || typeof attachmentId !== 'string' || !/^[\w-]{1,100}$/.test(attachmentId)) return [400, { error: 'Onbekende bijlage.' }] as const
    const [m] = await rows<Stored>(await db(`mail_messages?id=eq.${messageId}&direction=eq.in&select=resend_id`))
    if (!m) return [404, { error: 'Onbekende bijlage.' }] as const
    const r = await resend(`/emails/receiving/${encodeURIComponent(m.resend_id)}/attachments/${attachmentId}`)
    if (!r.ok) return [502, { error: 'De bijlage kon niet worden opgehaald.' }] as const
    const a = await r.json()
    return typeof a.download_url === 'string' && a.download_url.startsWith('https://') ? [200, { url: a.download_url }] as const : [502, { error: 'De bijlage kon niet worden opgehaald.' }] as const
  }

  return async (request: Request): Promise<Response> => {
    const json = (status: number, data: unknown) => Response.json(data, { status, headers: corsHeaders })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
    if (request.method !== 'POST') return json(405, { error: 'Gebruik POST.' })
    if (!c.supabaseUrl || !c.serviceKey || !c.resendKey || !c.mailFrom) return json(503, { error: 'E-mail via Resend is nog niet ingesteld.' })
    try {
      if (request.headers.has('svix-id')) { const [status, data] = await webhook(request); return json(status, data) }
      let input: Record<string, unknown>
      try { input = await request.json() } catch { return json(400, { error: 'Ongeldige aanvraag.' }) }
      if (!input || typeof input !== 'object') return json(400, { error: 'Ongeldige aanvraag.' })
      // The contact form is public; every other action is for admins only.
      if (input.action === 'contact') { const [status, data] = await contact(input, clientIp(request.headers)); return json(status, data) }
      const denied = await requireAdmin(request.headers.get('Authorization'))
      if (denied) return json(denied[0], denied[1])
      const [status, data] = input.action === 'send' ? await send(input)
        : input.action === 'sync' ? await sync()
        : input.action === 'attachment' ? await attachment(input.messageId, input.attachmentId)
        : [400, { error: 'Onbekende actie.' }] as const
      return json(status, data)
    } catch { return json(502, { error: 'Er ging iets mis. Probeer later opnieuw.' }) }
  }
}
