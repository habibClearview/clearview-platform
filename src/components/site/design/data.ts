// @ts-nocheck
// ============================================================
// THE APPROVED DESIGN'S DATA, VERBATIM.
//
// Lifted unchanged from the prototype Habib approved. Every string, every
// colour, every number is as designed. Nothing here is a judgement call, and
// nothing in this file should be edited to make a component tidier.
//
// The KIT block from the prototype is deliberately absent. It held five public
// form ids to be pasted in by hand; capture on this site runs server side
// through /api/readiness and /api/subscribe, where the source decides the tag
// and no key reaches the browser.
// ============================================================

export const MENU = [
  { key: 'services', num: '01', label: 'What I do' },
  { key: 'gtcv', num: '02', label: 'The method' },
  { key: 'proof', num: '03', label: 'Evidence' },
  { key: 'library', num: '04', label: 'Library' },
  { key: 'videos', num: '05', label: 'Watch' },
  { key: 'assess', num: '06', label: 'Score yourself' },
  { key: 'contact', num: '07', label: 'Contact' },
];

export const MARQUEE = [
  { t: 'Who pays you when the grant stops' },
  { t: 'Nine decisions, in order' },
  { t: 'Evidence, not adjectives' },
  { t: 'A price that covers the real cost' },
  { t: 'Results that outlive your exit' },
  { t: 'Who pays you when the grant stops' },
  { t: 'Nine decisions, in order' },
  { t: 'Evidence, not adjectives' },
  { t: 'A price that covers the real cost' },
  { t: 'Results that outlive your exit' },
];

export const AUDIENCES = [
  { mark: '01', who: 'NGOs', what: 'delivering a service that somebody else pays for. The work is good. The invoice does not exist yet.' },
  { mark: '02', who: 'Businesses', what: 'already trading, with one service line a funder still pays for. That subsidy ends the way a grant does.' },
  { mark: '03', who: 'Programmes', what: 'moving the businesses they support onto their own feet, and needing them to still be standing after exit.' },
];


async function kitSubscribe(form, payload) {
  const id = KIT.forms[form];
  if (!id) return { ok: false, skipped: true };
  const fd = new FormData();
  fd.append('email_address', payload.email);
  if (payload.firstName) fd.append('first_name', payload.firstName);
  if (payload.band) fd.append('fields[' + KIT.fields.band + ']', payload.band);
  if (payload.score != null) fd.append('fields[' + KIT.fields.score + ']', String(payload.score));
  if (payload.organisation) fd.append('fields[' + KIT.fields.org + ']', payload.organisation);
  if (payload.interest) fd.append('fields[' + KIT.fields.interest + ']', payload.interest);
  fd.append('fields[' + KIT.fields.source + ']', payload.source || 'website');
  try {
    await fetch('https://app.kit.com/forms/' + id + '/subscriptions', { method: 'POST', body: fd, mode: 'no-cors' });
    return { ok: true };
  } catch (e) { return { ok: false, error: true }; }
}

