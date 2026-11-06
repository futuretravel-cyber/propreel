import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getItem, updateItem, TABLES } from './db';

export interface RateLimitDecision {
  allowed: boolean;
  /** requests left in the current window (when allowed) */
  remaining: number;
  /** seconds until the window resets (only set when blocked) */
  retryAfterSec: number;
}

/**
 * Per-key fixed-window rate counter backed by ONE DynamoDB row
 * (`rl_<scope>_<key>` in the settings table) — one row per scope+user ever
 * exists, so nothing accumulates and there is no TTL dependency.
 *
 * Every request runs a single atomic `ADD` guarded by "same window AND below
 * the limit", so a concurrent burst cannot slip past the cap the way a
 * read-then-write counter would. When the guard fails we read the row to
 * tell an exhausted window (block until it rolls) from a rolled-over one
 * (reset the counter and allow).
 *
 * DynamoDB trouble fails OPEN: a transient database blip must never break
 * uploads — worst case a burst slips through, which is the same exposure as
 * having no limiter at all.
 */
export async function consumeRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowSec: number,
  opts: { failClosed?: boolean } = {}
): Promise<RateLimitDecision> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);
  const id = `rl_${scope}_${key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`;
  // Database trouble: allow (default) or block (failClosed, for auth routes).
  const onError = (): RateLimitDecision =>
    opts.failClosed
      ? { allowed: false, remaining: 0, retryAfterSec: 30 }
      : { allowed: true, remaining: limit, retryAfterSec: 0 };

  // A few attempts: contention at a window boundary retries cleanly; only
  // after repeated collisions do we fail open.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await docClient.send(new UpdateCommand({
        TableName: TABLES.SETTINGS,
        Key: { id },
        UpdateExpression: 'ADD #c :one',
        ConditionExpression: '#w = :ws AND #c < :limit',
        ExpressionAttributeNames: { '#c': 'count', '#w': 'windowStart' },
        ExpressionAttributeValues: { ':one': 1, ':ws': windowStart, ':limit': limit },
        ReturnValues: 'UPDATED_NEW',
      }));
      const count = Number(r.Attributes?.count ?? 1);
      return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSec: 0 };
    } catch (err: any) {
      if (err?.name !== 'ConditionalCheckFailedException') {
        console.error(`Rate limit (${scope}) database error:`, err);
        return onError();
      }
    }

    // Guard failed: exhausted in this window, or the window rolled over?
    try {
      const row = await getItem<{ windowStart?: number; count?: number }>(TABLES.SETTINGS, { id });
      if (row && Number(row.windowStart) === windowStart && Number(row.count || 0) >= limit) {
        return { allowed: false, remaining: 0, retryAfterSec: (windowStart + windowSec) - now };
      }
      if (attempt === 2) break; // pure contention — fail open below
      // New window (or first ever): reset the counter for this window.
      if (!row || Number(row.windowStart) !== windowStart) {
        await updateItem(TABLES.SETTINGS, { id }, { windowStart, count: 1 });
        return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
      }
      // Row is in-window and under the limit — our ADD only lost a race;
      // loop and retry the atomic increment.
    } catch (err) {
      console.error(`Rate limit (${scope}) database error on rollover:`, err);
      return onError();
    }
  }
  return { allowed: true, remaining: limit, retryAfterSec: 0 };
}
