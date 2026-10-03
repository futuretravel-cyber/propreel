/**
 * Monthly Profit & Loss statements for the admin dashboard.
 *
 * Revenue is derived from the real credit ledger — the single source of
 * truth for every Rand that touched the platform:
 *   - type 'purchase'   amount > 0  → one-off credit top-ups (1 credit = R1)
 *   - type 'purchase'   amount < 0  → prorated plan-upgrade charges
 *                                     (metadata.kind = 'PLAN_UPGRADE')
 *   - type 'subscription'           → recurring revenue valued at list price
 *                                     (pricing_config plans, cycle-aware)
 *   - type 'refund'     amount > 0  → revenue reversed (credits handed back)
 * Usage (accrual view) = type 'deduction' credits consumed × R1 face value.
 *
 * Operating expenses (fal.ai, Modal, AWS, Paystack, …) are hand-entered by
 * the admin and stored per month in the settings table as
 * `pl_expenses_<YYYY-MM>`. Month boundaries are SAST (UTC+2) so the books
 * line up with South African calendar months.
 */

import { TABLES, scanItems, getItem, putItem, deleteItem } from './db';

export const EXPENSE_CATEGORIES = [
  'fal.ai', 'Modal', 'AWS', 'Paystack', 'Marketing', 'Payroll', 'Software', 'Office', 'Other',
] as const;

/** Credits are sold at R1 face value (top-ups are 1:1; plans ≈ R1/credit). */
export const CREDIT_FACE_VALUE = 1;

export interface PnlExpense {
  id: string;
  label: string;
  category: string;
  amount: number;
  note?: string;
  createdAt: string;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonthKey = (m: string) => MONTH_RE.test(m);

/** SAST (UTC+2) window [start, end) for a YYYY-MM month key. */
export function monthWindowSAST(month: string): { start: number; end: number } {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: Date.parse(`${y}-${pad(m)}-01T00:00:00+02:00`),
    end: Date.parse(`${ny}-${pad(nm)}-01T00:00:00+02:00`),
  };
}

export function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Ascending list of the last `n` month keys ending at (and including) `month`. */
export function lastNMonths(month: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftMonthKey(month, -i));
  return out;
}

/** SAST month key for a timestamp. */
function monthKeyAt(ms: number): string {
  const d = new Date(ms + 2 * 3600 * 1000); // shift into SAST
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[m - 1]} ${y}`;
}

// ─── Expense CRUD (settings table, one row per month) ───────────────────────

interface PnlExpenseRow {
  id: string;
  kind: 'pl_expenses';
  month: string;
  items: PnlExpense[];
  updatedAt: string;
}

export async function loadPnlExpenses(month: string): Promise<PnlExpense[]> {
  try {
    const row = await getItem<PnlExpenseRow>(TABLES.SETTINGS, { id: `pl_expenses_${month}` });
    return Array.isArray(row?.items) ? row!.items : [];
  } catch {
    return [];
  }
}

export async function addPnlExpense(month: string, input: {
  label: string; category: string; amount: number; note?: string;
}): Promise<PnlExpense> {
  const items = await loadPnlExpenses(month);
  const item: PnlExpense = {
    id: `ple_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: input.label,
    category: input.category || 'Other',
    amount: Math.round(Number(input.amount) * 100) / 100,
    note: input.note || undefined,
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  await putItem(TABLES.SETTINGS, {
    id: `pl_expenses_${month}`,
    kind: 'pl_expenses',
    month,
    items,
    updatedAt: new Date().toISOString(),
  } satisfies PnlExpenseRow);
  return item;
}

export async function deletePnlExpense(month: string, itemId: string): Promise<boolean> {
  const items = await loadPnlExpenses(month);
  const next = items.filter(i => i.id !== itemId);
  if (next.length === items.length) return false;
  if (next.length === 0) {
    await deleteItem(TABLES.SETTINGS, { id: `pl_expenses_${month}` }).catch(() => {});
    return true;
  }
  await putItem(TABLES.SETTINGS, {
    id: `pl_expenses_${month}`,
    kind: 'pl_expenses',
    month,
    items: next,
    updatedAt: new Date().toISOString(),
  } satisfies PnlExpenseRow);
  return true;
}

