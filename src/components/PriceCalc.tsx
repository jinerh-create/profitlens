import { useState, useEffect, useCallback } from 'react';

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface CostInputs {
  productCost: number;
  quantity: number;
  supplierCharges: number;
  packagingCost: number;
  shippingCost: number;
  customsDuty: number;
  vat: number;
  insurance: number;
  handling: number;
  warehouse: number;
  miscExpenses: number;
  currency: string;
}

interface SellingInputs {
  profitMargin: number;
  marketplaceFee: number;
  paymentGatewayFee: number;
  advertisingCost: number;
  deliveryCost: number;
  discount: number;
  commissionFee: number;
}

interface SavedCalc {
  id: string;
  name: string;
  date: string;
  cost: CostInputs;
  selling: SellingInputs;
  totalCost: number;
  sellingPrice: number;
  netProfit: number;
  margin: number;
}

// ─── CURRENCIES ─────────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', flag: '🇬🇧' },
  { code: 'MVR', name: 'Maldivian Rufiyaa', flag: '🇲🇻' },
  { code: 'AED', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'INR', name: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'SGD', name: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'SAR', name: 'Saudi Riyal', flag: '🇸🇦' },
];

const BASE_RATES: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, MVR: 15.4, AED: 3.67, INR: 83.5, CNY: 7.24, SGD: 1.34, SAR: 3.75,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'USD', dp = 2): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
  } catch { return `${currency} ${n.toFixed(dp)}`; }
}

function fmtPct(n: number, dp = 1): string { return `${n.toFixed(dp)}%`; }

function n(v: number | string): number {
  const x = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(x) ? 0 : x;
}

// ─── COST CALCULATOR ─────────────────────────────────────────────────────────

interface CostResult {
  totalLandedCost: number;
  costPerItem: number;
  subtotal: number;
  dutyAmount: number;
  vatAmount: number;
  breakdown: { label: string; amount: number; pct: number }[];
}

function computeCost(c: CostInputs, rates: Record<string, number>): CostResult {
  const rate = rates[c.currency] || 1;
  const toUSD = (v: number) => v / rate;

  const productTotal = toUSD(c.productCost * c.quantity);
  const supplier = toUSD(c.supplierCharges);
  const packaging = toUSD(c.packagingCost);
  const shipping = toUSD(c.shippingCost);
  const insurance = toUSD(c.insurance);
  const handling = toUSD(c.handling);
  const warehouse = toUSD(c.warehouse);
  const misc = toUSD(c.miscExpenses);

  const subtotalBeforeDutyVat = productTotal + supplier + packaging + shipping + insurance + handling + warehouse + misc;
  const dutyAmount = subtotalBeforeDutyVat * (c.customsDuty / 100);
  const vatBase = subtotalBeforeDutyVat + dutyAmount;
  const vatAmount = vatBase * (c.vat / 100);
  const totalLandedCost = vatBase + vatAmount;
  const costPerItem = c.quantity > 0 ? totalLandedCost / c.quantity : totalLandedCost;

  const breakdown = [
    { label: 'Product Cost', amount: productTotal, pct: (productTotal / totalLandedCost) * 100 },
    { label: 'Shipping', amount: shipping, pct: (shipping / totalLandedCost) * 100 },
    { label: 'Customs Duty', amount: dutyAmount, pct: (dutyAmount / totalLandedCost) * 100 },
    { label: 'VAT/Tax', amount: vatAmount, pct: (vatAmount / totalLandedCost) * 100 },
    { label: 'Packaging', amount: packaging, pct: (packaging / totalLandedCost) * 100 },
    { label: 'Other', amount: supplier + insurance + handling + warehouse + misc, pct: ((supplier + insurance + handling + warehouse + misc) / totalLandedCost) * 100 },
  ].filter(x => x.amount > 0);

  return { totalLandedCost, costPerItem, subtotal: subtotalBeforeDutyVat, dutyAmount, vatAmount, breakdown };
}

// ─── SELLING CALCULATOR ───────────────────────────────────────────────────────

interface SellingResult {
  sellingPrice: number;
  breakeven: number;
  grossProfit: number;
  netProfit: number;
  netMargin: number;
  roi: number;
  totalFees: number;
  allDeductions: number;
}

function computeSelling(costPerItem: number, s: SellingInputs): SellingResult {
  const totalFees = costPerItem * ((s.marketplaceFee + s.paymentGatewayFee + s.commissionFee) / 100);
  const fixedCosts = s.advertisingCost + s.deliveryCost;
  const totalCostPerUnit = costPerItem + totalFees + fixedCosts;
  const breakeven = totalCostPerUnit;

  const sellingPrice = s.profitMargin > 0
    ? totalCostPerUnit / (1 - s.profitMargin / 100)
    : totalCostPerUnit * 1.2;

  const priceAfterDiscount = sellingPrice - s.discount;
  const grossProfit = priceAfterDiscount - costPerItem;
  const allDeductions = totalFees + fixedCosts + s.discount;
  const netProfit = priceAfterDiscount - costPerItem - totalFees - fixedCosts;
  const netMargin = priceAfterDiscount > 0 ? (netProfit / priceAfterDiscount) * 100 : 0;
  const roi = costPerItem > 0 ? (netProfit / costPerItem) * 100 : 0;

  return { sellingPrice: priceAfterDiscount, breakeven, grossProfit, netProfit, netMargin, roi, totalFees, allDeductions };
}

// ─── SVG PIE CHART ────────────────────────────────────────────────────────────

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

