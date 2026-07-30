// demoApi.js
//
// A fictional database, and a real API over it.
//
// The API section used to show a static code block, which asks the visitor to
// take the response on faith. This instead ships a small invented dataset and
// **actually implements** the endpoints against it — routing, filtering, cursor
// pagination, a transactional write, honest error codes. The responses in the
// console are computed when the button is pressed, not typed out in advance.
//
// **Nothing here touches a real client's data, and that is the point.** Every
// row is invented for this page. The practice is Stillwater Massage — the same
// fictional business the live-edit demo names, so the page describes one
// imaginary client throughout rather than a different one per section.
//
// The write endpoint mutates this module's state, so pressing it twice really
// does decrement twice and eventually really does trip the low-stock threshold.
// `resetDemo()` puts it back.

const SEED = () => ({
  services: [
    { id: 'svc_deep', name: 'Deep tissue', minutes: 90, practitioners: ['pra_01'] },
    { id: 'svc_swed', name: 'Swedish', minutes: 60, practitioners: ['pra_01', 'pra_02'] },
    { id: 'svc_pren', name: 'Prenatal', minutes: 60, practitioners: ['pra_02'] },
  ],
  practitioners: [
    { id: 'pra_01', name: 'A. Reyes', modalities: ['deep tissue', 'sports'] },
    { id: 'pra_02', name: 'J. Okafor', modalities: ['swedish', 'prenatal'] },
  ],
  appointments: [
    {
      id: 'apt_8c1f42',
      service_id: 'svc_deep',
      practitioner_id: 'pra_01',
      starts_at: '2026-08-04T14:00:00-06:00',
      status: 'confirmed',
      client: { id: 'cli_2a90', name: 'R. Nakamura' },
    },
    {
      id: 'apt_8c1f43',
      service_id: 'svc_swed',
      practitioner_id: 'pra_02',
      starts_at: '2026-08-04T16:30:00-06:00',
      status: 'confirmed',
      client: { id: 'cli_31b7', name: 'M. Dubois' },
    },
    {
      id: 'apt_8c1f44',
      service_id: 'svc_pren',
      practitioner_id: 'pra_02',
      starts_at: '2026-08-05T10:00:00-06:00',
      status: 'pending_deposit',
      client: { id: 'cli_5f02', name: 'T. Abara' },
    },
  ],
  // The retail shelf. A practice that blends its own oils is the smallest
  // honest excuse for a bill of materials, which is the part of an inventory
  // system that is actually hard — one sale has to move more than one row.
  products: [
    { id: 'prd_oil_arn', name: 'Arnica blend, 50ml', quantity: 12, price_cents: 2400 },
    { id: 'prd_oil_cal', name: 'Calendula blend, 50ml', quantity: 4, price_cents: 2200 },
  ],
  components: [
    { id: 'cmp_arnica', name: 'Arnica infusion', unit: 'ml', quantity: 900, low_stock_at: 500 },
    // Seeded *above* its threshold on purpose: the console's write draws 20ml a
    // press, so the second press crosses 500 and `low_stock_triggered` actually
    // fires. Seeded below, the feature could never be demonstrated — it only
    // reports the crossing, not the standing state.
    { id: 'cmp_calend', name: 'Calendula infusion', unit: 'ml', quantity: 540, low_stock_at: 500 },
    { id: 'cmp_jojoba', name: 'Jojoba carrier', unit: 'ml', quantity: 1500, low_stock_at: 800 },
    { id: 'cmp_bottle', name: 'Amber bottle, 50ml', unit: 'each', quantity: 38, low_stock_at: 24 },
  ],
  // Which components, and how much of each, go into one unit of a product.
  bom: [
    { product_id: 'prd_oil_arn', component_id: 'cmp_arnica', qty: 20 },
    { product_id: 'prd_oil_arn', component_id: 'cmp_jojoba', qty: 30 },
    { product_id: 'prd_oil_arn', component_id: 'cmp_bottle', qty: 1 },
    { product_id: 'prd_oil_cal', component_id: 'cmp_calend', qty: 20 },
    { product_id: 'prd_oil_cal', component_id: 'cmp_jojoba', qty: 30 },
    { product_id: 'prd_oil_cal', component_id: 'cmp_bottle', qty: 1 },
  ],
})

let db = SEED()

export function resetDemo() {
  db = SEED()
}

const clone = (value) => JSON.parse(JSON.stringify(value))

/* Cursor pagination rather than `?page=2`, because an offset shifts under you
   when a row is inserted mid-scan and the client silently skips a record. The
   cursor here is the last id seen, base64'd the way a real one would be. */
const encodeCursor = (id) => btoa(JSON.stringify({ after: id }))
const decodeCursor = (cursor) => {
  try {
    return JSON.parse(atob(cursor)).after
  } catch {
    return null
  }
}

