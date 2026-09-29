// Photos are compressed in the browser before upload (StoryShaped ADR-0005), so a
// 12-megapixel phone photo becomes a few hundred KB of WebP and nothing large
// ever reaches storage. The longest edge is capped, then quality and, if still
// needed, size step down until the file is inside the budget.

// Three ceilings. `standard` covers StoryShaped's widest photo (760 CSS px on a
// 2x screen, ADR-0005); larger is stored, and downloaded by every visitor, for
// nothing. `wide` is for a field marked "wide" in the schema: a banner or
// full-bleed background drawn across the whole screen. `full` is the owner's
// override ("Sharper") when a photo looks soft at the standard size.
export const LIMITS = {
  standard: { edge: 1600, budget: 600 * 1024 },
  wide: { edge: 2560, budget: 1200 * 1024 },
  full: { edge: 3200, budget: 2500 * 1024 },
}
// Quality first, then size, steps down from the ceiling until the file fits.
const steps = (edge) => [
  { edge, quality: 0.86 },
  { edge, quality: 0.76 },
  { edge: Math.round(edge * 0.875), quality: 0.72 },
  { edge: Math.round(edge * 0.8), quality: 0.68 },
  { edge: Math.round(edge * 0.64), quality: 0.64 },
]

async function encode(bitmap, edge, quality) {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(width, height)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality })
  // Safari before 17 cannot encode WebP and silently returns PNG; JPEG is smaller.
  if (blob.type !== 'image/webp') blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  return { blob, width, height }
}

export async function prepareImage(file, limit = 'standard') {
  const { edge, budget } = LIMITS[limit] ?? LIMITS.standard
  if (!file.type.startsWith('image/')) throw new Error('That file is not a photo.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    let out = null
    for (const step of steps(edge)) {
      out = await encode(bitmap, step.edge, step.quality)
      if (out.blob.size <= budget) break
    }
    return out
  } finally {
    bitmap.close()
  }
}
