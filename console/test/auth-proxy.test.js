import { describe, it, expect } from 'vitest'
import { createAuthProxy } from '../api/auth-proxy.js'

describe('auth proxy', () => {
  it('forwards without X-Forwarded-Host and returns host-only cookies', async () => {
    let seen
    const fetchImpl = async (url, init) => {
      seen = { url, init }
      const headers = new Headers({ 'content-type': 'application/json' })
      headers.append('set-cookie', '__Secure-neonauth.session_token=abc; Domain=neon.tech; Path=/; HttpOnly; Secure; SameSite=None')
      return new Response('{"ok":true}', { status: 200, headers })
    }
    const proxy = createAuthProxy({ authUrl: 'https://auth.example/neondb/auth/', fetchImpl })
    const res = await proxy({
      rawPath: '/auth/sign-in/email', rawQueryString: '', requestContext: { http: { method: 'POST' } },
      headers: { 'content-type': 'application/json', origin: 'https://site.example', 'x-forwarded-host': 'site.example' },
      cookies: ['a=1'], body: '{"email":"x"}',
    })
    expect(seen.url).toBe('https://auth.example/neondb/auth/sign-in/email')
    expect(seen.init.headers).toEqual({ 'content-type': 'application/json', origin: 'https://site.example', cookie: 'a=1' })
    expect(res.cookies).toEqual(['__Secure-neonauth.session_token=abc; Path=/; HttpOnly; Secure; SameSite=None'])
    expect(res.headers['cache-control']).toBe('private, no-store')
  })

  it('refuses path traversal', async () => {
    const proxy = createAuthProxy({ authUrl: 'https://auth.example', fetchImpl: async () => { throw new Error('should not fetch') } })
    expect((await proxy({ rawPath: '/auth/../admin', headers: {} })).statusCode).toBe(400)
  })
})
