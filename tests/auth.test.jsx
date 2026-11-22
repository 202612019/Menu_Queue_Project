import { StrictMode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  session: null, listeners: new Set(), profileReader: null,
  link: { present: false, failed: false, expired: false, pkce: false, recovery: false }, reload: vi.fn(),
  auth: {
    initialize: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn(), signUp: vi.fn(),
    signInWithPassword: vi.fn(), signOut: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(),
  },
  from: vi.fn(),
}))

vi.mock('../src/lib/supabase', () => ({ supabase: { auth: fake.auth, from: fake.from }, supabaseConfigurationError: '' }))
vi.mock('../src/auth/authLinks', () => ({ initialAuthLink: fake.link, reloadAuthPage: fake.reload }))
vi.mock('../src/hooks/useMenu', async () => {
  const { catalogue } = await import('./fixtures/menu')
  return { useMenu: () => ({ data: catalogue, loading: false, error: '', ready: true, refresh: vi.fn() }) }
})

import { App } from '../src/app/App'
import { AuthProvider, useAuth } from '../src/auth/AuthProvider'
import { RequireAuth } from '../src/auth/AuthGuards'
import { authContent as text } from '../src/content/auth'
import { registerStudent, readOwnProfile, getAuthError, verifyEmailCallback } from '../src/auth/authService'
import { clearRecoveryState, getRecoveryExpiry, trackRecoveryEvent } from '../src/auth/recoveryState'

function session(id = 'student-a', metadata = {}, sessionId = 'fixture-session-1') {
  const payload = btoa(JSON.stringify({ sub: id, session_id: sessionId })).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_')
  return { user: { id, email: `${id}@example.test`, user_metadata: metadata }, access_token: `e30.${payload}.fixture`, refresh_token: 'fake-refresh-token' }
}
function profile(id, role = 'student') { return { id, full_name: id === 'student-a' ? 'Student A' : 'Student B', email: `${id}@example.test`, role } }
function emit(event, next) {
  fake.session = next
  trackRecoveryEvent(event, next)
  fake.listeners.forEach(listener => listener(event, next))
}
function open(path = '/') {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter></StrictMode>)
}
async function fillLogin(user) {
  await user.type(screen.getByLabelText(text.email), 'student-a@example.test')
  await user.type(screen.getByLabelText(text.password), 'Test-password-42')
}
async function fillRegistration(user, confirmation = 'Test-password-42') {
  await user.type(screen.getByLabelText(text.name), 'Student A')
  await fillLogin(user)
  await user.type(screen.getByLabelText(text.confirmPassword), confirmation)
}

beforeEach(() => {
  clearRecoveryState()
  fake.listeners.clear()
  fake.session = null
  Object.assign(fake.link, { present: false, failed: false, expired: false, pkce: false, recovery: false })
  fake.profileReader = id => Promise.resolve({ data: profile(id), error: null })
  fake.auth.initialize.mockResolvedValue({ error: null })
  fake.auth.getSession.mockImplementation(async () => ({ data: { session: fake.session }, error: null }))
  fake.auth.onAuthStateChange.mockImplementation(listener => {
    fake.listeners.add(listener)
    return { data: { subscription: { unsubscribe: () => fake.listeners.delete(listener) } } }
  })
  fake.auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'student-a' } }, error: null })
  fake.auth.signInWithPassword.mockImplementation(async () => { const next = session(); emit('SIGNED_IN', next); return { data: { session: next }, error: null } })
  fake.auth.signOut.mockImplementation(async () => { emit('SIGNED_OUT', null); return { error: null } })
  fake.auth.resend.mockResolvedValue({ error: null })
  fake.auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  fake.auth.updateUser.mockResolvedValue({ error: null })
  fake.from.mockImplementation(() => {
    let id
    const query = {
      select: vi.fn(() => query), eq: vi.fn((_key, value) => { id = value; return query }),
      abortSignal: vi.fn(() => query), single: vi.fn(() => fake.profileReader(id)),
    }
    return query
  })
})

