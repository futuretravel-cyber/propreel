/**
 * Supabase (Postgres) driver — drop-in twin of the DynamoDB helpers in
 * lib/db-dynamodb.ts. Activated with DB_DRIVER=supabase; every caller keeps
 * working unchanged because items are stored whole in a `data jsonb` column
 * with hot attributes as generated columns (see supabase/schema.sql).
 *
 * SERVER-SIDE ONLY — uses the service role key (RLS blocks everything else).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase not configured: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export const dbDriver = 'supabase' as const;

// Postgres table names (schema.sql)
export const TABLES = {
  USERS: 'users',
  CREDIT_TRANSACTIONS: 'credit_transactions',
  SUBSCRIPTIONS: 'subscriptions',
  CREDIT_EXPIRIES: 'credit_expiries',
  AGENCIES: 'agencies',
  AGENCY_MEMBERS: 'agency_members',
  REVIEWS: 'reviews',
  PROJECTS: 'projects',
  SETTINGS: 'settings',
};

/** Key attributes per table (mirrors the DynamoDB key schemas). */
const KEY_COLS: Record<string, string[]> = {
  users: ['id'],
  credit_transactions: ['userId', 'createdAt'],
  projects: ['userId', 'id'],
  settings: ['id'],
  agencies: ['id'],
  agency_members: ['agencyId', 'userId'],
  subscriptions: ['userId'],
  credit_expiries: ['userId', 'expiresAt'],
  reviews: ['id'],
};

/** Sort attribute per table (DynamoDB RANGE keys) for ordered queries. */
const SORT_COL: Record<string, string> = {
  credit_transactions: 'createdAt',
  projects: 'id',
  agency_members: 'userId',
  credit_expiries: 'expiresAt',
};

/** camelCase attribute → physical generated column (schema.sql). */
const PHYSICAL: Record<string, string> = {
  id: 'id',
  userId: 'user_id',
  createdAt: 'created_at',
  agencyId: 'agency_id',
  email: 'email',
  supabaseUserId: 'supabase_user_id',
  role: 'role',
  status: 'status',
  type: 'type',
  inviteEmail: 'invite_email',
  expiresAt: 'expires_at',
};

const col = (table: string, field: string): string =>
  PHYSICAL[field] ?? `data->>${field}`;

function keyColsOf(table: string): string[] {
  return KEY_COLS[table] ?? ['id'];
}

function rowToItem(row: any): any {
  // data holds the whole original item; key columns are generated FROM data,
  // so returning data alone reproduces the exact DynamoDB item shape.
  return typeof row?.data === 'string' ? JSON.parse(row.data) : row?.data;
}

// ─── CRUD ────────────────────────────────────────────────────────────────

export async function getItem<T>(tableName: string, key: Record<string, any>): Promise<T | null> {
  try {
    let q = sb().from(tableName).select('data');
    for (const k of keyColsOf(tableName)) {
      if (key[k] === undefined) throw new Error(`getItem: missing key attr ${k} for ${tableName}`);
      q = q.eq(col(tableName, k), key[k]);
    }
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return (rowToItem(data) as T) || null;
  } catch (error) {
    console.error(`Supabase getItem error on ${tableName}:`, error);
    return null;
  }
}

export async function putItem(tableName: string, item: Record<string, any>): Promise<void> {
  const row: Record<string, any> = { data: item };
  for (const k of keyColsOf(tableName)) row[PHYSICAL[k] ?? k] = item[k];
  const { error } = await sb().from(tableName).upsert(row);
  if (error) throw error;
}

/** Atomic put-if-absent (idempotency locks). Returns true when claimed. */
export async function putItemIfNotExists(tableName: string, item: Record<string, any>): Promise<boolean> {
  const row: Record<string, any> = { data: item };
  for (const k of keyColsOf(tableName)) row[PHYSICAL[k] ?? k] = item[k];
  const { data, error } = await sb().from(tableName).insert(row).select('data');
  if (error) {
    // 23505 = unique_violation → already claimed
    if ((error as any).code === '23505') return false;
    throw error;
  }
  return (data?.length ?? 0) > 0;
}

export async function updateItem(
  tableName: string,
  key: Record<string, any>,
  updates: Record<string, any>
): Promise<void> {
  // Read-modify-write on the jsonb payload. Hot numeric fields (credits,
  // poolCredits) never flow through here — they use the atomic RPCs below.
  const current = await getItem<any>(tableName, key);
  if (!current) {
    // Match DynamoDB semantics: updating a missing item creates it
    await putItem(tableName, { ...key, ...updates } as any);
    return;
  }
  const merged: Record<string, any> = { ...current };
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) delete merged[k]; // REMOVE semantics
    else merged[k] = v;
  }
  await putItem(tableName, merged);
}

