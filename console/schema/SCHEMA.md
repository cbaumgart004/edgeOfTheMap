# Site schema format

One format for every customer site. The console builds its screens from it, the API validates writes
against it, and each site renders the documents it describes. The rules live in `schema.js`; this file
says what each key means.

```jsonc
{
  "site": "storyshaped",                 // matches sites.slug in the control database
  "version": 1,                          // bump when a field changes meaning; see "Changing a schema"
  "brand": {
    "logo": "/assets/logo.png",          // shown in the console header
    "modes": {                           // the console follows the site's light/dark choice
      "light": { "bg": "#f6f8f0", "surface": "#fff", "ink": "#17240f", "muted": "#4f6440",
                 "line": "#d6e0c8", "accent": "#2fae37", "accentInk": "#0d3b10" },
      "dark":  { "...": "same keys" }
    },
    "fonts": { "body": "Inter, sans-serif", "heading": "'Poiret One', sans-serif" },
    "radius": "10px"
  },
  "styleColors": [                       // the colours a style field offers by name; css is the site's own
    { "value": "accent", "label": "Accent", "css": "var(--accent)" }   // a theme variable follows the mode
  ],
  "textStyles": [                        // brand marks offered in rich text; the site owns the CSS
    { "name": "glow", "label": "Glow", "className": "uv-glow" }
  ],
  "types": {                             // one entry per kind of document the owner can create
    "libraryArticle": {
      "label": "Library entry", "plural": "Library",
      "titleField": "title",             // shown in lists
      "slugFrom": "title",               // slug generated from this field on create
      "singleton": false,                // true: exactly one document (site settings, a banner)
      "menuUnder": "pageLayout",         // optional: listed inside that type's menu, not on its own
      "fields": [ { "name": "title", "kind": "text", "required": true } ]
    }
  },
  "blocks": {                            // page sections, used by fields of kind "blocks"
    "prose": { "label": "Text section", "className": "prose-block",
               "preview": "/assets/sections/prose.png",   // optional thumbnail on its "add" button;
                                                          // without one the editor sketches it from its fields
               "fields": [ { "name": "heading", "kind": "text" } ] }
  }
}
```

## Field kinds

| Kind | Stored as | Options |
|---|---|---|
| `text` | string | `maxLength`; `pattern` (a regular expression the whole value must match, Unicode classes allowed) with `patternHelp` (the message when it does not); `suggest: { block, field }` offers that field of every such section in the same document, and publishing refuses a value matching none (a button tied to a Service by its heading) |
| `textarea` | string | `maxLength` |
| `richtext` | sanitized HTML string | Links, inline images, headings, lists, and the site's `textStyles` as `<span class>` |
| `url` | string | Must be `https:`, `http:`, `mailto:`, `tel:`, a site path starting `/`, or an `#anchor` on the page |
| `number` | number | `min`, `max`, `step`, `integer` |
| `placement` | string: `""` last, `"^"` first, else the key of the entry it follows | Options come from the site (`EOTM.setOrder(type, [{ key, title, docId }])`), else the type's other documents by slug |
| `layout` | `[{ "key", "span" }]` in page order; `span` is columns of 12 | Keys come from the page: a `data-eotm-layout` container whose direct children carry `data-eotm-block="<key>"`, `data-eotm-label` and the `data-eotm-span` they render at. The console draws move and resize handles over them |
| `color` | `#rrggbb`, or `""` for the site's own | A picker plus a text box; Clear returns it to blank |
| `number` with `slider: true` | number or blank | Shown as a range from `min` to `max` (`step`), the value beside it with `unit`, and Reset to blank. `sliderDefault` places the handle while blank |
| `money` | `{ "amount": integer minor units, "currency": "USD" }` | `currency` default |
| `boolean` | boolean | |
| `date` | `YYYY-MM-DD` | |
| `datetime` | ISO 8601 string with offset | |
| `select` | string | `options: [{ value, label }]`, or `optionsFrom: "buttonStyles"` for a list at the top of the schema. `blankLabel` names the blank choice (default None). `preview: "font"` shows the choice set in that font (`previewDefault`: the role blank stands for, `previewText`); a select with `optionsFrom: "buttonStyles"` shows the button drawn with the site's class |
| `image` | `{ src, alt, width, height, rotate?, flip?, opacity? }` | The owner can turn it (`rotate` 0, 90, 180, 270), mirror it (`flip`) and fade it (`opacity` 10 to 100); the site applies them as CSS. "Site photos" reuses one already on the site, or takes a pasted address. Uploads are scaled to 1600 px, 600 KB; `"wide": true` (a banner or full-bleed background) allows 2560 px, 1.2 MB. After an upload, "Sharper (larger file)" sends the same photo again at up to 3200 px, 2.5 MB (`src/images.js`, `LIMITS`) |
| `photos` | `[{ src, alt, width, height, index }]` | `indexes: ["Light", "Dark"]` labels each photo. StoryShaped's daylight/blacklight pairs. `warnMissingIndex: true`: Publish asks the owner to confirm when there are photos but none under one index (`missingIndexHelp` adds a sentence). `maxItems`. Takes `wide` as `image` does |
| `relation` | document id, or an array of ids when `many` | `to: "<type>"` |
| `style` | `{ size?, font?, weight?, align?, color?, background?, width? }`, each part optional | How one element looks. `size` small, large, xlarge; `font` heading, body; `weight` normal, bold; `align` left, center, right; `color` and `background` a value from the schema's `styleColors` or `#rrggbb`; `width` 10 to 100 (%). The site turns it into CSS on the element holding it |
| `group` | object | `fields` |
| `list` | array of objects, each with an `_id` | `fields`, `itemLabel` (field shown per row), `maxItems` |
| `blocks` | array of `{ _id, _type, ...fields }` | `of: ["<block>", ...]` |

