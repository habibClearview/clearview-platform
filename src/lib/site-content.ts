// ============================================================
// THE PUBLIC SITE'S CONTENT, AS APPROVED.
//
// Every string here comes from the design Habib approved. It is kept as data
// rather than typed into components so that a difference between what was
// approved and what the site renders is a diff somebody can read, and so the
// same service description cannot say two things on two pages.
//
// The originals are committed beside the handoff in docs/site-design/data.
//
// ON THE COLOURS. The four canvas column colours carry meaning: gold is
// internal capability, navy is the connecting layer, teal is the external
// market, purple is the threshold decision. They are not decoration and must
// not be reassigned.
// ============================================================

export const GOLD = '#c9a84c'
export const NAVY = '#1b2a41'
export const TEAL = '#00767a'
export const PURPLE = '#6b4a8b'

// ─── The five services ──────────────────────────────────────
export interface Service {
  key: string
  /** The address this service lives at. */
  slug: string
  tag: string
  name: string
  kind: 'Advisory' | 'Subscription'
  kindBg: string
  kindInk: string
  /** The sentence a reader recognises themselves in. */
  mirror: string
  blurb: string
  ctaLabel: string
  /** Where the call to action goes. */
  ctaHref: string
  what: string
  cost: string
  does: string
  who: string
  ctaHead: string
  ctaBody: string
}

