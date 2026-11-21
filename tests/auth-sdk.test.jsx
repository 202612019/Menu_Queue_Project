import { StrictMode } from 'react'
import { BrowserRouter } from 'react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/') })

it('processes a recovery URL through the actual Supabase SDK before permitting a reset', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://sdk-fixture.example.test')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_fixture_only')
  const user = { id: 'd2000000-0000-4000-8000-000000000001', email: 'sdk-user@example.test', aud: 'authenticated', role: 'authenticated', email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, identities: [], created_at: new Date().toISOString() }
  const encoded = value => btoa(JSON.stringify(value)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_')
  const token = `${encoded({alg:'HS256',typ:'JWT'})}.${encoded({sub:user.id,session_id:'c0000000-0000-4000-8000-000000000001',exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})}.ZmFrZXNpZ25hdHVyZQ`
  window.history.replaceState({}, '', `/auth/callback#access_token=${token}&refresh_token=fixture-refresh-token&expires_in=3600&token_type=bearer&type=recovery`)
  vi.stubGlobal('fetch', vi.fn(async input => {
    const url = new URL(String(input))
    if (url.pathname === '/auth/v1/user') return new Response(JSON.stringify(user), {status:200,headers:{'Content-Type':'application/json'}})
    if (url.pathname === '/rest/v1/profiles') return new Response(JSON.stringify({id:user.id,full_name:'SDK Test Student',email:user.email,role:'student'}), {status:200,headers:{'Content-Type':'application/json'}})
    throw new Error(`Unexpected test endpoint: ${url.pathname}`)
  }))
  const { AuthProvider } = await import('../src/auth/AuthProvider')
  const { App } = await import('../src/app/App')
  const { supabase } = await import('../src/lib/supabase')
  const view = render(<StrictMode><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></StrictMode>)
  try {
    expect(await screen.findByLabelText('New password', {}, {timeout:5000})).toBeInTheDocument()
    expect(window.location.pathname).toBe('/reset-password')
    expect(window.location.hash).toBe('')
    expect(JSON.parse(sessionStorage.getItem('college-canteen:recovery')).userId).toBe(user.id)
    expect(JSON.parse(sessionStorage.getItem('college-canteen:recovery')).sessionId).toBe('c0000000-0000-4000-8000-000000000001')
    const restored = await supabase.auth.getSession()
    expect(restored.data.session.user.id).toBe(user.id)
    const requests = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input)).pathname)
    expect(requests.filter(path => path === '/auth/v1/user')).toHaveLength(1)
    expect(requests.some(path => path === '/auth/v1/token')).toBe(false)
  } finally {
    view.unmount()
    await supabase.auth.stopAutoRefresh()
  }
})
