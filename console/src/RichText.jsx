import React, { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Mark, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { prepareImage } from './images.js'

// A site's textStyles become one mark that writes <span class="...">, so the
// site's own CSS styles it and the console never needs to know what it looks like.
const BrandStyle = Mark.create({
  name: 'brandStyle',
  addOptions: () => ({ classes: [] }),
  addAttributes: () => ({ className: { default: null, parseHTML: (el) => el.getAttribute('class'), renderHTML: (a) => ({ class: a.className }) } }),
  parseHTML() {
    return [{ tag: 'span[class]', getAttrs: (el) => (this.options.classes.includes(el.getAttribute('class')) ? {} : false) }]
  },
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes), 0],
})

export default function RichText({ value, onChange, schema, upload, label }) {
  const styles = schema.textStyles ?? []
  const [linkOpen, setLinkOpen] = useState(false)
  const [href, setHref] = useState('')
  const [busy, setBusy] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ['mailto', 'tel'] }),
      Image.configure({ inline: true, allowBase64: true }),
      BrandStyle.configure({ classes: styles.map((s) => s.className) }),
    ],
    content: value || '',
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
    editorProps: { attributes: { class: 'eotm-rt-body', 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' } },
  })

  // A document switch or a conflict reload replaces the value from outside.
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !(editor.isEmpty && !value)) editor.commands.setContent(value || '', { emitUpdate: false })
  }, [value, editor])

  if (!editor) return null
  const btn = (name, onClick, active, text, title) => (
    <button type="button" className={`eotm-rt-btn${active ? ' is-on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title ?? name} aria-pressed={!!active}>
      {text ?? name}
    </button>
  )
  const chain = () => editor.chain().focus()

  function applyLink() {
    const url = href.trim()
    if (!url) chain().extendMarkRange('link').unsetLink().run()
    else if (/^(https?:|mailto:|tel:|\/)/i.test(url)) chain().extendMarkRange('link').setLink({ href: url, target: /^https?:/i.test(url) ? '_blank' : null }).run()
    else chain().extendMarkRange('link').setLink({ href: `https://${url}`, target: '_blank' }).run()
    setLinkOpen(false)
  }

  async function addImage(file) {
    if (!file) return
    setBusy(true)
    try {
      const { blob } = await prepareImage(file)
      const src = await upload(blob)
      chain().setImage({ src, alt: file.name.replace(/\.[^.]+$/, '') }).run()
    } finally {
      setBusy(false)
    }
  }

  const activeStyle = styles.find((s) => editor.isActive('brandStyle', { className: s.className }))

  return (
    <div className="eotm-rt">
      <div className="eotm-rt-bar" role="toolbar" aria-label={`${label} formatting`}>
        {btn('Bold', () => chain().toggleBold().run(), editor.isActive('bold'), <b>B</b>)}
        {btn('Italic', () => chain().toggleItalic().run(), editor.isActive('italic'), <i>I</i>)}
        {btn('Heading', () => chain().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), 'H')}
        {btn('Subheading', () => chain().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }), 'h')}
        {btn('Bulleted list', () => chain().toggleBulletList().run(), editor.isActive('bulletList'), '•')}
        {btn('Numbered list', () => chain().toggleOrderedList().run(), editor.isActive('orderedList'), '1.')}
        {btn('Link', () => { setHref(editor.getAttributes('link').href ?? ''); setLinkOpen((o) => !o) }, editor.isActive('link'), '🔗')}
        <label className="eotm-rt-btn" title="Insert photo">
          {busy ? '…' : '🖼'}
          <input type="file" accept="image/*" hidden onChange={(e) => { addImage(e.target.files[0]); e.target.value = '' }} />
        </label>
        {styles.map((s) => {
          const on = activeStyle?.className === s.className
          // Drawn in the style itself (the site's CSS is on the page), so the
          // owner sees what it does. Pressing the active one returns to plain.
          return (
            <button key={s.name} type="button" className={`eotm-rt-btn eotm-rt-style${on ? ' is-on' : ''}`} aria-pressed={on} title={s.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (on ? chain().unsetMark('brandStyle').run() : chain().setMark('brandStyle', { className: s.className }).run())}>
              <span className={s.className}>{s.label}</span>
            </button>
          )
        })}
      </div>
      {linkOpen && (
        <div className="eotm-rt-link">
          <input type="url" value={href} placeholder="https://… or /page" autoFocus onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink() } if (e.key === 'Escape') setLinkOpen(false) }} />
          <button type="button" className="eotm-btn" onClick={applyLink}>{href ? 'Apply' : 'Remove link'}</button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
