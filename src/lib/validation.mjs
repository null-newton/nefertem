export function safeImageUrl(value) {
  if (!value) return ''
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '' } catch { return '' }
}
export function validStockDelta(current, delta) {
  return Number.isSafeInteger(current) && Number.isSafeInteger(delta) && delta !== 0 && current + delta >= 0 && current + delta <= 2147483647
}
// Returns '' when valid, otherwise a problem code: 'short' | 'long' | 'mismatch'.
export function passwordProblem(next, repeat) {
  if (typeof next !== 'string' || next.length < 8) return 'short'
  if (next.length > 72) return 'long'
  return next === repeat ? '' : 'mismatch'
}
export function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}
