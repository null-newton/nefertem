import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Product, Post, Inventory, Movement, Settings } from './types'
import { demoProducts, demoPosts, defaultSettings } from './demo'
import { supabase, callFunction } from './lib/supabase'
import { useI18n } from './i18n'
type DataState = { products: Product[]; posts: Post[]; inventory: Inventory[]; movements: Movement[]; settings: Settings }
const initial: DataState = { products: [], posts: [], inventory: [], movements: [], settings: defaultSettings }
type DataContext = DataState & { loading: boolean; error: string; demo: boolean; reload: (admin?: boolean) => Promise<void>; enterDemo: () => void; save: (table: string, value: object) => Promise<void>; setPublished: (table: 'products' | 'posts', id: string, published: boolean) => Promise<void>; remove: (table: string, id: string) => Promise<void>; adjust: (id: string, delta: number, note: string) => Promise<void> }
const Context = createContext<DataContext>(null!)
export function DataProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [data, setData] = useState<DataState>(initial)
  const [demo, setDemo] = useState(!supabase)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const demoState = useCallback((): DataState => {
    try { const saved = localStorage.getItem('lotusbloem-demo-v1'); if (saved) return JSON.parse(saved) } catch { /* local storage may be disabled */ }
    return { products: demoProducts, posts: demoPosts, settings: defaultSettings, inventory: [{ product_id: 'demo-2', quantity: 8, minimum: 3, sku: 'LB-001' }], movements: [] }
  }, [])
  const reload = useCallback(async (admin = false) => {
    setLoading(true); setError('')
    try {
      if (demo || !supabase) { setData(demoState()); return }
      let productsQuery = supabase.from('products').select('*').order('created_at', { ascending: false })
      let postsQuery = supabase.from('posts').select('*').order('created_at', { ascending: false })
      if (!admin) { productsQuery = productsQuery.eq('published', true); postsQuery = postsQuery.eq('published', true) }
      const results = await Promise.all([productsQuery, postsQuery, supabase.from('practice_settings').select('*').eq('id', 1).maybeSingle(), ...(admin ? [supabase.from('inventory').select('*'), supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(50)] : [])])
      const failure = results.find(r => r.error)?.error
      if (failure) throw failure
      setData({ products: results[0].data as Product[], posts: results[1].data as Post[], settings: (results[2].data as Settings) || defaultSettings, inventory: admin ? results[3].data as Inventory[] : [], movements: admin ? results[4].data as Movement[] : [] })
    } catch { setError(admin ? 'admin' : 'public') } finally { setLoading(false) }
  }, [demo, demoState])
  useEffect(() => { void reload() }, [reload])
  // Emails confirmed journal subscribers about a newly published post (server ignores repeats).
  async function announce(postId: string) {
    try { await callFunction('journal', { action: 'notify', postId }, t.data.unknown) }
    catch (e) { throw new Error(t.data.announce((e as Error).message)) }
  }
  function updateDemo(next: DataState) { localStorage.setItem('lotusbloem-demo-v1', JSON.stringify(next)); setData(next) }
  // error holds a key so the message follows the current language.
  const value: DataContext = { ...data, demo, loading, error: error === 'admin' ? t.status.adminError : error === 'public' ? t.status.publicError : error, reload,
    enterDemo: () => { setDemo(true); setData(demoState()) },
    save: async (table, row) => {
      if (demo) {
        const next = { ...data }
        if (table === 'practice_settings') next.settings = row as Settings
        else if (table === 'inventory') { const item = row as Inventory; const prior = data.inventory.find(x => x.product_id === item.product_id); next.inventory = [...data.inventory.filter(x => x.product_id !== item.product_id), { ...item, quantity: prior?.quantity ?? 0 }] }
        else if (table === 'products') { const item = row as Product; const saved = { ...item, id: item.id || crypto.randomUUID(), created_at: item.created_at || new Date().toISOString() }; next.products = [...data.products.filter(x => x.id !== saved.id), saved] }
        else if (table === 'posts') { const item = row as Post; const saved = { ...item, id: item.id || crypto.randomUUID(), created_at: item.created_at || new Date().toISOString() }; next.posts = [...data.posts.filter(x => x.id !== saved.id), saved] }
        updateDemo(next); return
      }
      if (!supabase) throw new Error(t.common.supabaseMissing)
      const result = table === 'practice_settings'
        ? await supabase.from(table).update(row).eq('id', 1)
        : table === 'inventory'
          ? await supabase.from(table).update({ minimum: (row as Inventory).minimum, sku: (row as Inventory).sku }).eq('product_id', (row as Inventory).product_id)
          : await supabase.from(table).upsert(row)
      const { error } = result
      if (error) throw new Error(error.message)
      await reload(true)
      if (table === 'posts' && (row as Post).published && !(row as Post).notified_at) await announce((row as Post).id)
    },
    setPublished: async (table, id, published) => {
      if (!demo) {
        if (!supabase) throw new Error(t.common.supabaseMissing)
        const { error } = await supabase.from(table).update({ published }).eq('id', id).select('id').single()
        if (error) throw new Error(t.data.visibility)
      }
      setData(current => {
        const next = { ...current, [table]: current[table].map(item => item.id === id ? { ...item, published } : item) }
        if (demo) localStorage.setItem('lotusbloem-demo-v1', JSON.stringify(next))
        return next
      })
      if (!demo && table === 'posts' && published && !data.posts.find(p => p.id === id)?.notified_at) { await announce(id); await reload(true) }
    },
    remove: async (table, id) => {
      if (demo) { const next = { ...data }; if (table === 'products') { next.products = data.products.filter(x => x.id !== id); next.inventory = data.inventory.filter(x => x.product_id !== id); next.movements = data.movements.filter(x => x.product_id !== id) } else next.posts = data.posts.filter(x => x.id !== id); updateDemo(next); return }
      const { error } = await supabase!.from(table).delete().eq('id', id)
      if (error) throw new Error(error.message)
      await reload(true)
    },
    adjust: async (id, delta, note) => {
      if (demo) { const item = data.inventory.find(x => x.product_id === id) || { product_id: id, quantity: 0, minimum: 3, sku: '' }; const quantity = item.quantity + delta; if (!Number.isSafeInteger(delta) || !delta || quantity < 0) throw new Error(t.data.badStock); updateDemo({ ...data, inventory: [...data.inventory.filter(x => x.product_id !== id), { ...item, quantity }], movements: [{ id: crypto.randomUUID(), product_id: id, delta, note, created_at: new Date().toISOString() }, ...data.movements] }); return }
      const { error } = await supabase!.rpc('adjust_stock', { target_product: id, change: delta, reason: note })
      if (error) throw new Error(error.message)
      await reload(true)
    },
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export const useData = () => useContext(Context)
