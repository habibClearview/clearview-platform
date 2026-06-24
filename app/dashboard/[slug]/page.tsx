import { redirect } from 'next/navigation'

// Dynamic slug fallback — redirects known clients to their static pages
export default function SlugPage({ params }: { params: { slug: string } }) {
  const slug = params.slug
  if (slug === 'conas') redirect('/dashboard/conas')
  if (slug === 'wonderland') redirect('/dashboard/wonderland')
  redirect('/dashboard')
}
