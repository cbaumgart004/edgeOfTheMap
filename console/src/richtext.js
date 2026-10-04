// Rich text is stored as HTML, so a site can render it without the editor's code.
// It is sanitized on save by the console and again by the API, and a site should run
// it through the same function before inserting it: the allowlist is the contract.

import DOMPurify from 'dompurify'

const TAGS = ['p', 'br', 'strong', 'em', 's', 'u', 'code', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
  'blockquote', 'hr', 'a', 'img', 'span']
const ATTRS = ['href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'class', 'title']
const SAFE_URL = /^(https?:|mailto:|tel:|\/(?!\/)|#)/i

export function allowedClasses(schema) {
  return new Set((schema?.textStyles ?? []).map((s) => s.className))
}

// `purify` is injectable because the API runs DOMPurify over a jsdom window.
export function sanitizeRichText(html, schema, purify = DOMPurify) {
  const classes = allowedClasses(schema)
  const hook = (node) => {
    if (node.hasAttribute?.('class')) {
      const kept = node.getAttribute('class').split(/\s+/).filter((c) => classes.has(c))
      if (kept.length) node.setAttribute('class', kept.join(' '))
      else node.removeAttribute('class')
    }
    for (const attr of ['href', 'src']) {
      if (node.hasAttribute?.(attr) && !SAFE_URL.test(node.getAttribute(attr).trim())) node.removeAttribute(attr)
    }
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer')
    if (node.tagName === 'SPAN' && !node.hasAttribute('class')) node.replaceWith(...node.childNodes)
  }
  purify.addHook('afterSanitizeAttributes', hook)
  try {
    return purify.sanitize(String(html ?? ''), { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, ALLOW_DATA_ATTR: false })
  } finally {
    purify.removeHook('afterSanitizeAttributes')
  }
}

// Sanitize every richtext field in a document's data, in place of a copy.
export function sanitizeDocumentData(schema, typeName, data, purify) {
  const walk = (fields, d) => {
    if (!d || typeof d !== 'object') return d
    const out = { ...d }
    // The owner's own elements (schema/elements.js): formatted text is HTML too.
    if (Array.isArray(out._elements)) {
      out._elements = out._elements.map((el) => (el && typeof el.html === 'string' ? { ...el, html: sanitizeRichText(el.html, schema, purify) } : el))
    }
    for (const f of fields) {
      const v = out[f.name]
      if (v == null) continue
      if (f.kind === 'richtext') out[f.name] = sanitizeRichText(v, schema, purify)
      else if (f.kind === 'group') out[f.name] = walk(f.fields, v)
      else if (f.kind === 'list') out[f.name] = v.map((item) => walk(f.fields, item))
      else if (f.kind === 'blocks') out[f.name] = v.map((b) => (schema.blocks[b._type] ? walk(schema.blocks[b._type].fields, b) : b))
    }
    return out
  }
  return walk(schema.types[typeName]?.fields ?? [], data)
}
