// This is a tab-local UI marker, not a credential or an authorization boundary.
// Supabase authorizes the actual password update. No tokens/passwords are stored here.
const storageKey = 'college-canteen:recovery'
const lifetime = 15 * 60 * 1000
/** @typedef {{ userId: string, sessionId: string, expiresAt: number }} RecoveryMarker */
/** @type {RecoveryMarker | null} */
let memoryMarker = null
/** @type {Set<() => void>} */
const listeners = new Set()

/** @param {import('@supabase/supabase-js').Session | null | undefined} session */
function sessionBinding(session) {
  try {
    if (!session) return null
    const payload = session.access_token.split('.')[1]
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    if (claims.sub === session.user.id && typeof claims.session_id === 'string' && claims.session_id) {
      return { userId: session.user.id, sessionId: claims.session_id }
    }
  } catch { /* Missing/malformed session identity must fail closed. */ }
  return null
}

export function clearRecoveryState() {
  memoryMarker = null
  try { window.sessionStorage.removeItem(storageKey) } catch { /* Storage may be unavailable. */ }
  listeners.forEach((listener) => listener())
}

/** @param {import('@supabase/supabase-js').Session | null | undefined} session */
export function getRecoveryExpiry(session) {
  const binding = sessionBinding(session)
  if (!binding) return 0
  let value = memoryMarker
  try {
    value = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null')
  } catch { /* In-memory state works until reload when storage is blocked. */ }
  if (value?.userId === binding.userId && value.sessionId === binding.sessionId
    && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() && value.expiresAt <= Date.now() + lifetime) {
    return value.expiresAt
  }
  return 0
}

/** @param {import('@supabase/supabase-js').AuthChangeEvent} event @param {import('@supabase/supabase-js').Session | null} session */
export function trackRecoveryEvent(event, session) {
  if (event === 'SIGNED_OUT') clearRecoveryState()
  const binding = sessionBinding(session)
  if (event === 'PASSWORD_RECOVERY' && binding) {
    // Repeated notifications must not extend an already established recovery window.
    memoryMarker = { ...binding, expiresAt: getRecoveryExpiry(session) || Date.now() + lifetime }
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(memoryMarker))
    } catch { /* No persistent recovery access is granted after a reload. */ }
    listeners.forEach((listener) => listener())
  }
}

/** @param {import('@supabase/supabase-js').Session} session */
export function waitForRecoveryEvent(session) {
  if (getRecoveryExpiry(session)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const finish = (/** @type {boolean} */ valid) => {
      clearTimeout(timeout)
      listeners.delete(check)
      resolve(valid)
    }
    const check = () => { if (getRecoveryExpiry(session)) finish(true) }
    const timeout = setTimeout(() => finish(false), 5000)
    listeners.add(check)
    check()
  })
}