export const SERVICES: Service[] = [
  {
    key: 'gtcv', slug: 'grant-to-commercial-viability',
    tag: 'Grant to Commercial Viability', name: 'Grant to Commercial Viability Canvas',
    kind: 'Advisory', kindBg: '#00afef', kindInk: '#12222c',
    mirror: 'Our funding ends and nobody is paying us yet.',
    blurb: 'I find which of your services somebody will pay for, what it really costs you to deliver, and who holds that budget. Then we sell to one real customer while your funding is still there.',
    ctaLabel: 'Score your organisation', ctaHref: '/score',
    what: 'You do good work. A donor pays for it. When that money stops, there is nobody to send an invoice to.',
    cost: 'Most organisations spend their last funded year writing another proposal. If it lands, you have bought twelve months. If it does not, you have spent your final year of runway on a raffle ticket.',
    does: 'Nine decisions, taken in order. Which of your services somebody will pay for. What it really costs you to deliver them. Who inside a client organisation holds that budget. Then we sell to one real customer while your funding is still there, so you can afford to be wrong.',
    who: 'The obvious reader is a charity whose grant is ending. The other one is a managing director whose business already trades but has one service inside it paid for by a funder rather than by the person using it. That subsidy ends the same way a grant does.',
    ctaHead: 'Start with the ten questions.',
    ctaBody: 'Two minutes, and you will know which of the nine decisions your work actually starts at.',
  },
  {
    key: 'intel', slug: 'market-intelligence',
    tag: 'Market Intelligence', name: 'Market Intelligence',
    kind: 'Subscription', kindBg: '#c9a84c', kindInk: '#2a1c04',
    mirror: 'How much can this business absorb, and what changes if we invest?',
    blurb: 'A system that collects real transaction data from every business in your portfolio, week by week, and tells you who to back, how much they can take, and what changes if you do.',
    ctaLabel: 'Join as a founding subscriber', ctaHref: '/contact',
    what: 'That is a genuinely hard question. The accounts rarely show it. A survey will not find it. Ask the owner and you get an optimistic number.',
    cost: 'So the call gets made on relationship and instinct. Money lands in a business that cannot use it yet, and it costs you twice. The money underperforms, and the business carries a debt it was not ready for.',
    does: 'A system that enrols each business in your portfolio and then collects, collates and analyses their real transaction data, week by week, from their own records. You get one place to watch every business partner you fund. Which to back. How much each can absorb. Which instrument fits. And what changes, in the enterprise and in the market around it. I am building the data layer now with a live client, so founding subscribers shape what gets measured and see the first reports.',
    who: 'Funders, investors, development finance institutions and programme managers holding a portfolio of businesses and no reliable way to rank them.',
    ctaHead: 'Founding subscribers shape what gets measured.',
    ctaBody: 'The data layer is being built now with a live client. Register your interest and I will show you the first reports as they come.',
  },
  {
    key: 'icc', slug: 'investment-case',
    tag: 'Investment Case', name: 'The Investment Case Canvas',
    kind: 'Advisory', kindBg: '#00afef', kindInk: '#12222c',
    mirror: 'We asked for money and got turned down. Nobody told us why.',
    blurb: 'Usually the case was built in the wrong order, with the ask first and the evidence last. I rebuild it the other way round, so the money can see how it comes back.',
    ctaLabel: 'Send me your case', ctaHref: '/contact',
    what: 'You have a good programme and real numbers. But the people with capital could not see how they get their money back, or who carries the loss if it goes wrong. So they said no, politely, without explaining.',
    cost: 'Every no makes the next one harder. You cannot walk the same case back into the same room and expect a different answer.',
    does: 'Eight steps, then a fork. First, where the money is actually stuck, and whether the real problem is missing data or a wrong belief about risk. Then which kind of money fits, whether that is a loan, a guarantee, equity or a grant that gets repaid. Then proof that people want the thing and can pay for it. The ask comes last, once the evidence is sitting in front of it.',
    who: 'Programmes and businesses that need to raise capital, and the funders and development finance institutions building the vehicle the money would come from.',
    ctaHead: 'Send me the case that got turned down.',
    ctaBody: 'I will tell you which of the eight steps is missing, before you take it anywhere else.',
  },
  {
    key: 'idcms', slug: 'intervention-design',
    tag: 'Intervention Design', name: 'Intervention Design Canvas',
    kind: 'Advisory', kindBg: '#00afef', kindInk: '#12222c',
    mirror: 'When our programme closes, will any of this still be running?',
    blurb: 'Your whole design on one page, as nine numbered decisions your team, partners and donor can all read. Built so a private business makes money from keeping it going after you leave.',
    ctaLabel: 'Talk about your programme', ctaHref: '/contact',
    what: 'Programmes spend years building something that stops the month the money stops. It happens when everybody delivering the work was paid by the programme instead of by a customer.',
    cost: 'The real cost is not the closure. It is that somebody funds the same intervention again in five years, because nothing was left standing to build on.',
    does: 'Nine decisions on one page, across four stages. Your team, your partners and your donor all read the same sheet, so nobody needs it translated and nobody is surprised later. And we design it so a private company makes money from keeping it going. An agro dealer earning margin on the input. A processor who needs the supply to run their plant. Then it survives your exit.',
    who: 'Programme design and implementation teams who have done the analysis, hold the system knowledge, and need the design decisions made and put in order so delivery can start.',
    ctaHead: 'Tell me what you are designing.',
    ctaBody: 'Bring the analysis you already have. We will put the decisions on one page and find out which ones are still open.',
  },
  {
    key: 'tralimm', slug: 'trade-liquidity',
    tag: 'Trade Liquidity', name: 'Enterprise Trade Liquidity Multiplier',
    kind: 'Advisory', kindBg: '#00afef', kindInk: '#12222c',
    mirror: 'Our cash is tied up in stock and suppliers want paying up front.',
    blurb: 'Instead of lending your cash out, we keep it where everyone can see it. Suppliers then extend you their own credit, because visible money makes you safe to trade with.',
    ctaLabel: 'See if you qualify', ctaHref: '/contact',
    what: 'Your growth is capped by cash, not by demand. You turn away orders you could have filled.',
    cost: 'The usual answer is to borrow. Then your margin pays interest before it pays you, and one bad season puts the loan ahead of the business.',
    does: 'Instead of lending your cash out, we keep it where everyone can see it. Suppliers, buyers and partners then extend you their own credit, because visible money makes you safe to trade with. Three ways to build that reserve, used singly or stacked: a guarantee against something you own, orders promised in advance, or backing from a few large partners.',
    who: 'Trading businesses with a visible transaction record and a predictable season, and the distributors, buyers and institutional partners whose money the mechanism actually mobilises.',
    ctaHead: 'Find out whether this fits your business.',
    ctaBody: 'It works on three conditions. Tell me how you trade and I will tell you straight whether you meet them.',
  },
]

