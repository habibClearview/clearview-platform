// ============================================================
// ClearView going and fetching a price list, rather than waiting to be sent
// one.
//
// 20 September 2026. Habib: "what is supposed to happen is that clearview
// pulls these details from the existing system".
//
// A coach records the address of the business's own price list once. From then
// on ClearView reads it every night, and a price changed in their system
// reaches the workspace without anybody doing anything.
//
// WHAT THE ADDRESS MUST BE, AND WHY THE RULES ARE STRICT.
//
// ClearView makes this request from its own servers. That means anything we
// are willing to fetch, we are willing to fetch from inside our own network,
// so an address is only accepted when it is plainly somewhere on the public
// internet. Anything that could be pointed at our own infrastructure is
// refused: this is the hole that gets platforms breached, and a helpful error
// message about it is worth more than the flexibility of allowing it.
// ============================================================

export interface SourceCheck {
  ok: boolean
  reason?: string
}

/** Names that resolve inside a network rather than out on the internet. */
const PRIVATE_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal',
])

/**
 * Whether ClearView is willing to fetch from this address.
 *
 * Pure, so every refusal below is tested rather than trusted.
 */
export function checkSourceUrl(raw: unknown): SourceCheck {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, reason: 'No address was given.' }
  }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'That is not a valid web address. It should look like https://their-system.example.com/products.' }
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'The address must start with https. A price list fetched over plain http can be read or altered on the way to us.' }
  }
  const host = url.hostname.toLowerCase()
  if (PRIVATE_HOSTS.has(host)) {
    return { ok: false, reason: 'That address points at a machine rather than a public web address.' }
  }
  // An address with no dot in it is a machine name on a private network, not a
  // site on the internet.
  if (!host.includes('.')) {
    return { ok: false, reason: 'That address is not a public web address.' }
  }
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return { ok: false, reason: 'That address is on a private network, which ClearView cannot reach.' }
  }
  // Literal private ranges. A name that resolves to one of these is caught at
  // fetch time by the platform's own outbound rules; this catches the obvious
  // case with a message somebody can act on.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number)
    const isPrivate = a === 10
      || a === 127
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
    if (isPrivate) {
      return { ok: false, reason: 'That address is on a private network, which ClearView cannot reach.' }
    }
  }
  return { ok: true }
}

/** How long we wait for their system before giving up. */
export const FETCH_TIMEOUT_MS = 20_000
/** The most we will read, so a runaway response cannot exhaust our memory. */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

export interface FetchOutcome {
  ok: boolean
  payload?: unknown
  status: string
  detail: string
}

/**
 * Reads a price list from their system.
 *
 * Never throws. Every failure comes back as a sentence a coach can read on the
 * screen, because the person who has to chase it is not a developer.
 */
export async function fetchCatalogue(
  url: string,
  authHeader: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome> {
  const check = checkSourceUrl(url)
  if (!check.ok) return { ok: false, status: 'bad_address', detail: check.reason! }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, {
      headers: {
        accept: 'application/json',
        ...(authHeader ? { authorization: authHeader } : {}),
      },
      signal: controller.signal,
      redirect: 'follow',
    })

    if (!res.ok) {
      return {
        ok: false,
        status: `http_${res.status}`,
        detail: res.status === 401 || res.status === 403
          ? 'Their system refused us. The password or key ClearView was given for it is wrong or has been withdrawn.'
          : res.status === 404
            ? 'Their system says that address does not exist. It may have changed.'
            : `Their system answered with an error (${res.status}).`,
      }
    }

    const length = Number(res.headers.get('content-length') || 0)
    if (length > MAX_RESPONSE_BYTES) {
      return { ok: false, status: 'too_large', detail: 'Their price list is too large to read in one go.' }
    }

    const text = await res.text()
    if (text.length > MAX_RESPONSE_BYTES) {
      return { ok: false, status: 'too_large', detail: 'Their price list is too large to read in one go.' }
    }
    try {
      return { ok: true, payload: JSON.parse(text), status: 'ok', detail: 'Read successfully.' }
    } catch {
      return {
        ok: false,
        status: 'not_json',
        detail: 'Their system answered with something that is not a price list in JSON. Check the address points at the product list itself and not at a web page.',
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { ok: false, status: 'timeout', detail: 'Their system did not answer within twenty seconds.' }
    }
    return { ok: false, status: 'unreachable', detail: 'ClearView could not reach their system at that address.' }
  } finally {
    clearTimeout(timer)
  }
}
