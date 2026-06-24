'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MonthlyActual, ClientType } from '@/types';
import { fmt } from '@/lib/projections';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const agriKeys = ['revenue', 'cogs', 'gross_profit', 'operating_costs', 'ebitda', 'cashflow'];
const lspKeys = ['revenue', 'cogs', 'gross_profit', 'operating_costs', 'ebitda', 'cashflow'];
const LABELS: Record<string, string> = {
  revenue: 'Revenue (UGX)',
  cogs: 'Cost of Goods / Service (UGX)',
  gross_profit: 'Gross Profit (UGX)',
  operating_costs: 'Operating Costs (UGX)',
  ebitda: 'EBITDA (UGX)',
  cashflow: 'Net Cashflow (UGX)',
};

interface Props {
  clientId: string;
  clientType: ClientType;
}

export default function ActualsTab({ clientId, clientType }: Props) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [actuals, setActuals] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const keys = clientType === 'agri_aggregator' ? agriKeys : lspKeys;

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
      // actuals_data is Record<string, number> - values are always numbers
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

  function handleChange(key: string, value: string) {
    setActuals(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from('monthly_actuals').upsert({
      client_id: clientId,
      period_year: year,
      period_month: month,
      actuals_data: actuals,   // strictly Record<string, number>
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,period_year,period_month' });

    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Monthly Actuals</h2>
          <p className="text-sm text-gray-500 mt-1">Enter actual figures for each period</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <div className="space-y-3">
          {keys.map(key => (
            <div key={key} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
              <label className="text-sm font-medium text-gray-700">{LABELS[key] ?? key}</label>
              <input
                type="number"
                value={actuals[key] ?? ''}
                onChange={e => handleChange(key, e.target.value)}
                className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
          ))}

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="text-sm font-medium text-gray-700 block mb-2">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Any notes for this period..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
