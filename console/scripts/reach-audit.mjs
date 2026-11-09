#!/usr/bin/env node
// Is everything a visitor can see reachable in the editor?
//
//   node scripts/reach-audit.mjs <site> [--build dir | --url https://...] [--update] [--report file.json]
//
// --build builds that site checkout and audits it from a local server, against
// the live content: exactly the commit about to ship, before anything deploys.
// Spirit Seeds has to use it: its preview host sends a stranger to production.
//
// Opens the site in headless Chrome at desktop, tablet and phone width and reads
// what is painted, then compares it to console/schema/sites/<site>.json.
//
//   content   words or a picture with no field marked on or around it
//   weak      words or a picture that only opens its whole section
//   look      a background, border or CSS-drawn shape with no class or field
//   spacing   a section's margin or padding with no field or class that owns it
//   dead      a class in the schema that matches nothing on any page
//   orphan    a mark on the page naming a field the schema does not have
//
// It is a ratchet. scripts/reach-baseline/<site>.json lists the gaps that are
// known; a gap not on that list fails the run, so the list can only shrink.
// `owners` in that file names the schema field that owns a look the page cannot
// show it owning (a setting that feeds a CSS variable); a name not in the schema
// is itself a failure. --update rewrites the list from this run.
import { execSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1] }
const site = args[0]
const URLS = {
  spiritseeds: 'https://preview.spiritseedswellness.com',
  storyshaped: 'https://preview.di5pjjwi2k9o1.amplifyapp.com',
  edgeofthemap: 'https://theedgeofthemap.com',
}
const buildDir = opt('build')
const PORT = 5198
const base = buildDir ? `http://localhost:${PORT}` : (opt('url') ?? URLS[site] ?? '').replace(/\/$/, '')
if (!site || !base) { console.error('usage: reach-audit.mjs <site> [--url u] [--update] [--report f]'); process.exit(2) }

const WIDTHS = [['desktop', 1280, 800], ['tablet', 768, 1024], ['phone', 390, 844]]
const MAX_PAGES = 25
const PER_PARENT = 3 // /library/a, /library/b: three of a kind show the template
const CHROME = process.env.CHROME ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)

const schema = JSON.parse(readFileSync(join(here, `../schema/sites/${site}.json`), 'utf8'))
const fieldNames = new Set()
;(function walk(v) {
  if (Array.isArray(v)) v.forEach(walk)
  else if (v && typeof v === 'object') { if (typeof v.name === 'string') fieldNames.add(v.name); Object.values(v).forEach(walk) }
})(schema)
const classes = (schema.classes ?? []).map((c) => ({ name: c.name, selector: c.selector }))

