'use client'
// ============================================================
// ONE PERSON'S PERMANENT LINK  (R34, R36, R37)
//
// Sits beside each person in the list that already exists. It does not hold a
// second copy of the team: the names come from the party list, and this only
// adds the link.
//
// R36 HAS TWO ROUTES AND ONLY ONE OF THEM IS BUILT.
//
//   Copy for messaging   built. Puts the whole message on the clipboard,
//                        ready to paste into WhatsApp.
//   Send by email        NOT BUILT, and deliberately so. Nothing in this
//                        platform sends email, and sending client names and
//                        their permanent links to an outside company is what
//                        Rule 9 forbids unless the specification names the
//                        service. Instructed 11 August 2026: do not send any
//                        email, do not install anything that sends mail.
//
// So R36 fails its own written test until a mail service is named, and that is
// reported rather than hidden behind a button that looks like it works.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '@/lib/authed-fetch'
import { personalLinkMessage, personalLinkUrl } from '@/lib/stage2-personal-links'

const C = {
  border: 'var(--cv-border)', slate: 'var(--cv-slate)', navy: 'var(--cv-navy)',
  teal: 'var(--cv-teal)', red: 'var(--cv-red)', green: 'var(--cv-green)',
}
const mono = { fontFamily: 'var(--cv-font-mono)' }
const btn = (col: string) => ({
  ...mono, fontSize: '0.79rem', fontWeight: 600, padding: '0.28rem 0.6rem',
  border: `1px solid ${col}`, borderRadius: 7, background: 'transparent',
  color: col, cursor: 'pointer',
})

interface Person {
  id: string
  name: string | null
  organisation: string | null
  token: string | null
  lastOpened: string | null
}

export default function PersonalLinkControls({
  clientId, partyId, canManage,
}: { clientId: string; partyId: string; canManage: boolean }) {
  const [person, setPerson] = useState<Person | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!clientId || !canManage) return
    try {
      const res = await authedFetch(`/api/team-links?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setPerson((json.team || []).find((p: Person) => p.id === partyId) || null)
    } catch {
      /* Nothing arrives, nothing changes. */
    }
  }, [clientId, partyId, canManage])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (method: 'POST' | 'DELETE') => {
    setBusy(true); setSaid(null)
    try {
      const res = await authedFetch('/api/team-links', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, partyId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setSaid(json?.error || 'That did not go through.')
      }
      await load()
    } catch {
      setSaid('Could not reach the server. Nothing was changed.')
    }
    setBusy(false)
  }, [clientId, partyId, load])

  if (!canManage) return null

  const url = person?.token ? personalLinkUrl(window.location.origin, person.token) : null

  const copy = async () => {
    if (!url) return
    const message = personalLinkMessage(person?.name || '', person?.organisation || null, url)
    try {
      await navigator.clipboard.writeText(message)
      setSaid('Copied. Paste it into WhatsApp or a message.')
    } catch {
      // Some browsers refuse the clipboard without a gesture they recognise.
      // Better to show the link than to say it worked when it did not.
      setSaid(url)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
      {url ? (
        <>
          <span style={{ ...mono, fontSize: '0.79rem', color: person?.lastOpened ? C.green : C.slate }}>
            {person?.lastOpened ? 'Link opened' : 'Link not opened yet'}
          </span>
          <button type="button" style={btn(C.teal)} onClick={copy}>Copy link to send</button>
          {/* R36's other route, built once Resend was named on 12 August 2026.
              It fails loudly where the key is absent rather than reporting a
              success that never happened. */}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true); setSaid(null)
              try {
                const res = await authedFetch('/api/team-links-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ clientId, partyId, origin: window.location.origin }),
                })
                const json = await res.json().catch(() => ({}))
                setSaid(res.ok ? 'Sent by email.' : (json?.error || 'That did not send.'))
              } catch { setSaid('Could not reach the server.') }
              setBusy(false)
            }}
            style={btn(C.navy)}
          >Send by email</button>
          {/* R37. Withdrawing one person's link. It bites at once, because the
              participant route re-checks the grant on every request rather
              than only when somebody first opens their link. */}
          <button type="button" style={btn(C.red)} disabled={busy} onClick={() => act('DELETE')}>
            {busy ? 'Withdrawing...' : 'Withdraw link'}
          </button>
        </>
      ) : (
        <button type="button" style={btn(C.navy)} disabled={busy} onClick={() => act('POST')}>
          {busy ? 'Creating...' : 'Create personal link'}
        </button>
      )}
      {said ? (
        <span style={{ fontSize: '0.8rem', color: C.slate, maxWidth: '28rem', wordBreak: 'break-all' }}>{said}</span>
      ) : null}
    </span>
  )
}
