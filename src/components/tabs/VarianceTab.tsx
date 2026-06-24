'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MonthlyActual, ProjectionRow, VarianceRow, ClientType } from '@/types';
import { fmt, fmtPct } from '@/lib/projections';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const KEYS = ['revenue', 'cogs', 'gross_profit', 'operating_costs', 'ebitda', 'cashflow'];
const LABELS: Record<string, string> = {
  revenue: 'Revenue',
  cogs: 'Cost of Goods / Service',
  gross_profit: 'Gross Profit',
  operating_costs: 'Operating Costs',
  ebitda: 'EBITDA',
  cashflow: 'Net Cashflow',
};

interface Props {
  clientId: string;
  clientType: ClientType;
  projections: ProjectionRow[];
}

export default function VarianceTab({ clientId, clientType, projections }: Props) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [actuals, setActuals] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadActuals();
  }, [year, month, clientId]);

  async function loadActuals() {
    setLoading(true);
    const { data } = await supabase
      .from('monthly_actuals')
      .select('*')
      .eq('client_id', clientId)
      .eq('period_year', year)
      .eq('period_month', month)
      .single();

    if (data) {
      const numericData: Record<string, number> = {};
      for (const k of Object.keys(data.actuals_data)) {
        const v = data.actuals_data[k];
        numericData[k] = typeof v === 'number' ? v : parseFloat(v) || 0;
      }
      setActuals(numericData);
      setNotes(data.notes ?? '');
    } else {
      setActuals({});
      setNotes('');
    }
    setLoading(false);
  }

  // Map month number to projection index (month 1 of year 1 = index 0)
  const currentYear = new Date().getFullYear();
  const projIndex = (year - currentYear) * 12 + (month - 1);
  const proj = projections[projIndex];

  const projMap: Record<string, number> = proj ? {
    revenue: proj.revenue,
    cogs: proj.cogs,
    gross_profit: proj.grossProfit,
    operating_costs: proj.opex,
    ebitda: proj.ebitda,
    cashflow: proj.cashflow,
  } : {};

  const rows: VarianceRow[] = KEYS.map(key => {
    const budget = projMap[key] ?? 0;
    const actual = actuals[key] ?? 0;
    const variance = actual - budget;
    const variancePct = budget !== 0 ? (variance / Math.abs(budget)) * 100 : 0;
    return { key, label: LABELS[key], budget, actual, variance, variancePct };
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Variance Analysis</h2>
          <p className="text-sm text-gray-500 mt-1">Budget vs actuals for the selected period</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Line Item</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Budget</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actual</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Variance</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Var %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                    <td className="px-4 py-2 text-gray-700">{r.label}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{fmt(r.budget)}</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-medium">{fmt(r.actual)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${r.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.variance >= 0 ? '+' : ''}{fmt(r.variance)}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${r.variancePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.variancePct >= 0 ? '+' : ''}{fmtPct(r.variancePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Period Notes</p>
              <p className="text-sm text-amber-800">{notes}</p>
            </div>
          )}

          {!proj && (
            <p className="text-sm text-amber-600 bg-amber-50 rounded px-4 py-2">
              No budget projection available for this period. Variance cannot be calculated.
            </p>
          )}
        </>
      )}
    </div>
  );
}