export const SERVICES = [
  {
    key: 'gtcv', tag: 'Grant to Commercial Viability', name: 'Grant to Commercial Viability Canvas', kind: 'Advisory', kindBg: '#00afef', kindInk: '#12222c',
    mirror: 'Our funding ends and nobody is paying us yet.',
    blurb: 'I find which of your services somebody will pay for, what it really costs you to deliver, and who holds that budget. Then we sell to one real customer while your funding is still there.',
    ctaLabel: 'Score your organisation', ctaKey: 'assess',
    what: 'You do good work. A donor pays for it. When that money stops, there is nobody to send an invoice to.',
    cost: 'Most organisations spend their last funded year writing another proposal. If it lands, you have bought twelve months. If it does not, you have spent your final year of runway on a raffle ticket.',
    does: 'Nine decisions, taken in order. Which of your services somebody will pay for. What it really costs you to deliver them. Who inside a client organisation holds that budget. Then we sell to one real customer while your funding is still there, so you can afford to be wrong.',
    who: 'The obvious reader is a charity whose grant is ending. The other one is a managing director whose business already trades but has one service inside it paid for by a funder rather than by the person using it. That subsidy ends the same way a grant does.',
    ctaHead: 'Start with the ten questions.', ctaBody: 'Two minutes, and you will know which of the nine decisions your work actually starts at.',
  },
  {
    key: 'intel', tag: 'Market Intelligence', name: 'Market Intelligence', kind: 'Subscription', kindBg: '#c9a84c', kindInk: '#2a1c04',
    mirror: 'How much can this business absorb, and what changes if we invest?',
    blurb: 'A system that collects real transaction data from every business in your portfolio, week by week, and tells you who to back, how much they can take, and what changes if you do.',
    ctaLabel: 'Join as a founding subscriber', ctaKey: 'contact',
    what: 'That is a genuinely hard question. The accounts rarely show it. A survey will not find it. Ask the owner and you get an optimistic number.',
    cost: 'So the call gets made on relationship and instinct. Money lands in a business that cannot use it yet, and it costs you twice. The money underperforms, and the business carries a debt it was not ready for.',
    does: 'A system that enrols each business in your portfolio and then collects, collates and analyses their real transaction data, week by week, from their own records. You get one place to watch every business partner you fund. Which to back. How much each can absorb. Which instrument fits. And what changes, in the enterprise and in the market around it. I am building the data layer now with a live client, so founding subscribers shape what gets measured and see the first reports.',
    who: 'Funders, investors, development finance institutions and programme managers holding a portfolio of businesses and no reliable way to rank them.',
    ctaHead: 'Founding subscribers shape what gets measured.', ctaBody: 'The data layer is being built now with a live client. Register your interest and I will show you the first reports as they come.',
  },
  {
    key: 'icc', tag: 'Investment Case', name: 'The Investment Case Canvas', kind: 'Advisory', kindBg: '#00afef', kindInk: '#12222c',
    mirror: 'We asked for money and got turned down. Nobody told us why.',
    blurb: 'Usually the case was built in the wrong order, with the ask first and the evidence last. I rebuild it the other way round, so the money can see how it comes back.',
    ctaLabel: 'Send me your case', ctaKey: 'contact',
    what: 'You have a good programme and real numbers. But the people with capital could not see how they get their money back, or who carries the loss if it goes wrong. So they said no, politely, without explaining.',
    cost: 'Every no makes the next one harder. You cannot walk the same case back into the same room and expect a different answer.',
    does: 'Eight steps, then a fork. First, where the money is actually stuck, and whether the real problem is missing data or a wrong belief about risk. Then which kind of money fits, whether that is a loan, a guarantee, equity or a grant that gets repaid. Then proof that people want the thing and can pay for it. The ask comes last, once the evidence is sitting in front of it.',
    who: 'Programmes and businesses that need to raise capital, and the funders and development finance institutions building the vehicle the money would come from.',
    ctaHead: 'Send me the case that got turned down.', ctaBody: 'I will tell you which of the eight steps is missing, before you take it anywhere else.',
  },
  {
    key: 'idcms', tag: 'Intervention Design', name: 'Intervention Design Canvas', kind: 'Advisory', kindBg: '#00afef', kindInk: '#12222c',
    mirror: 'When our programme closes, will any of this still be running?',
    blurb: 'Your whole design on one page, as nine numbered decisions your team, partners and donor can all read. Built so a private business makes money from keeping it going after you leave.',
    ctaLabel: 'Talk about your programme', ctaKey: 'contact',
    what: 'Programmes spend years building something that stops the month the money stops. It happens when everybody delivering the work was paid by the programme instead of by a customer.',
    cost: 'The real cost is not the closure. It is that somebody funds the same intervention again in five years, because nothing was left standing to build on.',
    does: 'Nine decisions on one page, across four stages. Your team, your partners and your donor all read the same sheet, so nobody needs it translated and nobody is surprised later. And we design it so a private company makes money from keeping it going. An agro dealer earning margin on the input. A processor who needs the supply to run their plant. Then it survives your exit.',
    who: 'Programme design and implementation teams who have done the analysis, hold the system knowledge, and need the design decisions made and put in order so delivery can start.',
    ctaHead: 'Tell me what you are designing.', ctaBody: 'Bring the analysis you already have. We will put the decisions on one page and find out which ones are still open.',
  },
  {
    key: 'tralimm', tag: 'Trade Liquidity', name: 'Enterprise Trade Liquidity Multiplier', kind: 'Advisory', kindBg: '#00afef', kindInk: '#12222c',
    mirror: 'Our cash is tied up in stock and suppliers want paying up front.',
    blurb: 'Instead of lending your cash out, we keep it where everyone can see it. Suppliers then extend you their own credit, because visible money makes you safe to trade with.',
    ctaLabel: 'See if you qualify', ctaKey: 'contact',
    what: 'Your growth is capped by cash, not by demand. You turn away orders you could have filled.',
    cost: 'The usual answer is to borrow. Then your margin pays interest before it pays you, and one bad season puts the loan ahead of the business.',
    does: 'Instead of lending your cash out, we keep it where everyone can see it. Suppliers, buyers and partners then extend you their own credit, because visible money makes you safe to trade with. Three ways to build that reserve, used singly or stacked: a guarantee against something you own, orders promised in advance, or backing from a few large partners.',
    who: 'Trading businesses with a visible transaction record and a predictable season, and the distributors, buyers and institutional partners whose money the mechanism actually mobilises.',
    ctaHead: 'Find out whether this fits your business.', ctaBody: 'It works on three conditions. Tell me how you trade and I will tell you straight whether you meet them.',
  },
];

