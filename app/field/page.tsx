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
  navy:'var(--cv-navy)', cyan:'var(--cv-cyan)', cream:'var(--cv-cream)', white:'var(--cv-card)',
  slate:'var(--cv-slate)', border:'var(--cv-border)', teal:'var(--cv-teal)',
  red:'var(--cv-red)', green:'var(--cv-green)', amber:'var(--cv-amber)',
}

// Dark-theme palette for the redesigned field UI (picture-first, numbers-only,
// large touch targets). Presentation only -- no logic depends on these.
const D = {
  bg:'var(--cv-bg)',        // page background
  bg2:'var(--cv-bg-2)',     // slightly lighter panel / input background
  card:'var(--cv-card)',    // card surface
  cardHi:'var(--cv-card-hi)',// raised / active card surface
  border:'var(--cv-border)',
  white:'var(--cv-on-accent)',
  text:'var(--cv-navy)',
  muted:'var(--cv-slate)',
  faint:'var(--cv-faint)',
  cyan:'var(--cv-cyan)',    // primary accent (Money in / active)
  cyanDim:'var(--cv-cyan-dim)',
  green:'var(--cv-green)',  // confirm actions
  amber:'var(--cv-amber)',  // waiting to sync
  amberDim:'var(--cv-amber-dim)',
  red:'var(--cv-red)',      // money out
  redDim:'var(--cv-red-dim)',
}

