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
- **Photos** compressed in the browser before upload: longest edge 2400 px, WebP, stepping down in
  quality and size until the file is under 900 KB. Each photo can be turned, mirrored and faded,
  reused from the site's other photos, or given by address. StoryShaped photos carry a `Light` or `Dark` index.
- **Live preview on the page.** Every keystroke is pushed to the page through `window.EOTM`; the page
  re-renders from the draft before anything is saved. Autosave follows 800 ms after the last change.
  Draft and live are separate: nothing reaches visitors until Publish.
- **Phones first.** A bottom sheet with three heights (a one-line banner, half screen, nearly full);
  drag the grip or tap the title to change it. **Preview** hides the sheet but its header so the page under it shows and takes taps; it reads **Edit** while on. On the home screen, ← returns to the admin dashboard (0.1.5+).
  On a screen 1024 px or wider the same panel docks right.
- **Click-to-edit and drag-to-size on the page (0.1.8+).** Pointing at a section shows an Edit
  button that opens it; its edge, a side image's edge and images in rich text drag to a new width,
  snapping to a 12-column grid or moving freely. The page marks what is editable (SCHEMA.md,
  "Marks a page gives the editor").
- **Previews when adding a section (1.1+).** Each "add" button shows a sketch of the section drawn
  from its fields (or the site's own thumbnail, `preview` in the schema); once added, the page
  scrolls to the new section and outlines it.
- **Their own names (1.1+).** An owner renames any type, section or field ("Types and names"); the
  site and stored content keep their names.
- **Their own types (0.1.8+).** An owner designs sections and collections with their own fields
  ("Your own types"); a custom section is placed on pages like a built-in one (SCHEMA.md). More
  than six types on a phone become a dropdown, on the home view and in a section palette.
- **To the Developer (1.1.4+).** A folding panel at the foot of the editor shows whether the site has
  changes not yet live ("3 changes not yet pushed to production", or "Everything is live") and offers
  **Push to Production**, **Push and Request Changes** and **Request Changes**. A push checks every
  pending document of the schema's `release.types` (StoryShaped: page, pageLayout, theme; all types
  when unset) against Publish's rules and warnings, and publishes all of them or none
  (`core/service.js`, `publishAll`; `GET`/`POST /api/sites/<site>/release`). It replaces the
  "Request a change" card. The publishes run one at a time, not in one transaction: a document
  edited elsewhere between check and publish is reported and stays a draft. "Production" here is
  the published content every address of the site reads; releasing the site's code is not part of it.
- **Click-to-edit starts a missing singleton.** Edit on a part of the page whose one-of-a-kind
  document (a home page, a theme) does not exist yet creates it from the schema's defaults.
- **Two tabs, one document:** a save based on an old version is refused, and the owner chooses
  "Use their version" or "Keep mine" instead of silently overwriting.

Use cases the two schemas cover today:

| Site | Task | Where |
|---|---|---|
| SpiritSeeds | New event | Events, New event: date and time, location, rich description, photo, price, booking link |
| SpiritSeeds | Banner | Banners: rich message, button, look, show-from and hide-after times |
| StoryShaped | Library entry | Library: title, rich entry, position |
| StoryShaped | Home copy | Home page: hero tagline, buttons, photo and credit; What We Believe; Our Story; Our Jewelry; A Space for Makers |
| StoryShaped | Glossary | Reference Page Layouts: the one at /glossary, its sections, terms, details and sources |

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
   origins and the SSM parameter *name*. Photos need nothing per site (the shared bucket, below). Add the owner's Neon Auth user id to
   `site_members`.
4. **On the site:**
   - include the loader: `<script src="https://admin.theedgeofthemap.com/loader.js" data-site="<site>" async></script>`
   - optional, on Amplify only: the rewrite `/_edit/auth/<*>` → the Neon Auth URL (status 200), before the SPA
     catch-all, so the login cookie is first-party (ADR-0007)
   - read published documents from `GET https://admin.theedgeofthemap.com/api/sites/<site>/public/<type>`
     and render them through `window.EOTM.merge(type, docs)`; re-render on `window.EOTM.subscribe`
   - when the site has a client router, handle `eotm:navigate` (`event.detail.path`) and call
     `preventDefault()`, or the console falls back to `pushState` plus `popstate`
   - a site on another host (Edge of the Map itself is on Railway) skips the rewrite: the editor's
    sign-in goes through the admin page and hands back an editor token (single sign-on, below)
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
  on the admin page: each site's repo, editor version (pinning replaces the SQL `UPDATE sites`), company
  details (`PROFILE_FIELDS` in `api/manage.js`), an optional photo bucket of its own, and members
  (name, email, a role changed in the row), every login, and "Add a user", which creates a Neon Auth login with a temporary
  password through `sign-up/email` (`api/manage.js`, `createLogin` in `api/lambda.js`). The user
  must replace it at first sign-in: the admin page shows only "Choose your own password" (typed twice)
  and `/api/handoff` opens no editor while a `password_change_required` row exists (control migration
  008); `/api/me/password-changed` removes it after `change-password` succeeds. The row is cleared by
  the page, not by Neon Auth, so a user calling that endpoint directly skips only their own change.
  Later changes go through "Change password" (`change-password`, other sessions revoked). Public "Create
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
- **A site without its own Neon project** (Edge of the Map itself, and any site where a separate
  project is not worth it): `{"eotmCreateSite": {"site": "<slug>", "allowedOrigins": ["https://…"], "owners": []}}`
  creates database `site_<slug>` in the control project, migrates it and registers the site with
  `connection_param` `control-db:site_<slug>`, reached with the control project's credentials. No
  connection string is copied anywhere. It can be moved to its own project later by changing
  `connection_param` to an SSM name.