export const GOLD = { accent: '#c9a84c', ink: '#2a1c04' };
export const NAVY = { accent: '#12222c', ink: '#f5f5dc' };
export const TEAL = { accent: '#00767a', ink: '#eafcff' };
export const PURP = { accent: '#6b4a8b', ink: '#f3eaff' };

export const CANVAS = [
  { n: 1, c: GOLD, title: 'Service Reality Audit', q: 'What do we actually deliver, versus what we think we deliver?', fit: 'Can we own this problem', bullets: ['Sort what a donor pays for from what a customer would', 'Find which services people genuinely want', 'Surface the delivery costs nobody has counted', 'Name what has to stop'] },
  { n: 2, c: NAVY, title: 'Customer and Problem Clarity', q: 'Who owns this problem, and will they pay to solve it?', fit: 'Does it solve their problem', bullets: ['Name the person who holds the budget', 'Test whether the problem is urgent, not just real', 'Separate the funder from the customer', 'Willing, able, and top of their list'] },
  { n: 3, c: TEAL, title: 'Value Proposition', q: 'Why does this matter to this client, in their words?', fit: 'Does it reach the buyer', bullets: ['Move from what we do to why it matters', 'Say plainly how you differ from the alternative', 'Build the trust signals an institution looks for', 'Test it on real clients, not on each other'] },
  { n: 4, c: GOLD, title: 'The Numbers', q: 'What does it cost us, and what must they pay for this to work?', fit: 'Does the money work', bullets: ['Count every cost, including the hidden ones', 'Choose a price shape: per job, retainer, tiers', 'Work out the break even point', 'Build it so a non finance person can run it'] },
  { n: 6, c: PURP, title: 'Who We Become', q: 'What kind of business are we now, and who do we work with as that business?', fit: 'Identity and partners', bullets: ['Specialist firm, trainer, or systems integrator', 'How you see yourself sets what you can charge', 'Referral, joint delivery, endorsement, consortium', 'Partners who lift you rather than dilute you'] },
  { n: 5, c: TEAL, title: 'Getting to Market', q: 'Which clients do we go after first, and how do we reach them?', fit: 'Will they pay enough', bullets: ['Rank the clients worth going after', 'Decide how you reach them, and in what order', 'Write the materials together', 'Test the pitch on real segments'] },
  { n: 7, c: NAVY, title: 'The Pilot', q: 'What does success look like small, before we commit to big?', fit: 'Can it be tested for real', bullets: ['Round one, I lead and we adjust as we go', 'Round two, you lead and I stay in the background', 'Both rounds change the service before it scales', 'Agree what has to be true before growing'] },
  { n: 8, c: TEAL, title: 'Where It Goes Next', q: 'Where does this go after I leave, and what does it need to get there?', fit: 'Can it travel', bullets: ['First clients set against the longer pathway', 'Name the investment that unlocks the next stage', 'National, then regional, then further', 'Design the pilot to produce the proof growth needs'] },
];

