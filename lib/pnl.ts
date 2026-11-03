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
 *
 * Closing the books: `finalizePnlMonth` (run by the monthly cron) pins the
 * statement PDF at a deterministic S3 key and freezes the computed report as
 * a `pl_snapshot_<YYYY-MM>` settings row — later reads serve the snapshot
 * instantly and stay correct even after the ledger outgrows the scan window.
 * Editing an expense on a closed month invalidates both (the month re-opens).
 */

import { TABLES, scanAll, getItem, putItem, deleteItem } from './db';

export const EXPENSE_CATEGORIES = [
  'fal.ai', 'Modal', 'AWS', 'Paystack', 'Marketing', 'Payroll', 'Software', 'Office', 'Other',
] as const;

/** Credits are recognised at R1 face value (the historical default; top-ups
 *  were 1:1 R1/credit). NOTE 2026-10-21: packs now sell at R1.50/credit and
 *  plans at ≈R1.10–1.17 — moving the P&L face value is a client decision;
 *  revenue below stays conservative until then. */
export const CREDIT_FACE_VALUE = 1;

export interface PnlExpense {
  id: string;
  label: string;
  category: string;
  amount: number;
  note?: string;
  createdAt: string;
}

// Avatar schema vocabulary (2026-10-27 migration) — history-aware charge
// classifier shared with the refund matchers and admin stats.
import { isAvatarCharge } from './legacySchema';

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

/** One-off entries logged for a single month (no recurring lines). */
async function loadMonthlyItems(month: string): Promise<PnlExpense[]> {
  try {
    const row = await getItem<PnlExpenseRow>(TABLES.SETTINGS, { id: `pl_expenses_${month}` });
    return Array.isArray(row?.items) ? row!.items : [];
  } catch {
    return [];
  }
}

/** Recurring monthly lines. Each applies to `startMonth` and every later month. */
export interface PnlRecurringExpense extends PnlExpense {
  startMonth: string;
}

interface PnlRecurringRow {
  id: string;
  kind: 'pl_recurring';
  items: PnlRecurringExpense[];
  updatedAt: string;
}

const RECURRING_ID_PREFIX = 'plr_';

async function loadRecurringItems(): Promise<PnlRecurringExpense[]> {
  try {
    const row = await getItem<PnlRecurringRow>(TABLES.SETTINGS, { id: 'pl_recurring' });
    return Array.isArray(row?.items) ? row!.items : [];
  } catch {
    return [];
  }
}

async function saveRecurringItems(items: PnlRecurringExpense[]): Promise<void> {
  await putItem(TABLES.SETTINGS, {
    id: 'pl_recurring',
    kind: 'pl_recurring',
    items,
    updatedAt: new Date().toISOString(),
  } satisfies PnlRecurringRow);
}

/** Every month from `from` through the current SAST month gets its snapshot dropped. */
async function invalidateSnapshotsFrom(from: string): Promise<void> {
  const current = monthKeyAt(Date.now());
  for (let m = from; m <= current; m = shiftMonthKey(m, 1)) {
    await invalidatePnlSnapshot(m).catch(() => {});
  }
}

/** Month expenses: one-off entries for `month` plus recurring lines active in it. */
export async function loadPnlExpenses(month: string): Promise<PnlExpense[]> {
  const [monthly, recurring] = await Promise.all([loadMonthlyItems(month), loadRecurringItems()]);
  const active = recurring.filter(r => r.startMonth <= month);
  return [...monthly, ...active];
}

