// Lambda entry point: wires handler.js to AWS, Neon and Neon Auth.
//
// Environment (names only; values are set on the function):
//   CONTROL_DATABASE_PARAM  SSM SecureString holding Edge of the Map's connection string
//   NEON_AUTH_URL           Neon Auth base URL; JWTs are checked against its JWKS
//   MEDIA_BUCKET            the shared photo bucket; each site uploads under sites/<slug>/
//   MEDIA_BASE_URL          the https address (CloudFront) that bucket is served from
//   MEDIA_REGION            region of the photo buckets (default us-east-1)
//   NOTIFY_FROM             verified SES sender for change-request email, e.g.
//                           notifications@theedgeofthemap.com; unset = no email (push still goes)
//   UPTIMEROBOT_KEY_PARAM   optional: SSM name of UptimeRobot's read-only key; normally the key is
//                           pasted on the Manage page instead (monitors.js)
//
// Each site's connection string is the SSM parameter named in sites.connection_param
// (ADR-0007), so adding a customer needs no redeploy. A connection_param of
// `control-db:<database>` instead names a database inside the control project,
// reached with the control project's own credentials (eotmCreateSite below).

import pg from 'pg'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs'
import webpush from 'web-push'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createRemoteJWKSet, jwtVerify, SignJWT, decodeProtectedHeader } from 'jose'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'
import { createHandler } from './handler.js'
import { migrate as runMigrations } from './migrate.js'
import { register } from './register.js'
import { createMonitors } from './monitors.js'
import { createLogs } from './logs.js'
import { createAuthProxy } from './auth-proxy.js'
import { sanitizeDocumentData } from '../src/richtext.js'

const ssm = new SSMClient({})
const s3 = new S3Client({ region: process.env.MEDIA_REGION ?? 'us-east-1' })
const purify = createDOMPurify(new JSDOM('').window)
const ses = new SESv2Client({})
const cwLogs = new CloudWatchLogsClient({})
const notifyFrom = process.env.NOTIFY_FROM

const secrets = new Map()
async function secret(name) {
  if (!secrets.has(name)) {
    const out = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }))
    secrets.set(name, out.Parameter.Value)
  }
  return secrets.get(name)
}

// A site's connection string: its SSM parameter, or the control project's with
// the database swapped for `control-db:<database>`.
async function connectionFor(param) {
  const inControl = /^control-db:([a-z][a-z0-9_]*)$/.exec(param)
  if (!inControl) return secret(param)
  const url = new URL(await secret(process.env.CONTROL_DATABASE_PARAM))
  url.pathname = `/${inControl[1]}`
  return url.href
}

