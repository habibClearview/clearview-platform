'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  addQueuedSale, addQueuedCost, listQueuedSales, listQueuedCosts,
  removeQueuedSale, removeQueuedCost, clearSyncedSales, clearSyncedCosts,
  setStoredToken, shouldClearQueue, type QueuedSale, type QueuedCost,
} from '@/lib/field-db'

const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B',
}

interface CatalogueItem { id:string; name:string; item_type:'product'|'service'; price:number; unit_label?:string; plan_line_id:string }
interface CostLine { id:string; name:string; category:string }
interface Customer { id:string; name:string; phone?:string; village?:string }
interface AuthData {
  operator: { id:string; display_name:string; phone?:string; role:string; sync_frequency:string }
  client: { id:string; name:string; currency:string }
  unit: { id:string; name:string }
  catalogue: CatalogueItem[]
  cost_lines: CostLine[]
  customers: Customer[]
}
// A sale queued from the catalogue: operator picked an item and a volume.
// Price is never entered by the operator -- it's the catalogue's price,
// unless they explicitly flagged a bulk override.
// QueuedSale and QueuedCost types now come from src/lib/field-db.ts (they
// include a queued_at timestamp used for IndexedDB ordering).

const STORAGE_TOKEN = 'clearview_field_token'
const STORAGE_AUTH = 'clearview_field_auth'

function fmt(n:number, cc='UGX') {
  return `${cc} ${Math.round(n).toLocaleString()}`
}

