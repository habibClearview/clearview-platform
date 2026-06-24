'use client'
// Wonderland model — full port to be completed in next session
// This renders the full Wonderland financial model

import { useState, useMemo, Fragment } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const CC = {
  navy: '#1B2A4A', cyan: '#00B4D8', cream: '#F8F4EE', white: '#FFFFFF',
  slate: '#4A5A6A', border: '#D8E0E8', teal: '#1A9DAA', red: '#C0392B',
}

export default function WonderlandDashboard() {
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: CC.cream, minHeight: '100vh' }}>
      <header style={{ background: CC.navy, padding: '1.25rem 1.5rem', borderBottom: `3px solid ${CC.cyan}` }}>
        <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', letterSpacing: '0.15em', color: CC.cyan, marginBottom: '0.3rem' }}>CANVAS COACH — CLEARVIEW PLANNER</div>
        <h1 style={{ color: CC.white, fontFamily: 'Georgia, serif', fontSize: '1.5rem', margin: 0 }}>Wonderland Farm Services</h1>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: '0.2rem' }}>Full model integration — next session</div>
      </header>
      <main style={{ maxWidth: 900, margin: '3rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
        <div style={{ background: CC.white, border: `1px solid ${CC.border}`, borderRadius: 8, padding: '2rem' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: CC.navy, marginBottom: '1rem' }}>Wonderland Model</div>
          <p style={{ color: CC.slate, fontSize: '0.9rem', lineHeight: 1.6 }}>
            The full Wonderland financial model (including all INPUTS, P&amp;L, Cash Flow, Balance Sheet,
            FGE Roster, Variance Analysis, and Investment Analysis) will be ported into this page in the next session,
            replacing the current artifact link at clearview.habibonifade.com.
          </p>
          <p style={{ color: CC.slate, fontSize: '0.9rem', lineHeight: 1.6, marginTop: '1rem' }}>
            The CONAS model at /dashboard/conas is fully functional and ready to share.
          </p>
        </div>
      </main>
      <footer style={{ textAlign: 'center', padding: '2rem', fontFamily: 'monospace', fontSize: '0.68rem', color: CC.slate }}>
        Canvas Coach · Clearview Planner · habibonifade.com
      </footer>
    </div>
  )
}
