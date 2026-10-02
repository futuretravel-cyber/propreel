import { scanItems, TABLES } from './db';
import { getUser, addCredits } from './userService';
import { chargeAuthorization } from './paystack';

export interface AutoTopupOutcome {
  userId: string;
  email: string;
  action: 'charged' | 'checkout_required' | 'skipped' | 'failed';
  detail?: string;
  reference?: string;
}

/** Mark the user's auto-topup as needing a one-time hosted-checkout visit. */
async function requestAuthorization(userId: string, amount: number): Promise<void> {
  const { updateItem } = await import('./db');
  try {
    await updateItem(TABLES.USERS, { id: userId }, {
      autoTopupNeedsAuth: true,
      autoTopupAuthAmount: amount,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('autoTopup auth-flag write failed:', e);
  }
}

/**
 * Auto-recharge sweep: for every user with auto-topup enabled whose balance
 * dropped below their threshold, charge their saved Paystack authorization
 * for the configured amount. If no saved authorization exists, flag the
 * account so the dashboard shows a one-time "finish setting up auto-recharge"
 * checkout prompt instead of silently doing nothing.
 *
 * Runs from the nightly cron. The charge itself is verified + credited by the
 * normal Paystack charge.success webhook path (eventId idempotency applies).
 */
export async function runAutoTopupSweep(): Promise<AutoTopupOutcome[]> {
  const users = await scanItems<any>(TABLES.USERS, { limit: 500 });
  const outcomes: AutoTopupOutcome[] = [];

  for (const u of users) {
    const cfg = u.autoTopup;
    if (!cfg?.enabled || !cfg.amount || !cfg.threshold) continue;
    if ((u.credits ?? 0) >= cfg.threshold) continue;

    const authCode = u.paystackAuthorizationCode;
    try {
      if (!authCode) {
        await requestAuthorization(u.id, cfg.amount);
        outcomes.push({ userId: u.id, email: u.email, action: 'checkout_required', detail: `no saved card — flagged for one-time checkout (R${cfg.amount})` });
        continue;
      }
      const charge = await chargeAuthorization(u.email, cfg.amount, authCode, {
        user_id: u.id, credits: cfg.amount, type: 'auto_topup',
      });
      if (charge.status === 'success') {
        // Credit immediately (webhook will also fire; eventId idempotency uses
        // the charge reference path via verify, so we record with the same
        // reference marker the webhook checks).
        const { putItem, TABLES: T } = await import('./db');
        await putItem(T.SETTINGS, { id: `pay_${charge.reference}`, userId: u.id, type: 'payment_processed', createdAt: new Date().toISOString() });
        // eventId makes the ledger row idempotent — if Paystack's webhook re-delivers the same charge (same data.id), the ledger ignores it.
        const eventId = charge.paystackId != null ? `ps_${charge.paystackId}` : undefined;
        await addCredits(u.id, cfg.amount, 'purchase', `Auto-recharge: ${cfg.amount} credits`, { paystackReference: charge.reference, auto: true }, undefined, eventId);
        outcomes.push({ userId: u.id, email: u.email, action: 'charged', reference: charge.reference, detail: `R${cfg.amount}` });
      } else {
        outcomes.push({ userId: u.id, email: u.email, action: 'failed', detail: `charge status ${charge.status}` });
      }
    } catch (e: any) {
      outcomes.push({ userId: u.id, email: u.email, action: 'failed', detail: String(e?.message || e).slice(0, 160) });
    }
  }
  return outcomes;
}
