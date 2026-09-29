# Edge of the Map console

The owner-facing editor for every customer site. It is Edge of the Map's product: built here, served
from `admin.theedgeofthemap.com`, and mounted on each customer's own live page, so an owner edits the
real site and sees each change on it as they type. Decisions: StoryShaped's
[ADR-0006](https://github.com/cbaumgart004/storyShapedStudios/blob/main/docs/adr/0006-shared-admin-console.md)
(schema, brand, draft and published) and
[ADR-0007](https://github.com/cbaumgart004/storyShapedStudios/blob/main/docs/adr/0007-central-console-at-edge-of-the-map.md)
(hosting, pinned versions, logins); the platform plan is `../docs/editing-without-tina.md`.

## What an owner gets

- **One schema per site** (`schema/sites/*.json`, format in [`schema/SCHEMA.md`](schema/SCHEMA.md)).
  The console builds its screens from it; the API validates every write against the same rules.
- **Their own brand.** The console takes the site's colours, fonts, logo and radius from the schema,
  and follows the site's light or dark mode (StoryShaped: daylight and blacklight).
- **Add, duplicate, reorder and delete** documents, page sections and list rows. Section types come
  from the site's own classes (`blocks` in the schema), so a new section looks like the others.
- **Rich text** with headings, lists, links, inline photos and the site's brand text styles
  (`textStyles`), stored as sanitized HTML the site renders with its own CSS.
- **Photos** resized in the browser before upload. StoryShaped photos carry a `Light` or `Dark` index.
- **Live preview on the page.** Every keystroke is pushed to the page through `window.EOTM`; the page
  re-renders from the draft before anything is saved. Autosave follows 800 ms after the last change.
  Draft and live are separate: nothing reaches visitors until Publish.
- **Phones first.** A bottom sheet with three heights (a one-line banner, half screen, nearly full);
  drag the grip or tap the title to change it. **Preview** hides the sheet but its header so the page under it shows and takes taps; it reads **Edit** while on. On the home screen, ← returns to the admin dashboard (0.1.5+).
  On a screen 1024 px or wider the same panel docks right.
- **Two tabs, one document:** a save based on an old version is refused, and the owner chooses
  "Use their version" or "Keep mine" instead of silently overwriting.

Use cases the two schemas cover today:

| Site | Task | Where |
|---|---|---|
| SpiritSeeds | New event | Events, New event: date and time, location, rich description, photo, price, booking link |
| SpiritSeeds | Banner | Banners: rich message, button, look, show-from and hide-after times |
| StoryShaped | New inventory item for the site, Etsy and eBay | Inventory: SKU, price, stock, components (from Components), Light/Dark photos, Etsy and eBay groups |
| StoryShaped | Library entry | Library: title, rich entry, position |

## Layout

```
schema/        schema.js (the rules), SCHEMA.md (the format), sites/<site>.json
core/          service.js (create, save, publish, conflicts), repo-memory.js
api/           handler.js (routes, access), lambda.js (AWS wiring), repo-pg.js, migrate.js, migrations/
src/           loader.js, bridge.js, console.jsx (bundle entry), App.jsx, Fields.jsx, RichText.jsx, ...
demo/          a stand-in customer page for local testing
releases/      every published console version, committed and never rewritten
scripts/       build, release, site (what the host serves), dev
test/          vitest: schema, service, API, and the console mounted in a DOM
```

## Running it

```sh
npm install
npm test               # schema, service, API and a mounted console
npm run dev            # http://localhost:5180/?edit  (add &site=spiritseeds)
```

The demo runs the real loader and bundle in local mode: documents live in localStorage and there is
no login.

## Putting a site on it

1. **Schema.** Add `schema/sites/<site>.json`; `npm test` checks it.
2. **Its project.** Create the customer's Neon project, then `DATABASE_URL=… npm run migrate -- site`
   (the variable is read from the environment; do not pass it as an argument). Put its connection
   string in SSM as a SecureString, for example `/eotm/sites/<site>/database`.
3. **Register it** in the control project (`api/migrations/control`): a `sites` row with the slug,
   schema, pinned `console_version` and `console_integrity` from `releases/index.json`, allowed
   origins, the SSM parameter *name*, and the photo bucket. Add the owner's Neon Auth user id to
   `site_members`.
4. **On the site:**
   - include the loader: `<script src="https://admin.theedgeofthemap.com/loader.js" data-site="<site>" async></script>`
   - add the Amplify rewrite `/_edit/auth/<*>` → the Neon Auth URL (status 200), before the SPA
     catch-all, so the login cookie is first-party (ADR-0007)
   - read published documents from `GET https://admin.theedgeofthemap.com/api/sites/<site>/public/<type>`
     and render them through `window.EOTM.merge(type, docs)`; re-render on `window.EOTM.subscribe`
   - when the site has a client router, handle `eotm:navigate` (`event.detail.path`) and call
     `preventDefault()`, or the console falls back to `pushState` plus `popstate`
   - if the site sends a Content-Security-Policy, allow `admin.theedgeofthemap.com` in `script-src`
     and `connect-src`

`demo/site.js` does all of the rendering half in about 100 lines.

## Hosting

- **Console files:** an Amplify app on this repo's `console` branch, app root `console`, custom
  domain `admin.theedgeofthemap.com`. Build: `npm ci && npm run build:site`; output directory
  `site`. It serves `/loader.js` and every version under `/console/<version>/console.js`.
- **Header format:** both Amplify apps are monorepos, so their custom headers must be wrapped as
  `applications: [{appRoot: <root>, customHeaders: [...]}]`. The plain `customHeaders:` form saves in the
  console but fails every later build ("Monorepo spec provided without applications key"), leaving the
  last good build live; that hid builds 3 to 13 of this app.
- **Sign-in on a site:** the site's Amplify rewrite `/_edit/auth/<*>` goes to the Lambda's `/auth/<*>`
  (`api/auth-proxy.js`), not to Neon Auth: Amplify adds `X-Forwarded-Host` and Neon Auth rejects any
  request carrying one. Both apps keep cookies in the cache key, and `_edit/**/*` is `private, no-store`.
- **Management page:** operators (control table `operators`, migration `002`) see "Manage all sites"
  on the admin page: each site's repo, editor version (pinning replaces the SQL `UPDATE sites`), photo
  bucket and members, every login, and "Add a user", which creates a Neon Auth login with a temporary
  password through `sign-up/email` (`api/manage.js`, `createLogin` in `api/lambda.js`). The user
  changes it under "Change password" (`change-password`, other sessions revoked). Public "Create
  login" is gone: logins are added by an operator. Password-reset email still does not arrive (Neon
  Auth's shared sender, observed 2026-09-28); a custom email provider in Neon Auth is the fix.
- **Single sign-on (console 0.1.2+):** a site link on the admin page trades the admin session's Neon
  JWT for an editor token (`POST /api/handoff`, HS256, 8 hours, bound to one site) and opens the site
  with `#eotm-token=`; the loader keeps it in `sessionStorage` and strips it from the URL. The editor's
  sign-in button returns to `admin.theedgeofthemap.com/?handoff=<site>&return=<path>`. The signing key
  is derived from the control connection string in `api/lambda.js`, so rotating that password signs
  every editor out. An editor token cannot mint another. The site-domain sign-in above still works.
- **Headers** are set on the Amplify app (Hosting, Custom headers), because Amplify reads
  `customHttp.yml` only from the repository root, not from the `console` app root:
  `Access-Control-Allow-Origin: *` on `loader.js` and `console/**/*` only (the loader's integrity check
  needs CORS). Never on `**/*`: that overrode the API's per-site CORS, which the rewrite passes through,
  `Cache-Control: public, max-age=31536000, immutable` on `console/**/*`, and
  `Cache-Control: public, max-age=300` on `loader.js`. A header change needs a redeploy.
- **Control project:** Neon `edge-of-the-map-console` (`red-waterfall-41496692`, AWS us-east-1) with
  Neon Auth on. `NEON_AUTH_URL` is its Auth URL,
  `https://ep-calm-heart-b7brfs6g.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth`; the JWKS is that
  URL plus `/.well-known/jwks.json` (read from the Neon console). A site's proxy rewrite maps
  `/_edit/auth/<*>` to `<Auth URL>/<*>`. Neon Auth lets anyone sign up; a login edits nothing until
  `site_members` names it.
- **Deployed:** Amplify app `dr2qcyxmox1km`, branch `console`, at `https://admin.theedgeofthemap.com`
  (Porkbun CNAME `admin` to Amplify's CloudFront host, plus the ACM validation CNAME).
- **API deployed:** Lambda `eotm-console-api` (Node.js 24, handler `api/lambda.handler`, 512 MB, 20 s),
  role `eotm-console-api-role-3asduby6` with inline policy `eotm-console-ssm` (read `/eotm/*`, decrypt
  through SSM only). Function URL with auth NONE; the Amplify rewrite `/api/<*>` (200) forwards to it.
  Upload `dist/api.zip` from `npm run package:api` through the Lambda console to update it.
- **Registering a site** is also a Test-tab invoke: `{"eotmRegister": {"site": "<slug>", "allowedOrigins": ["https://…"], "connectionParam": "/eotm/sites/<slug>/database", "owners": ["<Neon Auth user id>"]}}`. The schema and pinned version come from the package. StoryShaped is registered with the preview origin; no photo bucket yet, so uploads answer 503.
- **Migrations** run inside AWS: a Test-tab invoke of the Lambda with
  `{"eotmMigrate": true, "siteParams": ["/eotm/sites/<site>/database"]}`. Applied: control `001_sites.sql`,
  StoryShaped `001_documents.sql`.
- **Releasing:** bump `version` in `package.json`, `npm run release`, commit `releases/`. Moving a
  customer to it is an update of their `sites` row; no customer site rebuilds.
  A release that adds a field kind needs the API redeployed **before** a schema using it is reloaded
  (Manage, save with the schema reloaded): the Lambda checks every site schema against its own
  `schema/schema.js` and answers 500 for a kind it does not know.
- **API:** one Lambda from `api/lambda.js` with a function URL, reached as
  `admin.theedgeofthemap.com/api/<*>` through an Amplify rewrite (status 200). Its settings, by name:
  `CONTROL_DATABASE_PARAM` (SSM name of the control project's connection string), `NEON_AUTH_URL`,
  `MEDIA_REGION`. Its role needs `ssm:GetParameter` on `/eotm/*`, `kms:Decrypt` for those
  parameters, and `s3:PutObject` on the customers' photo buckets.
- **Photos:** each customer keeps its own bucket, served through CloudFront. The bucket needs a CORS
  rule allowing `PUT` from the customer's origins, because the browser uploads straight to it.

## Not verified yet

- **Neon Auth through the proxy.** The sign-in paths and where the JWT appears (`src/auth.js`) are
  Better Auth's defaults and ADR-0007's reading of Neon's docs. The ADR-0007 spike must prove them
  before the first real login.
- **Postgres.** `api/repo-pg.js` and the migrations are tested against a fake that speaks their SQL,
  not against Neon. Run the migrations and the API tests against a Neon branch before the first site.
- **Marketplace fields.** The Etsy and eBay groups in `storyshaped.json` were written from memory of
  their APIs. Check them against Etsy API v3 and eBay's Inventory API before the first sync.
- **The console on real phones.** Only a DOM test has mounted it; nobody has used it on iOS Safari or
  Android Chrome yet.

## Not built yet

- **Syncing to Etsy and eBay** from a published inventory item, and the stock decrement reading the
  item's components. StoryShaped's inventory lives in its own tables (`backend/server/routes/inventory.js`);
  moving it to documents, or mapping the `stockItem` type onto those tables, is the next decision.
- **Migration of existing content**: SpiritSeeds' `content/*.json` and StoryShaped's `library.md`
  into documents (platform plan phase 0).
- **Inline editing** on the page itself (platform plan layer 1). Editing is in the sheet; the page
  shows the result live.
- **A preview link** to show an unpublished draft on another device without signing in.
