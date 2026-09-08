// @ts-nocheck
'use client'
// ============================================================
// THE TEST ENGAGEMENT, WITH A BUTTON ON IT
//
// Habib's instruction: "the build and test should not be with a real client -
// there should be a test login". This is where he presses it.
//
// Create makes a test programme, a test engagement and three logins on a
// domain that cannot receive mail. Check signs in as the test client against
// the real database and tries every write a client must not be able to make,
// reporting each one as safe or as a hole. Remove takes all of it away.
//
// The passwords are shown once, here, and stored nowhere. Create again for new
// ones. Nothing on this panel can touch a real engagement: the route resolves
// the test engagement by a fixed slug and refuses anything else.
// ============================================================
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = { navy:'#1B2A4A', teal:'#00767A', slate:'#4A5A6A', border:'#D8E0E8', red:'#C0392B', green:'#1A7A4A', cream:'#F8F4EE' }

export default function TestEngagementPanel() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function run(action) {
    setBusy(action); setError(null); setResult(null)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const r = await fetch('/api/test-engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || 'That did not work')
      setResult({ action, data })
    } catch (e) {
      setError(e.message || 'That did not work')
    }
    setBusy(null)
  }

  const btn = (bg) => ({
    fontFamily:'var(--cv-font-mono)', fontSize:'0.85rem', fontWeight:700,
    padding:'0.42rem 0.85rem', borderRadius:4, border:'none',
    background:bg, color:'#fff', cursor:'pointer', marginRight:8,
  })

  if (!open) {
    return (
      <button type="button" onClick={()=>setOpen(true)} style={{
        fontFamily:'var(--cv-font-mono)', fontSize:'0.85rem', padding:'0.4rem 0.8rem',
        borderRadius:4, border:`1px solid ${C.border}`, background:'transparent',
        color:C.slate, cursor:'pointer',
      }}>Test engagement</button>
    )
  }

  return (
    <div style={{border:`1px solid ${C.border}`, borderRadius:8, background:'#fff', padding:'1rem', margin:'0.75rem 0', maxWidth:760}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem'}}>
        <strong style={{color:C.navy}}>The test engagement</strong>
        <button type="button" onClick={()=>setOpen(false)} style={{border:'none', background:'transparent', color:C.slate, cursor:'pointer', fontSize:'1.1rem'}}>×</button>
      </div>
      <p style={{fontSize:'0.86rem', color:C.slate, margin:'0 0 0.85rem'}}>
        An engagement that exists to be broken, with its own logins on an address that cannot
        receive mail. Nothing here can touch a real client. Use it instead of a live engagement
        whenever something needs proving.
      </p>
      <div style={{marginBottom:'0.85rem'}}>
        <button type="button" disabled={!!busy} style={btn(C.teal)} onClick={()=>run('create')}>
          {busy==='create'?'Making it...':'Create it'}
        </button>
        <button type="button" disabled={!!busy} style={btn(C.navy)} onClick={()=>run('check')}>
          {busy==='check'?'Checking...':'Check what a client can do'}
        </button>
        <button type="button" disabled={!!busy} style={btn(C.red)} onClick={()=>run('remove')}>
          {busy==='remove'?'Removing...':'Remove it'}
        </button>
      </div>

      {error && (
        <div style={{color:C.red, fontSize:'0.86rem', padding:'0.6rem', background:'#FDF0EE', borderRadius:5}}>{error}</div>
      )}

      {result?.action === 'create' && (
        <div style={{fontSize:'0.86rem', color:C.navy}}>
          <div style={{marginBottom:'0.5rem'}}>Made: {result.data.made.join(', ')}</div>
          <div style={{marginBottom:'0.4rem', color:C.slate}}>{result.data.note}</div>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.82rem'}}>
            <tbody>
              {result.data.logins.map((l)=>(
                <tr key={l.email} style={{borderTop:`1px solid ${C.border}`}}>
                  <td style={{padding:'0.4rem 0.3rem', whiteSpace:'nowrap'}}>{l.email}</td>
                  <td style={{padding:'0.4rem 0.3rem', fontFamily:'var(--cv-font-mono)'}}>{l.password}</td>
                  <td style={{padding:'0.4rem 0.3rem', color:C.slate}}>{l.proves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result?.action === 'check' && (
        <div style={{fontSize:'0.86rem'}}>
          <div style={{fontWeight:700, marginBottom:'0.5rem', color: result.data.ok ? C.green : C.red}}>
            {result.data.summary || result.data.error}
          </div>
          {[['What they must be able to read', result.data.reads], ['What they must not be able to do', result.data.writes]].map(([title, rows])=>(
            rows?.length ? (
              <div key={title} style={{marginBottom:'0.6rem'}}>
                <div style={{color:C.slate, marginBottom:'0.25rem'}}>{title}</div>
                {rows.map((a,i)=>(
                  <div key={i} style={{padding:'0.25rem 0', color: a.safe ? C.green : C.red}}>
                    {a.safe ? '✓' : '✗'} {a.what} <span style={{color:C.slate}}>· {a.detail}</span>
                  </div>
                ))}
              </div>
            ) : null
          ))}
        </div>
      )}

      {result?.action === 'remove' && (
        <div style={{fontSize:'0.86rem', color:C.navy}}>Removed: {result.data.removed.join(', ')}</div>
      )}
    </div>
  )
}
