import { describe, it, expect, beforeAll } from 'vitest'
import { prepareImage, LIMITS } from '../src/images.js'

// A canvas that reports its size and makes a file whose size falls as quality
// and dimensions fall, so the step-down can be watched without a real encoder.
beforeAll(() => {
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} })
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.w = w; this.h = h }
    getContext() { return { drawImage() {} } }
    async convertToBlob({ type, quality }) { return { type, size: Math.round(this.w * this.h * quality * 0.25) } }
  }
})
const photo = { type: 'image/jpeg' }

describe('photo limits', () => {
  it('scales an ordinary photo to 1600 px and fits the standard budget', async () => {
    const out = await prepareImage(photo)
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(1600)
    expect(out.blob.size).toBeLessThanOrEqual(LIMITS.standard.budget)
  })
  it('lets a wide field and the Sharper override go past the cap', async () => {
    expect((await prepareImage(photo, 'wide')).width).toBeGreaterThan(1600)
    expect((await prepareImage(photo, 'wide')).width).toBeLessThanOrEqual(2560)
    expect((await prepareImage(photo, 'full')).width).toBeGreaterThan(2560)
    expect((await prepareImage(photo, 'full')).width).toBeLessThanOrEqual(3200)
  })
  it('treats an unknown limit as standard, and refuses a file that is not a photo', async () => {
    expect((await prepareImage(photo, 'huge')).width).toBeLessThanOrEqual(1600)
    await expect(prepareImage({ type: 'text/plain' })).rejects.toThrow('not a photo')
  })
})
