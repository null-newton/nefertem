import { useRef, useState, type ChangeEvent } from 'react'
import { Upload, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { safeImageUrl } from './lib/validation.mjs'
import { useI18n } from './i18n'

export function ImageField({ value, onChange, onBusyChange, disabled, demo, title, note }: {
  value: string
  onChange: (url: string) => void
  onBusyChange: (busy: boolean) => void
  disabled: boolean
  demo: boolean
  title?: string
  note?: string
}) {
  const { t, lang } = useI18n()
  const m = t.image
  const picker = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const url = safeImageUrl(value)
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { setError(m.badType); return }
    if (!file.size || file.size > 5 * 1024 * 1024) { setError(m.tooBig); return }
    if (!supabase || demo) { setError(m.loginFirst); return }
    setUploading(true)
    onBusyChange(true)
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) throw new Error(m.relogin)
      const body = new FormData()
      body.set('image', file)
      const { data, error: uploadError } = await supabase.functions.invoke('upload-image', { body })
      if (uploadError) {
        let message = m.uploadFailed
        // The upload function answers in Dutch; only show its detail when the interface is Dutch.
        if (lang === 'nl' && uploadError.context instanceof Response) {
          try { const details = await uploadError.context.json(); if (typeof details.error === 'string') message = details.error } catch { /* Keep the fallback message. */ }
        }
        throw new Error(message)
      }
      if (!data?.url || !safeImageUrl(data.url)) throw new Error(m.badLink)
      onChange(data.url)
      setFailedUrl(null)
    } catch (error) { setError(error instanceof Error ? error.message : m.retry) }
    finally { setUploading(false); onBusyChange(false) }
  }
  return <div className="image-field">
    <span className="image-field-title">{title ?? m.optional}</span>
    {note && <p className="small-text image-field-note">{note}</p>}
    <input ref={picker} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => void upload(event)} disabled={disabled || uploading || demo} aria-label={m.choose} />
    <button type="button" className="button outline" disabled={disabled || uploading || demo} onClick={() => picker.current?.click()}><Upload size={17} />{uploading ? m.uploading : m.upload}</button>
    <p className="small-text">{demo ? m.demoHint : m.hint}</p>
    {uploading && <p role="status" className="small-text">{m.busy}</p>}
    {url && <div className="image-field-preview">{failedUrl !== url ? <img src={url} alt={m.previewAlt} onError={() => setFailedUrl(url)} /> : <p>{m.cannotLoad}</p>}<button type="button" aria-label={m.remove} disabled={disabled || uploading} onClick={() => { onChange(''); setError('') }}><X size={18} /></button></div>}
    <label>{m.paste}<input type="url" placeholder="https://…" value={value} disabled={disabled || uploading} onChange={event => { onChange(event.target.value); setError('') }} /></label>
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>
}
