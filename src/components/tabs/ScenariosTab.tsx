'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Scenario, ClientType } from '@/types';
import { buildProjections, fmt } from '@/lib/projections';

interface Props {
  clientId: string;
  clientType: ClientType;
  currentConfig: Record<string, number | string | boolean>;
}

export default function ScenariosTab({ clientId, clientType, currentConfig }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScenarios();
  }, [clientId]);

  async function loadScenarios() {
    setLoading(true);
    const { data } = await supabase
      .from('scenarios')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    setScenarios(data ?? []);
    setLoading(false);
  }

  async function saveScenario() {
    if (!newName.trim()) return;
    setSaving(true);
    await supabase.from('scenarios').insert({
      client_id: clientId,
      name: newName.trim(),
      description: newDesc.trim() || null,
      config_snapshot: currentConfig,
    });
    setNewName('');
    setNewDesc('');
    await loadScenarios();
    setSaving(false);
  }

  async function deleteScenario(id: string) {
    await supabase.from('scenarios').delete().eq('id', id);
    setScenarios(prev => prev.filter(s => s.id !== id));
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Scenarios</h2>
        <p className="text-sm text-gray-500 mt-1">Save snapshots of the current model configuration for comparison</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Save current configuration as a scenario</p>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Scenario name (e.g. Base Case, Optimistic)"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={newDesc}
          onChange={e => setNewDesc(e.target.value)}
          placeholder="Description (optional)"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={saveScenario}
          disabled={saving || !newName.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Scenario'}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading scenarios...</div>
      ) : scenarios.length === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-6 text-center">
          No scenarios saved yet. Save your current configuration above.
        </div>
      ) : (
        <div className="space-y-4">
          {scenarios.map(s => {
            const proj = buildProjections(s.config_snapshot, clientType);
            const yr1Revenue = proj.slice(0, 12).reduce((a, r) => a + r.revenue, 0);
            const yr1Ebitda = proj.slice(0, 12).reduce((a, r) => a + r.ebitda, 0);
            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                    {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">{new Date(s.created_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => deleteScenario(s.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-xs text-gray-500">Yr 1 Revenue</p>
                    <p className="text-sm font-semibold text-gray-900">{fmt(yr1Revenue)}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-xs text-gray-500">Yr 1 EBITDA</p>
                    <p className={`text-sm font-semibold ${yr1Ebitda >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(yr1Ebitda)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
