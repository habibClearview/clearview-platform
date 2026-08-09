// @ts-nocheck
'use client'
// ============================================================
// What the room sees on their phones.
//
// Designed for somebody standing up in a workshop with one hand free, so it is
// one column, large type, and two fields. Name once, then type. The name is
// remembered on the device so nobody types it twice in a two hour session.
//
// It shows what the rest of the room has added, because a session where you
// cannot see the other answers is a survey, not a working session, and the
// point of the method is that eight views of the same question can be compared.
//
// There is no editing and no deleting. A link passed round a room is held by
// more people than the one who typed, so correcting belongs to the coach.
// Saying that plainly on screen is better than a delete button that removes
// somebody else's sentence.
// ============================================================
import { useCallback, useEffect, useState } from 'react'

const CSS = `
.sc{--paper:#EDE6D6;--card:#FBF7EE;--ink:#1B2A41;--ink-soft:#4C5A6B;--ink-faint:#8B8272;
  --line:rgba(27,42,65,.18);--teal:#00767A;--gold:#B7791F;
  --fd:Georgia,"Times New Roman",serif;--fb:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;
  --fm:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  background:var(--paper);color:var(--ink);font-family:var(--fb);min-height:100vh;line-height:1.55}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .sc{
  --paper:#0B1420;--card:#111E31;--ink:#EDF2F8;--ink-soft:#AAB9C9;--ink-faint:#7c899b;
  --line:rgba(255,255,255,.16);--teal:#2AEBEB;--gold:#E0B15A}}
:root[data-theme="dark"] .sc{--paper:#0B1420;--card:#111E31;--ink:#EDF2F8;--ink-soft:#AAB9C9;
  --ink-faint:#7c899b;--line:rgba(255,255,255,.16);--teal:#2AEBEB;--gold:#E0B15A}
.sc *{box-sizing:border-box}
.sc .wrap{max-width:640px;margin:0 auto;padding:22px 18px 70px}
.sc .kicker{font-family:var(--fm);font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--teal);margin:0 0 6px}
.sc h1{font-family:var(--fd);font-weight:600;font-size:clamp(23px,5.4vw,31px);line-height:1.12;margin:0}
.sc .sub{margin:9px 0 0;color:var(--ink-soft);font-size:15px}
.sc .box{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:16px;margin-top:19px}
.sc label{display:block;font-family:var(--fm);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);margin:0 0 5px}
.sc input,.sc textarea{width:100%;border:1px solid var(--line);border-radius:9px;padding:12px;
  background:var(--paper);color:var(--ink);font-family:var(--fb);font-size:17px}
.sc textarea{min-height:118px;resize:vertical}
.sc .row{margin-bottom:13px}
.sc button{width:100%;border:none;border-radius:10px;padding:14px;background:var(--teal);color:#fff;
  font-size:16.5px;font-weight:600;cursor:pointer;font-family:var(--fb)}
.sc button[disabled]{opacity:.55;cursor:not-allowed}
.sc .note{margin-top:11px;font-size:14px}
.sc .ok{color:var(--teal)} .sc .bad{color:var(--gold)}
.sc .said{border-top:1px solid var(--line);padding:13px 0 0;margin-top:13px}
.sc .said:first-child{border-top:none;padding-top:0;margin-top:0}
.sc .who{font-family:var(--fm);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint)}
.sc .what{margin:5px 0 0;font-size:15.5px;white-space:pre-wrap}
.sc .foot{margin-top:26px;font-size:13px;color:var(--ink-faint);text-align:center}
`

export default function SessionCaptureView({ token }) {
  const [state, setState] = useState({ loading: true, link: null, contributions: [], error: null })
  const [name, setName] = useState('')
  const [roleText, setRoleText] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  // The name is remembered per link on this device, so it is typed once in a
  // session rather than before every sentence.
  useEffect(() => {
    try {
      setName(window.localStorage.getItem(`cv.session.name.${token}`) || '')
      setRoleText(window.localStorage.getItem(`cv.session.role.${token}`) || '')
    } catch { /* a device that refuses storage still works, it just asks again */ }
  }, [token])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/session-capture?token=${encodeURIComponent(token)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setState({ loading: false, link: null, contributions: [], error: json?.error || 'This link is not open' }); return }
      setState({ loading: false, link: json.link, contributions: json.contributions || [], error: null })
    } catch {
      setState({ loading: false, link: null, contributions: [], error: 'Could not reach the session' })
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (busy) return
    setBusy(true); setNote(null)
    try {
      const res = await fetch('/api/session-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, contributorName: name, contributorRole: roleText, contribution: text }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Could not add that')
      try {
        window.localStorage.setItem(`cv.session.name.${token}`, name)
        window.localStorage.setItem(`cv.session.role.${token}`, roleText)
      } catch { /* nothing depends on this succeeding */ }
      setText('')
      setNote({ ok: true, text: 'Added. The room can see it.' })
      await load()
    } catch (e) {
      setNote({ ok: false, text: e.message })
    }
    setBusy(false)
  }

  if (state.loading) {
    return <div className="sc"><style dangerouslySetInnerHTML={{ __html: CSS }} /><div className="wrap"><p className="sub">Opening the session...</p></div></div>
  }

  // One page for every kind of failure: never issued, revoked, expired, or
  // finished. Which one it was is not a stranger's business.
  if (!state.link) {
    return (
      <div className="sc">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="wrap">
          <p className="kicker">Session</p>
          <h1>This session is not open</h1>
          <p className="sub">It may have finished, or the link may have been withdrawn. Ask whoever is running the session for a current one.</p>
        </div>
      </div>
    )
  }

  const l = state.link
  return (
    <div className="sc">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wrap">
        <p className="kicker">{l.organisation ? `${l.organisation} · ` : ''}Working session</p>
        <h1>{l.sessionTitle || l.blockLabel || 'This session'}</h1>
        {l.sessionPurpose ? <p className="sub">{l.sessionPurpose}</p> : null}
        {!l.sessionPurpose && l.blockLabel && l.sessionTitle ? <p className="sub">{l.blockLabel}</p> : null}

        <div className="box">
          <div className="row">
            <label htmlFor="sc-name">Your name</label>
            <input id="sc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="So it can be followed up" />
          </div>
          <div className="row">
            <label htmlFor="sc-role">Your role (optional)</label>
            <input id="sc-role" value={roleText} onChange={(e) => setRoleText(e.target.value)} placeholder="Finance, field team, leadership" />
          </div>
          <div className="row">
            <label htmlFor="sc-text">What would you add?</label>
            <textarea id="sc-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="In your own words. Say the thing you would say out loud." />
          </div>
          <button type="button" onClick={submit} disabled={busy || !name.trim() || !text.trim()}>
            {busy ? 'Adding...' : 'Add it'}
          </button>
          {note ? <p className={`note ${note.ok ? 'ok' : 'bad'}`}>{note.text}</p> : null}
        </div>

        <div className="box">
          <p className="kicker" style={{ margin: 0 }}>What the room has added</p>
          <div style={{ marginTop: 12 }}>
            {state.contributions.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>Nothing yet. Yours would be the first.</p>
            ) : state.contributions.map((c) => (
              <div className="said" key={c.id}>
                <div className="who">{c.contributor_name}{c.contributor_role ? ` · ${c.contributor_role}` : ''}</div>
                <p className="what">{c.contribution}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="foot">
          Anything added here goes to the person running the session, who decides what becomes part of
          the record. Nothing can be edited or deleted from this page, so nobody can remove what
          somebody else said.
        </p>
      </div>
    </div>
  )
}