/** Translate `#f = :v AND ...` expressions into equality column filters. */
function translateExpression(
  expression: string,
  names: Record<string, string> | undefined,
  values: Record<string, any> | undefined
): Array<[string, any]> {
  const resolved = expression
    .replace(/#(\w+)/g, (_, n) => names?.[`#${n}`] ?? `#${n}`);
  const out: Array<[string, any]> = [];
  for (const clause of resolved.split(/\s+AND\s+/i)) {
    const m = clause.trim().match(/^([\w]+)\s*=\s*:(\w+)$/);
    if (!m) throw new Error(`Unsupported filter clause: "${clause}"`);
    out.push([m[1], values?.[`:${m[2]}`]]);
  }
  return out;
}

export async function queryItems<T>(
  tableName: string,
  keyCondition: any,
  options?: { filter?: any; limit?: number; scanIndexForward?: boolean }
): Promise<T[]> {
  try {
    let q = sb().from(tableName).select('data');
    for (const [field, value] of translateExpression(keyCondition.expression, keyCondition.names, keyCondition.values)) {
      q = q.eq(col(tableName, field), value);
    }
    if (options?.filter) {
      for (const [field, value] of translateExpression(options.filter.expression, options.filter.names, options.filter.values)) {
        q = q.eq(col(tableName, field), value);
      }
    }
    const sortAttr = SORT_COL[tableName];
    if (sortAttr && options?.scanIndexForward !== undefined) {
      q = q.order(col(tableName, sortAttr), { ascending: options.scanIndexForward });
    }
    if (options?.limit) q = q.limit(options.limit);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(rowToItem) as T[];
  } catch (error) {
    console.error(`Supabase query error on ${tableName}:`, error);
    return [];
  }
}

export async function scanItems<T>(tableName: string, options?: { filter?: any; limit?: number }): Promise<T[]> {
  try {
    let q = sb().from(tableName).select('data');
    if (options?.filter) {
      for (const [field, value] of translateExpression(options.filter.expression, options.filter.names, options.filter.values)) {
        q = q.eq(col(tableName, field), value);
      }
    }
    if (options?.limit) q = q.limit(options.limit);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(rowToItem) as T[];
  } catch (error) {
    console.error(`Supabase scan error on ${tableName}:`, error);
    return [];
  }
}

export async function deleteItem(tableName: string, key: Record<string, any>): Promise<void> {
  let q = sb().from(tableName).delete();
  for (const k of keyColsOf(tableName)) {
    q = q.eq(col(tableName, k), key[k]);
  }
  const { error } = await q;
  if (error) throw error;
}

export async function transactWriteItems(
  transactions: Array<{ table: string; operation: 'put' | 'update' | 'delete'; item?: any; key?: any; updates?: any }>
): Promise<void> {
  for (const tx of transactions) {
    if (tx.operation === 'put' && tx.item) await putItem(tx.table, tx.item);
    else if (tx.operation === 'update' && tx.key && tx.updates) await updateItem(tx.table, tx.key, tx.updates);
    else if (tx.operation === 'delete' && tx.key) await deleteItem(tx.table, tx.key);
  }
}

// ─── Atomic helpers (mirror the DynamoDB implementations) ───────────────

/** Atomic conditional decrement. Returns the new value, or null when the
 *  row is missing or the balance is insufficient. */
export async function decrementIfEnough(
  tableName: string,
  key: Record<string, any>,
  attr: string,
  amount: number
): Promise<number | null> {
  const { data, error } = await sb().rpc('dec_if_enough', {
    p_table: tableName,
    p_id: key.id,
    p_attr: attr,
    p_amount: amount,
  });
  if (error) throw error;
  return data == null ? null : Number(data);
}

/** Atomic increment that creates the attribute when missing. */
export async function incrementValue(
  tableName: string,
  key: Record<string, any>,
  attr: string,
  amount: number
): Promise<number> {
  const { data, error } = await sb().rpc('inc_value', {
    p_table: tableName,
    p_id: key.id,
    p_attr: attr,
    p_amount: amount,
  });
  if (error) throw error;
  return Number(data);
}

/** Conditional update used for atomic claims: succeeds only when every
 *  attrNotExists attribute is absent and every attrEquals matches. */
export async function updateWhere(
  tableName: string,
  key: Record<string, any>,
  updates: Record<string, any>,
  opts: { attrNotExists?: string[]; attrEquals?: Record<string, any> } = {}
): Promise<boolean> {
  const current = await getItem<any>(tableName, key);
  if (!current) return false;
  for (const attr of opts.attrNotExists ?? []) {
    if (current[attr] != null) return false;
  }
  for (const [attr, value] of Object.entries(opts.attrEquals ?? {})) {
    if (current[attr] !== value) return false;
  }
  await updateItem(tableName, key, updates);
  return true;
}
