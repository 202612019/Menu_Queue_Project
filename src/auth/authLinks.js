// Capture only link flags before the SDK consumes and removes the URL tokens.
// Token values are never copied to application state, logs, or our own storage.
function readInitialLink() {
  const parameters = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.hash.slice(1))
  const search = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
  const failed = parameters.has('error') || parameters.has('error_code') || search.has('error') || search.has('error_code')
  const code = parameters.get('error_code') || search.get('error_code')
  return {
    present: parameters.has('access_token') || search.has('code') || failed,
    failed,
    expired: code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found',
    pkce: search.has('code'),
    recovery: parameters.get('type') === 'recovery',
  }
}

export const initialAuthLink = readInitialLink()

// SDK initialization failures are cached. A fresh document lets the SDK retry
// an unconsumed implicit callback; the app never parses/exchanges its credentials.
export function reloadAuthPage() { window.location.reload() }