export default function FieldCapturePage() {
  const [tokenInput, setTokenInput] = useState('')
  const [token, setToken] = useState<string|null>(null)
  const [auth, setAuth] = useState<AuthData|null>(null)
  const [salesQueue, setSalesQueue] = useState<QueuedSale[]>([])
  const [costsQueue, setCostsQueue] = useState<QueuedCost[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string|null>(null)
  const [lastSync, setLastSync] = useState<string|null>(null)
  const [mode, setMode] = useState<'grid'|'sale-detail'|'cost-form'>('grid')
  const [selectedItem, setSelectedItem] = useState<CatalogueItem|null>(null)
  const [saleForm, setSaleForm] = useState({quantity:'', payment_method:'cash', customer_id:'', notes:'', override:false, override_price:''})
  const [costForm, setCostForm] = useState({plan_line_id:'', amount:'', notes:''})
  const syncNowRef = useRef<()=>void>(()=>{})

  useEffect(()=>{
    const urlToken = new URLSearchParams(window.location.search).get('token')
    const savedToken = urlToken || localStorage.getItem(STORAGE_TOKEN)
    const savedAuth = localStorage.getItem(STORAGE_AUTH)
    // Queue now lives in IndexedDB, not localStorage -- larger capacity,
    // reliable on iOS Safari (which clears localStorage aggressively), and
    // readable by the Service Worker for Background Sync (see below).
    listQueuedSales().then(setSalesQueue).catch(()=>{})
    listQueuedCosts().then(setCostsQueue).catch(()=>{})
    if (savedToken) {
      setToken(savedToken)
      if (urlToken) localStorage.setItem(STORAGE_TOKEN, urlToken)
      if (savedAuth) { try { setAuth(JSON.parse(savedAuth)) } catch {} }
      authenticate(savedToken)
    } else {
      setLoading(false)
    }

    // Register the Service Worker for offline app-shell loading and
    // Background Sync. Not all browsers support this (notably iOS Safari
    // lacks the Background Sync API) -- the manual "Sync Now" button and
    // the online-event listener below remain the fallback regardless.
    if ('serviceWorker' in navigator) {
      // Explicit scope: /field-sw.js is served from the site root, which
      // would otherwise give it a default scope covering the ENTIRE app
      // (including the coach/CEO financial dashboard). Scoping it to
      // /field means it only ever affects this page.
      navigator.serviceWorker.register('/field-sw.js', { scope: '/field' }).catch(()=>{})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  // Separate effect (with proper cleanup) for the Service Worker message
  // listener -- if this component ever unmounts and remounts (client-side
  // navigation away and back), an uncleaned listener would accumulate and
  // a single background sync would fire "Synced automatically" more than once.
  useEffect(()=>{
    if (!('serviceWorker' in navigator)) return
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'field-sync-complete') {
        listQueuedSales().then(setSalesQueue).catch(()=>{})
        listQueuedCosts().then(setCostsQueue).catch(()=>{})
        setLastSync(new Date(event.data.synced_at).toLocaleString())
        setSyncMsg('Synced automatically in the background.')
      }
    }
    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  },[])

  // Fallback for browsers without Background Sync support: try syncing
  // automatically the moment the device comes back online, in addition to
  // the manual button.
  useEffect(()=>{
    function handleOnline() { syncNowRef.current() }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
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
      // Service Workers can't read localStorage -- mirror the token into
      // IndexedDB so the Background Sync handler in public/field-sw.js can
      // authenticate a sync that happens while this tab is closed.
      setStoredToken(t).catch(()=>{})
    } catch {
      setAuthError('No connection right now. If you have used this link before on this phone, your data is still saved -- try again once you have signal.')
    }
    setLoading(false)
  }, [])

  const SYNC_TAG = 'clearview-field-sync'
  function requestBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready
        .then((reg: any) => reg.sync.register(SYNC_TAG))
        .catch(()=>{}) // Background Sync unsupported (e.g. iOS Safari) -- manual/online-event sync remains the fallback.
    }
  }

  function openSaleDetail(item: CatalogueItem) {
    setSelectedItem(item)
    setSaleForm({quantity:'', payment_method:'cash', customer_id:'', notes:'', override:false, override_price:String(item.price)})
    setMode('sale-detail')
  }

  async function addSaleToQueue() {
    if (!selectedItem || !saleForm.quantity || Number(saleForm.quantity)<=0) return
    const tx: Omit<QueuedSale,'queued_at'> = {
      local_id: `local_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      catalogue_item_id: selectedItem.id, item_name: selectedItem.name, item_type: selectedItem.item_type,
      standard_price: selectedItem.price,
      quantity: Number(saleForm.quantity),
      override_price: saleForm.override ? Number(saleForm.override_price) : undefined,
      payment_method: saleForm.payment_method || undefined,
      customer_id: saleForm.customer_id || undefined,
      transaction_date: new Date().toISOString().split('T')[0],
      notes: saleForm.notes || undefined,
    }
    await addQueuedSale(tx)
    setSalesQueue(await listQueuedSales())
    requestBackgroundSync()
    setMode('grid')
    setSelectedItem(null)
  }

  async function addCostToQueue() {
    const line = auth?.cost_lines.find(l=>l.id===costForm.plan_line_id)
    if (!line || !costForm.amount) return
    const tx: Omit<QueuedCost,'queued_at'> = {
      local_id: `local_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      plan_line_id: line.id, plan_line_name: line.name,
      amount: Number(costForm.amount),
      transaction_date: new Date().toISOString().split('T')[0],
      notes: costForm.notes || undefined,
    }
    await addQueuedCost(tx)
    setCostsQueue(await listQueuedCosts())
    requestBackgroundSync()
    setCostForm({plan_line_id:'', amount:'', notes:''})
    setMode('grid')
  }

  async function removeSale(localId:string) { await removeQueuedSale(localId); setSalesQueue(await listQueuedSales()) }
  async function removeCost(localId:string) { await removeQueuedCost(localId); setCostsQueue(await listQueuedCosts()) }

  async function syncNow() {
    if (!token || (salesQueue.length===0 && costsQueue.length===0)) return
    setSyncing(true)
    setSyncMsg(null)
    // Snapshot exactly which local_ids are being synced -- if a new item
    // gets queued mid-request, only the ones actually sent get cleared.
    const salesSnapshot = salesQueue
    const costsSnapshot = costsQueue
    try {
      const deviceId = localStorage.getItem('clearview_device_id') || (()=>{ const id = Math.random().toString(36).slice(2,10); localStorage.setItem('clearview_device_id', id); return id })()
      const transactions = [
        ...salesSnapshot.map(s=>({
          local_id: s.local_id,
          catalogue_item_id: s.catalogue_item_id, quantity: s.quantity,
          override_price: s.override_price, payment_method: s.payment_method,
          customer_id: s.customer_id, transaction_date: s.transaction_date, notes: s.notes,
        })),
        ...costsSnapshot.map(c=>({
          local_id: c.local_id,
          plan_line_id: c.plan_line_id, plan_line_name: c.plan_line_name,
          transaction_type: 'expense', category: 'direct_opex', amount: c.amount,
          transaction_date: c.transaction_date, notes: c.notes,
        })),
      ]
      const res = await fetch('/api/field/sync', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token, device_id: 'web_'+deviceId, transactions }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        // Only clear the queue when the server reported zero errors. A
        // response can be success:true with a populated errors array (e.g.
        // one bad catalogue_item_id in the batch) -- clearing everything in
        // that case would silently delete entries the server never actually
        // saved. Since every row now carries a stable local_id and the
        // server dedupes on it, it's always safe to leave the queue intact
        // and retry the whole batch next time; already-saved rows are
        // silently skipped, not duplicated.
        if (shouldClearQueue(data)) {
          await clearSyncedSales(salesSnapshot.map(s=>s.local_id))
          await clearSyncedCosts(costsSnapshot.map(c=>c.local_id))
          setSalesQueue(await listQueuedSales())
          setCostsQueue(await listQueuedCosts())
        }
        setLastSync(new Date().toLocaleString())
        setSyncMsg(
          data.errors?.length ? `Some entries need attention and were not cleared: ${data.errors.join('; ')}`
          : data.price_alerts?.length ? `Synced, but flagged: ${data.price_alerts.join('; ')}`
          : 'Synced successfully.'
        )
      } else {
        setSyncMsg(data.error || 'Sync failed -- your entries are still saved on this phone, try again.')
      }
    } catch {
      setSyncMsg('No connection -- your entries are still saved on this phone. Try syncing again once you have signal.')
    }
    setSyncing(false)
  }

  useEffect(()=>{ syncNowRef.current = syncNow })

  if (!token) {
    return (
      <div style={{minHeight:'100vh',background:C.cream,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:'1.75rem',maxWidth:380,width:'100%'}}>
          <div style={{fontFamily:'monospace',fontSize:'0.68rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.5rem'}}>CLEARVIEW FIELD</div>
          <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',color:C.navy,margin:'0 0 1rem'}}>Enter your access link</h1>
          <p style={{fontSize:'0.85rem',color:C.slate,lineHeight:1.6,marginBottom:'1.2rem'}}>Paste the code you were given, or open this page using the link directly.</p>
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

  const inp: React.CSSProperties = {width:'100%',padding:'0.65rem',border:`1px solid ${C.border}`,borderRadius:6,fontSize:'0.9rem',boxSizing:'border-box',marginBottom:'0.7rem'}
  const lbl: React.CSSProperties = {display:'block',fontSize:'0.78rem',fontWeight:600,color:C.navy,marginBottom:'0.25rem'}
  const pendingCount = salesQueue.length + costsQueue.length
  const products = auth.catalogue.filter(c=>c.item_type==='product')
  const services = auth.catalogue.filter(c=>c.item_type==='service')

  return (
    <div style={{minHeight:'100vh',background:C.cream,fontFamily:"'Segoe UI',system-ui,sans-serif",paddingBottom:'2rem'}}>
      <header style={{background:C.navy,padding:'1rem 1.1rem',color:C.white}}>
        <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:C.cyan}}>CLEARVIEW FIELD</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.1rem',marginTop:'0.15rem'}}>{auth.unit.name}</div>
        <div style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.6)',marginTop:'0.1rem'}}>{auth.operator.display_name} · {auth.client.name}</div>
      </header>

      <div style={{padding:'1rem'}}>
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1rem',marginBottom:'1rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'0.68rem',color:C.slate,fontFamily:'monospace'}}>PENDING TO SYNC</div>
              <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.navy}}>{pendingCount} entr{pendingCount===1?'y':'ies'}</div>
            </div>
            <button disabled={syncing||pendingCount===0} onClick={syncNow}
              style={{padding:'0.65rem 1.1rem',background:pendingCount===0?C.border:C.teal,color:C.white,border:'none',borderRadius:6,fontWeight:600,cursor:pendingCount===0?'default':'pointer',fontSize:'0.85rem'}}>
              {syncing?'Syncing...':'Sync Now'}
            </button>
          </div>
          {lastSync && <div style={{fontSize:'0.72rem',color:C.slate,marginTop:'0.5rem'}}>Last synced {lastSync}</div>}
          {syncMsg && <div style={{fontSize:'0.75rem',color:syncMsg.startsWith('Synced')?C.green:C.red,marginTop:'0.4rem'}}>{syncMsg}</div>}
        </div>

        {pendingCount>0 && (
          <div style={{marginBottom:'1rem'}}>
            {salesQueue.map(q=>(
              <div key={q.local_id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'0.85rem',color:C.navy}}>{q.item_name}</div>
                  <div style={{fontSize:'0.72rem',color:C.slate}}>{q.quantity} {q.override_price?'(price overridden)':`× ${fmt(q.standard_price,auth.client.currency)}`}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
                  <div style={{fontFamily:'monospace',fontWeight:700,color:C.green}}>+{fmt(q.quantity*(q.override_price??q.standard_price),auth.client.currency)}</div>
                  <button onClick={()=>removeSale(q.local_id)} style={{background:'transparent',border:'none',color:C.red,fontSize:'1.1rem',cursor:'pointer'}}>×</button>
                </div>
              </div>
            ))}
            {costsQueue.map(q=>(
              <div key={q.local_id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:600,fontSize:'0.85rem',color:C.navy}}>{q.plan_line_name}</div>
                  <div style={{fontSize:'0.72rem',color:C.slate}}>{q.transaction_date}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
                  <div style={{fontFamily:'monospace',fontWeight:700,color:C.red}}>-{fmt(q.amount,auth.client.currency)}</div>
                  <button onClick={()=>removeCost(q.local_id)} style={{background:'transparent',border:'none',color:C.red,fontSize:'1.1rem',cursor:'pointer'}}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {mode==='grid' && (
          <>
            {products.length>0 && <>
              <div style={{fontSize:'0.72rem',fontFamily:'monospace',color:C.slate,marginBottom:'0.5rem',marginTop:'0.5rem'}}>PRODUCTS</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem',marginBottom:'1rem'}}>
                {products.map(item=>(
                  <button key={item.id} onClick={()=>openSaleDetail(item)}
                    style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1rem 0.75rem',textAlign:'left',cursor:'pointer'}}>
                    <div style={{fontWeight:700,fontSize:'0.85rem',color:C.navy}}>{item.name}</div>
                    <div style={{fontSize:'0.75rem',color:C.slate,marginTop:'0.2rem'}}>{fmt(item.price,auth.client.currency)}{item.unit_label?` / ${item.unit_label}`:''}</div>
                  </button>
                ))}
              </div>
            </>}
            {services.length>0 && <>
              <div style={{fontSize:'0.72rem',fontFamily:'monospace',color:C.slate,marginBottom:'0.5rem'}}>SERVICES</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem',marginBottom:'1rem'}}>
                {services.map(item=>(
                  <button key={item.id} onClick={()=>openSaleDetail(item)}
                    style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1rem 0.75rem',textAlign:'left',cursor:'pointer'}}>
                    <div style={{fontWeight:700,fontSize:'0.85rem',color:C.navy}}>{item.name}</div>
                    <div style={{fontSize:'0.75rem',color:C.slate,marginTop:'0.2rem'}}>{fmt(item.price,auth.client.currency)}{item.unit_label?` / ${item.unit_label}`:''}</div>
                  </button>
                ))}
              </div>
            </>}
            {products.length===0 && services.length===0 && (
              <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.2rem',textAlign:'center',color:C.slate,fontSize:'0.85rem',marginBottom:'1rem'}}>
                No products or services set up for this unit yet. Ask your CEO or Finance Manager to add them to the Catalogue.
              </div>
            )}
            {auth.cost_lines.length>0 && (
              <button onClick={()=>setMode('cost-form')} style={{width:'100%',padding:'0.85rem',background:'transparent',color:C.navy,border:`1px solid ${C.navy}`,borderRadius:8,fontSize:'0.9rem',fontWeight:600,cursor:'pointer'}}>
                + Record a Cost or Expense
              </button>
            )}
          </>
        )}

        {mode==='sale-detail' && selectedItem && (
          <div style={{background:C.white,border:`1px solid ${C.cyan}`,borderRadius:8,padding:'1.1rem'}}>
            <div style={{fontWeight:700,fontSize:'1rem',color:C.navy,marginBottom:'0.2rem'}}>{selectedItem.name}</div>
            <div style={{fontSize:'0.8rem',color:C.slate,marginBottom:'0.9rem'}}>Standard price: {fmt(selectedItem.price,auth.client.currency)}{selectedItem.unit_label?` / ${selectedItem.unit_label}`:''}</div>

            <label style={lbl}>Volume {selectedItem.unit_label?`(${selectedItem.unit_label})`:'sold'}</label>
            <input type="number" inputMode="numeric" style={inp} value={saleForm.quantity} onChange={e=>setSaleForm(f=>({...f,quantity:e.target.value}))} placeholder="0" autoFocus/>

            {saleForm.quantity && Number(saleForm.quantity)>0 && (
              <div style={{background:'#F0F4F8',borderRadius:6,padding:'0.6rem 0.8rem',marginBottom:'0.7rem',fontSize:'0.85rem',color:C.navy}}>
                Total: <span style={{fontWeight:700}}>{fmt(Number(saleForm.quantity)*(saleForm.override?Number(saleForm.override_price||0):selectedItem.price),auth.client.currency)}</span>
              </div>
            )}

            <label style={{display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.8rem',color:C.slate,marginBottom:'0.7rem',cursor:'pointer'}}>
              <input type="checkbox" checked={saleForm.override} onChange={e=>setSaleForm(f=>({...f,override:e.target.checked}))}/>
              This was a bulk sale at a different price
            </label>
            {saleForm.override && (
              <>
                <label style={lbl}>Actual Price Used</label>
                <input type="number" inputMode="numeric" style={inp} value={saleForm.override_price} onChange={e=>setSaleForm(f=>({...f,override_price:e.target.value}))}/>
              </>
            )}

            <label style={lbl}>Payment Method</label>
            <select style={inp} value={saleForm.payment_method} onChange={e=>setSaleForm(f=>({...f,payment_method:e.target.value}))}>
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank">Bank Transfer</option>
              <option value="credit">Credit</option>
            </select>

            {auth.customers.length>0 && (
              <>
                <label style={lbl}>Customer (optional)</label>
                <select style={inp} value={saleForm.customer_id} onChange={e=>setSaleForm(f=>({...f,customer_id:e.target.value}))}>
                  <option value="">None</option>
                  {auth.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            )}

            <label style={lbl}>Notes (optional)</label>
            <input style={inp} value={saleForm.notes} onChange={e=>setSaleForm(f=>({...f,notes:e.target.value}))}/>

            <div style={{display:'flex',gap:'0.6rem',marginTop:'0.5rem'}}>
              <button onClick={addSaleToQueue} disabled={!saleForm.quantity||Number(saleForm.quantity)<=0}
                style={{flex:1,padding:'0.85rem',background:C.teal,color:C.white,border:'none',borderRadius:6,fontWeight:700,cursor:'pointer'}}>Add to Queue</button>
              <button onClick={()=>{setMode('grid');setSelectedItem(null)}} style={{padding:'0.85rem 1rem',background:'transparent',color:C.slate,border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        )}

        {mode==='cost-form' && (
          <div style={{background:C.white,border:`1px solid ${C.cyan}`,borderRadius:8,padding:'1.1rem'}}>
            <label style={lbl}>What is this for?</label>
            <select style={inp} value={costForm.plan_line_id} onChange={e=>setCostForm(f=>({...f,plan_line_id:e.target.value}))}>
              <option value="">Select...</option>
              {auth.cost_lines.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <label style={lbl}>Amount ({auth.client.currency})</label>
            <input type="number" inputMode="numeric" style={inp} value={costForm.amount} onChange={e=>setCostForm(f=>({...f,amount:e.target.value}))} placeholder="0"/>
            <label style={lbl}>Notes (optional)</label>
            <input style={inp} value={costForm.notes} onChange={e=>setCostForm(f=>({...f,notes:e.target.value}))}/>
            <div style={{display:'flex',gap:'0.6rem',marginTop:'0.5rem'}}>
              <button onClick={addCostToQueue} disabled={!costForm.plan_line_id||!costForm.amount}
                style={{flex:1,padding:'0.85rem',background:C.teal,color:C.white,border:'none',borderRadius:6,fontWeight:700,cursor:'pointer'}}>Add to Queue</button>
              <button onClick={()=>setMode('grid')} style={{padding:'0.85rem 1rem',background:'transparent',color:C.slate,border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
