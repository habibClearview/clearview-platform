'use client'
import { useState, useEffect, useCallback } from 'react'

const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B',
}

interface CatalogueItem { id:string; name:string; category:string; line_type:string }
interface Customer { id:string; name:string; phone?:string; village?:string }
interface AuthData {
  operator: { id:string; display_name:string; phone?:string; role:string; sync_frequency:string }
  client: { id:string; name:string; currency:string }
  unit: { id:string; name:string }
  catalogue: CatalogueItem[]
  customers: Customer[]
}
interface QueuedTx {
  local_id:string; plan_line_id:string; plan_line_name:string; transaction_type:string;
  category:string; amount:number; quantity?:number; unit_price?:number;
  payment_method?:string; customer_id?:string; transaction_date:string; notes?:string
}

const STORAGE_TOKEN = 'clearview_field_token'
const STORAGE_AUTH = 'clearview_field_auth'
const STORAGE_QUEUE = 'clearview_field_queue'

function fmt(n:number, cc='UGX') {
  return `${cc} ${Math.round(n).toLocaleString()}`
}

export default function FieldCapturePage() {
  const [tokenInput, setTokenInput] = useState('')
  const [token, setToken] = useState<string|null>(null)
  const [auth, setAuth] = useState<AuthData|null>(null)
  const [queue, setQueue] = useState<QueuedTx[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string|null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    plan_line_id:'', amount:'', quantity:'', unit_price:'',
    payment_method:'cash', customer_id:'', notes:'',
    transaction_date: new Date().toISOString().split('T')[0],
  })

  // ── Load token from URL or localStorage on mount ──
  useEffect(()=>{
    const urlToken = new URLSearchParams(window.location.search).get('token')
    const savedToken = urlToken || localStorage.getItem(STORAGE_TOKEN)
    const savedAuth = localStorage.getItem(STORAGE_AUTH)
    const savedQueue = localStorage.getItem(STORAGE_QUEUE)
    if (savedQueue) { try { setQueue(JSON.parse(savedQueue)) } catch {} }
    if (savedToken) {
      setToken(savedToken)
      if (urlToken) localStorage.setItem(STORAGE_TOKEN, urlToken)
      if (savedAuth) { try { setAuth(JSON.parse(savedAuth)) } catch {} }
      authenticate(savedToken)
    } else {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  const authenticate = useCallback(async (t:string) => {
    setLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/field/auth', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token: t }),
      })
      if (!res.ok) {
        const err = await res.json().catch(()=>({}))
        setAuthError(err.error || 'Could not verify this link. Check it and try again.')
        setLoading(false)
        return
      }
      const data: AuthData = await res.json()
      setAuth(data)
      setToken(t)
      localStorage.setItem(STORAGE_TOKEN, t)
      localStorage.setItem(STORAGE_AUTH, JSON.stringify(data))
    } catch {
      // Offline on first load with no cached auth -- nothing we can do but
      // tell them plainly rather than fail silently.
      setAuthError('No connection right now. If you have used this link before on this phone, your data is still saved -- try again once you have signal.')
    }
    setLoading(false)
  }, [])

  function saveQueue(next: QueuedTx[]) {
    setQueue(next)
    localStorage.setItem(STORAGE_QUEUE, JSON.stringify(next))
  }

  function addToQueue() {
    if (!form.plan_line_id || !form.amount) return
    const line = auth?.catalogue.find(c=>c.id===form.plan_line_id)
    if (!line) return
    const tx: QueuedTx = {
      local_id: `local_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      plan_line_id: line.id, plan_line_name: line.name,
      transaction_type: line.category==='revenue' ? 'sale' : 'expense',
      category: line.category,
      amount: Number(form.amount),
      quantity: form.quantity ? Number(form.quantity) : undefined,
      unit_price: form.unit_price ? Number(form.unit_price) : undefined,
      payment_method: form.payment_method || undefined,
      customer_id: form.customer_id || undefined,
      transaction_date: form.transaction_date,
      notes: form.notes || undefined,
    }
    saveQueue([...queue, tx])
    setForm(f=>({...f, plan_line_id:'', amount:'', quantity:'', unit_price:'', notes:''}))
    setShowForm(false)
  }

  function removeFromQueue(localId:string) {
    saveQueue(queue.filter(q=>q.local_id!==localId))
  }

  async function syncNow() {
    if (!token || queue.length===0) return
    setSyncing(true)
    try {
      const res = await fetch('/api/field/sync', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          token,
          device_id: 'web_' + (localStorage.getItem('clearview_device_id') || (()=>{ const id = Math.random().toString(36).slice(2,10); localStorage.setItem('clearview_device_id', id); return id })()),
          transactions: queue.map(({local_id, ...rest})=>rest),
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        saveQueue([])
        setLastSync(new Date().toLocaleString())
      } else {
        alert(data.error || 'Sync failed -- your entries are still saved on this phone, try again.')
      }
    } catch {
      alert('No connection -- your entries are still saved on this phone. Try syncing again once you have signal.')
    }
    setSyncing(false)
  }

  // ── No token yet: entry screen ──
  if (!token) {
    return (
      <div style={{minHeight:'100vh',background:C.cream,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:'1.75rem',maxWidth:380,width:'100%'}}>
          <div style={{fontFamily:'monospace',fontSize:'0.68rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.5rem'}}>CLEARVIEW FIELD</div>
          <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',color:C.navy,margin:'0 0 1rem'}}>Enter your access link</h1>
          <p style={{fontSize:'0.85rem',color:C.slate,lineHeight:1.6,marginBottom:'1.2rem'}}>Paste the code your coach sent you, or open this page using the link they gave you.</p>
          <input style={{width:'100%',padding:'0.75rem',border:`1px solid ${C.border}`,borderRadius:6,fontSize:'0.95rem',boxSizing:'border-box',marginBottom:'0.85rem'}}
            placeholder="Paste your access code here" value={tokenInput} onChange={e=>setTokenInput(e.target.value)}/>
          {authError && <div style={{color:C.red,fontSize:'0.82rem',marginBottom:'0.85rem'}}>{authError}</div>}
          <button style={{width:'100%',padding:'0.85rem',background:C.navy,color:C.white,border:'none',borderRadius:6,fontSize:'0.95rem',fontWeight:600,cursor:'pointer'}}
            disabled={loading || !tokenInput} onClick={()=>authenticate(tokenInput.trim())}>{loading?'Checking...':'Continue'}</button>
        </div>
      </div>
    )
  }

  if (loading && !auth) {
    return <div style={{minHeight:'100vh',background:C.cream,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Georgia,serif',color:C.navy}}>Loading...</div>
  }

  if (!auth) {
    return (
      <div style={{minHeight:'100vh',background:C.cream,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:'1.75rem',maxWidth:380,width:'100%',textAlign:'center'}}>
          <div style={{color:C.red,marginBottom:'1rem'}}>{authError || 'Could not load your data.'}</div>
          <button style={{padding:'0.7rem 1.4rem',background:C.navy,color:C.white,border:'none',borderRadius:6,cursor:'pointer'}}
            onClick={()=>token && authenticate(token)}>Try Again</button>
        </div>
      </div>
    )
  }

  const revenueLines = auth.catalogue.filter(c=>c.category==='revenue')
  const costLines = auth.catalogue.filter(c=>c.category!=='revenue')
  const queueTotal = queue.reduce((s,q)=>s + (q.transaction_type==='sale' ? q.amount : -q.amount), 0)
  const inp: React.CSSProperties = {width:'100%',padding:'0.65rem',border:`1px solid ${C.border}`,borderRadius:6,fontSize:'0.9rem',boxSizing:'border-box',marginBottom:'0.7rem'}
  const lbl: React.CSSProperties = {display:'block',fontSize:'0.78rem',fontWeight:600,color:C.navy,marginBottom:'0.25rem'}

  return (
    <div style={{minHeight:'100vh',background:C.cream,fontFamily:"'Segoe UI',system-ui,sans-serif",paddingBottom:'6rem'}}>
      <header style={{background:C.navy,padding:'1rem 1.1rem',color:C.white}}>
        <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:C.cyan}}>CLEARVIEW FIELD</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.1rem',marginTop:'0.15rem'}}>{auth.unit.name}</div>
        <div style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.6)',marginTop:'0.1rem'}}>{auth.operator.display_name} · {auth.client.name}</div>
      </header>

      <div style={{padding:'1rem'}}>
        {/* Queue summary */}
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1rem',marginBottom:'1rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'0.68rem',color:C.slate,fontFamily:'monospace'}}>PENDING TO SYNC</div>
              <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.navy}}>{queue.length} entr{queue.length===1?'y':'ies'}</div>
            </div>
            <button disabled={syncing||queue.length===0} onClick={syncNow}
              style={{padding:'0.65rem 1.1rem',background:queue.length===0?C.border:C.teal,color:C.white,border:'none',borderRadius:6,fontWeight:600,cursor:queue.length===0?'default':'pointer',fontSize:'0.85rem'}}>
              {syncing?'Syncing...':'Sync Now'}
            </button>
          </div>
          {lastSync && <div style={{fontSize:'0.72rem',color:C.slate,marginTop:'0.5rem'}}>Last synced {lastSync}</div>}
        </div>

        {/* Queued entries */}
        {queue.length>0 && (
          <div style={{marginBottom:'1rem'}}>
            {queue.map(q=>(
              <div key={q.local_id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'0.85rem',color:C.navy}}>{q.plan_line_name}</div>
                  <div style={{fontSize:'0.72rem',color:C.slate}}>{q.transaction_date} · {q.payment_method||'—'}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
                  <div style={{fontFamily:'monospace',fontWeight:700,color:q.transaction_type==='sale'?C.green:C.red}}>{q.transaction_type==='sale'?'+':'-'}{fmt(q.amount,auth.client.currency)}</div>
                  <button onClick={()=>removeFromQueue(q.local_id)} style={{background:'transparent',border:'none',color:C.red,fontSize:'1.1rem',cursor:'pointer'}}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!showForm && (
          <button onClick={()=>setShowForm(true)} style={{width:'100%',padding:'1rem',background:C.navy,color:C.white,border:'none',borderRadius:8,fontSize:'1rem',fontWeight:700,cursor:'pointer'}}>
            + Log a Sale or Cost
          </button>
        )}

        {showForm && (
          <div style={{background:C.white,border:`1px solid ${C.cyan}`,borderRadius:8,padding:'1.1rem'}}>
            <label style={lbl}>What is this for?</label>
            <select style={inp} value={form.plan_line_id} onChange={e=>setForm(f=>({...f,plan_line_id:e.target.value}))}>
              <option value="">Select...</option>
              {revenueLines.length>0 && <optgroup label="Sales">
                {revenueLines.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
              </optgroup>}
              {costLines.length>0 && <optgroup label="Costs">
                {costLines.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
              </optgroup>}
            </select>

            <label style={lbl}>Amount ({auth.client.currency})</label>
            <input type="number" inputMode="numeric" style={inp} value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0"/>

            <div style={{display:'flex',gap:'0.6rem'}}>
              <div style={{flex:1}}>
                <label style={lbl}>Quantity (optional)</label>
                <input type="number" inputMode="numeric" style={inp} value={form.quantity} onChange={e=>setForm(f=>({...f,quantity:e.target.value}))}/>
              </div>
              <div style={{flex:1}}>
                <label style={lbl}>Unit Price (optional)</label>
                <input type="number" inputMode="numeric" style={inp} value={form.unit_price} onChange={e=>setForm(f=>({...f,unit_price:e.target.value}))}/>
              </div>
            </div>

            <label style={lbl}>Payment Method</label>
            <select style={inp} value={form.payment_method} onChange={e=>setForm(f=>({...f,payment_method:e.target.value}))}>
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank">Bank Transfer</option>
              <option value="credit">Credit</option>
            </select>

            {auth.customers.length>0 && (
              <>
                <label style={lbl}>Customer (optional)</label>
                <select style={inp} value={form.customer_id} onChange={e=>setForm(f=>({...f,customer_id:e.target.value}))}>
                  <option value="">None</option>
                  {auth.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            )}

            <label style={lbl}>Date</label>
            <input type="date" style={inp} value={form.transaction_date} onChange={e=>setForm(f=>({...f,transaction_date:e.target.value}))}/>

            <label style={lbl}>Notes (optional)</label>
            <input style={inp} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>

            <div style={{display:'flex',gap:'0.6rem',marginTop:'0.5rem'}}>
              <button onClick={addToQueue} disabled={!form.plan_line_id||!form.amount}
                style={{flex:1,padding:'0.85rem',background:C.teal,color:C.white,border:'none',borderRadius:6,fontWeight:700,cursor:'pointer'}}>Add to Queue</button>
              <button onClick={()=>setShowForm(false)} style={{padding:'0.85rem 1rem',background:'transparent',color:C.slate,border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
