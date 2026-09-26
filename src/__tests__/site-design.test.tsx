// @vitest-environment jsdom
// ============================================================
// THE PUBLIC SITE SAYS WHAT THE BRIEF SAYS, AND NOTHING IT FORBIDS.
//
// Rewritten 26 September 2026 with the master brief that moved the site from
// NGOs to programmes, implementers and funders. The locked lines are checked
// character for character, because "do not improve, shorten or substitute" is
// only enforceable if something notices when they change. The banned words and
// names are checked across everything a visitor can see.
//
// The approved design's visual identity is still checked: the header with its
// menu button, Clearview sign in in both places, the chapter structure.
// ============================================================
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import {
  MENU, AUDIENCES, MOMENTS, METHODS, FIGURES, RECOMMENDATIONS, REPORTABLE, THREE_QUESTIONS, STATS,
} from '@/components/site/design/data'
import { SCREEN_PATH, CAL_LINK, EVENTS, chapterEvent } from '@/components/site/design/CanvasCoachSite'
import { dropPrivate } from '@/components/site/SiteAnalytics'

const SRC = fs.readFileSync('src/components/site/design/CanvasCoachSite.tsx', 'utf8')
const DATA = fs.readFileSync('src/components/site/design/data.ts', 'utf8')
const PAGE = fs.readFileSync('app/site/page.tsx', 'utf8')
// What a visitor can see: the files with their code comments taken out, so a
// comment explaining a change is not mistaken for the site saying it.
const uncomment = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const PUBLIC = uncomment(SRC + DATA + PAGE)

describe('the locked lines, word for word', () => {
  it('keeps the hero exactly as written', () => {
    expect(SRC).toContain('Do you want the businesses you back to become <span style={{color: "#00afef"}}>commercially viable?</span>')
    expect(SRC).toContain('I do the work that gets them there, and give you the numbers your funder is asking for.')
    expect(SRC).toContain('>SHOW ME HOW<')
    expect(SRC).toContain('Send me an enquiry instead')
  })

  it('uses the funder indicators literally', () => {
    expect(REPORTABLE).toEqual([
      'Investment readiness by stage, for each business and across the portfolio.',
      'Commercial finance accessed and capital leveraged, with amounts and sources.',
      'Adoption outside your partner set — businesses copying the model without a grant.',
      'Partner survival and performance at three, six, twelve and twenty-four months after close.',
    ])
  })

  it('carries the page title, description and link preview from the brief', () => {
    expect(PAGE).toContain("'Habib Onifade — commercial viability in development programmes'")
    expect(PAGE).toContain('I make the businesses that development programmes back able to pay their own way, and prove it from their own numbers — at design, at partner selection, through delivery, and for two years after close.')
    expect(PAGE).toContain("title: 'Do you want the businesses you back to become commercially viable?'")
  })
})