export function serviceBySlug(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug)
}

/** The five loop, so the last service leads back to the first. */
export function neighbours(slug: string): { prev: Service; next: Service } | null {
  const i = SERVICES.findIndex((s) => s.slug === slug)
  if (i < 0) return null
  const n = SERVICES.length
  return { prev: SERVICES[(i - 1 + n) % n], next: SERVICES[(i + 1) % n] }
}

// ─── The site's own navigation ──────────────────────────────
export const MENU = [
  { num: '01', label: 'What I do', href: '/what-i-do/grant-to-commercial-viability' },
  { num: '02', label: 'The method', href: '/method' },
  { num: '03', label: 'Evidence', href: '/evidence' },
  { num: '04', label: 'Library', href: '/library' },
  { num: '05', label: 'Watch', href: '/watch' },
  { num: '06', label: 'Score yourself', href: '/score' },
  { num: '07', label: 'Contact', href: '/contact' },
]

export const MARQUEE = [
  'Who pays you when the grant stops',
  'Nine decisions, in order',
  'Evidence, not adjectives',
  'A price that covers the real cost',
  'Results that outlive your exit',
]

export const AUDIENCES = [
  { mark: '01', who: 'NGOs', what: 'delivering a service that somebody else pays for. The work is good. The invoice does not exist yet.' },
  { mark: '02', who: 'Businesses', what: 'already trading, with one service line a funder still pays for. That subsidy ends the way a grant does.' },
  { mark: '03', who: 'Programmes', what: 'moving the businesses they support onto their own feet, and needing them to still be standing after exit.' },
]

// ─── The canvas, in its real positions ──────────────────────
export interface CanvasBlockView {
  n: number
  c: string
  title: string
  q: string
  fit: string
  bullets: string[]
}

export const CANVAS: CanvasBlockView[] = [
  { n: 1, c: GOLD, title: 'Service Reality Audit', q: 'What do we actually deliver, versus what we think we deliver?', fit: 'Can we own this problem', bullets: ['Sort what a donor pays for from what a customer would', 'Find which services people genuinely want', 'Surface the delivery costs nobody has counted', 'Name what has to stop'] },
  { n: 2, c: NAVY, title: 'Customer and Problem Clarity', q: 'Who owns this problem, and will they pay to solve it?', fit: 'Does it solve their problem', bullets: ['Name the person who holds the budget', 'Test whether the problem is urgent, not just real', 'Separate the funder from the customer', 'Willing, able, and top of their list'] },
  { n: 3, c: TEAL, title: 'Value Proposition', q: 'Why does this matter to this client, in their words?', fit: 'Does it reach the buyer', bullets: ['Move from what we do to why it matters', 'Say plainly how you differ from the alternative', 'Build the trust signals an institution looks for', 'Test it on real clients, not on each other'] },
  { n: 4, c: GOLD, title: 'The Numbers', q: 'What does it cost us, and what must they pay for this to work?', fit: 'Does the money work', bullets: ['Count every cost, including the hidden ones', 'Choose a price shape: per job, retainer, tiers', 'Work out the break even point', 'Build it so a non finance person can run it'] },
  { n: 6, c: PURPLE, title: 'Who We Become', q: 'What kind of business are we now, and who do we work with as that business?', fit: 'Identity and partners', bullets: ['Specialist firm, trainer, or systems integrator', 'How you see yourself sets what you can charge', 'Referral, joint delivery, endorsement, consortium', 'Partners who lift you rather than dilute you'] },
  { n: 5, c: TEAL, title: 'Getting to Market', q: 'Which clients do we go after first, and how do we reach them?', fit: 'Will they pay enough', bullets: ['Rank the clients worth going after', 'Decide how you reach them, and in what order', 'Write the materials together', 'Test the pitch on real segments'] },
  { n: 7, c: NAVY, title: 'The Pilot', q: 'What does success look like small, before we commit to big?', fit: 'Can it be tested for real', bullets: ['Round one, I lead and we adjust as we go', 'Round two, you lead and I stay in the background', 'Both rounds change the service before it scales', 'Agree what has to be true before growing'] },
  { n: 8, c: TEAL, title: 'Where It Goes Next', q: 'Where does this go after I leave, and what does it need to get there?', fit: 'Can it travel', bullets: ['First clients set against the longer pathway', 'Name the investment that unlocks the next stage', 'National, then regional, then further', 'Design the pilot to produce the proof growth needs'] },
]

