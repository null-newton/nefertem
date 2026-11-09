const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const resendAfterMs = 10 * 60 * 1000
export type Config = { supabaseUrl: string; anonKey: string; serviceKey: string; resendKey: string; mailFrom: string; siteUrl: string }
type Subscriber = { email: string; token: string; confirmed: boolean; confirm_sent_at: string | null }
type Post = { id: string; title: string; excerpt: string; kind: string; image_url: string }
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
// Wraps content in the shared, inline-styled email layout.
function layout(body: string, footer: string) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f4f1ea;font-family:Helvetica,Arial,sans-serif;color:#393f32"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#faf9f2;border:1px solid #d8d8cc;border-radius:5px" cellpadding="0" cellspacing="0"><tr><td style="padding:36px 32px"><div style="font-family:Georgia,serif;font-size:30px;letter-spacing:-1px">nefertem</div><div style="font-size:10px;letter-spacing:3px;margin:6px 0 28px">SCHOONHEID &amp; ZORG</div>${body}</td></tr></table><p style="font-size:12px;color:#777b6c;max-width:560px;line-height:1.6;margin:18px 0 0">${footer}</p></td></tr></table></body></html>`
}
const button = (href: string, label: string) => `<a href="${esc(href)}" style="display:inline-block;background:#414936;color:#f9f7ee;text-decoration:none;padding:14px 22px;border-radius:2px;font-size:14px">${label}</a>`

