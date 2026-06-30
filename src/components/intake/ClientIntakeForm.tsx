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

const STEPS = ['Welcome','Business Details','Business Units','Historical Data','Forward Plan','Review & Submit']

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
  const [units, setUnits] = useState<any[]>([
    {id:'unit_1', name:'', type:'product', headcount:1}
  ])
  const [historicalMonths, setHistoricalMonths] = useState(6)
  const [historical, setHistorical] = useState<Record<string, Record<string, {revenue:number, costs:number}>>>({})
  const [forwardMonths, setForwardMonths] = useState(12)
  const [forward, setForward] = useState<Record<string, Record<string, {revenue:number, costs:number}>>>({})
  const [notes, setNotes] = useState('')

  useEffect(()=>{
    if (!intakeToken) { setLoading(false); return }
    supabase.from('client_intake_links').select('*').eq('token',intakeToken).single()
      .then(({data,error:err})=>{
        if (err || !data) { setError('This intake link is invalid or has expired.'); }
        else { setIntake(data); setBusiness(b=>({...b, business_name:data.client_name||''})) }
        setLoading(false)
      })
  },[intakeToken])

  function addUnit() {
    setUnits(u=>[...u, {id:`unit_${u.length+1}`, name:'', type:'product', headcount:1}])
  }
  function updateUnit(idx:number, updates:any) {
    setUnits(u=>u.map((unit,i)=>i===idx?{...unit,...updates}:unit))
  }
  function removeUnit(idx:number) {
    setUnits(u=>u.filter((_,i)=>i!==idx))
  }

  function getMonthLabel(offset:number, fromToday=true) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + offset)
    return d.toLocaleString('en-GB',{month:'short',year:'numeric'})
  }

  function updateHistorical(unitId:string, monthIdx:number, field:'revenue'|'costs', val:number) {
    setHistorical(h=>({
      ...h,
      [unitId]: {
        ...h[unitId],
        [monthIdx]: { ...h[unitId]?.[monthIdx], [field]: val }
      }
    }))
  }
  function updateForward(unitId:string, monthIdx:number, field:'revenue'|'costs', val:number) {
    setForward(f=>({
      ...f,
      [unitId]: {
        ...f[unitId],
        [monthIdx]: { ...f[unitId]?.[monthIdx], [field]: val }
      }
    }))
  }

  async function submit() {
    setSubmitting(true)
    try {
      const slug = business.business_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

      // 1. Create client record
      const { data: client, error: clientErr } = await supabase.from('engagement_clients').insert([{
        id: `client_${Date.now()}`,
        name: business.business_name,
        slug,
        type: 'service_lsp',
        engagement_mode: 'financial',
        status: 'setup',
        country: business.country,
        sector: business.sector,
        contact_name: business.contact_name,
        contact_email: business.contact_email,
        contact_phone: business.contact_phone,
        clearview_active: true,
        programme_id: intake?.programme_id || null,
        start_date: business.start_date,
        notes: `Self-submitted intake. ${notes}`,
      }]).select().single()
      if (clientErr) throw clientErr

      // 2. Build business units with plan lines
      const businessUnits = units.map((u,i) => ({
        id: u.id, name: u.name, short: u.name.split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,4),
        type: u.type, color: ['#00B4D8','#1A9DAA','#B8860B','#6B4A8B','#1A7A4A'][i%5],
        headcount: u.headcount, active: true, sort_order: i,
      }))

      const planLines: any[] = []
      units.forEach(u => {
        const fwd = forward[u.id] || {}
        const revPlan = Array.from({length:Math.max(forwardMonths,24)}, (_,i) => fwd[i]?.revenue || 0)
        const costPlan = Array.from({length:Math.max(forwardMonths,24)}, (_,i) => fwd[i]?.costs || 0)
        planLines.push({
          id: `${u.id}_revenue`, unit_id: u.id, name: 'Revenue', category: 'revenue',
          line_type: 'standard', monthly_plan: revPlan, active: true,
        })
        planLines.push({
          id: `${u.id}_costs`, unit_id: u.id, name: 'Cost of Sales', category: 'cost_of_sales',
          line_type: 'standard', monthly_plan: costPlan, active: true,
        })
      })

      // 3. Create generic_model_config
      const { error: configErr } = await supabase.from('generic_model_config').insert([{
        client_id: client.id,
        business_name: business.business_name,
        currency: business.currency,
        start_date: business.start_date,
        planning_months: 24,
        business_units: businessUnits,
        plan_lines: planLines,
        shared_lines: [],
        settings: { shared_cost_fixed_pct: 0.5, corporate_tax_rate: 0.30, opening_cash_balance: 0 },
      }])
      if (configErr) throw configErr

      // 4. Save historical actuals
      for (const u of units) {
        const hist = historical[u.id] || {}
        for (const [monthIdx, vals] of Object.entries(hist)) {
          const d = new Date()
          d.setDate(1)
          d.setMonth(d.getMonth() - historicalMonths + Number(monthIdx))
          const period = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
          await supabase.from('generic_actuals').upsert({
            client_id: client.id, unit_id: u.id, period,
            line_values: { [`${u.id}_revenue`]: vals.revenue||0, [`${u.id}_costs`]: vals.costs||0 },
            submitted: true, submitted_at: new Date().toISOString(),
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
      <div style={{maxWidth:760,margin:'0 auto'}}>
        {/* Progress */}
        <div style={{display:'flex',gap:'0.3rem',marginBottom:'1.5rem'}}>
          {STEPS.map((s,i)=>(
            <div key={s} style={{flex:1,height:4,borderRadius:2,background:i<=step?C.cyan:C.border}}/>
          ))}
        </div>
        <div style={{fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.12em',color:C.cyan,marginBottom:'0.4rem'}}>CANVAS COACH — CLEARVIEW INTAKE</div>
        <h1 style={{fontFamily:'Georgia,serif',fontSize:'1.6rem',fontWeight:700,color:C.navy,marginBottom:'1.75rem'}}>{STEPS[step]}</h1>

        {step===0&&(
          <div style={card}>
            <p style={{fontSize:'0.92rem',color:C.navy,lineHeight:1.8,marginBottom:'1rem'}}>
              Welcome. This form will collect information about your business so we can set up your Clearview financial dashboard.
            </p>
            <p style={{fontSize:'0.88rem',color:C.slate,lineHeight:1.8,marginBottom:'1rem'}}>
              You will be asked for: basic business details, the different parts of your business (units), your past financial performance (as far back as you have records), and your plan for the next 12 to 36 months.
            </p>
            <p style={{fontSize:'0.88rem',color:C.slate,lineHeight:1.8,marginBottom:'1.5rem'}}>
              Estimates are fine where exact figures are not available. This takes about 15-20 minutes. You can save and return later if needed.
            </p>
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
              <div><label style={lbl}>Sector</label><input style={inp} placeholder="e.g. Poultry, Crop Aggregation" value={business.sector} onChange={e=>setBusiness(b=>({...b,sector:e.target.value}))}/></div>
              <div><label style={lbl}>Currency</label><select style={inp} value={business.currency} onChange={e=>setBusiness(b=>({...b,currency:e.target.value}))}>
                {['UGX','KES','NGN','GHS','USD'].map(c=><option key={c} value={c}>{c}</option>)}
              </select></div>
            </div>
            <div style={{display:'flex',gap:'0.6rem',marginTop:'1.25rem'}}>
              <button style={{...btn(C.white),color:C.navy,border:`1px solid ${C.border}`}} onClick={()=>setStep(0)}>Back</button>
              <button style={btn()} disabled={!business.business_name} onClick={()=>setStep(2)}>Continue</button>
            </div>
          </div>
        )}

        {step===2&&(
          <div style={card}>
            <div style={secH}>Your Business Units</div>
            <p style={{fontSize:'0.85rem',color:C.slate,marginBottom:'1rem',lineHeight:1.7}}>
              List the different parts of your business that generate revenue separately. For example: each shop, each product line, or each service you offer. If you only have one, that is fine too.
            </p>
            {units.map((u,i)=>(
              <div key={u.id} style={{display:'grid',gridTemplateColumns:'2fr 1.3fr 1fr auto',gap:'0.6rem',alignItems:'center',marginBottom:'0.6rem',padding:'0.5rem',background:'#F4F8FC',borderRadius:5}}>
                <input style={inp} placeholder="Unit name (e.g. Shop 1)" value={u.name} onChange={e=>updateUnit(i,{name:e.target.value})}/>
                <select style={inp} value={u.type} onChange={e=>updateUnit(i,{type:e.target.value})}>
                  <option value="product">Product / Trading</option>
                  <option value="service">Service</option>
                  <option value="aggregator">Aggregator</option>
                </select>
                <input type="number" style={inp} placeholder="Staff" value={u.headcount||''} onChange={e=>updateUnit(i,{headcount:Number(e.target.value)})}/>
                {units.length>1&&<button style={{background:'transparent',border:'none',color:C.red,cursor:'pointer',fontSize:'1.1rem'}} onClick={()=>removeUnit(i)}>×</button>}
              </div>
            ))}
            <button style={{...btn(C.white),color:C.cyan,border:`1px solid ${C.cyan}`,marginTop:'0.5rem'}} onClick={addUnit}>+ Add Another Unit</button>
            <div style={{display:'flex',gap:'0.6rem',marginTop:'1.25rem'}}>
              <button style={{...btn(C.white),color:C.navy,border:`1px solid ${C.border}`}} onClick={()=>setStep(1)}>Back</button>
              <button style={btn()} disabled={units.some(u=>!u.name)} onClick={()=>setStep(3)}>Continue</button>
            </div>
          </div>
        )}

        {step===3&&(
          <div style={card}>
            <div style={secH}>Past Performance</div>
            <p style={{fontSize:'0.85rem',color:C.slate,marginBottom:'1rem',lineHeight:1.7}}>
              Enter your revenue and costs for as many past months as you have records for. Estimates are fine. This helps us understand your trend.
            </p>
            <div style={{marginBottom:'1rem'}}>
              <label style={lbl}>How many past months can you provide?</label>
              <select style={{...inp,maxWidth:200}} value={historicalMonths} onChange={e=>setHistoricalMonths(Number(e.target.value))}>
                {[0,3,6,12,24,36].map(n=><option key={n} value={n}>{n===0?'None — starting fresh':`${n} months`}</option>)}
              </select>
            </div>
            {historicalMonths>0&&units.map(u=>(
              <div key={u.id} style={{marginBottom:'1.5rem'}}>
                <div style={{fontWeight:700,fontSize:'0.88rem',color:C.navy,marginBottom:'0.6rem'}}>{u.name||'Unnamed unit'}</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.8rem'}}>
                    <thead><tr style={{background:'#F4F8FC'}}>
                      <th style={{padding:'6px 8px',textAlign:'left'}}>Month</th>
                      <th style={{padding:'6px 8px',textAlign:'right'}}>Revenue ({business.currency})</th>
                      <th style={{padding:'6px 8px',textAlign:'right'}}>Costs ({business.currency})</th>
                    </tr></thead>
                    <tbody>
                      {Array.from({length:historicalMonths},(_,i)=>{
                        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-historicalMonths+i)
                        return (
                          <tr key={i}>
                            <td style={{padding:'4px 8px',fontSize:'0.8rem',color:C.slate}}>{d.toLocaleString('en-GB',{month:'short',year:'numeric'})}</td>
                            <td style={{padding:'4px 4px'}}><input type="number" style={{...inp,textAlign:'right',padding:'0.35rem 0.5rem'}} value={historical[u.id]?.[i]?.revenue||''} placeholder="0" onChange={e=>updateHistorical(u.id,i,'revenue',Number(e.target.value))}/></td>
                            <td style={{padding:'4px 4px'}}><input type="number" style={{...inp,textAlign:'right',padding:'0.35rem 0.5rem'}} value={historical[u.id]?.[i]?.costs||''} placeholder="0" onChange={e=>updateHistorical(u.id,i,'costs',Number(e.target.value))}/></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <div style={{display:'flex',gap:'0.6rem',marginTop:'1.25rem'}}>
              <button style={{...btn(C.white),color:C.navy,border:`1px solid ${C.border}`}} onClick={()=>setStep(2)}>Back</button>
              <button style={btn()} onClick={()=>setStep(4)}>Continue</button>
            </div>
          </div>
        )}

        {step===4&&(
          <div style={card}>
            <div style={secH}>Your Plan for the Future</div>
            <p style={{fontSize:'0.85rem',color:C.slate,marginBottom:'1rem',lineHeight:1.7}}>
              Tell us what you expect for the months ahead. If you are not sure of exact figures, give your best estimate based on what you currently see and expect to happen.
            </p>
            <div style={{marginBottom:'1rem'}}>
              <label style={lbl}>How many months ahead would you like to plan?</label>
              <select style={{...inp,maxWidth:200}} value={forwardMonths} onChange={e=>setForwardMonths(Number(e.target.value))}>
                {[12,24,36].map(n=><option key={n} value={n}>{n} months</option>)}
              </select>
            </div>
            {units.map(u=>(
              <div key={u.id} style={{marginBottom:'1.5rem'}}>
                <div style={{fontWeight:700,fontSize:'0.88rem',color:C.navy,marginBottom:'0.6rem'}}>{u.name||'Unnamed unit'}</div>
                <p style={{fontSize:'0.78rem',color:C.slate,marginBottom:'0.5rem'}}>Enter figures for the first few months — we will help you extend the trend with your coach.</p>
                <div style={{overflowX:'auto'}}>
                  <table style={{borderCollapse:'collapse',width:'100%',fontSize:'0.8rem'}}>
                    <thead><tr style={{background:'#F4F8FC'}}>
                      <th style={{padding:'6px 8px',textAlign:'left'}}>Month</th>
                      <th style={{padding:'6px 8px',textAlign:'right'}}>Expected Revenue ({business.currency})</th>
                      <th style={{padding:'6px 8px',textAlign:'right'}}>Expected Costs ({business.currency})</th>
                    </tr></thead>
                    <tbody>
                      {Array.from({length:Math.min(forwardMonths,6)},(_,i)=>{
                        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+i)
                        return (
                          <tr key={i}>
                            <td style={{padding:'4px 8px',fontSize:'0.8rem',color:C.slate}}>{d.toLocaleString('en-GB',{month:'short',year:'numeric'})}</td>
                            <td style={{padding:'4px 4px'}}><input type="number" style={{...inp,textAlign:'right',padding:'0.35rem 0.5rem'}} value={forward[u.id]?.[i]?.revenue||''} placeholder="0" onChange={e=>updateForward(u.id,i,'revenue',Number(e.target.value))}/></td>
                            <td style={{padding:'4px 4px'}}><input type="number" style={{...inp,textAlign:'right',padding:'0.35rem 0.5rem'}} value={forward[u.id]?.[i]?.costs||''} placeholder="0" onChange={e=>updateForward(u.id,i,'costs',Number(e.target.value))}/></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <div><label style={lbl}>Anything else we should know?</label><textarea style={{...inp,minHeight:80,resize:'vertical'}} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
            <div style={{display:'flex',gap:'0.6rem',marginTop:'1.25rem'}}>
              <button style={{...btn(C.white),color:C.navy,border:`1px solid ${C.border}`}} onClick={()=>setStep(3)}>Back</button>
              <button style={btn()} onClick={()=>setStep(5)}>Continue</button>
            </div>
          </div>
        )}

        {step===5&&(
          <div style={card}>
            <div style={secH}>Review and Submit</div>
            <div style={{marginBottom:'1rem'}}>
              <div style={{fontWeight:700,color:C.navy,marginBottom:'0.4rem'}}>{business.business_name}</div>
              <div style={{fontSize:'0.85rem',color:C.slate}}>{business.contact_name} · {business.contact_email} · {business.country}</div>
            </div>
            <div style={{marginBottom:'1rem'}}>
              <div style={{fontSize:'0.82rem',fontWeight:600,color:C.navy,marginBottom:'0.4rem'}}>Business Units ({units.length})</div>
              {units.map(u=><div key={u.id} style={{fontSize:'0.82rem',color:C.slate}}>{u.name} — {u.type} — {u.headcount} staff</div>)}
            </div>
            <div style={{fontSize:'0.82rem',color:C.slate,marginBottom:'1.25rem'}}>
              {historicalMonths} months of historical data · {Math.min(forwardMonths,6)} months of forward plan entered
            </div>
            {error&&<div style={{color:C.red,fontSize:'0.85rem',marginBottom:'1rem',padding:'0.7rem',background:'#FDF0EE',borderRadius:5}}>{error}</div>}
            <div style={{display:'flex',gap:'0.6rem'}}>
              <button style={{...btn(C.white),color:C.navy,border:`1px solid ${C.border}`}} onClick={()=>setStep(4)}>Back</button>
              <button style={btn(C.green)} disabled={submitting} onClick={submit}>{submitting?'Submitting...':'Submit'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
