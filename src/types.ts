export type Product = { id: string; name: string; description: string; category: 'schoonheid' | 'thuisverpleging' | 'verzorging'; kind: 'product' | 'dienst'; price: number | null; duration: number | null; image_url: string; published: boolean; created_at: string }
export type Post = { id: string; title: string; excerpt: string; body: string; kind: 'blog' | 'aankondiging'; image_url: string; published: boolean; created_at: string; notified_at?: string | null }
export type Inventory = { product_id: string; quantity: number; minimum: number; sku: string }
export type Movement = { id: string; product_id: string; delta: number; note: string; created_at: string }
export type Settings = { id: number; email: string; phone: string; address: string; region: string; about: string; logo_url: string }