export const FITS = [
  { n: 'Test 1', t: 'Can we own this problem', d: 'Do we have the skill and the standing to be the ones who fix this?' },
  { n: 'Test 2', t: 'Does it solve their problem', d: 'Does the service fix the problem as the client feels it, not as we describe it?' },
  { n: 'Test 3', t: 'Does it reach the buyer', d: 'Is it built to reach somebody with a budget, not somebody without one?' },
  { n: 'Test 4', t: 'Can it be tested for real', d: 'Can we try this on a real client inside the timeline?' },
  { n: 'Test 5', t: 'Will they pay enough', d: 'Will somebody pay a price that covers what it costs to deliver?' },
  { n: 'Test 6', t: 'Can it travel', d: 'Are there partners and channels to carry this past the first few clients?' },
];

export const INTEL_STEPS = [
  { n: '01', name: 'Collect', what: 'Each business in your portfolio is enrolled. The system takes their real transaction data, week by week, from their own records rather than from a questionnaire.' },
  { n: '02', name: 'Collate', what: 'That data is cleaned and made comparable, so a shop in one district can be measured against a processor in another without pretending they are the same.' },
  { n: '03', name: 'Analyse', what: 'Scored across seven dimensions, placed in a readiness tier, with how much capital it can absorb and which instrument fits. One place to watch every business you fund.' },
];

export const DIMENSIONS = [
  { name: 'Market opportunity', n: 78, pct: '78%' },
  { name: 'Visibility', n: 46, pct: '46%' },
  { name: 'Trust', n: 62, pct: '62%' },
  { name: 'Profitability', n: 54, pct: '54%' },
  { name: 'Capacity', n: 58, pct: '58%' },
  { name: 'Resilience', n: 41, pct: '41%' },
  { name: 'Compliance', n: 69, pct: '69%' },
];

export const TIERS = [
  { n: '1', name: 'Not yet', what: 'Money now would be a burden, not a lever.', bg: '#c9a84c', ink: '#2a1c04' },
  { n: '2', name: 'Getting there', what: 'Specific gaps to close first, and we know which.', bg: '#3e6e72', ink: '#eafcff' },
  { n: '3', name: 'Nearly ready', what: 'One or two conditions away from taking capital well.', bg: '#00767a', ink: '#eafcff' },
  { n: '4', name: 'Ready now', what: 'Can absorb, use and repay. Fund it.', bg: '#2e7d32', ink: '#eafce9' },
];

