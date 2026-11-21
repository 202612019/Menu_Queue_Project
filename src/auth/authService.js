import { supabase, supabaseConfigurationError } from '../lib/supabase'
import { authContent as text } from '../content/auth'
import { initialAuthLink } from './authLinks'
import { clearRecoveryState, getRecoveryExpiry, waitForRecoveryEvent } from './recoveryState'

/** @typedef {'student' | 'staff' | 'kitchen' | 'admin'} AppRole */
/** @typedef {{ id: string, full_name: string, email: string | null, role: AppRole }} Profile */

export function getAuthClient() {
  if (!supabase) throw new Error(supabaseConfigurationError)
  return supabase
}

/** @template T @param {PromiseLike<T>} request @returns {Promise<T>} */
export function withAuthTimeout(request) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const error = new Error(text.errors.generic)
      error.name = 'AuthRequestTimeoutError'
      reject(error)
    }, 15000)
    Promise.resolve(request).then(resolve, reject).finally(() => clearTimeout(timeout))
  })
}

/** @typedef {{ stage: 'initialize' | 'session' | 'recovery', kind: 'expired' | 'invalid' | 'temporary' }} SessionFailure */

/** @param {unknown} error @param {SessionFailure['stage']} stage @returns {SessionFailure} */
export function getSessionFailure(error, stage) {
  const value = /** @type {{ code?: string, details?: { code?: string }, name?: string, status?: number }} */ (error || {})
  const code = value.code || value.details?.code
  const kind = code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found'
    || code === 'session_not_found' || code === 'refresh_token_not_found' || code === 'refresh_token_already_used'
    ? 'expired'
    : value.name === 'AuthImplicitGrantRedirectError' || value.name === 'AuthInvalidTokenResponseError'
      || code === 'bad_jwt' || code === 'invalid_jwt'
      || (value.name === 'AuthApiError' && [400, 401, 403, 422].includes(value.status || 0))
      ? 'invalid'
      : 'temporary'
  return { stage, kind }
}

export class SessionRestoreError extends Error {
  /** @param {SessionFailure} failure */
  constructor(failure) {
    super(failure.kind === 'expired' ? text.expiredLink : failure.kind === 'invalid' ? text.invalidLink : text.callbackTemporary)
    this.failure = failure
  }
}

async function performSessionRestore() {
  const client = getAuthClient()
  try {
    const initialized = await withAuthTimeout(client.auth.initialize())
    if (initialized.error) throw initialized.error
  } catch (error) { throw new SessionRestoreError(getSessionFailure(error, 'initialize')) }
  let session
  try {
    const result = await withAuthTimeout(client.auth.getSession())
    if (result.error) throw result.error
    session = result.data.session
  } catch (error) { throw new SessionRestoreError(getSessionFailure(error, 'session')) }

  // The SDK schedules PASSWORD_RECOVERY after initialization resolves. Await
  // that genuine event, not merely a URL hint, before calling restoration done.
  if (session && initialAuthLink.recovery && !initialAuthLink.failed && !getRecoveryExpiry(session)) {
    if (!await waitForRecoveryEvent(session)) {
      throw new SessionRestoreError({ stage: 'recovery', kind: 'temporary' })
    }
  }
  return session
}

/** @type {ReturnType<typeof performSessionRestore> | null} */
let restoring = null
export function restoreSession() {
  // StrictMode/provider replays share the same in-flight SDK read.
  if (!restoring) restoring = performSessionRestore().finally(() => { restoring = null })
  return restoring
}

/** @param {string} userId @param {AbortSignal} signal @returns {Promise<Profile>} */
export async function readOwnProfile(userId, signal) {
  const { data, error } = await getAuthClient().from('profiles')
    .select('id, full_name, email, role').eq('id', userId).abortSignal(signal).single()
  if (error) throw error
  if (!data || data.id !== userId || !Object.hasOwn(text.roleLabels, data.role)) {
    throw new Error(text.roleUnavailable)
  }
  return data
}

function callbackUrl() { return new URL('/auth/callback', window.location.origin).href }

/** @param {{ fullName: string, email: string, password: string }} input */
export async function registerStudent({ fullName, email, password }) {
  const { data, error } = await withAuthTimeout(getAuthClient().auth.signUp({
    email: email.trim(), password,
    options: { data: { full_name: fullName.trim() }, emailRedirectTo: callbackUrl() },
  }))
  if (error) throw error
  return data
}

/** @param {string} email @param {string} password */
export async function loginWithPassword(email, password) {
  const { data, error } = await withAuthTimeout(getAuthClient().auth.signInWithPassword({ email: email.trim(), password }))
  if (error) throw error
  if (!data.session) throw new Error(text.errors.credentials)
  clearRecoveryState()
  return data.session
}

/** @param {string} email */
export async function resendConfirmation(email) {
  const { error } = await withAuthTimeout(getAuthClient().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: callbackUrl() } }))
  if (error) throw error
}

/** @param {string} email */
export async function requestPasswordRecovery(email) {
  const { error } = await withAuthTimeout(getAuthClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: callbackUrl() }))
  if (error) throw error
}

/** @param {string} password */
export async function saveNewPassword(password) {
  const { error } = await withAuthTimeout(getAuthClient().auth.updateUser({ password }))
  if (error) throw error
  clearRecoveryState()
}

/** @param {{ session: import('@supabase/supabase-js').Session | null, recovery: boolean, sessionFailure: SessionFailure | null, sessionError: string }} state */
export function verifyEmailCallback({ session, recovery, sessionFailure, sessionError }) {
  // This is a pure decision after AuthProvider settles; it invokes no SDK API.
  if (initialAuthLink.failed) return { error: initialAuthLink.expired ? text.expiredLink : text.invalidLink, temporary: false, target: '' }
  if (initialAuthLink.pkce) return { error: text.unsupportedLink, temporary: false, target: '' }
  if (sessionError) {
    return { error: sessionFailure?.kind === 'expired' ? text.expiredLink : sessionFailure?.kind === 'invalid' ? text.invalidLink : text.callbackTemporary, temporary: sessionFailure?.kind === 'temporary', target: '' }
  }
  if (session && recovery && getRecoveryExpiry(session)) return { error: '', temporary: false, target: '/reset-password' }
  if (!initialAuthLink.present) return { error: text.missingLink, temporary: false, target: '' }
  if (session && !initialAuthLink.recovery) return { error: '', temporary: false, target: '/account' }
  return { error: text.invalidLink, temporary: false, target: '' }
}

/** @param {unknown} error @param {string} [fallback] */
export function getAuthError(error, fallback = text.errors.generic) {
  if (supabaseConfigurationError) return supabaseConfigurationError
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code === 'invalid_credentials') return text.errors.credentials
  if (code === 'email_not_confirmed') return text.errors.unconfirmed
  if (code === 'weak_password') return text.errors.password
  if (code === 'same_password') return text.errors.samePassword
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || code === 'over_sms_send_rate_limit') return text.errors.rateLimit
  if (code === 'email_address_not_authorized' || code === 'unexpected_failure') return text.errors.emailDelivery
  if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'bad_code_verifier') return text.invalidLink
  if (code === 'session_not_found' || code === 'refresh_token_not_found' || code === 'refresh_token_already_used') return text.errors.expired
  return fallback
}

/** @param {string} email */
export function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) }

/** @param {string} password @param {string} confirmation */
export function passwordValidation(password, confirmation) {
  if (password.length < 8) return text.passwordWeak
  if (password !== confirmation) return text.passwordsDiffer
  return ''
}