// ─── Statement computation ──────────────────────────────────────────────────

interface MonthAgg {
  subscriptionZar: number;
  topupZar: number;
  refundZar: number;
  creditsConsumed: number;
  creditsGranted: number;
  subscriptionEvents: number;
  topupEvents: number;
  subscriptionUsers: Set<string>;
  topupUsers: Set<string>;
  spenders: Set<string>;
  renders: number;
  video: { renders: number; credits: number };
  flash: { renders: number; credits: number };
  image: { renders: number; credits: number };
}

const emptyAgg = (): MonthAgg => ({
  subscriptionZar: 0, topupZar: 0, refundZar: 0,
  creditsConsumed: 0, creditsGranted: 0,
  subscriptionEvents: 0, topupEvents: 0,
  subscriptionUsers: new Set(), topupUsers: new Set(), spenders: new Set(),
  renders: 0,
  video: { renders: 0, credits: 0 },
  flash: { renders: 0, credits: 0 },
  image: { renders: 0, credits: 0 },
});

export interface PnlSeriesPoint {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
  creditsConsumed: number;
}

export interface PnlStatement {
  month: string;
  monthLabel: string;
  inProgress: boolean;
  revenue: { subscription: number; topups: number; refunds: number; total: number };
  usage: { creditsConsumed: number; recognizedRevenue: number; creditsGranted: number };
  expenses: { items: PnlExpense[]; total: number; byCategory: Array<{ category: string; total: number }> };
  net: { cash: number; usage: number };
  margin: { cash: number | null; usage: number | null };
}

export interface PnlMetrics {
  activeSubscriptions: number;
  newSignups: number;
  payingCustomers: number;
  subscriptionCustomers: number;
  topupCustomers: number;
  subscriptionEvents: number;
  topupEvents: number;
  spenders: number;
  renders: number;
  creditsByFeature: { video: number; flashhead: number; image: number; other: number };
  costPerCredit: number | null;
}

export interface PnlReport {
  statement: PnlStatement;
  metrics: PnlMetrics;
  series: PnlSeriesPoint[];
  prev: PnlSeriesPoint | null;
  insights: string[];
}

