import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Plus, RefreshCw, Reply, Send, Trash2, Paperclip } from 'lucide-react'
import { supabase, callFunction } from './lib/supabase'
import { useData } from './Data'
import { useI18n } from './i18n'
import { Modal, SearchBox } from './Admin'
import type { MailMessage } from './types'

type Folder = 'in' | 'out'
type Draft = { to: string; cc: string; subject: string; text: string; replyTo?: string }
const demoMail = (): MailMessage[] => [
  { id: 'demo-mail-1', direction: 'in', from_address: 'Sofie Peeters <sofie@voorbeeld.be>', to_addresses: ['info@nefertem.be'], cc_addresses: [], reply_to: [], subject: 'Afspraak gelaatsverzorging', text_body: 'Dag Veronique,\n\nIs er volgende week nog plaats voor een gelaatsverzorging? Liefst op woensdagnamiddag.\n\nGroetjes,\nSofie', html_body: '', message_id: '<demo-1@voorbeeld.be>', attachments: [], is_read: false, created_at: new Date(Date.now() - 36e5).toISOString() },
  { id: 'demo-mail-2', direction: 'out', from_address: 'Veronique Wostyn <info@nefertem.be>', to_addresses: ['jan@voorbeeld.be'], cc_addresses: [], reply_to: [], subject: 'Re: Thuisverpleging na operatie', text_body: 'Dag Jan,\n\nDat kan zeker. Ik bel je morgen om de details af te spreken.\n\nVeronique', html_body: '', message_id: '', attachments: [], is_read: true, created_at: new Date(Date.now() - 864e5).toISOString() },
]
// Bare address from "Name <a@b.be>".
const addressOf = (value: string) => value.match(/<([^>]+)>/)?.[1] ?? value.trim()
const nameOf = (value: string) => value.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || value
// Received HTML is shown in a sandboxed frame: no scripts, no forms, only https/data images and inline styles.
const frameDoc = (html: string) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:"><base target="_blank"><style>body{margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;word-break:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`

