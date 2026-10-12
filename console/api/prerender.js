// Pages as crawlers and link previews see them: the site's own index.html with
// one published page's title, description, canonical and share tags in the
// head, and its words in a <noscript> under the app's root. Each site's Amplify
// app rewrites its page addresses to GET /api/sites/<site>/page/<path>
// (handler.js), so a page is ready the moment it is published, with no rebuild.
// Visitors get the same page; the app renders over it as before, and the loader
// keeps the head current as they move between pages (src/loader.js).

import { publishedPages } from '../schema/schema.js'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Rich text's plain words: tags out, entities read back to their characters
// (the head escapes them again once).
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const text = (html) => String(html).replace(/<[^>]*>/g, ' ')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(parseInt(e[1] === 'x' || e[1] === 'X' ? e.slice(2) : e.slice(1), e[1] === 'x' || e[1] === 'X' ? 16 : 10)) : ENTITIES[e.toLowerCase()] ?? m))
  .replace(/\s+/g, ' ').trim()
const absolute = (src, base) => { try { return new URL(src, `${base}/`).href } catch { return null } }

// A document's words and pictures, walked through its schema: headings and text
// as they read, rich text as it was saved (sanitised on save), photos with their
// descriptions and links with their labels. What only shapes the page (styles,
// layouts, colours, switches) is left out.
export function snapshot(schema, type, data) {
  const out = []
  const images = []
  const walk = (fields, value, depth) => {
    for (const f of fields ?? []) {
      const v = value?.[f.name]
      // A menu label or a button's words name something else; a link carries them.
      if (v == null || v === '' || f.name === 'seo' || /^nav|Label$/.test(f.name)) continue
      if (f.kind === 'text' || f.kind === 'textarea') {
        const tag = depth === 0 && f.name === (schema.types[type]?.titleField ?? 'title') ? 'h1' : /title|heading|name/i.test(f.name) ? 'h2' : 'p'
        out.push(`<${tag}>${esc(v)}</${tag}>`)
      } else if (f.kind === 'richtext') out.push(String(v))
      else if (f.kind === 'image' && v.src) { images.push(v); out.push(`<img src="${esc(v.src)}" alt="${esc(v.alt ?? '')}">`) }
      else if (f.kind === 'photos' && Array.isArray(v)) {
        for (const p of v) if (p?.src) { images.push(p); out.push(`<img src="${esc(p.src)}" alt="${esc(p.alt ?? '')}">`) }
      } else if (f.kind === 'group') walk(f.fields, v, depth + 1)
      else if (f.kind === 'list' && Array.isArray(v)) {
        // A label beside an address is a link.
        const url = f.fields?.find((x) => x.kind === 'url')
        const label = f.fields?.find((x) => x.kind === 'text')
        for (const item of v) {
          if (url && label && item?.[url.name] && item?.[label.name]) out.push(`<p><a href="${esc(item[url.name])}">${esc(item[label.name])}</a></p>`)
          else walk(f.fields, item, depth + 1)
        }
      } else if (f.kind === 'blocks' && Array.isArray(v)) {
        for (const block of v) walk(schema.blocks?.[block?._type]?.fields, block, depth + 1)
      }
    }
  }
  walk(schema.types[type]?.fields, data, 0)
  return { html: out.join('\n'), images }
}

// What a page's head says: the owner's Search and sharing first, then what the
// page itself has (its title, its first words, its first photo).
export function pageMeta(schema, siteName, path, doc, base) {
  const seo = doc.data?.seo ?? {}
  const { html, images } = snapshot(schema, doc.type, doc.data)
  const own = doc.data?.[schema.types[doc.type]?.titleField ?? 'title']
  const title = seo.title?.trim() || (path === '/' ? null : own ? `${own} | ${siteName}` : null)
  const words = text(html.replace(/^<h1>[\s\S]*?<\/h1>/, '')) // the words under the heading
  const description = seo.description?.trim() || (words ? (words.length > 160 ? `${words.slice(0, 157).replace(/\s+\S*$/, '')}…` : words) : null)
  const src = seo.image?.src || images[0]?.src
  return { title, description, image: src ? absolute(src, base) : null, noindex: seo.noindex === true, url: base + path, html }
}

// The site's index.html with that page's head and words. Tags put here carry
// data-eotm-seo="added", so the loader takes them out on a page without its own
// (as it does the ones it adds); the site's own title is kept for it to put back.
export function renderPage(template, meta, { preview = false } = {}) {
  let page = template
  const tags = []
  const drop = (re) => { page = page.replace(re, '') }
  const set = (attr, key, value) => {
    if (!value) return
    drop(new RegExp(`<meta\\s+[^>]*${attr}="${key.replace(/[.:]/g, '\\$&')}"[^>]*>\\s*`, 'gi'))
    tags.push(`<meta ${attr}="${key}" content="${esc(value)}" data-eotm-seo="added">`)
  }
  if (meta.title) page = page.replace(/<title>([\s\S]*?)<\/title>/i, (_, own) => `<title data-eotm-orig="${esc(own.trim())}">${esc(meta.title)}</title>`)
  set('name', 'description', meta.description)
  set('property', 'og:title', meta.title)
  set('property', 'og:description', meta.description)
  set('property', 'og:url', meta.url)
  set('property', 'og:image', meta.image)
  set('name', 'twitter:card', meta.image ? 'summary_large_image' : null)
  set('name', 'robots', meta.noindex || preview ? 'noindex' : null)
  drop(/<link\s+[^>]*rel="canonical"[^>]*>\s*/gi)
  tags.push(`<link rel="canonical" href="${esc(meta.url)}" data-eotm-seo="added">`)
  page = page.replace(/<\/head>/i, `${tags.join('\n')}\n</head>`)
  if (meta.html) page = page.replace(/(<div id="root"[^>]*>)/i, `<noscript data-eotm-prerendered><main>${meta.html}</main></noscript>\n$1`)
  return page
}

// One page for the handler: the template (from the site's own address, fetched
// with its ETag so a site deploy is picked up on the next request), the page's
// document through the schema's sitemap aliases, and the page put together.
// A path with no document gets the template as it is.
export function createPrerender({ fetch = globalThis.fetch } = {}) {
  const templates = new Map() // base -> { etag, body }
  async function template(base) {
    const kept = templates.get(base)
    const res = await fetch(`${base}/index.html`, { headers: kept?.etag ? { 'if-none-match': kept.etag } : {} })
    if (res.status === 304 && kept) return kept.body
    if (!res.ok) {
      if (kept) return kept.body
      throw new Error(`index.html from ${base} answered ${res.status}`)
    }
    const body = await res.text()
    // A page of our own coming back means a rewrite reached index.html: stop.
    if (body.includes('data-eotm-prerendered') || !/<div id="root"/i.test(body)) throw new Error(`index.html from ${base} is not the site's template`)
    templates.set(base, { etag: res.headers.get('etag'), body })
    return body
  }

  return async function page({ schema, siteName, base, path, preview, listPublished }) {
    const shell = await template(base)
    try {
      const doc = (await publishedPages(schema, listPublished)).get(path)
      if (!doc) return { html: shell, found: false }
      return { html: renderPage(shell, pageMeta(schema, siteName, path, doc, base), { preview }), found: true }
    } catch (err) {
      console.warn('[console-api] prerender fell back to the bare page', path, err?.message)
      return { html: shell, found: false }
    }
  }
}
