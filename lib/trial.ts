/**
 * Temporary ("trial") accounts — valid 7 days. DORMANT FOR NEW SIGNUPS as of
 * 2026-10-21: the signup UI now creates permanent FREE accounts (no trial
 * clock, no subscription) and no longer offers a trial, so nothing starts a
 * new clock. This module's full lifecycle still runs for rows that already
 * carry one — reminders, day-7 sweep, soft-lock, purge — kept intact on
 * purpose (admin-created trials and pre-existing rows behave as before).
 *
 * Lifecycle:
 *   1. auth_register with startTrial → user row gets trialExpiresAt = now + 7d
 *      (the standard 5-credit signup bonus is their test fuel).
 *   2. While active: in-app banner shows days left; the 9am cron emails a
 *      daily reminder (sendTrialReminders).
 *   3. Day 7, no subscription → runTrialSweep soft-deletes: trialEndedAt set,
 *      every session revoked, one "trial ended" email. getSessionUser and
 *      auth_login now treat the account as signed-out (403 TRIAL_EXPIRED).
 *   4. Reactivate: auth_login with reactivate:true + correct password clears
 *      the lock (trialReactivatedAt) — browsing works, but rendering stays
 *      blocked until they subscribe (isTrialSpendingBlocked).
 *   5. Subscribe at ANY point → createSubscription wipes all trial fields;
 *      account becomes a normal subscribed account (never purged).
 *   6. trialExpiresAt + 30 days, still no subscription → hard purge
 *      (projects + sessions + user row), however far step 4 got them.
 *
 * No import cycles: this module imports userService/email/db only — auth.ts
 * and api/* import THIS, never the reverse. Session revocation is done here
 * with raw db calls for the same reason.
 */
import { updateItem, queryItems, scanItems, deleteItem, TABLES } from './db';
import type { User } from './userService';
import { sendEmail, trialReminderTemplate, trialEndedTemplate } from './email';

export const TRIAL_DAYS = 7;
/** Soft-deleted rows are kept this long after trial expiry, then purged. */
export const TRIAL_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const SITE_BASE = process.env.SITE_URL || 'https://www.propreel.co.za';

/** Row shape for the trial fields carried on the user row. */
export interface TrialFields {
  trialExpiresAt?: string;
  trialEndedAt?: string;
  trialReactivatedAt?: string;
  trialLastReminderDate?: string;
}

/** True while the trial clock is still ticking (and they haven't subscribed). */
export function isTrialRunning(user: User & TrialFields): boolean {
  if (!user.trialExpiresAt) return false;
  if (user.role === 'ADMIN') return false;
  if (user.subscription?.status === 'ACTIVE') return false;
  return Date.parse(user.trialExpiresAt) > Date.now();
}

/**
 * Soft-delete lock: trial expired, never reactivated, no subscription.
 * Gates auth_login (403 TRIAL_EXPIRED) and getSessionUser (treats session
 * as dead, so stale cookies can't outlive the trial).
 */
export function isTrialLocked(user: User & TrialFields): boolean {
  if (!user.trialExpiresAt) return false;
  if (user.role === 'ADMIN') return false;
  if (user.subscription?.status === 'ACTIVE') return false;
  if (user.trialReactivatedAt) return false;
  return Date.parse(user.trialExpiresAt) <= Date.now();
}

/**
 * Spending gate: trial expired and no subscription — blocks deductCredits
 * even after reactivation. Reactivating lets them back in to browse and
 * pay; only an actual subscription lifts this.
 */
export function isTrialSpendingBlocked(user: User & TrialFields): boolean {
  if (!user.trialExpiresAt) return false;
  if (user.role === 'ADMIN') return false;
  if (user.subscription?.status === 'ACTIVE') return false;
  return Date.parse(user.trialExpiresAt) <= Date.now();
}

/** Days left on an active trial (min 1). */
export function trialDaysLeft(user: User & TrialFields): number {
  if (!user.trialExpiresAt) return 0;
  return Math.max(1, Math.ceil((Date.parse(user.trialExpiresAt) - Date.now()) / DAY_MS));
}

/** Best-effort session revocation (mirrors auth.deleteSessionsForUser; inlined
 *  to keep this module free of imports auth.ts needs — no cycle). */
async function revokeSessions(userId: string): Promise<void> {
  try {
    const rows = await scanItems<{ id: string }>(TABLES.SESSIONS, {
      filter: { expression: 'userId = :u', values: { ':u': userId } },
      limit: 500,
    });
    for (const r of rows) await deleteItem(TABLES.SESSIONS, { id: r.id }).catch(() => {});
  } catch (e) {
    console.error('trial revokeSessions failed:', e);
  }
}

export interface TrialSweepResult {
  softDeleted: number;
  purged: number;
  endedEmails: number;
  converted: number;
  errors: number;
}

/**
 * Nightly trial maintenance (called from api/cron/process-expired-credits):
 *   • expire trials past trialExpiresAt → soft delete (revoke sessions + email)
 *   • clear stray trial fields on now-subscribed users (defensive)
 *   • purge rows whose trial expired more than TRIAL_RETENTION_DAYS ago
 *     and that still have no subscription
 */
