// ============================================================
// API ROUTE: /api/investment-pitch-conas
// CONAS investment brief — same infographic/box style as generic
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, requesterCanViewClient } from '@/lib/auth/api-authz'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, BorderStyle, WidthType, AlignmentType, ShadingType,
} from 'docx'
import { runCONASModel, defaultCONASInputs } from '@/lib/conas-engine'
import { computeScores, defaultCoachAssessment, dscrLabel, dscrColor, dscrRating } from '@/lib/scoring-engine'
import { CLEARVIEW_STYLE } from '@/lib/ai-style'

const CONAS_CLIENT_ID = '1556298e-5fa0-4d6a-ae86-da8c708ec6ee'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel environment variables.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const NAVY='1B2A4A',CYAN='00B4D8',CREAM='F8F4EE',WHITE='FFFFFF',SLATE='4A5A6A'
const GREEN='1A7A4A',AMBER='B8860B',RED='C0392B',BORDER='D8E0E8',LBBLUE='EBF8FF'

function fmt(n:number,cc:string){if(!n||isNaN(n))return`${cc} 0`;const v=Math.round(Math.abs(n));const s=v>=1000000?`${(v/1000000).toFixed(1)}M`:v>=1000?`${(v/1000).toFixed(0)}K`:v.toString();return`${cc} ${s}${n<0?' (deficit)':''}`}
function pct(n:number){return`${((n||0)*100).toFixed(1)}%`}
function spacer(before=0,after=0){return new Paragraph({children:[new TextRun('')],spacing:{before,after}})}

function sectionHeader(text:string){
  return new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[9360],
    borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},
    rows:[new TableRow({children:[new TableCell({shading:{fill:NAVY,type:ShadingType.CLEAR},margins:{top:120,bottom:120,left:200,right:200},
      children:[new Paragraph({children:[new TextRun({text,bold:true,color:CYAN,size:22,font:'Arial',allCaps:true})]})]})]})],
  })
}

function metricBox(label:string,value:string,sub:string,color:string,width:number){
  const b={style:BorderStyle.SINGLE,size:4,color:CYAN}
  const borders={top:b,bottom:b,left:b,right:b}
  return new TableCell({borders,shading:{fill:LBBLUE,type:ShadingType.CLEAR},width:{size:width,type:WidthType.DXA},
    margins:{top:100,bottom:100,left:140,right:140},children:[
      new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:value,bold:true,color,size:36,font:'Georgia'})]}),
      new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:label,color:NAVY,size:16,font:'Arial',bold:true})]}),
      ...(sub?[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:sub,color:SLATE,size:14,font:'Arial',italics:true})]})]:[] as any[]),
    ],
  })
}

function metricRow(metrics:{label:string;value:string;sub:string;color:string}[]){
  const cw=Math.floor(9360/metrics.length)
  const nb={top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}}
  return new Table({width:{size:9360,type:WidthType.DXA},columnWidths:metrics.map(()=>cw),borders:nb,
    rows:[new TableRow({children:metrics.map(m=>metricBox(m.label,m.value,m.sub,m.color,cw))})],
  })
}

function scoreBadge(label:string,score:string,rating:string,color:string,width:number){
  const b={style:BorderStyle.SINGLE,size:2,color:BORDER}
  const borders={top:b,bottom:b,left:b,right:b}
  return new TableCell({borders,width:{size:width,type:WidthType.DXA},margins:{top:80,bottom:80,left:120,right:120},children:[
    new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:score,bold:true,color,size:28,font:'Georgia'})]}),
    new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:label,color:NAVY,size:16,bold:true,font:'Arial'})]}),
    new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:rating,color,size:15,font:'Arial',italics:true})]}),
  ]})
}

