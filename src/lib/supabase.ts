import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(url && key)
// PKCE returns auth links as ?code=…, which does not clash with the HashRouter.
export const supabase = configured ? createClient(url, key, { auth: { flowType: 'pkce' } }) : null
// Base URL of the site without query or hash, used for links in auth and journal emails.
export const siteUrl = () => `${window.location.origin}${window.location.pathname}`
// Calls an edge function and turns its JSON error into a readable message.
// Server messages are Dutch, so pass useServerMessage=false to show the (translated) fallback instead.
export async function callFunction<T = Record<string, unknown>>(name: string, body: object, fallback: string, useServerMessage = true): Promise<T> {
  if (!supabase) throw new Error('Supabase is niet ingesteld.')
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let message = fallback
    if (error.context instanceof Response) { try { const d = await error.context.json(); if (useServerMessage && typeof d.error === 'string') message = d.error } catch { /* keep fallback */ } }
    throw new Error(message)
  }
  return data as T
}
