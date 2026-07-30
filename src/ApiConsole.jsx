// ApiConsole.jsx
//
// The API claim, executed rather than illustrated. Every response in this panel
// is computed by `demoApi.js` at the moment the button is pressed — including
// the write, which really mutates the demo dataset, so pressing it repeatedly
// really does draw the stock down and really does trip the low-stock threshold.
//
// A static code block would have been a tenth of the work and asks the visitor
// to take the response on faith, which is a strange thing to do in the section
// arguing that the API is real.

import React, { useState } from 'react'
import { DEMO_REQUESTS, resetDemo } from './demoApi.js'

const STATUS_KIND = (status) => {
  if (status >= 500) return 'err'
  if (status >= 400) return 'warn'
  return 'ok'
}

export default function ApiConsole() {
  const [selected, setSelected] = useState(DEMO_REQUESTS[0].id)
  const [result, setResult] = useState(null)

  const request = DEMO_REQUESTS.find((r) => r.id === selected)

  const send = (req) => {
    setSelected(req.id)
    setResult(req.run())
  }

  const reset = () => {
    resetDemo()
    setResult(null)
  }

  return (
    <div className="api-console">
      <div className="api-console-bar">
        <span className="api-console-title">Stillwater Massage — demo API</span>
        <button type="button" className="api-console-reset" onClick={reset}>
          Reset data
        </button>
      </div>

      <div className="api-console-reqs" role="group" aria-label="Example requests">
        {DEMO_REQUESTS.map((req) => (
          <button
            key={req.id}
            type="button"
            className={`api-req ${req.id === selected ? 'is-selected' : ''}`}
            onClick={() => send(req)}
          >
            <span className={`api-verb is-${req.method.toLowerCase()}`}>
              {req.method}
            </span>
            <code>{req.path}</code>
          </button>
        ))}
      </div>

      <p className="api-console-caption">{request.caption}</p>

      {request.body && (
        <pre className="api-console-out is-request">
          <code>{JSON.stringify(request.body, null, 2)}</code>
        </pre>
      )}

      {/* Polite rather than assertive: the visitor pressed the button, so they
          are already looking at it — an assertive region would interrupt a
          screen reader mid-sentence for something they asked for. */}
      <div className="api-console-response" aria-live="polite">
        {result ? (
          <>
            <p className={`api-status is-${STATUS_KIND(result.status)}`}>
              {result.status}
            </p>
            <pre className="api-console-out">
              <code>{JSON.stringify(result.body, null, 2)}</code>
            </pre>
          </>
        ) : (
          <p className="api-console-idle">
            Press a request. Nothing here is a real client&rsquo;s data — the
            dataset is invented for this page.
          </p>
        )}
      </div>
    </div>
  )
}