describe('the chapters', () => {
  it('runs the sections in order, named without chapter numbers', () => {
    const at = ['What changed', 'Who this is for', 'What I do', 'How the work gets done', 'What the work found.', 'Three questions worth answering', 'Book twenty minutes']
      .map((name) => SRC.indexOf(`>${name}<`))
    at.forEach((i) => expect(i).toBeGreaterThan(-1))
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(PUBLIC).not.toMatch(/>Chapter 0\d</)
  })

  it('keeps one row of cards per set on a desktop screen', () => {
    const css = fs.readFileSync('src/components/site/design/design.css.ts', 'utf8')
    expect(css).toContain('grid-template-columns: repeat(var(--om-n), minmax(0, 1fr))')
    for (const n of [4, 5, 6]) expect(SRC).toContain(`"--om-n": ${n}`)
  })

  it('speaks to programmes, implementers and funders only', () => {
    expect(AUDIENCES.map((a) => a.who)).toEqual(['Programmes', 'Implementers', 'Funders'])
    expect(PUBLIC).not.toMatch(/\bNGOs?\b/)
  })

  it('gives each moment its question, Habib\'s paragraph, then the output', () => {
    for (const m of MOMENTS) expect(m.body.length).toBeGreaterThan(100)
    expect(MOMENTS[5].body).toContain('across seventy-two market systems documents reviewed in 2024, there were three ex-post evaluations')
    const q = SRC.indexOf('{m.q}'), b = SRC.indexOf('{m.body}'), o = SRC.indexOf('{m.out}')
    expect(q).toBeLessThan(b)
    expect(b).toBeLessThan(o)
  })

  it('lays out the six moments in order', () => {
    expect(MOMENTS.map((m) => m.label)).toEqual([
      'Designing the intervention', 'Choosing partners', 'Working with partners',
      'Taking partners to finance', 'Reporting and closing', 'After the programme',
    ])
  })

  it('names all five methods, and never sells one', () => {
    expect(METHODS.map((m) => m.name)).toEqual([
      'Grant to Commercial Viability Canvas', 'Market Intelligence', 'Investment Case Canvas',
      'Intervention Design Canvas', 'Enterprise Trade Liquidity Multiplier',
    ])
    expect(SRC).toContain('>How the work gets done<')
    expect(SRC.indexOf('>How the work gets done<')).toBeLessThan(SRC.indexOf('Five tools do that work. They are how it is done, not what you buy.'))
    expect(SRC).not.toContain('That is the whole idea.')
    expect(METHODS[0].blocks).toBe('How a business a programme backs gets to paying its own way.')
    expect(PUBLIC).not.toMatch(/subscription|founding subscriber/i)
  })

  it('replaces the fourth Chapter 01 figure with the BEAM review', () => {
    expect(SRC).toContain('ex-post evaluations among 72 market systems documents reviewed in 2024')
    expect(SRC).toContain('BEAM Evidence Review, September 2024')
    expect(SRC).not.toContain('Who pays you?')
  })

  it('carries one recommendation and no empty slots', () => {
    expect(RECOMMENDATIONS).toHaveLength(1)
    expect(RECOMMENDATIONS[0].name).toBe('Cristina Bortes')
    expect(RECOMMENDATIONS[0].role).toBe('Director, PwC Consulting')
  })

  it('asks the three questions in Chapter 06', () => {
    expect(SRC).toContain('Three questions worth answering')
    expect(THREE_QUESTIONS).toHaveLength(3)
    expect(SRC).toContain('Send me Viable by Design')
    expect(SRC).toContain('Every Wednesday. One idea. Unsubscribe whenever.')
  })
})

describe('the proof', () => {
  it('uses the approved figures', () => {
    const shown = [...FIGURES, ...STATS].map((f) => f.n)
    for (const n of [3000, 176281, 10.5, 12, 200, 25, 33, 98, 832, 7]) expect(shown).toContain(n)
    expect(SRC).toContain('Fifteen engagements')
    expect(PUBLIC).toContain('HSBC, ABN Amro, Capita')
  })

  it('leaves out the figure that was withdrawn', () => {
    expect(PUBLIC).not.toMatch(/2\.7 million/)
  })
})

describe('what is never public', () => {
  it('shows no price, fee or rate', () => {
    expect(PUBLIC).not.toMatch(/day rate|per day|per month|\bfee\b|pricing/i)
  })

  it('never names what must not be named', () => {
    expect(PUBLIC).not.toMatch(/Tanager/i)
    expect(PUBLIC).not.toMatch(/Karamoja/i)
  })

  it('offers no demo, trial, preview or guest access', () => {
    expect(PUBLIC).not.toMatch(/\b(demo|trial|preview|guest access)\b/i)
  })

  it('uses none of the banned words', () => {
    for (const w of ['decision-grade', 'legibility', 'render legible', 'hold the position', 'investment-grade']) {
      expect(PUBLIC.toLowerCase()).not.toContain(w)
    }
    // "function" is banned in copy, not in code: check the words only.
    for (const words of [...MOMENTS.flatMap((m) => [m.q, m.out]), ...METHODS.map((m) => m.blocks), ...REPORTABLE]) {
      expect(words).not.toMatch(/\bfunction\b/i)
    }
  })

  it('says every Wednesday, never fortnightly', () => {
    expect(PUBLIC).not.toMatch(/fortnight/i)
  })
})

