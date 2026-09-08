// ============================================================
// WHAT PRESSING "SIGN HERE" MEANS
//
// A signature is only worth anything if the signer was told what they were
// agreeing to at the moment they agreed to it. A button that silently writes a
// row records a click; it does not record consent.
//
// So this sentence is shown on screen immediately above the button, and the
// exact same string is stored with the signature. If the wording here ever
// changes, signatures taken before the change still carry the words their
// signer actually saw, because the words travel with the signature rather than
// being looked up later.
// ============================================================

export const ATTESTATION_VERSION = 1

export function attestationText(charterTitle: string, version: number, signerName: string): string {
  return `I, ${signerName}, confirm that I have read the Engagement Charter `
    + `"${charterTitle}" at version ${version}, that I agree to it, and that pressing Sign here `
    + `is my electronic signature on that version, with the same effect as signing it by hand.`
}

/** The short form shown beside a completed signature. */
export const ATTESTATION_SUMMARY =
  'Read the Charter, agreed to it, and signed it electronically.'
