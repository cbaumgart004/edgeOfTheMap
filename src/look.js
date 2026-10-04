// look.js
//
// The console's schema-driven looks, as this site draws them:
//   buttonClass:  a button's classes from the schema's buttonStyles.
//   classNameOf:  the CSS class an element's `class` stands for: one of the
//                 site's own (a single-class selector, ".btn") or the owner's
//                 own (.c-<name>).
//   lookToCss:    a `style` field ({ size, font, weight, align, color,
//                 background, width }) as CSS; a named colour is one of the
//                 schema's styleColors, pointing at a face token, so it follows
//                 daylight and mystic.

const SIZES = { small: '0.875em', large: '1.25em', xlarge: '1.6em' }
const FONTS = { heading: 'var(--display-font)', body: 'var(--body-font)' }

export function buttonClass(schema, look) {
  const styles = schema?.buttonStyles ?? []
  return (styles.find((s) => s.value === look) ?? styles[0])?.className ?? 'btn btn-primary'
}

export function classNameOf(schema, name) {
  if (!name) return ''
  const site = (schema?.classes ?? []).find((c) => c.name === name)
  if (site) return /^\.[\w-]+$/.test(site.selector.trim()) ? site.selector.trim().slice(1) : ''
  return (schema?.custom?.classes ?? []).some((c) => c.name === name) ? `c-${name}` : ''
}

export function lookToCss(schema, look) {
  if (!look || typeof look !== 'object') return undefined
  const colour = (v) => (!v ? undefined : schema?.styleColors?.find((c) => c.value === v)?.css ?? (/^#[0-9a-f]{6}$/i.test(v) ? v : undefined))
  const css = {
    fontSize: SIZES[look.size],
    fontFamily: FONTS[look.font],
    fontWeight: look.weight === 'bold' ? 700 : look.weight === 'normal' ? 400 : undefined,
    textAlign: look.align,
    color: colour(look.color),
    background: colour(look.background),
    ...(look.width ? { width: `${look.width}%`, maxWidth: '100%', marginInline: 'auto' } : {}),
    ...(look.background ? { padding: '0.75em 1em' } : {}),
  }
  const out = Object.fromEntries(Object.entries(css).filter(([, v]) => v != null))
  return Object.keys(out).length ? out : undefined
}
