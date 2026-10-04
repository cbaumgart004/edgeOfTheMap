// Types an owner defines for themselves, on top of the schema their site ships
// with (schema/sites/<site>.json). Kept apart from it, in sites.custom_schema,
// so reloading the shipped schema never loses them.
//
//   { "blocks": { "customBanner": { label, fields } },     sections placed on pages
//     "types":  { "customTestimonial": { label, plural, titleField, fields } } }   their own list
//
// Every custom name starts with "custom", so it can never collide with a type
// the site's own code knows. A custom section is offered in every page's
// section palette; the site renders it generically from its fields until its
// developer gives it a design. A custom collection is saved and served by the
// public API like any other type.

import { checkSchema } from './schema.js'

// Kinds an owner may use: the ones that need no code to render or to point at.
export const CUSTOM_KINDS = ['text', 'textarea', 'richtext', 'url', 'number', 'boolean', 'date', 'datetime', 'select', 'image', 'color', 'money', 'list', 'style']
const LIST_KINDS = CUSTOM_KINDS.filter((k) => k !== 'list')
const MAX_ADDED = 20 // fields the owner adds to one built-in, below
const MAX_TYPES = 30
const MAX_FIELDS = 40

// "Event banner" -> "customEventBanner"; a field "Button link" -> "buttonLink".
export function customName(label) {
  const words = String(label ?? '').normalize('NFKD').replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  const camel = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('').replace(/^\d+/, '')
  return camel ? `custom${camel}` : ''
}
export function fieldName(label) {
  const n = customName(label).slice('custom'.length)
  return n ? n[0].toLowerCase() + n.slice(1) : ''
}

// The owner's names for built-in types and fields, the third part of custom:
//
//   "labels": { "types":  { "page": { "label": "Page", "plural": "Pages" } },
//               "blocks": { "service": { "label": "Treatment" } },
//               "fields": { "blocks.service.title": "Treatment name",
//                           "blocks.service.bookingOptions.label": "Session" } }
//
// Only what the editor shows changes: stored names, saved content and the
// site's code are untouched, so a rename is always safe.
const MAX_LABEL = 60

function renameFields(fields, prefix, names) {
  return (fields ?? []).map((f) => {
    const path = `${prefix}.${f.name}`
    // shippedLabel: what the site calls it, for the editor's Reset.
    const out = names[path] ? { ...f, label: names[path], shippedLabel: f.label ?? f.name } : f
    return f.fields ? { ...out, fields: renameFields(f.fields, path, names) } : out
  })
}

// Fields the owner adds to anything the site ships with (fourth part of custom):
//
//   "fields": { "types.siteSettings.socials": [{ "name": "customPhoto", "kind": "image", "label": "Photo" }],
//               "blocks.hero": [{ "name": "customNote", "kind": "richtext", "label": "Note" }] }
//
// The key names what gains them: a type or section ("types.listing",
// "blocks.hero"), or a list or group inside one, by field names
// ("types.siteSettings.socials"). Every document of that type, every section
// of that kind and every row of that list gets them. Names start with
// "custom", so they never meet a field the site's code adds later. The site
// draws them generically after the element's own content (its Extras helper)
// until its developer places them; a `style` field restyles the element.

// The fields array at `at` in a schema, or null.
export function fieldsAt(schema, at) {
  const [kind, name, ...rest] = String(at ?? '').split('.')
  if (kind !== 'types' && kind !== 'blocks') return null
  let fields = schema?.[kind]?.[name]?.fields ?? null
  for (const part of rest) {
    const f = fields?.find((x) => x.name === part)
    if (!f || !['list', 'group'].includes(f.kind)) return null
    fields = f.fields ?? null
  }
  return fields
}

// The fields the owner added at `at`: what a site's Extras helper draws.
export const addedFields = (schema, at) => (fieldsAt(schema, at) ?? []).filter((f) => f.added)

function addFields(fields, rest, extra) {
  if (!rest.length) return [...(fields ?? []), ...extra.map((f) => ({ ...f, added: true }))]
  const [part, ...more] = rest
  return (fields ?? []).map((f) => (f.name === part ? { ...f, fields: addFields(f.fields, more, extra) } : f))
}