describe('one call to action', () => {
  it('has no route to the retired pages', () => {
    expect(Object.keys(SCREEN_PATH).sort()).toEqual(['contact', 'home'])
    for (const gone of ['Score your organisation', 'Find out where you stand', 'See what I do', 'Open the library', 'Watch instead', 'See a canvas in full']) {
      expect(SRC).not.toContain(gone)
    }
  })

  it('leads the menu to the chapters, and the enquiry form', () => {
    expect(MENU.map((m) => m.label)).toEqual(['What I do', 'The method', 'Evidence', 'Book a call', 'Send an enquiry'])
  })

  it('asks two questions and nothing else before the calendar', () => {
    expect(SRC).toContain('>Book twenty minutes<')
    expect(SRC).toContain('Two questions first, so I know who I am talking to. Then pick a time.')
    expect(SRC).toContain('>Programme name<')
    expect(SRC).toContain('>Country<')
    expect(SRC).toContain('Anything you want me to look at before we speak?')
    // The calendar element only exists once both answers are in.
    expect(SRC).toMatch(/\{\(calShown\) \? \(\s*<div id="book-calendar"/)
    expect(SRC).toContain("qProgramme.trim().length > 0 && qCountry.trim().length > 0")
    expect(CAL_LINK).toBe('habib-onifade-veikrh/20min')
    expect(SRC).toContain('>SHOW ME AVAILABLE TIMES<')
  })

  it('answers Cal.com\'s own questions from the site, so nothing is asked twice', () => {
    expect(SRC).toContain("'programme-name': qProgramme.trim()")
    expect(SRC).toContain('country: qCountry.trim()')
    expect(SRC).toContain('title: qProgramme.trim()')
    // Never the visitor's email: Cal.com fills that itself only for someone
    // signed in to Cal.com, which is Habib.
    expect(SRC).not.toMatch(/email:\s*q/)
  })
})

describe('measurement', () => {
  it('sends exactly the four named events, plus a marker per chapter', () => {
    expect(Object.values(EVENTS).sort()).toEqual(['call_booked', 'hero_cta_click', 'newsletter_signup', 'qualifier_submitted'])
    expect(chapterEvent('03')).toBe('chapter_03_reached')
    for (const n of ['01', '02', '03', '04', '05', '06', '07']) expect(SRC).toContain(`data-chapter="${n}"`)
  })

  it('never counts the private walkthrough links', () => {
    expect(dropPrivate({ url: 'https://habibonifade.com/how-i-work/abc123' })).toBeNull()
    expect(dropPrivate({ url: 'https://habibonifade.com/' })).not.toBeNull()
  })

  it('adds no advertising pixel, recorder or heatmap', () => {
    const everything = PUBLIC + fs.readFileSync('app/site/layout.tsx', 'utf8') + fs.readFileSync('app/layout.tsx', 'utf8')
    expect(everything).not.toMatch(/fbq|googletagmanager|gtag\(|hotjar|clarity\.ms|fullstory|replayIntegration/i)
  })
})

describe('the replacement copy, approved 26 September 2026', () => {
  it('is used wherever the old lines were', () => {
    const line = 'Assess the businesses. Fix the ones worth fixing. Take the ready ones to finance. Prove what lasted.'
    expect(SRC.split(line).length - 1).toBe(2)
    expect(PUBLIC).not.toContain('Find out who pays. Design the service for them.')
    expect(SRC).toContain('Every Wednesday. One idea about what makes the businesses programmes back actually work.')
    expect(PUBLIC).not.toContain('from funded to paid')
    const contact = fs.readFileSync('app/site/contact/page.tsx', 'utf8')
    for (const text of [SRC, contact]) {
      expect(text).toContain('Your programme, the country, and what you are trying to prove.')
      expect(text).not.toContain('who pays for it now')
    }
  })
})

describe('the approved design, kept', () => {
  it('keeps the header the design has, not a navigation bar', () => {
    expect(SRC).toContain('openMenu')
    expect(SRC).toContain('closeMenu')
  })

  it('keeps Clearview sign in in the header and the footer', () => {
    expect(SRC.split('>Clearview sign in<').length - 1 + SRC.split('\n          Clearview sign in\n').length - 1).toBe(2)
  })

  it('links the socials and the platform, with the new YouTube channel', () => {
    expect(SRC).toContain('linkedin.com/newsletters/viable-by-design')
    expect(SRC).toContain('linkedin.com/in/habibonifade')
    expect(SRC).toContain('youtube.com/@HabibOnifade')
    expect(SRC).not.toContain('DevTVorg')
    expect(SRC).toContain('clearview.habibonifade.com')
    expect(SRC).toContain('mailto:hello@habibonifade.com')
    expect(SRC).toContain('&copy; 2026 Verido UK Limited')
  })

  it('captures through the server, never through a form id in the browser', () => {
    expect(SRC).toContain('/api/subscribe')
    expect(SRC).not.toContain('app.kit.com/forms')
    expect(SRC).not.toMatch(/KIT_API_KEY|kit_[0-9a-f]{8}/)
  })

  it('sources every claim about the world', () => {
    for (const url of [
      'oecd.org/en/publications/2025/06/cuts-in-official-development-assistance',
      'convergence.finance/resource/state-of-blended-finance-2025',
      'beamexchange.org/evidence/evidence-review-2024',
    ]) expect(SRC).toContain(url)
    expect(SRC).toContain('the median blended finance deal')
  })
})

describe('the retired pages', () => {
  it('are kept, not deleted', () => {
    for (const p of ['score', 'library', 'watch', 'evidence', 'what-i-do/market-intelligence', 'what-i-do/trade-liquidity']) {
      expect(fs.existsSync(`docs/site-archive/2026-09-26/pages/${p}/page.tsx`), p).toBe(true)
      expect(fs.existsSync(`app/site/${p}/page.tsx`), p).toBe(false)
    }
  })

  it('send their visitors to the home page, temporarily', async () => {
    const { createRequire } = await import('module')
    const path = await import('path')
    const require_ = createRequire(path.join(process.cwd(), 'noop.js'))
    const rules = await require_(path.join(process.cwd(), 'next.config.js')).redirects()
    for (const src of ['/score', '/library', '/watch', '/evidence', '/what-i-do/:path*']) {
      const onDomain = rules.find((r: any) => r.source === src)
      expect(onDomain?.destination).toBe('/')
      expect(onDomain?.permanent).toBe(false)
      expect(rules.find((r: any) => r.source === `/site${src}`)?.destination).toBe('/site')
    }
  })
})

describe('the dashboard\'s staging banner', () => {
  // The banner is pinned to the top of every page from the root layout, which a
  // child layout cannot unrender. On the marketing site it is not a safety rail
  // for client data, it is a strip sitting on top of the wordmark — so the site
  // hides it. The two halves live in two files and only work as a pair.
  const BANNER = fs.readFileSync('src/components/common/EnvBanner.tsx', 'utf8')
  const SITE_LAYOUT = fs.readFileSync('app/site/layout.tsx', 'utf8')

  it('is addressable, and the public site hides it', () => {
    expect(BANNER).toContain('data-env-banner')
    expect(SITE_LAYOUT).toContain('[data-env-banner]{display:none}')
  })

  it('still shows everywhere else', () => {
    expect(fs.readFileSync('app/globals.css', 'utf8')).not.toContain('data-env-banner')
  })
})
