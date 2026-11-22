import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { loginDestination } from '../auth/returnTo'
import { AuthField, AuthLayout, AuthMessage } from '../components/AuthLayout'
import { authContent as text } from '../content/auth'
import { useAuth } from '../auth/AuthProvider'
import { getAuthError, loginWithPassword, passwordValidation, registerStudent, requestPasswordRecovery, resendConfirmation, saveNewPassword, validEmail, verifyEmailCallback } from '../auth/authService'

/** @param {FormData} data @param {string} key */
function field(data, key) { return String(data.get(key) || '') }

/** @param {{ busy: boolean, label: string }} props */
function Submit({ busy, label }) {
  return <button type="submit" disabled={busy} className="button-primary w-full disabled:cursor-wait disabled:opacity-60">{busy ? text.submitPending : label}</button>
}

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const destination = loginDestination(useLocation().state)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [email, setEmail] = useState('')
  useEffect(() => {
    if (!auth.initializing && !auth.sessionError && auth.user) navigate(auth.recovery ? '/reset-password' : destination, { replace: true })
  }, [auth.initializing, auth.sessionError, auth.user, auth.recovery, navigate, destination])

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const enteredEmail = field(data, 'email')
    const password = field(data, 'password')
    setEmail(enteredEmail)
    if (!validEmail(enteredEmail)) { setError(text.emailRequired); return }
    if (!password) { setError(text.passwordRequired); return }
    setBusy(true); setError(''); setNotice('')
    try { await loginWithPassword(enteredEmail, password); auth.finishRecovery(); navigate(destination, { replace: true }) }
    catch (cause) { setError(getAuthError(cause)) }
    finally { setBusy(false) }
  }
  async function resend() {
    if (!validEmail(email)) { setError(text.emailRequired); return }
    setBusy(true); setError(''); setNotice('')
    try { await resendConfirmation(email); setNotice(text.resent) }
    catch (cause) { setError(getAuthError(cause)) }
    finally { setBusy(false) }
  }
  return <AuthLayout title={text.login} description={text.loginDescription}>
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <AuthField id="email" label={text.email} type="email" autoComplete="email" />
      <AuthField id="password" label={text.password} type="password" autoComplete="current-password" />
      <AuthMessage error message={error} /><AuthMessage message={notice} />
      <Submit busy={busy} label={text.login} />
    </form>
    {email && <button disabled={busy} onClick={() => void resend()} className="mt-4 min-h-11 text-sm text-forest underline disabled:opacity-60">{text.resend}</button>}
    <div className="mt-5 flex flex-wrap justify-between gap-4 text-sm text-forest underline">
      <Link to="/register">{text.register}</Link><Link to="/forgot-password">{text.forgot}</Link>
    </div>
  </AuthLayout>
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const fullName = field(data, 'fullName').trim()
    const email = field(data, 'email').trim()
    const password = field(data, 'password')
    const validation = !fullName ? text.nameRequired : !validEmail(email) ? text.emailRequired : passwordValidation(password, field(data, 'confirmPassword'))
    if (validation) { setError(validation); return }
    setBusy(true); setError('')
    try {
      const result = await registerStudent({ fullName, email, password })
      form.reset()
      if (result.session) navigate('/account', { replace: true })
      else setRegisteredEmail(email)
    } catch (cause) { setError(getAuthError(cause, text.errors.signup)) }
    finally { setBusy(false) }
  }
  async function resend() {
    setBusy(true); setError(''); setNotice('')
    try { await resendConfirmation(registeredEmail); setNotice(text.resent) }
    catch (cause) { setError(getAuthError(cause)) }
    finally { setBusy(false) }
  }
  return <AuthLayout title={registeredEmail ? text.confirmationTitle : text.register} description={registeredEmail ? text.confirmationNotice : text.registerDescription}>
    {registeredEmail ? <>
      <AuthMessage error message={error} /><AuthMessage message={notice} />
      <button disabled={busy} onClick={() => void resend()} className="button-primary mt-4 disabled:opacity-60">{busy ? text.submitPending : text.resend}</button>
    </> : <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <AuthField id="fullName" label={text.name} autoComplete="name" />
      <AuthField id="email" label={text.email} type="email" autoComplete="email" />
      <AuthField id="password" label={text.password} type="password" autoComplete="new-password" hint={text.passwordHint} />
      <AuthField id="confirmPassword" label={text.confirmPassword} type="password" autoComplete="new-password" />
      <p className="text-sm leading-relaxed text-stone-600">{text.registerNotice}</p>
      <AuthMessage error message={error} /><Submit busy={busy} label={text.register} />
    </form>}
    <div className="mt-5 flex flex-wrap gap-4 text-sm text-forest underline">
      <Link to="/login">{text.login}</Link>
      <Link to="/forgot-password">{text.forgot}</Link>
    </div>
  </AuthLayout>
}

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault()
    if (busy || notice) return
    const email = field(new FormData(event.currentTarget), 'email')
    if (!validEmail(email)) { setError(text.emailRequired); return }
    setBusy(true); setError(''); setNotice('')
    try { await requestPasswordRecovery(email); setNotice(text.recoverySent) }
    catch (cause) { setError(getAuthError(cause)) }
    finally { setBusy(false) }
  }
  return <AuthLayout title={notice ? text.confirmationTitle : text.forgotTitle} description={notice ? undefined : text.forgotDescription}>
    {notice ? <>
      <AuthMessage message={notice} />
      <p className="mt-4 text-sm leading-relaxed text-stone-600">{text.recoveryNextStep}</p>
      <button type="button" onClick={() => { setNotice(''); setError('') }} className="mt-4 min-h-11 text-sm text-forest underline">{text.differentEmail}</button>
    </> : <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <AuthField id="email" label={text.email} type="email" autoComplete="email" />
      <AuthMessage error message={error} />
      {error === text.errors.rateLimit && <p className="text-sm leading-relaxed text-stone-600">{text.recoveryLimitHelp}</p>}
      <Submit busy={busy} label={text.sendRecovery} />
    </form>}
    <Link to="/login" className="mt-5 inline-block text-sm text-forest underline">{text.login}</Link>
  </AuthLayout>
}