Every field also takes `label`, `help`, `required` and `default`.

## The owner's own types

An owner can design sections and collections in the editor ("Your own types"), saved in
`sites.custom_schema` and merged over this file on every load (`schema/custom.js`). Custom names
start with `custom`, use only kinds that need no code (`CUSTOM_KINDS`), and join every page's
section palette. A site renders a custom section generically from its fields until it is designed;
`window.EOTM.schema` has the merged schema while editing, the public `boot` has it otherwise.

The owner can add a field to anything the site ships with: "+ Add a field" under any type, section or
list row in the editor. Kept in the same record as `fields`, keyed by where it goes:
`{ "types.siteSettings.socials": [{ "name": "customPhoto", "kind": "image", "label": "Photo" }] }`. The key
is `types.<type>` or `blocks.<section>`, then field names down to a list or group. Every document, section
or row of that kind gains it; names start with `custom`; the kinds are `CUSTOM_KINDS`, `style` included.
Removing one keeps what was typed into it. The merged schema marks each with `added: true`, and a site
draws them after the element's own content until its developer places them (StoryShaped:
`components/Extras.jsx`, `Extras` and `useLook`). Saved section templates carry their added fields' content.

The owner can also rename the site's own types, sections and fields ("Types and names"), kept in
the same record as `labels`: `{ types: { page: { label, plural } }, blocks: { service: { label } },
fields: { "blocks.service.title": "Treatment name" } }`. Only the editor's words change; stored names,
content and the site's code do not, so a rename never needs a migration.

## Marks a page gives the editor