// The shipped schema with the owner's types added and names applied. Custom
// sections join the palette of every blocks field of every type. The owner's
// own definitions ride along as `custom`, for the editor that changes them.
const MAX_TEMPLATES = 50

export function mergeCustom(base, custom) {
  const blocks = custom?.blocks ?? {}
  const types = custom?.types ?? {}
  const labels = custom?.labels ?? {}
  const templates = Array.isArray(custom?.templates) ? custom.templates : []
  const added = custom?.fields ?? {}
  const renamed = Object.keys(labels.types ?? {}).length + Object.keys(labels.blocks ?? {}).length + Object.keys(labels.fields ?? {}).length
  if (!Object.keys(blocks).length && !Object.keys(types).length && !renamed && !templates.length && !Object.keys(added).length) return base
  const extra = Object.keys(blocks)
  const withPalette = (fields) => (fields ?? []).map((f) => (f.kind === 'blocks' ? { ...f, of: [...new Set([...f.of, ...extra])] } : f))
  const names = labels.fields ?? {}
  const merged = {
    ...base,
    blocks: {},
    types: {},
    custom,
  }
  const apply = (def, name, kind) => {
    const own = labels[kind]?.[name]
    const shipped = own ? { shippedLabel: def.label, shippedPlural: def.plural } : {}
    return { ...def, ...shipped, ...(own ?? {}), fields: renameFields(def.fields, `${kind}.${name}`, names) }
  }
  for (const [name, t] of Object.entries(base.types ?? {})) merged.types[name] = apply({ ...t, fields: withPalette(t.fields) }, name, 'types')
  for (const [name, b] of Object.entries(base.blocks ?? {})) merged.blocks[name] = apply(b, name, 'blocks')
  for (const [name, b] of Object.entries(blocks)) merged.blocks[name] = { ...b, custom: true }
  for (const [name, t] of Object.entries(types)) merged.types[name] = { ...t, custom: true }
  // Added fields last, so a renamed or custom element gains them too.
  for (const [at, extra] of Object.entries(added)) {
    const [kind, name, ...rest] = at.split('.')
    const def = merged[kind]?.[name]
    if (def && Array.isArray(extra)) merged[kind][name] = { ...def, fields: addFields(def.fields, rest, extra) }
  }
  // Section templates the owner saved ("Save as template"): a name and a
  // section's content, offered when adding a section of that type.
  merged.templates = templates.filter((t) => merged.blocks[t?.block?._type])
  return merged
}

function checkLabels(base, labels, errors) {
  if (labels == null) return
  if (typeof labels !== 'object' || Array.isArray(labels)) return errors.push('labels must be an object')
  const text = (v) => typeof v === 'string' && v.trim() && v.length <= MAX_LABEL
  for (const kind of ['types', 'blocks']) {
    for (const [name, l] of Object.entries(labels[kind] ?? {})) {
      if (!base[kind]?.[name]) errors.push(`labels.${kind}.${name}: no such built-in`)
      for (const [k, v] of Object.entries(l ?? {})) {
        if (!['label', 'plural'].includes(k)) errors.push(`labels.${kind}.${name}.${k}: only label and plural can be renamed`)
        else if (!text(v)) errors.push(`labels.${kind}.${name}.${k}: a name of 1 to ${MAX_LABEL} characters`)
      }
    }
  }
  for (const [path, v] of Object.entries(labels.fields ?? {})) {
    const [kind, name, ...rest] = path.split('.')
    let fields = base[kind]?.[name]?.fields
    let found = null
    for (const part of rest) {
      found = fields?.find((f) => f.name === part) ?? null
      fields = found?.fields
    }
    if (!found || !rest.length) errors.push(`labels.fields.${path}: no such built-in field`)
    else if (!text(v)) errors.push(`labels.fields.${path}: a name of 1 to ${MAX_LABEL} characters`)
  }
}

