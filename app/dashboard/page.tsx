'use client'
import Link from 'next/link'

const clients = [
  { slug: 'conas', name: 'CONAS Agricultural Hub', type: 'Agri-Aggregator', status: 'Active' },
  { slug: 'wonderland', name: 'Wonderland Farm Services', type: 'Agri-Aggregator', status: 'Active' },
]

export default function DashboardIndex() {
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: '#F8F4EE', minHeight: '100vh' }}>
      <header style={{ background: '#1B2A4A', padding: '1.25rem 1.5rem', borderBottom: '3px solid #00B4D8' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', letterSpacing: '0.15em', color: '#00B4D8', marginBottom: '0.3rem' }}>CANVAS COACH</div>
        <h1 style={{ color: '#fff', fontFamily: 'Georgia, serif', fontSize: '1.5rem', margin: 0 }}>Clearview Planner</h1>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: '0.2rem' }}>Select a client to open their planning model</div>
      </header>
      <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {clients.map(c => (
            <Link key={c.slug} href={`/dashboard/${c.slug}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: '#fff', border: '1px solid #D8E0E8', borderRadius: 8, padding: '1.25rem', borderTop: '4px solid #00B4D8', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#4A5A6A', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>{c.type}</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', fontWeight: 700, color: '#1B2A4A', marginBottom: '0.3rem' }}>{c.name}</div>
                <div style={{ fontSize: '0.78rem', color: '#4A5A6A' }}>Status: {c.status}</div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <footer style={{ textAlign: 'center', padding: '2rem', fontFamily: 'monospace', fontSize: '0.68rem', color: '#4A5A6A' }}>
        Canvas Coach · Clearview Planner · habibonifade.com
      </footer>
    </div>
  )
}