/** Decision nine runs across the whole engagement rather than sitting in a column. */
export const FITS = [
  { n: 'Test 1', t: 'Can we own this problem', d: 'Do we have the skill and the standing to be the ones who fix this?' },
  { n: 'Test 2', t: 'Does it solve their problem', d: 'Does the service fix the problem as the client feels it, not as we describe it?' },
  { n: 'Test 3', t: 'Does it reach the buyer', d: 'Is it built to reach somebody with a budget, not somebody without one?' },
  { n: 'Test 4', t: 'Can it be tested for real', d: 'Can we try this on a real client inside the timeline?' },
  { n: 'Test 5', t: 'Will they pay enough', d: 'Will somebody pay a price that covers what it costs to deliver?' },
  { n: 'Test 6', t: 'Can it travel', d: 'Are there partners and channels to carry this past the first few clients?' },
]

export const CANVAS_FAMILY = [
  { slug: 'grant-to-commercial-viability', n: 9, unit: 'decisions', name: 'Grant to Commercial Viability', blocks: 'From funded delivery to a paying customer.' },
  { slug: 'intervention-design', n: 9, unit: 'decisions, four stages', name: 'Intervention Design', blocks: 'For programme teams designing for life after exit.' },
  { slug: 'investment-case', n: 8, unit: 'steps, then a fork', name: 'Investment Case', blocks: 'For anyone who has been turned down without a reason.' },
  { slug: 'market-intelligence', n: 7, unit: 'things scored', name: 'Market Intelligence', blocks: 'Four readiness tiers, from real transaction data.' },
]

// ─── The other four diagrams ────────────────────────────────
export const PHASES = [
  { name: 'See', sub: 'Understand before you design', dps: [
    { n: 1, title: 'Who is in the system', q: 'Which players matter to the change, and how must we work with each of them?' },
    { n: 2, title: 'The problem and the theory', q: 'What exactly is broken, and what path to change does the evidence support?' },
    { n: 3, title: 'Where the market fails', q: 'Where is the market failing, and which point gives us the most leverage?' },
  ] },
  { name: 'Match', sub: 'Choose, design, sequence', dps: [
    { n: 4, title: 'Which partners are ready', q: 'Who has the will, the skill and the reason to carry this, and in what order?' },
    { n: 5, title: 'The deal', q: 'What arrangement makes it in the partner’s own interest to keep going?' },
    { n: 6, title: 'What gets funded', q: 'Which parts get money first, and what are we deliberately not funding?' },
  ] },
  { name: 'Test', sub: 'Find out, then spread it', dps: [
    { n: 7, title: 'Learning as you go', q: 'How will we know if the system is responding, and what do we do about it?' },
    { n: 8, title: 'How it spreads', q: 'How does this carry on past the people we work with directly?' },
  ] },
  { name: 'Measure', sub: 'Runs the whole way through', dps: [
    { n: 9, title: 'Investment readiness', q: 'How ready is this system to take on investment, and has that changed?' },
  ] },
]