- **Registering a site** is also a Test-tab invoke: `{"eotmRegister": {"site": "<slug>", "allowedOrigins": ["https://…"], "connectionParam": "/eotm/sites/<slug>/database", "owners": ["<Neon Auth user id>"]}}`. The schema and pinned version come from the package. StoryShaped is registered with the preview origin; no photo bucket yet, so uploads answer 503.
- **Change requests and notifications** (`api/requests.js`, migration `004`): "Request a change"
  in the editor or on the admin page saves the request in the control project, lists it for operators
  on the management page, emails every operator login through SES, and pushes to every browser an
  operator turned notifications on in. Email needs `NOTIFY_FROM` (a verified SES sender, e.g.
  `notifications@theedgeofthemap.com`) and `ses:SendEmail` on the Lambda role; without them push
  still goes. The Web Push key pair is generated on first use and kept in `console_settings`, so
  there is nothing to provision; deleting that row signs every device out of notifications. On
  iPhone, push works only once the admin page is added to the Home Screen (iOS 16.4+).
  The app icon carries a badge counting the notifications still in the tray (`public-admin/sw.js`);
  opening the admin page clears the tray and the badge (`markRead` in `src/dashboard.js`).
  **Unverified** on a phone.
- **Tickets** (migration `009`): a request is worked like an Azure DevOps item. State New, Active,
  Resolved or Closed; an operator assigned; a comment thread. A comment, or a state change on the
  Manage page, tells the requester by email and push when "Tell" is ticked (a comment on a New
  ticket makes it Active). Requesters see their own tickets and replies under "Your requests" on the
  admin page, and can turn on push for them there (`/api/me/push`). A new ticket's push opens its
  card (`/?manage#ticket-<id>`). "Test a new-ticket alert" pushes one to your own devices, saving
  nothing. **Unverified:** email to a requester while SES is in the sandbox; it fails for any
  unverified address and is logged, the push still goes.
- **Folding on the Manage page:** Monitors and each site's card fold to one line (the site's name,
  member count and editor version). Monitors opens by itself when one is down or none is connected.
- **Monitors on the Manage page** (`api/monitors.js`): every UptimeRobot monitor with its status and
  30-day uptime. Connect it once on the Manage page by pasting UptimeRobot's **Read-Only API Key**
  (Integrations & API, Main API keys); the API checks it against UptimeRobot, keeps it in
  `console_settings` beside the Web Push keys, and never returns it. The main (full-access) key is
  refused. `UPTIMEROBOT_KEY_PARAM`, if set, names a key in SSM to use when none was pasted.
  Each monitor shows its state as icon and word, a strip of the last 30 days' uptime (green 100%,
  amber 99% or more, red below), a line of the last 24 hours' response times with a hover readout,
  and its last 20 events (down, up, paused) with UptimeRobot's reason. Verified against the live
  account 2026-09-29 for status and 30-day uptime; the daily strip, response times and events are
  **unverified** until the next deploy reads them.
- **API log on the Manage page** (`api/logs.js`): this Lambda's own CloudWatch log for the last 24
  hours, newest first, errors and warnings by default, without Lambda's START/END/REPORT lines. Needs
  one grant on the execution role (`eotm-console-api-role-3asduby6`): `logs:FilterLogEvents` on
  `arn:aws:logs:us-east-1:<account id>:log-group:/aws/lambda/eotm-console-api:*`. Without it the panel
  names the missing permission.
  **Unverified:** UptimeRobot API v2 against a real key; tested against a fake of its documented shape.
- **The campfire on phones:** below 900 px the left scene fills the screen behind the admin card,
  fire centred (`dashboard.html`, `.sigils.is-left`).
- **Admin page sign-in** reads "Admin Console, Powered by Edge of the Map", since clients sign in
  there to edit their own site. It shows the site being signed in to (`?handoff=<site>`, from the
  public `boot`) and each site's `brand.logo` in the list. "Can't sign in?" offers the reset link and
  a help request (`POST /api/signin-help`, no login, five per caller per ten minutes, migration
  `005`), which reaches operators like a change request. Edge of the Map's footer links
  "Client sign-in" to `/?manage`: an operator lands on the management page, a client on their sites.
