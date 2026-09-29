// Adds or updates a customer site in the control project and sets its members.
// Run as a direct invoke of the console Lambda (never reachable from a function
// URL): {"eotmRegister": {"site": "storyshaped", "name": "...", ...}}. The schema
// comes from schema/sites/<site>.json in this package and the pinned version
// from releases/index.json at build time, so the row matches what was shipped.

import { readFile } from 'node:fs/promises'
import { checkSchema } from '../schema/schema.js'
import { cleanProfile } from './manage.js'

export async function register(db, input) {
  const { site, name, allowedOrigins, connectionParam, consoleVersion, consoleIntegrity, owners = [],
    mediaBucket = '', mediaBaseUrl = '', profile = {} } = input
  if (!/^[a-z0-9-]+$/.test(site ?? '')) throw new Error('site must be a slug')
  if (!allowedOrigins?.length || allowedOrigins.some((o) => !/^https:\/\/[^/]+$/.test(o))) {
    throw new Error('allowedOrigins must be https origins with no path')
  }
  if (!connectionParam?.startsWith('/eotm/sites/') && !/^control-db:site_[a-z0-9_]+$/.test(connectionParam ?? '')) {
    throw new Error('connectionParam must be an /eotm/sites/ parameter name or control-db:site_<slug>')
  }
  const schema = JSON.parse(await readFile(new URL(`../schema/sites/${site}.json`, import.meta.url), 'utf8'))
  const problems = checkSchema(schema)
  if (problems.length) throw new Error(`schema: ${problems[0]}`)
  const releases = JSON.parse(await readFile(new URL('../releases/index.json', import.meta.url), 'utf8'))
  const release = releases.find((r) => r.version === (consoleVersion ?? releases.at(-1).version))
  if (!release) throw new Error(`console ${consoleVersion} is not released`)
  if (consoleIntegrity && consoleIntegrity !== release.integrity) throw new Error('consoleIntegrity does not match the release')

  // The company's setup record (manage.js PROFILE_FIELDS); merged, so a repeat
  // run adds to what the Manage page holds rather than wiping it.
  const cleanedProfile = cleanProfile(profile)
  const { rows } = await db.query(
    `INSERT INTO sites (slug, name, schema, console_version, console_integrity, allowed_origins, connection_param, media_bucket, media_base_url, profile)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (slug) DO UPDATE SET name = $2, schema = $3, console_version = $4, console_integrity = $5,
       allowed_origins = $6, connection_param = $7, media_bucket = $8, media_base_url = $9, profile = sites.profile || $10, updated_at = now()
     RETURNING id, slug, console_version`,
    [site, name ?? schema.brand?.name ?? site, schema, release.version, release.integrity, allowedOrigins, connectionParam, mediaBucket, mediaBaseUrl, cleanedProfile])
  for (const userId of owners) {
    await db.query(
      `INSERT INTO site_members (site_id, user_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (site_id, user_id) DO UPDATE SET role = 'owner'`, [rows[0].id, userId])
  }
  return { ...rows[0], owners }
}
