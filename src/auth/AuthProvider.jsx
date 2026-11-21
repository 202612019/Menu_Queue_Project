import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, supabaseConfigurationError } from '../lib/supabase'
import { authContent as text } from '../content/auth'
import { getAuthError, readOwnProfile, restoreSession, SessionRestoreError, withAuthTimeout } from './authService'
import { clearRecoveryState, getRecoveryExpiry, trackRecoveryEvent } from './recoveryState'
import { reloadAuthPage } from './authLinks'

/** @typedef {import('@supabase/supabase-js').Session} Session */
/** @typedef {import('./authService').Profile} Profile */
/** @typedef {{ session: Session | null, user: import('@supabase/supabase-js').User | null, initializing: boolean, sessionError: string, sessionFailure: import('./authService').SessionFailure | null, profile: Profile | null, profileLoading: boolean, profileError: string, recovery: boolean, logoutWarning: string, retrySession: () => void, retryProfile: () => void, finishRecovery: () => void, logout: () => Promise<void> }} AuthValue */
const AuthContext = createContext(/** @type {AuthValue | null} */ (null))

/** @param {{ children: import('react').ReactNode }} props */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(/** @type {Session | null} */ (null))
  const [initializing, setInitializing] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const [sessionFailure, setSessionFailure] = useState(/** @type {import('./authService').SessionFailure | null} */ (null))
  const [sessionAttempt, setSessionAttempt] = useState(0)
  const [profileAttempt, setProfileAttempt] = useState(0)
  const [profileState, setProfileState] = useState(/** @type {{ userId: string | null, profile: Profile | null, loading: boolean, error: string }} */ ({ userId: null, profile: null, loading: false, error: '' }))
  const [recoveryExpiry, setRecoveryExpiry] = useState(0)
  const recovery = Boolean(session && recoveryExpiry > Date.now())
  const [logoutWarning, setLogoutWarning] = useState('')
  const userId = session?.user.id

  useEffect(() => {
    if (!supabase) {
      setSessionError(supabaseConfigurationError)
      setInitializing(false)
      return
    }
    let active = true
    let revision = 0
    setInitializing(true)
    setSessionError('')
    setSessionFailure(null)
    /** @param {Session | null} next */
    function applySession(next) {
      if (!active) return
      setSession(next)
      setRecoveryExpiry(getRecoveryExpiry(next))
      setSessionError('')
      setSessionFailure(null)
    }

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Keep this callback synchronous. Profile requests run in a separate effect.
      if (event === 'INITIAL_SESSION') return
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_OUT') trackRecoveryEvent(event, next)
      revision += 1
      applySession(next)
      if (event === 'SIGNED_IN') setLogoutWarning('')
    })
    restoreSession().then((next) => {
      if (!active) return
      if (revision === 0) applySession(next)
      setInitializing(false)
    }).catch((error) => {
      if (!active) return
      if (active && revision === 0) {
        setSession(null)
        setRecoveryExpiry(0)
        setSessionFailure(error instanceof SessionRestoreError ? error.failure : { stage: 'session', kind: 'temporary' })
        setSessionError(supabaseConfigurationError || text.errors.session)
      }
      setInitializing(false)
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [sessionAttempt])

  useEffect(() => {
    if (!userId) {
      setProfileState({ userId: null, profile: null, loading: false, error: '' })
      return
    }
    const controller = new AbortController()
    let active = true
    const timeout = setTimeout(() => controller.abort(), 12000)
    setProfileState({ userId, profile: null, loading: true, error: '' })
    readOwnProfile(userId, controller.signal).then((profile) => {
      if (active) setProfileState({ userId, profile, loading: false, error: '' })
    }).catch(() => {
      if (active) setProfileState({ userId, profile: null, loading: false, error: text.profileError })
    }).finally(() => clearTimeout(timeout))
    return () => { active = false; controller.abort(); clearTimeout(timeout) }
  }, [userId, profileAttempt])

  useEffect(() => {
    if (!recoveryExpiry) return
    const timeout = setTimeout(() => { clearRecoveryState(); setRecoveryExpiry(0) }, Math.max(0, recoveryExpiry - Date.now()))
    return () => clearTimeout(timeout)
  }, [recoveryExpiry])

  const retrySession = useCallback(() => {
    if (sessionFailure?.stage === 'initialize') reloadAuthPage()
    else setSessionAttempt((value) => value + 1)
  }, [sessionFailure])
  const retryProfile = useCallback(() => setProfileAttempt((value) => value + 1), [])
  const finishRecovery = useCallback(() => { clearRecoveryState(); setRecoveryExpiry(0) }, [])
  const logout = useCallback(async () => {
    setLogoutWarning('')
    clearRecoveryState()
    setRecoveryExpiry(0)
    try {
      const { error } = await withAuthTimeout(supabase ? supabase.auth.signOut({ scope: 'local' }) : Promise.resolve({ error: null }))
      if (error) setLogoutWarning(getAuthError(error, text.errors.logout))
    } catch {
      setLogoutWarning(text.errors.generic)
    }
  }, [])

  // Do not expose an old user's profile during a session change or failed refresh.
  const matchingProfile = Boolean(userId && profileState.userId === userId)
  const value = {
    session, user: session?.user ?? null, initializing, sessionError, sessionFailure, recovery, logoutWarning,
    profile: matchingProfile ? profileState.profile : null,
    profileLoading: Boolean(userId && (!matchingProfile || profileState.loading)),
    profileError: matchingProfile ? profileState.error : '',
    retrySession, retryProfile, finishRecovery, logout,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider.')
  return value
}
