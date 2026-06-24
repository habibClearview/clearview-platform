'use client';
import { ProjectionRow } from '@/types';
import { fmt, fmtCurrency } from '@/lib/projections';

interface Props {
  projections: ProjectionRow[];
  clientName: string;
}

export default function OverviewTab({ projections, clientName }: Props) {
  if (!projections.length) return <div className="p-6 text-gray-500">No projection data available.</div>;

  const yr1 = projections.slice(0, 12);
  const yr2 = projections.slice(12, 24);

  const sum = (rows: ProjectionRow[], key: keyof ProjectionRow) =>
    rows.reduce((acc, r) => acc + (r[key] as number), 0);

  const stats = [
    { label: 'Year 1 Revenue', value: fmtCurrency(sum(yr1, 'revenue')), sub: '12-month total' },
    { label: 'Year 1 EBITDA', value: fmtCurrency(sum(yr1, 'ebitda')), sub: 'Earnings before interest & tax' },
    { label: 'Year 2 Revenue', value: fmtCurrency(sum(yr2, 'revenue')), sub: '12-month total' },
    { label: 'Year 2 EBITDA', value: fmtCurrency(sum(yr2, 'ebitda')), sub: 'Earnings before interest & tax' },
    { label: 'Month 24 Cash Position', value: fmtCurrency(projections[23].cumCashflow), sub: 'Cumulative cashflow' },
    { label: 'Break-even Month', value: (() => {
      const bm = projections.findIndex(r => r.cumCashflow > 0);
      return bm === -1 ? 'Not in period' : 'Month ' + (bm + 1);
    })(), sub: 'Cumulative cashflow turns positive' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{clientName} — Financial Overview</h2>
        <p className="text-sm text-gray-500 mt-1">24-month projection summary</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className="text-xl font-semibold text-gray-900 mt-1">{s.value}</p>
            <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Month</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Revenue</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Gross Profit</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">EBITDA</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Cum. Cashflow</th>
            </tr>
          </thead>
          <tbody>
            {projections.map((r, i) => (
              <tr key={r.month} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                <td className="px-4 py-2 text-gray-700">{r.label}</td>
                <td className="px-4 py-2 text-right text-gray-700">{fmt(r.revenue)}</td>
                <td className="px-4 py-2 text-right text-gray-700">{fmt(r.grossProfit)}</td>
                <td className={`px-4 py-2 text-right font-medium ${r.ebitda >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(r.ebitda)}</td>
                <td className={`px-4 py-2 text-right font-medium ${r.cumCashflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(r.cumCashflow)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
