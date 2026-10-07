// Ordered, recorded migrations (platform plan §7: IF NOT EXISTS is not one).
// Each file in migrations/<target>/ runs once, in name order, inside a
// transaction, and is recorded in schema_migrations.
//
//   node api/migrate.js control   # DATABASE_URL = Edge of the Map's project
//   node api/migrate.js site      # DATABASE_URL = one customer's project
//
// The connection string comes from the environment by name; never pass it as an
// argument, where it lands in shell history.

import { readdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import pg from 'pg'

export async function migrate(client, target, dir = new URL(`./migrations/${target}/`, import.meta.url)) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
  // No folder for a target (site has none yet) is nothing to apply, not a failure.
  const files = (await readdir(dir).catch((err) => (err.code === 'ENOENT' ? [] : Promise.reject(err)))).filter((f) => f.endsWith('.sql')).sort()
  const applied = []
  for (const file of files) {
    if (done.has(file)) continue
    const sql = await readFile(new URL(file, dir), 'utf8')
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      applied.push(file)
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`${file}: ${err.message}`)
    }
  }
  return applied
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2]
  if (!['control', 'site'].includes(target)) {
    console.error('usage: node api/migrate.js control|site   (DATABASE_URL in the environment)')
    process.exit(2)
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set')
    process.exit(2)
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const applied = await migrate(client, target)
    console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date')
  } finally {
    await client.end()
  }
}
