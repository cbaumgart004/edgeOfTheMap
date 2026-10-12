import { describe, it, expect } from 'vitest'
import { snapshot, pageMeta, renderPage } from '../api/prerender.js'

const schema = {
  types: { page: { titleField: 'title', fields: [
    { name: 'title', kind: 'text' }, { name: 'navLabel', kind: 'text' }, { name: 'gallery', kind: 'photos' },
    { name: 'blocks', kind: 'blocks', of: ['service'] },
  ] } },
  blocks: { service: { fields: [
    { name: 'title', kind: 'text' }, { name: 'description', kind: 'richtext' }, { name: 'image', kind: 'image' },
    { name: 'buttons', kind: 'list', fields: [{ name: 'label', kind: 'text' }, { name: 'url', kind: 'url' }] },
    { name: 'extra', kind: 'group', fields: [{ name: 'note', kind: 'textarea' }] },
  ] } },
}
const data = {
  title: 'Services', navLabel: 'Services', gallery: [{ src: '/uploads/a.webp', alt: 'A room' }],
  blocks: [{ _type: 'service', title: 'Thai Yoga', description: '<p>Stretching &amp; rocking.</p>', image: { src: '/uploads/thai.jpg', alt: 'Thai' },
    buttons: [{ label: 'Book', url: 'https://book.example' }], extra: { note: 'Ninety minutes.' } }],
}

describe('prerender', () => {
  it('walks sections, groups, lists and photos, and leaves menu labels out', () => {
    const { html, images } = snapshot(schema, 'page', data)
    expect(html).toBe([
      '<h1>Services</h1>', '<img src="/uploads/a.webp" alt="A room">', '<h2>Thai Yoga</h2>', '<p>Stretching &amp; rocking.</p>',
      '<img src="/uploads/thai.jpg" alt="Thai">', '<p><a href="https://book.example">Book</a></p>', '<p>Ninety minutes.</p>',
    ].join('\n'))
    expect(images.map((i) => i.src)).toEqual(['/uploads/a.webp', '/uploads/thai.jpg'])
  })

  it('describes a page from the words under its heading, and keeps the home title the site’s', () => {
    const m = pageMeta(schema, 'Spirit Seeds', '/services', { type: 'page', data }, 'https://ss.example')
    expect(m).toMatchObject({ title: 'Services | Spirit Seeds', description: 'Thai Yoga Stretching & rocking. Book Ninety minutes.', image: 'https://ss.example/uploads/a.webp', url: 'https://ss.example/services' })
    expect(pageMeta(schema, 'Spirit Seeds', '/', { type: 'page', data }, 'https://ss.example').title).toBe(null)
  })

  it('marks a preview noindex and escapes what it writes', () => {
    const page = renderPage('<html><head><title>S</title></head><body><div id="root"></div></body></html>',
      { title: 'A "quoted" <b>', description: null, image: null, noindex: false, url: 'https://p.example/x', html: '' }, { preview: true })
    expect(page).toContain('<title data-eotm-orig="S">A &quot;quoted&quot; &lt;b&gt;</title>')
    expect(page).toContain('<meta name="robots" content="noindex" data-eotm-seo="added">')
    expect(page).not.toContain('<noscript')
  })
})
