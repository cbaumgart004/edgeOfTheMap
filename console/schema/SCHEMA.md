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
      "fields": [ { "name": "title", "kind": "text", "required": true } ]
    }
  },
  "blocks": {                            // page sections, used by fields of kind "blocks"
    "prose": { "label": "Text section", "className": "prose-block",
               "fields": [ { "name": "heading", "kind": "text" } ] }
  }
}
```

## Field kinds

| Kind | Stored as | Options |
|---|---|---|
| `text` | string | `maxLength` |
| `textarea` | string | `maxLength` |
| `richtext` | sanitized HTML string | Links, inline images, headings, lists, and the site's `textStyles` as `<span class>` |
| `url` | string | Must be `https:`, `http:`, `mailto:`, `tel:` or a site path starting `/` |
| `number` | number | `min`, `max`, `step`, `integer` |
| `money` | `{ "amount": integer minor units, "currency": "USD" }` | `currency` default |
| `boolean` | boolean | |
| `date` | `YYYY-MM-DD` | |
| `datetime` | ISO 8601 string with offset | |
| `select` | string | `options: [{ value, label }]` |
| `image` | `{ src, alt, width, height }` | |
| `photos` | `[{ src, alt, width, height, index }]` | `indexes: ["Light", "Dark"]` labels each photo. StoryShaped's daylight/blacklight pairs |
| `relation` | document id, or an array of ids when `many` | `to: "<type>"` |
| `group` | object | `fields` |
| `list` | array of objects, each with an `_id` | `fields`, `itemLabel` (field shown per row) |
| `blocks` | array of `{ _id, _type, ...fields }` | `of: ["<block>", ...]` |

Every field also takes `label`, `help`, `required` and `default`.

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
