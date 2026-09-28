// Sign-in through Neon Auth (managed Better Auth), reached first-party on the
// customer's own domain through an Amplify proxy rewrite (ADR-0007), so Safari
// does not block the session cookie.
//
// UNVERIFIED until the ADR-0007 spike runs: the endpoint paths below are Better
// Auth's defaults, and where Neon Auth exposes the JWT (ADR-0007 reads
// `session.access_token`). Everything that depends on them is in this file.

export function neonAuth({ base = '/_edit/auth' } = {}) {
  let cached = null // { token, exp }

  async function call(path, init) {
    const res = await fetch(`${base}${path}`, { credentials: 'include', headers: { 'content-type': 'application/json' }, ...init })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.message ?? 'Sign-in failed.')
    return data
  }

  // Where the JWT appears is UNVERIFIED for Neon Auth, so try each place Better
  // Auth can put it: the set-auth-jwt header on get-session (jwt plugin), the
  // session body (ADR-0007's reading of Neon's docs), then the /token endpoint.
  async function fetchToken() {
    const res = await fetch(`${base}/get-session`, { credentials: 'include' })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return null
    let token = res.headers.get('set-auth-jwt') ?? data?.session?.access_token ?? data?.session?.accessToken ?? null
    if (!token) {
      const t = await fetch(`${base}/token`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      token = t?.token ?? null
    }
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    cached = { token, exp: payload.exp * 1000, email: data?.user?.email }
    return cached
  }

  return {
    async current() {
      try { return await fetchToken() } catch { return null }
    },
    async signIn(email, password) {
      await call('/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password }) })
      return fetchToken()
    },
    // Emails a reset link that returns to `redirectTo` with ?token=. Better
    // Auth renamed this endpoint; try the current name, then the older one.
    async requestPasswordReset(email, redirectTo) {
      const body = JSON.stringify({ email, redirectTo })
      try {
        return await call('/request-password-reset', { method: 'POST', body })
      } catch {
        return call('/forget-password', { method: 'POST', body })
      }
    },
    async resetPassword(token, newPassword) {
      return call('/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) })
    },
    async signOut() {
      cached = null
      await call('/sign-out', { method: 'POST', body: '{}' }).catch(() => {})
    },
    // The JWT lasts 15 minutes; refresh a minute early.
    async getToken() {
      if (!cached || cached.exp - Date.now() < 60_000) await fetchToken()
      return cached?.token ?? null
    },
  }
}

// Local mode: no server, one pretend owner.
export function localAuth() {
  const who = { token: 'local', email: 'owner@example.test' }
  return { current: async () => who, signIn: async () => who, signOut: async () => {}, getToken: async () => 'local' }
}
