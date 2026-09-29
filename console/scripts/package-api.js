// Builds dist/api.zip for the console API Lambda (Node.js 22, handler
// api/lambda.handler; the migrations runner is api/lambda.migrate). Only the
// API's own files and runtime dependencies go in, not the editor's.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const stage = new URL('../dist/api/', import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('package.json', root)))
const deps = ['pg', 'jose', 'jsdom', 'dompurify', '@aws-sdk/client-ssm', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', '@aws-sdk/client-sesv2', 'web-push']

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
for (const dir of ['api', 'core', 'schema']) cpSync(new URL(dir, root), new URL(dir, stage), { recursive: true })
mkdirSync(new URL('src', stage))
mkdirSync(new URL('releases', stage))
cpSync(new URL('releases/index.json', root), new URL('releases/index.json', stage))
cpSync(new URL('src/richtext.js', root), new URL('src/richtext.js', stage))
writeFileSync(new URL('package.json', stage), JSON.stringify({
  name: 'eotm-console-api', version: pkg.version, private: true, type: 'module',
  dependencies: Object.fromEntries(deps.map((d) => [d, pkg.dependencies[d]])),
}, null, 2))
execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--silent'], { cwd: stage, stdio: 'inherit', shell: process.platform === 'win32' })
const zip = new URL('../dist/api.zip', import.meta.url)
rmSync(zip, { force: true })
// Windows' bsdtar writes forward-slash zip entries; PowerShell 5.1's
// Compress-Archive writes backslashes, which Lambda cannot resolve.
const tar = 'C:/Windows/System32/tar.exe'
if (process.platform === 'win32') execFileSync(tar, ['-a', '-c', '-f', '../api.zip', '.'], { cwd: stage, stdio: 'inherit' })
else execFileSync('zip', ['-qr', '../api.zip', '.'], { cwd: stage, stdio: 'inherit' })
console.log('dist/api.zip ready')
