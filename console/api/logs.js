// The console API's own log on the management page: what it printed to
// CloudWatch in the last few hours (errors, migrations, failed email or push),
// newest first, without Lambda's START / END / REPORT bookkeeping lines.
// Operators only (manage.js). Needs logs:FilterLogEvents on the function's own
// log group, granted to its execution role; without it the panel says so.
//
// deps: filterLogEvents({ logGroupName, startTime, nextToken, limit }) -> { events, nextToken }
//       logGroup: '/aws/lambda/<function name>'

import { ServiceError } from '../core/service.js'

const BOOKKEEPING = /^(START|END|REPORT|INIT_START|EXTENSION|TELEMETRY) /
// Lambda's line prefix: "<ISO time>\t<request id>\t<LEVEL>\t<message>".
const PREFIX = /^\S+Z\t[0-9a-f-]{36}\t(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\t/

export function createLogs(deps) {
  return async function logs({ hours = 24, errorsOnly = false } = {}) {
    const span = Math.min(72, Math.max(1, Number(hours) || 24))
    const lines = []
    let nextToken
    try {
      // Oldest first from startTime; up to 5 pages keeps the answer quick.
      for (let page = 0; page < 5; page++) {
        const out = await deps.filterLogEvents({ logGroupName: deps.logGroup, startTime: Date.now() - span * 3_600_000, nextToken, limit: 500 })
        lines.push(...(out.events ?? []))
        nextToken = out.nextToken
        if (!nextToken) break
      }
    } catch (err) {
      if (err?.name === 'AccessDeniedException') {
        throw new ServiceError(503, 'The API cannot read its own log yet: give its execution role logs:FilterLogEvents on its log group.')
      }
      if (err?.name === 'ResourceNotFoundException') return { group: deps.logGroup, lines: [] }
      throw err
    }
    const parsed = lines
      .filter((e) => !BOOKKEEPING.test(e.message))
      .map((e) => {
        const m = PREFIX.exec(e.message)
        return { at: e.timestamp, level: m ? m[1] : 'INFO', text: (m ? e.message.slice(m[0].length) : e.message).trim() }
      })
      .filter((l) => !errorsOnly || l.level === 'ERROR' || l.level === 'WARN' || l.level === 'FATAL')
    return { group: deps.logGroup, hours: span, truncated: Boolean(nextToken), lines: parsed.slice(-200).reverse() }
  }
}
