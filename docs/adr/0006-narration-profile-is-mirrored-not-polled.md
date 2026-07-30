# 0006 — The narration profile is mirrored into the repo, not polled from ACX

- **Status:** Accepted
- **Date:** 2026-07-30
- **Branch:** `audio-narration`
- **Scope:** `src/narration.js`, `src/SamplePlayer.jsx`, `src/StorytellerPage.jsx`, `src/assets/audio/`, `DESIGN.md` §2 §4

## Summary

The Storyteller earns `/storyteller`, and the page's evidence is audio: four samples
playable in place, plus the narrator profile that on ACX sits behind `?tab=about`.

The ask was to render both **by polling the ACX narrator page on access** rather than
linking out to it. That is not achievable, and the reason is not a difficulty to be
engineered around — it is three independent walls, any one of which is sufficient. So
the content is mirrored into this repo and ACX keeps the role it is actually good at:
the place a producer hires a narrator.

Measured effect: CSS 38.37 → 43.40 kB (8.61 → 9.30 kB gzipped), JS 241.78 → 252.23 kB
(77.33 → 80.59 kB gzipped). Sample audio is additional and is not in these numbers.

---

## Decision 1 — There is no fetch, at runtime or at build time

**Context.** `https://www.acx.com/narrator?p=…&tab=about` and `&tab=audio-samples` were
requested directly to find out what is actually retrievable. Both answer an anonymous
`GET` with **`302` to `amazon.com/ap/signin`**, and a request carrying an `Origin`
header with a flat **`403`** and no `Access-Control-Allow-Origin` of any kind.

Three walls, and they fail independently:

1. **Authentication.** There is no anonymous view of the profile at all. This is the
   one that also kills the build-time answer — a scraper on the Railway host is just as
   anonymous as a browser is.
2. **CORS.** Even were the page public, a browser on `theedgeofthemap.com` could not
   read the response body.
3. **No backend.** The site is static and served by `npx serve -s dist` (DESIGN.md §7).
   "Poll on access" presumes a server that this deployment does not have, and adding one
   converts a static site into an operated service.

**Decision.** No fetch. `narration.js` holds the profile as text and the samples as
files in `src/assets/audio/`, served from this domain.

**Alternative rejected: a credentialed scraper in the build.** A script that logs into
Amazon with stored credentials and scrapes both tabs during `npm run build`. Rejected on
four counts, in increasing order of how much they matter: it puts Amazon account
credentials into a build environment; it needs a 2FA path that does not exist
unattended; it breaks silently whenever ACX changes its markup, and a silent break here
means the *narration page* ships empty; and the sample audio URLs are near-certainly
signed and expiring, so even a successful scrape yields links that rot between builds.
It also scrapes an authenticated Amazon session on a schedule, which is not ours to
authorise.

**Alternative rejected: hotlinking the ACX audio.** Same expiry problem without even the
scrape, plus it makes a visitor's ability to hear the samples contingent on Amazon
serving cross-origin media to us, which it does not promise to keep doing.

**Alternative rejected: link out only, render nothing.** The status quo. Rejected
because narration is the one craft here that can simply be **demonstrated**, and a page
that makes a visitor leave for Amazon to find out what the narrator sounds like has
given away the only advantage it had.

**Consequence, and it is the one to dislike:** the profile can now drift from ACX, and
nothing on either side will say so. Refreshing it is an edit and a deploy. That is the
real cost of this decision, and it is accepted because the failure mode is *stale*,
which is visible and cheap to fix, rather than *empty*, which is what every polled
version fails to on its worst day.

---

## Decision 2 — Samples resolve through a glob, so a missing file is not a build error

**Context.** The sample table names files that may not be in the repo yet. A static
`import` of an absent mp3 fails the build outright, which means the table cannot be
written ahead of the audio.

**Decision.** `import.meta.glob('./assets/audio/*.{mp3,m4a}', { eager: true })`, with the
table looking each entry up by filename. A hit yields a hashed, cache-busted asset URL;
a miss yields `undefined`, which the player renders as a listed-but-unplayable row.

**Alternative rejected: `public/audio/`.** Referencing by literal path also tolerates
absence, but forfeits content hashing for files that have no need of a stable URL —
DESIGN.md §2 reserves `public/` for URLs that must survive a rebuild, and these are not
that. A missing file would also arrive as a runtime `404` rather than as a rendered
statement that the sample is not posted yet.

**Consequence.** This is the same shape as `WORK`'s optional `href` in KeeperPage
(ADR 0004): a half-filled table is a visible, honest gap rather than a broken control.
The cost is that a **typo** in a filename is indistinguishable from a file that has not
been recorded yet — both render "not yet posted" — so the table and the folder have to
be read against each other, exactly like the bindrune's two forms (DESIGN.md §4).

**Addendum — samples are grouped by source, not by listing.** `SOURCES` keys the
listings a sample can have come from, and each sample names one. ACX is the first and
explicitly not the intended last, so nothing downstream hardcodes `acx`: adding a
second listing is an entry in that table, and the page grows a heading and a link-out
for it. The alternative — a flat list with an ACX link at the foot — was what shipped
first, and it makes the second source a rewrite of the section rather than a row of
data. The heading is suppressed while there is only one source, so the common case
stays a plain list.

---

## Decision 3 — The transport is ours, because `<audio controls>` cannot take the faces

**Context.** The cheapest player is the native one: `<audio controls>`, no component, no
CSS, correct keyboard behaviour for free.

**Decision.** A headless `<audio>` element with a transport built from a button and a
range input, themed from the same tokens as everything else.

**Alternative rejected: native `controls`.** The native widget is painted by the browser
and takes no tokens at all — not `--radius`, not `--accent`, not `--display-font`. It
would land in both faces *identically*, which on a site whose entire thesis is that the
two faces are different documents (DESIGN.md §5) makes it the one element on the page
arguing that the toggle is a recolour. It also looks like a different website in each
browser, on a site that ships no third-party UI anywhere else.

**Alternative rejected: an audio player dependency.** Rejected for the reason ADR 0003
rejected `react-router` — the whole need here is play, pause, seek and a clock over one
element, and every library that does it arrives with a skin to override.

**Consequence.** ~3.3 kB gzipped of JS, and the accessibility is now ours to get right:
the transport is real `<button>` and `<input type="range">` with labels rather than
divs, and all transport state is read from the element's own `play`/`pause`/`ended`
events rather than set beside the calls that cause them — so a `play()` that rejects
(autoplay policy, a 404) cannot leave the button claiming to be playing.

**One `<audio>` element serves the whole list**, which is what makes "only one sample
plays at a time" true by construction: switching samples is a `src` assignment, and
there is never a second element left running to remember to pause.