// Problems with an owner's definitions; empty means they can be saved.
export function checkCustom(base, custom) {
  const errors = []
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return ['custom types must be an object']
  const blocks = custom.blocks ?? {}
  const types = custom.types ?? {}
  if (Object.keys(blocks).length + Object.keys(types).length > MAX_TYPES) errors.push(`at most ${MAX_TYPES} custom types`)
  const checkFields = (fields, at, kinds) => {
    if (!Array.isArray(fields) || !fields.length) return errors.push(`${at}: add at least one field`)
    if (fields.length > MAX_FIELDS) errors.push(`${at}: at most ${MAX_FIELDS} fields`)
    for (const f of fields) {
      if (!kinds.includes(f?.kind)) errors.push(`${at}.${f?.name}: "${f?.kind}" cannot be used in a custom type`)
      if (f?.kind === 'list') checkFields(f.fields, `${at}.${f.name}`, LIST_KINDS)
      if (typeof f?.label !== 'string' || !f.label.trim()) errors.push(`${at}.${f?.name}: needs a label`)
    }
  }
  for (const [name, b] of Object.entries(blocks)) {
    if (!/^custom[A-Z]\w*$/.test(name)) errors.push(`blocks.${name}: custom names start with "custom"`)
    if (base.blocks?.[name]) errors.push(`blocks.${name}: already a built-in section`)
    if (typeof b?.label !== 'string' || !b.label.trim()) errors.push(`blocks.${name}: needs a name`)
    checkFields(b?.fields, `blocks.${name}`, CUSTOM_KINDS)
  }
  for (const [name, t] of Object.entries(types)) {
    if (!/^custom[A-Z]\w*$/.test(name)) errors.push(`types.${name}: custom names start with "custom"`)
    if (base.types?.[name]) errors.push(`types.${name}: already a built-in type`)
    if (typeof t?.label !== 'string' || !t.label.trim()) errors.push(`types.${name}: needs a name`)
    checkFields(t?.fields, `types.${name}`, CUSTOM_KINDS)
  }
  checkLabels(base, custom.labels, errors)
  if (custom.fields != null) {
    if (typeof custom.fields !== 'object' || Array.isArray(custom.fields)) errors.push('fields must be an object')
    else {
      const withTypes = { ...base, blocks: { ...base.blocks, ...blocks }, types: { ...base.types, ...types } }
      for (const [at, extra] of Object.entries(custom.fields)) {
        const target = fieldsAt(withTypes, at)
        if (!target) { errors.push(`fields.${at}: nothing there takes fields`); continue }
        if (!Array.isArray(extra) || !extra.length) { errors.push(`fields.${at}: a list of fields`); continue }
        if (extra.length > MAX_ADDED) errors.push(`fields.${at}: at most ${MAX_ADDED} added fields`)
        for (const f of extra) {
          if (!/^custom[A-Z]\w*$/.test(f?.name ?? '')) errors.push(`fields.${at}.${f?.name}: added names start with "custom"`)
          else if (target.some((x) => x.name === f.name)) errors.push(`fields.${at}.${f.name}: already a field there`)
        }
        checkFields(extra, `fields.${at}`, CUSTOM_KINDS)
      }
    }
  }
  if (custom.templates != null) {
    if (!Array.isArray(custom.templates)) errors.push('templates must be a list')
    else {
      if (custom.templates.length > MAX_TEMPLATES) errors.push(`at most ${MAX_TEMPLATES} templates`)
      for (const t of custom.templates) {
        if (typeof t?.name !== 'string' || !t.name.trim() || t.name.length > MAX_LABEL) errors.push(`templates: a name of 1 to ${MAX_LABEL} characters`)
        else if (!base.blocks?.[t.block?._type] && !blocks[t.block?._type]) errors.push(`templates.${t.name}: no such section type`)
      }
    }
  }
  if (!errors.length) errors.push(...checkSchema(mergeCustom(base, custom)))
  return errors
}

// Custom names in `before` that `after` drops: the API refuses to drop one
// that documents still use.
export function droppedCustom(before, after) {
  const gone = (k) => Object.keys(before?.[k] ?? {}).filter((n) => !after?.[k]?.[n])
  return { blocks: gone('blocks'), types: gone('types') }
}
