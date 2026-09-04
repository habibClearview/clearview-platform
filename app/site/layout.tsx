// ============================================================
// THE PUBLIC SITE'S CHROME.
//
// Everything under /site renders inside this. The platform's own layout sits
// above it and is untouched: this adds the header, the footer and the
// approved stylesheet, and nothing else.
//
// Poppins is self hosted by the application already, at the four weights this
// design uses. It is not loaded from Google here, because the application's
// content security policy allows fonts from itself only, and a font that
// silently falls back would change every measurement on the page.
// ============================================================
import { SITE_CSS } from '@/components/site/tokens'
import { Header, Footer } from '@/components/site/Chrome'
import SiteMotion from '@/components/site/SiteMotion'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hb">
      <style dangerouslySetInnerHTML={{ __html: SITE_CSS }} />
      <Header />
      <SiteMotion>{children}</SiteMotion>
      <Footer />
    </div>
  )
}
