// The one site-schema format (SCHEMA.md). Pure functions, shared by the console
// in the browser and the API in Lambda, so a write is checked by the same rules
// that built the form.

export const FIELD_KINDS = [
  'text', 'textarea', 'richtext', 'url', 'number', 'money', 'boolean', 'date',
  'datetime', 'select', 'image', 'photos', 'relation', 'group', 'list', 'blocks', 'placement', 'layout', 'color',
]

const NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/

export function newId() {
  return globalThis.crypto.randomUUID()
}

export function slugify(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------- schema itself

// Returns a list of problems; empty means the schema is usable.
export function checkSchema(schema) {
  const errors = []
  if (!schema || typeof schema !== 'object') return ['schema must be an object']
  if (!schema.site || !NAME.test(schema.site)) errors.push('site must be a plain name')
  if (!Number.isInteger(schema.version)) errors.push('version must be an integer')
  const types = schema.types ?? {}
  const blocks = schema.blocks ?? {}
  if (!Object.keys(types).length) errors.push('types must declare at least one type')
  // The site's own admin pages, listed in the editor's menu.
  for (const t of schema.tools ?? []) {
    if (!t?.label || typeof t.path !== 'string' || !t.path.startsWith('/')) errors.push('tools: each needs a label and a path starting with /')
  }

  const checkFields = (fields, where) => {
    if (!Array.isArray(fields)) return errors.push(`${where}: fields must be an array`)
    const seen = new Set()
    for (const f of fields) {
      const at = `${where}.${f?.name}`
      if (!f?.name || !NAME.test(f.name)) errors.push(`${where}: field name "${f?.name}" is not a plain name`)
      if (f.name?.startsWith('_')) errors.push(`${at}: names starting with _ are reserved`)
      if (seen.has(f.name)) errors.push(`${at}: duplicate field`)
      seen.add(f.name)
      if (!FIELD_KINDS.includes(f.kind)) errors.push(`${at}: unknown kind "${f.kind}"`)
      if (f.kind === 'select' && !(f.options?.length > 0)) errors.push(`${at}: select needs options`)
      if (f.kind === 'relation' && !types[f.to]) errors.push(`${at}: relation to unknown type "${f.to}"`)
      if ('wide' in f && (!['image', 'photos'].includes(f.kind) || typeof f.wide !== 'boolean')) {
        errors.push(`${at}: wide is true or false, on an image or photos field`)
      }
      if (f.kind === 'photos' && f.indexes && !Array.isArray(f.indexes)) errors.push(`${at}: indexes must be a list`)
      if ('warnMissingIndex' in f && (f.kind !== 'photos' || !Array.isArray(f.indexes) || typeof f.warnMissingIndex !== 'boolean')) {
        errors.push(`${at}: warnMissingIndex is true or false, on a photos field with indexes`)
      }
      if ('maxItems' in f && (!['photos', 'list'].includes(f.kind) || !(Number.isInteger(f.maxItems) && f.maxItems > 0))) {
        errors.push(`${at}: maxItems is a whole number, on a photos or list field`)
      }
      if ('pattern' in f) {
        let ok = f.kind === 'text' && typeof f.pattern === 'string'
        try { if (ok) new RegExp(f.pattern, 'u') } catch { ok = false }
        if (!ok) errors.push(`${at}: pattern is a regular expression, on a text field`)
      }
      if (f.suggest && (f.kind !== 'text' || !blocks[f.suggest.block] || !f.suggest.field)) {
        errors.push(`${at}: suggest needs a text field and { block, field } naming a block and one of its fields`)
      }
      if (f.kind === 'group' || f.kind === 'list') checkFields(f.fields, at)
      if (f.kind === 'blocks') {
        if (!(f.of?.length > 0)) errors.push(`${at}: blocks needs "of"`)
        for (const b of f.of ?? []) if (!blocks[b]) errors.push(`${at}: unknown block "${b}"`)
      }
    }
  }

  for (const [name, t] of Object.entries(types)) {
    // Listed inside another type's menu (a Reference Page Layout under Page layouts).
    if (t.menuUnder != null && (!types[t.menuUnder] || t.menuUnder === name || types[t.menuUnder].menuUnder)) errors.push(`${name}: menuUnder must name another top-level type`)
    if (!NAME.test(name)) errors.push(`type "${name}" is not a plain name`)
    checkFields(t.fields, `types.${name}`)
    const names = (t.fields ?? []).map((f) => f.name)
    if (t.titleField && !names.includes(t.titleField)) errors.push(`types.${name}: titleField "${t.titleField}" is not a field`)
    if (t.slugFrom && !names.includes(t.slugFrom)) errors.push(`types.${name}: slugFrom "${t.slugFrom}" is not a field`)
  }
  for (const [name, b] of Object.entries(blocks)) {
    if (!NAME.test(name)) errors.push(`block "${name}" is not a plain name`)
    checkFields(b.fields, `blocks.${name}`)
  }
  for (const s of schema.textStyles ?? []) {
    if (!s.name || !/^[a-zA-Z][\w-]*$/.test(s.className ?? '')) errors.push(`textStyles: "${s.name}" needs a CSS class name`)
  }
  return errors
}

// ---------------------------------------------------------------- defaults

function defaultFor(field, schema) {
  if (field.default !== undefined) return structuredClone(field.default)
  switch (field.kind) {
    case 'boolean': return false
    case 'number': return null
    case 'money': return { amount: null, currency: field.currency ?? 'USD' }
    case 'photos': case 'list': case 'blocks': case 'layout': return []
    case 'relation': return field.many ? [] : null
    case 'group': return defaultData(field.fields, schema)
    case 'image': return null
    default: return ''
  }
}

export function defaultData(fields, schema) {
  const data = {}
  for (const f of fields ?? []) data[f.name] = defaultFor(f, schema)
  return data
}

export function newBlock(schema, blockName) {
  const def = schema.blocks?.[blockName]
  if (!def) throw new Error(`unknown block "${blockName}"`)
  return { _id: newId(), _type: blockName, ...defaultData(def.fields, schema) }
}

export function newListItem(field, schema) {
  return { _id: newId(), ...defaultData(field.fields, schema) }
}

// ---------------------------------------------------------------- duplicate

// A copy with fresh ids for every block and list row, so the copy can be edited
// and reordered without touching the original.
export function duplicateData(data) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out = {}
      for (const [k, x] of Object.entries(v)) out[k] = walk(x)
      if ('_id' in v) out._id = newId()
      return out
    }
    return v
  }
  return walk(data)
}

