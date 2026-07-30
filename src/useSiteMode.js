// useSiteMode.js
//
// **A site mode is a named axis of presentation that reskins the whole page.**
//
// Three sites in this workshop already ship one and each re-derived it: this
// site's light ⇄ mystic faces, Live Spirit Seeds' season × UX-style (four
// palettes crossed with four structures), and StoryShaped Studios' daylight ⇄
// blacklight. They differ in almost every visible way and are the same three
// steps underneath — **read an initial value, write it to the DOM, persist it**
// — differing only in where the value is kept.
//
// This is that shape, extracted. It is deliberately small: the interesting part
// of a mode is its CSS, and a primitive that tried to own the CSS would be worse
// than the duplication it replaced. What it owns is the bookkeeping that all
// three got subtly differently.
//
// ---
//
// ## The four rules it exists to encode
//
// **1. The axis list is declared once.** It derives the validator, the set of
// classes to strip before adding the new one, and the cycle order. Live Spirit
// Seeds keeps `SEASONS`/`UI_STYLES` in two files and they have to agree; this
// site hardcoded a boolean and could not grow a third face without a rewrite.
//
// **2. One value is the null case.** The first entry in `values` is the default
// and gets **no class at all** — it is the plain token block, and every other
// mode is an override on top of it. Both mature implementations arrived here
// independently: `body.style-watercolor` deliberately matches nothing in Live
// Spirit Seeds' stylesheet, and this site's light face is the bare `:root, .face`
// declaration. Writing a class for the default invites a second, competing
// source of truth for "normal".
//
// **3. Scope can be an element, not just `<body>`.** This is the rule that is
// least obvious and most load-bearing. Mode styling here hangs off a `.face`
// wrapper *as well as* the body, because the burn keeps two renderings alive at
// once and the detached clone has to resolve the **opposite** token set — custom
// properties resolve from the nearest declaring ancestor, so a clone carrying a
// bare `.face` renders light while sitting inside a `body.mystic-mode`. A
// primitive that could only write to `<body>` would foreclose that whole class of
// transition. See DESIGN.md §3 and ADR 0005.
//
// **4. Persistence is a choice, not a default.** `none` is a real answer and it
// is this site's. Persisting a mode means it can be restored before first paint,
// which means a flash to solve, and the two known-good answers cost something:
// gate paint behind `visibility: hidden` and bake the value at build time (Live
// Spirit Seeds), or make the value synchronously readable before React's first
// render (StoryShaped). Neither is free, so the adapter is explicit at the call
// site rather than a helpful default someone inherits by accident.
//
// ---
//
// ## Two things it does *not* do, on purpose
//
// **Assets.** Tokens cannot recolour a JPEG, and every one of the three sites hit
// this and answered differently — Live Spirit Seeds split a 26 MB SVG into layers
// driven by a `--tagline-hue` token, StoryShaped drops an opaque black background
// with `mix-blend-mode: screen` and swings the hue per mode, and this site uses
// artwork that reads in both faces and gives it a face-independent field colour.
// There is no common mechanism to extract, only a question every mode has to
// answer. Ask it; do not expect this hook to.
//
// **Reduced motion.** The transition between modes is the site's business — a
// 1.8s masked burn here, a 0.6s CSS transition on StoryShaped, an instant class
// swap on Live Spirit Seeds — and so is how it degrades. This hook changes the
// value; what happens visually in between is the caller's.

import { useCallback, useEffect, useState } from 'react'

/** Where a mode value survives between visits.
 *
 *  Each adapter is `{ read, write }` over a string or null. `none` is the honest
 *  default: a mode that is not persisted has no first-paint problem, because
 *  there is nothing to restore. */
