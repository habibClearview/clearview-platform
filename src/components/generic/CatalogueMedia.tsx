// @ts-nocheck
'use client'
// ============================================================
// THE PICTURE AND THE DETAILS ON A CATALOGUE ITEM
//
// 12 September 2026. Habib: in the catalogue there is no add image option, but
// I think this would be really good to have, especially on the field operation
// app. And: a name for the product and price for the product and a description
// like size, colour, or any custom attributes would be useful.
//
// WHY THE PHOTO IS SHRUNK IN THE BROWSER. A photograph off a modern phone is
// three to eight megabytes. The people using this are on cheap Android phones
// on metered data in places where the signal comes and goes, so sending the
// raw file is the difference between a picture that uploads and one that times
// out twice and gets abandoned. The canvas resize costs nothing and turns it
// into something like eighty kilobytes before it leaves the device.
//
// WHY THE THUMBNAIL FETCHES ITS OWN ADDRESS. The pictures are private, like
// the receipts and the recordings, so there is no permanent address to put in
// an img tag. Each one is handed a signed address that expires, fetched once
// and then remembered for as long as the screen is open, so a catalogue of
// forty items does not ask forty times every time React re-renders.
// ============================================================
import { useEffect, useState } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import {
  cleanAttributes, suggestedLabels, MAX_ATTRIBUTES,
  MAX_ATTRIBUTE_LABEL, MAX_ATTRIBUTE_VALUE,
} from '@/lib/catalogue-item'

