// The public site's own layout. It adds no chrome — the design owns the header,
// the footer and the whole page — and it does not load fonts either: Poppins,
// the design's typeface, is already self-hosted app-wide in globals.css at 400,
// 500, 600 and 700, which are exactly the weights the design asks for, so the
// design's own `font-family: 'Poppins'` resolves with no second copy shipped.
//
// It does do two things. The dashboard's staging banner is a safety rail for
// people entering real client figures, and it is pinned to the top of every
// page from the root layout. On a public marketing page it is not a safety
// rail, it is a strip sitting on top of the wordmark. A child layout cannot
// unrender a parent's component, so the site hides it here instead.
//
// And it measures the site, and only the site. Vercel Web Analytics sets no
// cookies, so no banner is needed. It is here rather than in the root layout
// so the platform, which holds client data, is never counted.
import SiteAnalytics from '@/components/site/SiteAnalytics'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: '[data-env-banner]{display:none}' }} />
      {children}
      <SiteAnalytics />
    </>
  )
}