export const ICC_BLOCKS = [
  { n: '01', title: 'Where we are starting', q: 'What does standing on your own feet actually mean here? This sorts the programme into one of three types.' },
  { n: '02', title: 'Where the money is stuck', q: 'At what point in the chain does cash stop moving, and is the reason missing data or a wrong belief?' },
  { n: '03', title: 'Which side you are on', q: 'Are you building the funding vehicle, or asking it for money? The rest of the canvas changes with the answer.' },
  { n: '04', title: 'How ready you are', q: 'Knowledge, structure, willingness. Which of the three is your gap?' },
  { n: '05', title: 'Which kind of money fits', q: 'A loan, a guarantee, equity, a grant that gets repaid. Which one suits the blockage and the size?' },
  { n: '06', title: 'The proof about risk', q: 'Which single player, if they move, shifts everything? Usually built on the gap between what people fear and what actually defaults.' },
  { n: '07', title: 'Can the other end absorb it', q: 'Can the people at the receiving end use the money and pay it back? All three lights green, or we stop.' },
  { n: '08', title: 'What happens without subsidy', q: 'What has to stay true once the support ends, and where does it break first? Tested against a 20 percent knock.' },
];

export const PHASES = [
  { name: 'See', sub: 'Understand before you design', dps: [
    { n: 1, title: 'Who is in the system', q: 'Which players matter to the change, and how must we work with each of them?' },
    { n: 2, title: 'The problem and the theory', q: 'What exactly is broken, and what path to change does the evidence support?' },
    { n: 3, title: 'Where the market fails', q: 'Where is the market failing, and which point gives us the most leverage?' },
  ] },
  { name: 'Match', sub: 'Choose, design, sequence', dps: [
    { n: 4, title: 'Which partners are ready', q: 'Who has the will, the skill and the reason to carry this, and in what order?' },
    { n: 5, title: 'The deal', q: 'What arrangement makes it in the partner\u2019s own interest to keep going?' },
    { n: 6, title: 'What gets funded', q: 'Which parts get money first, and what are we deliberately not funding?' },
  ] },
  { name: 'Test', sub: 'Find out, then spread it', dps: [
    { n: 7, title: 'Learning as you go', q: 'How will we know if the system is responding, and what do we do about it?' },
    { n: 8, title: 'How it spreads', q: 'How does this carry on past the people we work with directly?' },
  ] },
  { name: 'Measure', sub: 'Runs the whole way through', dps: [
    { n: 9, title: 'Investment readiness', q: 'How ready is this system to take on investment, and has that changed?' },
  ] },
];

export const IDC_TOOLS = [
  { t: 'Liquidity Decision Framework, at Decisions 1 and 2' },
  { t: 'Three Stage Adoption Test, at Decision 4' },
  { t: 'Asset Liquidity Hierarchy, at Decision 4' },
  { t: 'Will and Skill Matrix, at Decision 4' },
  { t: 'Investment Infrastructure Development Model, at Decisions 3 and 5' },
  { t: 'Performance Signal Layer, at Decision 7' },
];

export const TRALIMM_MODELS = [
  { abbr: 'CGM', name: 'Guarantee against an asset', converts: 'Something you own into a facility your suppliers can rely on', useWhen: 'You hold land or another asset somebody will value' },
  { abbr: 'FCA', name: 'Orders promised in advance', converts: 'Future demand from buyers into cash you can use now', useWhen: 'You have buyers who will commit before delivery' },
  { abbr: 'APC', name: 'Backing from big partners', converts: 'Relationships you already have into structured capital', useWhen: 'A few large partners are within reach' },
];