| Attribute | On | Gives |
|---|---|---|
| `data-eotm-edit="<type>:<id or slug>"` | any element showing a document | an Edit button that opens it (click-to-edit) |
| `data-eotm-item="<_id>"` | a section or row inside it | opens with that section expanded |
| `data-eotm-label` | either | names the Edit button |
| `data-eotm-field="<field>"` | inside (or on) a marked element | the field a click there opens in the pane (1.2.3+) |
| `data-eotm-size="<field>"`, `data-eotm-min`, `data-eotm-max` | an element whose width is that number field, in % of its parent | a drag handle; snaps to twelfths or moves freely (the owner's toggle) |
| `data-eotm-edge="left"`, `data-eotm-centered` | a sizable element | the handle on the left edge; a centred element's edge moves half as far |
| `data-eotm-richtext="<field>"` | a rich text container | a handle on each image in it, stored as `width="n%"`; click to type in it on the page (double-click before 1.2.3) |
| `data-eotm-text="<field>"` | an element showing a text field | click to type in it on the page and open it in the pane; each keystroke reaches the pane (double-click before 1.2.3) |
| `data-eotm-in="<_id>"` | beside either of the two above | the row the field belongs to, when not the marked element's item (a value inside a Values grid) |
| `data-eotm-layout`, `data-eotm-block`, `data-eotm-span` | a page arranged by a `layout` field | Arrange's move and resize boxes |
| `data-eotm-part="<name>"` | each part of a section (a field's name; a text and its link as one) | what Arrange moves in a Free section (1.5.0+). Named by field, so a duplicated section or a template keeps its arrangement |
| `data-eotm-frame="free"` | a Free section's outermost element | the canvas its placed parts sit on; `--frame-h` its height |
| `data-eotm-wrap` | a wrapper between a section and its parts | no box of its own while the section is Free |
| `data-eotm-group` | several elements moved as one part | no box of its own while the section flows |

## Buttons and samples (1.6.0+)

- **`buttonStyles`** (top level): the site's button classes, `[{ "value", "label", "className" }]`. A button
  list takes `{ "name": "look", "kind": "select", "optionsFrom": "buttonStyles" }` and, optionally, an `icon`
  image; the site draws the button with that class, its icon before its text, and marks it
  `data-eotm-in="<_id>"` so Edit mode opens that button (its text, link, icon and style) instead of following it.
- **`previewScope`** (top level): `{ "className" }`, the class the site's variables live under (StoryShaped's
  `sss-home`), so samples in the editor (a button style, a font, a Style field) are drawn with the site's own CSS.

## Classes and elements (1.7.0+)

- **`classes`** (top level): the site's named looks, `[{ "name", "label", "selector" }]` ("Buttons", `.btn`).
  The console adds a design document, `classes` (`schema/classes.js`, `withClasses`, applied in `mergeCustom`), with
  one Style field per class; the site turns each into a CSS rule on its selector, led by `html body` so it wins
  (StoryShaped `components/ClassStyles.jsx`, Spirit Seeds `components/cms/ClassStyles.jsx`). The owner adds
  classes of their own (`custom.classes: [{ name, label }]`, selector `.c-<name>`) from the Classes document.
- **`_elements`** on any section, row or document, declared by no field (`schema/elements.js`): the owner's own
  text, formatted text, photo, button or box, each `{ _id, kind, ... , class?, style? }`, checked by kind and
  sanitized on save like rich text. Each is a part named by its `_id`, so a Free section places it. Added and
  duplicated from Arrange (a site's own part duplicates as an element with its content) or the panel's Elements
  list; saved as templates in `custom.elementTemplates: [{ name, element }]`. A site draws them with its
  Elements component, marking each `data-eotm-element="<kind>"` and `data-eotm-in="<_id>"`.

## Free sections (StoryShaped ADR-0010)

Any section, row or document may carry `_layout`, declared by no field and checked by `checkFrame`
(`schema/schema.js`): `{ "mode": "flow" | "free", "height", "parts": { "<part>": { "x", "y", "w", "h"?,
"z"?, "opacity"? } } }`. `x` and `w` are % of the element's width, `y`, `h` and `height` % of its width
too, so the arrangement scales with the page; a part with no `h` grows to fit; `fs` is its text size, %
of the site's own. Below 820px a Free section stacks, ordered by `y` then `x`, or with `"phone": "scale"`
keeps its desktop arrangement, drawn at desktop width and scaled down whole, or with `"phone": "free"` takes
its own phone arrangement, `phoneParts` and `phoneHeight` (same shape), made in Arrange on a phone. A phone
arrangement works whether or not `mode` is free. The site marks phone-placed parts `data-eotm-qplaced` and
sets `--q*` variables. A document with several arranged regions keeps each as `_layout_<key>` (the region marked
`data-eotm-frame-key="<key>"`), so a site's header and its button bar, both Site settings, arrange apart. The site draws it from the marks above (StoryShaped:
`components/Frame.jsx`, `styles/Frame.css`).

## Documents

Each document is one row in the site's own Neon project (`api/migrations/site`):

```jsonc
{ "id": "uuid", "type": "libraryArticle", "slug": "what-is-uranium-glass",
  "status": "draft" | "published", "version": 3, "data": { ... }, "updatedAt": "..." }
```

`version` goes up by one on every write, and a write must send the version it started from. A stale
version is rejected with the current document, so two tabs cannot silently overwrite each other
(platform plan §3.4). Publishing copies the draft; a published row is what visitors see.

## Changing a schema

Adding an optional field is safe: old documents simply lack it. Renaming a field, changing its kind or
making it required changes existing documents, so it ships with a data migration in
`api/migrations/site` and a `version` bump. `IF NOT EXISTS` is not a migration (platform plan §7).

## Tools

`"tools": [{ "label": "Inventory", "path": "/admin/inventory", "help": "…" }]` at the top of a site's
schema lists the site's own admin pages in the editor's menu. They are not documents: choosing one
shows that page of the site under the editor (the bridge's `navigate`). The page guards itself; the
console only offers the way there.


## Status page and menu groups (1.3.0+)

- **`connections`** (top level): what the site is wired to, on the owner's status page (admin page, Pages and
  connections). Each `{ "label", "field"?, "type"?, "switch"?, "show"?, "detail"?, "help"? }`: connected when the
  published `type` document (default `settings`) has `field` set (a list: not empty) and, with `switch`, that
  boolean on; `show` prints the value, `detail` a fixed line. No `field`: always connected.
- **`group`** on a type: `"content"` or `"design"`, where the editor's home menu lists it. Unset, a type named for
  a theme, layout, setting or menu is Design.

## Views and Images (1.4.0+)

- **`views`** on a singleton type: the one document shown as several cards on the editor's home, each
  opening it with only `fields` showing, and the fields more than one view lists folded beneath as
  shared. `{ "label", "fields": [names], "mode"?, "help"? }`; `help` is the card's second line. With
  `mode`, the page is asked to show that look while the view is open: the bridge's
  `showMode(mode)` sends `{ type: '$mode', mode }`, and `null` on leaving (bridge 5). StoryShaped's
  Theme is a Daylight and a Blacklight theme this way; the stored document is unchanged.
- **`images`** (top level): `{ "type", "label"?, "summary"?, "help"? }` adds an Images view (`src/Images.jsx`)
  listing every pair of every `photos` field with two `indexes`, in every type that holds one, grouped by
  document. An empty side takes an upload, compressed as any upload is; removing one side keeps the later
  pairs together (`src/pairs.js`). `type` is the site's own pairs, created from the view and left off the
  home menu; it needs a two-index `photos` field.
