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
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'
import { createHandler } from './handler.js'
import { migrate as runMigrations } from './migrate.js'
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

export const handler = createHandler({
  control: { query: async (sql, params) => (await poolFor(process.env.CONTROL_DATABASE_PARAM)).query(sql, params) },
  siteDb: (site) => poolFor(site.connection_param),
  async verifyToken(token) {
    if (!jwks) throw new Error('NEON_AUTH_URL is not set')
    const { payload } = await jwtVerify(token, jwks, { issuer: new URL(authUrl).origin })
    return { id: payload.sub, email: payload.email ?? null }
  },
  presign: ({ bucket, key, contentType, bytes }) =>
    getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: bytes,
      CacheControl: 'public, max-age=31536000, immutable' }), { expiresIn: 300 }),
  sanitize: (schema) => (type, data) => sanitizeDocumentData(schema, type, data, purify),
})

// Second entry point, same package: runs the recorded migrations inside AWS, so
// connection strings never leave SSM. Invoke it from the Lambda console's Test
// tab with {"siteParams": ["/eotm/sites/<site>/database", ...]}; it migrates the
// control project, then each listed site project plus every registered site.
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