// Runs inside the page.
function measure(classes) {
  const POINT = '[data-eotm-text],[data-eotm-field],[data-eotm-richtext],[data-eotm-part],[data-eotm-label]'
  const SECTION = '[data-eotm-edit],[data-eotm-item],[data-eotm-group],[data-eotm-frame]'
  const LAYOUT = '.section,[data-eotm-edit],header,footer,nav,main>*'
  const plain = classes.flatMap((c) => c.selector.split(',').map((q) => ({ name: c.name, q: q.trim(), css: q.replace(/::?(before|after)/g, '').trim(), pseudo: /::?(before|after)/.exec(q)?.[1] ?? null })))
  const hit = (el, q) => { try { return el.matches(q) } catch { return false } }
  // A CSS-module class carries a build hash (_navbar_141ax_2); the signature must outlive the build.
  const one = (el) => el.tagName.toLowerCase() + ([...el.classList].filter((c) => !/^(is-|has-|active)/.test(c)).slice(0, 2).map((c) => `.${c.replace(/^(_[A-Za-z]+)_\w+_\d+$/, '$1')}`).join(''))
  const sig = (el) => (el.classList.length || !el.parentElement ? one(el) : `${sig(el.parentElement)}>${one(el)}`)
  const gaps = []; const used = new Set(); const marks = new Set()
  const add = (kind, el, why) => gaps.push({ kind, sig: sig(el), why, sample: (el.innerText ?? '').trim().slice(0, 40) })
  const classOf = (el, pseudo) => {
    const m = plain.filter((c) => c.pseudo === pseudo && hit(el, c.css))
    m.forEach((c) => used.add(c.name))
    return m.length > 0
  }
  const shows = (cs) => cs.backgroundImage !== 'none' || !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs.backgroundColor) || (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none')
  for (const el of document.body.querySelectorAll('*')) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|BR)$/.test(el.tagName) || el.closest('svg') !== null && el.tagName.toLowerCase() !== 'svg') continue
    for (const a of ['data-eotm-text', 'data-eotm-field', 'data-eotm-richtext']) { const v = el.getAttribute(a); if (v) marks.add(v) }
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    if (r.width === 0 || r.height === 0 || cs.visibility !== 'visible' || !el.checkVisibility()) continue
    classOf(el, null)
    const media = /^(IMG|VIDEO|IFRAME|svg|PICTURE)$/.test(el.tagName)
    const words = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (media || words) {
      if (!el.closest(POINT)) add(el.closest(SECTION) ? 'weak' : 'content', el, media ? el.tagName.toLowerCase() : 'words')
    }
    if (shows(cs) && !el.matches(POINT) && !classOf(el, null)) add('look', el, cs.backgroundImage !== 'none' ? 'background picture' : 'background or border')
    for (const p of ['before', 'after']) {
      const ps = getComputedStyle(el, `::${p}`)
      if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue
      if ((shows(ps) || ps.content !== '""') && !classOf(el, p)) add('look', el, `::${p}`)
    }
    if (el.matches(LAYOUT)) {
      const sides = ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom'].filter((s) => parseFloat(cs[s]) > 0)
      if (sides.length) add('spacing', el, sides.join(' '))
    }
  }
  return { origin: location.origin, gaps, used: [...used], marks: [...marks], links: [...document.querySelectorAll('a[href]')].map((a) => a.href) }
}

// A local server for --build; stopped on every way out.
let server = null
const stop = () => { if (!server) return; try { execSync(process.platform === 'win32' ? `taskkill /pid ${server.pid} /T /F` : `kill ${server.pid}`, { stdio: 'ignore' }) } catch { /* already gone */ } server = null }
process.on('exit', stop)
if (buildDir) {
  execSync('npm run build', { cwd: buildDir, stdio: 'ignore' })
  server = spawn(`npx vite preview --port ${PORT} --strictPort`, { cwd: buildDir, shell: true, stdio: 'ignore' })
  for (let i = 0; ; i++) {
    try { await fetch(base); break } catch { if (i > 40) { console.error('the local server did not start'); process.exit(2) } await new Promise((f) => setTimeout(f, 500)) }
  }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
async function visit(path, width, height) {
  const page = await browser.newPage()
  try {
    await page.setViewport({ width, height, isMobile: width < 500, hasTouch: width < 500 })
    await page.setRequestInterception(true)
    page.on('request', (q) => (/\/hit\b/.test(q.url()) ? q.abort() : q.continue()))
    await page.goto(base + path, { waitUntil: 'networkidle2', timeout: 45000 })
    await new Promise((f) => setTimeout(f, 800))
    const r = await page.evaluate(measure, classes)
    if (r.origin !== new URL(base).origin) throw new Error(`redirected to ${r.origin}: that is not the build under test`)
    return r
  } finally { await page.close() }
}

// The pages: follow links from home; a few of each kind, not every article.
const pages = ['/']; const perParent = {}
for (let i = 0; i < pages.length && pages.length < MAX_PAGES; i++) {
  let links = []
  try { ({ links } = await visit(pages[i], 1280, 800)) } catch (e) { console.error(`could not open ${pages[i]}: ${e.message}`); await browser.close(); process.exit(2) }
  for (const l of links) {
    let u; try { u = new URL(l) } catch { continue }
    if (u.origin !== base || /^\/(admin|api|oauth|auth)\b/.test(u.pathname) || /\.\w{2,5}$/.test(u.pathname)) continue
    const p = u.pathname.replace(/\/$/, '') || '/'
    const parent = p.split('/').slice(0, -1).join('/') || '/'
    if (pages.includes(p) || pages.length >= MAX_PAGES) continue
    if (parent !== '/' && (perParent[parent] = (perParent[parent] ?? 0) + 1) > PER_PARENT) continue
    pages.push(p)
  }
}

const found = new Map(); const used = new Set(); const marks = new Set()
let failedVisits = 0
const jobs = pages.flatMap((p) => WIDTHS.map((w) => [p, ...w]))
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let job; (job = jobs.shift());) {
    const [p, name, w, h] = job
    try {
      const r = await visit(p, w, h)
      r.used.forEach((x) => used.add(x)); r.marks.forEach((x) => marks.add(x))
      for (const g of r.gaps) {
        const key = `${g.kind}|${g.sig}`
        const row = found.get(key) ?? { kind: g.kind, sig: g.sig, why: g.why, sample: g.sample, page: p, widths: [] }
        if (!row.widths.includes(name)) row.widths.push(name)
        found.set(key, row)
      }
    } catch (e) { failedVisits++; console.warn(`could not read ${p} at ${name}: ${e.message}`) }
  }
}))
await browser.close()
if (failedVisits) { console.error(`${failedVisits} page visits failed; a partial run proves nothing.`); process.exit(2) }

