// ============================================================
// THE LETTER A NEW CO-IMPLEMENTER READS FIRST
//
// Habib, 13 September 2026: you should write email for an audience that does
// not know anything about Clearview or any of the service.
//
// The first version of this letter assumed the reader already knew what the
// Canvas was, what a decision point was, and what a co-implementer does. A
// person joining the team knows none of that. Every term is now explained the
// first time it is used, in the words somebody would use out loud.
//
// ONE LETTER, NOT TWO. 14 September 2026. Habib: I do not want to send another
// email to the co-implementer, they should have the link to register and sign
// on to the platform. The letter used to say the sign-in would arrive
// separately, which left a new person holding an explanation of a platform
// they could not open, waiting on a second message. The sign-in link is now
// generated and put in this letter, and the separate invite button is gone
// from the Team screen. See app/api/co-implementer-welcome/route.ts.
//
// It also now says how to use the platform in the order the work is actually
// done, and where the guide for each session is kept for each of the four
// services, which is the Guidance Library on the Coach Quick Reference tab.
//
// The text below is the letter as generated. A super coach can edit it on the
// Team screen and the edit is saved; "Start again" brings this back. The
// markup is the same as the other welcome letters: a line starting with # is a
// heading, a line starting with - is a bullet, and a blank line separates
// paragraphs. See src/lib/letter.ts.
//
// The sign-in link is NOT part of this text and must never be pasted into it.
// It is a one-time link minted for one person at the moment of sending, and it
// arrives as the button under the letter. That way an edited letter cannot
// carry a stale link, and a saved letter holds nothing that would sign
// somebody in if it were read by the wrong person.
// ============================================================

// THE SALUTATION IS PART OF THE LETTER. 14 September 2026. Habib: "In the team
// email there is no way I can edit the salutation, because the salutation you
// designed in there doesn't pick the name of the co-implementer."
//
// It was bolted on by the server, above the text, so it was the one line of
// the letter he could not change: not the greeting, not a title, not the
// punctuation. And the preview showed "Dear Your Name," which reads as though
// the name were never going to arrive.
//
// The greeting is now the first line of the editable letter, with {name} where
// the person's name goes. He can write "Dear Ms {name}," or "Hello {first
// name}," or anything else, and what he writes is what is sent.
export const NAME_TOKEN = '{name}'
export const FIRST_NAME_TOKEN = '{first name}'

/**
 * Puts the person's name into the letter wherever it was asked for.
 *
 * A letter with no token anywhere is left exactly as written: somebody who
 * deliberately removed the greeting meant to remove it, and quietly putting
 * one back would overrule them.
 *
 * With no name on file the tokens are removed rather than left showing, and
 * the stray punctuation a missing name leaves behind goes with them, so
 * nobody is ever sent "Dear ,".
 */
export function fillLetterName(text: string, fullName?: string | null): string {
  const name = (fullName || '').trim().replace(/\s+/g, ' ')
  const first = name.split(' ')[0] || ''
  // The longer token is replaced first, so {first name} is never left as a
  // stray " name" by {name} matching part of it.
  let out = (text || '').split(FIRST_NAME_TOKEN).join(first).split(NAME_TOKEN).join(name)
  if (!name) {
    // "Dear ," and "Hello ," are worse than no greeting at all.
    out = out.replace(/^[^\S\n]*(dear|hi|hello)[^\S\n]*[,:]?[^\S\n]*$/gim, '')
      .replace(/^\n+/, '')
  }
  return out
}

export const CO_IMPLEMENTER_LETTER_KEY = 'co_implementer_welcome'

export const CO_IMPLEMENTER_LETTER_SUBJECT = 'Welcome to the team: your role, and how the platform works'

