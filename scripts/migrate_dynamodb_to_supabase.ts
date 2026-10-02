/**
 * Migrate all DynamoDB tables → Supabase (Postgres).
 * READ-ONLY on AWS — nothing is modified or deleted there.
 * Idempotent: upserts, so it can be re-run for a re-sync before cutover.
 *
 * Usage: set -a; source .env; set +a; npx tsx scripts/migrate_dynamodb_to_supabase.ts
 * Requires: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ schema.sql applied)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const TABLES: Array<{ dyn: string; pg: string; keys: string[] }> = [
  { dyn: 'propreel-users', pg: 'users', keys: ['id'] },
  { dyn: 'propreel-credit_transactions', pg: 'credit_transactions', keys: ['userId', 'createdAt'] },
  { dyn: 'propreel-projects', pg: 'projects', keys: ['userId', 'id'] },
  { dyn: 'propreel-settings', pg: 'settings', keys: ['id'] },
  { dyn: 'propreel-agencies', pg: 'agencies', keys: ['id'] },
  { dyn: 'propreel-agency_members', pg: 'agency_members', keys: ['agencyId', 'userId'] },
  { dyn: 'propreel-subscriptions', pg: 'subscriptions', keys: ['userId'] },
  { dyn: 'propreel-credit_expiries', pg: 'credit_expiries', keys: ['userId', 'expiresAt'] },
  { dyn: 'propreel-reviews', pg: 'reviews', keys: ['id'] },
];

const ADMINS = ['futuretravel@gmail.com', 'ulric@propreel.co.za'];

function ddb() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({
    region: process.env.AWS_REGION || 'af-south-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  }), { marshallOptions: { removeUndefinedValues: true } });
}

function sb(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function scanAll(tableName: string): Promise<any[]> {
  const client = ddb();
  const out: any[] = [];
  let last: Record<string, any> | undefined;
  try {
    do {
      const res = await client.send(new ScanCommand({ TableName: tableName, ...(last ? { ExclusiveStartKey: last } : {}) }));
      out.push(...(res.Items || []));
      last = res.LastEvaluatedKey;
    } while (last);
  } catch (e: any) {
    // A table that was never created (no writes yet) is not an error — nothing to migrate.
    if (e?.name === 'ResourceNotFoundException') {
      console.log(`   ⚠ ${tableName} does not exist in DynamoDB — nothing to migrate`);
      return [];
    }
    throw e;
  }
  return out;
}

/**
 * Preflight: confirm every target table AND the three atomic credit functions
 * exist before writing a single row. A missing table used to fail silently —
 * `select('*', { count, head: true })` returns null instead of erroring on a
 * missing table, so counts looked plausible while nothing was there.
 */
async function preflight(client: SupabaseClient) {
  const problems: string[] = [];

  for (const t of TABLES) {
    // A real (non-head) select errors when the table is absent.
    const { error } = await client.from(t.pg).select('*').limit(1);
    if (error) problems.push(`table ${t.pg}: ${error.message}`);
  }

  // The atomic helpers are load-bearing for the credit system.
  const rpcChecks: Array<[string, Record<string, unknown>]> = [
    ['dec_if_enough', { p_table: 'users', p_id: '__preflight__', p_attr: 'credits', p_amount: 1 }],
    ['inc_value', { p_table: 'users', p_id: '__preflight__', p_attr: 'credits', p_amount: 1 }],
    ['claim_lock', { p_id: '__preflight__', p_payload: { preflight: true } }],
  ];
  for (const [fn, args] of rpcChecks) {
    const { error } = await client.rpc(fn, args);
    if (error) problems.push(`function ${fn}: ${error.message}`);
  }
  // claim_lock may have inserted a probe row on a fresh (empty) settings table.
  await client.from('settings').delete().eq('id', '__preflight__');

  if (problems.length) {
    console.error('\n❌ PREFLIGHT FAILED — the Supabase schema is not ready:\n');
    for (const p of problems) console.error(`   • ${p}`);
    console.error('\n   Run supabase/reset.sql (if stale tables exist), then supabase/schema.sql, in the Supabase SQL Editor.\n');
    process.exit(1);
  }
  console.log('✓ Preflight: all 9 tables and 3 atomic credit functions present\n');
}

async function main() {
  const client = sb();
  await preflight(client);
  const summary: Array<{ table: string; dyn: number; pgBefore: number; pgAfter: number }> = [];

  for (const t of TABLES) {
    console.log(`\n── ${t.dyn} → ${t.pg}`);
    const items = await scanAll(t.dyn);
    const { count: before } = await client.from(t.pg).select('*', { count: 'exact', head: true });
    console.log(`   dynamo: ${items.length} rows | supabase before: ${before ?? 0}`);

    let written = 0;
    const CHUNK = 100;
    for (let i = 0; i < items.length; i += CHUNK) {
      const rows = items.slice(i, i + CHUNK).map(item => {
        const row: Record<string, any> = { data: item };
        for (const k of t.keys) {
          row[k.replace(/[A-Z]/g, c => '_' + c.toLowerCase())] = item[k];
        }
        return row;
      });
      const { error } = await client.from(t.pg).upsert(rows);
      if (error) throw new Error(`${t.pg}: ${error.message}`);
      written += rows.length;
    }
    const { count: after } = await client.from(t.pg).select('*', { count: 'exact', head: true });
    console.log(`   written: ${written} | supabase after: ${after ?? 0}`);
    summary.push({ table: t.pg, dyn: items.length, pgBefore: before ?? 0, pgAfter: after ?? 0 });
  }

  console.log('\n════════ VERIFICATION ════════');
  let ok = true;
  for (const s of summary) {
    const match = s.dyn === s.pgAfter;
    if (!match) ok = false;
    console.log(`${match ? '✓' : '✗'} ${s.table}: dynamo=${s.dyn} supabase=${s.pgAfter}`);
  }

  // Admin accounts present with role ADMIN and credits loaded
  const { data: admins } = await client.from('users').select('data').in('email', ADMINS);
  for (const email of ADMINS) {
    const row = (admins || []).find((r: any) => (r.data?.email || '').toLowerCase() === email);
    if (!row) { console.log(`✗ admin missing in Supabase: ${email}`); ok = false; continue; }
    console.log(`✓ admin ${email}: role=${row.data.role} credits=${row.data.credits}`);
    if (row.data.role !== 'ADMIN') ok = false;
  }

  console.log(`\n${ok ? '✅ MIGRATION VERIFIED — safe to cut over (DB_DRIVER=supabase)' : '❌ MISMATCHES FOUND — do NOT cut over yet'}`);
  if (!ok) process.exit(1);
}

main().then(() => process.exit(0)).catch(e => { console.error('MIGRATION ERROR:', e); process.exit(1); });