export const QUESTIONS = [
  { id: 'rq1', question: 'We know who our paying customers are, not just our clients', settledAt: 'Decision 2', ifNot: 'The people you serve and the people who would pay you are not always the same. Building for the first while hoping the second turns up is the most common reason a commercial move stalls.' },
  { id: 'rq2', question: 'We have talked to at least three possible paying customers in the last six months', settledAt: 'Decision 2', ifNot: 'Without those conversations, every price and every projection rests on what you believe rather than on what a buyer told you.' },
  { id: 'rq3', question: 'We can say what problem we solve for a paying customer in one sentence', settledAt: 'Decision 3', ifNot: 'If it takes a paragraph, the budget holder will not repeat it to the person who signs. What cannot be repeated does not get funded.' },
  { id: 'rq4', question: 'We have a price for at least one service', settledAt: 'Decision 4', ifNot: 'A service without a price is not a service, it is an offer to chat. Naming a number is what makes willingness to pay testable.' },
  { id: 'rq5', question: 'We know what it costs us to deliver our main service', settledAt: 'Decision 4', ifNot: 'Most organisations get this wrong because staff time and overhead sit in a grant line instead of against the service. A price set on the wrong cost loses money on every sale.' },
  { id: 'rq6', question: 'We have someone who can lead business development', settledAt: 'Decision 5', ifNot: 'Business development that belongs to everybody belongs to nobody. Somebody has to own the first five conversations by name.' },
  { id: 'rq7', question: 'Our leadership team is behind moving towards earned revenue', settledAt: 'The first conversation', ifNot: 'This is the one that stops engagements. If leadership is not behind it, the work produces documents rather than revenue.' },
  { id: 'rq8', question: 'We have time set aside for this work in the next six months', settledAt: 'The Engagement Charter', ifNot: 'This is not an add on to a full delivery schedule. Time that is not protected in advance gets taken by the next donor deadline.' },
  { id: 'rq9', question: 'We are willing to test our services on real paying clients during the work', settledAt: 'Decision 7', ifNot: 'Everything before the pilot is a guess. An organisation that will not test on a real paying client never finds out which parts were wrong.' },
  { id: 'rq10', question: 'We understand the goal is financial independence, not more grant funding', settledAt: 'The first conversation', ifNot: 'If what you want is a better grant proposal, this is the wrong tool, and an honest conversation now saves you months.' },
];

export const PROOF_ALL = [
  { cat: 'Implementation learning', title: 'Training is not transformation', what: 'Training alone does not improve produce quality. The market has to reward quality before quality appears. That changes what a capability budget should be buying.' },
  { cat: 'Systemic insight', title: 'Inclusion without income is still exclusion', what: 'A study tracing where the money actually lands in a value chain, and how little of it reaches the people a programme counted as included.' },
  { cat: 'Transition', title: 'A donor programme that became a business', what: 'A regional seed and markets programme moved from donor funded to a private company across three Southern African countries, with clear customers and its own plan.' },
  { cat: 'Implementation learning', title: 'People share data when they get something back', what: 'Traders would not share sales figures until the value came back to them as market information and price alerts. Then they shared it willingly.' },
  { cat: 'Case study', title: 'Income, investment, independence', what: 'An agent model connecting refugee and host community farmers to formal buyers. One farmer group put UGX 2.7 million back into expanding their land.' },
  { cat: 'Transition', title: 'Helping donors leave, and businesses stay', what: 'Three donor programmes, in agriculture, youth employment and seed systems, restructured so they could carry on without the donor.' },
  { cat: 'Capability', title: 'Teaching teams to see the whole system', what: 'A five day course for teams working in refugee and youth markets. They moved from delivering activities to thinking about the system around them.' },
];

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
];

export const RESOURCES = [
  { kind: 'Diagnostic', meta: '2 minutes', name: 'Commercial Readiness Score', what: 'The ten questions I ask in a first session, scored, with your gaps named and one next step.', status: 'Live now' },
  { kind: 'Wall print', meta: 'A1 and A3', name: 'The canvas, as a one page print', what: 'All nine decisions on a single sheet you can put on a wall and work through with your team.', status: 'In the welcome email' },
  { kind: 'Checklist', meta: '8 points', name: 'Investment case checklist', what: 'The eight things a funder checks for, in the order they check them. Use it before you send anything.', status: 'In the welcome email' },
  { kind: 'Map', meta: '4 stages', name: 'Intervention design map', what: 'The nine decisions a market systems intervention needs, and the test that says each one is finished.', status: 'In the welcome email' },
  { kind: 'Template', meta: 'Spreadsheet', name: 'Pricing and break even model', what: 'Count every cost, including the ones sitting in a grant line, and find the price that actually covers delivery.', status: 'Coming' },
  { kind: 'Newsletter', meta: 'Fortnightly', name: 'Viable by Design, long edition', what: 'The longer version, from here rather than LinkedIn. More detail, more numbers, and the things I would not post publicly.', status: 'Live now' },
];