export function duplicateDocument(schema, doc, existingSlugs = []) {
  const type = schema.types[doc.type]
  const data = duplicateData(doc.data)
  if (type?.titleField && typeof data[type.titleField] === 'string') {
    data[type.titleField] = `${data[type.titleField]} (copy)`
  }
  let slug = doc.slug ? `${doc.slug}-copy` : ''
  for (let n = 2; slug && existingSlugs.includes(slug); n++) slug = `${doc.slug}-copy-${n}`
  return { type: doc.type, slug, status: 'draft', data }
}

// ---------------------------------------------------------------- validation

// An #anchor is a link to a section on the same page (a Service card).
const URL_OK = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#[\w-]+$)/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

function isBlank(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

// A photo may also carry how the owner turned and faded it: rotate in quarter
// turns, flip left to right, opacity in %. The site applies them as CSS.
function checkImage(v, at, errors) {
  if (!v || typeof v !== 'object' || typeof v.src !== 'string' || !v.src) errors.push(`${at}: image needs a src`)
  else if (!URL_OK.test(v.src)) errors.push(`${at}: image src must be a URL or a site path`)
  if (v?.rotate != null && ![0, 90, 180, 270].includes(v.rotate)) errors.push(`${at}: rotate must be 0, 90, 180 or 270`)
  if (v?.flip != null && typeof v.flip !== 'boolean') errors.push(`${at}: flip must be true or false`)
  if (v?.opacity != null && !(Number.isInteger(v.opacity) && v.opacity >= 10 && v.opacity <= 100)) errors.push(`${at}: opacity must be 10 to 100`)
}

function checkValue(field, value, at, schema, errors, opts) {
  if (isBlank(value) || (field.kind === 'money' && value?.amount == null)) {
    if (field.required && !opts.draft) errors.push(`${at}: required`)
    return
  }
  switch (field.kind) {
    case 'text': case 'textarea': case 'richtext':
      if (typeof value !== 'string') errors.push(`${at}: must be text`)
      else if (field.maxLength && value.length > field.maxLength) errors.push(`${at}: longer than ${field.maxLength}`)
      else if (field.pattern && !new RegExp(`^(?:${field.pattern})$`, 'u').test(value)) errors.push(`${at}: ${field.patternHelp ?? 'not in the allowed form'}`)
      // A name that must match a section on the same page (a button tied to a
      // Service by its heading). Checked on publish only, so autosave never
      // fails halfway through typing it.
      else if (field.suggest && opts.root && !opts.draft) {
        const names = suggestionsFor(schema, opts.root, field.suggest).map((n) => n.toLowerCase())
        const label = schema.blocks[field.suggest.block]?.label ?? field.suggest.block
        if (!names.includes(value.trim().toLowerCase())) errors.push(`${at}: no ${label} titled "${value}" on this page`)
      }
      break
    case 'url':
      if (typeof value !== 'string' || !URL_OK.test(value)) errors.push(`${at}: must be a link (https://, mailto:, tel: or /path)`)
      break
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) { errors.push(`${at}: must be a number`); break }
      if (field.integer && !Number.isInteger(value)) errors.push(`${at}: must be a whole number`)
      if (field.min != null && value < field.min) errors.push(`${at}: at least ${field.min}`)
      if (field.max != null && value > field.max) errors.push(`${at}: at most ${field.max}`)
      break
    case 'money':
      if (!Number.isInteger(value.amount) || value.amount < 0) errors.push(`${at}: amount must be whole cents, not negative`)
      if (!/^[A-Z]{3}$/.test(value.currency ?? '')) errors.push(`${at}: currency must be a 3-letter code`)
      break
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${at}: must be true or false`)
      break
    case 'date':
      if (!DATE.test(value)) errors.push(`${at}: must be YYYY-MM-DD`)
      break
    case 'datetime':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) errors.push(`${at}: must be a date and time`)
      break
    case 'placement':
      // '^' = first; otherwise the site's key of the entry this one follows.
      if (typeof value !== 'string' || value.length > 200) errors.push(`${at}: must name an entry to follow`)
      break
    case 'layout': {
      // [{ key, span }] in page order: the page's block names, each with its
      // width in columns of 12.
      if (!Array.isArray(value)) { errors.push(`${at}: must be a list`); break }
      const keys = new Set()
      value.forEach((b, i) => {
        if (typeof b?.key !== 'string' || !/^[\w-]{1,100}$/.test(b.key)) errors.push(`${at}[${i}]: key must be a plain name`)
        else if (keys.has(b.key)) errors.push(`${at}[${i}]: "${b.key}" is listed twice`)
        else keys.add(b.key)
        if (!Number.isInteger(b?.span) || b.span < 1 || b.span > 12) errors.push(`${at}[${i}]: width must be 1 to 12 columns`)
      })
      break
    }
    case 'color':
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) errors.push(`${at}: must be a colour like #1a2b3c`)
      break
    case 'select':
      if (!field.options.some((o) => o.value === value)) errors.push(`${at}: "${value}" is not an option`)
      break
    case 'image':
      checkImage(value, at, errors)
      break
    case 'photos':
      if (!Array.isArray(value)) { errors.push(`${at}: must be a list`); break }
      if (field.maxItems && value.length > field.maxItems) errors.push(`${at}: at most ${field.maxItems}`)
      value.forEach((p, i) => {
        checkImage(p, `${at}[${i}]`, errors)
        if (field.indexes && !field.indexes.includes(p?.index)) {
          errors.push(`${at}[${i}]: index must be one of ${field.indexes.join(', ')}`)
        }
      })
      break
    case 'relation': {
      const ids = field.many ? value : [value]
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) errors.push(`${at}: must reference documents by id`)
      break
    }
    case 'group':
      if (typeof value !== 'object' || Array.isArray(value)) errors.push(`${at}: must be an object`)
      else checkFields(field.fields, value, at, schema, errors, opts)
      break
    case 'list':
      if (!Array.isArray(value)) { errors.push(`${at}: must be a list`); break }
      if (field.maxItems && value.length > field.maxItems) errors.push(`${at}: at most ${field.maxItems}`)
      value.forEach((item, i) => checkFields(field.fields, item ?? {}, `${at}[${i}]`, schema, errors, opts))
      break
    case 'blocks':
      if (!Array.isArray(value)) { errors.push(`${at}: must be a list`); break }
      value.forEach((b, i) => {
        if (!field.of.includes(b?._type)) errors.push(`${at}[${i}]: block "${b?._type}" is not allowed here`)
        else checkFields(schema.blocks[b._type].fields, b, `${at}[${i}]`, schema, errors, opts)
      })
      break
  }
}

