// Photos are compressed in the browser before upload (StoryShaped ADR-0005), so a
// 12-megapixel phone photo becomes a few hundred KB of WebP and nothing large
// ever reaches storage. The longest edge is capped, then quality and, if still
// needed, size step down until the file is inside the budget.

const MAX_EDGE = 2400
const BUDGET = 900 * 1024 // bytes; a full-width photo rarely needs more
const STEPS = [
  { edge: MAX_EDGE, quality: 0.86 },
  { edge: MAX_EDGE, quality: 0.76 },
  { edge: 1920, quality: 0.74 },
  { edge: 1600, quality: 0.7 },
  { edge: 1280, quality: 0.66 },
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

export async function prepareImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('That file is not a photo.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    let out = null
    for (const step of STEPS) {
      out = await encode(bitmap, step.edge, step.quality)
      if (out.blob.size <= BUDGET) break
    }
    return out
  } finally {
    bitmap.close()
  }
}
