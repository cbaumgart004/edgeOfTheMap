// Classes: a site's named looks, edited once and applied everywhere they
// appear. The schema lists the site's own (`classes`: its buttons, its section
// headings, its body text, each with the CSS selector the site draws them
// with); the owner may add more (custom.classes: a name and a label, drawn on
// any element given that class, selector .c-<name>). An owner's class may be
// made from another (`base`: a site class drawn by a plain .x selector, or one
// of the owner's): an element with it carries the base's class as well, so it
// looks like the base and its own Style changes only what differs, and a
// change to the base still reaches it. Each class gets a Style
// field in one design document, `classes`, which the site turns into CSS rules
// (its ClassStyles component), so changing "Buttons" changes every button.
//
//   "classes": [{ "name": "btn", "label": "Buttons", "selector": ".btn" }]

export const CLASS_TYPE = 'classes'
const NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/

// The site's classes and the owner's, as one list: [{ name, label, selector, custom? }].
export function classesOf(schema, custom = schema?.custom) {
  const own = (custom?.classes ?? []).map((c) => ({ ...c, selector: `.c-${c.name}`, custom: true }))
  return [...(schema?.classes ?? []), ...own]
}

// The schema with its `classes` design document, one Style field per class.
// Nothing is added for a site with no classes.
export function withClasses(schema, custom) {
  const list = classesOf(schema, custom)
  if (!list.length) return schema
  return {
    ...schema,
    types: {
      ...schema.types,
      [CLASS_TYPE]: {
        label: 'Classes', plural: 'Classes', singleton: true, group: 'design',
        help: 'Each class is a look used across the site: change one here and every element with it changes.',
        fields: list.map((c) => ({ name: c.name, kind: 'style', label: c.label, ...(c.image ? { image: true } : {}), help: c.custom ? `Your class: give an element the class “${c.label}” to use it.` : `Every element drawn as ${c.label.toLowerCase()} on the site.` })),
      },
    },
  }
}

// Problems with a site's or an owner's class list.
export function checkClasses(list, at, errors, { custom = false } = {}) {
  if (list == null) return
  if (!Array.isArray(list)) return errors.push(`${at}: a list of classes`)
  const seen = new Set()
  for (const c of list) {
    if (!c?.name || !NAME.test(c.name)) errors.push(`${at}: "${c?.name}" is not a plain name`)
    else if (seen.has(c.name)) errors.push(`${at}.${c.name}: listed twice`)
    seen.add(c?.name)
    if (typeof c?.label !== 'string' || !c.label.trim()) errors.push(`${at}.${c?.name}: needs a label`)
    if (!custom && (typeof c?.selector !== 'string' || !c.selector.trim() || /[{}<>]/.test(c.selector))) errors.push(`${at}.${c?.name}: needs a CSS selector`)
    if (custom && c?.base != null && (typeof c.base !== 'string' || !NAME.test(c.base) || c.base === c.name)) errors.push(`${at}.${c?.name}: made from "${c?.base}", which is not a class name`)
  }
}

// A class can be given to an element (and so made from) when the site draws
// it with a plain .x selector, or it is the owner's.
export const canCarry = (c) => !!c && (c.custom || /^\.[\w-]+$/.test(c.selector?.trim() ?? ''))

// A class and the classes it is made from, outermost first: [Buttons, Outline].
export function lineage(list, c) {
  const out = []
  for (let at = c; at && out.length < 6 && !out.includes(at); at = at.base ? list.find((x) => x.name === at.base) : null) out.unshift(at)
  return out
}
