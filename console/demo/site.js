// A stand-in for a customer site: renders published documents from the demo's
// local store and overlays the console's live drafts through window.EOTM.
const site = new URLSearchParams(location.search).get('site') ?? 'storyshaped'
const KEY = `eotm:local:${site}`

// The loader, exactly as a site includes it, in local mode.
const loader = document.createElement('script')
loader.src = '/dist/loader.js'
Object.assign(loader.dataset, { site, local: '', schema: `/schema/sites/${site}.json`, console: '/dist/console/0.1.0/console.js' })
document.body.append(loader)

function published(type) {
  let docs = []
  try { docs = JSON.parse(localStorage.getItem(KEY))?.docs ?? [] } catch { /* empty */ }
  return docs.filter((d) => d.type === type && d.publishedData).map((d) => ({ ...d, data: d.publishedData }))
}
// Published documents with the owner's unsaved drafts on top.
function live(type) {
  const pub = published(type)
  return window.EOTM ? window.EOTM.merge(type, pub) : pub
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const isDraft = (d) => !!window.EOTM?.draft(d.type, d.id)
const money = (m) => (m?.amount != null ? `$${(m.amount / 100).toFixed(2)}` : '')

const views = {
  storyshaped: {
    name: 'StoryShaped Studios',
    nav: [['/', 'Shop'], ['/library', 'Library']],
    render(path) {
      if (path.startsWith('/library')) {
        const slug = path.split('/')[2]
        const items = live('libraryArticle').sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0))
        const one = slug && items.find((d) => d.slug === slug)
        if (one) return `<article class="${isDraft(one) ? 'draft' : ''}"><h1>${esc(one.data.title)}</h1>${one.data.body ?? ''}</article>`
        return `<h1>Library</h1><ul>${items.map((d) => `<li class="${isDraft(d) ? 'draft' : ''}"><a href="/library/${d.slug}">${esc(d.data.title)}</a></li>`).join('')}</ul>`
      }
      const items = live('stockItem').filter((d) => d.data.showOnSite !== false)
      const cards = items.map((d) => {
        const light = d.data.photos?.find((p) => p.index === 'Light') ?? d.data.photos?.[0]
        const dark = d.data.photos?.find((p) => p.index === 'Dark')
        return `<div class="card ${isDraft(d) ? 'draft' : ''}">${light ? `<img src="${esc(light.src)}" alt="${esc(light.alt)}">` : ''}
          ${dark ? `<details><summary>Under blacklight</summary><img src="${esc(dark.src)}" alt="${esc(dark.alt)}"></details>` : ''}
          <h3>${esc(d.data.name)}</h3><p>${money(d.data.price)} · ${d.data.quantityOnHand ?? 0} in stock</p>${d.data.description ?? ''}</div>`
      })
      return `<h1>Shop</h1><div class="cards">${cards.join('') || '<p>No items yet.</p>'}</div>`
    },
  },
  spiritseeds: {
    name: 'Spirit Seeds Wellness',
    nav: [['/', 'Home'], ['/events', 'Events']],
    render(path) {
      const events = live('event').sort((a, b) => String(a.data.startsAt).localeCompare(String(b.data.startsAt)))
      const slug = path.startsWith('/events/') && path.split('/')[2]
      const one = slug && events.find((d) => d.slug === slug)
      const card = (d) => `<div class="card ${isDraft(d) ? 'draft' : ''}">${d.data.image?.src ? `<img src="${esc(d.data.image.src)}" alt="${esc(d.data.image.alt)}">` : ''}
        <h3>${esc(d.data.title)}</h3><p>${d.data.startsAt ? new Date(d.data.startsAt).toLocaleString() : ''} · ${esc(d.data.location)}</p>${d.data.description ?? ''}
        ${d.data.bookingUrl ? `<p><a href="${esc(d.data.bookingUrl)}">${esc(d.data.bookingLabel || 'Book')}</a></p>` : ''}</div>`
      if (one) return card(one)
      return `<h1>${path.startsWith('/events') ? 'Events' : 'Welcome'}</h1><div class="cards">${events.map(card).join('') || '<p>No events yet.</p>'}</div>`
    },
  },
}

const view = views[site]
document.title = `${view.name} (demo)`
document.getElementById('site-name').textContent = view.name
document.getElementById('nav').innerHTML = view.nav.map(([p, l]) => `<a href="${p}">${l}</a>`).join(' · ')

function render() {
  document.getElementById('page').innerHTML = view.render(location.pathname)
  const now = Date.now()
  const banner = site === 'spiritseeds' && live('banner').find((b) =>
    (!b.data.startsAt || Date.parse(b.data.startsAt) <= now) && (!b.data.endsAt || Date.parse(b.data.endsAt) > now))
  document.getElementById('banner').innerHTML = banner
    ? `<div class="banner ${esc(banner.data.style)} ${isDraft(banner) ? 'draft' : ''}">${banner.data.message ?? ''}${banner.data.linkUrl ? ` <a href="${esc(banner.data.linkUrl)}">${esc(banner.data.linkLabel || 'More')}</a>` : ''}</div>`
    : ''
}

// Client-side routing, as the real sites do, so the console can navigate.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/"]')
  if (!a || a.closest('[data-eotm-host]')) return
  e.preventDefault()
  history.pushState({}, '', a.getAttribute('href') + location.search)
  render()
})
addEventListener('popstate', render)
addEventListener('storage', render)
const wire = () => (window.EOTM ? window.EOTM.subscribe(render) : setTimeout(wire, 20))
wire()
render()