export const VIDEOS = [
  { slot: 'ed-vid-1', tag: 'Method', title: 'Why a canvas beats a report', what: 'The argument for putting every decision on one page, and what happens in the room when you do.' },
  { slot: 'ed-vid-2', tag: 'Commercial viability', title: 'What a paying customer actually looks like', what: 'The difference between the people you serve and the people who would pay you.' },
  { slot: 'ed-vid-3', tag: 'Market systems', title: 'Designing for life after exit', what: 'Why interventions collapse at closure, and what to build instead.' },
  { slot: 'ed-vid-4', tag: 'Finance', title: 'Reserves, not loans', what: 'How visible money mobilises somebody else\u2019s capital.' },
  { slot: 'ed-vid-5', tag: 'Pricing', title: 'The cost you have not counted', what: 'Where staff time hides, and why it wrecks a price.' },
  { slot: 'ed-vid-6', tag: 'Lessons', title: 'Twenty years, five mistakes', what: 'The ones I made, and the ones I keep watching other people make.' },
];

export const CANVAS_FAMILY = [
  { key: 'gtcv', n: 9, unit: 'decisions', name: 'Grant to Commercial Viability', blocks: 'From funded delivery to a paying customer.' },
  { key: 'idcms', n: 9, unit: 'decisions, four stages', name: 'Intervention Design', blocks: 'For programme teams designing for life after exit.' },
  { key: 'icc', n: 8, unit: 'steps, then a fork', name: 'Investment Case', blocks: 'For anyone who has been turned down without a reason.' },
  { key: 'intel', n: 7, unit: 'things scored', name: 'Market Intelligence', blocks: 'Four readiness tiers, from real transaction data.' },
];

export const MAGNETS = [
  { key: 'assess', kind: 'Two minutes', name: 'Commercial Readiness Score', what: 'The ten questions I ask in a first session, scored, with your gaps named and one next step.', cta: 'Score your organisation' },
  { key: 'library', kind: 'One page', name: 'The canvas, as a wall print', what: 'All nine decisions on a single sheet you can put on a wall and work through with your team.', cta: 'Get the print' },
  { key: 'library', kind: 'Checklist', name: 'Investment case checklist', what: 'The eight things a funder checks for, in the order they check them. Use it before you send anything.', cta: 'Get the checklist' },
  { key: 'videos', kind: 'Video', name: 'Lessons from implementation', what: 'Twenty years of running economic development programmes, in short pieces you can watch on a commute.', cta: 'Watch on YouTube' },
];

export const PROOF = [
  { cat: 'Implementation learning', title: 'Training is not transformation', what: 'Training alone does not improve produce quality. The market has to reward quality before quality appears. That changes what a capability budget should be buying.' },
  { cat: 'Systemic insight', title: 'Inclusion without income is still exclusion', what: 'A study tracing where the money actually lands in a value chain, and how little of it reaches the people a programme counted as included.' },
  { cat: 'Transition', title: 'A donor programme that became a business', what: 'A regional seed and markets programme moved from donor funded to a private company across three Southern African countries, with clear customers and its own plan.' },
];

export const STATS = [
  { pre: 'UGX ', n: 33, post: 'bn', label: 'of trade a UGX 1bn reserve was structured to unlock' },
  { pre: '', n: 98, post: '%+', label: 'repayment across a structured credit cluster' },
  { pre: '', n: 832, post: '', label: 'households profiled in a liquidity study' },
  { pre: '', n: 7, post: '', label: 'countries across Africa' },
];