export const IDC_TOOLS = [
  'Liquidity Decision Framework, at Decision Points 1 and 2',
  'Three Stage Adoption Test, at Decision Point 4',
  'Asset Liquidity Hierarchy, at Decision Point 4',
  'Will and Skill Matrix, at Decision Point 4',
  'Investment Infrastructure Development Model, at Decision Points 3 and 5',
  'Performance Signal Layer, at Decision Point 7',
]

export const ICC_BLOCKS = [
  { n: '01', title: 'Where we are starting', q: 'What does standing on your own feet actually mean here? This sorts the programme into one of three types.' },
  { n: '02', title: 'Where the money is stuck', q: 'At what point in the chain does cash stop moving, and is the reason missing data or a wrong belief?' },
  { n: '03', title: 'Which side you are on', q: 'Are you building the funding vehicle, or asking it for money? The rest of the canvas changes with the answer.' },
  { n: '04', title: 'How ready you are', q: 'Knowledge, structure, willingness. Which of the three is your gap?' },
  { n: '05', title: 'Which kind of money fits', q: 'A loan, a guarantee, equity, a grant that gets repaid. Which one suits the blockage and the size?' },
  { n: '06', title: 'The proof about risk', q: 'Which single player, if they move, shifts everything? Usually built on the gap between what people fear and what actually defaults.' },
  { n: '07', title: 'Can the other end absorb it', q: 'Can the people at the receiving end use the money and pay it back? All three lights green, or we stop.' },
  { n: '08', title: 'What happens without subsidy', q: 'What has to stay true once the support ends, and where does it break first? Tested against a 20 percent knock.' },
]

export const TRALIMM_MODELS = [
  { abbr: 'CGM', name: 'Guarantee against an asset', converts: 'Something you own into a facility your suppliers can rely on', useWhen: 'You hold land or another asset somebody will value' },
  { abbr: 'FCA', name: 'Orders promised in advance', converts: 'Future demand from buyers into cash you can use now', useWhen: 'You have buyers who will commit before delivery' },
  { abbr: 'APC', name: 'Backing from big partners', converts: 'Relationships you already have into structured capital', useWhen: 'A few large partners are within reach' },
]

export const INTEL_STEPS = [
  { n: '01', name: 'Collect', what: 'Each business in your portfolio is enrolled. The system takes their real transaction data, week by week, from their own records rather than from a questionnaire.' },
  { n: '02', name: 'Collate', what: 'That data is cleaned and made comparable, so a shop in one district can be measured against a processor in another without pretending they are the same.' },
  { n: '03', name: 'Analyse', what: 'Scored across seven dimensions, placed in a readiness tier, with how much capital it can absorb and which instrument fits. One place to watch every business you fund.' },
]

export const DIMENSIONS = [
  { name: 'Market opportunity', n: 78 },
  { name: 'Visibility', n: 46 },
  { name: 'Trust', n: 62 },
  { name: 'Profitability', n: 54 },
  { name: 'Capacity', n: 58 },
  { name: 'Resilience', n: 41 },
  { name: 'Compliance', n: 69 },
]

export const TIERS = [
  { n: '1', name: 'Not yet', what: 'Money now would be a burden, not a lever.', bg: '#c9a84c', ink: '#2a1c04' },
  { n: '2', name: 'Getting there', what: 'Specific gaps to close first, and we know which.', bg: '#3e6e72', ink: '#eafcff' },
  { n: '3', name: 'Nearly ready', what: 'One or two conditions away from taking capital well.', bg: '#00767a', ink: '#eafcff' },
  { n: '4', name: 'Ready now', what: 'Can absorb, use and repay. Fund it.', bg: '#2e7d32', ink: '#eafce9' },
]

