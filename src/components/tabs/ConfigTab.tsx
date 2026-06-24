'use client';
import { ClientType } from '@/types';
import { useState, useEffect } from 'react';

interface ConfigField {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
  unit: string;
}

const agriFields: ConfigField[] = [
  { key: 'farmers_start', label: 'Farmers at Start', description: 'Number of contracted farmers in month 1', defaultValue: 50, unit: '' },
  { key: 'farmers_growth_rate', label: 'Monthly Farmer Growth Rate (%)', description: 'Percentage growth in farmer base each month', defaultValue: 5, unit: '%' },
  { key: 'avg_purchase_kg', label: 'Avg Purchase per Farmer (kg)', description: 'Average kilograms purchased from each farmer monthly', defaultValue: 200, unit: 'kg' },
  { key: 'buying_price_per_kg', label: 'Buying Price per kg (UGX)', description: 'Price paid to farmers per kilogram', defaultValue: 800, unit: 'UGX' },
  { key: 'selling_price_per_kg', label: 'Selling Price per kg (UGX)', description: 'Price received from buyers per kilogram', defaultValue: 1100, unit: 'UGX' },
  { key: 'operating_costs', label: 'Monthly Operating Costs (UGX)', description: 'Fixed monthly costs excluding produce purchases', defaultValue: 5000000, unit: 'UGX' },
  { key: 'cost_growth_rate', label: 'Monthly Cost Growth Rate (%)', description: 'Percentage increase in operating costs each month', defaultValue: 2, unit: '%' },
  { key: 'opening_cash', label: 'Opening Cash Position (UGX)', description: 'Cash available at start of projection period', defaultValue: 10000000, unit: 'UGX' },
];

const lspFields: ConfigField[] = [
  { key: 'clients_start', label: 'Clients at Start', description: 'Number of paying clients in month 1', defaultValue: 5, unit: '' },
  { key: 'clients_growth_rate', label: 'Monthly Client Growth Rate (%)', description: 'Percentage growth in client base each month', defaultValue: 10, unit: '%' },
  { key: 'avg_monthly_fee', label: 'Average Monthly Fee (UGX)', description: 'Average monthly revenue per client', defaultValue: 3000000, unit: 'UGX' },
  { key: 'cogs_rate', label: 'Cost of Service Rate (%)', description: 'Percentage of revenue spent on direct service delivery', defaultValue: 40, unit: '%' },
  { key: 'operating_costs', label: 'Monthly Operating Costs (UGX)', description: 'Fixed monthly overheads', defaultValue: 8000000, unit: 'UGX' },
  { key: 'cost_growth_rate', label: 'Monthly Cost Growth Rate (%)', description: 'Percentage increase in operating costs each month', defaultValue: 2, unit: '%' },
  { key: 'opening_cash', label: 'Opening Cash Position (UGX)', description: 'Cash available at start of projection period', defaultValue: 15000000, unit: 'UGX' },
];

interface Props {
  clientType: ClientType;
  config: Record<string, number | string | boolean>;
  onChange: (key: string, value: number) => void;
  onSave: () => void;
  saving: boolean;
}

export default function ConfigTab({ clientType, config, onChange, onSave, saving }: Props) {
  const fields = clientType === 'agri_aggregator' ? agriFields : lspFields;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Model Configuration</h2>
          <p className="text-sm text-gray-500 mt-1">Adjust inputs to update projections in real time</p>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      <div className="space-y-4">
        {fields.map(field => {
          const val = config[field.key];
          const numVal = typeof val === 'number' ? val : typeof val === 'string' ? parseFloat(val) || field.defaultValue : field.defaultValue;
          return (
            <div key={field.key} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-900">{field.label}</label>
                  <p className="text-xs text-gray-500 mt-0.5">{field.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={numVal}
                    onChange={e => onChange(field.key, parseFloat(e.target.value) || 0)}
                    className="w-36 border border-gray-300 rounded px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {field.unit && <span className="text-xs text-gray-500 w-8">{field.unit}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