describe('callback restoration regressions', () => {
  it('does not validate a callback early when another auth event arrives during initialization', async () => {
    Object.assign(fake.link, { present: true, recovery: true })
    let finishInitialization
    fake.auth.initialize.mockImplementation(() => new Promise(resolve => { finishInitialization = resolve }))
    open('/auth/callback')
    await waitFor(() => expect(finishInitialization).toBeTypeOf('function'))
    await act(async () => emit('SIGNED_IN', session('student-a', {}, 'ordinary-session')))
    expect(screen.getByText(text.callbackLoading)).toBeInTheDocument()
    expect(screen.queryByText(text.invalidLink)).not.toBeInTheDocument()
    fake.session = session()
    await act(async () => finishInitialization({ error: null }))
    await waitFor(() => expect(fake.auth.getSession).toHaveBeenCalled())
    await act(async () => emit('PASSWORD_RECOVERY', fake.session))
    await screen.findByLabelText(text.newPassword)
  })

  it('waits for PASSWORD_RECOVERY before opening the reset form', async () => {
    Object.assign(fake.link, { present: true, recovery: true })
    fake.session = session()
    open('/auth/callback')
    await waitFor(() => expect(fake.auth.getSession).toHaveBeenCalled())
    expect(screen.getByText(text.callbackLoading)).toBeInTheDocument()
    expect(screen.queryByLabelText(text.newPassword)).not.toBeInTheDocument()
    await act(async () => emit('PASSWORD_RECOVERY', fake.session))
    await screen.findByLabelText(text.newPassword)
    expect(fake.auth.initialize).toHaveBeenCalledTimes(1)
    expect(fake.auth.getSession).toHaveBeenCalledTimes(1)
    expect(fake.listeners.size).toBe(1)
  })

  it('resumes a clean callback after refresh only for the same recovery session', async () => {
    fake.session = session()
    trackRecoveryEvent('PASSWORD_RECOVERY', fake.session)
    const first = open('/auth/callback')
    await screen.findByLabelText(text.newPassword)
    first.unmount()
    // No URL credential flags survive a new document after SDK URL cleanup.
    Object.assign(fake.link, { present: false, recovery: false })
    open('/auth/callback')
    await screen.findByLabelText(text.newPassword)
    expect(fake.auth.resetPasswordForEmail).not.toHaveBeenCalled()
    expect(fake.auth.updateUser).not.toHaveBeenCalled()
  })

  it('rejects a new ordinary login for the same user with a different session ID', async () => {
    trackRecoveryEvent('PASSWORD_RECOVERY', session())
    fake.session = session('student-a', {}, 'different-ordinary-session')
    open('/auth/callback')
    await screen.findByText(text.missingLink)
    expect(screen.queryByLabelText(text.newPassword)).not.toBeInTheDocument()
    expect(getRecoveryExpiry(fake.session)).toBe(0)
  })

  it('never treats a recovery URL hint alone as a genuine recovery state', () => {
    Object.assign(fake.link, { present: true, recovery: true })
    const ordinarySession = session()
    const result = verifyEmailCallback({ session: ordinarySession, recovery: false, sessionError: '', sessionFailure: null })
    expect(result.target).toBe('')
    expect(getRecoveryExpiry(ordinarySession)).toBe(0)
  })

  it('rejects an explicit expired/reused link even with a previous recovery session', async () => {
    fake.session = session()
    trackRecoveryEvent('PASSWORD_RECOVERY', fake.session)
    Object.assign(fake.link, { present: true, failed: true, expired: true })
    open('/auth/callback')
    await screen.findByText(text.expiredLink)
    expect(screen.queryByLabelText(text.newPassword)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: text.retry })).not.toBeInTheDocument()
  })

  it('reports an SDK expired-link rejection distinctly from a temporary error', async () => {
    Object.assign(fake.link, { present: true, recovery: true })
    fake.auth.initialize.mockResolvedValue({ error: { name: 'AuthImplicitGrantRedirectError', details: { code: 'otp_expired' } } })
    open('/auth/callback')
    await screen.findByText(text.expiredLink)
    expect(fake.auth.getSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: text.retry })).not.toBeInTheDocument()
  })

  it('reports PKCE-format links as unsupported without exchanging a code', async () => {
    Object.assign(fake.link, { present: true, pkce: true })
    fake.session = session()
    open('/auth/callback')
    await screen.findByText(text.unsupportedLink)
    expect(fake.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('retries a temporary session read without treating it as an expired link', async () => {
    fake.session = session()
    trackRecoveryEvent('PASSWORD_RECOVERY', fake.session)
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: { name: 'AuthRetryableFetchError' } })
    window.history.replaceState({}, '', '/auth/callback#fixture-preserved-until-sdk-consumes-it')
    const user = userEvent.setup()
    open('/auth/callback')
    await screen.findByText(text.callbackTemporary)
    expect(window.location.hash).toBe('#fixture-preserved-until-sdk-consumes-it')
    await user.click(screen.getByRole('button', { name: text.retry }))
    await screen.findByLabelText(text.newPassword)
    expect(fake.auth.getSession).toHaveBeenCalledTimes(2)
    expect(fake.reload).not.toHaveBeenCalled()
    window.history.replaceState({}, '', '/')
  })

  it('retries a cached SDK initialization failure by reloading the unconsumed URL', async () => {
    Object.assign(fake.link, { present: true, recovery: true })
    fake.auth.initialize.mockResolvedValue({ error: { name: 'AuthRetryableFetchError' } })
    window.history.replaceState({}, '', '/auth/callback#fixture-unconsumed')
    const user = userEvent.setup()
    const first = open('/auth/callback')
    await screen.findByText(text.callbackTemporary)
    await user.click(screen.getByRole('button', { name: text.retry }))
    expect(fake.reload).toHaveBeenCalledTimes(1)
    expect(fake.auth.initialize).toHaveBeenCalledTimes(1)
    expect(fake.auth.getSession).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#fixture-unconsumed')
    first.unmount()
    // Model the new document after Retry, where SDK initialization succeeds.
    fake.auth.initialize.mockResolvedValue({ error: null })
    fake.session = session()
    trackRecoveryEvent('PASSWORD_RECOVERY', fake.session)
    open('/auth/callback')
    await screen.findByLabelText(text.newPassword)
    window.history.replaceState({}, '', '/')
  })

  it('keeps only user/session IDs and expiry, without extending duplicate events', () => {
    const current = session()
    trackRecoveryEvent('PASSWORD_RECOVERY', current)
    const marker = JSON.parse(sessionStorage.getItem('college-canteen:recovery'))
    expect(Object.keys(marker).sort()).toEqual(['expiresAt', 'sessionId', 'userId'])
    trackRecoveryEvent('PASSWORD_RECOVERY', current)
    expect(JSON.parse(sessionStorage.getItem('college-canteen:recovery')).expiresAt).toBe(marker.expiresAt)
    expect(getRecoveryExpiry(session('student-b'))).toBe(0)
    sessionStorage.setItem('college-canteen:recovery', JSON.stringify({ ...marker, expiresAt: Date.now() - 1 }))
    expect(getRecoveryExpiry(current)).toBe(0)
  })

  it('clears recovery state on logout', async () => {
    fake.session = session()
    trackRecoveryEvent('PASSWORD_RECOVERY', fake.session)
    await act(async () => emit('SIGNED_OUT', null))
    expect(sessionStorage.getItem('college-canteen:recovery')).toBeNull()
    expect(getRecoveryExpiry(session())).toBe(0)
    open('/auth/callback')
    await screen.findByText(text.missingLink)
  })

  it('does not accept an old user-only marker as proof for a session', () => {
    sessionStorage.setItem('college-canteen:recovery', JSON.stringify({ userId: 'student-a', expiresAt: Date.now() + 60000 }))
    expect(getRecoveryExpiry(session())).toBe(0)
  })
})