export async function runTrialSweep(): Promise<TrialSweepResult> {
  const out: TrialSweepResult = { softDeleted: 0, purged: 0, endedEmails: 0, converted: 0, errors: 0 };
  let users: (User & TrialFields)[];
  try {
    users = await scanItems<User & TrialFields>(TABLES.USERS, {
      filter: { expression: 'attribute_exists(trialExpiresAt)' },
      limit: 5000,
    });
  } catch (e) {
    console.error('trial sweep scan failed:', e);
    out.errors++;
    return out;
  }

  const now = Date.now();
  for (const u of users) {
    try {
      // Subscribed users should have had their trial fields wiped at purchase;
      // clean up anything that slipped through (e.g. webhook races).
      if (u.subscription?.status === 'ACTIVE' && (u.trialExpiresAt || u.trialEndedAt)) {
        await updateItem(TABLES.USERS, { id: u.id }, {
          trialExpiresAt: undefined,
          trialEndedAt: undefined,
          trialReactivatedAt: undefined,
          trialLastReminderDate: undefined,
        });
        out.converted++;
        continue;
      }
      if (u.role === 'ADMIN') continue;
      const expiresAt = Date.parse(u.trialExpiresAt || '');
      if (Number.isNaN(expiresAt) || expiresAt > now) continue;

      // 30 days past expiry with no subscription → permanent purge.
      if (now > expiresAt + TRIAL_RETENTION_DAYS * DAY_MS) {
        try {
          const projects = await queryItems<{ id: string }>(TABLES.PROJECTS, {
            expression: 'userId = :u',
            values: { ':u': u.id },
          });
          for (const p of projects) {
            await deleteItem(TABLES.PROJECTS, { userId: u.id, id: p.id }).catch(() => {});
          }
        } catch (e) {
          console.error(`trial purge projects failed for ${u.id}:`, e);
        }
        await revokeSessions(u.id);
        await deleteItem(TABLES.USERS, { id: u.id });
        out.purged++;
        console.log(`trial purge: ${u.email} (trial expired >${TRIAL_RETENTION_DAYS}d, no subscription)`);
        continue;
      }

      // Day-7 soft delete — once only (trialEndedAt is the marker; users who
      // reactivated are left alone, they're in "must subscribe" limbo).
      if (!u.trialEndedAt && !u.trialReactivatedAt) {
        await updateItem(TABLES.USERS, { id: u.id }, {
          trialEndedAt: new Date(now).toISOString(),
        });
        await revokeSessions(u.id);
        out.softDeleted++;
        console.log(`trial expired: ${u.email} soft-deleted (sessions revoked)`);

        if (u.notificationPreferences?.emailNotifications !== false) {
          const tpl = trialEndedTemplate(u.fullName || '', `${SITE_BASE}/login`);
          const sent = await sendEmail({ to: u.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
          if (sent.ok) out.endedEmails++;
          else console.error('trial-ended email failed:', sent.error);
        }
      }
    } catch (e) {
      out.errors++;
      console.error(`trial sweep error for ${u.id}:`, e);
    }
  }
  return out;
}

export interface TrialReminderResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Daily 9am trial reminders (called from api/cron/send-expiry-notifications).
 * One email per user per calendar day (UTC), only while the trial is still
 * running — once it expires the sweep's "trial ended" email takes over.
 */
export async function sendTrialReminders(): Promise<TrialReminderResult> {
  const out: TrialReminderResult = { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  let users: (User & TrialFields)[];
  try {
    users = await scanItems<User & TrialFields>(TABLES.USERS, {
      filter: { expression: 'attribute_exists(trialExpiresAt)' },
      limit: 5000,
    });
  } catch (e) {
    console.error('trial reminder scan failed:', e);
    out.failed++;
    return out;
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const u of users) {
    try {
      if (!isTrialRunning(u)) { out.skipped++; continue; }
      if (u.trialLastReminderDate === today) { out.skipped++; continue; }
      if (u.notificationPreferences?.emailNotifications === false) { out.skipped++; continue; }
      out.scanned++;

      const daysLeft = trialDaysLeft(u);
      const tpl = trialReminderTemplate(
        u.fullName || '',
        daysLeft,
        u.trialExpiresAt!,
        `${SITE_BASE}/dashboard/billing`
      );
      const sent = await sendEmail({ to: u.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
      if (sent.ok) {
        await updateItem(TABLES.USERS, { id: u.id }, { trialLastReminderDate: today });
        out.sent++;
      } else {
        out.failed++;
        console.error(`trial reminder failed for ${u.email}:`, sent.error);
      }
    } catch (e) {
      out.failed++;
      console.error(`trial reminder error for ${u.id}:`, e);
    }
  }
  return out;
}

/** Convenience for auth_register: the row's trial state after an update. */
export async function startTrial(userId: string): Promise<void> {
  await updateItem(TABLES.USERS, { id: userId }, {
    trialExpiresAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS).toISOString(),
  });
}
