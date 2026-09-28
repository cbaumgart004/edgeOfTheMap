// Freezes the current build as a published version. Customer sites are pinned to
// a version and its integrity hash (ADR-0007), so a released version is never
// rewritten: this refuses to overwrite one. Bump package.json's version first.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
const dest = new URL(`../releases/console/${pkg.version}/`, import.meta.url)
if (existsSync(dest)) {
  console.error(`console ${pkg.version} is already released. Bump the version in package.json.`)
  process.exit(1)
}
execFileSync(process.execPath, ['scripts/build.js'], { stdio: 'inherit' })
cpSync(new URL(`../dist/console/${pkg.version}/`, import.meta.url), dest, { recursive: true, filter: (src) => !src.endsWith('.map') })
const integrity = `sha384-${createHash('sha384').update(readFileSync(new URL('console.js', dest))).digest('base64')}`
const index = new URL('../releases/index.json', import.meta.url)
const list = existsSync(index) ? JSON.parse(readFileSync(index)) : []
list.push({ version: pkg.version, integrity, releasedAt: new Date().toISOString().slice(0, 10) })
writeFileSync(index, `${JSON.stringify(list, null, 2)}\n`)
console.log(`released console ${pkg.version}; pin a site with console_version='${pkg.version}', console_integrity='${integrity}'`)
