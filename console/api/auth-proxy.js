// First-party sign-in for customer sites (ADR-0007). A site's Amplify rewrite
// sends /_edit/auth/<*> here, and this forwards to Neon Auth.
//
// Why not rewrite straight to Neon Auth: Amplify adds X-Forwarded-Host to
// proxied requests and Neon Auth rejects any request carrying one
// ("Invalid hostname header", checked 2026-09-28 with curl against the control
// project's Auth URL, trusted domain or not). Here the request is rebuilt with
// only the headers sign-in needs, and Set-Cookie comes back without a Domain
// attribute, so the session cookie belongs to the customer's own host.

const PASS_REQUEST = ['content-type', 'accept', 'origin', 'user-agent', 'authorization']
const PASS_RESPONSE = ['content-type', 'location', 'set-auth-jwt', 'set-auth-token']

export function createAuthProxy({ authUrl, fetchImpl = fetch }) {
  const base = authUrl.replace(/\/$/, '')
  return async function proxy(event) {
    const method = event.requestContext?.http?.method ?? 'GET'
    const rest = (event.rawPath ?? '').replace(/^\/auth\/?/, '')
    if (rest.includes('..')) return { statusCode: 400, body: 'bad path' }
    const qs = event.rawQueryString ? `?${event.rawQueryString}` : ''
    const headers = {}
    for (const h of PASS_REQUEST) if (event.headers?.[h]) headers[h] = event.headers[h]
    const cookies = event.cookies ?? (event.headers?.cookie ? [event.headers.cookie] : [])
    if (cookies.length) headers.cookie = cookies.join('; ')
    const body = ['GET', 'HEAD'].includes(method) || !event.body
      ? undefined
      : (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body)

    const res = await fetchImpl(`${base}/${rest}${qs}`, { method, headers, body, redirect: 'manual' })
    const out = { 'cache-control': 'private, no-store' }
    for (const h of PASS_RESPONSE) {
      const v = res.headers.get(h)
      if (v) out[h] = v
    }
    const setCookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.replace(/;\s*Domain=[^;]*/i, ''))
    return { statusCode: res.status, headers: out, cookies: setCookies, body: await res.text() }
  }
}