// One small pool per project per container. Neon scales to zero; the first query
// after idle waits for it to wake.
//
// Uploading a new api.zip is the whole deploy: the first time a container opens
// a project it applies that project's pending migrations (control or site),
// under an advisory lock so two cold containers cannot race. Already applied
// is one query. A failed migration is logged and retried by the next
// container; it never stops the API answering.
const pools = new Map()
const MIGRATE_LOCK = 727_001
async function poolFor(param) {
  if (!pools.has(param)) {
    pools.set(param, (async () => {
      const pool = new pg.Pool({ connectionString: await connectionFor(param), max: 2, idleTimeoutMillis: 10_000 })
      const client = await pool.connect()
      try {
        await client.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK])
        const applied = await runMigrations(client, param === process.env.CONTROL_DATABASE_PARAM ? 'control' : 'site')
        if (applied.length) console.log('[migrate]', param, 'applied', applied.join(', '))
      } catch (err) {
        console.error('[migrate]', param, 'failed:', err.message)
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATE_LOCK]).catch(() => {})
        client.release()
      }
      return pool
    })())
  }
  try {
    return await pools.get(param)
  } catch (err) {
    pools.delete(param) // e.g. SSM or the database unreachable: try again next request
    throw err
  }
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
  media: { bucket: process.env.MEDIA_BUCKET, baseUrl: process.env.MEDIA_BASE_URL },
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
  siteSchema: async (slug) => {
    try { return JSON.parse(await readFile(new URL(`../schema/sites/${slug}.json`, import.meta.url), 'utf8')) } catch { return null }
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
  // Change requests (requests.js). SES in the sandbox can still send to the
  // operators' own verified addresses, which is everyone this goes to.
  sendEmail: notifyFrom
    ? ({ to, subject, text }) => ses.send(new SendEmailCommand({
      FromEmailAddress: notifyFrom,
      Destination: { ToAddresses: [to] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
    }))
    : undefined,
  sendPush: (subscription, payload, vapid) => webpush.sendNotification(subscription, payload, {
    vapidDetails: { subject: 'mailto:keeper@theedgeofthemap.com', publicKey: vapid.publicKey, privateKey: vapid.privateKey },
    TTL: 24 * 60 * 60,
  }),
  generateVapid: () => webpush.generateVAPIDKeys(),
  // Uptime monitors on the management page (monitors.js). The read-only key is
  // pasted on the Manage page; UPTIMEROBOT_KEY_PARAM, if set, names one in SSM instead.
  monitors: createMonitors({
    control: { query: async (sql, params) => (await poolFor(process.env.CONTROL_DATABASE_PARAM)).query(sql, params) },
    fetch,
    fallbackKey: process.env.UPTIMEROBOT_KEY_PARAM ? () => secret(process.env.UPTIMEROBOT_KEY_PARAM) : undefined,
  }),
  // This function's own CloudWatch log on the management page (logs.js).
  logs: process.env.AWS_LAMBDA_FUNCTION_NAME
    ? createLogs({
      logGroup: process.env.AWS_LAMBDA_LOG_GROUP_NAME ?? `/aws/lambda/${process.env.AWS_LAMBDA_FUNCTION_NAME}`,
      filterLogEvents: (input) => cwLogs.send(new FilterLogEventsCommand(input)),
    })
    : undefined,
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
// console's Test tab, IAM-authorized only) with {"eotmMigrate": true} runs every
// project's migrations at once, so connection strings never leave SSM. It is
// no longer a deploy step: poolFor applies them as each project is first used. A URL request
// cannot reach this: its body is not the event.
const authProxy = authUrl ? createAuthProxy({ authUrl }) : null

export async function handler(event, context) {
  if (authProxy && event?.rawPath?.startsWith('/auth/')) return authProxy(event)
  if (event?.eotmMigrate === true && !event.requestContext) return migrate(event)
  if (event?.eotmRegister && !event.requestContext) {
    return register(await poolFor(process.env.CONTROL_DATABASE_PARAM), event.eotmRegister)
  }
  if (event?.eotmCreateSite && !event.requestContext) return createSite(event.eotmCreateSite)
  return http(event, context)
}

// Runs the recorded migrations: the control project, then each project in
// {"siteParams": ["/eotm/sites/<site>/database", ...]} plus every registered site.
export async function migrate(event = {}) {
  const out = {}
  const run = async (param, target) => {
    const client = new pg.Client({ connectionString: await connectionFor(param) })
    await client.connect()
    try { out[param] = await runMigrations(client, target) } finally { await client.end() }
  }
  await run(process.env.CONTROL_DATABASE_PARAM, 'control')
  const control = await poolFor(process.env.CONTROL_DATABASE_PARAM)
  const registered = (await control.query('SELECT connection_param FROM sites')).rows.map((r) => r.connection_param)
  for (const param of new Set([...(event.siteParams ?? []), ...registered])) await run(param, 'site')
  return out
}

// A new site without a Neon project of its own: a database `site_<slug>` in the
// control project, migrated, then registered. A Test-tab invoke:
// {"eotmCreateSite": {"site": "<slug>", "allowedOrigins": ["https://…"], "owners": []}}
// Safe to repeat: an existing database is kept and only migrated.
export async function createSite(input = {}) {
  if (!/^[a-z0-9-]+$/.test(input.site ?? '')) throw new Error('site must be a slug')
  const database = `site_${input.site.replace(/-/g, '_')}`
  const control = await poolFor(process.env.CONTROL_DATABASE_PARAM)
  const exists = (await control.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])).rows.length > 0
  if (!exists) await control.query(`CREATE DATABASE "${database}"`)
  const connectionParam = `control-db:${database}`
  const client = new pg.Client({ connectionString: await connectionFor(connectionParam) })
  await client.connect()
  let migrated
  try { migrated = await runMigrations(client, 'site') } finally { await client.end() }
  const site = await register(control, { ...input, connectionParam })
  return { database, created: !exists, migrated, site }
}