export const DEFAULT_CO_IMPLEMENTER_LETTER = `Dear {name},

Welcome. You are joining our practice as a co-implementer.

This letter sets out what the work is, who you report to, how you are paid, and how to use the platform. Read it once now and keep it. If anything in it is unclear, ask. There is no question too small in the first week.

# What this practice does

We work with businesses that have been living on grant money and want to reach the point where they can pay for themselves. Our job is to get them there on evidence rather than on optimism.

The method is called the Grant-to-Commercial Viability Canvas. In plain terms it is nine steps, and each step is a single decision the business has to make: who their customer really is, what that customer will actually pay, whether the thing can be sold at a profit, and so on. A step is closed only when there is real evidence from real customers to support the decision. Then, and only then, the work moves to the next one.

# What your part in it is

- You run the work day to day alongside the lead coach, on the businesses you are assigned to.
- You gather the evidence each step calls for: talking to customers, testing prices, counting what actually sold.
- You put that evidence in front of the business in a form they can decide on, and you record what they decided and why.
- The decision always belongs to the business. We do not decide for a client, and we never record a decision they did not make.
- You are assigned to named businesses. You see those and no others, and that is held by the system itself rather than left to trust.

# Who you report to

- You report to the lead coach on each engagement.
- Anything that changes what a client has been promised, what the work covers, or when it will be finished, goes to the lead coach before it goes to the client.
- If you think we are about to write down something that is not true, say so. That matters more than being agreeable.

# The platform, and how to get in

Everything is kept in one place, on a website. There is nothing to install and there is no second email coming. The button at the end of this letter is your way in: press it, choose your own password, and you are signed in. Use the same email address this letter arrived at every time you sign in afterwards.

If the button has stopped working by the time you press it, which happens when a link has sat in an inbox for several days, reply to this email and a fresh one will be sent.

When you sign in you will see two sections and no others.

- Clients. Every business assigned to you, shown as a card. Opening one takes you into that engagement at the step it has reached.
- My Timesheet and Expenses. Your own record, in four parts: Timesheets, Expenses, Advances and Invoice.

# How to use it, in the order you will need it

Work through it in this order and nothing will be a surprise. Sign in and set your password. Open Clients and press the card for the business you have been asked to work on. Read its Cover, which is the front page and says who is on the engagement and what was agreed. Move to the step the engagement has reached and read the question it is deciding. Do the work. Write what you found where the step asks for it, and record the decision the business made, in their words. At the end of the day, open My Timesheet and Expenses and enter the hours you spent and anything you paid for on the client's behalf. That is the whole loop, and it is the same loop every day.

Two things are worth knowing early. Nothing you type is hidden from the business: they open the same pages from their side. And nothing saves itself into an invoice until the lead coach has approved it, so entering your time promptly is what gets you paid promptly.

# Where the guide for each session is

You are never expected to remember how a session runs. Every guide is on the platform itself, inside the business you are working on, on the tab called Coach Quick Reference. A client and a funder never see that tab.

It holds a library with these shelves, and the guide you want for a session is nearly always on the second one.

- The method. The canvas itself, the nine decision points and the gates.
- Running a session. How each session is run, who must be in the room, and what it has to produce.
- Templates and forms. What is filled in during the work: tables, capture forms and checklists.
- Reference. Background reading, worked examples and anything that does not belong above.

We offer four services, and the guide for each is in that same library.

- Grant-to-Commercial Viability Canvas, which we shorten to GtCV. The nine-step method described above. Its session guides are under Running a session, one per decision point.
- Clearview financial model. The business's own numbers: what it earns, what it spends, and what that means for whether it can carry itself. Its guides cover how to collect a business's real figures and how to talk them through what the model shows.
- Clearview Advisory. Shorter pieces of advice outside a full canvas engagement. The guides cover what is in scope and what is not.
- Market Intelligence. A subscription to what is happening in the markets a client sells into. The guides cover what a client gets and how often.

If a business is not on a service, you will not see that part of their engagement. That is the system deciding, not something to work around.

# Inside a business

- The Cover is the front page. It holds who is on the engagement, what was agreed, and the documents that govern it. Start there on a business you have not opened before.
- Each step holds the question being decided, the evidence gathered for it, and the decision once it is taken.
- The business and their own staff open the same pages from their side. What you write is what they read, so write it as though they are reading it, because they are.

# Your time, your expenses, and getting paid

- Record your time on the day you do the work. Each entry says which business, the date, the hours, and what you did.
- Record anything you spend on a client's behalf, with the amount and the date. You are paid it back once it has been approved.
- Money paid to you ahead of an invoice shows under Advances and comes off your next invoice, so nothing is claimed twice.
- Your invoice is put together for you from the time and expenses that were approved, less any advance. You do not write it yourself.
- Nothing counts towards an invoice until the lead coach has approved it.

# In your first week

- Press the button at the end of this letter, set your password, and sign in.
- Check the details held about you: your name, email, phone, country and specialisation. Tell the lead coach if any of it is wrong.
- Open each business assigned to you and read its Cover before anything else.
- Enter your first timesheet on the day you do the work, so the habit starts straight away.

If anything on the platform does not do what this letter says it does, say so rather than working around it. That is how it gets fixed.`