const C = {
  navy: 'var(--cv-navy)', slate: 'var(--cv-slate)', border: 'var(--cv-border)',
  teal: 'var(--cv-teal)', red: 'var(--cv-red)', card: 'var(--cv-card)',
  field: 'var(--cv-bg-2)', hi: 'var(--cv-card-hi)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }

// One signed address per picture, for as long as the page is open. They last an
// hour and the screen is rarely open that long, and a stale one simply fails to
// draw and falls back to the symbol.
const addresses = new Map()

/** Ask for the signed address of a stored picture. */
export async function pictureAddress(path) {
  if (!path) return null
  if (addresses.has(path)) return addresses.get(path)
  try {
    const res = await authedFetch(`/api/field/admin/catalogue-image?path=${encodeURIComponent(path)}`)
    const data = await res.json().catch(() => ({}))
    const url = res.ok ? (data.url || null) : null
    addresses.set(path, url)
    return url
  } catch {
    return null
  }
}

/**
 * Make a photograph small enough to send over a weak connection.
 *
 * The long side is capped and the picture is re-encoded as JPEG. If any part
 * of this fails, which it can on an old browser or an image format the canvas
 * will not decode, the original is returned rather than nothing: a slow upload
 * beats a control that silently refuses the photo somebody just took.
 */
export async function shrinkImage(file, maxSide = 900, quality = 0.82) {
  try {
    if (typeof document === 'undefined' || !file?.type?.startsWith?.('image/')) return file
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file
    // A photo that somehow came out bigger is not an improvement.
    if (blob.size >= file.size) return file
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/** The picture on an item, or the symbol that stood there before pictures. */
export function CatalogueThumb({ path, size = 56, itemType = 'product', radius = 10 }) {
  const [url, setUrl] = useState(() => (path ? addresses.get(path) || null : null))
  useEffect(() => {
    let live = true
    if (!path) { setUrl(null); return undefined }
    pictureAddress(path).then((u) => { if (live) setUrl(u) })
    return () => { live = false }
  }, [path])

  const box = {
    width: size, height: size, borderRadius: radius, flex: `0 0 ${size}px`,
    background: C.hi, display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', fontSize: Math.round(size * 0.45),
  }
  if (url) {
    return (
      <span style={box}>
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
    )
  }
  return <span style={box} aria-hidden="true">{itemType === 'service' ? '🛠️' : '📦'}</span>
}

/** The details as small pills, under the item's name. */
export function DetailChips({ attributes, compact = false }) {
  const list = cleanAttributes(attributes)
  if (!list.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {list.map((a) => (
        <span key={a.label} style={{
          ...mono, fontSize: compact ? '0.76rem' : '0.82rem', border: `1px solid ${C.border}`,
          borderRadius: 20, padding: '1px 8px', color: C.slate, whiteSpace: 'nowrap',
        }}>
          {a.label} <b style={{ color: C.navy, fontWeight: 500 }}>{a.value}</b>
        </span>
      ))}
    </div>
  )
}

/**
 * Take or choose a picture for an item.
 *
 * One control on both devices. The phone offers the camera because of capture
 * on the file input; the laptop offers the file chooser from the same button.
 */
export function PhotoControl({ clientId, itemId, path, onChange, disabled = false }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputId = `cat-photo-${itemId || 'new'}`

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try {
      const small = await shrinkImage(file)
      const form = new FormData()
      form.append('file', small)
      form.append('clientId', clientId)
      if (itemId) form.append('itemId', itemId)
      const res = await authedFetch('/api/field/admin/catalogue-image', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `The picture could not be saved (${res.status})`)
      if (data.path && data.url) addresses.set(data.path, data.url)
      onChange(data.path || null)
    } catch (e2) { setErr(e2.message) }
    setBusy(false)
  }

  async function remove() {
    if (typeof window !== 'undefined' && !window.confirm('Remove this picture?')) return
    setBusy(true); setErr('')
    try {
      if (itemId) {
        const res = await authedFetch('/api/field/admin/catalogue-image', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'The picture could not be removed')
      }
      onChange(null)
    } catch (e2) { setErr(e2.message) }
    setBusy(false)
  }

  const button = {
    ...mono, fontSize: '0.88rem', padding: '0.35rem 0.7rem', borderRadius: 6,
    border: `1px solid ${C.teal}`, background: 'transparent', color: C.teal,
    cursor: disabled || busy ? 'not-allowed' : 'pointer',
  }

  return (
    <div style={{
      border: `1px dashed ${C.teal}`, borderRadius: 9, padding: '0.7rem',
      display: 'flex', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap',
    }}>
      <CatalogueThumb path={path} size={54} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0, flex: '1 1 200px' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <label htmlFor={inputId} style={button}>
            {busy ? 'Sending...' : path ? 'Change the picture' : 'Take or choose a picture'}
          </label>
          <input
            id={inputId} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
            disabled={disabled || busy} onChange={pick} style={{ display: 'none' }}
          />
          {path && !busy && (
            <button type="button" onClick={remove} style={{ ...button, borderColor: C.border, color: C.red }}>
              Remove
            </button>
          )}
        </div>
        <div style={{ fontSize: '0.9rem', color: C.slate, lineHeight: 1.35 }}>
          On a phone this opens the camera. The picture is made smaller on the device before it is
          sent, so it costs very little data.
        </div>
        {err && <div style={{ fontSize: '0.9rem', color: C.red }}>{err}</div>}
      </div>
    </div>
  )
}

/**
 * The details on an item, as pairs.
 *
 * The labels this business has already used are offered first, so the second
 * person types Colour rather than colour or color. Nothing stops them typing
 * something new, because a business that sells fabric needs a label a business
 * that sells fertiliser never will.
 */
export function DetailsEditor({ value, onChange, allItems = [], disabled = false }) {
  const rows = Array.isArray(value) ? value : []
  const suggestions = suggestedLabels(allItems)
  const used = new Set(rows.map((r) => String(r?.label || '').toLowerCase()))

  const set = (i, field, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [field]: v } : r)))
  const add = (label = '') => { if (rows.length < MAX_ATTRIBUTES) onChange(rows.concat([{ label, value: '' }])) }
  const drop = (i) => onChange(rows.filter((_, j) => j !== i))

  const input = {
    border: `1px solid ${C.border}`, background: C.field, borderRadius: 7,
    padding: '0.35rem 0.5rem', fontSize: '1rem', color: C.navy, width: '100%', minWidth: 0,
  }
  const chip = {
    ...mono, fontSize: '0.84rem', border: `1px solid ${C.border}`, borderRadius: 20,
    padding: '0.15rem 0.6rem', color: C.teal, background: 'transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={{ ...input, flex: '1 1 130px' }} placeholder="Size" disabled={disabled}
            maxLength={MAX_ATTRIBUTE_LABEL} aria-label="Detail name"
            value={r?.label || ''} onChange={(e) => set(i, 'label', e.target.value)}
          />
          <input
            style={{ ...input, flex: '1 1 130px' }} placeholder="90kg" disabled={disabled}
            maxLength={MAX_ATTRIBUTE_VALUE} aria-label="Detail"
            value={r?.value || ''} onChange={(e) => set(i, 'value', e.target.value)}
          />
          <button
            type="button" onClick={() => drop(i)} disabled={disabled} aria-label="Remove this detail"
            style={{ ...mono, fontSize: '0.9rem', color: C.slate, border: `1px solid ${C.border}`,
              borderRadius: 6, width: 30, height: 30, background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
          >&times;</button>
        </div>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
        {rows.length < MAX_ATTRIBUTES && (
          <button type="button" style={chip} disabled={disabled} onClick={() => add('')}>+ Add a detail</button>
        )}
        {suggestions
          .filter((l) => !used.has(l.toLowerCase()))
          .slice(0, 6)
          .map((l) => (
            <button key={l} type="button" style={{ ...chip, color: C.slate }} disabled={disabled} onClick={() => add(l)}>
              {l}
            </button>
          ))}
      </div>
    </div>
  )
}
