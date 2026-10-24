/**
 * Admin-action audit trail (audit §11: "credit grants, role changes, review
 * moderation and update-mode toggles should land in a queryable log").
 *
 * Rows live in the SETTINGS table under a stable `admlog_` id prefix with
 * `type: 'ADMIN_ACTION'`, so a single id-prefix scan returns the whole log
 * (same grab-bag pattern the reviews and event locks already use). Recorded
 * server-side at the moment of the action with the acting admin's identity
 * taken from the SESSION — a client cannot forge or omit its own entry.
 *
 * Retention: kept indefinitely (the privacy notice promises audit logs for
 * 2 years; rows beyond that may be pruned by the retention cron).
 */

import { putItem, scanItems, TABLES } from './db';

export interface AdminActionRow {
  id: string;
  type: 'ADMIN_ACTION';
  /** What happened — e.g. CREDIT_GRANT, SUBSCRIPTION_CHANGE, REVIEW_MODERATED, UPDATE_MODE */
  action: string;
  /** The acting admin's email (server-derived from the session) */
  by: string;
  /** Who/what was affected — user id, review id, 'site', … */
  target?: string;
  /** Human-readable detail for the log line */
  detail?: string;
  createdAt: string;
}

/**
 * Best-effort write: an audit failure must never break the action being
 * audited (a grant that succeeded must not 500 because the log write hit a
 * throttle), but it is always attempted at the call site.
 */
export async function recordAdminAction(entry: {
  by: string;
  action: string;
  target?: string;
  detail?: string;
}): Promise<void> {
  try {
    const now = new Date();
    await putItem(TABLES.SETTINGS, {
      // Time-sortable and unique: ISO prefix + random suffix.
      id: `admlog_${now.toISOString()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'ADMIN_ACTION',
      action: entry.action,
      by: entry.by,
      target: entry.target || null,
      detail: entry.detail || null,
      createdAt: now.toISOString(),
    } as AdminActionRow & Record<string, unknown>);
  } catch (e) {
    console.error('recordAdminAction failed (action itself succeeded):', e);
  }
}

/** Newest-first admin action log — the queryable feed behind Admin → Audit. */
export async function listAdminActions(limit = 200): Promise<AdminActionRow[]> {
  const rows = await scanItems<AdminActionRow>(TABLES.SETTINGS, { limit: 500 });
  return rows
    .filter(r => String(r.id || '').startsWith('admlog_') && (r as any).type === 'ADMIN_ACTION')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, limit);
}