// ─── Evidence, library, video ───────────────────────────────
export const PROOF_ALL = [
  { cat: 'Implementation learning', title: 'Training is not transformation', what: 'Training alone does not improve produce quality. The market has to reward quality before quality appears. That changes what a capability budget should be buying.' },
  { cat: 'Systemic insight', title: 'Inclusion without income is still exclusion', what: 'A study tracing where the money actually lands in a value chain, and how little of it reaches the people a programme counted as included.' },
  { cat: 'Transition', title: 'A donor programme that became a business', what: 'A regional seed and markets programme moved from donor funded to a private company across three Southern African countries, with clear customers and its own plan.' },
  { cat: 'Implementation learning', title: 'People share data when they get something back', what: 'Traders would not share sales figures until the value came back to them as market information and price alerts. Then they shared it willingly.' },
  { cat: 'Case study', title: 'Income, investment, independence', what: 'An agent model connecting refugee and host community farmers to formal buyers. One farmer group put UGX 2.7 million back into expanding their land.' },
  { cat: 'Transition', title: 'Helping donors leave, and businesses stay', what: 'Three donor programmes, in agriculture, youth employment and seed systems, restructured so they could carry on without the donor.' },
  { cat: 'Capability', title: 'Teaching teams to see the whole system', what: 'A five day course for teams working in refugee and youth markets. They moved from delivering activities to thinking about the system around them.' },
]

/**
 * The eight remaining entries from Habib's proof library, written in the same
 * voice as the seven above.
 *
 * WHY THEY ARE HERE. The approved copy says fifteen engagements and the design
 * carried seven, which would have put a number on the page that the page then
 * failed to show. The material existed; only the writing was missing.
 */
const PROOF_REST = [
  { cat: 'Private sector engagement', title: 'A canvas changed the partner conversation', what: 'Programme teams working with agribusiness firms started designing partnerships on one page instead of negotiating them in email. They began mapping what the partner got out of it, which is the part that usually goes unsaid.' },
  { cat: 'Capability', title: 'Turning programme staff into dealmakers', what: 'A coaching module on getting from strategy to execution. Staff stopped opening with what the donor wanted and started opening with what the business would gain.' },
  { cat: 'Implementation learning', title: 'Frequency beats intensity', what: 'Agent performance rose with short, frequent training and reinforcement, not with longer sessions. Most capability budgets are built the other way round.' },
  { cat: 'Systemic insight', title: 'Cheap and informal undercuts good and formal', what: 'In cross border grain trade, porous borders and lower standards undercut the firms doing it properly. Loyalty schemes held producers who would otherwise have sold to whoever turned up.' },
  { cat: 'Case study', title: 'Formalisation multiplies finance', what: 'A lead agent formalised the agreement with their buyer. Credit discipline improved, pre financing went up, and the operation reached areas it could not previously afford to serve.' },
  { cat: 'Case study', title: 'A supply chain that reached further', what: 'A private firm extended its supply chain into refugee settlements. Volumes of quality produce rose and logistics costs came down, which is the combination that makes inclusion commercial rather than charitable.' },
  { cat: 'Capability', title: 'Adaptation as a habit, not an event', what: 'After several mentorship cycles, managers started running hypothesis, test, learn and adapt loops on their own. The change was that adapting stopped needing permission.' },
  { cat: 'Deal structuring', title: 'From technical proposal to business pitch', what: 'Teams coached through live partnership pitches using standard commercial frameworks. Deals closed faster because the person listening could finally hear what they were being offered.' },
]

/** All fifteen. The evidence page says fifteen and shows fifteen. */
export const PROOF_FIFTEEN = [...PROOF_ALL, ...PROOF_REST]

/** The three that lead. Each contradicts something the sector believes. */
export const PROOF = PROOF_ALL.slice(0, 3)

