// @ts-nocheck
// ============================================================
// THE SITE'S WORDS AND FIGURES, IN ONE PLACE.
//
// Rewritten 26 September 2026 from Habib's master brief, when the site stopped
// speaking to NGOs and started speaking to programmes, implementers and
// funders. Every string here is either his wording from that brief, a line he
// approved in the same conversation, or copy from the approved design kept on
// his instruction. Nothing here is a judgement call.
//
// The site as it stood before that day, every page and every word, is kept in
// docs/site-archive/2026-09-26/.
//
// THE PROOF RULE. Figures are the ones in the brief and no others. Adding one
// means adding it to the brief first.
// ============================================================

/** Every entry jumps to a chapter on the page, except the enquiry form. */
export const MENU = [
  { key: 'services', num: '01', label: 'What I do' },
  { key: 'method', num: '02', label: 'The method' },
  { key: 'evidence', num: '03', label: 'Evidence' },
  { key: 'book', num: '04', label: 'Book a call' },
  { key: 'contact', num: '05', label: 'Send an enquiry' },
];

export const AUDIENCES = [
  { mark: '01', who: 'Programmes', what: 'You choose partners, spend money with them, and have to show what survived.' },
  { mark: '02', who: 'Implementers', what: 'Your next bid rests on what you can evidence from the last one.' },
  { mark: '03', who: 'Funders', what: 'You are asking for investment readiness and leverage, and getting narrative.' },
];

/** Chapter 03. The six moments in a programme's life, in order. */
export const MOMENTS = [
  { n: '1', label: 'Designing the intervention', q: 'Is there a market for this, and in which months do those customers actually hold cash?', out: 'A cash calendar for the target population, a real market size, and the portion of it reachable through the traders and agents already operating.' },
  { n: '2', label: 'Choosing partners', q: 'Which businesses can carry this commercially, rather than which ones apply?', out: 'Every candidate assessed from its own records, ranked, with selection criteria you can defend to your funder.' },
  { n: '3', label: 'Working with partners', q: 'How does this business get to paying its own way?', out: 'A financial model built with the partner, a priced product or service, and a tested route to a real paying customer.' },
  { n: '4', label: 'Taking partners to finance', q: 'What does a lender actually need to see?', out: 'An investment case per business, and introductions. The lending decision belongs to the lender.' },
  { n: '5', label: 'Reporting and closing', q: 'Can we show what happened, and did it last?', out: 'Verified performance per business, mapped to the indicators in your logframe.' },
  { n: '6', label: 'After the programme', q: 'Does anything continue once you have gone?', out: 'The same businesses, the same figures, still reporting for two years after close.' },
];

/**
 * Chapter 04. The five methods, with the descriptions the approved design gave
 * them. The fifth line is Habib's, approved 26 September 2026. Its count comes
 * from the design's own copy: "Three ways to build that reserve".
 */
export const METHODS = [
  { n: 9, unit: 'decisions', name: 'Grant to Commercial Viability Canvas', blocks: 'From funded delivery to a paying customer.' },
  { n: 7, unit: 'things scored', name: 'Market Intelligence', blocks: 'Four readiness tiers, from real transaction data.' },
  { n: 8, unit: 'steps, then a fork', name: 'Investment Case Canvas', blocks: 'For anyone who has been turned down without a reason.' },
  { n: 9, unit: 'decisions, four stages', name: 'Intervention Design Canvas', blocks: 'For programme teams designing for life after exit.' },
  { n: 3, unit: 'ways to build the reserve', name: 'Enterprise Trade Liquidity Multiplier', blocks: 'How a ring-fenced reserve unlocks many times its own value in trade credit. Used at moments 1 and 4.' },
];

/** Chapter 05. The findings the approved design led with. */
export const PROOF = [
  { cat: 'Implementation learning', title: 'Training is not transformation', what: 'Training alone does not improve produce quality. The market has to reward quality before quality appears. That changes what a capability budget should be buying.' },
  { cat: 'Systemic insight', title: 'Inclusion without income is still exclusion', what: 'A study tracing where the money actually lands in a value chain, and how little of it reaches the people a programme counted as included.' },
  { cat: 'Transition', title: 'A donor programme that became a business', what: 'A regional seed and markets programme moved from donor funded to a private company across three Southern African countries, with clear customers and its own plan.' },
];

/**
 * Chapter 05. The brief's proof figures that the site did not already carry.
 * UGX 33bn, 98%+, 832 and seven countries sit in STATS below and are not
 * repeated here.
 */
export const FIGURES = [
  { pre: '', n: 3000, post: '+', label: 'micro and small enterprises financed in Kano, Nigeria, with repayment sustained above 98%' },
  { pre: '', n: 176281, post: '', label: 'producers reached against a target of 76,998 (MADE, Nigeria)' },
  { pre: '£', n: 10.5, post: 'm', label: 'net additional income against a £3.1m target (MADE, Nigeria)' },
  { pre: '', n: 12, post: '', label: 'private companies partnered, leveraging £500,000+ into the cassava value chain' },
  { pre: '', n: 200, post: '%+', label: 'production growth in leather clusters, Kano' },
  { pre: '', n: 25, post: '', label: 'years of work across seven African countries' },
];

/** Chapter 05. Room for three. Leave a slot out rather than fill it. */
export const RECOMMENDATIONS = [
  {
    quote: 'I worked with Al-Habib for a few years when he was the Market Systems Adviser for our BIF programme in Nigeria. Al-Habib has extensive market systems expertise and knows Nigeria and the various stakeholders involved in the agricultural supply chains in Nigeria very well. I would highly recommend Al-Habib for any market systems, value chain analysis and economic development programmes across Africa.',
    name: 'Cristina Bortes',
    role: 'Director, PwC Consulting',
  },
];

/** Chapter 05. The literal wording of current funder indicators. Do not paraphrase. */
export const REPORTABLE = [
  'Investment readiness by stage, for each business and across the portfolio.',
  'Commercial finance accessed and capital leveraged, with amounts and sources.',
  'Adoption outside your partner set — businesses copying the model without a grant.',
  'Partner survival and performance at three, six, twelve and twenty-four months after close.',
];

/** Chapter 06. */
export const THREE_QUESTIONS = [
  'Which of your partner businesses are solvent right now?',
  'Which will still be trading two years after you leave?',
  'What would it take to make the rest investable?',
];

export const STATS = [
  { pre: 'UGX ', n: 33, post: 'bn', label: 'of trade a UGX 1bn reserve was structured to unlock' },
  { pre: '', n: 98, post: '%+', label: 'repayment across a structured credit cluster' },
  { pre: '', n: 832, post: '', label: 'households profiled in a liquidity study' },
  { pre: '', n: 7, post: '', label: 'countries across Africa' },
];
