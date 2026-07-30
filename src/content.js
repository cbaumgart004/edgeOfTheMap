// content.js
//
// Every value the *shell* (header, footer, burn) and both pages need to agree
// on. It moved out of App.jsx when the Keeper got its own route: App renders
// the header and footer, HomePage renders the cards, KeeperPage renders the
// pitch, and all three need PATHS and the contact address. A constant imported
// from one module cannot drift the way three copies can.

// The full banner plate — the neon wordmark, the dragon, and the bound-rune
// frieze on one 3.2:1 field. Referenced by path rather than imported because it
// lives in public/: it is also the social banner, which needs a stable URL that
// survives a rebuild (see DESIGN §2). That exception is what lets index.html
// preload it — it is the page's LCP element, and a hashed bundle name could
// not be named in static HTML.
export const BANNER = '/banner.webp'

export const SITE_URL = 'https://theedgeofthemap.com'

// The visible link label, derived rather than retyped — a domain change used to
// leave the anchor text pointing at the old host while its href and alt updated.
export const SITE_HOST = new URL(SITE_URL).host

// Single source for every CTA — change here, not in the markup.
// If the crafts ever want separate inboxes, add an `email` to PATHS and fall
// back to this one.
export const CONTACT_EMAIL = 'keeper@theedgeofthemap.com'

// Confirmed against the owner's ACX listing, which credits him as
// **Christopher S Baumgart**. The familiar form is kept here on purpose: this
// appears in the About copy, which is the maker talking about himself, and the
// full form belongs on a credit. `PROFILE.name` in narration.js is that form —
// the two are registers of one person, so change both or neither.
export const MAKER_NAME = 'Chris Baumgart'

// Drives both the unmount timer in App and the mask animation in CSS, which
// reads it as --burn-dur. Changing it here changes both.
export const BURN_MS = 1800

export const mailto = (subject) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`

// The one subject line that isn't path-specific, and so the only one that could
// drift: it was typed out at four call sites, and editing three of four splits
// inbound mail into two differently-named threads with nothing visible on the
// page to show it. Per-path subjects live in PATHS.subject.
export const GENERAL_ENQUIRY = mailto('Enquiry — Edge of the Map')

// One brand, three crafts. Kept as data so a fourth path is an edit here, not a
// layout rewrite.
//
// `blurb` is the light face: plain, professional, no atmosphere. `loreBlurb`
// is the mystic face, in the same voice as AboutLore. Two fields rather than
// one because the cards render in both faces, and letting the mystic copy
// through to daylight is exactly the leak §5 of DESIGN.md warns about.
//
// `href` is how a path reaches its own page. The Keeper and the Storyteller
// have one; the Wright is still an anchor into its card on the home page, and
// the nav reads this field rather than assuming. The Storyteller's arrival is
// the proof the field works as designed — it gained an `href` and the nav, the
// footer nav and the card's destination all followed, with no edit outside this
// table, the route list, and the switch in App.jsx.
export const PATHS = [
  {
    id: 'keeper',
    rune: 'othala',
    title: 'Web & Systems',
    persona: 'The Keeper',
    href: '/keeper',
    blurb:
      'Web applications you own outright — your data exportable on demand, a real API behind it, and full control of your own content.',
    loreBlurb:
      'A system is an idea that someone has to keep. It will outlive the immediate, the budget, and probably me, and one day a stranger will open it and have to understand it. I build for that stranger.',
    points: [
      'Your data, yours to export',
      'Robust, documented API access',
      'Template starts, then edit inline',
    ],
    cta: 'See what I build',
    subject: 'Project enquiry — Web & Systems',
  },
  {
    id: 'storyteller',
    rune: 'ansuz',
    title: 'Audio Narration',
    persona: 'The Storyteller',
    href: '/storyteller',
    blurb:
      'Audiobook narration made in collaboration with the author — characters voiced as faithfully to your original intent as I can get them.',
    loreBlurb:
      'A story is only ink until someone says it aloud. And then it is a voice in a stranger’s ear, in the car, in the dark, over the dishes, for hours. I say it aloud.',
    points: [
      'Author-led character work',
      'Audiobook and commercial VO',
      'Studio-quality delivery',
    ],
    cta: 'Request a demo',
    subject: 'Booking enquiry — Audio Narration',
  },
  {
    id: 'wright',
    rune: 'berkano',
    title: 'Woodworking',
    persona: 'The Wright',
    blurb:
      'Commissioned fine woodwork decor and accessories, cut and joined by hand for the room it will live in.',
    loreBlurb:
      'This was a tree once, and it was reaching for something the whole time it stood. It is still reaching. I shape it by hand into the thing it was already becoming, and it will hold long after the room it was made for is gone.',
    points: ['Bespoke Decor', 'Hardwood joinery', 'Finish and restoration'],
    cta: 'Discuss a commission',
    subject: 'Commission enquiry — Woodworking',
  },
]

// Where the nav sends a path: its own page if it has one, otherwise its card on
// the home page. **Root-relative, not a bare `#id`** — the nav renders on every
// route, and `#storyteller` from `/keeper` looks for an anchor that is not on
// that page. `/#storyteller` is a same-document scroll from home and a route
// change from anywhere else, and `Link` already tells those apart.
export const navHref = (path) => path.href ?? `/#${path.id}`

// Where a *card* sends you, which is not the same thing: a path with a page of
// its own sends you to the page, and a path without one has nothing more to
// read, so it opens an enquiry already filed by discipline.
export const cardHref = (path) => path.href ?? mailto(path.subject)
