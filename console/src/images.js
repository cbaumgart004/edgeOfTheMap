// Photos are resized in the browser before upload (StoryShaped ADR-0005), so a
// 12-megapixel phone photo becomes a few hundred KB of WebP.

const MAX_EDGE = 2400
const QUALITY = 0.86

export async function prepareImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('That file is not a photo.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(width, height)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY })
  // Safari before 17 cannot encode WebP and silently returns PNG; JPEG is smaller.
  if (blob.type !== 'image/webp') blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY })
  return { blob, width, height }
}
