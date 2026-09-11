// @ts-nocheck
'use client'
// ============================================================
// THE GUIDANCE LIBRARY
//
// 11 September 2026. Habib asked where a co-implementer gets the guidance
// notes and manuals, and whether she should have access to his Gmail folder
// that holds them.
//
// She should not. A mail folder is reached through a mail account, and that
// account holds his commercial terms with the funder, his other clients and
// everything else in his working life. Access to a folder is access to an
// account, and there is no way to give one without the other.
//
// So the manuals are here, on the platform, read by the coaching team wherever
// they are working. A client or a funder never sees this, which is the same
// rule the Coach quick reference already follows.
//
// UPLOADED, NOT LINKED, WHERE THERE IS A CHOICE. A link is only as good as
// somebody else's sharing settings, and it breaks silently when those change,
// which on the day a co-implementer is preparing a session is the worst
// possible moment to find out. Linking stays for what genuinely lives
// elsewhere.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { GUIDANCE_CATEGORIES, readableSize } from '@/lib/guidance'

const C = {
  card: 'var(--cv-card)', border: 'var(--cv-border)', slate: 'var(--cv-slate)',
  navy: 'var(--cv-navy)', teal: 'var(--cv-teal)', green: 'var(--cv-green)',
  amber: 'var(--cv-amber)', red: 'var(--cv-red)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const hint = { fontSize: '0.9rem', color: C.slate, lineHeight: 1.5 }
const field = {
  width: '100%', padding: '0.45rem 0.6rem', borderRadius: 7, fontSize: 16,
  border: `1px solid ${C.border}`, background: 'var(--cv-card)', color: 'inherit', minHeight: 40,
}
const btn = (col, solid) => ({
  ...mono, fontSize: '0.86rem', fontWeight: 700, padding: '0.45rem 0.95rem', minHeight: 40,
  border: `1px solid ${col}`, borderRadius: 7,
  background: solid ? col : 'transparent',
  color: solid ? 'var(--cv-on-accent)' : col, cursor: 'pointer',
})

const BLANK = { title: '', description: '', category: 'method', url: '' }

export default function GuidanceLibrary() {
  const [docs, setDocs] = useState([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(BLANK)
  const [file, setFile] = useState(null)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token || ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/guidance', { headers: { Authorization: `Bearer ${await token()}` } })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `The library could not be read (${res.status})`)
      setDocs(json.documents || [])
      setCanManage(Boolean(json.canManage))
      setErr(null)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!draft.title.trim()) { setErr('Give the document a title.'); return }
    if (!file && !draft.url.trim()) { setErr('Upload the document, or give a link to it.'); return }
    if (file && draft.url.trim()) { setErr('Upload it or link to it, not both.'); return }
    setBusy('add'); setErr(null); setNote(null)
    try {
      const form = new FormData()
      form.append('title', draft.title.trim())
      form.append('description', draft.description.trim())
      form.append('category', draft.category)
      if (file) { form.append('file', file); form.append('filename', file.name) }
      else form.append('url', draft.url.trim())

      const res = await fetch('/api/guidance', {
        method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: form,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `That could not be added (${res.status})`)
      setNote(`${draft.title.trim()} is in the library.`)
      setDraft(BLANK); setFile(null); setAdding(false)
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  async function remove(d) {
    if (typeof window !== 'undefined' && !window.confirm(
      `Remove "${d.title}" from the library?${d.file_path ? ' The uploaded file goes with it.' : ''}`,
    )) return
    setBusy(`del:${d.id}`); setErr(null); setNote(null)
    try {
      const res = await fetch('/api/guidance', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ id: d.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'It could not be removed')
      setNote(`${d.title} has been removed.`)
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  /**
   * Open an uploaded manual.
   *
   * It is fetched with the sign in on the request and opened from the
   * browser's own memory, because a document behind an address of its own
   * keeps working for somebody who has left the team.
   */
  async function open(d) {
    setBusy(`open:${d.id}`); setErr(null)
    try {
      const res = await fetch(`/api/guidance?download=${encodeURIComponent(d.id)}`, {
        headers: { Authorization: `Bearer ${await token()}` },
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `It could not be opened (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setErr(e.message) }
    setBusy(null)
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...mono, fontSize: '0.78rem', letterSpacing: '.1em', textTransform: 'uppercase', color: C.slate }}>
            Guidance library
          </div>
          <div style={{ ...hint, marginTop: '0.2rem', maxWidth: '70ch' }}>
            The manuals, the session guides and the templates, held here rather than in anybody&rsquo;s mailbox.
            The coaching team can read all of it. A client or a funder never sees it.
          </div>
        </div>
        {canManage && (
          <button onClick={() => { setAdding((v) => !v); setErr(null) }} style={btn(C.teal, !adding)}>
            {adding ? 'Cancel' : 'Add a document'}
          </button>
        )}
      </div>

      {adding && canManage && (
        <div style={{ marginTop: '0.9rem', padding: '0.85rem', border: `1px solid ${C.border}`, borderRadius: 9 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '0.7rem' }}>
            <div>
              <label style={{ ...hint, display: 'block', marginBottom: '0.2rem' }}>What it is called</label>
              <input style={field} value={draft.title} placeholder="Delivery Guide, Decision Point 2"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div>
              <label style={{ ...hint, display: 'block', marginBottom: '0.2rem' }}>Which section</label>
              <select style={field} value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {GUIDANCE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: '0.6rem' }}>
            <label style={{ ...hint, display: 'block', marginBottom: '0.2rem' }}>What it is for, in a sentence</label>
            <input style={field} value={draft.description} placeholder="Who must be in the room and what the session has to produce"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '0.7rem', marginTop: '0.6rem' }}>
            <div>
              <label style={{ ...hint, display: 'block', marginBottom: '0.2rem' }}>Upload it</label>
              <input type="file" style={{ ...field, padding: '0.3rem' }}
                onChange={(e) => { setFile(e.target.files?.[0] || null); setDraft((d) => ({ ...d, url: '' })) }} />
              <div style={{ ...hint, fontSize: '0.8rem', marginTop: '0.2rem' }}>Up to 50MB. This is the better way.</div>
            </div>
            <div>
              <label style={{ ...hint, display: 'block', marginBottom: '0.2rem' }}>Or link to it</label>
              <input style={field} value={draft.url} placeholder="https://"
                onChange={(e) => { setDraft({ ...draft, url: e.target.value }); setFile(null) }} />
              <div style={{ ...hint, fontSize: '0.8rem', marginTop: '0.2rem' }}>
                A link is only as good as its sharing settings, and it breaks quietly when they change.
              </div>
            </div>
          </div>
          <button onClick={add} disabled={busy === 'add'} style={{ ...btn(C.teal, true), marginTop: '0.7rem' }}>
            {busy === 'add' ? 'Adding...' : 'Add it to the library'}
          </button>
        </div>
      )}

      {loading && <div style={{ ...hint, marginTop: '0.7rem' }}>Reading the library...</div>}
      {note && <div style={{ ...hint, marginTop: '0.6rem', color: C.green }}>{note}</div>}
      {err && (
        <div style={{ ...hint, marginTop: '0.6rem', color: C.red }}>
          {err}{' '}
          <button onClick={load} style={{ ...mono, fontSize: '0.82rem', color: C.red, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
        </div>
      )}

      {!loading && !err && docs.length === 0 && (
        <div style={{ ...hint, marginTop: '0.8rem' }}>
          Nothing in the library yet.{canManage ? ' Press Add a document to put the first manual in.' : ''}
        </div>
      )}

      {GUIDANCE_CATEGORIES.map((cat) => {
        const inSection = docs.filter((d) => d.category === cat.id)
        if (!inSection.length) return null
        return (
          <div key={cat.id} style={{ marginTop: '1.1rem' }}>
            <div style={{ fontWeight: 700, color: C.navy }}>{cat.label}</div>
            <div style={{ ...hint, marginBottom: '0.3rem' }}>{cat.note}</div>
            {inSection.map((d) => (
              <div key={d.id} style={{
                borderTop: `1px solid ${C.border}`, padding: '0.55rem 0',
                display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap',
              }}>
                <div style={{ flex: '1 1 260px', minWidth: 200 }}>
                  <div style={{ fontWeight: 600 }}>{d.title}</div>
                  {d.description && <div style={hint}>{d.description}</div>}
                  <div style={{ ...mono, fontSize: '0.76rem', color: C.slate }}>
                    {d.file_path ? `Uploaded${d.size_bytes ? `, ${readableSize(d.size_bytes)}` : ''}` : 'Linked elsewhere'}
                  </div>
                </div>
                {d.file_path ? (
                  <button onClick={() => open(d)} disabled={busy === `open:${d.id}`} style={btn(C.teal)}>
                    {busy === `open:${d.id}` ? 'Opening...' : 'Open'}
                  </button>
                ) : (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ ...btn(C.teal), textDecoration: 'none' }}>
                    Open the link
                  </a>
                )}
                {canManage && (
                  <button onClick={() => remove(d)} disabled={busy === `del:${d.id}`} style={btn(C.red)}>
                    {busy === `del:${d.id}` ? 'Removing...' : 'Remove'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