function PieChart({ data }: { data: { label: string; amount: number; pct: number }[] }) {
  if (!data.length) return null;
  let cumAngle = 0;
  const slices = data.map((d, i) => {
    const startAngle = cumAngle;
    const sweep = (d.pct / 100) * 360;
    cumAngle += sweep;
    const toRad = (a: number) => (a * Math.PI) / 180;
    const x1 = 50 + 40 * Math.cos(toRad(startAngle - 90));
    const y1 = 50 + 40 * Math.sin(toRad(startAngle - 90));
    const x2 = 50 + 40 * Math.cos(toRad(startAngle + sweep - 90));
    const y2 = 50 + 40 * Math.sin(toRad(startAngle + sweep - 90));
    const large = sweep > 180 ? 1 : 0;
    return { d: `M50,50 L${x1},${y1} A40,40,0,${large},1,${x2},${y2}Z`, color: PIE_COLORS[i % PIE_COLORS.length], label: d.label, pct: d.pct };
  });

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 100 100" style={{ width: 140, height: 140, flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}
        <circle cx="50" cy="50" r="22" fill="var(--surface)" />
      </svg>
      <div style={{ flex: 1 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BAR CHART ────────────────────────────────────────────────────────────────

function BarChart({ bars }: { bars: { label: string; value: number; color: string; max: number }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {bars.map((b, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{b.label}</span>
            <span style={{ fontWeight: 700, color: b.color }}>${b.value.toFixed(2)}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, (b.value / b.max) * 100))}%`, background: b.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── INPUT ROW COMPONENT ─────────────────────────────────────────────────────

function InputRow({ label, value, onChange, prefix = '$', suffix, tip, type = 'number', step = '0.01', min = '0' }: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; tip?: string; type?: string; step?: string; min?: string;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="input-prefix">
        {prefix && <span className="input-prefix-label">{prefix}</span>}
        <input
          className="form-input mono"
          type="number"
          step={step}
          min={min}
          value={value || ''}
          placeholder="0"
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={prefix ? {} : { borderRadius: 'var(--radius-sm)' }}
        />
        {suffix && (
          <span className="input-prefix-label" style={{ borderLeft: 'none', borderRight: '1px solid var(--border)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}>{suffix}</span>
        )}
      </div>
      {tip && <p className="tip">{tip}</p>}
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

type Tab = 'cost' | 'selling' | 'analysis' | 'currency' | 'saved' | 'batch';

// ─── BATCH INVOICE TYPES ──────────────────────────────────────────────────────

interface BatchRow {
  id: string;
  description: string;
  size: string;       // e.g. "45cm", "60cm", "Large"
  unitCost: number;   // cost from invoice
  qty: number;
}

interface BatchShared {
  freight: number;
  serviceFee: number;
  otherFees: number;
  dutyPct: number;
  vatPct: number;
  marginPct: number;
  currency: string;
}

const DEFAULT_BATCH_SHARED: BatchShared = {
  freight: 0, serviceFee: 0, otherFees: 0,
  dutyPct: 0, vatPct: 0, marginPct: 30, currency: 'USD',
};

function newBatchRow(id: string): BatchRow {
  return { id, description: '', size: '', unitCost: 0, qty: 1 };
}

const SIZE_OPTIONS = [
  { group: 'Apparel', options: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'] },
  { group: 'CM Sizes', options: ['10cm','12cm','15cm','18cm','20cm','22cm','25cm','27cm','28cm','30cm','35cm','36cm','40cm','45cm','48cm','50cm','55cm','60cm','63cm','65cm','70cm','75cm','80cm','85cm','90cm','100cm','110cm','120cm','130cm','140cm','150cm','160cm','180cm','200cm'] },
  { group: 'Inch Sizes', options: ['4"','6"','8"','10"','12"','14"','16"','18"','20"','24"','30"','36"'] },
  { group: 'Other', options: ['One Size', 'Pack', 'Pair', 'Set', 'Box', 'Dozen', 'Bundle'] },
];

interface BatchItemResult {
  row: BatchRow;
  totalCost: number;          // unitCost × qty
  allocatedShared: number;    // proportion of freight+fees
  landedCostTotal: number;    // totalCost + allocatedShared + duty + vat
  landedCostPerUnit: number;
  sellingPricePerUnit: number;
  profitPerUnit: number;
  marginActual: number;
}

function computeBatch(rows: BatchRow[], shared: BatchShared, rates: Record<string, number>): BatchItemResult[] {
  const rate = rates[shared.currency] || 1;
  const toUSD = (v: number) => v / rate;

  const totalInvoice = rows.reduce((s, r) => s + r.unitCost * r.qty, 0);
  const totalShared = toUSD(shared.freight + shared.serviceFee + shared.otherFees);

  return rows.map(row => {
    const totalCost = toUSD(row.unitCost * row.qty);
    const share = totalInvoice > 0 ? (row.unitCost * row.qty) / totalInvoice : 0;
    const allocatedShared = totalShared * share;
    const subtotal = totalCost + allocatedShared;
    const dutyAmt = subtotal * (shared.dutyPct / 100);
    const vatAmt = (subtotal + dutyAmt) * (shared.vatPct / 100);
    const landedCostTotal = subtotal + dutyAmt + vatAmt;
    const landedCostPerUnit = row.qty > 0 ? landedCostTotal / row.qty : landedCostTotal;
    const sellingPricePerUnit = shared.marginPct < 100
      ? landedCostPerUnit / (1 - shared.marginPct / 100)
      : landedCostPerUnit * 2;
    const profitPerUnit = sellingPricePerUnit - landedCostPerUnit;
    const marginActual = sellingPricePerUnit > 0 ? (profitPerUnit / sellingPricePerUnit) * 100 : 0;
    return { row, totalCost, allocatedShared, landedCostTotal, landedCostPerUnit, sellingPricePerUnit, profitPerUnit, marginActual };
  });
}

const DEFAULT_COST: CostInputs = {
  productCost: 0, quantity: 1, supplierCharges: 0, packagingCost: 0,
  shippingCost: 0, customsDuty: 0, vat: 0, insurance: 0,
  handling: 0, warehouse: 0, miscExpenses: 0, currency: 'USD',
};

const DEFAULT_SELLING: SellingInputs = {
  profitMargin: 30, marketplaceFee: 0, paymentGatewayFee: 0,
  advertisingCost: 0, deliveryCost: 0, discount: 0, commissionFee: 0,
};

export default function PriceCalc() {
  const [tab, setTab] = useState<Tab>('cost');
  const [darkMode, setDarkMode] = useState(true);
  const [cost, setCost] = useState<CostInputs>(DEFAULT_COST);
  const [selling, setSelling] = useState<SellingInputs>(DEFAULT_SELLING);
  const [rates, setRates] = useState<Record<string, number>>(BASE_RATES);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesDate, setRatesDate] = useState('');
  const [saved, setSaved] = useState<SavedCalc[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [convertAmt, setConvertAmt] = useState(1);
  const [convertFrom, setConvertFrom] = useState('USD');
  const [convertTo, setConvertTo] = useState('MVR');
  const [monthlyUnits, setMonthlyUnits] = useState(100);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([newBatchRow('r1'), newBatchRow('r2'), newBatchRow('r3')]);
  const [batchShared, setBatchShared] = useState<BatchShared>(DEFAULT_BATCH_SHARED);
  const [batchNextId, setBatchNextId] = useState(4);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    const stored = localStorage.getItem('pricecalc_saved');
    if (stored) try { setSaved(JSON.parse(stored)); } catch {}
  }, []);

  const fetchRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await r.json();
      if (data.rates) {
        const filtered: Record<string, number> = { USD: 1 };
        CURRENCIES.forEach(c => { if (data.rates[c.code]) filtered[c.code] = data.rates[c.code]; });
        setRates(filtered);
        setRatesDate(data.time_last_update_utc ? new Date(data.time_last_update_utc).toLocaleDateString() : 'today');
      }
    } catch { /* use base rates */ }
    finally { setRatesLoading(false); }
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  const costResult = computeCost(cost, rates);
  const sellingResult = computeSelling(costResult.costPerItem, selling);

  const displayCurrency = cost.currency;
  const toDisplay = (usd: number) => usd * (rates[displayCurrency] || 1);
  const fmtD = (usd: number, dp = 2) => fmt(toDisplay(usd), displayCurrency, dp);

  function updateCost(field: keyof CostInputs, value: number | string) {
    setCost(c => ({ ...c, [field]: value }));
  }
  function updateSelling(field: keyof SellingInputs, value: number) {
    setSelling(s => ({ ...s, [field]: value }));
  }

  function saveCalc() {
    if (!saveName.trim()) { setSaveMsg('Enter a name first'); return; }
    const calc: SavedCalc = {
      id: crypto.randomUUID(),
      name: saveName.trim(),
      date: new Date().toLocaleDateString(),
      cost, selling,
      totalCost: costResult.costPerItem,
      sellingPrice: sellingResult.sellingPrice,
      netProfit: sellingResult.netProfit,
      margin: sellingResult.netMargin,
    };
    const updated = [calc, ...saved].slice(0, 50);
    setSaved(updated);
    localStorage.setItem('pricecalc_saved', JSON.stringify(updated));
    setSaveName('');
    setSaveMsg('Saved!');
    setTimeout(() => setSaveMsg(''), 2000);
  }

  function loadCalc(c: SavedCalc) {
    setCost(c.cost);
    setSelling(c.selling);
    setTab('cost');
  }

  function deleteCalc(id: string) {
    const updated = saved.filter(s => s.id !== id);
    setSaved(updated);
    localStorage.setItem('pricecalc_saved', JSON.stringify(updated));
  }

  function exportCSV() {
    const rows = [
      ['Field', 'Value', 'Currency'],
      ['--- PRODUCT COST ---', '', ''],
      ['Product Cost', cost.productCost, cost.currency],
      ['Quantity', cost.quantity, ''],
      ['Shipping Cost', cost.shippingCost, cost.currency],
      ['Customs Duty %', cost.customsDuty, '%'],
      ['VAT/Tax %', cost.vat, '%'],
      ['Packaging', cost.packagingCost, cost.currency],
      ['Insurance', cost.insurance, cost.currency],
      ['Handling', cost.handling, cost.currency],
      ['Warehouse', cost.warehouse, cost.currency],
      ['Misc Expenses', cost.miscExpenses, cost.currency],
      ['--- RESULTS ---', '', ''],
      ['Total Landed Cost', toDisplay(costResult.totalLandedCost).toFixed(2), displayCurrency],
      ['Cost Per Item', toDisplay(costResult.costPerItem).toFixed(2), displayCurrency],
      ['--- SELLING PRICE ---', '', ''],
      ['Profit Margin %', selling.profitMargin, '%'],
      ['Marketplace Fee %', selling.marketplaceFee, '%'],
      ['Payment Gateway Fee %', selling.paymentGatewayFee, '%'],
      ['Advertising Cost', selling.advertisingCost, displayCurrency],
      ['Delivery Cost', selling.deliveryCost, displayCurrency],
      ['Discount', selling.discount, displayCurrency],
      ['--- PROFIT ANALYSIS ---', '', ''],
      ['Recommended Selling Price', toDisplay(sellingResult.sellingPrice).toFixed(2), displayCurrency],
      ['Break-Even Price', toDisplay(sellingResult.breakeven).toFixed(2), displayCurrency],
      ['Net Profit', toDisplay(sellingResult.netProfit).toFixed(2), displayCurrency],
      ['Net Margin %', sellingResult.netMargin.toFixed(2), '%'],
      ['ROI %', sellingResult.roi.toFixed(2), '%'],
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `price-calc-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function exportPDF() { window.print(); }

  const profitStatus = sellingResult.netProfit > 0
    ? { label: 'Profitable', color: 'var(--emerald)', cls: 'badge-emerald' }
    : sellingResult.netProfit === 0
    ? { label: 'Break Even', color: 'var(--amber)', cls: 'badge-amber' }
    : { label: 'Loss', color: 'var(--red)', cls: 'badge-red' };

  const convertResult = convertAmt * (rates[convertTo] || 1) / (rates[convertFrom] || 1);

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: 'cost', icon: '📦', label: 'Product Cost' },
    { key: 'selling', icon: '💰', label: 'Selling Price' },
    { key: 'analysis', icon: '📊', label: 'Analysis' },
    { key: 'batch', icon: '🧾', label: 'Invoice Pricer' },
    { key: 'currency', icon: '💱', label: 'Currency' },
    { key: 'saved', icon: '💾', label: 'Saved' },
  ];

  return (
    <div id="app">
      {/* PRINT HEADER */}
      <div className="print-header">
        <h1 style={{ marginBottom: '0.5rem' }}>ProfitLens — Price Calculator Report</h1>
        <p>Generated: {new Date().toLocaleString()}</p>
        <hr style={{ margin: '1rem 0' }} />
      </div>

      {/* HEADER */}
      <div className="app-header no-print">
        <div className="app-logo">
          <div className="logo-icon">💹</div>
          <div>
            <div className="app-title">ProfitLens</div>
            <div className="app-subtitle">Import/Export Price Calculator</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{darkMode ? '🌙' : '☀️'}</span>
          <label className="switch">
            <input type="checkbox" checked={!darkMode} onChange={() => setDarkMode(d => !d)} />
            <span className="slider" />
          </label>
          <button className="btn btn-ghost btn-sm no-print" onClick={exportCSV}>⬇ CSV</button>
          <button className="btn btn-primary btn-sm no-print" onClick={exportPDF}>🖨 PDF</button>
        </div>
      </div>

      {/* TOP STATS */}
      <div className="stat-grid stat-grid-4" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Cost / Item', val: fmtD(costResult.costPerItem), color: 'var(--blue)' },
          { label: 'Sell Price', val: fmtD(sellingResult.sellingPrice), color: 'var(--emerald)' },
          { label: 'Net Profit', val: fmtD(sellingResult.netProfit), color: sellingResult.netProfit >= 0 ? 'var(--emerald)' : 'var(--red)' },
          { label: 'ROI', val: fmtPct(sellingResult.roi), color: sellingResult.roi >= 0 ? 'var(--emerald)' : 'var(--red)' },
        ].map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-val" style={{ color: s.color, fontSize: '1.375rem' }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* TABS */}
      <div className="tab-bar no-print">
        {TABS.map(t => (
          <button key={t.key} className={`tab-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ─── COST TAB ─────────────────────────────────────────────────────── */}
      {tab === 'cost' && (
        <div className="fade-in">
          <div className="grid-2" style={{ gap: '1.5rem' }}>
            {/* LEFT: Inputs */}
            <div>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="section-head">
                  <div className="section-title"><span className="section-icon" style={{ background: 'var(--blue-soft)' }}>📦</span>Product Details</div>
                  <select className="form-select" value={cost.currency} onChange={e => updateCost('currency', e.target.value)}
                    style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                  </select>
                </div>
                <div className="grid-2">
                  <InputRow label="Product Price" value={cost.productCost} onChange={v => updateCost('productCost', v)} prefix={cost.currency} />
                  <InputRow label="Quantity" value={cost.quantity} onChange={v => updateCost('quantity', v)} prefix="qty" step="1" min="1" />
                </div>
                <InputRow label="Supplier Charges" value={cost.supplierCharges} onChange={v => updateCost('supplierCharges', v)} prefix={cost.currency} tip="Agent fees, sourcing fees" />
                <InputRow label="Packaging Cost" value={cost.packagingCost} onChange={v => updateCost('packagingCost', v)} prefix={cost.currency} />
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="section-title" style={{ marginBottom: '1rem' }}><span className="section-icon" style={{ background: 'var(--amber-soft)' }}>🚢</span>Shipping & Freight</div>
                <InputRow label="Shipping / Freight Cost" value={cost.shippingCost} onChange={v => updateCost('shippingCost', v)} prefix={cost.currency} tip="Air freight, sea freight, courier" />
                <InputRow label="Insurance Cost" value={cost.insurance} onChange={v => updateCost('insurance', v)} prefix={cost.currency} />
                <InputRow label="Handling Charges" value={cost.handling} onChange={v => updateCost('handling', v)} prefix={cost.currency} />
                <InputRow label="Warehouse / Storage" value={cost.warehouse} onChange={v => updateCost('warehouse', v)} prefix={cost.currency} />
              </div>

              <div className="card">
                <div className="section-title" style={{ marginBottom: '1rem' }}><span className="section-icon" style={{ background: 'var(--red-soft)' }}>🏛️</span>Taxes & Duties</div>
                <InputRow label="Customs / Import Duty" value={cost.customsDuty} onChange={v => updateCost('customsDuty', v)} prefix="%" suffix="of subtotal" step="0.1" />
                <InputRow label="VAT / GST / Tax" value={cost.vat} onChange={v => updateCost('vat', v)} prefix="%" suffix="of subtotal" step="0.1" />
                <InputRow label="Miscellaneous Expenses" value={cost.miscExpenses} onChange={v => updateCost('miscExpenses', v)} prefix={cost.currency} />
              </div>
            </div>

            {/* RIGHT: Results */}
            <div>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="section-title" style={{ marginBottom: '1rem' }}><span className="section-icon" style={{ background: 'var(--emerald-soft)' }}>📋</span>Cost Summary</div>
                {[
                  { label: 'Product Total', val: fmtD(cost.productCost * cost.quantity / (rates[displayCurrency] || 1)), muted: true },
                  { label: 'Shipping & Logistics', val: fmtD((cost.shippingCost + cost.insurance + cost.handling + cost.warehouse) / (rates[displayCurrency] || 1)), muted: true },
                  { label: 'Customs Duty', val: fmtD(costResult.dutyAmount), muted: true },
                  { label: 'VAT / Tax', val: fmtD(costResult.vatAmount), muted: true },
                  { label: 'Other Charges', val: fmtD((cost.supplierCharges + cost.packagingCost + cost.miscExpenses) / (rates[displayCurrency] || 1)), muted: true },
                ].map(row => (
                  <div key={row.label} className="result-row">
                    <span className="result-label">{row.label}</span>
                    <span className="result-val" style={{ fontSize: '0.9375rem', color: 'var(--text-muted)' }}>{row.val}</span>
                  </div>
                ))}
                <div className="divider" style={{ margin: '0.5rem 0' }} />
                <div className="result-row">
                  <span style={{ fontWeight: 700 }}>Total Landed Cost</span>
                  <span className="result-val highlight">{fmtD(costResult.totalLandedCost)}</span>
                </div>
                <div className="result-row">
                  <span className="result-label">Cost Per Item</span>
                  <span className="result-val" style={{ color: 'var(--blue)', fontSize: '1.375rem' }}>{fmtD(costResult.costPerItem)}</span>
                </div>
                {cost.quantity > 1 && (
                  <div className="result-row">
                    <span className="result-label">Total Units</span>
                    <span className="result-val" style={{ fontSize: '0.9375rem' }}>{cost.quantity.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Breakdown chart */}
              {costResult.breakdown.length > 0 && (
                <div className="card">
                  <div className="section-title" style={{ marginBottom: '1rem' }}><span className="section-icon" style={{ background: 'var(--purple-soft)' }}>🥧</span>Cost Breakdown</div>
                  <PieChart data={costResult.breakdown} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── SELLING TAB ───────────────────────────────────────────────────── */}
      {tab === 'selling' && (
        <div className="fade-in">
          <div className="grid-2" style={{ gap: '1.5rem' }}>
            <div>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="section-title" style={{ marginBottom: '1rem' }}><span className="section-icon" style={{ background: 'var(--blue-soft)' }}>🎯</span>Margin & Markup</div>
                <InputRow label="Desired Profit Margin" value={selling.profitMargin} onChange={v => updateSelling('profitMargin', v)} prefix="%" step="0.5" tip="As % of selling price" />
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="section-title" style={{ marginBottom: '1rem' }}><span className="section-icon" style={{ background: 'var(--amber-soft)' }}>🏪</span>Marketplace & Fees</div>
                <InputRow label="Marketplace Fee" value={selling.marketplaceFee} onChange={v => updateSelling('marketplaceFee', v)} prefix="%" tip="Amazon, eBay, Shopify etc." step="0.1" />
                <InputRow label="Payment Gateway Fee" value={selling.paymentGatewayFee} onChange={v => updateSelling('paymentGatewayFee', v)} prefix="%" tip="Stripe, PayPal, etc." step="0.1" />
                <InputRow label="Commission Fee" value={selling.commissionFee} onChange={v => updateSelling('commissionFee', v)} prefix="%" step="0.1" />
              </div>

              <div className="card">
                <div className="section-title" style={{ marginBottom: '1rem' }}><span className="section-icon" style={{ background: 'var(--red-soft)' }}>💸</span>Additional Costs</div>
                <InputRow label="Advertising / Marketing" value={selling.advertisingCost} onChange={v => updateSelling('advertisingCost', v)} prefix={displayCurrency} tip="Per unit cost" />
                <InputRow label="Delivery Cost" value={selling.deliveryCost} onChange={v => updateSelling('deliveryCost', v)} prefix={displayCurrency} tip="Last mile delivery per unit" />
                <InputRow label="Discount / Promo" value={selling.discount} onChange={v => updateSelling('discount', v)} prefix={displayCurrency} />
              </div>
            </div>

            <div>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="section-head">
                  <div className="section-title"><span className="section-icon" style={{ background: 'var(--emerald-soft)' }}>💰</span>Price Summary</div>
                  <span className={`badge ${profitStatus.cls}`}>{profitStatus.label}</span>
                </div>

                {[
                  { label: 'Cost Per Item', val: fmtD(costResult.costPerItem), muted: true },
                  { label: 'Platform Fees', val: fmtD(sellingResult.totalFees), muted: true },
                  { label: 'Other Deductions', val: fmtD(selling.advertisingCost + selling.deliveryCost + selling.discount), muted: true },
                ].map(row => (
                  <div key={row.label} className="result-row">
                    <span className="result-label">{row.label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{row.val}</span>
                  </div>
                ))}
                <div className="divider" style={{ margin: '0.5rem 0' }} />
                <div className="result-row">
                  <span className="result-label">Break-Even Price</span>
                  <span className="result-val" style={{ color: 'var(--amber)' }}>{fmtD(sellingResult.breakeven)}</span>
                </div>
                <div className="result-row">
                  <span style={{ fontWeight: 700 }}>Recommended Selling Price</span>
                  <span className="result-val highlight">{fmtD(sellingResult.sellingPrice)}</span>
                </div>
                <div className="divider" style={{ margin: '0.5rem 0' }} />
                <div className="result-row">
                  <span className="result-label">Gross Profit</span>
                  <span className={`result-val ${sellingResult.grossProfit >= 0 ? 'profit' : 'loss'}`}>{fmtD(sellingResult.grossProfit)}</span>
                </div>
                <div className="result-row">
                  <span className="result-label">Net Profit</span>
                  <span className={`result-val ${sellingResult.netProfit >= 0 ? 'profit' : 'loss'}`} style={{ fontSize: '1.375rem' }}>{fmtD(sellingResult.netProfit)}</span>
                </div>
                <div className="result-row">
                  <span className="result-label">Profit Margin</span>
                  <span className={`result-val ${sellingResult.netMargin >= 0 ? 'profit' : 'loss'}`}>{fmtPct(sellingResult.netMargin)}</span>
                </div>
              </div>

              {sellingResult.netProfit < 0 && (
                <div className="alert alert-danger">⚠️ Your selling price is below break-even. Increase price or reduce costs.</div>
              )}
              {sellingResult.netMargin > 0 && sellingResult.netMargin < 10 && (
                <div className="alert alert-warning">⚡ Margin is below 10%. Consider reviewing fees or increasing price.</div>
              )}

              {/* Save */}
              <div className="card">
                <div className="section-title" style={{ marginBottom: '1rem' }}>💾 Save Calculation</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input className="form-input" placeholder="Calculation name…" value={saveName} onChange={e => setSaveName(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-emerald" onClick={saveCalc}>Save</button>
                </div>
                {saveMsg && <p style={{ color: 'var(--emerald)', fontSize: '0.8125rem', marginTop: '0.5rem' }}>{saveMsg}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ANALYSIS TAB ─────────────────────────────────────────────────── */}
      {tab === 'analysis' && (
        <div className="fade-in">
          <div className="grid-2" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* ROI & Metrics */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}><span className="section-icon" style={{ background: 'var(--blue-soft)' }}>📈</span>Profit Metrics</div>
              <div className="stat-grid stat-grid-2" style={{ marginBottom: '1.25rem' }}>
                {[
                  { label: 'Net Profit', val: fmtD(sellingResult.netProfit), color: sellingResult.netProfit >= 0 ? 'var(--emerald)' : 'var(--red)' },
                  { label: 'ROI', val: fmtPct(sellingResult.roi), color: sellingResult.roi >= 0 ? 'var(--emerald)' : 'var(--red)' },
                  { label: 'Net Margin', val: fmtPct(sellingResult.netMargin), color: 'var(--blue)' },
                  { label: 'Break-Even', val: fmtD(sellingResult.breakeven), color: 'var(--amber)' },
                ].map(s => (
                  <div key={s.label} className="stat-box">
                    <div className="stat-val" style={{ color: s.color, fontSize: '1.25rem' }}>{s.val}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>

              <BarChart bars={[
                { label: 'Selling Price', value: toDisplay(sellingResult.sellingPrice), color: 'var(--blue)', max: toDisplay(sellingResult.sellingPrice) },
                { label: 'Cost Per Item', value: toDisplay(costResult.costPerItem), color: 'var(--amber)', max: toDisplay(sellingResult.sellingPrice) },
                { label: 'Total Fees', value: toDisplay(sellingResult.totalFees), color: 'var(--purple)', max: toDisplay(sellingResult.sellingPrice) },
                { label: 'Net Profit', value: toDisplay(sellingResult.netProfit), color: 'var(--emerald)', max: toDisplay(sellingResult.sellingPrice) },
              ]} />
            </div>

            {/* Monthly projections */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}><span className="section-icon" style={{ background: 'var(--emerald-soft)' }}>📅</span>Monthly Projections</div>
              <div className="form-group">
                <label className="form-label">Units Sold / Month</label>
                <input className="form-input mono" type="number" min="1" value={monthlyUnits}
                  onChange={e => setMonthlyUnits(parseInt(e.target.value) || 1)} />
              </div>
              <div className="stat-grid stat-grid-2" style={{ marginBottom: '1rem' }}>
                {[
                  { label: 'Monthly Revenue', val: fmtD(sellingResult.sellingPrice * monthlyUnits), color: 'var(--blue)' },
                  { label: 'Monthly Profit', val: fmtD(sellingResult.netProfit * monthlyUnits), color: sellingResult.netProfit >= 0 ? 'var(--emerald)' : 'var(--red)' },
                  { label: 'Monthly Cost', val: fmtD(costResult.costPerItem * monthlyUnits), color: 'var(--amber)' },
                  { label: 'Annual Profit', val: fmtD(sellingResult.netProfit * monthlyUnits * 12), color: 'var(--purple)' },
                ].map(s => (
                  <div key={s.label} className="stat-box">
                    <div className="stat-val" style={{ color: s.color, fontSize: '1rem' }}>{s.val}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
              {sellingResult.netProfit > 0 && (
                <div className="alert alert-success">
                  ✅ Selling {monthlyUnits} units/month generates {fmtD(sellingResult.netProfit * monthlyUnits)} net profit monthly.
                </div>
              )}
              {sellingResult.netProfit < 0 && (
                <div className="alert alert-danger">
                  ❌ You lose {fmtD(Math.abs(sellingResult.netProfit))} per unit. Adjust pricing urgently.
                </div>
              )}
            </div>
          </div>

          {/* Scenario comparison */}
          <div className="card">
            <div className="section-title" style={{ marginBottom: '1.25rem' }}><span className="section-icon" style={{ background: 'var(--purple-soft)' }}>🔄</span>Margin Scenarios</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr>
                    {['Margin %', 'Selling Price', 'Net Profit', 'ROI', 'Monthly Profit'].map(h => (
                      <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[10, 15, 20, 25, 30, 40, 50].map(m => {
                    const s = computeSelling(costResult.costPerItem, { ...selling, profitMargin: m });
                    const isActive = Math.round(selling.profitMargin) === m;
                    return (
                      <tr key={m} style={{ background: isActive ? 'var(--blue-soft)' : 'transparent', cursor: 'pointer' }}
                        onClick={() => setSelling(sel => ({ ...sel, profitMargin: m }))}>
                        <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--blue)' : 'var(--text)' }}>{m}%{isActive ? ' ←' : ''}</td>
                        <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)' }}>{fmtD(s.sellingPrice)}</td>
                        <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', color: s.netProfit >= 0 ? 'var(--emerald)' : 'var(--red)', fontWeight: 600 }}>{fmtD(s.netProfit)}</td>
                        <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{fmtPct(s.roi)}</td>
                        <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', color: s.netProfit >= 0 ? 'var(--emerald)' : 'var(--red)' }}>{fmtD(s.netProfit * monthlyUnits)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="tip" style={{ marginTop: '0.75rem' }}>Click a row to apply that margin</p>
          </div>
        </div>
      )}

      {/* ─── BATCH INVOICE TAB ───────────────────────────────────────────── */}
      {tab === 'batch' && (() => {
        const batchResults = computeBatch(batchRows, batchShared, rates);
        const rate = rates[batchShared.currency] || 1;
        const toDisp = (usd: number) => usd * rate;
        const fmtB = (usd: number, dp = 2) => fmt(toDisp(usd), batchShared.currency, dp);

        const totalInvoice = batchRows.reduce((s, r) => s + r.unitCost * r.qty, 0);
        const totalLanded = batchResults.reduce((s, r) => s + r.landedCostTotal, 0);
        const totalSelling = batchResults.reduce((s, r) => s + r.sellingPricePerUnit * r.row.qty, 0);
        const totalProfit = batchResults.reduce((s, r) => s + r.profitPerUnit * r.row.qty, 0);

        const addRow = () => {
          const id = `r${batchNextId}`;
          setBatchNextId(n => n + 1);
          setBatchRows(rows => [...rows, newBatchRow(id)]);
        };

        const updateRow = (id: string, field: keyof BatchRow, value: string | number) => {
          setBatchRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r));
        };

        const removeRow = (id: string) => {
          setBatchRows(rows => rows.filter(r => r.id !== id));
        };

        const exportBatchCSV = () => {
          const headers = ['Description', 'Size', 'Qty', `Unit Cost (${batchShared.currency})`, `Invoice Total`, `Allocated Costs`, `Landed Cost/Unit`, `Selling Price/Unit`, `Profit/Unit`, `Margin %`];
          const dataRows = batchResults.map(r => [
            r.row.description,
            r.row.size,
            r.row.qty,
            r.row.unitCost.toFixed(2),
            toDisp(r.totalCost).toFixed(2),
            toDisp(r.allocatedShared).toFixed(2),
            toDisp(r.landedCostPerUnit).toFixed(2),
            toDisp(r.sellingPricePerUnit).toFixed(2),
            toDisp(r.profitPerUnit).toFixed(2),
            r.marginActual.toFixed(1) + '%',
          ]);
          const csv = [headers, ...dataRows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url;
          a.download = `invoice-prices-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click(); URL.revokeObjectURL(url);
        };

        return (
          <div className="fade-in">
            {/* Shared import costs */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="section-head">
                <div className="section-title"><span className="section-icon" style={{ background: 'var(--amber-soft)' }}>🚢</span>Shared Import Costs</div>
                <select className="form-select" style={{ width: 'auto' }} value={batchShared.currency}
                  onChange={e => setBatchShared(s => ({ ...s, currency: e.target.value }))}>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                </select>
              </div>
              <div className="grid-3" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
                {([
                  ['Freight / Shipping', 'freight'],
                  ['Service / Agent Fee', 'serviceFee'],
                  ['Other Fees', 'otherFees'],
                ] as [string, keyof BatchShared][]).map(([label, field]) => (
                  <div className="form-group" key={field} style={{ marginBottom: 0 }}>
                    <label className="form-label">{label} ({batchShared.currency})</label>
                    <input className="form-input mono" type="number" min="0" step="0.01"
                      value={batchShared[field] as number}
                      onChange={e => setBatchShared(s => ({ ...s, [field]: parseFloat(e.target.value) || 0 }))} />
                  </div>
                ))}
              </div>
              <div className="grid-3" style={{ gap: '0.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Customs Duty %</label>
                  <input className="form-input mono" type="number" min="0" max="100" step="0.1"
                    value={batchShared.dutyPct}
                    onChange={e => setBatchShared(s => ({ ...s, dutyPct: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">VAT / Tax %</label>
                  <input className="form-input mono" type="number" min="0" max="100" step="0.1"
                    value={batchShared.vatPct}
                    onChange={e => setBatchShared(s => ({ ...s, vatPct: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Target Margin %</label>
                  <input className="form-input mono" type="number" min="1" max="99" step="1"
                    value={batchShared.marginPct}
                    onChange={e => setBatchShared(s => ({ ...s, marginPct: parseFloat(e.target.value) || 30 }))} />
                </div>
              </div>
              <p className="tip" style={{ marginTop: '0.5rem' }}>Freight & fees are split across all items proportionally by invoice value</p>
            </div>

            {/* Items table */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="section-head">
                <div className="section-title"><span className="section-icon" style={{ background: 'var(--blue-soft)' }}>📋</span>Invoice Items</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-ghost btn-sm no-print" onClick={exportBatchCSV}>⬇ CSV</button>
                  <button className="btn btn-primary btn-sm" onClick={addRow}>+ Add Row</button>
                </div>
              </div>

              {/* Desktop table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', minWidth: 700 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      {['Description', 'Size / Variant ▾', `Unit Cost (${batchShared.currency})`, 'Qty', 'Landed Cost/Unit', 'Selling Price/Unit', 'Profit/Unit', ''].map(h => (
                        <th key={h} style={{ padding: '0.5rem 0.625rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batchResults.map((res, i) => (
                      <tr key={res.row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                        <td style={{ padding: '0.375rem 0.625rem' }}>
                          <input style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', width: '100%', fontSize: '0.8125rem' }}
                            placeholder="e.g. Doll, T-shirt…"
                            value={res.row.description}
                            onChange={e => updateRow(res.row.id, 'description', e.target.value)} />
                        </td>
                        <td style={{ padding: '0.375rem 0.625rem' }}>
                          <input
                            list="size-options"
                            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, outline: 'none', color: 'var(--text)', width: '110px', fontSize: '0.8125rem', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                            placeholder="Select or type…"
                            value={res.row.size}
                            onChange={e => updateRow(res.row.id, 'size', e.target.value)} />
                          <datalist id="size-options">
                            <optgroup label="── Apparel ──" />
                            {SIZE_OPTIONS[0].options.map(s => <option key={s} value={s} />)}
                            <optgroup label="── CM Sizes ──" />
                            {SIZE_OPTIONS[1].options.map(s => <option key={s} value={s} />)}
                            <optgroup label="── Inch Sizes ──" />
                            {SIZE_OPTIONS[2].options.map(s => <option key={s} value={s} />)}
                            <optgroup label="── Other ──" />
                            {SIZE_OPTIONS[3].options.map(s => <option key={s} value={s} />)}
                          </datalist>
                        </td>
                        <td style={{ padding: '0.375rem 0.625rem' }}>
                          <input style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', width: '80px', fontSize: '0.875rem', fontFamily: 'monospace', textAlign: 'right' }}
                            type="number" min="0" step="0.01"
                            value={res.row.unitCost || ''}
                            onChange={e => updateRow(res.row.id, 'unitCost', parseFloat(e.target.value) || 0)} />
                        </td>
                        <td style={{ padding: '0.375rem 0.625rem' }}>
                          <input style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', width: '50px', fontSize: '0.875rem', fontFamily: 'monospace', textAlign: 'right' }}
                            type="number" min="1" step="1"
                            value={res.row.qty}
                            onChange={e => updateRow(res.row.id, 'qty', parseInt(e.target.value) || 1)} />
                        </td>
                        <td style={{ padding: '0.375rem 0.625rem', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {fmtB(res.landedCostPerUnit)}
                        </td>
                        <td style={{ padding: '0.375rem 0.625rem', fontWeight: 800, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: '0.9375rem' }}>
                          {fmtB(res.sellingPricePerUnit)}
                        </td>
                        <td style={{ padding: '0.375rem 0.625rem', fontWeight: 700, color: res.profitPerUnit >= 0 ? 'var(--emerald)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                          {fmtB(res.profitPerUnit)}
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({res.marginActual.toFixed(1)}%)</span>
                        </td>
                        <td style={{ padding: '0.375rem 0.625rem' }}>
                          <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0.125rem 0.25rem' }}
                            onClick={() => removeRow(res.row.id)} title="Remove row">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tip" style={{ marginTop: '0.5rem' }}>Enter unit costs exactly as shown on the invoice. Selling prices update automatically.</p>
            </div>

            {/* Summary */}
            <div className="stat-grid stat-grid-4" style={{ marginBottom: '1rem' }}>
              {[
                { label: 'Invoice Total', val: fmt(totalInvoice, batchShared.currency), color: 'var(--text)' },
                { label: 'Total Landed Cost', val: fmtB(totalLanded / rate), color: 'var(--amber)' },
                { label: 'Total Selling Value', val: fmtB(totalSelling / rate), color: 'var(--blue)' },
                { label: 'Total Profit', val: fmtB(totalProfit / rate), color: totalProfit >= 0 ? 'var(--emerald)' : 'var(--red)' },
              ].map(s => (
                <div className="stat-box" key={s.label}>
                  <div className="stat-val" style={{ color: s.color, fontSize: '1.25rem' }}>{s.val}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ─── CURRENCY TAB ─────────────────────────────────────────────────── */}
      {tab === 'currency' && (
        <div className="fade-in">
          <div className="grid-2" style={{ gap: '1.5rem' }}>
            <div>
              {/* Converter */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="section-head">
                  <div className="section-title"><span className="section-icon" style={{ background: 'var(--blue-soft)' }}>💱</span>Currency Converter</div>
                  <button className="btn btn-ghost btn-sm no-print" onClick={fetchRates} disabled={ratesLoading}>
                    {ratesLoading ? '⟳ Updating…' : '⟳ Refresh Rates'}
                  </button>
                </div>
                {ratesDate && <p className="tip" style={{ marginBottom: '1rem' }}>Rates updated: {ratesDate}</p>}
                <div className="grid-2" style={{ marginBottom: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Amount</label>
                    <input className="form-input mono" type="number" value={convertAmt} onChange={e => setConvertAmt(parseFloat(e.target.value) || 1)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">From</label>
                    <select className="form-select" value={convertFrom} onChange={e => setConvertFrom(e.target.value)}>
                      {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">To</label>
                  <select className="form-select" value={convertTo} onChange={e => setConvertTo(e.target.value)}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}
                  </select>
                </div>
                <div className="card card-sm" style={{ background: 'var(--blue-soft)', border: '1px solid rgba(59,130,246,0.3)', textAlign: 'center', marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    {convertAmt} {convertFrom} =
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>
                    {convertResult.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {convertTo}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                    1 {convertFrom} = {(rates[convertTo] / (rates[convertFrom] || 1)).toFixed(4)} {convertTo}
                  </div>
                </div>
              </div>
            </div>

            {/* Rate table */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}><span className="section-icon" style={{ background: 'var(--emerald-soft)' }}>📊</span>All Rates vs USD</div>
              {CURRENCIES.map(c => (
                <div key={c.code} className="currency-row">
                  <span style={{ fontSize: '1.25rem' }}>{c.flag}</span>
                  <span className="currency-code">{c.code}</span>
                  <span className="currency-name">{c.name}</span>
                  <span className="currency-rate">{(rates[c.code] || 0).toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── SAVED TAB ────────────────────────────────────────────────────── */}
      {tab === 'saved' && (
        <div className="fade-in">
          <div className="section-head">
            <div className="section-title">💾 Saved Calculations ({saved.length})</div>
            {saved.length > 0 && (
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Clear all saved calculations?')) { setSaved([]); localStorage.removeItem('pricecalc_saved'); } }}>
                Clear All
              </button>
            )}
          </div>
          {saved.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>💾</div>
              <h3 style={{ marginBottom: '0.5rem' }}>No saved calculations</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Go to the Selling Price tab to save a calculation</p>
            </div>
          ) : (
            saved.map(c => (
              <div key={c.id} className="saved-card" onClick={() => loadCalc(c)}>
                <div style={{ flex: 1 }}>
                  <div className="saved-card-title">{c.name}</div>
                  <div className="saved-card-meta">{c.date} · Cost: {fmt(c.totalCost * (rates[c.cost.currency] || 1), c.cost.currency)} · Sell: {fmt(c.sellingPrice * (rates[c.cost.currency] || 1), c.cost.currency)}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, color: c.netProfit >= 0 ? 'var(--emerald)' : 'var(--red)', fontSize: '1.1rem' }}>
                    {c.netProfit >= 0 ? '+' : ''}{fmt(c.netProfit * (rates[c.cost.currency] || 1), c.cost.currency)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fmtPct(c.margin)} margin</div>
                </div>
                <button className="btn btn-danger btn-sm no-print" onClick={e => { e.stopPropagation(); deleteCalc(c.id); }}>✕</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* FOOTER */}
      <div style={{ textAlign: 'center', padding: '2rem 0 1rem', borderTop: '1px solid var(--border)', marginTop: '2rem' }} className="no-print">
        <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
          ProfitLens · Import/Export Price Calculator · All calculations are estimates
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={exportPDF}>🖨 Print / PDF</button>
        </div>
      </div>
    </div>
  );
}