function checkFields(fields, data, at, schema, errors, opts) {
  for (const f of fields) checkValue(f, data?.[f.name], at ? `${at}.${f.name}` : f.name, schema, errors, opts)
}

// Things worth confirming before publishing, which do not stop it: a photos
// field with `warnMissingIndex` that has photos but none under one index (a
// Listing with no blacklight shot, whose toggle then tints the daylight ones).
export function warnDocument(schema, typeName, data) {
  const warnings = []
  for (const f of schema.types?.[typeName]?.fields ?? []) {
    const photos = data?.[f.name]
    if (f.kind !== 'photos' || !f.warnMissingIndex || !Array.isArray(photos) || !photos.length) continue
    const missing = f.indexes.filter((ix) => !photos.some((p) => p?.index === ix))
    if (missing.length) warnings.push(`${f.label ?? f.name}: no ${missing.join(' or ')} photo.${f.missingIndexHelp ? ` ${f.missingIndexHelp}` : ''}`)
  }
  return warnings
}

// Problems with a document's data against its type; empty means valid. A draft
// may be incomplete, so `{ draft: true }` skips required checks; publishing
// checks everything.
export function checkDocument(schema, typeName, data, opts = {}) {
  const type = schema.types?.[typeName]
  if (!type) return [`unknown type "${typeName}"`]
  const errors = []
  checkFields(type.fields, data ?? {}, '', schema, errors, { ...opts, root: data ?? {} })
  return errors
}