function infoBox(left:string[],right:string[]){
  const b={style:BorderStyle.SINGLE,size:2,color:BORDER}
  const borders={top:b,bottom:b,left:b,right:b}
  const nb={top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}}
  return new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[4500,4860],borders:nb,
    rows:[new TableRow({children:[
      new TableCell({borders,shading:{fill:CREAM,type:ShadingType.CLEAR},width:{size:4500,type:WidthType.DXA},margins:{top:120,bottom:120,left:160,right:160},
        children:left.map(t=>new Paragraph({children:[new TextRun({text:t,size:20,font:'Arial',color:NAVY})]}))}),
      new TableCell({borders,shading:{fill:WHITE,type:ShadingType.CLEAR},width:{size:4860,type:WidthType.DXA},margins:{top:120,bottom:120,left:160,right:160},
        children:right.map(t=>new Paragraph({children:[new TextRun({text:t,size:20,font:'Arial',color:NAVY})]}))}),
    ]})]
  })
}

function shortPara(text:string){
  return new Paragraph({children:[new TextRun({text:text.trim(),size:20,font:'Arial',color:NAVY})],spacing:{after:120},alignment:AlignmentType.JUSTIFIED})
}

async function callClaude(prompt:string):Promise<string>{
  const key=process.env.ANTHROPIC_API_KEY
  if(!key)return''
  const response=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:'claude-opus-4-8',max_tokens:1500,system:CLEARVIEW_STYLE,messages:[{role:'user',content:prompt}]}),
  })
  const data=await response.json()
  return data.content?.[0]?.text||''
}

