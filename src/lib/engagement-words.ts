// ============================================================
// THE WORDS AN ENGAGEMENT PUTS INTO ITS OWN COPY
//
// Habib, 17 September 2026, giving the new Three Questions:
//
//   "In 18 months, what would the {service} need to be earning, and from whom,
//    for you to call it a success?"
//   "What would have to be true for this service to run without {funder}'s
//    support?"
//
// A question that says "your organisation" gets answered about the
// organisation. A question that names the service gets answered about the
// service, which is the conversation the method is actually trying to have.
//
// Both the Three Questions and the Engagement Charter fill these in, so they
// are resolved here once rather than in each screen. Two screens working the
// same rule out separately is how they come to disagree.
//
// WHERE THE FUNDER COMES FROM. The funder is recorded on the PROGRAMME, not on
// the engagement: Ikore's funder is reached through Ignite. Asked whether to
// add a second funder field on the engagement, Habib said to leave it as it is
// on the platform, so this reads the programme's and adds nothing new.
// ============================================================

/** What the copy falls back to when nobody has named the service. */
export const SERVICE_FALLBACK = 'this service'

/**
 * The service this engagement is commercialising, as it would be said in a
 * sentence. "the gender and nutrition service", or "this service".
 */
export function serviceWord(client: { commercialised_service?: string | null } | null | undefined): string {
  const named = (client?.commercialised_service || '').trim()
  return named || SERVICE_FALLBACK
}

/**
 * The service with its own article in front, ready to drop into a sentence.
 *
 * THE ARTICLE HAS TO TRAVEL WITH THE NAME. Habib's wording is "what would the
 * {service} need to be earning", and his fallback when nothing is named is
 * "this service". Put together literally those give "the this service". So the
 * article belongs to the phrase rather than to the sentence: a named service
 * reads "the gender and nutrition service" and an unnamed one reads "this
 * service", and the sentence around them is written without a leading "the".
 * Both of his words are kept; only the grammar is fixed.
 */
export function servicePhrase(client: { commercialised_service?: string | null } | null | undefined): string {
  const named = (client?.commercialised_service || '').trim()
  return named ? `the ${named}` : SERVICE_FALLBACK
}

/**
 * The funder's name, from the programme this engagement sits under, or empty
 * when the engagement has no funder behind it.
 */
export function funderWord(
  client: { programme_id?: string | null } | null | undefined,
  programmes: { id: string; funder?: string | null }[] | null | undefined,
): string {
  if (!client?.programme_id) return ''
  const programme = (programmes || []).find((p) => p.id === client.programme_id)
  return (programme?.funder || '').trim()
}

/**
 * The three questions asked of the chief executive before Decision Point 1
 * opens, with this engagement's own words in them.
 *
 * THE THIRD ONE CHANGES SHAPE WITHOUT A FUNDER. Habib: when the funder is
 * empty, render "What would have to be true for this service to run without
 * grant support?" Not the same sentence with a blank in it: a question with a
 * hole where a name should be reads as a mistake, and the person answering
 * stops to wonder what was meant instead of answering.
 */
export function threeQuestions(service: string, funder: string): string[] {
  const withoutWhat = funder ? `without ${funder}'s support` : 'without grant support'
  return [
    `In 18 months, what would ${service} need to be earning, and from whom, for you to call it a success?`,
    'What do you believe is stopping this service from earning that revenue today?',
    `What would have to be true for this service to run ${withoutWhat}?`,
  ]
}

/** The same three, in the order and with the field each answer is stored in. */
export const QUESTION_FIELDS = ['question_1', 'question_2', 'question_3'] as const

/** Said under every one of the three, in the same words each time. */
export const VERBATIM_HELPER = "Capture the answer verbatim, in the chief executive's own words."

/** The empty box's own prompt. */
export const ANSWER_PLACEHOLDER = 'Enter the answer exactly as given'

/** What the page says above the three, replacing the old paragraph. */
export const THREE_QUESTIONS_INTRO =
  "Record the conversation and these three answers come back in the chief executive's own words, "
  + 'to be read, corrected and signed. Type answers here only when the conversation was not recorded.'

/** The label and helper for the new setting, in Habib's words. */
export const SERVICE_SETTING_LABEL = 'Service this engagement commercialises'
export const SERVICE_SETTING_HELPER =
  'Write it as you would say it in a sentence, for example: gender and nutrition service.'
