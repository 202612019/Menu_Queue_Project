
import { createClient } from '@supabase/supabase-js'
import '../auth/authLinks'
import { trackRecoveryEvent } from '../auth/recoveryState'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function checkConfiguration() {
  if (!supabaseUrl || !supabasePublishableKey) {
    return 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart Vite.'
  }

  try {
    const url = new URL(supabaseUrl)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error()
  } catch {
    return 'VITE_SUPABASE_URL must be your HTTPS Supabase project URL.'
  }

  // Accept only browser-safe keys. Never include the configured value in errors.
  if (supabasePublishableKey.startsWith('sb_publishable_')) return ''

  try {
    const payload = supabasePublishableKey.split('.')[1]
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    if (claims.role === 'anon') return ''
  } catch {
    // Unrecognized keys receive the same safe guidance as privileged keys.
  }

  return 'Use a Supabase publishable key or legacy anon key. Secret and service-role keys cannot be used in the frontend.'
}

export const supabaseConfigurationError = checkConfiguration()

// Invalid configuration becomes a visible test-page error instead of a blank page.
export const supabase = supabaseConfigurationError
  ? null
  : createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  })

// Subscribe immediately so recovery links processed before React mounts are recorded.
const recoverySubscription = supabase?.auth.onAuthStateChange(trackRecoveryEvent)
if (import.meta.hot) {
  import.meta.hot.dispose(() => recoverySubscription?.data.subscription.unsubscribe())
}