export async function POST(req:NextRequest){
  try{
    // Confidential CONAS financials — only a caller who may view CONAS
    // (super_coach / CONAS staff / assigned coach·funder) may download it.
    // Previously there was no auth at all.
    if (!(await requesterCanViewClient(getBearerToken(req), CONAS_CLIENT_ID))) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
    }
    const admin=getAdminClient()
    const [{data:client},{data:configRow},{data:coachBriefing},{data:events}]=await Promise.all([
      admin.from('engagement_clients').select('*').eq('id',CONAS_CLIENT_ID).single(),
      admin.from('model_config').select('*').eq('client_id',CONAS_CLIENT_ID).single(),
      admin.from('coach_briefings').select('*').eq('client_id',CONAS_CLIENT_ID).order('generated_at',{ascending:false}).limit(1).maybeSingle(),
      admin.from('management_events').select('*').eq('client_id',CONAS_CLIENT_ID).order('date',{ascending:false}),
    ])

    const inputs=configRow?.config?{...defaultCONASInputs(),...configRow.config}:defaultCONASInputs()
    const result=runCONASModel(inputs)
    const cc=inputs.global?.currency||'UGX'
    const m=result.metrics
    const ebitdaMargin=m.totalRevenue>0?m.totalEBITDA/m.totalRevenue:0
    const grossMargin=m.totalRevenue>0?m.totalGP/m.totalRevenue:0
    const staffCostPct=result.allocUnits.reduce((s:number,u:any)=>s+(result.unitPL[u.id]?.annStaff||0),0)/Math.max(1,m.totalRevenue)
    const totalHeadcount=result.allocUnits.reduce((s:number,u:any)=>s+(u.headcount||0),0)

    const debtObs=(inputs.debts&&inputs.debts.length>0)?inputs.debts:(inputs.capitalStructure?.bankLoan>0?[{drawdownMonth:1,annualRate:inputs.capitalStructure.annualInterestRate??0.18,tenorMonths:(inputs.capitalStructure.loanTenorYears??2)*12,gracePeriodMonths:0,principal:inputs.capitalStructure.bankLoan,repaymentType:'amortising'}]:[])
    const conasTCLines=(inputs.tradeCreditLines||[]).map((l:any)=>({id:l.id,name:l.name,type:l.type,monthly_new:l.monthlyNew||Array(12).fill(0),monthly_settled:l.monthlySettled||Array(12).fill(0)}))
    const scores=computeScores({rev:result.con.rev,ebitda:result.con.ebitda,cogs:result.con.cogs,cashClose:result.cf.close,totalEquity:result.bs.totalEquity?.[11]||0,totalLiabilities:result.bs.totalLiabilities?.[11]||0,months:12,debtObligations:debtObs,tradeCreditLines:conasTCLines,assess:defaultCoachAssessment()})
    const tc=scores.tradeCredit
    const cashWarnings=result.cf.close.filter((v:number)=>v<0).length
    const hasTCData=tc.dso>0||tc.dpo>0
    const hasMarketing=(events?.length||0)>0

    const channelMap:Record<string,{cost:number;customers:number}>={}
    ;(events||[]).forEach((e:any)=>{const ch=e.channel||'Unspecified';if(!channelMap[ch])channelMap[ch]={cost:0,customers:0};channelMap[ch].cost+=e.cost||0;channelMap[ch].customers+=e.customers_acquired||0})
    const channels=Object.entries(channelMap).map(([ch,v])=>({channel:ch,cac:v.customers>0?v.cost/v.customers:null,...v})).sort((a,b)=>(a.cac||999999)-(b.cac||999999))

    const context=`
Business: CONAS Agricultural Hub, crop aggregator, 5 Input Profit Centres, Northern Uganda
Revenue: ${fmt(m.totalRevenue,cc)} | Gross Margin: ${pct(grossMargin)} | EBITDA: ${fmt(m.totalEBITDA,cc)} (${pct(ebitdaMargin)})
FGEs: ${m.fgeCount} | Irrigation kits deployed across season
Investment Readiness: ${scores.irScore}/30 (${scores.irTier}) | Credit Risk: ${scores.score}/100 (${scores.classification}) | DSCR: ${dscrLabel(scores)}
${hasMarketing?`Top channel CAC: ${channels[0]?.channel} at ${channels[0]?.cac?fmt(channels[0].cac,cc):'unquantified'}`:''}
${hasTCData?`DSO: ${tc.dso.toFixed(0)}d | DPO: ${tc.dpo.toFixed(0)}d | Cash conversion gap: ${tc.cashConversionGap.toFixed(0)}d`:''}
${coachBriefing?.briefing_text?`Coach narrative: ${coachBriefing.briefing_text.slice(0,400)}`:''}
Capital: Shareholder ${fmt(inputs.capitalStructure?.shareholderContribution||0,cc)} | Grant non-repayable ${fmt(inputs.capitalStructure?.grantNonRepayable||0,cc)} | Bank loan ${fmt(inputs.capitalStructure?.bankLoan||0,cc)}
`

    const hasApiKey=!!process.env.ANTHROPIC_API_KEY
    let valueProposition='',businessModel='',scaleGrowth='',riskMitigation='',recommendation=''

    if(hasApiKey){
      const [vp,bm,sg,rm,rec]=await Promise.all([
        callClaude(`Write 2 punchy sentences on the value proposition of CONAS Agricultural Hub for an investment brief. It is a crop aggregator with 5 Input Profit Centres and an FGE network in Northern Uganda. Who does it serve, what problem does it solve, what makes it distinctive? No jargon.\n${context}`),
        callClaude(`Write 2 or 3 sentences on how CONAS makes money, covering crop aggregation, input distribution through FGEs, irrigation kit deployment, and input credit recovery. Mention the gross margin and EBITDA. Data:\n${context}`),
        callClaude(`Write 2 sentences on scale potential of CONAS. Current FGE count is ${m.fgeCount}. What enables it to grow without rebuilding? Mention the licensing model and FGE network structure. Data:\n${context}`),
        callClaude(`Name 2 specific risks for CONAS Agricultural Hub and one mitigation for each. Be honest and concrete. Consider seasonal concentration, input credit recovery, and grant dependency. Do not use dashes anywhere. Format: Risk 1: [name]. [one sentence]. Mitigation: [one sentence]. Risk 2: same format.\n${context}`),
        callClaude(`Write 3 sentences giving an investment recommendation for CONAS Agricultural Hub. State clearly: investment-ready, near-ready with conditions, or earlier stage? What is the single most important thing that would improve the case?\n${context}`),
      ])
      valueProposition=vp;businessModel=bm;scaleGrowth=sg;riskMitigation=rm;recommendation=rec
    }

    const children:any[]=[]

    // Cover
    children.push(new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[9360],
      borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},
      rows:[new TableRow({children:[new TableCell({shading:{fill:NAVY,type:ShadingType.CLEAR},margins:{top:200,bottom:200,left:280,right:280},children:[
        new Paragraph({children:[new TextRun({text:'CONAS Agricultural Hub',bold:true,color:WHITE,size:48,font:'Georgia'})]}),
        new Paragraph({children:[new TextRun({text:'Crop Aggregation · Five Input Profit Centres · Northern Uganda',color:CYAN,size:22,font:'Arial'})]}),
        new Paragraph({children:[new TextRun({text:`Investment Readiness Brief · ${new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}`,color:'AAAAAA',size:18,font:'Arial',italics:true})]}),
      ]})]})]
    }))
    children.push(spacer(0,200))

    // Scorecard
    children.push(sectionHeader('Investment Readiness Scorecard'))
    children.push(spacer(0,80))
    const w4=Math.floor(9360/4)
    const nb2={top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}}
    children.push(new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[w4,w4,w4,w4],borders:nb2,rows:[new TableRow({children:[
      scoreBadge('Investment Readiness',`${scores.irScore}/30`,scores.irTier,scores.irScore>=24?GREEN:scores.irScore>=17?CYAN:AMBER,w4),
      scoreBadge('Credit Risk',`${scores.score}/100`,scores.classification,scores.classification==='Stable'?GREEN:scores.classification==='At Risk'?AMBER:RED,w4),
      scoreBadge('Going Concern',`${scores.gcScore}/20`,scores.gcRating,scores.gcRating==='Strong'?GREEN:scores.gcRating==='Adequate'?CYAN:AMBER,w4),
      scoreBadge('DSCR',dscrLabel(scores),dscrRating(scores),dscrColor(scores,{green:GREEN,amber:AMBER,red:RED,slate:SLATE}),w4),
    ]})]}))
    children.push(spacer(0,200))

    // Financial Snapshot
    children.push(sectionHeader('Financial Snapshot'))
    children.push(spacer(0,80))
    children.push(metricRow([
      {label:'Season Revenue',value:fmt(m.totalRevenue,cc),sub:'planned',color:NAVY},
      {label:'Gross Margin',value:pct(grossMargin),sub:'after direct costs',color:grossMargin>0.3?GREEN:AMBER},
      {label:'EBITDA',value:fmt(m.totalEBITDA,cc),sub:pct(ebitdaMargin)+' margin',color:m.totalEBITDA>=0?GREEN:RED},
      {label:'Net Profit',value:fmt(m.totalNPAT,cc),sub:'after tax',color:m.totalNPAT>=0?GREEN:RED},
    ]))
    children.push(spacer(0,80))
    children.push(metricRow([
      {label:'FGEs in Network',value:String(m.fgeCount),sub:'active this season',color:NAVY},
      {label:'Cash Position',value:cashWarnings===0?'Positive':`${cashWarnings} months at risk`,sub:cashWarnings===0?'no shortfall':'requires monitoring',color:cashWarnings===0?GREEN:RED},
      {label:'Revenue Trend',value:scores.revTrend,sub:'across season',color:scores.revTrend==='Growing'?GREEN:scores.revTrend==='Stable'?AMBER:RED},
      {label:'Staff Cost',value:pct(staffCostPct),sub:`${totalHeadcount} staff`,color:staffCostPct<0.35?GREEN:AMBER},
    ]))
    children.push(spacer(0,200))

    // Value Proposition & Business Model
    if(valueProposition||businessModel){
      children.push(sectionHeader('Value Proposition & Business Model'))
      children.push(spacer(0,80))
      children.push(infoBox(
        ['VALUE PROPOSITION','',...(valueProposition?valueProposition.split('\n').filter(Boolean):['Not provided'])],
        ['HOW IT MAKES MONEY','',...(businessModel?businessModel.split('\n').filter(Boolean):['Not provided'])],
      ))
      children.push(spacer(0,200))
    }

    // Input Profit Centres
    const unitMetrics=result.allocUnits.filter((u:any)=>{const pl=result.unitPL[u.id];return pl&&pl.annRev>0}).slice(0,5).map((u:any)=>{
      const pl=result.unitPL[u.id]
      return{label:u.name,value:fmt(pl.annRev,cc),sub:`GP: ${pct(pl.gpMargin)}`,color:pl.gpMargin>0.3?GREEN:AMBER}
    })
    if(unitMetrics.length>0){
      children.push(sectionHeader('Input Profit Centre Performance'))
      children.push(spacer(0,80))
      children.push(metricRow(unitMetrics))
      children.push(spacer(0,200))
    }

    // Marketing
    if(hasMarketing){
      children.push(sectionHeader('Marketing Channels & Customer Acquisition'))
      children.push(spacer(0,80))
      const cacMetrics=channels.slice(0,4).map(ch=>({label:ch.channel,value:ch.cac?fmt(ch.cac,cc):'No count',sub:`${ch.customers} customers · ${fmt(ch.cost,cc)} spend`,color:AMBER}))
      if(cacMetrics.length>0)children.push(metricRow(cacMetrics))
      children.push(spacer(0,200))
    }

    // Trade Credit
    if(hasTCData){
      children.push(sectionHeader('Working Capital & Trade Credit'))
      children.push(spacer(0,80))
      children.push(metricRow([
        {label:'Days to Collect (DSO)',value:`${tc.dso.toFixed(0)}d`,sub:'avg receivable days',color:tc.dso<30?GREEN:tc.dso<60?AMBER:RED},
        {label:'Days to Pay (DPO)',value:`${tc.dpo.toFixed(0)}d`,sub:'avg payable days',color:NAVY},
        {label:'Cash Conversion Gap',value:`${Math.abs(tc.cashConversionGap).toFixed(0)}d`,sub:tc.cashConversionGap<=0?'supplier-financed':'cash tied up',color:tc.cashConversionGap<=0?GREEN:tc.cashConversionGap>30?RED:AMBER},
        {label:'Peak Receivable',value:fmt(tc.peakReceivable,cc),sub:'highest outstanding',color:NAVY},
      ]))
      children.push(spacer(0,200))
    }

    // Scale
    if(scaleGrowth){
      children.push(sectionHeader('Scale Potential & Growth Levers'))
      children.push(spacer(0,80))
      scaleGrowth.split('\n').filter(Boolean).forEach((t:string)=>children.push(shortPara(t)))
      children.push(spacer(0,200))
    }

    // Risk
    if(riskMitigation){
      children.push(sectionHeader('Key Risks & Mitigations'))
      children.push(spacer(0,80))
      riskMitigation.split('\n').filter(Boolean).forEach((t:string)=>children.push(shortPara(t)))
      children.push(spacer(0,200))
    }

    // Recommendation
    children.push(sectionHeader('Investment Recommendation'))
    children.push(spacer(0,80))
    if(recommendation){recommendation.split('\n').filter(Boolean).forEach((t:string)=>children.push(shortPara(t)))}
    else{children.push(shortPara(`Investment Readiness: ${scores.irTier} (${scores.irScore}/30). Credit Risk: ${scores.classification} (${scores.score}/100). DSCR: ${dscrLabel(scores)}.`))}
    children.push(spacer(0,200))

    // Footer
    children.push(new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[9360],
      borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}},
      rows:[new TableRow({children:[new TableCell({shading:{fill:NAVY,type:ShadingType.CLEAR},margins:{top:100,bottom:100,left:200,right:200},children:[
        new Paragraph({alignment:AlignmentType.CENTER,children:[
          new TextRun({text:'Powered by ',color:'AAAAAA',size:16,font:'Arial'}),
          new TextRun({text:'Canvas Coach Clearview',color:CYAN,size:16,font:'Arial',bold:true}),
          new TextRun({text:'  ·  habibonifade.com  ·  Confidential. Not for circulation without permission',color:'AAAAAA',size:16,font:'Arial'}),
        ]}),
      ]})]})]
    }))

    const doc=new Document({
      styles:{default:{document:{run:{font:'Arial',size:20,color:NAVY}}}},
      sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:720,right:720,bottom:720,left:720}}},children}],
    })

    const buffer=await Packer.toBuffer(doc)
    return new NextResponse(new Uint8Array(buffer),{status:200,headers:{
      'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition':'attachment; filename="CONAS_Investment_Brief.docx"',
    }})
  }catch(err:any){
    console.error('CONAS pitch error:',err)
    return NextResponse.json({error:'Could not generate the brief.'},{status:500})
  }
}
