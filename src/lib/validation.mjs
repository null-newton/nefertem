export function safeImageUrl(value) {
  if (!value) return ''
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '' } catch { return '' }
}
export function validStockDelta(current, delta) {
  return Number.isSafeInteger(current) && Number.isSafeInteger(delta) && delta !== 0 && current + delta >= 0 && current + delta <= 2147483647
}
export function passwordProblem(next, repeat) {
  if (typeof next !== 'string' || next.length < 8) return 'Kies een wachtwoord van minstens 8 tekens.'
  if (next.length > 72) return 'Kies een wachtwoord van maximaal 72 tekens.'
  return next === repeat ? '' : 'De twee wachtwoorden komen niet overeen.'
}
export function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}
