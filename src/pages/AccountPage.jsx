import { useState } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { AuthLayout, AuthMessage } from '../components/AuthLayout'
import { authContent as text } from '../content/auth'

export function AccountPage() {
  const auth = useAuth()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const profile = auth.profile
  if (!profile) return null
  // Only known messages are rendered from router state.
  const notice = [text.resetSuccess, text.confirmationSuccess].includes(location.state?.notice) ? location.state.notice : ''
  return <AuthLayout title={text.account} description={text.accountDescription}>
    <AuthMessage message={notice} />
    <dl className="mt-4 space-y-5 break-words">
      <div><dt className="text-sm text-stone-500">{text.name}</dt><dd className="mt-1 font-medium">{profile.full_name || text.missingName}</dd></div>
      <div><dt className="text-sm text-stone-500">{text.email}</dt><dd className="mt-1 font-medium">{profile.email || text.missingEmail}</dd></div>
      <div><dt className="text-sm text-stone-500">{text.role}</dt><dd className="mt-1 font-medium">{text.roleLabels[profile.role]}</dd></div>
    </dl>
    <button disabled={busy} className="button-primary mt-7 disabled:opacity-60" onClick={async () => { setBusy(true); await auth.logout(); setBusy(false) }}>{busy ? text.submitPending : text.logout}</button>
  </AuthLayout>
}
