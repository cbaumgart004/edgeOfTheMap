// Local demo: builds, then serves demo/ and dist/ together so the demo page
// loads the real loader and bundle in local mode (localStorage, no login).
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

execFileSync(process.execPath, ['scripts/build.js'], { stdio: 'inherit' })
const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json', '.svg': 'image/svg+xml' }
const port = Number(process.env.PORT ?? 5180)
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^[\/]+/, '')
  const candidates = p.startsWith('dist') || p.startsWith('schema') ? [p] : [join('demo', p || 'index.html'), join('demo', 'index.html')]
  for (const c of candidates) {
    try {
      const body = await readFile(join(root, c))
      res.writeHead(200, { 'content-type': types[extname(c)] ?? 'application/octet-stream' })
      return res.end(body)
    } catch { /* next */ }
  }
  res.writeHead(404).end('not found')
}).listen(port, () => console.log(`demo: http://localhost:${port}/?edit   (site=storyshaped; add &site=spiritseeds)`))