function listAppointments({ from, limit = 2, cursor } = {}) {
  let rows = db.appointments
  if (from) rows = rows.filter((a) => a.starts_at >= from)
  rows = [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  if (cursor) {
    const after = decodeCursor(cursor)
    const at = rows.findIndex((a) => a.id === after)
    if (at >= 0) rows = rows.slice(at + 1)
  }

  const page = rows.slice(0, limit)
  const more = rows.length > limit

  return {
    status: 200,
    body: {
      appointments: page.map((a) => {
        const service = db.services.find((s) => s.id === a.service_id)
        const practitioner = db.practitioners.find((p) => p.id === a.practitioner_id)
        return {
          id: a.id,
          service: `${service.name} — ${service.minutes} minutes`,
          practitioner: practitioner.name,
          starts_at: a.starts_at,
          status: a.status,
          client: a.client,
        }
      }),
      next: more
        ? `/api/v1/appointments?cursor=${encodeCursor(page[page.length - 1].id)}`
        : null,
    },
  }
}

function getAppointment(id) {
  const found = db.appointments.find((a) => a.id === id)
  if (!found) {
    return {
      status: 404,
      body: {
        error: {
          code: 'appointment_not_found',
          message: `No appointment with id '${id}'.`,
          // A real error says what to do next. "404" on its own makes the
          // caller guess whether they got the id wrong or the route wrong.
          hint: 'List appointments at GET /api/v1/appointments to find valid ids.',
        },
      },
    }
  }
  return { status: 200, body: clone(found) }
}

/* The one entry point that changes a quantity, and the reason this endpoint is
   worth showing instead of another read: selling one bottle is not one write.
   It has to move the product, move every component the bill of materials links
   to it, notice anything that crossed its low-stock threshold on the way, and
   leave an audit row — **or do none of those things.** A partial application of
   that is an inventory nobody can trust again.

   Validated first, applied second: everything that can refuse is checked before
   anything is written, so the "rollback" is simply never having started. That is
   the shape the real implementation takes too, with the writes inside a
   transaction rather than inside a closure. */
function adjustProductQuantity(productId, { delta, reason } = {}) {
  const product = db.products.find((p) => p.id === productId)
  if (!product) {
    return {
      status: 404,
      body: {
        error: {
          code: 'product_not_found',
          message: `No product with id '${productId}'.`,
        },
      },
    }
  }

  if (typeof delta !== 'number' || Number.isNaN(delta) || delta === 0) {
    return {
      status: 422,
      body: {
        error: {
          code: 'invalid_delta',
          message: 'Field `delta` must be a non-zero number.',
        },
      },
    }
  }

  if (product.quantity + delta < 0) {
    return {
      status: 409,
      body: {
        error: {
          code: 'insufficient_stock',
          message: `Cannot move ${product.name} by ${delta}; only ${product.quantity} on hand.`,
        },
      },
    }
  }

  const links = db.bom.filter((b) => b.product_id === productId)

  // Components only move when stock goes *down* — receiving finished goods does
  // not un-consume the ingredients they were already made from.
  const consuming = delta < 0
  const draws = consuming
    ? links.map((link) => {
        const component = db.components.find((c) => c.id === link.component_id)
        return { component, used: link.qty * Math.abs(delta) }
      })
    : []

  const short = draws.find((d) => d.component.quantity - d.used < 0)
  if (short) {
    return {
      status: 409,
      body: {
        error: {
          code: 'insufficient_component',
          message: `Not enough ${short.component.name}: need ${short.used}${short.component.unit}, have ${short.component.quantity}${short.component.unit}.`,
        },
      },
    }
  }

  // Nothing above can fail now, so apply.
  product.quantity += delta
  const crossed = []
  draws.forEach(({ component, used }) => {
    const before = component.quantity
    component.quantity -= used
    if (before > component.low_stock_at && component.quantity <= component.low_stock_at) {
      crossed.push(component)
    }
  })

  return {
    status: 200,
    body: {
      product: { id: product.id, name: product.name, quantity: product.quantity },
      adjustment: {
        id: `adj_${Math.random().toString(36).slice(2, 8)}`,
        delta,
        reason: reason ?? 'unspecified',
        at: new Date().toISOString(),
      },
      components_drawn: draws.map(({ component, used }) => ({
        id: component.id,
        name: component.name,
        used: `${used}${component.unit}`,
        remaining: `${component.quantity}${component.unit}`,
      })),
      low_stock_triggered: crossed.map((c) => ({
        id: c.id,
        name: c.name,
        quantity: `${c.quantity}${c.unit}`,
        threshold: `${c.low_stock_at}${c.unit}`,
      })),
    },
  }
}

function lowStock() {
  return {
    status: 200,
    body: {
      components: db.components
        .filter((c) => c.quantity <= c.low_stock_at)
        .map((c) => ({
          id: c.id,
          name: c.name,
          quantity: `${c.quantity}${c.unit}`,
          threshold: `${c.low_stock_at}${c.unit}`,
        })),
    },
  }
}

/** The requests the console offers, in the order they tell a story: read a
 *  page, follow the cursor, fail honestly, then do the hard write. */
export const DEMO_REQUESTS = [
  {
    id: 'list',
    method: 'GET',
    path: '/api/v1/appointments?from=2026-08-01&limit=2',
    caption: 'A page of bookings, with a cursor to the next one.',
    run: () => listAppointments({ from: '2026-08-01T00:00:00-06:00', limit: 2 }),
  },
  {
    id: 'page2',
    method: 'GET',
    path: '/api/v1/appointments?cursor=…',
    caption: 'Following that cursor. `next` is null when the list is spent.',
    run: () =>
      listAppointments({
        from: '2026-08-01T00:00:00-06:00',
        limit: 2,
        cursor: encodeCursor('apt_8c1f43'),
      }),
  },
  {
    id: 'miss',
    method: 'GET',
    path: '/api/v1/appointments/apt_nope',
    caption: 'An error that tells you what to do next, not just that you failed.',
    run: () => getAppointment('apt_nope'),
  },
  {
    id: 'sell',
    method: 'PATCH',
    path: '/api/v1/products/prd_oil_cal/quantity',
    body: { delta: -1, reason: 'retail sale' },
    caption:
      'Selling one bottle: the product moves, every component in its bill of materials moves with it, and anything that crosses its threshold says so. Press it repeatedly — the numbers really fall, and low stock really trips.',
    run: () =>
      adjustProductQuantity('prd_oil_cal', { delta: -1, reason: 'retail sale' }),
  },
  {
    id: 'low',
    method: 'GET',
    path: '/api/v1/components/low-stock',
    caption: 'What needs reordering, after whatever you just did above.',
    run: () => lowStock(),
  },
]
