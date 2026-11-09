# CLAUDE.md

The Edge of the Map console (`console/`) and the per-site schemas (`console/schema/sites/`).
Console release: bump `console/package.json`, `node scripts/release.js`, push, then pin the site in Admin > Manage.

## Editor rules (Spirit Seeds, StoryShapedStudios, Edge of the Map)

These hold across all three repos. The Edge of the Map console is the editor for every site.

- **EVERYTHING IS REACHABLE IN THE EDITOR. NO EXCEPTIONS.** Every element and every setting on any of
  these sites, at any time, can be read and edited through the Edge of the Map console: words, pictures,
  layout, sizes, spacing, backgrounds, and anything drawn only by CSS (a pseudo-element or a variable
  counts). If a visitor can see it, the editor reaches it: a field or a class in
  `console/schema/sites/<site>.json` (Edge of the Map), marked on the page, or it is removed. A look
  hard-coded in CSS with no path from the editor is a defect, not a shortcut, and a change that adds one
  is not finished. If a change cannot make something reachable, say so in the same reply. Content shown
  on one document but owned by another (an event on a banner slide) carries `data-eotm-from` so Edit
  opens the owner.
- **Desktop edits reach every resolution.** A layout set on desktop applies to tablet and phone
  unless those modes have their own layout. Review a layout change at all three widths.
- **Layout across modes.** When a layout change is saved and the user has not set all three modes
  (desktop, tablet, phone), the editor asks how the others behave: **Scale smoothly** (default, on)
  or **Custom** (the user sets the layout in all three).
- **Save scope on layout elements.** Every save on a layout element offers: **this element only**,
  **all elements with this class**, or **save as a new custom template**.
