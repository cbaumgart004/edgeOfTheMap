// Elements: what the owner adds to one section (or document) beyond its
// fields: a heading or paragraph, formatted text, a photo, a button, an empty
// box. Kept in the section's own data, `_elements`, each with its own `_id`, so
// it is edited, arranged (a part named by that id in _layout), duplicated and
// saved as a template like anything else; declared by no field, like _layout.
//
//   { _id, kind: 'text', text, tag?: 'h2' | 'h3' | 'p' }
//   { _id, kind: 'richtext', html }
//   { _id, kind: 'image', image: { src, alt, ... } }
//   { _id, kind: 'button', label, url, look?, icon? }
//   { _id, kind: 'box' }
//   { _id, kind: 'design', label, width, _elements, _layout }
//       a design brought in whole (a Canva PDF, src/canva.js): its own elements
//       on a free canvas the shape of the page it came from (_layout, height
//       its height as % of its width), drawn so it scales as one. `width` is
//       the page's width in points, so a text size reads in points as in
//       Canva. A design holds no design.
//   every kind also: class? (a class: the site's own or the owner's), style? (a Style)

export const ELEMENT_KINDS = ['text', 'richtext', 'image', 'button', 'box', 'design']
export const ELEMENT_LABELS = { text: 'Text', richtext: 'Formatted text', image: 'Photo', button: 'Button', box: 'Box', design: 'Design' }
// A design's text sizes are % (a part's `fs`) of this share of its width, so
// they scale with it: 100 is 4% of the design's width.
export const DESIGN_BASE = 4
// Points at a design's own width, for the pane, from a part's fs, and back.
export const fsToPoints = (fs, width) => Math.round(((fs ?? 100) / 100) * (DESIGN_BASE / 100) * width * 10) / 10
export const pointsToFs = (pt, width) => Math.round(((pt / width) * 100 * 100) / DESIGN_BASE * 10) / 10
export const MAX_ELEMENTS = 60
const TAGS = ['h2', 'h3', 'p']

// The fields each kind is edited with (Fields.jsx draws them like any field).
export function elementFields(kind, classOptions) {
  const common = [
    ...(classOptions.length ? [{ name: 'class', kind: 'select', label: 'Class', options: classOptions, blankLabel: 'None', help: 'A look kept in Classes: change the class there and every element with it changes.' }] : []),
    { name: 'style', kind: 'style', label: 'Style', help: 'This element’s own look, over its class.' },
  ]
  switch (kind) {
    case 'text': return [
      { name: 'text', kind: 'textarea', label: 'Text' },
      { name: 'tag', kind: 'select', label: 'Kind of text', options: [{ value: 'h2', label: 'Heading' }, { value: 'h3', label: 'Small heading' }, { value: 'p', label: 'Paragraph' }], blankLabel: 'Paragraph' },
      ...common]
    case 'richtext': return [{ name: 'html', kind: 'richtext', label: 'Text' }, ...common]
    case 'image': return [{ name: 'image', kind: 'image', label: 'Photo' }, ...common]
    case 'design': return [{ name: 'label', kind: 'text', label: 'Name', help: 'What the editor calls it.' }, ...common]
    case 'button': return [
      { name: 'label', kind: 'text', label: 'Button text' },
      { name: 'url', kind: 'url', label: 'Goes to' },
      { name: 'look', kind: 'select', label: 'Button style', optionsFrom: 'buttonStyles', blankLabel: 'The site’s usual' },
      { name: 'icon', kind: 'image', label: 'Icon' },
      ...common]
    default: return common
  }
}

// The classes an element can be given: the site's that are a single class
// name (".btn", not ".section h2"), and the owner's own.
export function classOptions(schema) {
  const site = (schema?.classes ?? []).filter((c) => /^\.[\w-]+$/.test(c.selector?.trim() ?? '')).map((c) => ({ value: c.name, label: c.label }))
  const own = (schema?.custom?.classes ?? []).map((c) => ({ value: c.name, label: c.label }))
  return [...site, ...own]
}

// The CSS class an element's `class` stands for.
export function classNameOf(schema, name) {
  if (!name) return ''
  const site = (schema?.classes ?? []).find((c) => c.name === name)
  if (site) return /^\.[\w-]+$/.test(site.selector.trim()) ? site.selector.trim().slice(1) : ''
  return (schema?.custom?.classes ?? []).some((c) => c.name === name) ? `c-${name}` : ''
}

export function newElement(kind, id, patch = {}) {
  const base = { text: { text: 'New text', tag: 'p' }, richtext: { html: '<p>New text</p>' }, image: {}, button: { label: 'Button', url: '/' }, box: {} }[kind] ?? {}
  return { _id: id, kind, ...base, ...patch }
}

// A copy with a fresh id.
export const copyElement = (el, id) => ({ ...structuredClone(el), _id: id })

// Problems with a section's elements. `fieldCheck(fields, value, at)` checks an
// element's content with the schema's own field rules (schema.js checkFields).
export function checkElements(list, at, schema, errors, fieldCheck) {
  if (!Array.isArray(list)) return errors.push(`${at}: must be a list`)
  if (list.length > MAX_ELEMENTS) errors.push(`${at}: at most ${MAX_ELEMENTS}`)
  const classes = new Set([...(schema?.classes ?? []), ...(schema?.custom?.classes ?? [])].map((c) => c.name))
  const ids = new Set()
  list.forEach((el, i) => {
    const where = `${at}[${i}]`
    if (!el || typeof el !== 'object' || Array.isArray(el)) return errors.push(`${where}: must be an object`)
    if (typeof el._id !== 'string' || !/^[\w:-]{1,100}$/.test(el._id)) errors.push(`${where}: needs an id`)
    else if (ids.has(el._id)) errors.push(`${where}: id used twice`)
    ids.add(el._id)
    if (!ELEMENT_KINDS.includes(el.kind)) return errors.push(`${where}: kind is ${ELEMENT_KINDS.join(', ')}`)
    if (el.class != null && el.class !== '' && !classes.has(el.class)) errors.push(`${where}.class: no class "${el.class}"`)
    if (el.tag != null && el.tag !== '' && !TAGS.includes(el.tag)) errors.push(`${where}.tag: h2, h3 or p`)
    if (el.kind === 'design') {
      if (!(typeof el.width === 'number' && el.width > 0 && el.width <= 20000)) errors.push(`${where}.width: the page's width in points`)
      if (Array.isArray(el._elements) && el._elements.some((e) => e?.kind === 'design')) errors.push(`${where}: a design holds no design`)
    }
    const fields = elementFields(el.kind, []).filter((f) => f.name !== 'tag' && f.name !== 'class')
    fieldCheck(fields, el, where)
  })
}