export function MailPage() {
  const d = useData()
  const { t, date, lang } = useI18n()
  const s = t.mail
  const nl = useRef(lang === 'nl'); nl.current = lang === 'nl'
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [folder, setFolder] = useState<Folder>('in')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<MailMessage | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deleting, setDeleting] = useState<MailMessage | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const texts = useRef(s); texts.current = s

  const load = useCallback(async () => {
    if (d.demo || !supabase) { setMessages(current => current.length ? current : demoMail()); return }
    const { data, error } = await supabase.from('mail_messages').select('id,direction,from_address,to_addresses,cc_addresses,reply_to,subject,text_body,html_body,message_id,attachments,is_read,created_at').order('created_at', { ascending: false }).limit(300)
    if (error) { setError(texts.current.loadFailed); return }
    setMessages(data as MailMessage[])
  }, [d.demo])
  // Pulls mail Resend received but no webhook delivered yet, then reloads the list.
  const sync = useCallback(async () => {
    if (d.demo || !supabase) return
    setSyncing(true)
    try { await callFunction('mail', { action: 'sync' }, texts.current.syncFailed, nl.current); await load() }
    catch (e) { setError((e as Error).message) }
    finally { setSyncing(false) }
  }, [d.demo, load])
  useEffect(() => { void load().then(() => sync()) }, [load, sync])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return messages.filter(m => m.direction === folder && (!q || `${m.subject} ${m.from_address} ${m.to_addresses.join(' ')} ${m.text_body}`.toLowerCase().includes(q)))
  }, [messages, folder, search])
  const unread = messages.filter(m => m.direction === 'in' && !m.is_read).length

  async function openMessage(m: MailMessage) {
    setOpen(m)
    if (m.is_read) return
    setMessages(list => list.map(x => x.id === m.id ? { ...x, is_read: true } : x))
    if (!d.demo && supabase) await supabase.from('mail_messages').update({ is_read: true }).eq('id', m.id)
  }
  function reply(m: MailMessage) {
    const to = m.direction === 'in' ? (m.reply_to[0] || addressOf(m.from_address)) : m.to_addresses.join(', ')
    const quoted = m.text_body ? `\n\n${s.wrote(nameOf(m.from_address), date(m.created_at))}\n${m.text_body.split('\n').map(l => `> ${l}`).join('\n')}` : ''
    setOpen(null)
    setDraft({ to, cc: '', subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`, text: quoted, replyTo: m.direction === 'in' ? m.id : undefined })
  }
  async function remove() {
    if (!deleting) return
    setError('')
    if (!d.demo && supabase) { const { error } = await supabase.from('mail_messages').delete().eq('id', deleting.id); if (error) { setError(error.message); return } }
    setMessages(list => list.filter(x => x.id !== deleting.id)); setDeleting(null); setOpen(null)
  }

  return <>
    <span className="eyebrow mail-kicker">{s.kicker}</span>
    {d.demo && <p className="form-success">{s.demo}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status" className="form-success">{notice}</p>}
    <div className="mail-toolbar">
      <div className="mail-tabs" role="tablist">
        <button role="tab" aria-selected={folder === 'in'} className={folder === 'in' ? 'active' : ''} onClick={() => setFolder('in')}>{s.inbox}{unread > 0 && <span className="mail-count">{s.unread(unread)}</span>}</button>
        <button role="tab" aria-selected={folder === 'out'} className={folder === 'out' ? 'active' : ''} onClick={() => setFolder('out')}>{s.sent}</button>
      </div>
      <div className="mail-actions">
        <button className="button outline" disabled={syncing || d.demo} onClick={() => void sync()}><RefreshCw size={16} className={syncing ? 'spin' : ''} />{syncing ? s.refreshing : s.refresh}</button>
        <button className="button dark" onClick={() => { setNotice(''); setDraft({ to: '', cc: '', subject: '', text: '' }) }}><Plus size={17} />{s.compose}</button>
      </div>
    </div>
    <SearchBox value={search} onChange={setSearch} />
    <div className="table-wrap"><table className="mail-table"><thead><tr><th>{folder === 'in' ? s.from : s.to}</th><th>{s.subject}</th><th>{s.date}</th></tr></thead><tbody>
      {shown.map(m => <tr key={m.id} className={m.is_read ? '' : 'unread'} onClick={() => void openMessage(m)}>
        <td>{folder === 'in' ? nameOf(m.from_address) : m.to_addresses.join(', ')}</td>
        <td><button className="mail-open" aria-label={s.open(m.subject || s.noSubject)} onClick={e => { e.stopPropagation(); void openMessage(m) }}>{m.subject || s.noSubject}</button>{m.attachments.length > 0 && <Paperclip size={13} className="mail-clip" aria-label={s.attachments} />}<span className="table-sub">{m.text_body.replace(/\s+/g, ' ').slice(0, 110)}</span></td>
        <td className="mail-date">{date(m.created_at)}</td>
      </tr>)}
      {!shown.length && <tr><td colSpan={3}>{folder === 'in' ? s.emptyInbox : s.emptySent}</td></tr>}
    </tbody></table></div>
    {open && <MessageView message={open} onClose={() => setOpen(null)} onReply={() => reply(open)} onDelete={() => setDeleting(open)} />}
    {draft && <Compose draft={draft} onClose={() => setDraft(null)} onSent={async sent => { setDraft(null); setNotice(s.sentOk); setFolder('out'); if (sent) setMessages(list => [sent, ...list]); else await load() }} />}
    {deleting && <Modal title={s.deleteTitle} onClose={() => setDeleting(null)}><p>{s.deleteText}</p><div className="form-actions"><button className="button outline" onClick={() => setDeleting(null)}>{t.common.cancel}</button><button className="button danger" onClick={() => void remove()}>{t.common.delete}</button></div></Modal>}
  </>
}

function MessageView({ message: m, onClose, onReply, onDelete }: { message: MailMessage; onClose: () => void; onReply: () => void; onDelete: () => void }) {
  const d = useData()
  const { t, lang } = useI18n()
  const s = t.mail
  const [error, setError] = useState('')
  const when = new Date(m.created_at).toLocaleString()
  // Links are short-lived and signed, so they are requested only when clicked.
  async function download(attachmentId: string) {
    setError('')
    if (d.demo) return
    try { const { url } = await callFunction<{ url: string }>('mail', { action: 'attachment', messageId: m.id, attachmentId }, s.attachmentFailed, lang === 'nl'); window.open(url, '_blank', 'noopener') }
    catch (e) { setError((e as Error).message) }
  }
  return <Modal title={m.subject || s.noSubject} onClose={onClose}>
    <dl className="mail-meta"><dt>{s.from}</dt><dd>{m.from_address}</dd><dt>{s.to}</dt><dd>{m.to_addresses.join(', ')}</dd>{m.cc_addresses.length > 0 && <><dt>Cc</dt><dd>{m.cc_addresses.join(', ')}</dd></>}<dt>{s.date}</dt><dd>{when}</dd></dl>
    {m.html_body ? <iframe className="mail-frame" title={m.subject || s.noSubject} sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={frameDoc(m.html_body)} /> : <pre className="mail-text">{m.text_body}</pre>}
    {m.attachments.length > 0 && <div className="mail-attachments"><span className="eyebrow">{s.attachments}</span>{m.attachments.map(a => <button key={a.id} type="button" className="small-button" onClick={() => void download(a.id)}><Paperclip size={14} />{a.filename || a.id}{a.size ? ` · ${Math.max(1, Math.round(a.size / 1024))} kB` : ''}</button>)}</div>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button className="button outline" onClick={onDelete}><Trash2 size={16} />{t.common.delete}</button><button className="button dark" onClick={onReply}><Reply size={16} />{s.reply}</button></div>
  </Modal>
}

function Compose({ draft, onClose, onSent }: { draft: Draft; onClose: () => void; onSent: (local: MailMessage | null) => void }) {
  const d = useData()
  const { t, lang } = useI18n()
  const s = t.mail
  const [v, setV] = useState(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      if (d.demo) { onSent({ id: crypto.randomUUID(), direction: 'out', from_address: 'Veronique Wostyn', to_addresses: v.to.split(',').map(x => x.trim()).filter(Boolean), cc_addresses: [], reply_to: [], subject: v.subject, text_body: v.text, html_body: '', message_id: '', attachments: [], is_read: true, created_at: new Date().toISOString() }); return }
      await callFunction('mail', { action: 'send', to: v.to, cc: v.cc, subject: v.subject, text: v.text, ...(v.replyTo ? { replyTo: v.replyTo } : {}) }, s.sendFailed, lang === 'nl')
      onSent(null)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <Modal title={v.replyTo ? s.reply : s.compose} onClose={onClose}><form onSubmit={submit}>
    <label>{s.to}<input required value={v.to} onChange={e => setV({ ...v, to: e.target.value })} autoComplete="email" /><span className="table-sub">{s.toHint}</span></label>
    <label>{s.cc}<input value={v.cc} onChange={e => setV({ ...v, cc: e.target.value })} /></label>
    <label>{s.subject}<input required maxLength={300} value={v.subject} onChange={e => setV({ ...v, subject: e.target.value })} /></label>
    <label>{s.body}<textarea required rows={10} maxLength={50000} value={v.text} onChange={e => setV({ ...v, text: e.target.value })} /></label>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button type="button" className="button outline" onClick={onClose}>{t.common.cancel}</button><button className="button dark" disabled={busy}>{busy ? s.sending : s.send}<Send size={16} /></button></div>
  </form></Modal>
}
