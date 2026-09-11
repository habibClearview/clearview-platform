// ============================================================
// THE MANUALS DO NOT LIVE IN A MAILBOX
//
// 11 September 2026. Habib asked where a co-implementer gets the guidance
// notes and manuals, and whether she should have access to his Gmail folder
// that holds them.
//
// She should not, and the reason is not a preference. A mail folder is reached
// through a mail account, and that account holds his commercial terms with the
// funder, his other clients, and everything else in his working life. There is
// no way to give access to one without the other.
//
// So the rules the library has to hold: the coaching team reads it, only the
// lead consultant changes it, a client or a funder never sees it, and a
// document never gets an address that keeps working for somebody who has left.
// ============================================================
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import {
  GUIDANCE_CATEGORIES, isGuidanceCategory, categoryLabel, guidanceStoragePath, readableSize,
} from '@/lib/guidance'

const ROUTE = fs.readFileSync('app/api/guidance/route.ts', 'utf8')
const PANEL = fs.readFileSync('src/components/gtcv/GuidanceLibrary.tsx', 'utf8')
const DASH = fs.readFileSync('src/components/coach/CoachDashboard.tsx', 'utf8')
const SQL = fs.readFileSync('supabase/migrations/2026_09_11_guidance_library.sql', 'utf8')

describe('who may see the guidance', () => {
  it('is the coaching team, and refuses everybody else', () => {
    expect(ROUTE).toContain("['super_coach', 'coach', 'co_implementer'].includes(role)")
    expect(ROUTE).toContain('The guidance library is for the coaching team')
  })

  it('is the same rule in the database, not only in the route', () => {
    // A route that forgets is one mistake away from a client reading the fee
    // model. The policy holds it whatever calls the table.
    expect(SQL).toContain("my_role() in ('super_coach', 'coach', 'co_implementer')")
    expect(SQL).toContain('alter table guidance_documents enable row level security')
  })

  it('lets only the lead consultant change it', () => {
    expect(ROUTE).toContain('Only the lead consultant can add to the guidance library')
    expect(ROUTE).toContain('Only the lead consultant can remove a document')
    expect(SQL).toContain("using (my_role() = 'super_coach')")
  })

  it('sits on the tab a client never sees', () => {
    expect(DASH).toContain("{shownTab==='coach_ref'&&canViewCoachGuidance(previewRoleId)&&<>")
    expect(DASH).toContain('<GuidanceLibrary/>')
  })
})

describe('a document never gets an address of its own', () => {
  it('is fetched through the platform, with the sign in on the request', () => {
    // A link to a file keeps working for somebody who has left the team, and
    // can be forwarded to anybody.
    expect(ROUTE).not.toContain('createSignedUrl')
    expect(ROUTE).not.toContain('getPublicUrl')
    expect(PANEL).toContain('Authorization: `Bearer ${await token()}`')
  })

  it('is never cached by anything in between', () => {
    expect(ROUTE).toContain("'Cache-Control': 'private, no-store'")
  })
})

describe('where a manual is kept', () => {
  it('is one folder per section', () => {
    const path = guidanceStoragePath('method', 'Delivery Guide', 'guide.pdf')
    expect(path.startsWith('method/')).toBe(true)
    expect(path.endsWith('.pdf')).toBe(true)
    expect(path).toContain('Delivery_Guide')
  })

  it('never lets a title climb out of its folder', () => {
    const path = guidanceStoragePath('../../etc', '../secrets', 'x.pdf')
    expect(path).not.toContain('..')
  })

  it('does not overwrite the version somebody is reading', () => {
    // Uploading a corrected manual must not silently replace the one open on
    // a co-implementer's screen.
    const a = guidanceStoragePath('method', 'Same Title', 'x.pdf')
    const b = guidanceStoragePath('method', 'Same Title', 'x.pdf')
    expect(a === b && a.length > 0).toBe(false)
  })

  it('copes with a file that has no extension', () => {
    expect(guidanceStoragePath('method', 'Notes', 'README')).toMatch(/\.bin$/)
  })
})

describe('the sections', () => {
  it('read in the order the work is done', () => {
    expect(GUIDANCE_CATEGORIES.map((c) => c.id)).toEqual(
      ['method', 'delivery', 'templates', 'commercial', 'reference'])
  })

  it('each say what belongs in them', () => {
    for (const c of GUIDANCE_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(3)
      expect(c.note.length).toBeGreaterThan(10)
    }
  })

  it('refuses a section that does not exist', () => {
    expect(isGuidanceCategory('method')).toBe(true)
    expect(isGuidanceCategory('anything')).toBe(false)
    expect(ROUTE).toContain('That is not one of the sections')
  })

  it('names one for a person rather than showing the stored word', () => {
    expect(categoryLabel('delivery')).toBe('Running a session')
    expect(categoryLabel('unknown')).toBe('unknown')
  })
})

describe('uploaded or linked, never both', () => {
  it('refuses both and refuses neither', () => {
    // A document that is both a file and a link is two documents that will
    // disagree with each other.
    expect(ROUTE).toContain('not both and not neither')
    expect(SQL).toContain('num_nonnulls(file_path, url) = 1')
  })

  it('refuses a link that is not a web address', () => {
    expect(ROUTE).toContain('A link has to begin with http or https')
  })

  it('has a size limit', () => {
    expect(ROUTE).toContain('larger than 50MB')
  })

  it('says plainly which way is better', () => {
    expect(PANEL).toContain('This is the better way')
    expect(PANEL).toContain('only as good as its sharing settings')
  })
})

describe('removing a document', () => {
  it('removes the file before the record of it', () => {
    const del = ROUTE.slice(ROUTE.indexOf('export async function DELETE'))
    expect(del.indexOf("storage.from('guidance').remove")).toBeLessThan(
      del.indexOf("from('guidance_documents').delete()"))
  })

  it('deletes nothing when the file will not go', () => {
    expect(ROUTE).toContain('so nothing has been deleted')
  })
})

describe('a size a person can read', () => {
  it('says it in the unit that suits it', () => {
    expect(readableSize(900)).toBe('900 bytes')
    expect(readableSize(4096)).toBe('4 KB')
    expect(readableSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('says nothing where there is nothing to say', () => {
    expect(readableSize(null)).toBe('')
    expect(readableSize(0)).toBe('')
  })
})
