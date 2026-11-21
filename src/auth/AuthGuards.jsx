import { Link, Navigate } from 'react-router'
import { useAuth } from './AuthProvider'
import { authContent as text } from '../content/auth'
import { AuthLayout, AuthMessage } from '../components/AuthLayout'

/** @param {{ children: import('react').ReactNode, roles?: import('./authService').AppRole[] }} props */
export function RequireAuth({ children, roles }) {
  const auth = useAuth()
  if (auth.initializing) return <AuthLayout title={text.loading}><AuthMessage message={text.loading} /></AuthLayout>
  if (auth.sessionError) return (
    <AuthLayout title={text.login}>
      <AuthMessage error message={auth.sessionError} />
      <button className="button-primary mt-4" onClick={auth.retrySession}>{text.retry}</button>
    </AuthLayout>
  )
  if (!auth.user) return <Navigate to="/login" replace />
  if (auth.recovery) return <Navigate to="/reset-password" replace />
  if (auth.profileLoading) return <AuthLayout title={text.loadingProfile}><AuthMessage message={text.loadingProfile} /></AuthLayout>
  if (auth.profileError || !auth.profile) return (
    <AuthLayout title={text.account}>
      <AuthMessage error message={auth.profileError || text.roleUnavailable} />
      <button className="button-primary mt-4" onClick={auth.retryProfile}>{text.retry}</button>
      <button className="ml-4 underline" onClick={() => void auth.logout()}>{text.logout}</button>
    </AuthLayout>
  )
  if (roles && !roles.includes(auth.profile.role)) return <AuthLayout title={text.accessDenied}><AuthMessage error message={text.accessDenied} /></AuthLayout>
  return children
}

/** @param {{ children: import('react').ReactNode }} props */
export function RequireRecovery({ children }) {
  const auth = useAuth()
  if (auth.initializing) return <AuthLayout title={text.loading}><AuthMessage message={text.loading} /></AuthLayout>
  if (auth.sessionError) return <AuthLayout title={text.resetTitle}><AuthMessage error message={auth.sessionError} /><button type="button" className="button-primary mt-5" onClick={auth.retrySession}>{text.retry}</button></AuthLayout>
  if (!auth.sessionError && auth.user && auth.recovery) return children
  return <AuthLayout title={text.resetTitle}><AuthMessage error message={text.invalidRecovery} /><Link to="/forgot-password" className="mt-5 inline-block font-medium text-forest underline">{text.sendRecovery}</Link></AuthLayout>
}
