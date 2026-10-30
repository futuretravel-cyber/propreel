/**
 * Read-only reconciliation: every successful Paystack payment should have a
 * matching 'purchase' credit ledger row. Flags:
 *   - GAP: Paystack success with no credited purchase (customer paid, got nothing);
 *     notes when a pay_<ref> marker exists, which is the old marker-before-credit failure
 *   - DUPLICATE: more than one purchase row for the same Paystack reference
 *
 * Usage: set -a; source .env; set +a; npx tsx scripts/check_paystack_credit_gaps.ts [days=30]
 * Exits 1 when any gap is found so it can be run as a check.
 */
import 'dotenv/config';
import { scanItems, TABLES } from '../lib/db';

const days = Number(process.argv[2] ?? 30);
const secretKey = process.env.PAYSTACK_SECRET_KEY;
if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY not set');

interface PaystackTxn {
  id: number;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  customer?: { email?: string };
}

async function fetchSuccessfulTxns(from: string): Promise<PaystackTxn[]> {
  const all: PaystackTxn[] = [];
  for (let page = 1; ; page++) {
    const url = `https://api.paystack.co/transaction?status=success&perPage=100&page=${page}&from=${encodeURIComponent(from)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
    const body: any = await res.json();
    if (!res.ok || !body.status) throw new Error(`Paystack list failed: ${body.message ?? res.status}`);
    all.push(...body.data);
    if (body.data.length < 100) break;
  }
  return all;
}

(async () => {
  const from = new Date(Date.now() - days * 86_400_000).toISOString();
  const txns = await fetchSuccessfulTxns(from);

  const ledger = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { limit: 5000 });
  const purchases = ledger.filter(r => r.type === 'purchase');
  const markers = await scanItems<any>(TABLES.SETTINGS, { limit: 5000 });
  const markerIds = new Set(markers.map(m => m.id));

  const purchaseByRef = new Map<string, any[]>();
  for (const p of purchases) {
    const ref = p.metadata?.paystackReference;
    const key = ref ?? (p.eventId ? `event:${p.eventId}` : null);
    if (!key) continue;
    purchaseByRef.set(key, [...(purchaseByRef.get(key) ?? []), p]);
  }

  const gaps: string[] = [];
  const dupes: string[] = [];
  for (const t of txns) {
    const matches = [
      ...(purchaseByRef.get(t.reference) ?? []),
      ...(purchaseByRef.get(`event:ps_${t.id}`) ?? []),
    ];
    const unique = [...new Map(matches.map(m => [m.id, m])).values()];
    const who = t.customer?.email ?? 'unknown';
    const label = `${t.paid_at ?? '?'} | ${t.reference} | ${who} | ${(t.amount / 100).toFixed(2)} ${t.currency}`;

    if (unique.length === 0) gaps.push(`GAP  ${label}${markerIds.has(`pay_${t.reference}`) ? '  (marker present, no credits)' : ''}`);
    if (unique.length > 1) dupes.push(`DUPLICATE  ${label}  (${unique.length} purchase rows)`);
  }

  console.log(`Paystack successful payments (last ${days}d): ${txns.length}`);
  console.log(`Credited purchase rows scanned: ${purchases.length}`);
  for (const line of [...gaps, ...dupes]) console.log(line);
  const problems = gaps.length + dupes.length;
  console.log(problems === 0 ? 'OK: no gaps found' : `${problems} issue(s) found`);
  process.exitCode = problems === 0 ? 0 : 1;
  process.exit(process.exitCode);
})().catch(e => {
  console.error('ERR', e.message);
  process.exit(1);
});