describe('public homepage and cart', () => {
  it('preserves dishes, search, out-of-stock protection, cart quantities and totals', async () => {
    const user = userEvent.setup()
    open()
    expect(screen.getByRole('heading', { name: 'Fresh Food, Made for Campus Life' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(8)
    const burger = screen.getByRole('heading', { name: 'Veg Burger' }).closest('article')
    expect(within(burger).getByRole('button')).toBeDisabled()
    const sandwich = screen.getByRole('heading', { name: 'Veg Sandwich' }).closest('article')
    await user.click(within(sandwich).getByRole('button'))
    await user.click(within(sandwich).getByRole('button'))
    await user.click(screen.getByRole('button', { name: 'Open cart (2)' }))
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('₹90')
    await user.click(screen.getByRole('button', { name: 'Decrease quantity of Veg Sandwich' }))
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('₹45')
    expect(screen.getByRole('button', { name: 'Decrease quantity of Veg Sandwich' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Remove Veg Sandwich' }))
    await user.click(screen.getByRole('button', { name: 'Remove item' }))
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close cart' }))
    await user.type(screen.getByRole('searchbox'), 'COFFEE')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Cold Coffee' })).toBeInTheDocument()
  })

  it('keeps the exact App DOM node and cart while navigating through auth pages', async () => {
    const user = userEvent.setup()
    open()
    const app = document.getElementById('home')
    const sandwich = screen.getByRole('heading', { name: 'Veg Sandwich' }).closest('article')
    await user.click(within(sandwich).getByRole('button'))
    await user.click(screen.getByRole('link', { name: text.login }))
    await screen.findByRole('heading', { name: text.login })
    await user.click(screen.getByRole('link', { name: text.register }))
    await user.click(screen.getByRole('link', { name: text.home }))
    expect(document.getElementById('home')).toBe(app)
    await user.click(screen.getByRole('button', { name: 'Open cart (1)' }))
    expect(screen.getByLabelText('Cart total')).toHaveTextContent('₹45')
  })
})

describe('registration and confirmation', () => {
  it('keeps an existing-account response neutral and offers sign-in and password recovery', async () => {
    fake.auth.signUp.mockResolvedValue({ data: { session: null, user: { identities: [] } }, error: null })
    const user = userEvent.setup()
    open('/register')
    await fillRegistration(user)
    await user.click(screen.getByRole('button', { name: text.register }))
    await screen.findByRole('heading', { name: text.confirmationTitle })
    expect(screen.getByText(text.confirmationNotice)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: text.forgot })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getAllByRole('link', { name: text.login }).some(link => link.getAttribute('href') === '/login')).toBe(true)
    expect(fake.auth.resend).not.toHaveBeenCalled()
    expect(fake.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('submits only name metadata, displays pending confirmation, and resends safely', async () => {
    const user = userEvent.setup()
    open('/register')
    await fillRegistration(user)
    await user.click(screen.getByRole('button', { name: text.register }))
    await screen.findByRole('heading', { name: text.confirmationTitle })
    expect(fake.auth.signUp).toHaveBeenCalledWith({ email: 'student-a@example.test', password: 'Test-password-42', options: { data: { full_name: 'Student A' }, emailRedirectTo: 'http://localhost:3000/auth/callback' } })
    expect(fake.session).toBeNull()
    await user.click(screen.getByRole('button', { name: text.resend }))
    await screen.findByText(text.resent)
    expect(fake.auth.resend).toHaveBeenCalledTimes(1)
  })

  it('rejects mismatched passwords before making a registration request', async () => {
    const user = userEvent.setup()
    open('/register')
    await fillRegistration(user, 'Different-password-42')
    await user.click(screen.getByRole('button', { name: text.register }))
    expect(screen.getByRole('alert')).toHaveTextContent(text.passwordsDiffer)
    expect(fake.auth.signUp).not.toHaveBeenCalled()
  })

  it('ignores extra role input even if someone bypasses the registration form', async () => {
    await registerStudent({ fullName: 'Student A', email: 'student-a@example.test', password: 'Test-password-42', role: 'admin' })
    expect(fake.auth.signUp.mock.calls[0][0].options.data).toEqual({ full_name: 'Student A' })
  })

  it('accepts a validated confirmation session and handles StrictMode subscriptions', async () => {
    Object.assign(fake.link, { present: true })
    fake.session = session()
    open('/auth/callback')
    await screen.findByRole('heading', { name: text.account })
    expect(screen.getByText('Student A')).toBeInTheDocument()
    expect(fake.listeners.size).toBe(1)
  })

  it('rejects an expired email link even when another session exists', async () => {
    Object.assign(fake.link, { present: true, failed: true, expired: true })
    fake.session = session()
    open('/auth/callback')
    await screen.findByText(text.expiredLink)
    expect(screen.queryByText('Student A')).not.toBeInTheDocument()
  })

  it('does not treat a plain callback URL as a valid email link', async () => {
    fake.session = session()
    open('/auth/callback')
    await screen.findByText(text.missingLink)
  })
})

describe('login, restoration and logout', () => {
  it('logs in, restores a persisted SDK session on remount, and signs out locally', async () => {
    const user = userEvent.setup()
    const first = open('/account')
    await screen.findByRole('heading', { name: text.login })
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: text.login }))
    await screen.findByText('Student A')
    first.unmount()
    open('/account')
    await screen.findByText('Student A')
    await user.click(screen.getByRole('button', { name: text.logout }))
    await screen.findByRole('heading', { name: text.login })
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(screen.queryByText('Student A')).not.toBeInTheDocument()
  })

  it('reports incorrect credentials without displaying raw server errors', async () => {
    fake.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: 'invalid_credentials', message: 'PRIVATE_SERVER_DETAIL' } })
    const user = userEvent.setup()
    open('/login')
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: text.login }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text.errors.credentials)
    expect(screen.queryByText('PRIVATE_SERVER_DETAIL')).not.toBeInTheDocument()
  })

  it('shows unconfirmed-email guidance instead of claiming login succeeded', async () => {
    fake.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { code: 'email_not_confirmed' } })
    const user = userEvent.setup()
    open('/login')
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: text.login }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text.errors.unconfirmed)
    expect(screen.getByRole('button', { name: text.resend })).toBeInTheDocument()
  })

  it('waits for restoration before redirecting and allows retry after a failure', async () => {
    let resolveSession
    fake.auth.getSession.mockImplementationOnce(() => new Promise(resolve => { resolveSession = resolve }))
    // Avoid StrictMode's initial replay for this deliberately pending single request.
    render(<MemoryRouter initialEntries={['/account']}><AuthProvider><App /></AuthProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: text.loading })).toBeInTheDocument()
    await waitFor(() => expect(resolveSession).toBeTypeOf('function'))
    await act(async () => resolveSession({ data: { session: null }, error: { code: 'request_failed' } }))
    await screen.findByText(text.errors.session)
    await userEvent.click(screen.getByRole('button', { name: text.retry }))
    await screen.findByRole('heading', { name: text.login })
  })
})

