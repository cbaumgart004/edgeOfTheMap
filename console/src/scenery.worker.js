// Paints the campfire scene's trees, ground and pit (scenery.js) off the page's
// main thread. Painting one pane takes 120 to 270 ms of pixel work; done on the
// page, it stalled the flame and the page's own loading each time a pane
// resized. Each request comes back as an ImageBitmap the page draws in one step.

import { drawTrees, drawPit } from './scenery.js'

self.onmessage = ({ data: m }) => {
  const canvas = new OffscreenCanvas(m.pw, m.ph)
  const ctx = canvas.getContext('2d')
  if (m.kind === 'trees') drawTrees(ctx, m.w, m.h, m.dpr, m.key, m.side, m.fireX)
  else drawPit(ctx, m.pw, m.key, m.layer, m.pit)
  const bitmap = canvas.transferToImageBitmap()
  self.postMessage({ id: m.id, bitmap }, [bitmap])
}