export function ResetPasswordPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault()
    if (!auth.user || !auth.recovery) { setError(text.invalidRecovery); return }
    const form = event.currentTarget
    const data = new FormData(form)
    const password = field(data, 'password')
    const validation = passwordValidation(password, field(data, 'confirmPassword'))
    if (validation) { setError(validation); return }
    setBusy(true); setError('')
    try {
      await saveNewPassword(password)
      form.reset()
      auth.finishRecovery()
      navigate('/account', { replace: true, state: { notice: text.resetSuccess } })
    } catch (cause) { setError(getAuthError(cause)) }
    finally { setBusy(false) }
  }
  return <AuthLayout title={text.resetTitle} description={text.resetDescription}>
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <AuthField id="password" label={text.newPassword} type="password" autoComplete="new-password" hint={text.passwordHint} />
      <AuthField id="confirmPassword" label={text.confirmPassword} type="password" autoComplete="new-password" />
      <AuthMessage error message={error} /><Submit busy={busy} label={text.reset} />
    </form>
  </AuthLayout>
}

export function AuthCallbackPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const result = auth.initializing ? null : verifyEmailCallback(auth)
  const target = result?.target
  useEffect(() => {
    if (target) navigate(target, { replace: true, state: { notice: text.confirmationSuccess } })
  }, [target, navigate])
  const error = result?.error || ''
  return <AuthLayout title={text.callbackTitle}>
    <AuthMessage error={Boolean(error)} message={error || text.callbackLoading} />
    {result?.temporary && <button type="button" className="button-primary mt-5" onClick={auth.retrySession}>{text.retry}</button>}
    {error && <div className="mt-5 flex flex-wrap gap-4 text-sm text-forest underline"><Link to="/login">{text.login}</Link><Link to="/forgot-password">{text.forgot}</Link></div>}
  </AuthLayout>
}