// Values a `suggest` field may take: `field` of every `block` section anywhere
// in the document's data, in page order.
export function suggestionsFor(schema, data, { block, field }) {
  const out = []
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (!v || typeof v !== 'object') return
    if (v._type === block && typeof v[field] === 'string' && v[field].trim()) out.push(v[field].trim())
    for (const [k, x] of Object.entries(v)) if (k !== field && typeof x === 'object') walk(x)
  }
  walk(data)
  return [...new Set(out)]
}

// Relation ids a document points at, for the API to confirm they exist.
export function relationIds(schema, typeName, data) {
  const out = []
  const walk = (fields, d) => {
    for (const f of fields) {
      const v = d?.[f.name]
      if (v == null) continue
      if (f.kind === 'relation') out.push(...(f.many ? v : [v]).map((id) => ({ to: f.to, id })))
      else if (f.kind === 'group') walk(f.fields, v)
      else if (f.kind === 'list') v.forEach((item) => walk(f.fields, item))
      else if (f.kind === 'blocks') v.forEach((b) => schema.blocks[b._type] && walk(schema.blocks[b._type].fields, b))
    }
  }
  walk(schema.types[typeName]?.fields ?? [], data)
  return out
}

export function titleOf(schema, doc) {
  const f = schema.types[doc.type]?.titleField
  const t = f ? doc.data?.[f] : ''
  return (typeof t === 'string' && t.trim()) || doc.slug || 'Untitled'
}

// A copy of `data` with `field` set to `value` on the section or row whose _id
// is `itemId` (the document itself when itemId is null), however deep it sits.
// Unchanged when no such item exists. Used by drag-to-size on the page.
// `value` may be a function of the old value.
export function setItemField(data, itemId, field, value) {
  const next = (old) => (typeof value === 'function' ? value(old) : value)
  if (!itemId) return { ...data, [field]: next(data?.[field]) }
  let found = false
  const walk = (v) => {
    if (found || !v || typeof v !== 'object') return v
    if (Array.isArray(v)) {
      const next = v.map(walk)
      return found ? next : v
    }
    if (v._id === itemId) { found = true; return { ...v, [field]: next(v[field]) } }
    for (const [k, x] of Object.entries(v)) {
      if (x && typeof x === 'object') {
        const next = walk(x)
        if (found) return { ...v, [k]: next }
      }
    }
    return v
  }
  const out = walk(data)
  return found ? out : data
}