interface CatalogueItem { id:string; name:string; item_type:'product'|'service'; price:number; unit_label?:string; plan_line_id:string; image?:string; image_url?:string }
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
  // Presentation-only: which capture flow the grid screen is showing.
  // 'in' = record a sale (Money in), 'out' = record a cost (Money out).
  const [flow, setFlow] = useState<'in'|'out'>('in')
  // Light/dark theme. Field app defaults to dark (matching the mockup).
  // The chosen theme is applied globally via document.documentElement.dataset.theme
  // so it is shared with the dashboard page too.
  const [theme, setTheme] = useState<'light'|'dark'>('dark')
  const syncNowRef = useRef<()=>void>(()=>{})

  function applyTheme(next:'light'|'dark') {
    if (next==='dark') document.documentElement.dataset.theme = 'dark'
    else delete document.documentElement.dataset.theme
  }
  useEffect(()=>{
    const saved = localStorage.getItem('cv-theme')
    const initial = saved==='light' || saved==='dark' ? saved : 'dark'
    setTheme(initial)
    applyTheme(initial)
  },[])
  function toggleTheme() {
    setTheme(prev=>{
      const next = prev==='dark' ? 'light' : 'dark'
      localStorage.setItem('cv-theme', next)
      applyTheme(next)
      return next
    })
  }

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
          // Real moment of sale (from the offline queue), so a mobile-money sale
          // can be matched to its payment on a time window later. transaction_date
          // is day-only and synced_at is end-of-day, so neither would work.
          captured_at: s.queued_at ? new Date(s.queued_at).toISOString() : undefined,
        })),
        ...costsSnapshot.map(c=>({
          local_id: c.local_id,
          plan_line_id: c.plan_line_id, plan_line_name: c.plan_line_name,
          transaction_type: 'expense', category: 'direct_opex', amount: c.amount,
          transaction_date: c.transaction_date, notes: c.notes,
          captured_at: c.queued_at ? new Date(c.queued_at).toISOString() : undefined,
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

  // ---- Dark-theme presentation helpers (styles + tiny speech helper) ----
  // Tap-to-hear for low-literacy operators. Guarded + wrapped so it can never
  // throw on browsers without the Web Speech API.
  function say(text:string) {
    try {
      if (typeof window!=='undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
      }
    } catch {}
  }

  if (!token) {
    return (
      <div style={{minHeight:'100vh',background:D.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
        <BuildStamp/>
        <div style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:18,padding:'1.9rem',maxWidth:420,width:'100%'}}>
          <div style={{fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.12em',color:D.cyan,marginBottom:'0.6rem'}}>CLEARVIEW FIELD</div>
          <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.6rem',color:D.text,margin:'0 0 1rem'}}>Enter your access link</h1>
          <p style={{fontSize:'0.9rem',color:D.muted,lineHeight:1.6,marginBottom:'1.2rem'}}>Paste the code you were given, or open this page using the link directly.</p>
          <input style={{width:'100%',padding:'0.9rem',background:D.bg2,border:`1px solid ${D.border}`,borderRadius:12,fontSize:'1rem',color:D.text,boxSizing:'border-box',marginBottom:'0.9rem'}}
            placeholder="Paste your access code here" value={tokenInput} onChange={e=>setTokenInput(e.target.value)}/>
          {authError && <div style={{color:'var(--cv-red-text)',fontSize:'0.92rem',marginBottom:'0.9rem'}}>{authError}</div>}
          <button style={{width:'100%',padding:'1rem',background:D.cyan,color:'var(--cv-on-cyan)',border:'none',borderRadius:12,fontSize:'1rem',fontWeight:700,cursor:'pointer'}}
            disabled={loading || !tokenInput} onClick={()=>authenticate(tokenInput.trim())}>{loading?'Checking...':'Continue'}</button>
        </div>
      </div>
    )
  }

  if (loading && !auth) {
    return <div style={{minHeight:'100vh',background:D.bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Georgia,serif',fontSize:'1.2rem',color:D.text}}>Loading...</div>
  }

  if (!auth) {
    return (
      <div style={{minHeight:'100vh',background:D.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
        <div style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:18,padding:'1.9rem',maxWidth:420,width:'100%',textAlign:'center'}}>
          <div style={{color:'var(--cv-red-text)',marginBottom:'1.1rem'}}>{authError || 'Could not load your data.'}</div>
          <button style={{padding:'0.85rem 1.6rem',background:D.cyan,color:'var(--cv-on-cyan)',border:'none',borderRadius:12,fontWeight:700,cursor:'pointer'}}
            onClick={()=>token && authenticate(token)}>Try Again</button>
        </div>
      </div>
    )
  }

  // Dark-theme style constants (self-contained inline styles, no new deps).
  const inp: React.CSSProperties = {width:'100%',padding:'0.85rem',background:D.bg2,border:`1px solid ${D.border}`,borderRadius:12,fontSize:'1rem',color:D.text,boxSizing:'border-box',marginBottom:'0.7rem'}
  const lbl: React.CSSProperties = {display:'block',fontSize:'0.92rem',fontWeight:600,color:D.muted,marginBottom:'0.35rem'}
  const cardStyle: React.CSSProperties = {background:D.card,border:`1px solid ${D.border}`,borderRadius:18,padding:'1.15rem'}
  const tileStyle: React.CSSProperties = {background:D.card,border:`1px solid ${D.border}`,borderRadius:18,padding:'0.75rem',textAlign:'center',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:'0.45rem',color:D.text}
  const tileImgStyle: React.CSSProperties = {width:'100%',aspectRatio:'1 / 1',borderRadius:14,background:D.bg2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2.6rem',overflow:'hidden'}
  const stepBtnStyle: React.CSSProperties = {width:64,height:64,borderRadius:16,border:'none',background:D.bg2,color:D.text,fontSize:'2rem',fontWeight:800,cursor:'pointer',flexShrink:0,lineHeight:1}
  const primaryBtnStyle: React.CSSProperties = {width:'100%',padding:'1.05rem',background:D.green,color:D.white,border:'none',borderRadius:14,fontSize:'1.1rem',fontWeight:800,cursor:'pointer'}

  const pendingCount = salesQueue.length + costsQueue.length + uncategorizedCostsQueue.length
  const searchLower = search.trim().toLowerCase()
  const products = auth.catalogue.filter(c=>c.item_type==='product' && (!searchLower || c.name.toLowerCase().includes(searchLower)))
  const services = auth.catalogue.filter(c=>c.item_type==='service' && (!searchLower || c.name.toLowerCase().includes(searchLower)))
  const tiles = [...products, ...services]  // products first, then services

  const currency = auth.client.currency
  const effectivePrice = selectedItem ? (saleForm.override ? Number(saleForm.override_price||0) : selectedItem.price) : 0
  const qtyNum = Number(saleForm.quantity||0)

  // Speaker button used next to labels for low-literacy operators.
  const speaker = (text:string) => (
    <button type="button" aria-label={`Hear: ${text}`} onClick={()=>say(text)}
      style={{background:'transparent',border:'none',color:D.cyan,fontSize:'1rem',cursor:'pointer',padding:'0 0.25rem',lineHeight:1}}>🔊</button>
  )

  // Reusable image / fallback thumbnail for a catalogue item.
  const itemThumb = (item:CatalogueItem, size:number) => {
    const src = item.image_url || item.image
    if (src) return <img src={src} alt="" style={{width:size,height:size,borderRadius:14,objectFit:'cover'}}/>
    return <span aria-hidden="true">{item.item_type==='service'?'🛠️':'📦'}</span>
  }

  // Shared Money-out (cost) capture card -- reused by the grid "Money out"
  // flow and by cost editing (mode==='cost-form'). Same handlers as before:
  // addCostToQueue / addUncategorizedCostToQueue.
  const costCard = (
    <div style={{...cardStyle,border:`1px solid ${D.red}`}}>
      <div style={{display:'flex',alignItems:'center',gap:'0.4rem',fontWeight:800,fontSize:'1.15rem',color:D.text,marginBottom:'0.9rem'}}>
        {editingCostId?'Edit money out':'Money out'} {speaker('Money out. What did you spend on?')}
      </div>
      <label style={lbl}>What did you spend on?</label>
      <select style={inp} value={costForm.plan_line_id} onChange={e=>setCostForm(f=>({...f,plan_line_id:e.target.value,description:''}))}>
        <option value="">Select...</option>
        {auth.cost_lines.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
        {!editingCostId && <option value="__other__">Something else (not listed)</option>}
      </select>
      {costForm.plan_line_id==='__other__' ? (
        <>
          <label style={lbl}>What was this cost for?</label>
          <input style={inp} value={costForm.description} onChange={e=>setCostForm(f=>({...f,description:e.target.value}))} placeholder="e.g. Motorbike repair"/>
          <div style={{fontSize:'0.86rem',color:D.faint,marginTop:'-0.2rem',marginBottom:'0.7rem'}}>
            This will be recorded and reviewed by your coach, who will assign it to the right category.
          </div>
        </>
      ) : null}
      <label style={lbl}>Amount ({currency})</label>
      <input type="number" inputMode="numeric" style={{...inp,fontSize:'1.4rem',fontWeight:700}} value={costForm.amount} onChange={e=>setCostForm(f=>({...f,amount:e.target.value}))} placeholder="0"/>
      {costForm.plan_line_id!=='__other__' && (
        <>
          <label style={lbl}>Notes (optional)</label>
          <input style={inp} value={costForm.notes} onChange={e=>setCostForm(f=>({...f,notes:e.target.value}))}/>
        </>
      )}
      <button onClick={costForm.plan_line_id==='__other__'?addUncategorizedCostToQueue:addCostToQueue}
        disabled={costForm.plan_line_id==='__other__'?(!costForm.description||!costForm.amount):(!costForm.plan_line_id||!costForm.amount)}
        style={{...primaryBtnStyle,background:D.red,marginTop:'0.4rem',opacity:(costForm.plan_line_id==='__other__'?(!costForm.description||!costForm.amount):(!costForm.plan_line_id||!costForm.amount))?0.5:1}}>
        {editingCostId?'Save changes':'Save money out'}
      </button>
      {editingCostId && (
        <button onClick={()=>{setMode('grid');setEditingCostId(null);setCostForm({plan_line_id:'',amount:'',notes:'',description:''})}}
          style={{width:'100%',marginTop:'0.6rem',padding:'0.85rem',background:'transparent',color:D.muted,border:`1px solid ${D.border}`,borderRadius:12,cursor:'pointer',fontSize:'0.95rem'}}>Cancel</button>
      )}
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:D.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",paddingBottom:'2.5rem',color:D.text}}>
      <BuildStamp/>
      <div style={{maxWidth:460,margin:'0 auto',padding:'1.1rem 1rem'}}>
        {/* ---- Header ---- */}
        <header style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1rem'}}>
          <div>
            <div style={{fontFamily:'monospace',fontSize:'0.72rem',letterSpacing:'0.12em',color:D.cyan}}>CLEARVIEW FIELD</div>
            <div style={{fontFamily:'Georgia,serif',fontSize:'2rem',fontWeight:700,marginTop:'0.1rem',lineHeight:1.1}}>
              {mode==='history'?'History':mode==='stock'?'Stock':'Record'}
            </div>
            <div style={{fontSize:'0.92rem',color:D.muted,marginTop:'0.25rem'}}>{auth.operator.display_name} · {auth.unit.name}</div>
          </div>
          <div style={{display:'flex',gap:'0.45rem',flexShrink:0}}>
            <button onClick={toggleTheme} aria-label="Toggle light or dark theme" title="Toggle light/dark theme"
              style={{background:D.card,border:`1px solid ${D.border}`,color:D.text,borderRadius:10,padding:'0.55rem 0.7rem',fontSize:'0.86rem',cursor:'pointer',whiteSpace:'nowrap'}}>
              {theme==='dark'?'☀':'☾'} Theme
            </button>
            {(mode==='grid' || mode==='history' || mode==='stock') && (
              <>
                {mode==='grid' && (
                  <button onClick={loadStock}
                    style={{background:D.card,border:`1px solid ${D.border}`,color:D.text,borderRadius:10,padding:'0.55rem 0.8rem',fontSize:'0.86rem',cursor:'pointer',whiteSpace:'nowrap'}}>
                    Stock
                  </button>
                )}
                <button onClick={mode==='grid'?loadHistory:()=>setMode('grid')}
                  style={{background:D.card,border:`1px solid ${D.border}`,color:D.text,borderRadius:10,padding:'0.55rem 0.8rem',fontSize:'0.86rem',cursor:'pointer',whiteSpace:'nowrap'}}>
                  {mode==='grid'?'History':'← Back'}
                </button>
              </>
            )}
          </div>
        </header>

        {/* ---- Sync-status banner (with manual Sync now) ---- */}
        <div style={{background:pendingCount===0?'transparent':D.amberDim,border:pendingCount===0?`1px solid ${D.border}`:`1px solid ${D.amber}`,borderRadius:14,padding:'0.75rem 0.9rem',marginBottom:'0.9rem',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.6rem'}}>
          <button onClick={()=>setQueueOpen(o=>!o)} style={{background:'none',border:'none',padding:0,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:'0.55rem',color:D.text,minWidth:0}}>
            <span aria-hidden="true" style={{fontSize:'1rem',flexShrink:0,color:pendingCount===0?D.green:D.amber}}>{pendingCount===0?'✓':'↑'}</span>
            <span style={{minWidth:0}}>
              {pendingCount===0
                ? <div style={{fontSize:'0.9rem',fontWeight:600,color:D.green}}>Up to date</div>
                : <div style={{fontSize:'0.9rem',fontWeight:600,color:D.amber}}>{pendingCount} record{pendingCount===1?'':'s'} waiting to sync, will send when online {queueOpen?'▾':'▸'}</div>}
            </span>
          </button>
          {pendingCount>0 && (
            <button disabled={syncing} onClick={syncNow}
              style={{padding:'0.6rem 0.95rem',background:D.cyan,color:'var(--cv-on-cyan)',border:'none',borderRadius:10,fontWeight:700,cursor:'pointer',fontSize:'0.92rem',whiteSpace:'nowrap',flexShrink:0,opacity:syncing?0.6:1}}>
              {syncing?'Syncing...':'Sync now'}
            </button>
          )}
        </div>
        {(lastSync || syncMsg) && (
          <div style={{marginBottom:'0.9rem',fontSize:'0.86rem'}}>
            {lastSync && <div style={{color:D.faint}}>Last synced {lastSync}</div>}
            {syncMsg && <div style={{color:syncMsg.startsWith('Synced')?'var(--cv-green-text)':'var(--cv-red-text)',marginTop:'0.2rem'}}>{syncMsg}</div>}
          </div>
        )}

        {/* ---- Expandable queue review (edit/remove) ---- */}
        {queueOpen && pendingCount>0 && (
          <div style={{marginBottom:'1rem'}}>
            <div style={{fontSize:'0.8rem',fontFamily:'monospace',color:D.faint,marginBottom:'0.5rem'}}>QUEUED ENTRIES</div>
            {salesQueue.map(q=>(
              <div key={q.local_id} style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:12,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.5rem'}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:'0.9rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.quantity}{q.unit_label?` ${q.unit_label}`:''} {q.item_name}</div>
                  <div style={{fontSize:'0.8rem',color:D.faint}}>{q.override_price?'(price overridden)':`× ${fmt(q.standard_price,currency)}`}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexShrink:0}}>
                  <div style={{fontFamily:'monospace',fontWeight:700,color:'var(--cv-green-text)',whiteSpace:'nowrap'}}>+{fmt(q.quantity*(q.override_price??q.standard_price),currency)}</div>
                  <button onClick={()=>openSaleEdit(q)} style={{background:'transparent',border:'none',color:D.cyan,fontSize:'0.92rem',cursor:'pointer',fontWeight:600}}>Edit</button>
                  <button onClick={()=>removeSale(q.local_id)} style={{background:'transparent',border:'none',color:'var(--cv-red-text)',fontSize:'1.2rem',cursor:'pointer'}}>×</button>
                </div>
              </div>
            ))}
            {costsQueue.map(q=>(
              <div key={q.local_id} style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:12,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.5rem'}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:'0.9rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.plan_line_name}</div>
                  <div style={{fontSize:'0.8rem',color:D.faint}}>{q.transaction_date}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexShrink:0}}>
                  <div style={{fontFamily:'monospace',fontWeight:700,color:'var(--cv-red-text)',whiteSpace:'nowrap'}}>-{fmt(q.amount,currency)}</div>
                  <button onClick={()=>openCostEdit(q)} style={{background:'transparent',border:'none',color:D.cyan,fontSize:'0.92rem',cursor:'pointer',fontWeight:600}}>Edit</button>
                  <button onClick={()=>removeCost(q.local_id)} style={{background:'transparent',border:'none',color:'var(--cv-red-text)',fontSize:'1.2rem',cursor:'pointer'}}>×</button>
                </div>
              </div>
            ))}
            {uncategorizedCostsQueue.map(q=>(
              <div key={q.local_id} style={{background:D.card,border:`1px solid ${D.amber}`,borderRadius:12,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.5rem'}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:'0.9rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.description}</div>
                  <div style={{fontSize:'0.8rem',color:D.amber}}>Awaiting categorization · {q.transaction_date}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexShrink:0}}>
                  <div style={{fontFamily:'monospace',fontWeight:700,color:'var(--cv-red-text)',whiteSpace:'nowrap'}}>-{fmt(q.amount,currency)}</div>
                  <button onClick={()=>removeUncategorizedCost(q.local_id)} style={{background:'transparent',border:'none',color:'var(--cv-red-text)',fontSize:'1.2rem',cursor:'pointer'}}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ================= GRID (Record) ================= */}
        {mode==='grid' && (
          <>
            {/* Money in / Money out toggle */}
            <div style={{display:'flex',gap:'0.6rem',marginBottom:'1.1rem'}}>
              <button onClick={()=>setFlow('in')}
                style={{flex:1,padding:'0.95rem',borderRadius:14,fontSize:'1rem',fontWeight:700,cursor:'pointer',
                  background:flow==='in'?D.cyan:'transparent',color:flow==='in'?'var(--cv-on-cyan)':D.text,
                  border:flow==='in'?'none':`1px solid ${D.border}`}}>
                + Money in
              </button>
              <button onClick={()=>{setFlow('out');setEditingCostId(null);setCostForm({plan_line_id:'',amount:'',notes:'',description:''})}}
                style={{flex:1,padding:'0.95rem',borderRadius:14,fontSize:'1rem',fontWeight:700,cursor:'pointer',
                  background:flow==='out'?D.red:'transparent',color:flow==='out'?D.white:D.text,
                  border:flow==='out'?'none':`1px solid ${D.border}`}}>
                − Money out
              </button>
            </div>

            {flow==='in' ? (
              <>
                <div style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'1.05rem',fontWeight:700,marginBottom:'0.7rem'}}>
                  What did you sell? {speaker('What did you sell?')}
                </div>
                <input
                  style={{...inp,marginBottom:'0.9rem'}}
                  placeholder="🔍 Search products or services..."
                  aria-label="Search products or services"
                  value={search} onChange={e=>setSearch(e.target.value)}
                />
                {tiles.length>0 ? (
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.7rem',marginBottom:'1.25rem'}}>
                    {tiles.map(item=>(
                      <button key={item.id} onClick={()=>openSaleDetail(item)} style={tileStyle}>
                        <div style={tileImgStyle}>{itemThumb(item,120)}</div>
                        <div style={{fontWeight:700,fontSize:'1rem',lineHeight:1.15}}>{item.name}</div>
                        <div style={{fontSize:'0.92rem',color:D.cyan,fontWeight:700}}>{fmt(item.price,currency)}{item.unit_label?` / ${item.unit_label}`:''}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{...cardStyle,textAlign:'center',color:D.muted,fontSize:'0.9rem',marginBottom:'1.25rem'}}>
                    {searchLower
                      ? `No products or services match "${search}".`
                      : 'No products or services set up for this unit yet. Ask your CEO or Finance Manager to add them to the Catalogue.'}
                  </div>
                )}
              </>
            ) : (
              <div style={{marginBottom:'1.25rem'}}>
                {costCard}
              </div>
            )}

            {/* ---- Today's records ---- */}
            {pendingCount>0 && (
              <>
                <div style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'1.05rem',fontWeight:700,marginBottom:'0.7rem'}}>
                  Today&apos;s records {speaker("Today's records")}
                </div>
                <div>
                  {salesQueue.map(q=>{
                    const item = auth.catalogue.find(c=>c.id===q.catalogue_item_id)
                    return (
                      <button key={q.local_id} onClick={()=>openSaleEdit(q)}
                        style={{width:'100%',textAlign:'left',background:D.card,border:`1px solid ${D.border}`,borderRadius:12,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',alignItems:'center',gap:'0.7rem',cursor:'pointer',color:D.text}}>
                        <span style={{width:38,height:38,borderRadius:10,background:D.bg2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',flexShrink:0,overflow:'hidden'}}>
                          {item?itemThumb(item,38):'📦'}
                        </span>
                        <span style={{minWidth:0,flex:1}}>
                          <span style={{display:'block',fontWeight:600,fontSize:'0.92rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.quantity}{q.unit_label?` ${q.unit_label}`:''} {q.item_name}</span>
                          <span style={{display:'inline-block',fontSize:'0.72rem',color:D.amber,background:D.amberDim,borderRadius:6,padding:'0.05rem 0.4rem',marginTop:'0.2rem'}}>waiting</span>
                        </span>
                        <span style={{fontFamily:'monospace',fontWeight:700,color:'var(--cv-green-text)',whiteSpace:'nowrap',flexShrink:0}}>+{fmt(q.quantity*(q.override_price??q.standard_price),currency)}</span>
                      </button>
                    )
                  })}
                  {costsQueue.map(q=>(
                    <button key={q.local_id} onClick={()=>openCostEdit(q)}
                      style={{width:'100%',textAlign:'left',background:D.card,border:`1px solid ${D.border}`,borderRadius:12,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',alignItems:'center',gap:'0.7rem',cursor:'pointer',color:D.text}}>
                      <span style={{width:38,height:38,borderRadius:10,background:D.bg2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',flexShrink:0}}>💸</span>
                      <span style={{minWidth:0,flex:1}}>
                        <span style={{display:'block',fontWeight:600,fontSize:'0.92rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.plan_line_name}</span>
                        <span style={{display:'inline-block',fontSize:'0.72rem',color:D.amber,background:D.amberDim,borderRadius:6,padding:'0.05rem 0.4rem',marginTop:'0.2rem'}}>waiting</span>
                      </span>
                      <span style={{fontFamily:'monospace',fontWeight:700,color:'var(--cv-red-text)',whiteSpace:'nowrap',flexShrink:0}}>-{fmt(q.amount,currency)}</span>
                    </button>
                  ))}
                  {uncategorizedCostsQueue.map(q=>(
                    <div key={q.local_id}
                      style={{width:'100%',background:D.card,border:`1px solid ${D.border}`,borderRadius:12,padding:'0.7rem 0.85rem',marginBottom:'0.5rem',display:'flex',alignItems:'center',gap:'0.7rem',color:D.text}}>
                      <span style={{width:38,height:38,borderRadius:10,background:D.bg2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',flexShrink:0}}>❓</span>
                      <span style={{minWidth:0,flex:1}}>
                        <span style={{display:'block',fontWeight:600,fontSize:'0.92rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.description}</span>
                        <span style={{display:'inline-block',fontSize:'0.72rem',color:D.amber,background:D.amberDim,borderRadius:6,padding:'0.05rem 0.4rem',marginTop:'0.2rem'}}>waiting</span>
                      </span>
                      <span style={{display:'flex',alignItems:'center',gap:'0.5rem',flexShrink:0}}>
                        <span style={{fontFamily:'monospace',fontWeight:700,color:'var(--cv-red-text)',whiteSpace:'nowrap'}}>-{fmt(q.amount,currency)}</span>
                        <button onClick={()=>removeUncategorizedCost(q.local_id)} style={{background:'transparent',border:'none',color:'var(--cv-red-text)',fontSize:'1.2rem',cursor:'pointer'}}>×</button>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ================= SALE DETAIL ================= */}
        {mode==='sale-detail' && selectedItem && (
          <div style={cardStyle}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'0.5rem',marginBottom:'1rem'}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'0.4rem',fontWeight:800,fontSize:'1.4rem',lineHeight:1.1}}>
                  {selectedItem.name} sale {speaker(`${selectedItem.name} sale`)}
                </div>
                <div style={{fontSize:'0.92rem',color:D.cyan,marginTop:'0.2rem'}}>Money in</div>
              </div>
              <button onClick={()=>{setMode('grid');setSelectedItem(null);setEditingSaleId(null)}}
                aria-label="Close" style={{background:D.bg2,border:'none',color:D.text,width:40,height:40,borderRadius:12,fontSize:'1.3rem',cursor:'pointer',flexShrink:0,lineHeight:1}}>×</button>
            </div>

            {/* Quantity stepper */}
            <div style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'1rem',fontWeight:700,color:D.muted,marginBottom:'0.55rem'}}>
              How much? (quantity){selectedItem.unit_label?` in ${selectedItem.unit_label}`:''} {speaker('How much? Quantity')}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'0.8rem',marginBottom:'1.1rem'}}>
              <button aria-label="Less" onClick={()=>setSaleForm(f=>({...f,quantity:String(Math.max(0,(Number(f.quantity||0)||0)-1))}))} style={stepBtnStyle}>−</button>
              <input type="number" inputMode="numeric" min={0} aria-label="Quantity" value={saleForm.quantity}
                onChange={e=>{const raw=e.target.value;const n=Number(raw);setSaleForm(f=>({...f,quantity: raw===''?'':(isNaN(n)||n<0?'0':raw)}))}} placeholder="0"
                style={{flex:1,minWidth:0,textAlign:'center',fontSize:'2rem',fontWeight:800,padding:'0.6rem',background:D.bg2,border:`1px solid ${D.border}`,borderRadius:14,color:D.text,boxSizing:'border-box'}} autoFocus/>
              <button aria-label="More" onClick={()=>setSaleForm(f=>({...f,quantity:String((Number(f.quantity||0)||0)+1)}))} style={stepBtnStyle}>+</button>
            </div>

            {/* Price stepper (touching it flags an override) */}
            <div style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'1rem',fontWeight:700,color:D.muted,marginBottom:'0.55rem'}}>
              Price for each unit {speaker('Price for each unit')}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'0.8rem',marginBottom:'0.5rem'}}>
              <button aria-label="Lower price" onClick={()=>setSaleForm(f=>({...f,override:true,override_price:String(Math.max(0,(Number(f.override?f.override_price:selectedItem.price)||0)-100))}))} style={stepBtnStyle}>−</button>
              <input type="number" inputMode="numeric" min={0} aria-label="Price for each unit"
                value={saleForm.override?saleForm.override_price:String(selectedItem.price)}
                onChange={e=>{const raw=e.target.value;const n=Number(raw);setSaleForm(f=>({...f,override:true,override_price: raw===''?'':(isNaN(n)||n<0?'0':raw)}))}}
                style={{flex:1,minWidth:0,textAlign:'center',fontSize:'1.6rem',fontWeight:800,padding:'0.6rem',background:D.bg2,border:`1px solid ${D.border}`,borderRadius:14,color:D.text,boxSizing:'border-box'}}/>
              <button aria-label="Raise price" onClick={()=>setSaleForm(f=>({...f,override:true,override_price:String((Number(f.override?f.override_price:selectedItem.price)||0)+100)}))} style={stepBtnStyle}>+</button>
            </div>
            {saleForm.override && (
              <div style={{fontSize:'0.86rem',color:D.amber,marginBottom:'0.6rem'}}>Using a custom price (standard is {fmt(selectedItem.price,currency)})</div>
            )}

            {/* Total */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:D.bg2,borderRadius:14,padding:'0.9rem 1.05rem',marginBottom:'1rem'}}>
              <span style={{fontSize:'1.1rem',fontWeight:700,color:D.muted}}>Total</span>
              <span style={{fontSize:'1.5rem',fontWeight:800,color:D.text}}>{fmt(qtyNum*effectivePrice,currency)}</span>
            </div>

            {/* Secondary details (kept, smaller/below) */}
            <div style={{background:D.bg2,borderRadius:14,padding:'0.85rem',marginBottom:'1rem'}}>
              <label style={lbl}>Payment method</label>
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
              <label style={lbl}>Add a note (optional)</label>
              <input style={{...inp,marginBottom:0}} value={saleForm.notes} onChange={e=>setSaleForm(f=>({...f,notes:e.target.value}))}/>
            </div>

            <button onClick={addSaleToQueue} disabled={!saleForm.quantity||Number(saleForm.quantity)<=0}
              style={{...primaryBtnStyle,opacity:(!saleForm.quantity||Number(saleForm.quantity)<=0)?0.5:1}}>
              {editingSaleId?'Save changes':'Save sale'}
            </button>
            <button onClick={()=>{setMode('grid');setSelectedItem(null);setEditingSaleId(null)}}
              style={{width:'100%',marginTop:'0.6rem',padding:'0.85rem',background:'transparent',color:D.muted,border:`1px solid ${D.border}`,borderRadius:12,cursor:'pointer',fontSize:'0.95rem'}}>Cancel</button>
          </div>
        )}

        {/* ================= COST FORM (edit) ================= */}
        {mode==='cost-form' && costCard}

        {/* ================= HISTORY ================= */}
        {mode==='history' && (
          <div>
            {historyLoading && <div style={{textAlign:'center',color:D.muted,padding:'2rem',fontSize:'0.9rem'}}>Loading...</div>}
            {!historyLoading && historyError && (
              <div style={{background:D.redDim,border:`1px solid ${D.red}`,borderRadius:14,padding:'1rem',color:'var(--cv-red-text)',fontSize:'0.9rem'}}>{historyError}</div>
            )}
            {!historyLoading && !historyError && historyEntries.length===0 && (
              <div style={{textAlign:'center',color:D.muted,padding:'2rem',fontSize:'0.9rem'}}>Nothing recorded yet. Once you sync an entry, it&apos;ll show up here.</div>
            )}
            {!historyLoading && !historyError && historyEntries.map(entry=>(
              <div key={entry.id} style={{background:D.card,border:`1px solid ${D.border}`,borderLeft:`4px solid ${entry.transaction_type==='sale'?D.green:D.red}`,borderRadius:12,padding:'0.85rem 1rem',marginBottom:'0.6rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'0.5rem'}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:'0.92rem'}}>{entry.plan_line_name}</div>
                    <div style={{fontSize:'0.86rem',color:D.faint,marginTop:'0.15rem'}}>
                      {entry.transaction_date} {entry.quantity?`· ${entry.quantity}${entry.unit_label?` ${entry.unit_label}`:''} × ${fmt(entry.unit_price??0,currency)}`:''}
                    </div>
                    {entry.notes && <div style={{fontSize:'0.86rem',color:D.faint,marginTop:'0.15rem',fontStyle:'italic'}}>{entry.notes}</div>}
                  </div>
                  <div style={{fontWeight:800,fontSize:'1rem',color:entry.transaction_type==='sale'?'var(--cv-green-text)':'var(--cv-red-text)',whiteSpace:'nowrap'}}>
                    {entry.transaction_type==='sale'?'+':'−'}{fmt(entry.amount,currency)}
                  </div>
                </div>
                {entry.price_alert && <div style={{fontSize:'0.8rem',color:D.amber,marginTop:'0.4rem'}}>⚠ Price was overridden from the standard catalogue price</div>}
              </div>
            ))}
          </div>
        )}

        {/* ================= STOCK ================= */}
        {mode==='stock' && (
          <div>
            {stockLoading && <div style={{textAlign:'center',color:D.muted,padding:'2rem',fontSize:'0.9rem'}}>Loading...</div>}
            {!stockLoading && stockError && (
              <div style={{background:D.redDim,border:`1px solid ${D.red}`,borderRadius:14,padding:'1rem',color:'var(--cv-red-text)',fontSize:'0.9rem'}}>{stockError}</div>
            )}
            {!stockLoading && !stockError && stockLevels.length===0 && (
              <div style={{textAlign:'center',color:D.muted,padding:'2rem',fontSize:'0.9rem'}}>No stock recorded yet. Record a sale or receive stock for a catalogue item to start tracking it here.</div>
            )}
            {!stockLoading && !stockError && stockLevels.map(level=>{
              const low = level.reorder_threshold != null && level.quantity_on_hand <= level.reorder_threshold
              return (
                <div key={level.id} style={{background:D.card,border:`1px solid ${low?D.amber:D.border}`,borderRadius:12,padding:'0.85rem 1rem',marginBottom:'0.6rem'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.5rem'}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:'0.92rem'}}>{level.catalogue?.name || 'Item'}</div>
                      {low && <div style={{fontSize:'0.8rem',color:D.amber,marginTop:'0.1rem'}}>⚠ At or below reorder threshold ({level.reorder_threshold})</div>}
                    </div>
                    <div style={{fontFamily:'monospace',fontWeight:700,fontSize:'1.1rem',whiteSpace:'nowrap'}}>
                      {level.quantity_on_hand}{level.catalogue?.unit_label?` ${level.catalogue.unit_label}`:''}
                    </div>
                  </div>
                  {receivingItemId===level.catalogue_item_id ? (
                    <div style={{display:'flex',gap:'0.5rem',marginTop:'0.6rem'}}>
                      <input type="number" autoFocus value={receiveQty} onChange={e=>setReceiveQty(e.target.value)}
                        placeholder="Quantity received" style={{flex:1,minWidth:0,padding:'0.6rem',background:D.bg2,border:`1px solid ${D.border}`,borderRadius:10,fontSize:'0.9rem',color:D.text,boxSizing:'border-box'}}/>
                      <button disabled={receiving} onClick={()=>receiveStock(level.catalogue_item_id)}
                        style={{padding:'0.6rem 0.9rem',background:D.green,color:D.white,border:'none',borderRadius:10,fontSize:'0.92rem',cursor:'pointer',fontWeight:700}}>
                        {receiving?'Saving...':'Confirm'}
                      </button>
                      <button onClick={()=>{setReceivingItemId(null);setReceiveQty('')}}
                        style={{padding:'0.6rem 0.9rem',background:'transparent',color:D.muted,border:`1px solid ${D.border}`,borderRadius:10,fontSize:'0.92rem',cursor:'pointer'}}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={()=>{setReceivingItemId(level.catalogue_item_id);setReceiveQty('')}}
                      style={{marginTop:'0.6rem',padding:'0.5rem 0.85rem',background:'transparent',color:D.cyan,border:`1px solid ${D.cyan}`,borderRadius:10,fontSize:'0.92rem',cursor:'pointer',fontWeight:700}}>
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
