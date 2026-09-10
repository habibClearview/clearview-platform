// ============================================================
// DOES THE PAGE FIT THE SCREEN IT IS ON
//
// 10 September 2026. Habib: it was impossible to join on the phone because of
// the mobile responsiveness, it does not change with the size of the screen, I
// could not read the site. He also said, several times and correctly, that the
// safeguards exist to stop exactly this and were not being used.
//
// The reason none of the 1,735 tests could see it: they all ran against the
// server or against arithmetic, and a layout only exists in a browser. This
// opens a real browser at real phone widths and measures the page.
//
// It reports two things, and both are things a person notices in the first
// second:
//
//   whether anything sticks out past the right edge, which is what makes a
//   page scroll sideways and read as broken
//
//   the smallest text on the page, because a page can fit perfectly and still
//   be unreadable
//
// WHAT IT CANNOT REACH. Anything behind a sign in. Those pages need a login and
// this has none, so a clean run here is not a claim about the coach dashboard.
//
//   npm run build && npx next start -p 3999 &
//   node scripts/layout-probe.mjs                  (defaults to that server)
//   node scripts/layout-probe.mjs https://clearview.habibonifade.com
// ============================================================
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://127.0.0.1:3999'
const PAGES = ['/', '/welcome', '/join', '/site', '/site/what-i-do/market-intelligence']
// The narrowest phone still in wide use, a large phone, and a tablet held
// upright, which is what a field team actually carries.
const WIDTHS = [390, 414, 768]

// Below this, text is not read, it is squinted at.
const SMALLEST_READABLE = 12

const executablePath = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath })

let failures = 0
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  for (const path of PAGES) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 })
      const r = await page.evaluate(() => {
        const de = document.documentElement
        const over = [...document.querySelectorAll('*')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 3)
          .map((el) => {
            const cls = typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : ''
            return `${el.tagName.toLowerCase()}${cls} (${Math.round(el.getBoundingClientRect().width)}px)`
          })
        const sizes = [...document.querySelectorAll('p,span,div,a,button,label,li')]
          .filter((el) => el.children.length === 0 && (el.textContent || '').trim().length > 3)
          .map((el) => parseFloat(getComputedStyle(el).fontSize))
          .filter((n) => n > 0)
        return { scrollW: de.scrollWidth, innerW: window.innerWidth, over, smallest: sizes.length ? Math.min(...sizes) : null }
      })
      const overflows = r.scrollW > r.innerW + 1
      const tiny = r.smallest !== null && r.smallest < SMALLEST_READABLE
      if (overflows || tiny) failures++
      const note = overflows ? `SCROLLS SIDEWAYS because of ${r.over.join(', ')}` : 'fits'
      const text = r.smallest === null ? '' : `, smallest text ${r.smallest}px${tiny ? ' TOO SMALL' : ''}`
      console.log(`${String(width).padEnd(5)}${path.padEnd(40)}${note}${text}`)
    } catch (e) {
      failures++
      console.log(`${String(width).padEnd(5)}${path.padEnd(40)}COULD NOT BE OPENED: ${e.message.split('\n')[0]}`)
    }
  }
  await ctx.close()
}
await browser.close()

console.log(failures === 0
  ? '\nEvery page fits every width, and nothing is too small to read.'
  : `\n${failures} page and width combinations are wrong. Each is named above.`)
process.exit(failures === 0 ? 0 : 1)
