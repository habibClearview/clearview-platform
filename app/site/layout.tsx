// The public site's own layout. It adds nothing: the design owns the header,
// the footer and the whole page, so wrapping it in more chrome would be a
// second opinion about a thing already decided.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