- **Uptime:** watched from outside AWS (UptimeRobot), so an AWS outage cannot silence its own alarm.
  Monitored: each site's production and preview address, `admin.theedgeofthemap.com/loader.js`, and
  `admin.theedgeofthemap.com/api/sites/storyshaped/boot` (the API and control database together).
- **Migrations apply themselves.** Uploading `api.zip` is the whole API deploy: the first time a
  container opens a project (control or a site) it applies that project's pending migrations under
  a Postgres advisory lock (`api/lambda.js`, `poolFor`). A failure is logged and retried by the next
  container. The Test-tab invoke `{"eotmMigrate": true}` still migrates every project at once.
- **Deploying the API from GitHub** (`.github/workflows/console-api.yml`): a push to `console` that
  touches what `api.zip` carries runs the tests, builds the zip, uploads it to `eotm-console-api` and
  calls StoryShaped's `boot`, so a fresh container applies any migrations. No AWS keys live in
  GitHub; it signs in through OIDC. One-time setup, in AWS (us-east-1, the Lambda's account):
  1. IAM → Identity providers → Add provider: OpenID Connect, URL
     `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
  2. IAM → Roles → Create role → Web identity: that provider, audience `sts.amazonaws.com`,
     GitHub organization `cbaumgart004`, repository `edgeOfTheMap`, branch `console`. Name it
     `eotm-console-deploy`.
  3. Give it one inline policy: `lambda:UpdateFunctionCode`, `lambda:GetFunction` and
     `lambda:GetFunctionConfiguration` (the "wait until updated" check) on
     `arn:aws:lambda:us-east-1:<account id>:function:eotm-console-api`, nothing else.
  4. GitHub → the repo → Settings → Secrets and variables → Actions → **Variables** →
     `AWS_DEPLOY_ROLE_ARN` = the role's ARN (an ARN is not a secret). Until it is set the deploy job
     is skipped and only the tests run.
  **Unverified:** the workflow has not run yet.
- **Releasing:** bump `version` in `package.json`, `npm run release`, commit `releases/`. Moving a
  customer to it is an update of their `sites` row; no customer site rebuilds.
  A release that adds a field kind needs the API redeployed **before** a schema using it is reloaded
  (Manage, save with the schema reloaded): the Lambda checks every site schema against its own
  `schema/schema.js` and answers 500 for a kind it does not know.
- **API:** one Lambda from `api/lambda.js` with a function URL, reached as
  `admin.theedgeofthemap.com/api/<*>` through an Amplify rewrite (status 200). Its settings, by name:
  `CONTROL_DATABASE_PARAM` (SSM name of the control project's connection string), `NEON_AUTH_URL`,
  `MEDIA_BUCKET`, `MEDIA_BASE_URL`, `MEDIA_REGION`. Its role needs `ssm:GetParameter` on `/eotm/*`, `kms:Decrypt` for those
  parameters, and `s3:PutObject` on the shared photo bucket (and on any site's own).
- **Photos:** one shared bucket, `MEDIA_BUCKET`, served through one CloudFront distribution at
  `MEDIA_BASE_URL`; each site uploads under `sites/<slug>/` (`api/handler.js`, `/uploads`). A site
  whose `media_bucket` is set uses that instead, with no prefix. The bucket's CORS rule allows `PUT`
  from any origin (`*`): the presigned URL is the permission, and CORS cannot restrict a non-browser
  client anyway, so a new site needs no CORS change. The editor scales photos to a 1600 px long
  edge, at most 600 KB; a `wide` field 2560 px, 1.2 MB; "Sharper" 3200 px, 2.5 MB (`src/images.js`,
  `LIMITS`; SCHEMA.md, `image`).

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

- **Styling a custom section.** It renders in the site's plain section style until its developer
  gives it a design; a custom collection is served by the public API but shown nowhere until the
  site's code places it.

- **Viewing and editing a site's schema on the admin page** (requested 2026-09-29). Today a schema
  change is a commit to `schema/sites/<site>.json`, an API redeploy, and a Manage save that reloads
  it. An editor must still run `checkSchema` before saving, and say which changes strand existing
  documents (a removed type or field).
- **Syncing to Etsy and eBay.** StoryShaped's stock is not console documents: it lives in the
  site's own Stock Item tables (StoryShaped ADR-0002, `backend/server/utils/stock.js`), and its
  `component` and `stockItem` types left the schema on 2026-09-29. They survive as
  `test/fixtures/inventory.json` for the tests of money, labelled photos and relations.
- **Migration of existing content**: SpiritSeeds' `content/*.json` and StoryShaped's `library.md`
  into documents (platform plan phase 0).
- **Inline editing** on the page itself (platform plan layer 1). Editing is in the sheet; the page
  shows the result live.
- **A preview link** to show an unpublished draft on another device without signing in.
