'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  addQueuedSale, addQueuedCost, addQueuedUncategorizedCost,
  listQueuedSales, listQueuedCosts, listQueuedUncategorizedCosts,
  removeQueuedSale, removeQueuedCost, removeQueuedUncategorizedCost,
  clearSyncedSales, clearSyncedCosts, clearSyncedUncategorizedCosts,
  setStoredToken, type QueuedSale, type QueuedCost, type QueuedUncategorizedCost,
} from '@/lib/field-db'
import BuildStamp from '@/components/BuildStamp'

const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B',
}

interface CatalogueItem { id:string; name:string; item_type:'product'|'service'; price:number; unit_label?:string; plan_line_id:string }
interface CostLine { id:string; name:string; category:string }
interface Customer { id:string; name:string; phone?:string; village?:string }
interface HistoryEntry {
  id:string; transaction_type:string; category:string; plan_line_name:string;
  amount:number; quantity?:number; unit_price?:number; unit_label?:string; transaction_date:string;
  synced_at:string; notes?:string; price_alert?:boolean;
}
interface StockLevel {
  id:string; catalogue_item_id:string; quantity_on_hand:number; reorder_threshold?:number;
  catalogue?: { name:string; unit_label?:string }
}
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
  const [uncategorizedCostsQueue, setUncategorizedCostsQueue] = useState<QueuedUncategorizedCost[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string|null>(null)
  const [lastSync, setLastSync] = useState<string|null>(null)
  const [mode, setMode] = useState<'grid'|'sale-detail'|'cost-form'|'history'|'stock'>('grid')
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [stockError, setStockError] = useState('')
  const [receivingItemId, setReceivingItemId] = useState<string|null>(null)
  const [receiveQty, setReceiveQty] = useState('')
  const [receiving, setReceiving] = useState(false)
  const [selectedItem, setSelectedItem] = useState<CatalogueItem|null>(null)
  const [saleForm, setSaleForm] = useState({quantity:'', payment_method:'cash', customer_id:'', notes:'', override:false, override_price:''})
  const [costForm, setCostForm] = useState({plan_line_id:'', amount:'', notes:'', description:''})
  const [search, setSearch] = useState('')
  const [queueOpen, setQueueOpen] = useState(false)
  const [editingSaleId, setEditingSaleId] = useState<string|null>(null)
  const [editingCostId, setEditingCostId] = useState<string|null>(null)
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
    listQueuedUncategorizedCosts().then(setUncategorizedCostsQueue).catch(()=>{})
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
        listQueuedUncategorizedCosts().then(setUncategorizedCostsQueue).catch(()=>{})
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
    setEditingSaleId(null)
    setSaleForm({quantity:'', payment_method:'cash', customer_id:'', notes:'', override:false, override_price:String(item.price)})
    setMode('sale-detail')
  }

  function openSaleEdit(q: QueuedSale) {
    const item = auth?.catalogue.find(c=>c.id===q.catalogue_item_id)
    if (!item) {
      alert(`"${q.item_name}" is no longer in the catalogue, so this entry can't be edited. You can still remove it if needed.`)
      return
    }
    setSelectedItem(item)
    setEditingSaleId(q.local_id)
    setSaleForm({
      quantity: String(q.quantity), payment_method: q.payment_method||'cash',
      customer_id: q.customer_id||'', notes: q.notes||'',
      override: q.override_price!==undefined, override_price: String(q.override_price ?? item.price),
    })
    setMode('sale-detail')
  }

  function openCostEdit(q: QueuedCost) {
    setEditingCostId(q.local_id)
    setCostForm({plan_line_id: q.plan_line_id, amount: String(q.amount), notes: q.notes||'', description:''})
    setMode('cost-form')
  }

  async function addSaleToQueue() {
    if (!selectedItem || !saleForm.quantity || Number(saleForm.quantity)<=0) return
    if (editingSaleId) await removeQueuedSale(editingSaleId)
    const tx: Omit<QueuedSale,'queued_at'> = {
      local_id: editingSaleId || `local_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      catalogue_item_id: selectedItem.id, item_name: selectedItem.name, item_type: selectedItem.item_type,
      unit_label: selectedItem.unit_label,
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
    setEditingSaleId(null)
  }

  async function addCostToQueue() {
    const line = auth?.cost_lines.find(l=>l.id===costForm.plan_line_id)
    if (!line || !costForm.amount) return
    if (editingCostId) await removeQueuedCost(editingCostId)
    const tx: Omit<QueuedCost,'queued_at'> = {
      local_id: editingCostId || `local_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      plan_line_id: line.id, plan_line_name: line.name,
      amount: Number(costForm.amount),
      transaction_date: new Date().toISOString().split('T')[0],
      notes: costForm.notes || undefined,
    }
    await addQueuedCost(tx)
    setCostsQueue(await listQueuedCosts())
    requestBackgroundSync()
    setCostForm({plan_line_id:'', amount:'', notes:'', description:''})
    setMode('grid')
    setEditingCostId(null)
  }

  // A cost that doesn't match any existing cost line -- recorded with
  // just a description and amount, categorization delegated to a coach
  // reviewing it later on the dashboard.
  async function addUncategorizedCostToQueue() {
    if (!costForm.description || !costForm.amount) return
    const tx: Omit<QueuedUncategorizedCost,'queued_at'> = {
      local_id: `local_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      description: costForm.description,
      amount: Number(costForm.amount),
      transaction_date: new Date().toISOString().split('T')[0],
    }
    await addQueuedUncategorizedCost(tx)
    setUncategorizedCostsQueue(await listQueuedUncategorizedCosts())
    requestBackgroundSync()
    setCostForm({plan_line_id:'', amount:'', notes:'', description:''})
    setMode('grid')
  }

  async function removeSale(localId:string) { await removeQueuedSale(localId); setSalesQueue(await listQueuedSales()) }
  async function removeCost(localId:string) { await removeQueuedCost(localId); setCostsQueue(await listQueuedCosts()) }
  async function removeUncategorizedCost(localId:string) { await removeQueuedUncategorizedCost(localId); setUncategorizedCostsQueue(await listQueuedUncategorizedCosts()) }

  async function syncNow() {
    if (!token || (salesQueue.length===0 && costsQueue.length===0 && uncategorizedCostsQueue.length===0)) return
    setSyncing(true)
    setSyncMsg(null)
    // Snapshot exactly which local_ids are being synced -- if a new item
    // gets queued mid-request, only the ones actually sent get cleared.
    const salesSnapshot = salesQueue
    const costsSnapshot = costsQueue
    const uncategorizedSnapshot = uncategorizedCostsQueue
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
      const uncategorized_costs = uncategorizedSnapshot.map(u=>({
        local_id: u.local_id, description: u.description, amount: u.amount, transaction_date: u.transaction_date,
      }))
      const res = await fetch('/api/field/sync', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token, device_id: 'web_'+deviceId, transactions, uncategorized_costs }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        // Clear ONLY the entries the server confirms it actually synced
        // (data.synced_local_ids), not an all-or-nothing decision for the
        // whole batch. A single permanently bad entry -- e.g. a queued
        // sale referencing a catalogue item that's since moved to a
        // different business unit -- will fail validation on every retry
        // forever, and previously that meant every OTHER entry in the same
        // batch stayed stuck in the queue too, since nothing would ever
        // clear until the whole batch had zero errors. Now the entries
        // that succeeded are removed immediately; only the genuinely bad
        // ones remain, for the operator to notice and deal with.
        const syncedIds = new Set<string>(data.synced_local_ids || [])
        const salesToClear = salesSnapshot.map(s=>s.local_id).filter(id => syncedIds.has(id))
        const costsToClear = costsSnapshot.map(c=>c.local_id).filter(id => syncedIds.has(id))
        const uncategorizedToClear = uncategorizedSnapshot.map(u=>u.local_id).filter(id => syncedIds.has(id))
        if (salesToClear.length > 0) await clearSyncedSales(salesToClear)
        if (costsToClear.length > 0) await clearSyncedCosts(costsToClear)
        if (uncategorizedToClear.length > 0) await clearSyncedUncategorizedCosts(uncategorizedToClear)
        if (salesToClear.length > 0 || costsToClear.length > 0 || uncategorizedToClear.length > 0) {
          setSalesQueue(await listQueuedSales())
          setCostsQueue(await listQueuedCosts())
          setUncategorizedCostsQueue(await listQueuedUncategorizedCosts())
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

  async function loadHistory() {
    if (!token) return
    setMode('history')
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const res = await fetch(`/api/field/history?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) setHistoryEntries(data.transactions || [])
      else setHistoryError(data.error || 'Could not load your transaction history.')
    } catch {
      setHistoryError('No connection -- try again once you have signal.')
    }
    setHistoryLoading(false)
  }

  async function loadStock() {
    if (!token) return
    setMode('stock')
    setStockLoading(true)
    setStockError('')
    try {
      const res = await fetch(`/api/field/stock`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) setStockLevels(data.stockLevels || [])
      else setStockError(data.error || 'Could not load stock levels.')
    } catch {
      setStockError('No connection -- try again once you have signal.')
    }
    setStockLoading(false)
  }

  async function receiveStock(catalogueItemId: string) {
    if (!token || !receiveQty || Number(receiveQty) <= 0) return
    setReceiving(true)
    try {
      const res = await fetch('/api/field/stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, catalogue_item_id: catalogueItemId, movement_type: 'stock_in', quantity: Number(receiveQty) }),
      })
      const data = await res.json()
      if (res.ok) {
        setReceivingItemId(null)
        setReceiveQty('')
        await loadStock()
      } else {
        alert(data.error || 'Could not record stock received.')
      }
    } catch {
      alert('No connection -- could not record stock received. Please try again.')
    }
    setReceiving(false)
  }

  useEffect(()=>{ syncNowRef.current = syncNow })

  if (!token) {
    return (
      <div style={{minHeight:'100vh',background:C.cream,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
        <BuildStamp/>
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
  const pendingCount = salesQueue.length + costsQueue.length + uncategorizedCostsQueue.length
  const searchLower = search.trim().toLowerCase()
  const products = auth.catalogue.filter(c=>c.item_type==='product' && (!searchLower || c.name.toLowerCase().includes(searchLower)))
  const services = auth.catalogue.filter(c=>c.item_type==='service' && (!searchLower || c.name.toLowerCase().includes(searchLower)))

  return (
    <div style={{minHeight:'100vh',background:C.cream,fontFamily:"'Segoe UI',system-ui,sans-serif",paddingBottom:'2rem'}}>
      <BuildStamp/>
      <header style={{background:C.navy,padding:'1rem 1.1rem',color:C.white,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontFamily:'monospace',fontSize:'0.62rem',letterSpacing:'0.12em',color:C.cyan}}>CLEARVIEW FIELD</div>
          <div style={{fontFamily:'Georgia,serif',fontSize:'1.1rem',marginTop:'0.15rem'}}>{auth.unit.name}</div>
          <div style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.6)',marginTop:'0.1rem'}}>{auth.operator.display_name} · {auth.client.name}</div>
        </div>
        {(mode==='grid' || mode==='history' || mode==='stock') && (
          <div style={{display:'flex',gap:'0.5rem'}}>
            {mode==='grid' && (
              <button onClick={loadStock}
                style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.25)',color:C.white,borderRadius:6,padding:'0.5rem 0.75rem',fontSize:'0.72rem',cursor:'pointer',whiteSpace:'nowrap'}}>
                Stock
              </button>
            )}
            <button onClick={mode==='grid'?loadHistory:()=>setMode('grid')}
              style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.25)',color:C.white,borderRadius:6,padding:'0.5rem 0.75rem',fontSize:'0.72rem',cursor:'pointer',whiteSpace:'nowrap'}}>
              {mode==='grid'?'History':'← Back'}
            </button>
          </div>
        )}
      </header>

      <div style={{padding:'1rem'}}>
        {/* Compact sync bar -- kept short so it never pushes the product grid down */}
        <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'0.75rem 1rem',marginBottom:'0.85rem',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.6rem'}}>
          <button onClick={()=>setQueueOpen(o=>!o)} style={{background:'none',border:'none',padding:0,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:'0.6rem'}}>
            <span aria-hidden="true" style={{width:12,height:12,borderRadius:'50%',flexShrink:0,background:pendingCount===0?C.green:C.amber,boxShadow:`0 0 0 4px ${pendingCount===0?'#E4F5EC':'#FBF0D8'}`}}/>
            <span>
              <div style={{fontSize:'0.65rem',color:C.slate,fontFamily:'monospace'}}>{pendingCount===0?'ALL SAVED & SENT':'WAITING TO SEND'} {queueOpen?'▾':'▸'}</div>
              <div style={{fontFamily:'Georgia,serif',fontSize:'1.1rem',fontWeight:700,color:pendingCount===0?C.green:C.navy}}>{pendingCount===0?'Up to date':`${pendingCount} entr${pendingCount===1?'y':'ies'}`}</div>
            </span>
          </button>
          <button disabled={syncing||pendingCount===0} onClick={syncNow}
            style={{padding:'0.6rem 1rem',background:pendingCount===0?C.border:C.teal,color:C.white,border:'none',borderRadius:6,fontWeight:600,cursor:pendingCount===0?'default':'pointer',fontSize:'0.82rem',whiteSpace:'nowrap'}}>
            {syncing?'Syncing...':'Sync Now'}
          </button>
        </div>
        {(lastSync || syncMsg) && (
          <div style={{marginBottom:'0.85rem',fontSize:'0.75rem'}}>
            {lastSync && <div style={{color:C.slate}}>Last synced {lastSync}</div>}
            {syncMsg && <div style={{color:syncMsg.startsWith('Synced')?C.green:C.red,marginTop:'0.2rem'}}>{syncMsg}</div>}
          </div>
        )}

        {mode==='grid' && (
          <>
            {/* Search -- always visible, right above the products it filters */}
            <input
              style={{...inp,marginBottom:'0.85rem',fontSize:'0.95rem',padding:'0.75rem'}}
              placeholder="🔍 Search products or services..."
              aria-label="Search products or services"
              value={search} onChange={e=>setSearch(e.target.value)}
            />

            {products.length>0 && <>
              <div style={{fontSize:'0.72rem',fontFamily:'monospace',color:C.slate,marginBottom:'0.5rem'}}>📦 PRODUCTS</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem',marginBottom:'1rem'}}>
                {products.map(item=>(
                  <button key={item.id} onClick={()=>openSaleDetail(item)}
                    style={{background:C.white,border:`1px solid ${C.border}`,borderTop:`4px solid ${C.teal}`,borderRadius:10,padding:'0.95rem 0.8rem',textAlign:'left',cursor:'pointer',minHeight:'90px',display:'flex',flexDirection:'column',gap:'0.28rem'}}>
                    <div style={{fontSize:'1.5rem',lineHeight:1}} aria-hidden="true">📦</div>
                    <div style={{fontWeight:700,fontSize:'0.9rem',color:C.navy,lineHeight:1.2}}>{item.name}</div>
                    <div style={{fontSize:'0.78rem',color:C.slate,fontWeight:600}}>{fmt(item.price,auth.client.currency)}{item.unit_label?` / ${item.unit_label}`:''}</div>
                  </button>
                ))}
              </div>
            </>}
            {services.length>0 && <>
              <div style={{fontSize:'0.72rem',fontFamily:'monospace',color:C.slate,marginBottom:'0.5rem'}}>🛠️ SERVICES</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem',marginBottom:'1rem'}}>
                {services.map(item=>(
                  <button key={item.id} onClick={()=>openSaleDetail(item)}
                    style={{background:C.white,border:`1px solid ${C.border}`,borderTop:`4px solid ${C.cyan}`,borderRadius:10,padding:'0.95rem 0.8rem',textAlign:'left',cursor:'pointer',minHeight:'90px',display:'flex',flexDirection:'column',gap:'0.28rem'}}>
                    <div style={{fontSize:'1.5rem',lineHeight:1}} aria-hidden="true">🛠️</div>
                    <div style={{fontWeight:700,fontSize:'0.9rem',color:C.navy,lineHeight:1.2}}>{item.name}</div>
                    <div style={{fontSize:'0.78rem',color:C.slate,fontWeight:600}}>{fmt(item.price,auth.client.currency)}{item.unit_label?` / ${item.unit_label}`:''}</div>
                  </button>
                ))}
              </div>
            </>}
            {products.length===0 && services.length===0 && searchLower && (
              <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.2rem',textAlign:'center',color:C.slate,fontSize:'0.85rem',marginBottom:'1rem'}}>
                No products or services match "{search}".
              </div>
            )}
            {products.length===0 && services.length===0 && !searchLower && (
              <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.2rem',textAlign:'center',color:C.slate,fontSize:'0.85rem',marginBottom:'1rem'}}>
                No products or services set up for this unit yet. Ask your CEO or Finance Manager to add them to the Catalogue.
              </div>
            )}
            {auth.cost_lines.length>0 && (
              <button onClick={()=>{setEditingCostId(null);setCostForm({plan_line_id:'',amount:'',notes:'',description:''});setMode('cost-form')}}
                style={{width:'100%',padding:'0.85rem',background:'#FDF2F0',color:C.red,border:`1px solid ${C.red}`,borderRadius:8,fontSize:'0.9rem',fontWeight:600,cursor:'pointer',marginBottom:'1.25rem'}}>
                − Record a Cost or Expense
              </button>
            )}

            {/* Queue: collapsed by default so it never buries the products above it.
                Tap the sync bar's chevron to expand and review/edit/remove entries. */}
            {queueOpen && pendingCount>0 && (
              <div style={{marginBottom:'1rem'}}>
                <div style={{fontSize:'0.72rem',fontFamily:'monospace',color:C.slate,marginBottom:'0.5rem'}}>QUEUED ENTRIES</div>
                {salesQueue.map(q=>(
                  <div key={q.local_id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.5rem'}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:'0.85rem',color:C.navy,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.item_name}</div>
                      <div style={{fontSize:'0.72rem',color:C.slate}}>{q.quantity}{q.unit_label?` ${q.unit_label}`:''} {q.override_price?'(price overridden)':`× ${fmt(q.standard_price,auth.client.currency)}`}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexShrink:0}}>
                      <div style={{fontFamily:'monospace',fontWeight:700,color:C.green,whiteSpace:'nowrap'}}>+{fmt(q.quantity*(q.override_price??q.standard_price),auth.client.currency)}</div>
                      <button onClick={()=>openSaleEdit(q)} style={{background:'transparent',border:'none',color:C.teal,fontSize:'0.78rem',cursor:'pointer',fontWeight:600}}>Edit</button>
                      <button onClick={()=>removeSale(q.local_id)} style={{background:'transparent',border:'none',color:C.red,fontSize:'1.1rem',cursor:'pointer'}}>×</button>
                    </div>
                  </div>
                ))}
                {costsQueue.map(q=>(
                  <div key={q.local_id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:6,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.5rem'}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:'0.85rem',color:C.navy,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.plan_line_name}</div>
                      <div style={{fontSize:'0.72rem',color:C.slate}}>{q.transaction_date}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexShrink:0}}>
                      <div style={{fontFamily:'monospace',fontWeight:700,color:C.red,whiteSpace:'nowrap'}}>-{fmt(q.amount,auth.client.currency)}</div>
                      <button onClick={()=>openCostEdit(q)} style={{background:'transparent',border:'none',color:C.teal,fontSize:'0.78rem',cursor:'pointer',fontWeight:600}}>Edit</button>
                      <button onClick={()=>removeCost(q.local_id)} style={{background:'transparent',border:'none',color:C.red,fontSize:'1.1rem',cursor:'pointer'}}>×</button>
                    </div>
                  </div>
                ))}
                {uncategorizedCostsQueue.map(q=>(
                  <div key={q.local_id} style={{background:C.white,border:`1px solid ${C.amber}`,borderRadius:6,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.5rem'}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:'0.85rem',color:C.navy,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.description}</div>
                      <div style={{fontSize:'0.68rem',color:C.amber}}>Awaiting categorization · {q.transaction_date}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexShrink:0}}>
                      <div style={{fontFamily:'monospace',fontWeight:700,color:C.red,whiteSpace:'nowrap'}}>-{fmt(q.amount,auth.client.currency)}</div>
                      <button onClick={()=>removeUncategorizedCost(q.local_id)} style={{background:'transparent',border:'none',color:C.red,fontSize:'1.1rem',cursor:'pointer'}}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {mode==='sale-detail' && selectedItem && (
          <div style={{background:C.white,border:`1px solid ${C.cyan}`,borderRadius:8,padding:'1.1rem'}}>
            <div style={{fontWeight:700,fontSize:'1rem',color:C.navy,marginBottom:'0.2rem'}}>{editingSaleId?'Edit: ':''}{selectedItem.name}</div>
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
                style={{flex:1,padding:'0.85rem',background:C.teal,color:C.white,border:'none',borderRadius:6,fontWeight:700,cursor:'pointer'}}>{editingSaleId?'Save Changes':'Add to Queue'}</button>
              <button onClick={()=>{setMode('grid');setSelectedItem(null);setEditingSaleId(null)}} style={{padding:'0.85rem 1rem',background:'transparent',color:C.slate,border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        )}

        {mode==='cost-form' && (
          <div style={{background:C.white,border:`1px solid ${C.red}`,borderRadius:8,padding:'1.1rem'}}>
            <div style={{fontWeight:700,fontSize:'1rem',color:C.navy,marginBottom:'0.7rem'}}>{editingCostId?'Edit Cost / Expense':'Record a Cost or Expense'}</div>
            <label style={lbl}>What is this for?</label>
            <select style={inp} value={costForm.plan_line_id} onChange={e=>setCostForm(f=>({...f,plan_line_id:e.target.value,description:''}))}>
              <option value="">Select...</option>
              {auth.cost_lines.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
              {!editingCostId && <option value="__other__">Something else (not listed)</option>}
            </select>
            {costForm.plan_line_id==='__other__' ? (
              <>
                <label style={lbl}>What was this cost for?</label>
                <input style={inp} value={costForm.description} onChange={e=>setCostForm(f=>({...f,description:e.target.value}))} placeholder="e.g. Motorbike repair"/>
                <div style={{fontSize:'0.72rem',color:C.slate,marginTop:'0.3rem',marginBottom:'0.6rem'}}>
                  This will be recorded and reviewed by your coach, who will assign it to the right category.
                </div>
              </>
            ) : null}
            <label style={lbl}>Amount ({auth.client.currency})</label>
            <input type="number" inputMode="numeric" style={inp} value={costForm.amount} onChange={e=>setCostForm(f=>({...f,amount:e.target.value}))} placeholder="0"/>
            {costForm.plan_line_id!=='__other__' && (
              <>
                <label style={lbl}>Notes (optional)</label>
                <input style={inp} value={costForm.notes} onChange={e=>setCostForm(f=>({...f,notes:e.target.value}))}/>
              </>
            )}
            <div style={{display:'flex',gap:'0.6rem',marginTop:'0.5rem'}}>
              <button onClick={costForm.plan_line_id==='__other__'?addUncategorizedCostToQueue:addCostToQueue}
                disabled={costForm.plan_line_id==='__other__'?(!costForm.description||!costForm.amount):(!costForm.plan_line_id||!costForm.amount)}
                style={{flex:1,padding:'0.85rem',background:C.red,color:C.white,border:'none',borderRadius:6,fontWeight:700,cursor:'pointer'}}>{editingCostId?'Save Changes':'Add to Queue'}</button>
              <button onClick={()=>{setMode('grid');setEditingCostId(null)}} style={{padding:'0.85rem 1rem',background:'transparent',color:C.slate,border:`1px solid ${C.border}`,borderRadius:6,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        )}

        {mode==='history' && (
          <div>
            <div style={{fontWeight:700,fontSize:'1rem',color:C.navy,marginBottom:'0.85rem'}}>Your Recent Activity</div>
            {historyLoading && <div style={{textAlign:'center',color:C.slate,padding:'2rem',fontSize:'0.85rem'}}>Loading...</div>}
            {!historyLoading && historyError && (
              <div style={{background:'#FDF2F0',border:`1px solid ${C.red}`,borderRadius:8,padding:'1rem',color:C.red,fontSize:'0.85rem'}}>{historyError}</div>
            )}
            {!historyLoading && !historyError && historyEntries.length===0 && (
              <div style={{textAlign:'center',color:C.slate,padding:'2rem',fontSize:'0.85rem'}}>Nothing recorded yet. Once you sync an entry, it&apos;ll show up here.</div>
            )}
            {!historyLoading && !historyError && historyEntries.map(entry=>(
              <div key={entry.id} style={{background:C.white,border:`1px solid ${C.border}`,borderLeft:`4px solid ${entry.transaction_type==='sale'?C.green:C.red}`,borderRadius:8,padding:'0.85rem 1rem',marginBottom:'0.6rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'0.5rem'}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:'0.88rem',color:C.navy}}>{entry.plan_line_name}</div>
                    <div style={{fontSize:'0.72rem',color:C.slate,marginTop:'0.15rem'}}>
                      {entry.transaction_date} {entry.quantity?`· ${entry.quantity}${entry.unit_label?` ${entry.unit_label}`:''} × ${fmt(entry.unit_price??0,auth.client.currency)}`:''}
                    </div>
                    {entry.notes && <div style={{fontSize:'0.72rem',color:C.slate,marginTop:'0.15rem',fontStyle:'italic'}}>{entry.notes}</div>}
                  </div>
                  <div style={{fontWeight:700,fontSize:'0.95rem',color:entry.transaction_type==='sale'?C.green:C.red,whiteSpace:'nowrap'}}>
                    {entry.transaction_type==='sale'?'+':'−'}{fmt(entry.amount,auth.client.currency)}
                  </div>
                </div>
                {entry.price_alert && <div style={{fontSize:'0.68rem',color:C.amber,marginTop:'0.4rem'}}>⚠ Price was overridden from the standard catalogue price</div>}
              </div>
            ))}
          </div>
        )}

        {mode==='stock' && (
          <div>
            <div style={{fontWeight:700,fontSize:'1rem',color:C.navy,marginBottom:'0.85rem'}}>Stock on Hand</div>
            {stockLoading && <div style={{textAlign:'center',color:C.slate,padding:'2rem',fontSize:'0.85rem'}}>Loading...</div>}
            {!stockLoading && stockError && (
              <div style={{background:'#FDF2F0',border:`1px solid ${C.red}`,borderRadius:8,padding:'1rem',color:C.red,fontSize:'0.85rem'}}>{stockError}</div>
            )}
            {!stockLoading && !stockError && stockLevels.length===0 && (
              <div style={{textAlign:'center',color:C.slate,padding:'2rem',fontSize:'0.85rem'}}>No stock recorded yet. Record a sale or receive stock for a catalogue item to start tracking it here.</div>
            )}
            {!stockLoading && !stockError && stockLevels.map(level=>{
              const low = level.reorder_threshold != null && level.quantity_on_hand <= level.reorder_threshold
              return (
                <div key={level.id} style={{background:C.white,border:`1px solid ${low?C.amber:C.border}`,borderRadius:8,padding:'0.85rem 1rem',marginBottom:'0.6rem'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.5rem'}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:'0.88rem',color:C.navy}}>{level.catalogue?.name || 'Item'}</div>
                      {low && <div style={{fontSize:'0.68rem',color:C.amber,marginTop:'0.1rem'}}>⚠ At or below reorder threshold ({level.reorder_threshold})</div>}
                    </div>
                    <div style={{fontFamily:'monospace',fontWeight:700,fontSize:'1rem',color:C.navy,whiteSpace:'nowrap'}}>
                      {level.quantity_on_hand}{level.catalogue?.unit_label?` ${level.catalogue.unit_label}`:''}
                    </div>
                  </div>
                  {receivingItemId===level.catalogue_item_id ? (
                    <div style={{display:'flex',gap:'0.5rem',marginTop:'0.6rem'}}>
                      <input type="number" autoFocus value={receiveQty} onChange={e=>setReceiveQty(e.target.value)}
                        placeholder="Quantity received" style={{flex:1,padding:'0.5rem',border:`1px solid ${C.border}`,borderRadius:6,fontSize:'0.82rem'}}/>
                      <button disabled={receiving} onClick={()=>receiveStock(level.catalogue_item_id)}
                        style={{padding:'0.5rem 0.85rem',background:C.teal,color:C.white,border:'none',borderRadius:6,fontSize:'0.78rem',cursor:'pointer',fontWeight:600}}>
                        {receiving?'Saving...':'Confirm'}
                      </button>
                      <button onClick={()=>{setReceivingItemId(null);setReceiveQty('')}}
                        style={{padding:'0.5rem 0.85rem',background:'transparent',color:C.slate,border:`1px solid ${C.border}`,borderRadius:6,fontSize:'0.78rem',cursor:'pointer'}}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={()=>{setReceivingItemId(level.catalogue_item_id);setReceiveQty('')}}
                      style={{marginTop:'0.6rem',padding:'0.4rem 0.75rem',background:'transparent',color:C.teal,border:`1px solid ${C.teal}`,borderRadius:6,fontSize:'0.75rem',cursor:'pointer',fontWeight:600}}>
                      + Receive Stock
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
