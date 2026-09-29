# Launch checklist: the console and the three sites

What is left to switch on, in order. The console code is released as **1.1.0** (the `console`
branch). Each site's own notes: StoryShaped's
[CURRENT_WORK.md](https://github.com/cbaumgart004/storyShapedStudios/blob/preview/docs/CURRENT_WORK.md)
and SpiritSeeds'
[NEXT-STEPS.md](https://github.com/cbaumgart004/LiveSpiritSeedsMk2/blob/preview/docs/NEXT-STEPS.md),
both on their `preview` branches.

## 1. AWS (us-east-1)

1. **Lambda `eotm-console-api` → Code → Upload from → .zip:** `console/dist/api.zip` (built by
   `npm run package:api` on the `console` branch).
2. **Test tab:** `{"eotmMigrate": true}`. Applies control migrations 005 (sign-in help), 006
   (owners' own types), 007 (company details) and 008 (new logins must replace their temporary
   password). Until it runs, Manage fails to
   load (it reads 007's column).
3. **Test tab**, one site database each inside the control project (no connection string to copy):
   - `{"eotmCreateSite": {"site": "edgeofthemap", "allowedOrigins": ["https://theedgeofthemap.com", "https://www.theedgeofthemap.com"], "owners": []}}`
   - `{"eotmCreateSite": {"site": "spiritseeds", "allowedOrigins": ["https://spiritseedswellness.com", "https://www.spiritseedswellness.com", "<SpiritSeeds preview Amplify URL>"], "owners": []}}`
4. **admin.theedgeofthemap.com → Manage:** each site → Editor version **1.1.2** → Save (this also
   reloads its schema). Add yourself to both new sites as owner, and Melissa to SpiritSeeds.
5. **The shared photo bucket**, once for every site (uploads answer 503 until it exists): one S3
   bucket, one CloudFront distribution in front of it, a bucket CORS rule allowing `PUT` from `*`,
   and `s3:PutObject` on it for the Lambda role. Then Lambda → Configuration → Environment
   variables: `MEDIA_BUCKET=<bucket name>`, `MEDIA_BASE_URL=https://<distribution domain>`. Each
   site writes under `sites/<slug>/`; nothing per site. Record the distribution id in Manage → each
   site → Company details. Needs the console API built after the shared-bucket change.
6. **SES** (change-request email; push works without it): Verified identities → Create →
   Domain `theedgeofthemap.com`, Easy DKIM RSA 2048. Add the three CNAMEs it shows (section 4).
   Then Lambda → Configuration → Environment variables: `NOTIFY_FROM=notifications@theedgeofthemap.com`;
   role `eotm-console-api-role-3asduby6` → add `ses:SendEmail`. While the account is in the SES
   sandbox it can send only to verified addresses, which covers operators; request production
   access only if that changes.
7. **SpiritSeeds content (done 2026-09-29):** Manage → SpiritSeeds → **Copy an editor token**, then in
   the SpiritSeeds repo on `preview`: `EOTM_TOKEN=<that token> npm run import:console`. Re-run with
   `--replace` at cutover.

## 2. Uptime monitoring

Sign up at <https://uptimerobot.com>; the monitors live at <https://dashboard.uptimerobot.com>.
Install the UptimeRobot phone app for alerts. Add an HTTPS monitor (5-minute interval) for:

- `https://theedgeofthemap.com`
- each site's production and preview address (StoryShaped, SpiritSeeds)
- `https://admin.theedgeofthemap.com/loader.js`
- `https://admin.theedgeofthemap.com/api/sites/storyshaped/boot` (API and control database)
- `https://admin.theedgeofthemap.com/api/sites/spiritseeds/boot`
- `https://admin.theedgeofthemap.com/api/sites/edgeofthemap/boot`

## 3. The console on your phone

Open **<https://admin.theedgeofthemap.com/?manage>** in Safari (iPhone) or Chrome (Android).
iPhone: Share → Add to Home Screen, then open it from the Home Screen (push needs iOS 16.4+ and the
Home Screen app). Sign in, then **Turn on notifications on this device** and **Send a test**.

## 4. DNS and SES, per project

| Project | Domain, registrar | Records |
|---|---|---|
| Edge of the Map | `theedgeofthemap.com`, Porkbun | Keep: apex and `www` to Railway; `admin` CNAME to the console's Amplify host. **Add for SES:** three CNAMEs `<token>._domainkey` → `<token>.dkim.amazonses.com` (tokens from step 1.6); TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:keeper@theedgeofthemap.com`. Optional custom MAIL FROM `mail.theedgeofthemap.com`: MX `10 feedback-smtp.us-east-1.amazonses.com` and TXT `v=spf1 include:amazonses.com ~all` |
| StoryShaped Studios | **not recorded**, needed from Chris | Amplify → Domain management → add the domain; it lists the ACM validation CNAME and the `www`/apex targets. Apex at Porkbun is an ALIAS to the CloudFront host. No SES: the site sends no email |
| SpiritSeeds Wellness | `spiritseedswellness.com`, **Squarespace until the move to Porkbun (target 2026-11-11)** | Same Amplify records as above, entered in Squarespace DNS until the move. No SES. Before the move, copy every existing record from Squarespace (above all MX and TXT, which carry `melissacarey@spiritseedswellness.com`) into Porkbun. The move itself: SpiritSeeds' [NEXT-STEPS.md](https://github.com/cbaumgart004/LiveSpiritSeedsMk2/blob/preview/docs/NEXT-STEPS.md) |

**Unverified:** StoryShaped's domain. `eotmCreateSite` ran against Neon for both new sites on 2026-09-29, so a site database can be
created inside the control project. The DKIM token
values exist only once SES generates them.
