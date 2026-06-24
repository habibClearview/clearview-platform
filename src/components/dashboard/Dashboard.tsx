'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, ModelConfig, ClientType } from '@/types';
import { buildProjections } from '@/lib/projections';
import { useAuth } from '@/components/auth/AuthProvider';
import OverviewTab from '@/components/tabs/OverviewTab';
import ConfigTab from '@/components/tabs/ConfigTab';
import ChartsTab from '@/components/tabs/ChartsTab';
import ActualsTab from '@/components/tabs/ActualsTab';
import VarianceTab from '@/components/tabs/VarianceTab';
import ScenariosTab from '@/components/tabs/ScenariosTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'config', label: 'Configuration' },
  { id: 'charts', label: 'Charts' },
  { id: 'actuals', label: 'Actuals' },
  { id: 'variance', label: 'Variance' },
  { id: 'scenarios', label: 'Scenarios' },
];

const DEFAULT_AGRI: Record<string, number | string | boolean> = {
  farmers_start: 50,
  farmers_growth_rate: 5,
  avg_purchase_kg: 200,
  buying_price_per_kg: 800,
  selling_price_per_kg: 1100,
  operating_costs: 5000000,
  cost_growth_rate: 2,
  opening_cash: 10000000,
};

const DEFAULT_LSP: Record<string, number | string | boolean> = {
  clients_start: 5,
  clients_growth_rate: 10,
  avg_monthly_fee: 3000000,
  cogs_rate: 40,
  operating_costs: 8000000,
  cost_growth_rate: 2,
  opening_cash: 15000000,
};

interface Props {
  clientSlug: string;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export default function Dashboard({ clientSlug }: Props) {
  const { profile, signOut } = useAuth();
  const [client, setClient] = useState<Client | null>(null);
  const [config, setConfig] = useState<Record<string, number | string | boolean>>({});
  const [configId, setConfigId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadClient();
  }, [clientSlug]);

  async function loadClient() {
    setLoading(true);
    const { data: clientData, error: clientErr } = await supabase
      .from('clients')
      .select('*')
      .eq('slug', clientSlug)
      .single();

    if (clientErr || !clientData) {
      setError('Client not found.');
      setLoading(false);
      return;
    }

    setClient(clientData);

    const defaults = clientData.client_type === 'agri_aggregator' ? DEFAULT_AGRI : DEFAULT_LSP;

    const { data: configData } = await supabase
      .from('model_config')
      .select('*')
      .eq('client_id', clientData.id)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (configData) {
      setConfig(configData.config_data);
      setConfigId(configData.id);
    } else {
      setConfig(defaults);
    }

    setLoading(false);
  }

  function handleConfigChange(key: string, value: number) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!client) return;
    setSaving(true);
    if (configId) {
      await supabase.from('model_config').update({
        config_data: config,
        updated_at: new Date().toISOString(),
      }).eq('id', configId);
    } else {
      const { data } = await supabase.from('model_config').insert({
        client_id: client.id,
        config_data: config,
        version: 1,
      }).select().single();
      if (data) setConfigId(data.id);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500 text-sm">{error || 'Client not found.'}</p>
      </div>
    );
  }

  const projections = buildProjections(config, client.client_type as ClientType);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Clearview</h1>
          <p className="text-xs text-gray-500">{client.name}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{profile?.email}</span>
          <button
            onClick={signOut}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="bg-white border-b border-gray-200 px-6 overflow-x-auto">
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto">
        {activeTab === 'overview' && <OverviewTab projections={projections} clientName={client.name} />}
        {activeTab === 'config' && (
          <ConfigTab
            clientType={client.client_type as ClientType}
            config={config}
            onChange={handleConfigChange}
            onSave={handleSave}
            saving={saving}
          />
        )}
        {activeTab === 'charts' && <ChartsTab projections={projections} />}
        {activeTab === 'actuals' && <ActualsTab clientId={client.id} clientType={client.client_type as ClientType} />}
        {activeTab === 'variance' && (
          <VarianceTab clientId={client.id} clientType={client.client_type as ClientType} projections={projections} />
        )}
        {activeTab === 'scenarios' && (
          <ScenariosTab clientId={client.id} clientType={client.client_type as ClientType} currentConfig={config} />
        )}
      </main>
    </div>
  );
}