const ADAPTERS = {
  none: {
    read: () => null,
    write: () => {},
  },
  localStorage: {
    // try/catch throughout: Safari private mode throws on access, and a themed
    // page is not worth a crash. Degrades to "does not persist", which is a
    // supported configuration rather than a broken one.
    read: (key) => {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    },
    write: (key, value) => {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        /* not persisted; the page still works */
      }
    },
  },
  sessionStorage: {
    read: (key) => {
      try {
        return window.sessionStorage.getItem(key)
      } catch {
        return null
      }
    },
    write: (key, value) => {
      try {
        window.sessionStorage.setItem(key, value)
      } catch {
        /* as above */
      }
    },
  },
  // Shareable, and the only adapter a visitor can hand to someone else. Writes
  // with replaceState so a mode toggle does not litter the back button with
  // history entries the user never navigated to.
  url: {
    read: (key) => new URLSearchParams(window.location.search).get(key),
    write: (key, value) => {
      const params = new URLSearchParams(window.location.search)
      params.set(key, value)
      const query = params.toString()
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
      )
    },
  },
}

/** The class a value takes, or null for the default.
 *
 *  `prefix` namespaces an axis so two axes on one element cannot collide —
 *  Live Spirit Seeds runs a bare season word alongside a `style-` prefixed
 *  structure, which works only because the two vocabularies happen not to
 *  overlap. Prefixing both would have made that a guarantee instead of a
 *  coincidence. */
function classFor(value, values, prefix) {
  if (value === values[0]) return null // the null case — rule 2
  return prefix ? `${prefix}${value}` : value
}

/** Every class this axis can write, so the writer can strip the axis clean
 *  without touching classes that belong to something else. */
function classesFor(values, prefix) {
  return values.slice(1).map((v) => (prefix ? `${prefix}${v}` : v))
}

/** Apply an axis to one element: remove every class the axis owns, then add the
 *  one that is current. Exported because it is useful outside React — a
 *  build-time bake in an entry point, or an editor preview driving the DOM
 *  directly, both want this without a hook attached. */
export function applyMode(element, value, { values, prefix = '' }) {
  if (!element || !values.includes(value)) return
  element.classList.remove(...classesFor(values, prefix))
  const next = classFor(value, values, prefix)
  if (next) element.classList.add(next)
}

/**
 * One axis of site-wide presentation.
 *
 * @param {object}   config
 * @param {string}   config.name        Axis name. Also the persistence key.
 * @param {string[]} config.values      Every valid value. **The first is the
 *                                      default and takes no class** (rule 2).
 * @param {string}   [config.prefix]    Class prefix, e.g. `'style-'`.
 * @param {'none'|'localStorage'|'sessionStorage'|'url'} [config.persistence]
 * @param {boolean}  [config.body]      Write the class to `<body>`. Default true.
 *
 * @returns {{value: string, setValue: fn, toggle: fn, className: string}}
 *          `className` is for a wrapper element the caller renders itself —
 *          rule 3. It is `''` for the default value, so it can be interpolated
 *          into a template literal without a conditional.
 */
export function useSiteMode({
  name,
  values,
  prefix = '',
  persistence = 'none',
  body = true,
}) {
  const adapter = ADAPTERS[persistence] ?? ADAPTERS.none

  // Read synchronously in the initialiser, not in an effect: an effect runs
  // after paint, so a persisted mode would render as the default for one frame
  // and then snap. That is the flash the `none` adapter exists to avoid having
  // to solve, and the reason it is the default.
  const [value, setRaw] = useState(() => {
    const stored = adapter.read(name)
    return stored && values.includes(stored) ? stored : values[0]
  })

  const setValue = useCallback(
    (next) => {
      setRaw((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        return values.includes(resolved) ? resolved : prev
      })
    },
    // `values` is a literal array at every call site, so a new identity each
    // render is expected; joining it keeps this callback stable rather than
    // rebuilding on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.join('|')]
  )

  const toggle = useCallback(() => {
    setValue((prev) => values[(values.indexOf(prev) + 1) % values.length])
  }, [setValue, values])

  useEffect(() => {
    if (!body) return
    applyMode(document.body, value, { values, prefix })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, body, prefix, values.join('|')])

  useEffect(() => {
    adapter.write(name, value)
  }, [adapter, name, value])

  return {
    value,
    setValue,
    toggle,
    className: classFor(value, values, prefix) ?? '',
  }
}
