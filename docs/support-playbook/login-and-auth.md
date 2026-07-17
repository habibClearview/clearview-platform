---
{
  "entries": [
    {
      "feature_area": "login",
      "symptom_tags": ["password reset", "reset email", "didn't get reset email", "forgot password", "reset link not working", "can't reset password"],
      "tier": 2,
      "applies_to_roles": ["super_coach", "co_implementer", "financial_model_client", "market_intelligence_subscriber"],
      "user_facing_description": "You asked to reset your password but the reset email never arrived, or the link in it didn't work.",
      "diagnostic_questions": ["Which email address did you request the reset for?", "Have you checked your spam or junk folder?", "Did you click the link within a few minutes of receiving it?"],
      "safe_fix": "Ask the person to check spam/junk and confirm the email matches the one on their account, then request the reset again from the login page. Resetting the password itself is a Step 7 action, so Clair does not do it here.",
      "escalation_criteria": "No reset email arrives after the address is confirmed correct and spam has been checked — the reset email may not be sending, which a person must look into."
    },
    {
      "feature_area": "login",
      "symptom_tags": ["expired link", "link expired", "token expired", "reset link expired", "verification link expired", "magic link expired"],
      "tier": 1,
      "applies_to_roles": ["super_coach", "co_implementer", "financial_model_client", "market_intelligence_subscriber"],
      "user_facing_description": "The reset or verification link you clicked says it has expired.",
      "diagnostic_questions": ["How long ago was the email with the link sent?", "Are you clicking the most recent email, or an older one?"],
      "safe_fix": "Reset and verification links expire on purpose, for security. Ask the person to request a fresh link from the login page and use it straight away. Always use the newest email, not an older one.",
      "escalation_criteria": "A freshly requested link also reports as expired immediately — that points to a clock/config problem a person should check."
    },
    {
      "feature_area": "login",
      "symptom_tags": ["account locked", "locked out", "too many attempts", "locked account", "can't log in locked", "temporarily locked"],
      "tier": 3,
      "applies_to_roles": ["super_coach", "co_implementer", "financial_model_client", "market_intelligence_subscriber"],
      "user_facing_description": "Your account is locked and won't let you sign in.",
      "diagnostic_questions": ["What exact message do you see when you try to log in?", "When did it last work?"],
      "safe_fix": null,
      "escalation_criteria": "Always escalate a locked account. A person must confirm who they are before it is unlocked — this is never done automatically."
    },
    {
      "feature_area": "login",
      "symptom_tags": ["email not verified", "verify email", "unverified email", "confirmation email", "didn't get verification email", "confirm your email"],
      "tier": 2,
      "applies_to_roles": ["super_coach", "co_implementer", "financial_model_client", "market_intelligence_subscriber"],
      "user_facing_description": "You're told your email address isn't verified, or you never received the verification email.",
      "diagnostic_questions": ["Which email address is on the account?", "Have you checked spam or junk?", "Do you remember ever clicking a verification link when you first signed up?"],
      "safe_fix": "Ask the person to check spam/junk and confirm the address, then resend the verification email if that option is offered. Sending the verification email is a Step 7 action, so Clair does not trigger it here.",
      "escalation_criteria": "No verification email arrives after the address is confirmed and spam checked — escalate so it can be resent and checked."
    }
  ]
}
---

# Login & authentication — support notes

Human-readable companion to the structured entries above. These four cover the
ways a person can get stuck signing in. They apply to **everyone**, because all
four roles (super coach, co-implementers, financial-model clients, and market
intelligence subscribers) log in the same way.

## Password-reset failure (Tier 2)
The reset email didn't arrive, or its link didn't work. First check the obvious:
spam folder, and that the email matches the account. Then request the reset
again. If it still doesn't arrive, that's a real delivery problem — escalate.
**Clair does not reset passwords itself** — triggering the reset email is a
strictly whitelisted action added later (Step 7).

## Expired link (Tier 1)
Reset and verification links expire on purpose. The fix is simple and safe:
request a fresh one and use the newest email straight away. Only escalate if a
brand-new link is instantly expired too.

## Locked account (Tier 3)
Always escalate. Unlocking an account means confirming the person really is who
they say they are — that is a human decision, never automatic.

## Unverified email (Tier 2)
The account's email was never confirmed, or the verification email went missing.
Check spam and the address, then resend verification if offered. Sending that
email is also a Step 7 action; until then, escalate so a person can resend it.

---
*Editing this file:* keep the JSON block at the top valid — it is the source of
truth that syncs into the `support_playbook_entries` table. If the JSON is
malformed, the sync fails loudly and tells you which file and entry to fix.
