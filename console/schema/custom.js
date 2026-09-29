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
export const CUSTOM_KINDS = ['text', 'textarea', 'richtext', 'url', 'number', 'boolean', 'date', 'datetime', 'select', 'image', 'color', 'money', 'list']
const LIST_KINDS = CUSTOM_KINDS.filter((k) => k !== 'list')
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

// The shipped schema with the owner's types added. Custom sections join the
// palette of every blocks field of every type.
export function mergeCustom(base, custom) {
  const blocks = custom?.blocks ?? {}
  const types = custom?.types ?? {}
  if (!Object.keys(blocks).length && !Object.keys(types).length) return base
  const extra = Object.keys(blocks)
  const withPalette = (fields) => (fields ?? []).map((f) => (f.kind === 'blocks' ? { ...f, of: [...new Set([...f.of, ...extra])] } : f))
  const merged = {
    ...base,
    blocks: { ...(base.blocks ?? {}) },
    types: {},
  }
  for (const [name, t] of Object.entries(base.types ?? {})) merged.types[name] = { ...t, fields: withPalette(t.fields) }
  for (const [name, b] of Object.entries(blocks)) merged.blocks[name] = { ...b, custom: true }
  for (const [name, t] of Object.entries(types)) merged.types[name] = { ...t, custom: true }
  return merged
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
  if (!errors.length) errors.push(...checkSchema(mergeCustom(base, custom)))
  return errors
}

// Custom names in `before` that `after` drops: the API refuses to drop one
// that documents still use.
export function droppedCustom(before, after) {
  const gone = (k) => Object.keys(before?.[k] ?? {}).filter((n) => !after?.[k]?.[n])
  return { blocks: gone('blocks'), types: gone('types') }
}