export const FRAMEWORKS = [
  { name: 'Liquidity Decision Framework', origin: 'Uganda, on a USAID resilience programme. Built from profiling 832 households across three Karamoja districts.' },
  { name: 'Three Stage Adoption Test', origin: 'Are they willing, are they able, and is it top of their list. Most programmes check the first two and stop.' },
  { name: 'Asset Liquidity Hierarchy', origin: 'Poultry is the cash machine. Goats are the savings account. Cattle are the house you do not sell.' },
  { name: 'Investment Infrastructure Development Model', origin: 'Uganda, mobile payments. Builds the conditions a commercial player needs, rather than paying them to show up.' },
  { name: 'Trade Liquidity Multiplier', origin: 'Uganda. A UGX 1bn reserve structured to unlock UGX 24 to 33bn of agricultural trade.' },
  { name: 'Sector Finance Activation Model', origin: 'Nigeria, on a DFID programme. Credit routed through business membership organisations, with repayment above 98 percent.' },
  { name: 'PPP Livestock Service Delivery Model', origin: 'Uganda. Turned subsidised community animal health workers into providers who charge for their work.' },
  { name: 'Visibility First Finance System', origin: 'Nigeria. Transaction intelligence for informal traders, and where Verido came from.' },
  { name: 'PSE Mastery Canvas', origin: 'Nine canvases covering private sector engagement end to end.' },
]

export const RESOURCES = [
  { kind: 'Diagnostic', meta: '2 minutes', name: 'Commercial Readiness Score', what: 'The ten questions I ask in a first session, scored, with your gaps named and one next step.', status: 'Live now' },
  { kind: 'Wall print', meta: 'A1 and A3', name: 'The canvas, as a one page print', what: 'All nine decisions on a single sheet you can put on a wall and work through with your team.', status: 'In the welcome email' },
  { kind: 'Checklist', meta: '8 points', name: 'Investment case checklist', what: 'The eight things a funder checks for, in the order they check them. Use it before you send anything.', status: 'In the welcome email' },
  { kind: 'Map', meta: '4 stages', name: 'Intervention design map', what: 'The nine decisions a market systems intervention needs, and the test that says each one is finished.', status: 'In the welcome email' },
  { kind: 'Template', meta: 'Spreadsheet', name: 'Pricing and break even model', what: 'Count every cost, including the ones sitting in a grant line, and find the price that actually covers delivery.', status: 'Coming' },
  { kind: 'Newsletter', meta: 'Fortnightly', name: 'Viable by Design, long edition', what: 'The longer version, from here rather than LinkedIn. More detail, more numbers, and the things I would not post publicly.', status: 'Live now' },
]

export const MAGNETS = [
  { href: '/score', kind: 'Two minutes', name: 'Commercial Readiness Score', what: 'The ten questions I ask in a first session, scored, with your gaps named and one next step.', cta: 'Score your organisation' },
  { href: '/library', kind: 'One page', name: 'The canvas, as a wall print', what: 'All nine decisions on a single sheet you can put on a wall and work through with your team.', cta: 'Get the print' },
  { href: '/library', kind: 'Checklist', name: 'Investment case checklist', what: 'The eight things a funder checks for, in the order they check them. Use it before you send anything.', cta: 'Get the checklist' },
  { href: '/watch', kind: 'Video', name: 'Lessons from implementation', what: 'Twenty years of running economic development programmes, in short pieces you can watch on a commute.', cta: 'Watch on YouTube' },
]

export const VIDEOS = [
  { tag: 'Method', title: 'Why a canvas beats a report', what: 'The argument for putting every decision on one page, and what happens in the room when you do.' },
  { tag: 'Commercial viability', title: 'What a paying customer actually looks like', what: 'The difference between the people you serve and the people who would pay you.' },
  { tag: 'Market systems', title: 'Designing for life after exit', what: 'Why interventions collapse at closure, and what to build instead.' },
  { tag: 'Finance', title: 'Reserves, not loans', what: 'How visible money mobilises somebody else’s capital.' },
  { tag: 'Pricing', title: 'The cost you have not counted', what: 'Where staff time hides, and why it wrecks a price.' },
  { tag: 'Lessons', title: 'Twenty years, five mistakes', what: 'The ones I made, and the ones I keep watching other people make.' },
]

export const LINKS = {
  linkedinNewsletter: 'https://www.linkedin.com/newsletters/viable-by-design-7280979699525120000/',
  linkedinProfile: 'https://www.linkedin.com/in/habibonifade/',
  youtube: 'https://www.youtube.com/@DevTVorg',
  platform: 'https://clearview.habibonifade.com',
}