export function createJournalHandler(c: Config, f: typeof fetch = fetch) {
  const site = c.siteUrl.replace(/[?#].*$/, '')
  const link = (query: string) => `${site}?${query}`
  const db = (path: string, init: RequestInit = {}) => f(`${c.supabaseUrl}/rest/v1/${path}`, { ...init, signal: AbortSignal.timeout(10000), headers: { apikey: c.serviceKey, ...(c.serviceKey.startsWith('sb_') ? {} : { Authorization: `Bearer ${c.serviceKey}` }), 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers } })
  const rows = async <T>(r: Response): Promise<T[]> => { if (!r.ok) throw new Error(`db ${r.status}`); return await r.json() }
  const send = (emails: object[]) => f('https://api.resend.com/emails/batch', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${c.resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(emails) })
  const unsubscribeLink = (token: string) => link(`afmelden=${token}`)

  async function subscribe(raw: unknown, honeypot: unknown) {
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (email.length > 254 || !emailPattern.test(email)) return [400, { error: 'Vul een geldig e-mailadres in.' }] as const
    const ok = [200, { message: 'Bijna klaar! Bevestig je inschrijving via de link in je mailbox.' }] as const
    if (honeypot) return ok
    let [sub] = await rows<Subscriber>(await db(`subscribers?email=eq.${encodeURIComponent(email)}&select=email,token,confirmed,confirm_sent_at`))
    // Same answer for known and confirmed addresses, so the list cannot be probed; resends are throttled.
    if (sub?.confirmed || (sub?.confirm_sent_at && Date.now() - Date.parse(sub.confirm_sent_at) < resendAfterMs)) return ok
    const now = new Date().toISOString()
    if (sub) await rows(await db(`subscribers?email=eq.${encodeURIComponent(email)}`, { method: 'PATCH', body: JSON.stringify({ confirm_sent_at: now }) }))
    else {
      const r = await db('subscribers', { method: 'POST', body: JSON.stringify({ email, confirm_sent_at: now }) })
      if (r.status === 409) return ok
      ;[sub] = await rows<Subscriber>(r)
    }
    const body = `<h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;margin:0 0 16px">Bevestig je inschrijving</h1><p style="font-size:15px;line-height:1.7;margin:0 0 26px">Fijn dat je het journal van Nefertem wilt volgen. Bevestig je e-mailadres en je krijgt een berichtje zodra er een nieuw verhaal of praktijknieuws verschijnt.</p>${button(link(`bevestig=${sub.token}`), 'Inschrijving bevestigen')}`
    const r = await send([{ from: c.mailFrom, to: [email], subject: 'Bevestig je inschrijving op het Nefertem journal', html: layout(body, 'Heb je je niet ingeschreven? Dan mag je deze e-mail negeren. Zonder bevestiging ontvang je niets.') }])
    if (!r.ok) return [502, { error: 'De bevestigingsmail kon niet worden verstuurd. Probeer later opnieuw.' }] as const
    return ok
  }

  async function confirm(token: unknown) {
    if (typeof token !== 'string' || !uuid.test(token)) return [400, { error: 'Deze bevestigingslink is ongeldig.' }] as const
    const updated = await rows(await db(`subscribers?token=eq.${token}`, { method: 'PATCH', body: JSON.stringify({ confirmed: true }) }))
    return updated.length ? [200, { message: 'Je inschrijving is bevestigd. Je hoort van ons bij een nieuw bericht.' }] as const : [404, { error: 'Deze bevestigingslink is ongeldig of je bent al afgemeld.' }] as const
  }

  async function unsubscribe(token: unknown) {
    if (typeof token !== 'string' || !uuid.test(token)) return [400, { error: 'Deze afmeldlink is ongeldig.' }] as const
    await rows(await db(`subscribers?token=eq.${token}`, { method: 'DELETE' }))
    return [200, { message: 'Je bent afgemeld. Je ontvangt geen e-mails meer van het journal.' }] as const
  }

  async function notify(postId: unknown, authorization: string | null) {
    if (!authorization?.match(/^Bearer \S+$/i)) return [401, { error: 'Log opnieuw in.' }] as const
    const headers = { Authorization: authorization, apikey: c.anonKey }
    const user = await f(`${c.supabaseUrl}/auth/v1/user`, { headers, signal: AbortSignal.timeout(10000) })
    if (!user.ok || !(await user.json())?.id) return [401, { error: 'Log opnieuw in.' }] as const
    const admin = await f(`${c.supabaseUrl}/rest/v1/rpc/is_admin`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) })
    if (!admin.ok || await admin.json() !== true) return [403, { error: 'Alleen beheerders kunnen meldingen versturen.' }] as const
    if (typeof postId !== 'string' || !uuid.test(postId)) return [400, { error: 'Onbekend bericht.' }] as const
    // Claim the post atomically, so a post is announced at most once even with parallel calls.
    const [post] = await rows<Post>(await db(`posts?id=eq.${postId}&published=is.true&notified_at=is.null&select=id,title,excerpt,kind,image_url`, { method: 'PATCH', body: JSON.stringify({ notified_at: new Date().toISOString() }) }))
    if (!post) return [200, { sent: 0, skipped: true }] as const
    const subs = await rows<Subscriber>(await db('subscribers?confirmed=is.true&select=email,token'))
    const url = `${site}#/journal/${post.id}`
    const image = /^https:\/\//.test(post.image_url) ? `<img src="${esc(post.image_url)}" alt="" width="496" style="width:100%;max-width:496px;height:auto;border-radius:3px;margin:0 0 24px;display:block">` : ''
    const html = (token: string) => layout(`<div style="font-size:10px;letter-spacing:1.5px;margin:0 0 12px">${post.kind === 'blog' ? 'NIEUW IN HET JOURNAL' : 'PRAKTIJKNIEUWS'}</div>${image}<h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;line-height:1.1;margin:0 0 16px">${esc(post.title)}</h1><p style="font-size:15px;line-height:1.7;margin:0 0 26px">${esc(post.excerpt)}</p>${button(url, 'Lees verder')}`, `Je ontvangt deze e-mail omdat je je hebt ingeschreven op het journal van Nefertem. <a href="${esc(unsubscribeLink(token))}" style="color:#777b6c">Afmelden</a>`)
    let sent = 0
    for (let i = 0; i < subs.length; i += 100) {
      const batch = subs.slice(i, i + 100).map(s => ({ from: c.mailFrom, to: [s.email], subject: post.title, html: html(s.token), headers: { 'List-Unsubscribe': `<${unsubscribeLink(s.token)}>` } }))
      if ((await send(batch)).ok) sent += batch.length
    }
    // Nothing went out: release the claim so publishing again retries.
    if (subs.length && !sent) { await db(`posts?id=eq.${post.id}`, { method: 'PATCH', body: JSON.stringify({ notified_at: null }) }); return [502, { error: 'De e-mails aan abonnees konden niet worden verstuurd.' }] as const }
    return [200, { sent, failed: subs.length - sent }] as const
  }

  return async (request: Request): Promise<Response> => {
    const json = (status: number, data: unknown) => Response.json(data, { status, headers: corsHeaders })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
    if (request.method !== 'POST') return json(405, { error: 'Gebruik POST.' })
    if (!c.supabaseUrl || !c.serviceKey || !c.resendKey || !c.mailFrom || !c.siteUrl) return json(503, { error: 'E-mails voor het journal zijn nog niet ingesteld.' })
    let input: Record<string, unknown>
    try { input = await request.json() } catch { return json(400, { error: 'Ongeldige aanvraag.' }) }
    try {
      const [status, data] = input.action === 'subscribe' ? await subscribe(input.email, input.website)
        : input.action === 'confirm' ? await confirm(input.token)
        : input.action === 'unsubscribe' ? await unsubscribe(input.token)
        : input.action === 'notify' ? await notify(input.postId, request.headers.get('Authorization'))
        : [400, { error: 'Onbekende actie.' }] as const
      return json(status, data)
    } catch { return json(502, { error: 'Er ging iets mis. Probeer later opnieuw.' }) }
  }
}