const zar = (n: number) =>
  `R${new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * Build the full monthly P&L report: statement + customer metrics +
 * 12-month series + analyst insights. One ledger scan serves all of it.
 */
export async function buildPnlReport(month: string): Promise<PnlReport> {
  const { start, end } = monthWindowSAST(month);
  const months = lastNMonths(month, 12);
  const monthSet = new Set(months);
  const now = Date.now();

  // One paginated scan of the ledger (event_index dedupe rows excluded
  // server-side so DynamoDB pages properly until the limit is met).
  const [txs, users, plans] = await Promise.all([
    scanItems<any>(TABLES.CREDIT_TRANSACTIONS, {
      limit: 6000,
      filter: { expression: '#t <> :ei', names: { '#t': 'type' }, values: { ':ei': 'event_index' } },
    }),
    scanItems<any>(TABLES.USERS, { limit: 1000 }),
    (async () => {
      const { getPlans } = await import('./userService');
      return getPlans();
    })(),
  ]);

  const aggs = new Map<string, MonthAgg>();
  const aggFor = (key: string) => {
    if (!monthSet.has(key)) return null;
    let a = aggs.get(key);
    if (!a) { a = emptyAgg(); aggs.set(key, a); }
    return a;
  };

  const featureBucket = (a: MonthAgg, desc: string, credits: number, isRender: boolean) => {
    if (/flashhead|flash head/i.test(desc)) { a.flash.credits += credits; if (isRender) a.flash.renders += 1; }
    else if (/image edit/i.test(desc)) { a.image.credits += credits; }
    else if (/video generation/i.test(desc)) { a.video.credits += credits; if (isRender) a.video.renders += 1; }
  };

  for (const t of txs) {
    const ts = Date.parse(t.createdAt || '');
    if (Number.isNaN(ts)) continue;
    const a = aggFor(monthKeyAt(ts));
    if (!a) continue;
    const amount = Number(t.amount) || 0;
    const type = String(t.type || '');
    const desc = String(t.description || '');

    if (type === 'purchase') {
      if (amount > 0) {
        a.topupZar += amount;
        a.topupEvents += 1;
        a.topupUsers.add(t.userId);
        a.creditsGranted += amount; // top-ups expand the outstanding credit supply
      } else if (t.metadata?.kind === 'PLAN_UPGRADE') {
        // Prorated upgrade charge recorded as a negative purchase row.
        a.subscriptionZar += Number(t.metadata.chargeZar) || Math.abs(amount);
        a.subscriptionEvents += 1;
        a.subscriptionUsers.add(t.userId);
      }
    } else if (type === 'subscription' && amount > 0) {
      const planId = String(t.metadata?.planId || '');
      const cycle = t.metadata?.cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
      const plan = plans[planId];
      if (plan) a.subscriptionZar += cycle === 'ANNUAL' ? plan.annualZar : plan.monthlyZar;
      else a.subscriptionZar += 0; // unknown plan — report as 0, not guessed
      a.subscriptionEvents += 1;
      a.subscriptionUsers.add(t.userId);
      a.creditsGranted += amount;
    } else if (type === 'refund' && amount > 0) {
      a.refundZar += amount;
    } else if (type === 'deduction' && amount < 0) {
      const credits = Math.abs(amount);
      a.creditsConsumed += credits;
      a.spenders.add(t.userId);
      a.renders += 1;
      featureBucket(a, desc, credits, true);
    } else if ((type === 'bonus' || type === 'gift') && amount > 0) {
      a.creditsGranted += amount;
    }
  }

  // Expenses for the 12-month window.
  const expenseLists = await Promise.all(months.map(loadPnlExpenses));
  const expensesByMonth = new Map<string, PnlExpense[]>();
  months.forEach((m, i) => expensesByMonth.set(m, expenseLists[i]));

  const series: PnlSeriesPoint[] = months.map(m => {
    const a = aggs.get(m) || emptyAgg();
    const revenue = a.subscriptionZar + a.topupZar - a.refundZar;
    const expenses = (expensesByMonth.get(m) || []).reduce((s, e) => s + Number(e.amount || 0), 0);
    return { month: m, revenue, expenses, net: revenue - expenses, creditsConsumed: a.creditsConsumed };
  });

  const cur = aggs.get(month) || emptyAgg();
  const curRevenue = cur.subscriptionZar + cur.topupZar - cur.refundZar;
  const curExpenses = expensesByMonth.get(month) || [];
  const expensesTotal = curExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const recognizedRevenue = cur.creditsConsumed * CREDIT_FACE_VALUE;

  const byCategoryMap = new Map<string, number>();
  for (const e of curExpenses) {
    byCategoryMap.set(e.category, (byCategoryMap.get(e.category) || 0) + Number(e.amount || 0));
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const cashNet = curRevenue - expensesTotal;
  const usageNet = recognizedRevenue - expensesTotal;

  const statement: PnlStatement = {
    month,
    monthLabel: monthLabel(month),
    inProgress: monthKeyAt(now) === month,
    revenue: {
      subscription: cur.subscriptionZar,
      topups: cur.topupZar,
      refunds: -cur.refundZar,
      total: curRevenue,
    },
    usage: {
      creditsConsumed: cur.creditsConsumed,
      recognizedRevenue,
      creditsGranted: cur.creditsGranted,
    },
    expenses: { items: curExpenses, total: expensesTotal, byCategory },
    net: { cash: cashNet, usage: usageNet },
    margin: {
      cash: curRevenue > 0 ? cashNet / curRevenue : null,
      usage: recognizedRevenue > 0 ? usageNet / recognizedRevenue : null,
    },
  };

  // Customer metrics from the users table.
  const activeSubscriptions = users.filter((u: any) => u.subscription?.status === 'ACTIVE').length;
  const newSignups = users.filter((u: any) => {
    const ts = Date.parse(u.createdAt || '');
    return !Number.isNaN(ts) && ts >= start && ts < end;
  }).length;
  const payingCustomers = new Set([...cur.subscriptionUsers, ...cur.topupUsers]).size;

  const metrics: PnlMetrics = {
    activeSubscriptions,
    newSignups,
    payingCustomers,
    subscriptionCustomers: cur.subscriptionUsers.size,
    topupCustomers: cur.topupUsers.size,
    subscriptionEvents: cur.subscriptionEvents,
    topupEvents: cur.topupEvents,
    spenders: cur.spenders.size,
    renders: cur.renders,
    creditsByFeature: {
      video: cur.video.credits,
      flashhead: cur.flash.credits,
      image: cur.image.credits,
      other: Math.max(0, cur.creditsConsumed - cur.video.credits - cur.flash.credits - cur.image.credits),
    },
    costPerCredit: cur.creditsConsumed > 0 ? expensesTotal / cur.creditsConsumed : null,
  };

  const prevIdx = series.findIndex(p => p.month === month) - 1;
  const prev = prevIdx >= 0 ? series[prevIdx] : null;

  const insights = buildInsights(statement, metrics, prev);

  return { statement, metrics, series, prev, insights };
}

// ─── Analyst: deterministic insight narrative (also printed in the PDF) ─────

function buildInsights(s: PnlStatement, m: PnlMetrics, prev: PnlSeriesPoint | null): string[] {
  const out: string[] = [];
  const rev = s.revenue.total;

  // 1. Revenue headline + trend
  if (rev > 0 || (prev && prev.revenue > 0)) {
    let line = `Cash revenue ${zar(rev)} — subscriptions ${zar(s.revenue.subscription)}, one-off top-ups ${zar(s.revenue.topups)}`;
    if (s.revenue.refunds < 0) line += `, refunds ${zar(s.revenue.refunds)}`;
    if (prev) {
      const delta = prev.revenue > 0 ? (rev - prev.revenue) / prev.revenue : null;
      if (delta !== null) line += `. ${delta >= 0 ? 'Up' : 'Down'} ${pct(Math.abs(delta))} vs ${prev.month}`;
      else if (rev > 0) line += `. First month with revenue in the trailing year`;
    }
    out.push(line + '.');
  } else {
    out.push('No cash revenue recorded this month — no subscription events or credit top-ups hit the ledger.');
  }

  // 2. Profit & margin verdict
  if (rev > 0) {
    const margin = s.margin.cash ?? 0;
    const verdict = margin >= 0.3 ? 'healthy' : margin >= 0.1 ? 'workable' : margin >= 0 ? 'thin' : 'loss-making';
    out.push(`Net profit ${zar(s.net.cash)} on a ${pct(margin)} cash margin — ${verdict} for a SaaS at this stage.`);
    if (prev && prev.revenue > 0) {
      const prevMargin = prev.net / prev.revenue;
      const swing = margin - prevMargin;
      out.push(`Margin ${swing >= 0 ? 'improved' : 'fell'} ${pct(Math.abs(swing))} vs ${prev.month} (${pct(prevMargin)}).`);
    }
  } else {
    out.push(s.net.cash < 0
      ? `Loss of ${zar(s.net.cash)} — expenses with no revenue this month.`
      : 'Break-even by default: no revenue and no logged expenses.');
  }

  // 3. Usage vs cash (deferred delivery)
  if (m.spenders > 0) {
    out.push(`${m.spenders} user${m.spenders === 1 ? '' : 's'} consumed ${s.usage.creditsConsumed.toLocaleString('en-ZA')} credits across ${m.renders.toLocaleString('en-ZA')} renders (≈ ${zar(s.usage.recognizedRevenue)} recognised at R1.00 face value).`);
    const deferred = s.usage.creditsGranted - s.usage.creditsConsumed;
    if (deferred > 0) {
      out.push(`${deferred.toLocaleString('en-ZA')} credits granted this month are still unconsumed — delivery obligation carried into later months.`);
    }
  } else {
    out.push('No credits were consumed this month — zero renders, zero recognised usage revenue.');
  }

  // 4. Unit economics
  if (m.costPerCredit !== null) {
    const vs = m.costPerCredit <= CREDIT_FACE_VALUE
      ? 'below the R1.00 selling face value — gross-positive'
      : 'above the R1.00 selling face value — every credit consumed loses money';
    out.push(`Direct cost per credit consumed: ${zar(m.costPerCredit)} (${vs}).`);
  }

  // 5. Expenses
  if (s.expenses.total > 0) {
    const top = s.expenses.byCategory[0];
    out.push(`Operating expenses ${zar(s.expenses.total)}; largest line is ${top.category} at ${zar(top.total)} (${pct(top.total / s.expenses.total)} of total).`);
  } else {
    out.push('No operating expenses logged yet — add fal.ai, Modal, AWS and Paystack bills so the margin is real, not overstated.');
  }

  // 6. Customer base
  const cust: string[] = [];
  if (m.subscriptionEvents > 0) cust.push(`${m.subscriptionEvents} subscription charge${m.subscriptionEvents === 1 ? '' : 's'} from ${m.subscriptionCustomers} customer${m.subscriptionCustomers === 1 ? '' : 's'}`);
  if (m.topupEvents > 0) cust.push(`${m.topupEvents} top-up${m.topupEvents === 1 ? '' : 's'} from ${m.topupCustomers} customer${m.topupCustomers === 1 ? '' : 's'}`);
  if (cust.length) out.push(`Revenue from ${m.payingCustomers} paying customer${m.payingCustomers === 1 ? '' : 's'}: ${cust.join('; ')} — ${m.activeSubscriptions} active subscriber${m.activeSubscriptions === 1 ? '' : 's'} on the platform.`);

  // 7. Housekeeping notes
  if (s.inProgress) out.push('This month is still in progress — figures are month-to-date and will move until the month closes.');
  if (m.activeSubscriptions > 0 && s.revenue.subscription === 0 && rev > 0) {
    out.push(`${m.activeSubscriptions} active subscriber${m.activeSubscriptions === 1 ? '' : 's'} but no subscription charges landed this month — renewals likely fall on other days of the month.`);
  }

  return out;
}

// ─── PDF export (pdfkit → S3, same pattern as lib/invoice.ts) ───────────────

export async function generatePnlPdf(month: string): Promise<string> {
  const report = await buildPnlReport(month);
  const s = report.statement;
  const m = report.metrics;

  const PDFDocument = (await import('pdfkit')).default;
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = 495; // usable width inside 50pt margins
  const L = 50;  // left margin
  const money = (n: number) => `R ${n.toFixed(2)}`;

  // NOTE: pdfkit leaves doc.x at the end of any explicitly-positioned text,
  // so every helper below re-anchors x to the left margin — otherwise titles
  // and bullets would render inside the right-aligned amount column.
  const sectionTitle = (t: string) => {
    doc.moveDown(0.8);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#6b21a8')
      .text(t.toUpperCase(), L, doc.y, { width: W });
    doc.font('Helvetica');
    doc.moveDown(0.3);
    doc.x = L;
  };
  const row = (label: string, value: string, opts: { bold?: boolean; indent?: number; color?: string } = {}) => {
    const y = doc.y;
    doc.fontSize(10).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(opts.color || '#111')
      .text(label, L + (opts.indent || 0), y, { width: W - 130 - (opts.indent || 0) });
    const afterLabel = doc.y;
    doc.text(value, L + W - 130, y, { width: 130, align: 'right' });
    doc.y = Math.max(afterLabel, doc.y); // long labels wrap; don't overlap
    doc.x = L;
  };
  const bullet = (text: string) => {
    doc.fontSize(9).fillColor('#333').text(`• ${text}`, L, doc.y, { width: W });
    doc.moveDown(0.25);
    doc.x = L;
  };

  // Header
  doc.fontSize(22).fillColor('#6b21a8').text('PropReel');
  doc.fontSize(9).fillColor('#555').text('PropReel (Future Exclusive Travel) · South Africa · propreel.co.za');
  doc.moveDown(0.8);
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#111').text('PROFIT & LOSS STATEMENT');
  doc.font('Helvetica').fontSize(9).fillColor('#555');
  doc.text(`Period: ${s.monthLabel} (month boundaries SAST, UTC+2)`);
  doc.text(`Generated: ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}`);
  doc.text('All amounts in South African Rand (ZAR). Credits valued at R1.00 face value.');
  if (s.inProgress) doc.fillColor('#b45309').text('NOTE: month in progress — figures are month-to-date.');

  // Revenue
  sectionTitle('Revenue (cash collected)');
  row('Subscription revenue', money(s.revenue.subscription));
  row('Credit top-ups (one-off)', money(s.revenue.topups));
  if (s.revenue.refunds !== 0) row('Refunds & adjustments', money(s.revenue.refunds));
  doc.moveDown(0.3);
  row('Total revenue', money(s.revenue.total), { bold: true });

  // Usage / accrual
  sectionTitle('Usage (accrual view)');
  row('Credits consumed by users', m.spenders ? `${s.usage.creditsConsumed.toLocaleString('en-ZA')} cr` : '0 cr');
  row('Recognised revenue @ R1.00/credit', money(s.usage.recognizedRevenue));
  row('Credits granted this month', `${s.usage.creditsGranted.toLocaleString('en-ZA')} cr`, { indent: 0, color: '#555' });

  // Expenses
  sectionTitle('Operating expenses');
  if (s.expenses.items.length === 0) {
    doc.fontSize(9).fillColor('#777').text('No operating expenses logged for this period.', L, doc.y, { width: W });
  } else {
    for (const cat of s.expenses.byCategory) row(cat.category, money(cat.total), { bold: true, color: '#333' });
    for (const e of s.expenses.items) {
      row(`${e.label}${e.note ? ` — ${e.note}` : ''}`, money(e.amount), { indent: 12, color: '#555' });
    }
    doc.moveDown(0.3);
    row('Total expenses', money(s.expenses.total), { bold: true });
  }

  // Profit
  sectionTitle('Profit');
  row('Net profit (cash basis)', money(s.net.cash), { bold: true, color: s.net.cash >= 0 ? '#15803d' : '#b91c1c' });
  row('Profit margin (cash basis)', s.margin.cash !== null ? pct(s.margin.cash) : 'n/a', { bold: true });
  row('Net profit (usage basis)', money(s.net.usage), { bold: true, color: s.net.usage >= 0 ? '#15803d' : '#b91c1c' });
  row('Profit margin (usage basis)', s.margin.usage !== null ? pct(s.margin.usage) : 'n/a', { bold: true });

  // Metrics
  sectionTitle('Operating metrics');
  row('Active subscribers', String(m.activeSubscriptions));
  row('Paying customers this month', String(m.payingCustomers));
  row('New signups this month', String(m.newSignups));
  row('Renders / deduction events', m.renders.toLocaleString('en-ZA'));
  row('Credits: video / flashhead / image',
    `${m.creditsByFeature.video} / ${m.creditsByFeature.flashhead} / ${m.creditsByFeature.image}`);
  row('Direct cost per credit consumed', m.costPerCredit !== null ? money(m.costPerCredit) : 'n/a');

  // Analyst notes
  sectionTitle('Analyst notes');
  for (const insight of report.insights) bullet(insight);

  // Footnotes
  doc.moveDown(1);
  doc.fontSize(7.5).fillColor('#777').text(
    'Methodology: revenue is derived from the platform credit ledger — subscription events valued at current list price ' +
    '(pricing_config), top-ups at 1 credit = R1, prorated plan upgrades at the charged amount. Usage revenue recognises ' +
    'credits consumed in the period at R1.00 face value. Operating expenses are admin-entered. This statement was ' +
    'generated electronically and is valid without signature.',
    L, doc.y, { width: W }
  );

  doc.end();
  const pdf = await done;

  const bucket = process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets';
  const region = process.env.AWS_REGION || 'af-south-1';
  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
  const key = `pnl/PropReel_PL_${month}_${Date.now()}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: pdf,
    ContentType: 'application/pdf',
  }));

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
