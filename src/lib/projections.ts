import { ProjectionRow, ModelConfig, ClientType } from '@/types';

export function fmt(n: number, decimals = 0): string {
  if (n === undefined || n === null || isNaN(n)) return '0';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtCurrency(n: number): string {
  return 'UGX ' + fmt(n);
}

export function fmtPct(n: number): string {
  return fmt(n, 1) + '%';
}

function getNum(config: Record<string, number | string | boolean>, key: string, fallback = 0): number {
  const v = config[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || fallback;
  return fallback;
}

export function buildAgriProjections(config: Record<string, number | string | boolean>): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  const farmersStart = getNum(config, 'farmers_start', 50);
  const farmersGrowthRate = getNum(config, 'farmers_growth_rate', 5) / 100;
  const avgPurchaseKg = getNum(config, 'avg_purchase_kg', 200);
  const buyingPricePerKg = getNum(config, 'buying_price_per_kg', 800);
  const sellingPricePerKg = getNum(config, 'selling_price_per_kg', 1100);
  const operatingCosts = getNum(config, 'operating_costs', 5000000);
  const costGrowthRate = getNum(config, 'cost_growth_rate', 2) / 100;
  const openingCash = getNum(config, 'opening_cash', 10000000);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let cumCash = openingCash;

  for (let i = 0; i < 24; i++) {
    const farmers = Math.round(farmersStart * Math.pow(1 + farmersGrowthRate, i));
    const revenue = farmers * avgPurchaseKg * (sellingPricePerKg - buyingPricePerKg);
    const cogs = farmers * avgPurchaseKg * buyingPricePerKg;
    const grossProfit = revenue;
    const opex = operatingCosts * Math.pow(1 + costGrowthRate, i);
    const ebitda = grossProfit - opex;
    const cashflow = ebitda;
    cumCash += cashflow;

    rows.push({
      month: i + 1,
      label: months[i] + ' M' + (i + 1),
      revenue: revenue + cogs,
      cogs,
      grossProfit,
      opex,
      ebitda,
      cashflow,
      cumCashflow: cumCash,
    });
  }
  return rows;
}

export function buildServiceLSPProjections(config: Record<string, number | string | boolean>): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  const clientsStart = getNum(config, 'clients_start', 5);
  const clientsGrowthRate = getNum(config, 'clients_growth_rate', 10) / 100;
  const avgMonthlyFee = getNum(config, 'avg_monthly_fee', 3000000);
  const cogsRate = getNum(config, 'cogs_rate', 40) / 100;
  const operatingCosts = getNum(config, 'operating_costs', 8000000);
  const costGrowthRate = getNum(config, 'cost_growth_rate', 2) / 100;
  const openingCash = getNum(config, 'opening_cash', 15000000);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let cumCash = openingCash;

  for (let i = 0; i < 24; i++) {
    const clients = Math.round(clientsStart * Math.pow(1 + clientsGrowthRate, i));
    const revenue = clients * avgMonthlyFee;
    const cogs = revenue * cogsRate;
    const grossProfit = revenue - cogs;
    const opex = operatingCosts * Math.pow(1 + costGrowthRate, i);
    const ebitda = grossProfit - opex;
    const cashflow = ebitda;
    cumCash += cashflow;

    rows.push({
      month: i + 1,
      label: months[i] + ' M' + (i + 1),
      revenue,
      cogs,
      grossProfit,
      opex,
      ebitda,
      cashflow,
      cumCashflow: cumCash,
    });
  }
  return rows;
}

export function buildProjections(config: Record<string, number | string | boolean>, clientType: ClientType): ProjectionRow[] {
  if (clientType === 'agri_aggregator') return buildAgriProjections(config);
  return buildServiceLSPProjections(config);
}