describe('profiles and role guards', () => {
  it('blocks missing profiles, retries, and never invents a Student role', async () => {
    fake.session = session()
    fake.profileReader = () => Promise.resolve({ data: null, error: { code: 'PGRST116' } })
    open('/account')
    await screen.findByText(text.profileError)
    expect(screen.queryByText('Student A')).not.toBeInTheDocument()
    fake.profileReader = id => Promise.resolve({ data: profile(id), error: null })
    await userEvent.click(screen.getByRole('button', { name: text.retry }))
    await screen.findByText('Student A')
  })

  it('uses the database role rather than a role in user metadata', async () => {
    fake.session = session('student-a', { role: 'admin' })
    function Probe() { const auth = useAuth(); return <RequireAuth roles={['admin']}><p>Admin-only content {auth.profile?.role}</p></RequireAuth> }
    render(<MemoryRouter><AuthProvider><Probe /></AuthProvider></MemoryRouter>)
    await screen.findByRole('heading', { name: text.accessDenied })
    expect(screen.queryByText(/Admin-only content/)).not.toBeInTheDocument()
  })

  it('rejects a mismatched returned profile and an unsupported role', async () => {
    fake.profileReader = () => Promise.resolve({ data: profile('student-b'), error: null })
    await expect(readOwnProfile('student-a', new AbortController().signal)).rejects.toThrow()
    fake.profileReader = id => Promise.resolve({ data: profile(id, 'owner'), error: null })
    await expect(readOwnProfile('student-a', new AbortController().signal)).rejects.toThrow()
  })

  it('discards late profile results when switching users', async () => {
    let resolveOld
    fake.session = session()
    fake.profileReader = id => id === 'student-a' ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve({ data: profile(id), error: null })
    open('/account')
    await waitFor(() => expect(resolveOld).toBeTypeOf('function'))
    await act(async () => emit('SIGNED_IN', session('student-b')))
    await screen.findByText('Student B')
    await act(async () => resolveOld({ data: profile('student-a'), error: null }))
    expect(screen.getByText('Student B')).toBeInTheDocument()
    expect(screen.queryByText('Student A')).not.toBeInTheDocument()
  })
})

