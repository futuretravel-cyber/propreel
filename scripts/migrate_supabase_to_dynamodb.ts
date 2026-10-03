/**
 * One-shot migration: Supabase (retiring) → AWS DynamoDB (permanent home).
 *
 * The Supabase driver stored each item verbatim in a `data` jsonb column, so
 * rows are copied byte-for-byte into the DynamoDB tables via lib/db putItem
 * (upsert semantics — safe to re-run).
 *
 * Also folds in Supabase *auth* users (5 accounts): their confirmed status
 * is mirrored onto the app row (emailVerified), and confirmed identities
 * that have no app row yet get a minimal row so the email can claim a
 * password via the new /forgot-password flow. Supabase never exposes its
 * password hashes, so every existing account signs in once via a reset link.
 *
 * Usage: set -a; source .env; set +a; npx tsx scripts/migrate_supabase_to_dynamodb.ts
 */

import { putItem, scanItems, TABLES } from '../lib/db';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** public-schema tables to copy (absent tables are skipped with a note). */
const TABLES_TO_COPY = [
  'users',
  'credit_transactions',
  'projects',
  'settings',
  'agencies',
  'agency_members',
  'reviews',
  'subscriptions',
  'credit_expiries',
] as const;

const DYNAMO_TABLE: Record<string, string> = {
  users: TABLES.USERS,
  credit_transactions: TABLES.CREDIT_TRANSACTIONS,
  projects: TABLES.PROJECTS,
  settings: TABLES.SETTINGS,
  agencies: TABLES.AGENCIES,
  agency_members: TABLES.AGENCY_MEMBERS,
  reviews: TABLES.REVIEWS,
  subscriptions: TABLES.SUBSCRIPTIONS,
  credit_expiries: TABLES.CREDIT_EXPIRIES,
};