export async function addRecurringPnlExpense(startMonth: string, input: {
  label: string; category: string; amount: number; note?: string;
}): Promise<PnlRecurringExpense> {
  const items = await loadRecurringItems();
  const item: PnlRecurringExpense = {
    id: `${RECURRING_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: input.label,
    category: input.category || 'Other',
    amount: Math.round(Number(input.amount) * 100) / 100,
    note: input.note || undefined,
    createdAt: new Date().toISOString(),
    startMonth,
  };
  items.push(item);
  await saveRecurringItems(items);
  await invalidateSnapshotsFrom(startMonth);
  return item;
}

export async function addPnlExpense(month: string, input: {
  label: string; category: string; amount: number; note?: string;
}): Promise<PnlExpense> {
  const items = await loadMonthlyItems(month);
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
  await invalidatePnlSnapshot(month).catch(() => {}); // a closed month re-opens on edit
  return item;
}

export async function deletePnlExpense(month: string, itemId: string): Promise<boolean> {
  if (itemId.startsWith(RECURRING_ID_PREFIX)) {
    // Recurring lines are removed for every month they apply to.
    const recurring = await loadRecurringItems();
    const next = recurring.filter(r => r.id !== itemId);
    if (next.length === recurring.length) return false;
    await saveRecurringItems(next);
    await invalidateSnapshotsFrom(recurring.find(r => r.id === itemId)!.startMonth);
    return true;
  }
  const items = await loadMonthlyItems(month);
  const next = items.filter(i => i.id !== itemId);
  if (next.length === items.length) return false;
  await invalidatePnlSnapshot(month).catch(() => {}); // a closed month re-opens on edit
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
  /** Subscription revenue per plan id (cohort mix). */
  planRevenue: Map<string, { zar: number; customers: Set<string> }>;
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
  planRevenue: new Map(),
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
  creditsByFeature: { video: number; avatar: number; image: number; other: number };
  costPerCredit: number | null;
}

export interface PnlPlanMixEntry {
  planId: string;
  zar: number;
  customers: number;
  /** Same plan's subscription revenue in the previous month (MoM compare). */
  prevZar: number;
}

export interface PnlSubscriberStats {
  newSubscribers: number;
  renewed: number;
  /** Paid period ended inside the month without renewal (status CANCELLED). */
  churned: number;
  /** Paid period ended inside the month with payment failing (PAST_DUE). */
  pastDue: number;
  active: number;
}

export type PnlForecastStatus =
  | 'already_covered'
  | 'projected'
  | 'stalled'
  | 'insufficient_data'
  | 'no_expenses';

export interface PnlForecast {
  status: PnlForecastStatus;
  /** Trailing average of the months that carry logged expenses (R/month). */
  expenseBase: number;
  currentUsageRevenue: number;
  /** Least-squares slope of usage revenue over usage-active months (R/month). */
  monthlyTrend: number;
  sampleMonths: number;
  breakEvenMonth: string | null;
  monthsToBreakEven: number | null;
}

export interface PnlReport {
  statement: PnlStatement;
  metrics: PnlMetrics;
  series: PnlSeriesPoint[];
  prev: PnlSeriesPoint | null;
  insights: string[];
  planMix: PnlPlanMixEntry[];
  subscribers: PnlSubscriberStats;
  forecast: PnlForecast;
}

const zar = (n: number) =>
  `R${new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** One-line break-even status — shared by insights, PDF and the report email. */
export function forecastHeadline(f: PnlForecast): string {
  switch (f.status) {
    case 'already_covered':
      return `Usage-basis revenue (${zar(f.currentUsageRevenue)}) already covers the ${zar(f.expenseBase)} monthly expense base — break-even achieved.`;
    case 'projected':
      return `Break-even forecast: usage revenue trending ${zar(f.monthlyTrend)}/month against a ${zar(f.expenseBase)} expense base — covered by ${monthLabel(f.breakEvenMonth!)} (≈${f.monthsToBreakEven} month${f.monthsToBreakEven === 1 ? '' : 's'} out, ${f.sampleMonths}-month sample, directional).`;
    case 'stalled':
      return `Usage revenue trend is flat or declining (${zar(f.monthlyTrend)}/month) — no break-even date projected at this trajectory.`;
    case 'insufficient_data':
      return `Break-even forecast needs at least 2 months of usage data (have ${f.sampleMonths}).`;
    case 'no_expenses':
      return 'Break-even forecast unavailable — no operating expenses logged yet.';
  }
}

/**
 * Break-even forecast: when usage-basis revenue is projected to cover the
 * trailing expense base. Least-squares trend over usage-active months;
 * directional until at least 3 months of data exist.
 */
function computeForecast(month: string, series: PnlSeriesPoint[]): PnlForecast {
  const usagePts = series.filter(p => p.creditsConsumed > 0);
  const expensePts = series.filter(p => p.expenses > 0);
  const cur = series.find(p => p.month === month);
  const currentUsageRevenue = (cur?.creditsConsumed || 0) * CREDIT_FACE_VALUE;
  const sampleMonths = usagePts.length;
  const base = {
    expenseBase: 0,
    currentUsageRevenue,
    monthlyTrend: 0,
    sampleMonths,
    breakEvenMonth: null,
    monthsToBreakEven: null,
  };

  const expenseBase = expensePts.length > 0
    ? expensePts.slice(-3).reduce((s, p) => s + p.expenses, 0) / Math.min(3, expensePts.length)
    : 0;
  base.expenseBase = expenseBase;

  if (expenseBase <= 0) return { ...base, status: 'no_expenses' };
  if (currentUsageRevenue >= expenseBase) return { ...base, status: 'already_covered' };
  if (usagePts.length < 2) return { ...base, status: 'insufficient_data' };

  const n = usagePts.length;
  const ys = usagePts.map(p => p.creditsConsumed * CREDIT_FACE_VALUE);
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (ys[i] - my);
    den += (i - mx) * (i - mx);
  }
  const slope = den > 0 ? num / den : 0;
  if (slope <= 0) return { ...base, monthlyTrend: slope, status: 'stalled' };

  const monthsNeeded = Math.max(1, Math.ceil((expenseBase - currentUsageRevenue) / slope));
  return {
    ...base,
    monthlyTrend: slope,
    status: 'projected',
    monthsToBreakEven: monthsNeeded,
    breakEvenMonth: shiftMonthKey(month, monthsNeeded),
  };
}

/**
 * Build the full monthly P&L report: statement + customer metrics +
 * 12-month series + analyst insights. One ledger scan serves all of it.
 */
export async function buildPnlReport(month: string): Promise<PnlReport> {
  const { start, end } = monthWindowSAST(month);
  const seriesMonths = lastNMonths(month, 12);
  const bucketMonths = lastNMonths(month, 24); // 24 months bucketed → YoY (month−12) aggregates
  const monthSet = new Set(bucketMonths);
  const now = Date.now();

  // One fully paginated scan of the ledger (event_index dedupe rows excluded
  // server-side). scanAll walks every DynamoDB page — a capped single scan
  // would silently drop rows and understate revenue once the ledger grows.
  const [txs, users, plans] = await Promise.all([
    scanAll<any>(TABLES.CREDIT_TRANSACTIONS, {
      maxItems: 50000,
      filter: { expression: '#t <> :ei', names: { '#t': 'type' }, values: { ':ei': 'event_index' } },
    }),
    scanAll<any>(TABLES.USERS, { maxItems: 10000 }),
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

  const trackPlan = (a: MonthAgg, planId: string, zarValue: number, userId: string) => {
    let p = a.planRevenue.get(planId);
    if (!p) { p = { zar: 0, customers: new Set<string>() }; a.planRevenue.set(planId, p); }
    p.zar += zarValue;
    p.customers.add(userId);
  };

  const featureBucket = (a: MonthAgg, desc: string, credits: number, isRender: boolean) => {
    if (isAvatarCharge({ description: desc })) { a.flash.credits += credits; if (isRender) a.flash.renders += 1; }
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
        const upgradeZar = Number(t.metadata.chargeZar) || Math.abs(amount);
        a.subscriptionZar += upgradeZar;
        a.subscriptionEvents += 1;
        a.subscriptionUsers.add(t.userId);
        trackPlan(a, String(t.metadata.toPlan || 'UPGRADE'), upgradeZar, t.userId);
      }
    } else if (type === 'subscription' && amount > 0) {
      const planId = String(t.metadata?.planId || '');
      const cycle = t.metadata?.cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
      const plan = plans[planId];
      // Unknown plan → 0, not guessed.
      const planZar = plan ? (cycle === 'ANNUAL' ? plan.annualZar : plan.monthlyZar) : 0;
      a.subscriptionZar += planZar;
      a.subscriptionEvents += 1;
      a.subscriptionUsers.add(t.userId);
      a.creditsGranted += amount;
      trackPlan(a, planId || 'UNKNOWN', planZar, t.userId);
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

  // Expenses for the 12-month chart window.
  const expenseLists = await Promise.all(seriesMonths.map(loadPnlExpenses));
  const expensesByMonth = new Map<string, PnlExpense[]>();
  seriesMonths.forEach((m, i) => expensesByMonth.set(m, expenseLists[i]));

  const series: PnlSeriesPoint[] = seriesMonths.map(m => {
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
      avatar: cur.flash.credits,
      image: cur.image.credits,
      other: Math.max(0, cur.creditsConsumed - cur.video.credits - cur.flash.credits - cur.image.credits),
    },
    costPerCredit: cur.creditsConsumed > 0 ? expensesTotal / cur.creditsConsumed : null,
  };

  const prevIdx = series.findIndex(p => p.month === month) - 1;
  const prev = prevIdx >= 0 ? series[prevIdx] : null;

  // ── Cohort analysis: revenue by plan (MoM compare) ────────────────
  const prevAgg = aggs.get(shiftMonthKey(month, -1)) || emptyAgg();
  const planMix: PnlPlanMixEntry[] = [...cur.planRevenue.entries()]
    .map(([planId, v]) => ({
      planId,
      zar: v.zar,
      customers: v.customers.size,
      prevZar: prevAgg.planRevenue.get(planId)?.zar || 0,
    }))
    .sort((a, b) => b.zar - a.zar);

  // ── Subscriber movement: first-time vs renewed vs lapsed ──────────
  const priorSubUsers = new Set<string>();
  for (const [key, a] of aggs) {
    if (key < month) for (const uid of a.subscriptionUsers) priorSubUsers.add(uid);
  }
  let renewed = 0;
  let newSubscribers = 0;
  for (const uid of cur.subscriptionUsers) {
    if (priorSubUsers.has(uid)) renewed++;
    else newSubscribers++;
  }
  let churned = 0;
  let pastDue = 0;
  for (const u of users) {
    const sub = u.subscription;
    if (!sub?.currentPeriodEnd) continue;
    const pe = Date.parse(sub.currentPeriodEnd);
    if (Number.isNaN(pe) || pe < start || pe >= end) continue;
    if (sub.status === 'CANCELLED') churned++;
    else if (sub.status === 'PAST_DUE') pastDue++;
  }
  const subscribers: PnlSubscriberStats = { newSubscribers, renewed, churned, pastDue, active: activeSubscriptions };

  // ── Break-even forecast (usage basis vs expense base) ─────────────
  const forecast = computeForecast(month, series);

  // ── Year-over-year cohort baseline ────────────────────────────────
  const yoyMonth = shiftMonthKey(month, -12);
  const yoyAgg = aggs.get(yoyMonth);
  const yoyRevenue = yoyAgg ? yoyAgg.subscriptionZar + yoyAgg.topupZar - yoyAgg.refundZar : 0;

  const insights = buildInsights(statement, metrics, prev, { planMix, subscribers, forecast, yoyRevenue, yoyMonth });

  return { statement, metrics, series, prev, insights, planMix, subscribers, forecast };
}

// ─── Analyst: deterministic insight narrative (also printed in the PDF) ─────

function buildInsights(
  s: PnlStatement,
  m: PnlMetrics,
  prev: PnlSeriesPoint | null,
  ctx: {
    planMix: PnlPlanMixEntry[];
    subscribers: PnlSubscriberStats;
    forecast: PnlForecast;
    yoyRevenue: number;
    yoyMonth: string;
  }
): string[] {
  const { planMix, subscribers, forecast, yoyRevenue, yoyMonth } = ctx;
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

  // 7. Revenue by plan (cohort mix, MoM)
  if (planMix.length > 0) {
    const parts = planMix.map(p => `${p.planId} ${zar(p.zar)} (${p.customers} cust.)`);
    let line = `Subscription revenue by plan: ${parts.join(', ')}.`;
    const mover = planMix
      .filter(p => p.prevZar > 0 && p.prevZar !== p.zar)
      .sort((a, b) => Math.abs(b.zar - b.prevZar) - Math.abs(a.zar - a.prevZar))[0];
    if (mover) line += ` ${mover.planId} moved ${mover.zar >= mover.prevZar ? '+' : '−'}${pct(Math.abs(mover.zar - mover.prevZar) / mover.prevZar)} month-over-month.`;
    out.push(line);
  }

  // 8. Subscriber movement
  out.push(`Subscribers this month: ${subscribers.newSubscribers} new, ${subscribers.renewed} renewed, ${subscribers.churned} churned, ${subscribers.pastDue} past due — ${subscribers.active} active overall.`);

  // 9. Year-over-year cohort
  if (yoyRevenue > 0) {
    const d = (rev - yoyRevenue) / yoyRevenue;
    out.push(`Year-over-year: ${zar(rev)} versus ${zar(yoyRevenue)} in ${monthLabel(yoyMonth)} — ${d >= 0 ? 'up' : 'down'} ${pct(Math.abs(d))}.`);
  } else {
    out.push(`No year-over-year baseline yet — ${monthLabel(yoyMonth)} had no activity.`);
  }

  // 10. Break-even forecast (usage basis)
  out.push(forecastHeadline(forecast));

  // 11. Housekeeping notes
  if (s.inProgress) out.push('This month is still in progress — figures are month-to-date and will move until the month closes.');
  if (m.activeSubscriptions > 0 && s.revenue.subscription === 0 && rev > 0) {
    out.push(`${m.activeSubscriptions} active subscriber${m.activeSubscriptions === 1 ? '' : 's'} but no subscription charges landed this month — renewals likely fall on other days of the month.`);
  }

  return out;
}

// ─── PDF export (pdfkit → S3, same pattern as lib/invoice.ts) ───────────────

async function renderPnlPdf(report: PnlReport): Promise<Buffer> {
  const s = report.statement;
  const m = report.metrics;

  const PDFDocument = (await import('pdfkit')).default;

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
  doc.fontSize(9).fillColor('#555').text('Locus Dynamics (PTY) Ltd K2026515531 t/a Propreel · South Africa · propreel.co.za');
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
    `${m.creditsByFeature.video} / ${m.creditsByFeature.avatar} / ${m.creditsByFeature.image}`);
  row('Direct cost per credit consumed', m.costPerCredit !== null ? money(m.costPerCredit) : 'n/a');

  // Revenue by plan (cohort mix)
  if (report.planMix.length > 0) {
    sectionTitle('Revenue by plan');
    for (const p of report.planMix) {
      row(`${p.planId} (${p.customers} cust.${p.prevZar ? `, prev ${money(p.prevZar)}` : ''})`, money(p.zar));
    }
  }

  // Subscriber movement
  sectionTitle('Subscriber movement');
  row('New subscribers (first subscription)', String(report.subscribers.newSubscribers));
  row('Renewed', String(report.subscribers.renewed));
  row('Churned (period ended)', String(report.subscribers.churned));
  row('Past due (period ended)', String(report.subscribers.pastDue));
  row('Active subscribers', String(report.subscribers.active));

  // Break-even forecast
  sectionTitle('Break-even forecast (usage basis)');
  bullet(forecastHeadline(report.forecast));

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
  return done;
}

// ─── S3 helpers, finalization & snapshots ───────────────────────────────────

const bucketName = () => process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets';
const s3Region = () => process.env.AWS_REGION || 'af-south-1';
const publicUrl = (key: string) => `https://${bucketName()}.s3.${s3Region()}.amazonaws.com/${key}`;

async function s3() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: s3Region(),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

async function uploadPnlPdf(key: string, pdf: Buffer): Promise<void> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  await (await s3()).send(new PutObjectCommand({
    Bucket: bucketName(),
    Key: key,
    Body: pdf,
    ContentType: 'application/pdf',
  }));
}

/** Deterministic, pinned key for a finalized month's statement. */
export const finalPnlPdfKey = (month: string) => `pnl/final/PropReel_PL_${month}.pdf`;
const snapshotId = (month: string) => `pl_snapshot_${month}`;

/** Who receives the monthly emailed statement (env-overridable via PNL_REPORT_EMAILS). */
export const PNL_REPORT_RECIPIENTS = (process.env.PNL_REPORT_EMAILS ||
  'futuretravel@gmail.com,ulric@propreel.co.za')
  .split(',').map(s => s.trim()).filter(Boolean);

export interface PnlSnapshot {
  report: PnlReport;
  pdfUrl: string;
  finalizedAt: string;
}

async function pinnedPdfExists(month: string): Promise<boolean> {
  try {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    await (await s3()).send(new HeadObjectCommand({ Bucket: bucketName(), Key: finalPnlPdfKey(month) }));
    return true;
  } catch {
    return false;
  }
}

/** Snapshot of a closed month's finalized report, if the books were closed. */
export async function loadPnlSnapshot(month: string): Promise<PnlSnapshot | null> {
  try {
    const row = await getItem<any>(TABLES.SETTINGS, { id: snapshotId(month) });
    if (row?.kind === 'pl_snapshot' && row.report?.statement) {
      // History normalization (2026-10-27 avatar migration): snapshots
      // written before the rename carry creditsByFeature.flashhead.
      const snapMetrics = (row.report as any).metrics;
      if (snapMetrics?.creditsByFeature && 'flashhead' in snapMetrics.creditsByFeature) {
        snapMetrics.creditsByFeature.avatar = snapMetrics.creditsByFeature.flashhead;
        delete snapMetrics.creditsByFeature.flashhead;
      }
      return {
        report: row.report as PnlReport,
        pdfUrl: String(row.pdfUrl || ''),
        finalizedAt: String(row.finalizedAt || ''),
      };
    }
  } catch {
    // fall through to live computation
  }
  return null;
}

/**
 * Drop a month's finalized PDF + snapshot. Called whenever an expense entry
 * changes a closed month — the month re-opens and recomputes live.
 */
export async function invalidatePnlSnapshot(month: string): Promise<void> {
  try { await deleteItem(TABLES.SETTINGS, { id: snapshotId(month) }); } catch { /* absent is fine */ }
  try {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await (await s3()).send(new DeleteObjectCommand({ Bucket: bucketName(), Key: finalPnlPdfKey(month) }));
  } catch { /* absent is fine */ }
}

/**
 * Statement PDF for a month. Closed months are pinned at a deterministic key
 * — repeat downloads are instant and history stays addressable at a stable
 * URL — re-rendered only after an invalidating expense edit.
 */
export async function generatePnlPdf(month: string): Promise<{ url: string; instant: boolean }> {
  const closed = month < monthKeyAt(Date.now());
  if (closed && (await pinnedPdfExists(month))) {
    return { url: publicUrl(finalPnlPdfKey(month)), instant: true };
  }
  const report = await buildPnlReport(month);
  const pdf = await renderPnlPdf(report);
  const key = closed ? finalPnlPdfKey(month) : `pnl/PropReel_PL_${month}_${Date.now()}.pdf`;
  await uploadPnlPdf(key, pdf);
  return { url: publicUrl(key), instant: false };
}

/**
 * Close the books for a month: render + pin the PDF and freeze the computed
 * report as a snapshot. pln_get serves the snapshot instantly afterwards —
 * immune to the ledger scan window as history grows.
 */
export async function finalizePnlMonth(month: string): Promise<PnlSnapshot> {
  const report = await buildPnlReport(month);
  const pdf = await renderPnlPdf(report);
  const key = finalPnlPdfKey(month);
  await uploadPnlPdf(key, pdf);
  const snapshot: PnlSnapshot = { report, pdfUrl: publicUrl(key), finalizedAt: new Date().toISOString() };
  await putItem(TABLES.SETTINGS, { id: snapshotId(month), kind: 'pl_snapshot', month, ...snapshot });
  return snapshot;
}
