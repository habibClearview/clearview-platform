// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
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

const STEPS = ['Welcome','Business Details','Business Structure','Financial Data','Review & Submit']

function genId(prefix:string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}` }

export default function ClientIntakeForm({intakeToken}:{intakeToken:string}) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [intake, setIntake] = useState<any>(null)

  const [business, setBusiness] = useState({
    business_name:'', contact_name:'', contact_email:'', contact_phone:'',
    country:'Uganda', sector:'', currency:'UGX', start_date:new Date().toISOString().split('T')[0],
  })

  // Structure question
  const [hasUnits, setHasUnits] = useState<boolean|null>(null)
  const [units, setUnits] = useState<{id:string,name:string}[]>([{id:genId('unit'),name:''}])

  // Per-unit lines (used when hasUnits === true)
  // structure: { unitId: { revenueLines: [{id,name}], costLines: [{id,name}] } }
  const [unitLines, setUnitLines] = useState<Record<string,{revenueLines:{id:string,name:string}[],costLines:{id:string,name:string}[]}>>({})

  // Whole-business lines (used when hasUnits === false)
  const [revenueLines, setRevenueLines] = useState<{id:string,name:string}[]>([{id:genId('rev'),name:''}])
  const [costLines, setCostLines] = useState<{id:string,name:string}[]>([{id:genId('cost'),name:''}])
  const [commonCosts, setCommonCosts] = useState<{id:string,name:string}[]>([{id:genId('common'),name:''}])
  const [assets, setAssets] = useState<{id:string,name:string,value:number}[]>([{id:genId('asset'),name:'',value:0}])

  const [historicalMonths, setHistoricalMonths] = useState(6)
  const [forwardMonths, setForwardMonths] = useState(12)
  // historicalData / forwardData: { lineId: { monthIdx: amount } }
  const [historicalData, setHistoricalData] = useState<Record<string,Record<number,number>>>({})
  const [forwardData, setForwardData] = useState<Record<string,Record<number,number>>>({})
  const [notes, setNotes] = useState('')

  useEffect(()=>{
    if (!intakeToken) { setLoading(false); return }
    supabase.from('client_intake_links').select('*').eq('token',intakeToken).single()
      .then(({data,error:err})=>{
        if (err || !data) setError('This intake link is invalid or has expired.')
        else { setIntake(data); setBusiness(b=>({...b, business_name:data.client_name||''})) }
        setLoading(false)
      })
  },[intakeToken])

  function setHist(lineId:string, monthIdx:number, val:number) {
    setHistoricalData(h=>({...h,[lineId]:{...h[lineId],[monthIdx]:val}}))
  }
  function setFwd(lineId:string, monthIdx:number, val:number) {
    setForwardData(f=>({...f,[lineId]:{...f[lineId],[monthIdx]:val}}))
  }

  function addUnit() { setUnits(u=>[...u,{id:genId('unit'),name:''}]) }
  function updateUnit(idx:number, name:string) { setUnits(u=>u.map((x,i)=>i===idx?{...x,name}:x)) }
  function removeUnit(idx:number) { setUnits(u=>u.filter((_,i)=>i!==idx)) }

  function getUnitLines(unitId:string) {
    return unitLines[unitId] || {revenueLines:[{id:genId('rev'),name:''}], costLines:[{id:genId('cost'),name:''}]}
  }
  function addUnitLine(unitId:string, kind:'revenueLines'|'costLines') {
    setUnitLines(ul=>{
      const cur = ul[unitId] || {revenueLines:[],costLines:[]}
      return {...ul,[unitId]:{...cur,[kind]:[...cur[kind],{id:genId(kind==='revenueLines'?'rev':'cost'),name:''}]}}
    })
  }
  function updateUnitLine(unitId:string, kind:'revenueLines'|'costLines', lineId:string, name:string) {
    setUnitLines(ul=>{
      const cur = ul[unitId] || {revenueLines:[],costLines:[]}
      return {...ul,[unitId]:{...cur,[kind]:cur[kind].map(l=>l.id===lineId?{...l,name}:l)}}
    })
  }

  function addLine(setter:any, prefix:string) { setter((l:any)=>[...l,{id:genId(prefix),name:''}]) }
  function updateLine(setter:any, idx:number, name:string) { setter((l:any)=>l.map((x:any,i:number)=>i===idx?{...x,name}:x)) }
  function removeLine(setter:any, idx:number) { setter((l:any)=>l.filter((_:any,i:number)=>i!==idx)) }

  function monthLabel(offset:number, isHistorical:boolean) {
    const d = new Date(); d.setDate(1)
    d.setMonth(d.getMonth() + (isHistorical ? -historicalMonths+offset : offset))
    return d.toLocaleString('en-GB',{month:'short',year:'numeric'})
  }

  async function submit() {
    setSubmitting(true)
    try {
      const slug = business.business_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

      const { data: client, error: clientErr } = await supabase.from('engagement_clients').insert([{
        id: genId('client'), name: business.business_name, slug, type: 'service_lsp',
        engagement_mode: 'financial', status: 'setup', country: business.country, sector: business.sector,
        contact_name: business.contact_name, contact_email: business.contact_email, contact_phone: business.contact_phone,
        clearview_active: true, programme_id: intake?.programme_id || null, start_date: business.start_date,
        notes: `Self-submitted intake. Structure: ${hasUnits?'Multiple units':'Single business'}. ${notes}`,
      }]).select().single()
      if (clientErr) throw clientErr

      const businessUnits: any[] = []
      const planLines: any[] = []

      if (hasUnits) {
        units.forEach((u,i) => {
          businessUnits.push({
            id:u.id, name:u.name, short:u.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,4),
            type:'product', color:['#00B4D8','#1A9DAA','#B8860B','#6B4A8B','#1A7A4A'][i%5],
            headcount:0, active:true, sort_order:i,
          })
          const lines = getUnitLines(u.id)
          lines.revenueLines.filter(l=>l.name).forEach(l => {
            planLines.push({id:l.id, unit_id:u.id, name:l.name, category:'revenue', line_type:'standard',
              monthly_plan:Array.from({length:Math.max(forwardMonths,24)},(_,i)=>forwardData[l.id]?.[i]||0), active:true})
          })
          lines.costLines.filter(l=>l.name).forEach(l => {
            planLines.push({id:l.id, unit_id:u.id, name:l.name, category:'cost_of_sales', line_type:'standard',
              monthly_plan:Array.from({length:Math.max(forwardMonths,24)},(_,i)=>forwardData[l.id]?.[i]||0), active:true})
          })
        })
      } else {
        const wholeUnitId = genId('unit')
        businessUnits.push({id:wholeUnitId, name:business.business_name, short:'MAIN', type:'mixed',
          color:'#00B4D8', headcount:0, active:true, sort_order:0})
        revenueLines.filter(l=>l.name).forEach(l => {
          planLines.push({id:l.id, unit_id:wholeUnitId, name:l.name, category:'revenue', line_type:'standard',
            monthly_plan:Array.from({length:Math.max(forwardMonths,24)},(_,i)=>forwardData[l.id]?.[i]||0), active:true})
        })
        costLines.filter(l=>l.name).forEach(l => {
          planLines.push({id:l.id, unit_id:wholeUnitId, name:l.name, category:'cost_of_sales', line_type:'standard',
            monthly_plan:Array.from({length:Math.max(forwardMonths,24)},(_,i)=>forwardData[l.id]?.[i]||0), active:true})
        })
        commonCosts.filter(l=>l.name).forEach(l => {
          planLines.push({id:l.id, unit_id:wholeUnitId, name:l.name, category:'direct_opex', line_type:'standard',
            monthly_plan:Array.from({length:Math.max(forwardMonths,24)},(_,i)=>forwardData[l.id]?.[i]||0), active:true})
        })
      }

      const { error: configErr } = await supabase.from('generic_model_config').insert([{
        client_id: client.id, business_name: business.business_name, currency: business.currency,
        start_date: business.start_date, planning_months: 24, business_units: businessUnits,
        plan_lines: planLines, shared_lines: [],
        settings: { shared_cost_fixed_pct:0.5, corporate_tax_rate:0.30, opening_cash_balance:0,
          submitted_assets: assets.filter(a=>a.name), structure_confirmed: false },
      }])
      if (configErr) throw configErr

      // Historical actuals
      const allLines = planLines
      for (const l of allLines) {
        const hist = historicalData[l.id] || {}
        for (const [monthIdx, amount] of Object.entries(hist)) {
          if (!amount) continue
          const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-historicalMonths+Number(monthIdx))
          const period = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
          await supabase.from('generic_actuals').upsert({
            client_id: client.id, unit_id: l.unit_id, period,
            line_values: { [l.id]: amount }, submitted: true, submitted_at: new Date().toISOString(),
            submitted_by: business.contact_name, entered_by: business.contact_name,
          }, { onConflict: 'client_id,unit_id,period' })
        }
      }

      setSubmitted(true)
    } catch(e:any) {
      setError(e.message || 'Submission failed. Please try again or contact your coach.')
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

  return (
    <div style={{minHeight:'100vh',background:C.cream,fontFamily:"'Segoe UI',system-ui,sans-serif",padding:'2rem 1rem'}}>
      <div style={{maxWidth:800,margin:'0 auto'}}>
        <div style={{display:'flex',gap:'0.3rem',marginBottom:'1.5rem'}}>
          {STEPS.map((s,i)=><div key={s} style={{flex:1,height:4,borderRadius:2,background:i<=step?C.cyan:C.border}}/>)}
        </div>
        <div style={{fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.4rem'}}>CANVAS COACH — CLEARVIEW DATA CAPTURE</div>
        <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.6rem',fontWeight:700,color:C.navy,marginBottom:'1.75rem'}}>{STEPS[step]}</h1>

        {step===0&&(
          <div style={card}>
            <p style={{fontSize:'0.92rem',color:C.navy,lineHeight:1.8,marginBottom:'1rem'}}>Welcome. This form collects information about your business so we can set up your Clearview financial dashboard.</p>
            <p style={{fontSize:'0.88rem',color:C.slate,lineHeight:1.8,marginBottom:'1rem'}}>You will be asked for: basic business details, how your business is structured, and your financial figures — past months where available, and your plan for the months ahead.</p>
            <p style={{fontSize:'0.88rem',color:C.slate,lineHeight:1.8,marginBottom:'1.5rem'}}>Estimates are fine where exact figures are not available. This takes about 15-20 minutes.</p>
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
            <p style={{fontSize:'0.85rem',color:C.slate,marginBottom:'1.25rem',lineHeight:1.7}}>Do you operate this business as separate parts — for example different shops, products, or services that you track separately — or as one whole business?</p>
            <div style={{display:'flex',gap:'0.75rem',marginBottom:'1.25rem'}}>
              <button style={{...btn(hasUnits===true?C.cyan:C.white),color:hasUnits===true?C.white:C.navy,border:`2px solid ${C.cyan}`,flex:1}} onClick={()=>setHasUnits(true)}>Yes, separate parts</button>
              <button style={{...btn(hasUnits===false?C.cyan:C.white),color:hasUnits===false?C.white:C.navy,border:`2px solid ${C.cyan}`,flex:1}} onClick={()=>setHasUnits(false)}>No, one business</button>
            </div>

            {hasUnits===true&&(
              <div>
                <p style={{fontSize:'0.83rem',color:C.slate,marginBottom:'0.75rem'}}>Name each part of your business:</p>
                {units.map((u,i)=>(
                  <div key={u.id} style={{display:'flex',gap:'0.5rem',marginBottom:'0.5rem'}}>
                    <input style={inp} placeholder="e.g. Shop 1, Eggs, Advisory Services" value={u.name} onChange={e=>updateUnit(i,e.target.value)}/>
                    {units.length>1&&<button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>removeUnit(i)}>×</button>}
                  </div>
                ))}
                <button style={smallBtn()} onClick={addUnit}>+ Add Another Part</button>
              </div>
            )}

            {hasUnits===false&&(
              <p style={{fontSize:'0.83rem',color:C.teal,padding:'0.75rem',background:'#EBF8FF',borderRadius:5}}>You will enter revenue by product, costs by product, common costs, and assets in the next step.</p>
            )}

            <div style={{display:'flex',gap:'0.6rem',marginTop:'1.25rem'}}>
              <button style={ghostBtn} onClick={()=>setStep(1)}>Back</button>
              <button style={btn()} disabled={hasUnits===null||(hasUnits&&units.some(u=>!u.name))} onClick={()=>setStep(3)}>Continue</button>
            </div>
          </div>
        )}

        {step===3&&(
          <div style={card}>
            <div style={secH}>Financial Data</div>
            <div style={{display:'flex',gap:'1.5rem',marginBottom:'1.5rem',flexWrap:'wrap'}}>
              <div>
                <label style={lbl}>Past months you can provide</label>
                <select style={{...inp,maxWidth:200}} value={historicalMonths} onChange={e=>setHistoricalMonths(Number(e.target.value))}>
                  {[0,3,6,12,24,36].map(n=><option key={n} value={n}>{n===0?'None — starting fresh':`${n} months`}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Months ahead to plan</label>
                <select style={{...inp,maxWidth:200}} value={forwardMonths} onChange={e=>setForwardMonths(Number(e.target.value))}>
                  {[12,24,36].map(n=><option key={n} value={n}>{n} months</option>)}
                </select>
              </div>
            </div>

            {hasUnits===true&&units.map(u=>{
              const lines = getUnitLines(u.id)
              return (
                <div key={u.id} style={{marginBottom:'2rem',padding:'1rem',background:'#F4F8FC',borderRadius:6}}>
                  <div style={{fontWeight:700,fontSize:'0.92rem',color:C.navy,marginBottom:'1rem'}}>{u.name}</div>
                  <LineGroup label="Revenue Lines" lines={lines.revenueLines} kind="revenueLines" unitId={u.id}
                    addUnitLine={addUnitLine} updateUnitLine={updateUnitLine}
                    historicalMonths={historicalMonths} forwardMonths={forwardMonths}
                    historicalData={historicalData} forwardData={forwardData} setHist={setHist} setFwd={setFwd}
                    monthLabel={monthLabel} cc={business.currency}/>
                  <LineGroup label="Cost Lines" lines={lines.costLines} kind="costLines" unitId={u.id}
                    addUnitLine={addUnitLine} updateUnitLine={updateUnitLine}
                    historicalMonths={historicalMonths} forwardMonths={forwardMonths}
                    historicalData={historicalData} forwardData={forwardData} setHist={setHist} setFwd={setFwd}
                    monthLabel={monthLabel} cc={business.currency}/>
                </div>
              )
            })}

            {hasUnits===false&&(
              <div>
                <SimpleLineGroup label="Revenue by Product" lines={revenueLines} setter={setRevenueLines}
                  historicalMonths={historicalMonths} forwardMonths={forwardMonths}
                  historicalData={historicalData} forwardData={forwardData} setHist={setHist} setFwd={setFwd}
                  monthLabel={monthLabel} cc={business.currency} addLine={addLine} updateLine={updateLine} removeLine={removeLine} prefix="rev"/>
                <SimpleLineGroup label="Cost by Product" lines={costLines} setter={setCostLines}
                  historicalMonths={historicalMonths} forwardMonths={forwardMonths}
                  historicalData={historicalData} forwardData={forwardData} setHist={setHist} setFwd={setFwd}
                  monthLabel={monthLabel} cc={business.currency} addLine={addLine} updateLine={updateLine} removeLine={removeLine} prefix="cost"/>
                <SimpleLineGroup label="Common Costs (staff, rent, admin — not tied to one product)" lines={commonCosts} setter={setCommonCosts}
                  historicalMonths={historicalMonths} forwardMonths={forwardMonths}
                  historicalData={historicalData} forwardData={forwardData} setHist={setHist} setFwd={setFwd}
                  monthLabel={monthLabel} cc={business.currency} addLine={addLine} updateLine={updateLine} removeLine={removeLine} prefix="common"/>
                <div style={{marginBottom:'1.5rem'}}>
                  <div style={{fontWeight:700,fontSize:'0.85rem',color:C.navy,marginBottom:'0.6rem'}}>Assets (equipment, stock, vehicles you own)</div>
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
            )}

            <div><label style={lbl}>Anything else we should know?</label><textarea style={{...inp,minHeight:80,resize:'vertical'}} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
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
              <div style={{fontSize:'0.82rem',color:C.slate}}>{hasUnits?`${units.length} separate parts: ${units.map(u=>u.name).join(', ')}`:'Single business with itemised revenue, costs, common costs, and assets'}</div>
            </div>
            <div style={{fontSize:'0.82rem',color:C.slate,marginBottom:'1.25rem'}}>{historicalMonths} months of historical data · {forwardMonths} months forward plan</div>
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

function LineGroup({label,lines,kind,unitId,addUnitLine,updateUnitLine,historicalMonths,forwardMonths,historicalData,forwardData,setHist,setFwd,monthLabel,cc}:any) {
  const [expanded, setExpanded] = useState<Record<string,boolean>>({})
  return (
    <div style={{marginBottom:'1.25rem'}}>
      <div style={{fontWeight:700,fontSize:'0.82rem',color:C.navy,marginBottom:'0.5rem'}}>{label}</div>
      {lines.map((l:any)=>(
        <div key={l.id} style={{marginBottom:'0.5rem'}}>
          <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
            <input style={inp} placeholder="Line name" value={l.name} onChange={e=>updateUnitLine(unitId,kind,l.id,e.target.value)}/>
            {l.name&&<button style={smallBtn()} onClick={()=>setExpanded(x=>({...x,[l.id]:!x[l.id]}))}>{expanded[l.id]?'Hide':'Enter figures'}</button>}
          </div>
          {expanded[l.id]&&l.name&&<MonthGrid lineId={l.id} historicalMonths={historicalMonths} forwardMonths={forwardMonths} historicalData={historicalData} forwardData={forwardData} setHist={setHist} setFwd={setFwd} monthLabel={monthLabel} cc={cc}/>}
        </div>
      ))}
      <button style={smallBtn()} onClick={()=>addUnitLine(unitId,kind)}>+ Add Line</button>
    </div>
  )
}

function SimpleLineGroup({label,lines,historicalMonths,forwardMonths,historicalData,forwardData,setHist,setFwd,monthLabel,cc,addLine,updateLine,removeLine,setter,prefix}:any) {
  const [expanded, setExpanded] = useState<Record<string,boolean>>({})
  return (
    <div style={{marginBottom:'1.5rem'}}>
      <div style={{fontWeight:700,fontSize:'0.85rem',color:C.navy,marginBottom:'0.6rem'}}>{label}</div>
      {lines.map((l:any,i:number)=>(
        <div key={l.id} style={{marginBottom:'0.5rem'}}>
          <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
            <input style={inp} placeholder="Line name" value={l.name} onChange={e=>updateLine(setter,i,e.target.value)}/>
            {l.name&&<button style={smallBtn()} onClick={()=>setExpanded(x=>({...x,[l.id]:!x[l.id]}))}>{expanded[l.id]?'Hide':'Enter figures'}</button>}
            {lines.length>1&&<button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>removeLine(setter,i)}>×</button>}
          </div>
          {expanded[l.id]&&l.name&&<MonthGrid lineId={l.id} historicalMonths={historicalMonths} forwardMonths={forwardMonths} historicalData={historicalData} forwardData={forwardData} setHist={setHist} setFwd={setFwd} monthLabel={monthLabel} cc={cc}/>}
        </div>
      ))}
      <button style={smallBtn()} onClick={()=>addLine(setter,prefix)}>+ Add Line</button>
    </div>
  )
}

function MonthGrid({lineId,historicalMonths,forwardMonths,historicalData,forwardData,setHist,setFwd,monthLabel,cc}:any) {
  return (
    <div style={{marginTop:'0.5rem',padding:'0.75rem',background:C.white,borderRadius:5,border:`1px solid ${C.border}`}}>
      {historicalMonths>0&&(
        <div style={{marginBottom:'0.6rem'}}>
          <div style={{fontSize:'0.7rem',color:C.slate,marginBottom:'0.3rem'}}>Historical ({cc})</div>
          <div style={{display:'flex',gap:'0.4rem',overflowX:'auto',paddingBottom:'0.3rem'}}>
            {Array.from({length:historicalMonths},(_,i)=>(
              <div key={i} style={{minWidth:90}}>
                <div style={{fontSize:'0.65rem',color:C.slate,marginBottom:'0.15rem'}}>{monthLabel(i,true)}</div>
                <input type="number" style={{...inp,padding:'0.3rem 0.4rem',fontSize:'0.78rem',textAlign:'right'}} value={historicalData[lineId]?.[i]||''} placeholder="0" onChange={e=>setHist(lineId,i,Number(e.target.value))}/>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <div style={{fontSize:'0.7rem',color:C.slate,marginBottom:'0.3rem'}}>Forward Plan ({cc})</div>
        <div style={{display:'flex',gap:'0.4rem',overflowX:'auto',paddingBottom:'0.3rem'}}>
          {Array.from({length:Math.min(forwardMonths,12)},(_,i)=>(
            <div key={i} style={{minWidth:90}}>
              <div style={{fontSize:'0.65rem',color:C.slate,marginBottom:'0.15rem'}}>{monthLabel(i,false)}</div>
              <input type="number" style={{...inp,padding:'0.3rem 0.4rem',fontSize:'0.78rem',textAlign:'right'}} value={forwardData[lineId]?.[i]||''} placeholder="0" onChange={e=>setFwd(lineId,i,Number(e.target.value))}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
