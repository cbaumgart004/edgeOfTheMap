import { describe, it, expect } from 'vitest'
import { createLogs } from '../api/logs.js'

const line = (level, text) => `2026-09-30T02:29:49.000Z\t0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b\t${level}\t${text}`

describe('API log', () => {
  it('drops Lambda bookkeeping, reads each level, newest first', async () => {
    const logs = createLogs({
      logGroup: '/aws/lambda/eotm-console-api',
      filterLogEvents: async () => ({ events: [
        { timestamp: 1, message: 'START RequestId: abc Version: $LATEST\n' },
        { timestamp: 2, message: line('INFO', '[migrate] control applied 009_tickets.sql') },
        { timestamp: 3, message: line('ERROR', '[requests] push failed: gone') },
        { timestamp: 4, message: 'REPORT RequestId: abc Duration: 3 ms' },
      ] }),
    })
    const r = await logs({ hours: 24 })
    expect(r.lines).toEqual([
      { at: 3, level: 'ERROR', text: '[requests] push failed: gone' },
      { at: 2, level: 'INFO', text: '[migrate] control applied 009_tickets.sql' },
    ])
  })

  it('says what permission is missing', async () => {
    const logs = createLogs({ logGroup: 'g', filterLogEvents: async () => { throw Object.assign(new Error('no'), { name: 'AccessDeniedException' }) } })
    await expect(logs()).rejects.toMatchObject({ status: 503 })
  })
})
