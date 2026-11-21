import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => window.history.replaceState({}, '', '/'))

it.each([
  ['/auth/callback', {present:false,failed:false,recovery:false,expired:false,pkce:false}],
  ['/auth/callback#access_token=fixture-only&type=recovery', {present:true,failed:false,recovery:true,expired:false,pkce:false}],
  ['/auth/callback?code=fixture-do-not-exchange', {present:true,failed:false,recovery:false,expired:false,pkce:true}],
  ['/auth/callback#error=access_denied&error_code=otp_expired', {present:true,failed:true,recovery:false,expired:true,pkce:false}],
])('captures only safe callback flags for fixture %s', async (url, expected) => {
  window.history.replaceState({}, '', url)
  vi.resetModules()
  const { initialAuthLink } = await import('../src/auth/authLinks')
  expect(initialAuthLink).toEqual(expected)
})
