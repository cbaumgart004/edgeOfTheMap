// Assembles what admin.theedgeofthemap.com serves: every released console
// version plus the current loader. Amplify replaces the whole site on each
// deploy, so the released versions must come from the repo, not from earlier
// deploys.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

const out = new URL('../site/', import.meta.url)
rmSync(out, { recursive: true, force: true })
mkdirSync(out)
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn'], { stdio: 'inherit', env: { ...process.env, BUILD: 'loader' } })
cpSync(new URL('../dist/loader.js', import.meta.url), new URL('loader.js', out))
cpSync(new URL('../releases/console/', import.meta.url), new URL('console/', out), { recursive: true })
writeFileSync(new URL('index.html', out), '<!doctype html><title>Edge of the Map console</title><p>Nothing to see here.</p>\n')
console.log('site/ ready')