describe('password recovery', () => {
  it('requests recovery with a generic response and configured callback URL', async () => {
    const user = userEvent.setup()
    open('/forgot-password')
    await user.type(screen.getByLabelText(text.email), 'student-a@example.test')
    await user.click(screen.getByRole('button', { name: text.sendRecovery }))
    await screen.findByText(text.recoverySent)
    expect(fake.auth.resetPasswordForEmail).toHaveBeenCalledWith('student-a@example.test', { redirectTo: 'http://localhost:3000/auth/callback' })
  })

  it('reports the hosted email rate limit without claiming an email was sent', async () => {
    fake.auth.resetPasswordForEmail.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', status: 429 } })
    const user = userEvent.setup()
    open('/forgot-password')
    await user.type(screen.getByLabelText(text.email), 'student-a@example.test')
    await user.click(screen.getByRole('button', { name: text.sendRecovery }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text.errors.rateLimit)
    expect(screen.getByText(text.recoveryLimitHelp)).toBeInTheDocument()
    expect(screen.queryByText(text.recoverySent)).not.toBeInTheDocument()
    expect(fake.auth.updateUser).not.toHaveBeenCalled()
  })

  it('guides the user to the received email instead of inviting a duplicate request', async () => {
    const user = userEvent.setup()
    open('/forgot-password')
    await user.type(screen.getByLabelText(text.email), 'student-a@example.test')
    await user.click(screen.getByRole('button', { name: text.sendRecovery }))
    await screen.findByRole('heading', { name: text.confirmationTitle })
    expect(screen.getByText(text.recoveryNextStep)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: text.sendRecovery })).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(fake.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: text.differentEmail }))
    expect(screen.getByLabelText(text.email)).toHaveValue('')
    expect(screen.getByRole('button', { name: text.sendRecovery })).toBeEnabled()
    expect(fake.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1)
  })

  it('blocks direct reset visits from an ordinary signed-in session', async () => {
    fake.session = session()
    open('/reset-password')
    await screen.findByText(text.invalidRecovery)
    expect(fake.auth.updateUser).not.toHaveBeenCalled()
  })

  it('updates the password only after recovery and consumes recovery access', async () => {
    const user = userEvent.setup()
    fake.session = session()
    trackRecoveryEvent('PASSWORD_RECOVERY', fake.session)
    const first = open('/reset-password')
    await screen.findByLabelText(text.newPassword)
    await user.type(screen.getByLabelText(text.newPassword), 'Changed-password-42')
    await user.type(screen.getByLabelText(text.confirmPassword), 'Changed-password-42')
    await user.click(screen.getByRole('button', { name: text.reset }))
    await screen.findByText(text.resetSuccess)
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ password: 'Changed-password-42' })
    expect(sessionStorage.getItem('college-canteen:recovery')).toBeNull()
    first.unmount()
    open('/reset-password')
    await screen.findByText(text.invalidRecovery)
  })

  it('keeps a valid recovery marker over remount and rejects expired or other-user markers', async () => {
    fake.session = session()
    trackRecoveryEvent('PASSWORD_RECOVERY', fake.session)
    const first = open('/reset-password')
    await screen.findByLabelText(text.newPassword)
    first.unmount()
    sessionStorage.setItem('college-canteen:recovery', JSON.stringify({userId:'student-b',expiresAt:Date.now()+60000}))
    const second = open('/reset-password')
    await screen.findByText(text.invalidRecovery)
    second.unmount()
    sessionStorage.setItem('college-canteen:recovery', JSON.stringify({userId:'student-a',expiresAt:Date.now()-1}))
    open('/reset-password')
    await screen.findByText(text.invalidRecovery)
  })

  it('does not display raw server details for unknown errors', () => {
    expect(getAuthError({message:'PRIVATE_TOKEN_AND_OTHER_DETAILS'})).toBe(text.errors.generic)
  })
})
