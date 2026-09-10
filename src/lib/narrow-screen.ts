// ============================================================
// IS THIS A PHONE
//
// 10 September 2026. Habib: people will join this on the phone, people would
// use this for interview capture and conversation or remote session capture,
// and right now the phone cannot capture because the platform is not usable on
// it. That is the whole point of the field work, so it is the important fix.
//
// WHY THIS IS NOT A STYLESHEET RULE. The client screen writes its layout in
// inline styles, and a stylesheet cannot reshape markup. The first attempt was
// a stylesheet override, it assumed the tabs were direct children of the
// navigation, they are not, and every tab printed one letter per line on a
// real phone. A layout that has to change shape has to be decided in the
// component, where the markup is.
//
// It also listens, which is the answer to a second thing Habib reported: the
// page did not change when the phone was turned. A media query match that is
// read once is read in whichever orientation the page happened to load in.
// ============================================================
import { useEffect, useState } from 'react'

/** Below this a screen is a phone: one column, and controls sized for a thumb. */
export const NARROW = 720

export function useNarrowScreen(maxWidth: number = NARROW): boolean {
  // False on the server and on the first paint, so a wide screen never flashes
  // the phone layout on its way in.
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const q = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const read = () => setNarrow(q.matches)
    read()

    // Turning a phone changes the match, and older browsers only offer the
    // deprecated form, so both are attached. Without this the page keeps the
    // shape it had when it loaded, which is what Habib saw on rotating.
    if (q.addEventListener) q.addEventListener('change', read)
    else q.addListener(read)
    window.addEventListener('orientationchange', read)
    window.addEventListener('resize', read)

    return () => {
      if (q.removeEventListener) q.removeEventListener('change', read)
      else q.removeListener(read)
      window.removeEventListener('orientationchange', read)
      window.removeEventListener('resize', read)
    }
  }, [maxWidth])

  return narrow
}
