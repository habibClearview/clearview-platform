// @ts-nocheck
'use client'
import React, { useState, useEffect, Component } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  navy:'#1B2A4A', cyan:'#00B4D8', cream:'#F8F4EE', white:'#FFFFFF',
  slate:'#4A5A6A', border:'#D8E0E8', teal:'#1A9DAA',
  red:'#C0392B', green:'#1A7A4A', amber:'#B8860B',
}
const card = {background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:'1.5rem',marginBottom:'1.25rem'}
const secH = {fontFamily:'Georgia,serif',fontSize:'1.1rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}
const inp = {width:'100%',padding:'0.55rem 0.7rem',border:`1px solid ${C.border}`,borderRadius:5,fontSize:'0.88rem',fontFamily:'inherit',background:'#F4F8FC',color:C.navy,boxSizing:'border-box'}
const lbl = {display:'block',fontWeight:600,fontSize:'0.83rem',marginBottom:'0.3rem',color:C.navy}
const fGrid = {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'1.1rem'}
const btn = (col=C.navy) => ({fontFamily:'monospace',fontSize:'0.85rem',fontWeight:600,padding:'0.6rem 1.4rem',border:'none',borderRadius:5,background:col,color:C.white,cursor:'pointer'})
const ghostBtn = {fontFamily:'monospace',fontSize:'0.85rem',fontWeight:600,padding:'0.6rem 1.4rem',border:`1px solid ${C.border}`,borderRadius:5,background:C.white,color:C.navy,cursor:'pointer'}
const smallBtn = (col=C.cyan) => ({fontFamily:'monospace',fontSize:'0.74rem',padding:'0.32rem 0.7rem',border:`1px solid ${col}`,borderRadius:4,background:'transparent',color:col,cursor:'pointer'})

const STEPS = ['Welcome','Business Details','Business Structure','Products & Figures','Review & Submit']

function genId(prefix:string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}` }

// A Product has: one revenue line, and one or more named cost lines (feed, DOC, vaccines, etc).
// figureData stores { [revOrCostLineId]: { [monthOffset]: amount } } -- offset 0 = current month

class IntakeErrorBoundary extends Component<{children:React.ReactNode},{hasError:boolean,errorMsg:string}> {
  constructor(props:any) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }
  static getDerivedStateFromError(error:any) {
    return { hasError: true, errorMsg: error?.message || String(error) }
  }
  componentDidCatch(error:any, info:any) {
    console.error('Intake form error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.cream,padding:'1.5rem'}}>
          <div style={{...card,maxWidth:480,textAlign:'center'}}>
            <div style={{fontSize:'2rem',marginBottom:'1rem'}}>⚠️</div>
            <div style={{fontFamily:'Georgia,serif',fontSize:'1.2rem',fontWeight:700,color:C.red,marginBottom:'0.75rem'}}>Something went wrong</div>
            <p style={{color:C.slate,fontSize:'0.88rem',marginBottom:'1rem'}}>The form ran into a problem and could not continue. Please contact your coach with this message:</p>
            <div style={{background:'#FDF0EE',borderRadius:5,padding:'0.75rem',fontSize:'0.78rem',color:C.red,fontFamily:'monospace',wordBreak:'break-word',marginBottom:'1rem'}}>{this.state.errorMsg}</div>
            <button style={btn()} onClick={()=>window.location.reload()}>Reload and Try Again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function ClientIntakeFormInner({intakeToken}:{intakeToken:string}) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [intake, setIntake] = useState<any>(null)

  const [business, setBusiness] = useState({
    business_name:'', contact_name:'', contact_email:'', contact_phone:'',
    country:'Uganda', sector:'', currency:'UGX',
  })

  const [hasUnits, setHasUnits] = useState<boolean|null>(null)
  // Products must be initialized with stable IDs -- getProducts() must never
  // generate new IDs during render or figureData keys become orphaned
  const defaultProduct = () => ({id:genId('prod'),name:'',costLines:[{id:genId('cost'),name:''}]})
  const [units, setUnits] = useState<{id:string,name:string}[]>([{id:genId('unit'),name:''}])

  // products: { unitKey: [{id, name, costLines:[{id,name}]}] }
  const [products, setProducts] = useState<Record<string,{id:string,name:string,costLines:{id:string,name:string}[]}[]>>({})
  const [commonCosts, setCommonCosts] = useState<{id:string,name:string}[]>([{id:genId('common'),name:''}])
  const [assets, setAssets] = useState<{id:string,name:string,value:number}[]>([{id:genId('asset'),name:'',value:0}])

  const [pastMonths, setPastMonths] = useState(6)
  const [futureMonths, setFutureMonths] = useState(6)
  // figureData: { lineId: { offset: amount } } -- works for revenue lines, cost lines, common costs alike
  const [figureData, setFigureData] = useState<Record<string,Record<number,number>>>({})
  const [notes, setNotes] = useState('')

  const wholeKey = 'whole'

  useEffect(()=>{
    if (!intakeToken) { setLoading(false); return }
    supabase.from('client_intake_links').select('*').eq('token',intakeToken).single()
      .then(({data,error:err})=>{
        if (err || !data) setError('This intake link is invalid or has expired.')
        else { setIntake(data); setBusiness(b=>({...b, business_name:data.client_name||''})) }
        setLoading(false)
      })
  },[intakeToken])

  function getProducts(key:string) {
    if (!products[key]) {
      // Initialize with stable IDs only once -- never generate IDs during render
      const initial = [defaultProduct()]
      setProducts(p=>p[key]?p:{...p,[key]:initial})
      return initial
    }
    return products[key]
  }
  function setProductsFor(key:string, updater:(p:any[])=>any[]) {
    setProducts(p=>({...p,[key]:updater(getProducts(key))}))
  }
  function addProduct(key:string) {
    setProductsFor(key, p=>[...p,{id:genId('prod'),name:'',costLines:[{id:genId('cost'),name:''}]}])
  }
  function updateProductName(key:string, idx:number, name:string) {
    setProductsFor(key, p=>p.map((x,i)=>i===idx?{...x,name}:x))
  }
  function removeProduct(key:string, idx:number) {
    setProductsFor(key, p=>p.filter((_,i)=>i!==idx))
  }
  function addCostLine(key:string, productIdx:number) {
    setProductsFor(key, p=>p.map((x,i)=>i===productIdx?{...x,costLines:[...x.costLines,{id:genId('cost'),name:''}]}:x))
  }
  function updateCostLineName(key:string, productIdx:number, costIdx:number, name:string) {
    setProductsFor(key, p=>p.map((x,i)=>i===productIdx?{...x,costLines:x.costLines.map((c,ci)=>ci===costIdx?{...c,name}:c)}:x))
  }
  function removeCostLine(key:string, productIdx:number, costIdx:number) {
    setProductsFor(key, p=>p.map((x,i)=>i===productIdx?{...x,costLines:x.costLines.filter((_,ci)=>ci!==costIdx)}:x))
  }

  function setFigure(lineId:string, offset:number, val:number) {
    setFigureData(f=>({...f,[lineId]:{...f[lineId],[offset]:val}}))
  }

  function monthLabel(offset:number) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset)
    return d.toLocaleString('en-GB',{month:'short',year:'numeric'})
  }

  function addUnit() { setUnits(u=>[...u,{id:genId('unit'),name:''}]) }
  function updateUnit(idx:number, name:string) { setUnits(u=>u.map((x,i)=>i===idx?{...x,name}:x)) }
  function removeUnit(idx:number) { setUnits(u=>u.filter((_,i)=>i!==idx)) }

  async function submit() {
    setSubmitting(true)
    try {
      const slugBase = business.business_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
      const slug = `${slugBase}-${Math.random().toString(36).slice(2,7)}`

      // If the intake link is tied to an existing client, use that client
      // instead of creating a new one -- this is how coach-dashboard generated
      // links work. Only create a new client for standalone/anonymous submissions.
      let client: any
      if (intake?.client_id) {
        const { data: existing, error: fetchErr } = await supabase
          .from('engagement_clients').select('*').eq('id', intake.client_id).single()
        if (fetchErr || !existing) throw new Error('Could not find the client linked to this intake form.')
        client = existing
        // Update client record with submitted details
        await supabase.from('engagement_clients').update({
          country: business.country, sector: business.sector,
          contact_name: business.contact_name, contact_email: business.contact_email,
          contact_phone: business.contact_phone, status: 'active',
          notes: `Self-submitted intake. Structure: ${hasUnits?'Multiple units':'Single business'}. ${notes}`,
        }).eq('id', client.id)
      } else {
        const { data: newClient, error: clientErr } = await supabase.from('engagement_clients').insert([{
          id: genId('client'), name: business.business_name, slug, type: 'service_lsp',
          engagement_mode: 'financial', status: 'setup', country: business.country, sector: business.sector,
          contact_name: business.contact_name, contact_email: business.contact_email, contact_phone: business.contact_phone,
          clearview_active: true, programme_id: intake?.programme_id || null,
          start_date: new Date().toISOString().split('T')[0],
          notes: `Self-submitted intake. Structure: ${hasUnits?'Multiple units':'Single business'}. ${notes}`,
        }]).select().single()
        if (clientErr) throw clientErr
        client = newClient
      }

      const businessUnits: any[] = []
      const planLines: any[] = []
      const totalMonths = Math.max(pastMonths+futureMonths, 24)

      function buildPlanArray(lineId:string) {
        return Array.from({length:totalMonths},(_,i)=>{
          const offset = i - pastMonths
          return figureData[lineId]?.[offset] || 0
        })
      }

      const keys = hasUnits ? units.filter(u=>u.name).map(u=>u.id) : [wholeKey]
      keys.forEach((key,ki) => {
        const unitName = hasUnits ? units.find(u=>u.id===key)?.name : business.business_name
        businessUnits.push({
          id:key, name:unitName, short:(unitName||'').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,4),
          type:'mixed', color:['#00B4D8','#1A9DAA','#B8860B','#6B4A8B','#1A7A4A'][ki%5],
          headcount:0, active:true, sort_order:ki,
        })
        getProducts(key).filter(p=>p.name).forEach(p => {
          planLines.push({id:`${p.id}_rev`, unit_id:key, name:p.name, category:'revenue', line_type:'standard',
            monthly_plan:buildPlanArray(`${p.id}_rev`), active:true})
          p.costLines.filter(c=>c.name).forEach(c => {
            planLines.push({id:c.id, unit_id:key, name:`${p.name} — ${c.name}`, category:'cost_of_sales', line_type:'standard',
              monthly_plan:buildPlanArray(c.id), active:true})
          })
        })
      })

      if (!hasUnits) {
        commonCosts.filter(l=>l.name).forEach(l => {
          planLines.push({id:l.id, unit_id:wholeKey, name:l.name, category:'direct_opex', line_type:'standard',
            monthly_plan:buildPlanArray(l.id), active:true})
        })
      }

      // Delete any existing config for this client (e.g. from a prior failed submission)
      // so we can resubmit cleanly without a duplicate key error
      await supabase.from('generic_model_config').delete().eq('client_id', client.id)

      const { error: configErr } = await supabase.from('generic_model_config').insert([{
        client_id: client.id, business_name: business.business_name, currency: business.currency,
        start_date: new Date(new Date().setMonth(new Date().getMonth()-pastMonths)).toISOString().split('T')[0],
        planning_months: totalMonths, business_units: businessUnits,
        plan_lines: planLines, shared_lines: [],
        settings: { shared_cost_fixed_pct:0.5, corporate_tax_rate:0.30, opening_cash_balance:0,
          submitted_assets: assets.filter(a=>a.name), structure_confirmed: false },
      }])
      if (configErr) throw configErr

      for (const key of keys) {
        const allLines: {id:string}[] = []
        getProducts(key).filter(p=>p.name).forEach(p => {
          allLines.push({id:`${p.id}_rev`})
          p.costLines.filter(c=>c.name).forEach(c=>allLines.push({id:c.id}))
        })
        for (const line of allLines) {
          for (let offset = -pastMonths; offset < 0; offset++) {
            const val = figureData[line.id]?.[offset]
            if (!val) continue
            const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset)
            const period = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
            await supabase.from('generic_actuals').upsert({
              client_id: client.id, unit_id: key, period,
              line_values: { [line.id]: val },
              submitted: true, submitted_at: new Date().toISOString(),
              submitted_by: business.contact_name, entered_by: business.contact_name,
            }, { onConflict: 'client_id,unit_id,period' })
          }
        }
      }

      // Mark the intake link as used
      if (intakeToken) {
        await supabase.from('client_intake_links').update({
          used: true, used_at: new Date().toISOString()
        }).eq('token', intakeToken)
      }

      setSubmitted(true)
    } catch(e:any) {
      console.error('Intake submission failed:', e)
      setError(e.message || 'Submission failed. Please try again or contact your coach. Error details: ' + JSON.stringify(e).slice(0,200))
    }
    setSubmitting(false)
  }

  if (loading) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.cream}}>Loading...</div>
  if (error && !intake) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.cream}}>
      <div style={{...card,maxWidth:480,textAlign:'center'}}>
        <div style={{color:C.red,marginBottom:'1rem'}}>{error}</div>
        <p style={{color:C.slate,fontSize:'0.88rem'}}>Please contact your coach for a new link.</p>
      </div>
    </div>
  )
  if (submitted) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.cream}}>
      <div style={{...card,maxWidth:480,textAlign:'center'}}>
        <div style={{fontSize:'2rem',marginBottom:'1rem'}}>✓</div>
        <div style={{fontFamily:'Georgia,serif',fontSize:'1.3rem',fontWeight:700,color:C.navy,marginBottom:'0.75rem'}}>Thank you</div>
        <p style={{color:C.slate,fontSize:'0.9rem',lineHeight:1.7}}>Your information has been submitted. Your Canvas Coach will review it and set up your Clearview dashboard. You will receive login details shortly.</p>
      </div>
    </div>
  )

  const activeKeys = hasUnits ? units.filter(u=>u.name).map(u=>u.id) : [wholeKey]

  return (
    <div style={{minHeight:'100vh',background:C.cream,fontFamily:"'Segoe UI',system-ui,sans-serif",padding:'2rem 1rem'}}>
      <div style={{maxWidth:920,margin:'0 auto'}}>
        <div style={{display:'flex',gap:'0.3rem',marginBottom:'1.5rem'}}>
          {STEPS.map((s,i)=><div key={s} style={{flex:1,height:4,borderRadius:2,background:i<=step?C.cyan:C.border}}/>)}
        </div>
        <div style={{fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.4rem'}}>CANVAS COACH — CLEARVIEW DATA CAPTURE</div>
        <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.6rem',fontWeight:700,color:C.navy,marginBottom:'1.75rem'}}>{STEPS[step]}</h1>

        {step===0&&(
          <div style={card}>
            <p style={{fontSize:'0.92rem',color:C.navy,lineHeight:1.8,marginBottom:'1rem'}}>Welcome. This form collects information about your business so we can set up your Clearview financial dashboard.</p>
            <p style={{fontSize:'0.88rem',color:C.slate,lineHeight:1.8,marginBottom:'1rem'}}>For each product or service you sell, you will enter its revenue, and as many cost lines as you need (e.g. feed cost, DOC cost, vaccines), each with its own monthly figures.</p>
            <p style={{fontSize:'0.88rem',color:C.slate,lineHeight:1.8,marginBottom:'1.5rem'}}>Estimates are fine where exact figures are not available. This takes about 20-30 minutes.</p>
            <button style={btn()} onClick={()=>setStep(1)}>Get Started</button>
          </div>
        )}

        {step===1&&(
          <div style={card}>
            <div style={secH}>Tell us about your business</div>
            <div style={fGrid}>
              <div><label style={lbl}>Business Name</label><input style={inp} value={business.business_name} onChange={e=>setBusiness(b=>({...b,business_name:e.target.value}))}/></div>
              <div><label style={lbl}>Your Name</label><input style={inp} value={business.contact_name} onChange={e=>setBusiness(b=>({...b,contact_name:e.target.value}))}/></div>
              <div><label style={lbl}>Email</label><input type="email" style={inp} value={business.contact_email} onChange={e=>setBusiness(b=>({...b,contact_email:e.target.value}))}/></div>
              <div><label style={lbl}>Phone</label><input style={inp} value={business.contact_phone} onChange={e=>setBusiness(b=>({...b,contact_phone:e.target.value}))}/></div>
              <div><label style={lbl}>Country</label><input style={inp} value={business.country} onChange={e=>setBusiness(b=>({...b,country:e.target.value}))}/></div>
              <div><label style={lbl}>Sector</label><input style={inp} placeholder="e.g. Poultry, Crop Aggregation, Livestock" value={business.sector} onChange={e=>setBusiness(b=>({...b,sector:e.target.value}))}/></div>
              <div><label style={lbl}>Currency</label><select style={inp} value={business.currency} onChange={e=>setBusiness(b=>({...b,currency:e.target.value}))}>
                {['UGX','KES','NGN','GHS','USD'].map(c=><option key={c} value={c}>{c}</option>)}
              </select></div>
            </div>
            <div style={{display:'flex',gap:'0.6rem',marginTop:'1.25rem'}}>
              <button style={ghostBtn} onClick={()=>setStep(0)}>Back</button>
              <button style={btn()} disabled={!business.business_name} onClick={()=>setStep(2)}>Continue</button>
            </div>
          </div>
        )}

        {step===2&&(
          <div style={card}>
            <div style={secH}>How is your business structured?</div>
            <p style={{fontSize:'0.85rem',color:C.slate,marginBottom:'1.25rem',lineHeight:1.7}}>Do you operate this business as separate parts — for example different shops or locations — or as one whole business?</p>
            <div style={{display:'flex',gap:'0.75rem',marginBottom:'1.25rem'}}>
              <button style={{...btn(hasUnits===true?C.cyan:C.white),color:hasUnits===true?C.white:C.navy,border:`2px solid ${C.cyan}`,flex:1}} onClick={()=>setHasUnits(true)}>Yes, separate parts</button>
              <button style={{...btn(hasUnits===false?C.cyan:C.white),color:hasUnits===false?C.white:C.navy,border:`2px solid ${C.cyan}`,flex:1}} onClick={()=>setHasUnits(false)}>No, one business</button>
            </div>

            {hasUnits===true&&(
              <div>
                <p style={{fontSize:'0.83rem',color:C.slate,marginBottom:'0.75rem'}}>Name each part of your business (e.g. Shop 1, Farm A, Branch Office):</p>
                {units.map((u,i)=>(
                  <div key={u.id} style={{display:'flex',gap:'0.5rem',marginBottom:'0.5rem'}}>
                    <input style={inp} placeholder="e.g. Shop 1" value={u.name} onChange={e=>updateUnit(i,e.target.value)}/>
                    {units.length>1&&<button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>removeUnit(i)}>×</button>}
                  </div>
                ))}
                <button style={smallBtn()} onClick={addUnit}>+ Add Another Part</button>
                <p style={{fontSize:'0.78rem',color:C.slate,marginTop:'0.75rem'}}>On the next page, you will list the products each part sells.</p>
              </div>
            )}

            {hasUnits===false&&(
              <p style={{fontSize:'0.83rem',color:C.teal,padding:'0.75rem',background:'#EBF8FF',borderRadius:5}}>On the next page, you will list each product or service you sell, with its revenue and cost lines.</p>
            )}

            <div style={{display:'flex',gap:'0.6rem',marginTop:'1.25rem'}}>
              <button style={ghostBtn} onClick={()=>setStep(1)}>Back</button>
              <button style={btn()} disabled={hasUnits===null||(hasUnits&&units.some(u=>!u.name))} onClick={()=>setStep(3)}>Continue</button>
            </div>
          </div>
        )}

        {step===3&&(
          <div style={card}>
            <div style={secH}>Products & Figures</div>
            <div style={{background:'#EBF8FF',borderRadius:6,padding:'0.85rem 1rem',marginBottom:'1.25rem'}}>
              <p style={{fontSize:'0.82rem',color:C.navy,lineHeight:1.6,margin:0}}>
                For each product: name it, then add as many <strong>cost lines</strong> as you need (feed, DOC, vaccines — whatever applies). Enter monthly figures directly in the table below each one. <strong>THIS MONTH</strong> is highlighted — months to its left are the past, months to its right are your plan.
              </p>
            </div>

            <div style={{display:'flex',gap:'1.5rem',marginBottom:'1.5rem',flexWrap:'wrap'}}>
              <div>
                <label style={lbl}>Past months you can provide figures for</label>
                <select style={{...inp,maxWidth:200}} value={pastMonths} onChange={e=>setPastMonths(Number(e.target.value))}>
                  {[0,3,6,12].map(n=><option key={n} value={n}>{n===0?'None — starting fresh':`${n} months back`}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Future months to plan</label>
                <select style={{...inp,maxWidth:200}} value={futureMonths} onChange={e=>setFutureMonths(Number(e.target.value))}>
                  {[3,6,12].map(n=><option key={n} value={n}>{n} months ahead</option>)}
                </select>
              </div>
            </div>

            {(hasUnits===true&&units.filter(u=>u.name).length===0)&&(
              <div style={{background:'#FFF8E8',border:`1px solid ${C.amber}`,borderRadius:6,padding:'0.85rem 1rem',marginBottom:'1.25rem'}}>
                <p style={{margin:0,fontSize:'0.85rem',color:C.amber,fontWeight:600}}>⚠ Please go back to the previous step and give each business part a name before entering figures.</p>
              </div>
            )}
            {hasUnits===true?units.filter(u=>u.name).map(u=>(
              <div key={u.id} style={{marginBottom:'2rem'}}>
                <div style={{fontWeight:700,fontSize:'0.95rem',marginBottom:'0.75rem',padding:'0.5rem 0.75rem',background:C.navy,color:C.white,borderRadius:5}}>{u.name}</div>
                <ProductList unitKey={u.id} products={getProducts(u.id)}
                  addProduct={addProduct} updateProductName={updateProductName} removeProduct={removeProduct}
                  addCostLine={addCostLine} updateCostLineName={updateCostLineName} removeCostLine={removeCostLine}
                  pastMonths={pastMonths} futureMonths={futureMonths} figureData={figureData} setFigure={setFigure} monthLabel={monthLabel} cc={business.currency}/>
              </div>
            )):hasUnits===false?(
              <div>
                <ProductList unitKey={wholeKey} products={getProducts(wholeKey)}
                  addProduct={addProduct} updateProductName={updateProductName} removeProduct={removeProduct}
                  addCostLine={addCostLine} updateCostLineName={updateCostLineName} removeCostLine={removeCostLine}
                  pastMonths={pastMonths} futureMonths={futureMonths} figureData={figureData} setFigure={setFigure} monthLabel={monthLabel} cc={business.currency}/>

                <div style={{marginTop:'2rem',marginBottom:'1.5rem'}}>
                  <div style={{fontWeight:700,fontSize:'0.85rem',color:C.navy,marginBottom:'0.4rem'}}>Common Costs</div>
                  <p style={{fontSize:'0.78rem',color:C.slate,marginBottom:'0.75rem'}}>Costs not tied to one product — staff salaries, rent, admin.</p>
                  {commonCosts.map((l,i)=>(
                    <SimpleLine key={l.id} line={l} idx={i} setter={setCommonCosts} lines={commonCosts}
                      pastMonths={pastMonths} futureMonths={futureMonths} figureData={figureData} setFigure={setFigure} monthLabel={monthLabel} cc={business.currency}/>
                  ))}
                  <button style={smallBtn()} onClick={()=>setCommonCosts(c=>[...c,{id:genId('common'),name:''}])}>+ Add Common Cost</button>
                </div>

                <div style={{marginBottom:'1rem'}}>
                  <div style={{fontWeight:700,fontSize:'0.85rem',color:C.navy,marginBottom:'0.6rem'}}>Assets (equipment, stock, vehicles you own — current value only)</div>
                  {assets.map((a,i)=>(
                    <div key={a.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:'0.5rem',marginBottom:'0.5rem'}}>
                      <input style={inp} placeholder="Asset name" value={a.name} onChange={e=>setAssets(arr=>arr.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/>
                      <input type="number" style={{...inp,textAlign:'right'}} placeholder={`Value (${business.currency})`} value={a.value||''} onChange={e=>setAssets(arr=>arr.map((x,j)=>j===i?{...x,value:Number(e.target.value)}:x))}/>
                      {assets.length>1&&<button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>setAssets(arr=>arr.filter((_,j)=>j!==i))}>×</button>}
                    </div>
                  ))}
                  <button style={smallBtn()} onClick={()=>setAssets(a=>[...a,{id:genId('asset'),name:'',value:0}])}>+ Add Asset</button>
                </div>
              </div>
            ):<div style={{background:'#FDF0EE',border:`1px solid ${C.red}`,borderRadius:6,padding:'0.85rem 1rem'}}><p style={{margin:0,fontSize:'0.85rem',color:C.red}}>Please go back and answer whether your business has multiple parts before entering figures.</p></div>}

            <div style={{marginTop:'1rem'}}><label style={lbl}>Anything else we should know?</label><textarea style={{...inp,minHeight:80,resize:'vertical'}} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
            <div style={{display:'flex',gap:'0.6rem',marginTop:'1.25rem'}}>
              <button style={ghostBtn} onClick={()=>setStep(2)}>Back</button>
              <button style={btn()} onClick={()=>setStep(4)}>Continue</button>
            </div>
          </div>
        )}

        {step===4&&(
          <div style={card}>
            <div style={secH}>Review and Submit</div>
            <div style={{marginBottom:'1rem'}}>
              <div style={{fontWeight:700,color:C.navy,marginBottom:'0.4rem'}}>{business.business_name}</div>
              <div style={{fontSize:'0.85rem',color:C.slate}}>{business.contact_name} · {business.contact_email} · {business.country}</div>
            </div>
            <div style={{marginBottom:'1rem'}}>
              <div style={{fontSize:'0.82rem',fontWeight:600,color:C.navy,marginBottom:'0.4rem'}}>Structure</div>
              <div style={{fontSize:'0.82rem',color:C.slate}}>
                {hasUnits?`${units.filter(u=>u.name).length} separate parts: ${units.filter(u=>u.name).map(u=>u.name).join(', ')}`:'Single business'}
              </div>
              {activeKeys.map(k=>{
                const prods = getProducts(k).filter(p=>p.name)
                return prods.length>0 ? <div key={k} style={{fontSize:'0.8rem',color:C.slate,marginTop:'0.3rem'}}>
                  {hasUnits&&<strong>{units.find(u=>u.id===k)?.name}: </strong>}
                  {prods.map(p=>`${p.name} (${p.costLines.filter(c=>c.name).length} cost line${p.costLines.filter(c=>c.name).length!==1?'s':''})`).join(', ')}
                </div> : null
              })}
            </div>
            <div style={{fontSize:'0.82rem',color:C.slate,marginBottom:'1.25rem'}}>{pastMonths} months of past data · {futureMonths} months forward plan</div>
            {error&&<div style={{color:C.red,fontSize:'0.85rem',marginBottom:'1rem',padding:'0.7rem',background:'#FDF0EE',borderRadius:5}}>{error}</div>}
            <div style={{display:'flex',gap:'0.6rem'}}>
              <button style={ghostBtn} onClick={()=>setStep(3)}>Back</button>
              <button style={btn(C.green)} disabled={submitting} onClick={submit}>{submitting?'Submitting...':'Submit'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ProductList({unitKey,products,addProduct,updateProductName,removeProduct,addCostLine,updateCostLineName,removeCostLine,pastMonths,futureMonths,figureData,setFigure,monthLabel,cc}:any) {
  return (
    <div>
      <p style={{fontSize:'0.82rem',color:C.slate,marginBottom:'0.75rem'}}>List each product or service. Add as many cost lines as apply to it.</p>
      {products.map((p:any,pi:number)=>(
        <div key={p.id} style={{marginBottom:'1rem',border:`1px solid ${C.border}`,borderRadius:6,padding:'0.85rem',background:C.white}}>
          <div style={{display:'flex',gap:'0.5rem',alignItems:'center',marginBottom:'0.6rem'}}>
            <input style={{...inp,fontWeight:700}} placeholder="Product or service name (e.g. Eggs, Off-layers)" value={p.name} onChange={e=>updateProductName(unitKey,pi,e.target.value)}/>
            {products.length>1&&<button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>removeProduct(unitKey,pi)}>×</button>}
          </div>
          <MonthRow label={p.name||'Revenue'} labelColor={C.green} lineId={`${p.id}_rev`} pastMonths={pastMonths} futureMonths={futureMonths} figureData={figureData} setFigure={setFigure} monthLabel={monthLabel}/>
          <div style={{marginTop:'0.5rem',paddingLeft:'0.75rem',borderLeft:`2px solid ${C.border}`}}>
            <div style={{fontSize:'0.76rem',fontWeight:600,color:C.red,marginBottom:'0.3rem'}}>Cost Lines</div>
            {p.costLines.map((c:any,ci:number)=>(
              <div key={c.id} style={{marginBottom:'0.5rem'}}>
                <div style={{display:'flex',gap:'0.5rem',alignItems:'center',marginBottom:'0.3rem'}}>
                  <input style={{...inp,fontSize:'0.82rem'}} placeholder="e.g. Feed, DOC, Vaccines, Labour" value={c.name} onChange={e=>updateCostLineName(unitKey,pi,ci,e.target.value)}/>
                  {p.costLines.length>1&&<button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1rem'}} onClick={()=>removeCostLine(unitKey,pi,ci)}>×</button>}
                </div>
                <MonthRow label={c.name||'Cost'} labelColor={C.red} lineId={c.id} pastMonths={pastMonths} futureMonths={futureMonths} figureData={figureData} setFigure={setFigure} monthLabel={monthLabel} compact/>
              </div>
            ))}
            <button style={smallBtn(C.red)} onClick={()=>addCostLine(unitKey,pi)}>+ Add Cost Line</button>
          </div>
          <p style={{fontSize:'0.68rem',color:C.slate,marginTop:'0.5rem'}}>All figures in {cc}.</p>
        </div>
      ))}
      <button style={smallBtn()} onClick={()=>addProduct(unitKey)}>+ Add Product</button>
    </div>
  )
}

function MonthRow({label,labelColor,lineId,pastMonths,futureMonths,figureData,setFigure,monthLabel,compact}:any) {
  const offsets = []
  for (let i=-pastMonths;i<=futureMonths;i++) offsets.push(i)
  return (
    <div style={{overflowX:'auto'}}>
      <table style={{borderCollapse:'collapse',fontSize:compact?'0.72rem':'0.78rem'}}>
        <thead>
          <tr>
            <th style={{padding:'3px 6px',textAlign:'left',minWidth:90}}></th>
            {offsets.map(o=>(
              <th key={o} style={{
                padding:'3px 5px',textAlign:'center',minWidth:80,
                background:o===0?C.cyan:o<0?'#F4F8FC':'#EBF8FF',
                color:o===0?C.white:C.navy,
                borderLeft:o===0?`2px solid ${C.navy}`:'none',
                borderRight:o===0?`2px solid ${C.navy}`:'none',
                fontWeight:o===0?700:600, fontSize:compact?'0.62rem':'0.68rem',
              }}>{o===0?'THIS MONTH':monthLabel(o)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{padding:'3px 6px',fontWeight:600,color:labelColor,minWidth:90,fontSize:compact?'0.72rem':'0.76rem'}}>{label}</td>
            {offsets.map(o=>(
              <td key={o} style={{padding:'2px 3px',background:o===0?'#F0FBFF':'transparent',borderLeft:o===0?`2px solid ${C.navy}`:'none',borderRight:o===0?`2px solid ${C.navy}`:'none',borderBottom:o===0?`2px solid ${C.navy}`:'none',minWidth:80}}>
                <input type="number" style={{width:'100%',padding:'0.28rem 0.32rem',fontSize:compact?'0.7rem':'0.74rem',textAlign:'right',border:`1px solid ${C.border}`,borderRadius:3,background:C.white,boxSizing:'border-box'}}
                  value={figureData[lineId]?.[o]??''} placeholder="0" onChange={e=>setFigure(lineId,o,Number(e.target.value))}/>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function SimpleLine({line,idx,setter,lines,pastMonths,futureMonths,figureData,setFigure,monthLabel,cc}:any) {
  return (
    <div style={{marginBottom:'0.75rem'}}>
      <div style={{display:'flex',gap:'0.5rem',alignItems:'center',marginBottom:'0.3rem'}}>
        <input style={inp} placeholder="e.g. Staff salaries, Rent" value={line.name} onChange={e=>setter((l:any)=>l.map((x:any,i:number)=>i===idx?{...x,name:e.target.value}:x))}/>
        {lines.length>1&&<button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>setter((l:any)=>l.filter((_:any,i:number)=>i!==idx))}>×</button>}
      </div>
      {line.name&&<MonthRow label={line.name} labelColor={C.navy} lineId={line.id} pastMonths={pastMonths} futureMonths={futureMonths} figureData={figureData} setFigure={setFigure} monthLabel={monthLabel}/>}
    </div>
  )
}

export default function ClientIntakeForm(props:{intakeToken:string}) {
  return (
    <IntakeErrorBoundary>
      <ClientIntakeFormInner {...props}/>
    </IntakeErrorBoundary>
  )
}
