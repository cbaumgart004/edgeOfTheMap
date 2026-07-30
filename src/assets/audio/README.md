# Narration samples

Audio for the sample player on `/storyteller`. Drop files here and name them in
the `SAMPLES` table in `src/narration.js` — nothing else needs touching.

`narration.js` resolves this folder with `import.meta.glob`, not with a static
`import` per file, so:

- files still go through the bundler and come out content-hashed, like every
  other asset (DESIGN.md §6 — `public/` is for URLs that must survive a rebuild,
  and these do not need to);
- **a name in the table with no file here is not a build error.** It renders as
  a listed-but-unplayable entry saying the sample is not yet posted, the same
  way `WORK`'s optional `href` renders a project as a plain name until its URL
  is confirmed. A half-filled table is a visible gap, never a broken page.

Accepted extensions are `.mp3` and `.m4a` — the glob pattern in `narration.js`
names both, and adding a third format means editing that pattern too.

## Before adding a file

- **Keep samples short.** These are auditions, not chapters. Every file here is
  in the deploy and a visitor on a phone pays for the ones they play. A minute
  or two each; if a sample needs to be longer than that to make its point, the
  point is not being made.
- **Export at a modest bitrate.** 96–128 kbps mono is transparent for spoken
  word and roughly a third the size of the ACX delivery master. The masters
  belong in the studio, not in the repo — same rule as `logo.png` (DESIGN.md §6).
- **These are the site's own copies, not hotlinks to ACX.** That is the whole
  point of ADR 0006: the page renders identically whether or not ACX is up,
  logged in, or laid out the way it was last year.

This file also exists so the folder itself survives a clone — git does not track
empty directories.
