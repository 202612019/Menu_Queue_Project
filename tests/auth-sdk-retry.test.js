import { createClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'

it('leaves a failed callback intact and lets only a fresh SDK instance retry initialization', async () => {
  const user = { id: 'e1000000-0000-4000-8000-000000000001', email: 'retry@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, identities: [], created_at: new Date().toISOString() }
  const encode = value => btoa(JSON.stringify(value)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_')
  const token = `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,session_id:'e2000000-0000-4000-8000-000000000001',exp:Math.floor(Date.now()/1000)+3600})}.ZmFrZXNpZ25hdHVyZQ`
  window.history.replaceState({}, '', `/auth/callback#access_token=${token}&refresh_token=fixture-refresh&expires_in=3600&token_type=bearer&type=recovery`)
  const originalHash = window.location.hash
  let networkAvailable = false
  const request = vi.fn(async input => {
    expect(new URL(String(input)).pathname).toBe('/auth/v1/user')
    if (!networkAvailable) throw new TypeError('Simulated connection failure')
    return new Response(JSON.stringify(user), {status:200,headers:{'Content-Type':'application/json'}})
  })
  vi.stubGlobal('fetch', request)
  // The SDK logs transport exceptions; suppress only this synthetic fixture.
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const options = { auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: false, storageKey: 'sdk-retry-fixture' } }
  const first = createClient('https://retry.example.test', 'sb_publishable_fixture_only', options)
  let second
  try {
    const failed = await first.auth.initialize()
    expect(failed.error).toBeTruthy()
    expect(window.location.hash).toBe(originalHash)
    const count = request.mock.calls.length
    networkAvailable = true
    const cached = await first.auth.initialize()
    expect(cached.error).toBe(failed.error)
    expect(request).toHaveBeenCalledTimes(count)
    await first.auth.dispose()
    // Model a document reload: new SDK owner, same browser storage and URL.
    second = createClient('https://retry.example.test', 'sb_publishable_fixture_only', options)
    expect((await second.auth.initialize()).error).toBeNull()
    expect((await second.auth.getSession()).data.session.user.id).toBe(user.id)
    expect(window.location.hash).toBe('')
    expect(request).toHaveBeenCalledTimes(count + 1)
  } finally {
    await first.auth.dispose()
    await second?.auth.dispose()
    vi.unstubAllGlobals()
    log.mockRestore()
    window.history.replaceState({}, '', '/')
  }
})
