'use client'
// ============================================================
// THE TWO EFFECTS ON THE SITE. BOTH FAIL OPEN.
//
// "Fails open" here means: if the JavaScript never runs, never fires, or runs
// somewhere it cannot observe anything, the page is still correct and fully
// readable. Both of these have failed closed before, and the failures were
// total rather than cosmetic.
//
//   THE REVEAL. An IntersectionObserver fades sections in. In an embedded or
//   prerendered document the observer never fires, and the page stays blank.
//   So: anything already within 95% of the viewport on mount is never hidden
//   in the first place, and a timer clears anything still hidden after 900ms
//   regardless of what the observer thinks.
//
//   THE COUNT-UP. The markup already contains the final number. The animation
//   lowers it and counts back up. It must never zero the element up front,
//   because if the first frame never arrives the reader is left looking at a
//   page of noughts. That happened. The start value is written inside the
//   first requestAnimationFrame callback, so a frame that never comes leaves
//   the real figure on screen, and a 250ms guard stamps the final value if
//   nothing has run by then.
//
// Both skip entirely when the reader has asked for reduced motion, and the
// count-up also skips when the document is not visible, because a tab in the
// background does not get frames.
// ============================================================
import { useEffect, useRef } from 'react'

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Reveals every [data-reveal] under the returned ref as it scrolls into view.
 * Put it on one wrapper per page rather than per section.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    const show = (el: HTMLElement) => { el.dataset.reveal = 'in' }

    if (reducedMotion() || typeof IntersectionObserver !== 'function') {
      nodes.forEach(show)
      return
    }

    // Anything already on screen is shown immediately. Waiting for an observer
    // to confirm what is already visible is how a page opens blank.
    const h = window.innerHeight || 0
    nodes.forEach((el) => {
      if (el.getBoundingClientRect().top < h * 0.95) show(el)
    })

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { show(e.target as HTMLElement); io.unobserve(e.target) }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 })
    nodes.forEach((el) => { if (el.dataset.reveal !== 'in') io.observe(el) })

    // The backstop. Whatever the observer did or did not do, nothing stays
    // hidden past this point.
    const t = window.setTimeout(() => nodes.forEach(show), 900)
    return () => { window.clearTimeout(t); io.disconnect() }
  }, [])

  return ref
}

/**
 * Counts every [data-count] under the returned ref up to the value already in
 * its text. Safe to use on the same wrapper as useReveal.
 */
export function useCountUp<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-count]'))
    if (!nodes.length) return

    // A background tab gets no frames, and reduced motion means do not.
    // In both cases the markup's own figure is already correct.
    if (reducedMotion() || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return

    const run = (el: HTMLElement) => {
      const target = Number(el.dataset.count)
      if (!Number.isFinite(target)) return
      const dp = (el.dataset.count || '').includes('.') ? 1 : 0
      const dur = 1100
      let started = false
      let raf = 0
      const t0 = performance.now()

      const frame = (now: number) => {
        // The start value is written here, in the first frame, and nowhere
        // earlier. If this never runs the reader still sees the real number.
        started = true
        const p = Math.min(1, (now - t0) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        el.textContent = (target * eased).toFixed(dp)
        if (p < 1) raf = requestAnimationFrame(frame)
        else el.textContent = target.toFixed(dp)
      }
      raf = requestAnimationFrame(frame)

      // If no frame has arrived in a quarter of a second, stop trying and
      // leave the final figure in place.
      window.setTimeout(() => {
        if (!started) { cancelAnimationFrame(raf); el.textContent = target.toFixed(dp) }
      }, 250)
    }

    if (typeof IntersectionObserver !== 'function') { nodes.forEach(run); return }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { run(e.target as HTMLElement); io.unobserve(e.target) }
      }
    }, { threshold: 0.4 })
    nodes.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return ref
}
