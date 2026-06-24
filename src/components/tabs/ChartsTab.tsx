'use client';
import { ProjectionRow } from '@/types';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { fmt } from '@/lib/projections';

interface Props {
  projections: ProjectionRow[];
}

function shortFmt(value: number) {
  if (Math.abs(value) >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(value) >= 1_000) return (value / 1_000).toFixed(0) + 'K';
  return String(value);
}

export default function ChartsTab({ projections }: Props) {
  if (!projections.length) return <div className="p-6 text-gray-500">No data to chart.</div>;

  const chartData = projections.map(r => ({
    name: 'M' + r.month,
    Revenue: r.revenue,
    'Gross Profit': r.grossProfit,
    EBITDA: r.ebitda,
    Cashflow: r.cashflow,
    'Cum. Cashflow': r.cumCashflow,
  }));

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">P&amp;L Projection — 24 Months</h2>
        <p className="text-sm text-gray-500 mb-4">Revenue, Gross Profit and EBITDA by month (UGX)</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            <Bar dataKey="Revenue" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Gross Profit" fill="#10b981" radius={[2, 2, 0, 0]} />
            <Bar dataKey="EBITDA" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Cumulative Cashflow — 24 Months</h2>
        <p className="text-sm text-gray-500 mb-4">Cumulative cash position over the projection period (UGX)</p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={shortFmt} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="Cum. Cashflow" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
