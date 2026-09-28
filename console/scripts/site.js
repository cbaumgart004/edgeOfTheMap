// Assembles what admin.theedgeofthemap.com serves: every released console
// version plus the current loader. Amplify replaces the whole site on each
// deploy, so the released versions must come from the repo, not from earlier
// deploys.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

const out = new URL('../site/', import.meta.url)
rmSync(out, { recursive: true, force: true })
mkdirSync(out)
for (const target of ['loader', 'dashboard']) {
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn'], { stdio: 'inherit', env: { ...process.env, BUILD: target } })
  cpSync(new URL(`../dist/${target}.js`, import.meta.url), new URL(`${target}.js`, out))
}
cpSync(new URL('../dashboard.html', import.meta.url), new URL('index.html', out))
cpSync(new URL('../releases/console/', import.meta.url), new URL('console/', out), { recursive: true })
console.log('site/ ready')
