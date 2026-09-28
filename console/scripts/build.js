// Builds the console bundle and the loader, then prints the integrity hash the
// sites table pins (sites.console_integrity). A published version is never
// rebuilt in place: bump package.json's version for any change.
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true })
for (const target of ['console', 'loader']) {
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn'], { stdio: 'inherit', env: { ...process.env, BUILD: target } })
}
const bundle = readFileSync(new URL(`../dist/console/${pkg.version}/console.js`, import.meta.url))
const hash = `sha384-${createHash('sha384').update(bundle).digest('base64')}`
console.log(`console ${pkg.version}: ${(bundle.length / 1024).toFixed(0)} KB`)
console.log(`integrity: ${hash}`)
