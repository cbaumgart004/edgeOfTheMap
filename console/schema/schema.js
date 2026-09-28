// The one site-schema format (SCHEMA.md). Pure functions, shared by the console
// in the browser and the API in Lambda, so a write is checked by the same rules
// that built the form.

export const FIELD_KINDS = [
  'text', 'textarea', 'richtext', 'url', 'number', 'money', 'boolean', 'date',
  'datetime', 'select', 'image', 'photos', 'relation', 'group', 'list', 'blocks',
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
      if (f.kind === 'photos' && f.indexes && !Array.isArray(f.indexes)) errors.push(`${at}: indexes must be a list`)
      if (f.kind === 'group' || f.kind === 'list') checkFields(f.fields, at)
      if (f.kind === 'blocks') {
        if (!(f.of?.length > 0)) errors.push(`${at}: blocks needs "of"`)
        for (const b of f.of ?? []) if (!blocks[b]) errors.push(`${at}: unknown block "${b}"`)
      }
    }
  }

  for (const [name, t] of Object.entries(types)) {
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
    case 'photos': case 'list': case 'blocks': return []
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

const URL_OK = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

function isBlank(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

function checkImage(v, at, errors) {
  if (!v || typeof v !== 'object' || typeof v.src !== 'string' || !v.src) errors.push(`${at}: image needs a src`)
  else if (!URL_OK.test(v.src)) errors.push(`${at}: image src must be a URL or a site path`)
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
    case 'select':
      if (!field.options.some((o) => o.value === value)) errors.push(`${at}: "${value}" is not an option`)
      break
    case 'image':
      checkImage(value, at, errors)
      break
    case 'photos':
      if (!Array.isArray(value)) { errors.push(`${at}: must be a list`); break }
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

// Problems with a document's data against its type; empty means valid. A draft
// may be incomplete, so `{ draft: true }` skips required checks; publishing
// checks everything.
export function checkDocument(schema, typeName, data, opts = {}) {
  const type = schema.types?.[typeName]
  if (!type) return [`unknown type "${typeName}"`]
  const errors = []
  checkFields(type.fields, data ?? {}, '', schema, errors, opts)
  return errors
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
