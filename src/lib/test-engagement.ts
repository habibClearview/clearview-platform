// ============================================================
// THE ENGAGEMENT THAT EXISTS TO BE BROKEN
//
// Habib's instruction, after a check I ran against a real client's row:
// "the build and test should not be with a real client - there should be a
// test login".
//
// He is right twice over. Testing on a live engagement means the checks write
// to a record a paying client is reading, and it means the person running them
// hesitates, which is how a check ends up narrow enough to miss the thing it
// was for. The three row-level security holes found on 8 September were found
// by trying forbidden writes against a real engagement and then putting its
// data back by hand. That must not be how it works.
//
// So: one engagement, named so nobody mistakes it for work, with its own
// logins on a domain that cannot receive mail, and a rule that every check
// refuses to run against anything else.
//
// WHY THE ADDRESSES LOOK LIKE THAT. .invalid is reserved by RFC 2606 and can
// never be delegated, so a letter sent to one of these cannot reach a real
// person however badly a send goes wrong. They are recognisable on sight in a
// user list, which matters when the person reading that list is deciding
// whether an account belongs there.
// ============================================================

/** The one engagement the checks may touch. */
export const TEST_SLUG = 'test-engagement'

/** What it is called, written so it cannot be mistaken for a client. */
export const TEST_CLIENT_NAME = 'Test Engagement — not a client, safe to break'

/** The programme it sits under, so a funder login has something to be scoped to. */
export const TEST_PROGRAMME_NAME = 'Test Programme — not a funder'

export interface TestLogin {
  email: string
  fullName: string
  role: 'ceo' | 'finance_manager' | 'funder'
  /** What this login exists to prove. */
  proves: string
}

/**
 * The three people an engagement has to answer to. A client who may edit and
 * sign, somebody on their team who may only read, and a funder scoped to the
 * programme rather than to the engagement.
 */
export const TEST_LOGINS: TestLogin[] = [
  {
    email: 'test-client@clearview.invalid',
    fullName: 'Test Client (Executive Director)',
    role: 'ceo',
    proves: 'the client can reach their own dashboard, edit their working tables and sign a block off',
  },
  {
    email: 'test-team@clearview.invalid',
    fullName: 'Test Client (team, read only)',
    role: 'finance_manager',
    proves: 'their team can read the engagement and cannot change or sign anything',
  },
  {
    email: 'test-funder@clearview.invalid',
    fullName: 'Test Funder',
    role: 'funder',
    proves: 'a funder reads the engagements under their programme and writes nothing anywhere',
  },
]

/** Every address the fixture owns, for a caller that needs to recognise them. */
export const TEST_EMAILS: string[] = TEST_LOGINS.map((l) => l.email)

/**
 * True only for an address this fixture created. Used to refuse to delete an
 * account that was not ours, which is the mistake that would hurt.
 */
export function isTestLogin(email: string | null | undefined): boolean {
  if (!email) return false
  return TEST_EMAILS.includes(email.trim().toLowerCase())
}

/**
 * THE RULE. A check may run against the test engagement and nothing else.
 *
 * Given the slug a caller is about to act on, this either returns nothing or
 * returns the sentence explaining the refusal. It is deliberately a slug
 * comparison rather than a "does this look like a test" guess: a client called
 * Test Aggregators Ltd is a client.
 */
export function refuseUnlessTestEngagement(slug: string | null | undefined): string | null {
  if (!slug) return 'No engagement was named. The checks only run against the test engagement.'
  if (slug.trim().toLowerCase() !== TEST_SLUG) {
    return `This runs against the test engagement only. It was pointed at "${slug}", which is a real one. Nothing was done.`
  }
  return null
}

/**
 * A password for a test login. Long, random, and never reused between runs, so
 * a login left behind by a failed run cannot be signed into by guessing. The
 * caller shows it once and does not store it.
 */
export function testPassword(random: () => string = () => Math.random().toString(36).slice(2)): string {
  return `Tst-${random()}${random()}-${Date.now().toString(36)}`
}