for (const c of classes) if (!used.has(c.name)) found.set(`dead|${c.name}`, { kind: 'dead', sig: c.name, why: c.selector, sample: '', page: '', widths: [] })
for (const m of marks) {
  const last = m.split(/[.[\]]/).filter((s) => s && !/^\d+$/.test(s)).pop()
  if (last && !fieldNames.has(last)) found.set(`orphan|${last}`, { kind: 'orphan', sig: last, why: m, sample: '', page: '', widths: [] })
}

const file = join(here, `reach-baseline/${site}.json`)
const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { owners: {}, gaps: [] }
const badOwners = Object.entries(saved.owners).filter(([, f]) => !fieldNames.has(f) && !classes.some((c) => c.name === f))
for (const k of Object.keys(saved.owners)) found.delete(k)

const now = [...found.keys()].sort()
const known = new Set(saved.gaps)
const fresh = now.filter((k) => !known.has(k))
const fixed = saved.gaps.filter((k) => !found.has(k))
const counts = {}
for (const r of found.values()) counts[r.kind] = (counts[r.kind] ?? 0) + 1

console.log(`${site}: ${pages.length} pages at ${WIDTHS.length} widths, ${base}`)
console.log(Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'no gaps')
if (opt('report')) writeFileSync(opt('report'), JSON.stringify({ pages, gaps: [...found.values()] }, null, 1))
if (args.includes('--update')) {
  writeFileSync(file, `${JSON.stringify({ owners: saved.owners, gaps: now }, null, 1)}\n`)
  console.log(`baseline: ${now.length} known gaps written`)
  process.exit(badOwners.length ? 1 : 0)
}
for (const [k, f] of badOwners) console.log(`BAD OWNER ${k}: "${f}" is not in the schema`)
for (const k of fresh) { const r = found.get(k); console.log(`NEW ${k}  (${r.why}; ${r.widths.join('/')}; ${r.page}) ${r.sample}`) }
if (fixed.length) console.log(`${fixed.length} known gaps are gone; run --update to lock that in`)
console.log(fresh.length || badOwners.length ? `FAIL: ${fresh.length} new gaps` : `PASS: no new gaps, ${now.length} known remain`)
process.exit(fresh.length || badOwners.length ? 1 : 0)
