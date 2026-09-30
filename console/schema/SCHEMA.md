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
| `money` | `{ "amount": integer minor units, "currency": "USD" }` | `currency` default |
| `boolean` | boolean | |
| `date` | `YYYY-MM-DD` | |
| `datetime` | ISO 8601 string with offset | |
| `select` | string | `options: [{ value, label }]` |
| `image` | `{ src, alt, width, height, rotate?, flip?, opacity? }` | The owner can turn it (`rotate` 0, 90, 180, 270), mirror it (`flip`) and fade it (`opacity` 10 to 100); the site applies them as CSS. "Site photos" reuses one already on the site, or takes a pasted address. Uploads are scaled to 1600 px, 600 KB; `"wide": true` (a banner or full-bleed background) allows 2560 px, 1.2 MB. After an upload, "Sharper (larger file)" sends the same photo again at up to 3200 px, 2.5 MB (`src/images.js`, `LIMITS`) |
| `photos` | `[{ src, alt, width, height, index }]` | `indexes: ["Light", "Dark"]` labels each photo. StoryShaped's daylight/blacklight pairs. `warnMissingIndex: true`: Publish asks the owner to confirm when there are photos but none under one index (`missingIndexHelp` adds a sentence). `maxItems`. Takes `wide` as `image` does |
| `relation` | document id, or an array of ids when `many` | `to: "<type>"` |
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
| `data-eotm-size="<field>"`, `data-eotm-min`, `data-eotm-max` | an element whose width is that number field, in % of its parent | a drag handle; snaps to twelfths or moves freely (the owner's toggle) |
| `data-eotm-edge="left"`, `data-eotm-centered` | a sizable element | the handle on the left edge; a centred element's edge moves half as far |
| `data-eotm-richtext="<field>"` | a rich text container | a handle on each image in it, stored as `width="n%"` |
| `data-eotm-layout`, `data-eotm-block`, `data-eotm-span` | a page arranged by a `layout` field | Arrange's move and resize boxes |

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