async function sbGet(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first');

  const summary: Record<string, { copied: number; skipped?: string }> = {};
  const copiedUserEmails = new Set<string>();
  const copiedUserIds = new Set<string>();

  // ── 1) Auth users (identities + confirmed status) ─────────────────────────
  const authRes = await sbGet('/auth/v1/admin/users?per_page=200');
  const authUsers: any[] = authRes.body?.users || [];
  const confirmedEmails = new Set(
    authUsers.filter(u => u.email_confirmed_at).map(u => String(u.email).toLowerCase())
  );
  console.log(`Auth identities: ${authUsers.length} total, ${confirmedEmails.size} confirmed`);

  // ── 2) Copy every public-table row into DynamoDB ─────────────────────────
  for (const table of TABLES_TO_COPY) {
    const { status, body } = await sbGet(`/rest/v1/${table}?select=data&limit=1000`);
    if (status >= 400) {
      summary[table] = { copied: 0, skipped: `absent in Supabase (${status})` };
      console.log(`• ${table}: skipped — ${status} ${JSON.stringify(body).slice(0, 120)}`);
      continue;
    }
    const rows: any[] = Array.isArray(body) ? body : [];
    if (rows.length >= 1000) {
      throw new Error(`${table}: 1000-row page hit — add pagination before running this on larger data`);
    }
    let copied = 0;
    for (const r of rows) {
      const item = typeof r?.data === 'string' ? JSON.parse(r.data) : r?.data;
      if (!item) continue;
      if (table === 'users') {
        // Confirmed in Supabase auth → confirmed here
        if (confirmedEmails.has(String(item.email).toLowerCase())) item.emailVerified = true;
        copiedUserEmails.add(String(item.email || '').toLowerCase());
        if (item.id) copiedUserIds.add(item.id);
      }
      await putItem(DYNAMO_TABLE[table], item);
      copied++;
    }
    summary[table] = { copied };
    console.log(`✓ ${table}: ${copied} row(s) → ${DYNAMO_TABLE[table]}`);
  }

  // ── 3) Confirmed auth identities with no app row → provision minimal row ─
  // Email set comes from the rows just copied — NOT from a DynamoDB scan,
  // which can be eventually-consistent right after these writes. Rows from a
  // PREVIOUS run are old enough that a normal read is consistent, so also
  // consult getUserByEmail to stay idempotent across re-runs.
  const { getUserByEmail } = await import('../lib/userService');
  for (const authUser of authUsers) {
    const email = String(authUser.email || '').toLowerCase();
    if (!email || !confirmedEmails.has(email)) continue;
    if (copiedUserEmails.has(email)) continue;
    if (await getUserByEmail(email)) continue;
    const meta = (authUser.user_metadata || {}) as Record<string, any>;
    const now = new Date().toISOString();
    const row: Record<string, any> = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      email,
      fullName: meta.full_name || meta.fullName || meta.name || email.split('@')[0],
      role: 'AGENT',
      credits: 0,
      creditExpiries: [],
      subscription: null,
      autoTopup: { enabled: false, threshold: 50, amount: 200 },
      agencyId: null,
      agencyName: null,
      avatarUrl: null,
      emailVerified: true,
      lastLowCreditWarnedAt: null,
      notificationPreferences: {
        emailNotifications: true, pushNotifications: true, renderComplete: true,
        lowCredits: true, newFeatures: true, billingAlerts: true, marketingEmails: false,
      },
      createdAt: authUser.created_at || now,
      updatedAt: now,
    };
    // Admin emails keep their role
    if (['futuretravel@gmail.com', 'ulric@propreel.co.za'].includes(email)) row.role = 'ADMIN';
    await putItem(TABLES.USERS, row);
    console.log(`+ app row created for confirmed auth identity ${email} (${row.id})`);
  }

  // ── 4) Verify: DynamoDB counts + flag DDB-only rows ──────────────────────
  console.log('\n── Verification (DynamoDB) ──');
  const ddbUsers = await scanItems<any>(TABLES.USERS, { limit: 1000 });
  const ddbLedger = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { limit: 5000 });
  const ddbSettings = await scanItems<any>(TABLES.SETTINGS, { limit: 1000 });
  console.log(`users: ${ddbUsers.length} (supabase rows: ${summary.users?.copied ?? 0}, auth confirmed: ${confirmedEmails.size})`);
  console.log(`credit_transactions: ${ddbLedger.length} (supabase: ${summary.credit_transactions?.copied ?? 0})`);
  console.log(`settings: ${ddbSettings.length} (supabase: ${summary.settings?.copied ?? 0})`);

  // Rows that exist only in DynamoDB and were not created by step 3 —
  // pre-cutover leftovers; report only, never auto-delete.
  const step3Ids = new Set(ddbUsers.filter(u => String(u.createdAt || '').startsWith('2026-10-03T')).map(u => u.id));
  const ddbOnly = ddbUsers.filter(u => !copiedUserIds.has(u.id) && !step3Ids.has(u.id));
  if (ddbOnly.length) {
    console.log(`\n⚠ rows only in DynamoDB (kept; review manually):`);
    for (const u of ddbOnly) console.log(`  - ${u.email} (${u.id}, ${u.credits ?? 0} credits)`);
  } else {
    console.log('No unexpected DynamoDB-only user rows — sets match.');
  }

  // Duplicate email rows break auth_register's 409 check — surface loudly.
  const byEmail = new Map<string, any[]>();
  for (const u of ddbUsers) {
    const k = String(u.email || '').toLowerCase();
    byEmail.set(k, [...(byEmail.get(k) || []), u]);
  }
  let dupes = 0;
  for (const [email, rows] of byEmail) {
    if (rows.length > 1) {
      dupes++;
      console.log(`\n⚠ duplicate rows for ${email}:`);
      for (const r of rows) console.log(`  - ${r.id} · ${r.credits ?? 0} cr · created ${r.createdAt}`);
    }
  }
  if (dupes === 0) console.log('No duplicate email rows.');

  console.log('\nMIGRATION DONE. Supabase can be retired after the smoke test.');
}

main().then(() => process.exit(0)).catch(e => { console.error('MIGRATION FAILED:', e); process.exit(1); });
