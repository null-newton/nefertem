import type { Product, Post, Settings } from './types'
export const photos = {
  hero: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=2000&q=85',
  beauty: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1000&q=85',
  ritual: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1000&q=85',
  nature: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1400&q=85',
}
export const demoProducts: Product[] = [
  { id: 'demo-1', name: 'Een moment voor je huid', description: 'Een gelaatsverzorging afgestemd op jouw huid. Met ruimte om te vertragen en helemaal tot rust te komen.', category: 'schoonheid', kind: 'dienst', price: 75, duration: 60, image_url: photos.beauty, published: true, created_at: '2026-10-01T10:00:00Z' },
  { id: 'demo-2', name: 'Zachte verzorging, elke dag', description: 'Een verzorgende gezichtscrème voor je dagelijkse ritueel. Vraag in de praktijk welk product bij jouw huid past.', category: 'verzorging', kind: 'product', price: 32, duration: null, image_url: photos.ritual, published: true, created_at: '2026-10-02T10:00:00Z' },
  { id: 'demo-3', name: 'Zorg in je eigen omgeving', description: 'Persoonlijke thuisverpleging. We bespreken samen je zorgvraag, de mogelijkheden en de praktische afspraken.', category: 'thuisverpleging', kind: 'dienst', price: null, duration: null, image_url: photos.nature, published: true, created_at: '2026-10-03T10:00:00Z' },
]
export const demoPosts: Post[] = [
  { id: 'demo-post-1', title: 'Een nieuw seizoen. Een moment voor jezelf.', excerpt: 'Kleine rituelen brengen rust in je dag. Ontdek hoe je bewust tijd maakt voor verzorging.', body: 'Een warm washandje, een rustige ademhaling en een paar minuten voor jezelf. Een verzorgingsritueel hoeft niet ingewikkeld te zijn.\n\nBij Nefertem willen we ruimte maken voor aandacht. Voor je huid, voor je welzijn, voor jou.\n\nDit is een voorbeeldbericht. Vervang het via de beheeromgeving door je eigen verhaal.', kind: 'blog', image_url: photos.ritual, published: true, created_at: '2026-10-01T10:00:00Z' },
  { id: 'demo-post-2', title: 'Welkom bij Nefertem', excerpt: 'Een plek waar schoonheid en zorg samenkomen. Maak kennis met de praktijk.', body: 'Welkom bij Nefertem. Hier komen schoonheidsverzorging en thuisverpleging samen, met persoonlijke aandacht als vertrekpunt.\n\nDit is een voorbeeldaankondiging. Je kunt hier later nieuws over de praktijk, beschikbaarheid of nieuwe behandelingen publiceren.', kind: 'aankondiging', image_url: photos.nature, published: true, created_at: '2026-09-25T10:00:00Z' },
]
export const defaultSettings: Settings = { id: 1, email: '', phone: '', address: 'Stationsdreef 215, 8800 Roeselare, België', region: 'Roeselare', about: 'Ik ben Veronique Wostyn, het gezicht achter Nefertem. Hier komen schoonheidsverzorging en thuisverpleging samen. Met een persoonlijke benadering, een rustig gesprek en tijd voor wat jij nodig hebt.', about_fr: '', about_en: '', logo_url: '' }
