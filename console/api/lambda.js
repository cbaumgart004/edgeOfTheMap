// Lambda entry point: wires handler.js to AWS, Neon and Neon Auth.
//
// Environment (names only; values are set on the function):
//   CONTROL_DATABASE_PARAM  SSM SecureString holding Edge of the Map's connection string
//   NEON_AUTH_URL           Neon Auth base URL; JWTs are checked against its JWKS
//   MEDIA_REGION            region of the customers' photo buckets (default us-east-1)
//
// Each site's connection string is the SSM parameter named in sites.connection_param
// (ADR-0007), so adding a customer needs no redeploy.

import pg from 'pg'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createRemoteJWKSet, jwtVerify, SignJWT, decodeProtectedHeader } from 'jose'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'
import { createHandler } from './handler.js'
import { migrate as runMigrations } from './migrate.js'
import { register } from './register.js'
import { createAuthProxy } from './auth-proxy.js'
import { sanitizeDocumentData } from '../src/richtext.js'

const ssm = new SSMClient({})
const s3 = new S3Client({ region: process.env.MEDIA_REGION ?? 'us-east-1' })
const purify = createDOMPurify(new JSDOM('').window)

const secrets = new Map()
async function secret(name) {
  if (!secrets.has(name)) {
    const out = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }))
    secrets.set(name, out.Parameter.Value)
  }
  return secrets.get(name)
}

// One small pool per project per container. Neon scales to zero; the first query
// after idle waits for it to wake.
const pools = new Map()
async function poolFor(param) {
  if (!pools.has(param)) pools.set(param, new pg.Pool({ connectionString: await secret(param), max: 2, idleTimeoutMillis: 10_000 }))
  return pools.get(param)
}

const authUrl = process.env.NEON_AUTH_URL
const jwks = authUrl ? createRemoteJWKSet(new URL(`${authUrl.replace(/\/$/, '')}/.well-known/jwks.json`)) : null

// Editor tokens (handler.js /api/handoff) are HS256, keyed from the control
// project's connection string: already secret, already in SSM, so no new
// credential to provision. Rotating that password signs every editor out.
const EDITOR_ISSUER = 'eotm-console'
const EDITOR_HOURS = 8
let editorKey = null
async function editorSecret() {
  editorKey ??= createHash('sha256').update(`eotm-editor-token:${await secret(process.env.CONTROL_DATABASE_PARAM)}`).digest()
  return editorKey
}

const http = createHandler({
  control: { query: async (sql, params) => (await poolFor(process.env.CONTROL_DATABASE_PARAM)).query(sql, params) },
  siteDb: (site) => poolFor(site.connection_param),
  async verifyToken(token) {
    if (decodeProtectedHeader(token).alg === 'HS256') {
      const { payload } = await jwtVerify(token, await editorSecret(), { issuer: EDITOR_ISSUER, algorithms: ['HS256'] })
      if (!payload.site) throw new Error('editor token without a site')
      return { id: payload.sub, email: payload.email ?? null, site: payload.site }
    }
    if (!jwks) throw new Error('NEON_AUTH_URL is not set')
    const { payload } = await jwtVerify(token, jwks, { issuer: new URL(authUrl).origin })
    return { id: payload.sub, email: payload.email ?? null }
  },
  async signEditorToken({ id, email, site }) {
    return new SignJWT({ email, site }).setProtectedHeader({ alg: 'HS256' }).setSubject(id)
      .setIssuer(EDITOR_ISSUER).setIssuedAt().setExpirationTime(`${EDITOR_HOURS}h`).sign(await editorSecret())
  },
  releases: async () => JSON.parse(await readFile(new URL('../releases/index.json', import.meta.url), 'utf8')),
  // Better Auth's own sign-up, sent from the admin host (a trusted domain). The
  // session it opens for the new login is discarded: the operator stays signed
  // in as themselves, and the new user signs in with the temporary password.
  async createLogin({ email, password, name }) {
    const res = await fetch(`${authUrl.replace(/\/$/, '')}/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://admin.theedgeofthemap.com' },
      body: JSON.stringify({ email, password, name }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.user?.id) throw new Error(`sign-up failed (${res.status}): ${data.message ?? data.code ?? 'no user returned'}`)
    return { id: data.user.id }
  },
  presign: ({ bucket, key, contentType, bytes }) =>
    getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: bytes }),
    { expiresIn: 300 }),
  sanitize: (schema) => (type, data) => sanitizeDocumentData(schema, type, data, purify),
  // Neon Auth checks Origin against its trusted domains, so send the admin host's.
  async requestPasswordReset(email) {
    const res = await fetch(`${authUrl.replace(/\/$/, '')}/request-password-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://admin.theedgeofthemap.com' },
      body: JSON.stringify({ email, redirectTo: 'https://admin.theedgeofthemap.com/reset' }),
    })
    if (!res.ok) throw new Error(`password reset request failed (${res.status})`)
  },
})

// Function URL requests carry requestContext.http. A direct invoke (the Lambda
// console's Test tab, IAM-authorized only) with {"eotmMigrate": true} runs the
// migrations instead, so connection strings never leave SSM. A URL request
// cannot reach this: its body is not the event.
const authProxy = authUrl ? createAuthProxy({ authUrl }) : null

export async function handler(event, context) {
  if (authProxy && event?.rawPath?.startsWith('/auth/')) return authProxy(event)
  if (event?.eotmMigrate === true && !event.requestContext) return migrate(event)
  if (event?.eotmRegister && !event.requestContext) {
    return register(await poolFor(process.env.CONTROL_DATABASE_PARAM), event.eotmRegister)
  }
  return http(event, context)
}

// Runs the recorded migrations: the control project, then each project in
// {"siteParams": ["/eotm/sites/<site>/database", ...]} plus every registered site.
export async function migrate(event = {}) {
  const out = {}
  const run = async (param, target) => {
    const client = new pg.Client({ connectionString: await secret(param) })
    await client.connect()
    try { out[param] = await runMigrations(client, target) } finally { await client.end() }
  }
  await run(process.env.CONTROL_DATABASE_PARAM, 'control')
  const control = await poolFor(process.env.CONTROL_DATABASE_PARAM)
  const registered = (await control.query('SELECT connection_param FROM sites')).rows.map((r) => r.connection_param)
  for (const param of new Set([...(event.siteParams ?? []), ...registered])) await run(param, 'site')
  return out
}
