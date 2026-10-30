import { scanItems, TABLES } from './db';
import { getUser, updateUser } from './userService';

export const DUNNING_STEPS_DAYS = [1, 3, 7, 14]; // retries after first failure
export const DOWNGRADE_AFTER_DAYS = 21;

export interface DunningOutcome {
  userId: string;
  email: string;
  action: 'retry_charged' | 'reminder' | 'downgraded' | 'recovered' | 'failed' | 'ok';
  detail?: string;
  reference?: string;
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

/**
 * Recovery notice + episode close, shared by the sweep, the charge.success
 * webhook and the hosted-checkout verify path: when ANY successful payment
 * clears an active dunning episode, the customer gets one "plan is active
 * again" email. Exactly-once per episode — the marker is keyed on the
 * episode's firstFailedAt and claimed atomically before sending, so a
 * webhook + verify race (or a sweep retry racing the webhook) can never
 * double-email. No-op for users with no active episode. The payment
 * succeeded, so the episode is closed even if the email send fails.
 */
export async function clearDunningAndNotify(
  userId: string
): Promise<{ cleared: boolean; emailed: boolean; reason?: string }> {
  const u = await getUser(userId).catch(() => null);
  const episodeStart = u && u.paymentFailure ? u.paymentFailure.firstFailedAt : undefined;
  if (!u || !episodeStart) return { cleared: false, emailed: false, reason: 'no_active_episode' };

  await updateUser(userId, { paymentFailure: undefined } as any);

  const { putItemIfNotExists } = await import('./db');
  const claimed = await putItemIfNotExists(TABLES.SETTINGS, {
    id: `recovery_${userId}_${episodeStart}`,
    type: 'payment_recovery_notice',
    userId,
    createdAt: new Date().toISOString(),
  });
  if (!claimed) return { cleared: true, emailed: false, reason: 'already_notified' };

  try {
    const { sendEmail, paymentRecoveredTemplate } = await import('./email');
    const tpl = paymentRecoveredTemplate({
      fullName: u.fullName || 'there',
      planLabel: String(u.subscription?.planId || 'PropReel plan'),
      amountZar: Math.max(50, Math.round(u.subscription?.nextChargeAmount || 50)),
      manageUrl: `${process.env.APP_URL || 'https://www.propreel.co.za'}/dashboard/billing`,
    });
    const sent = await sendEmail({ to: u.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    console.log(`[dunning-email] to=${u.email} sent=${sent.ok ? 'yes' : `no (${sent.error})`} subject="${tpl.subject}"`);
    return { cleared: true, emailed: !!sent.ok, reason: sent.ok ? undefined : sent.error };
  } catch (mailErr: any) {
    console.error(`[dunning-email] recovery send failed for ${u.email}:`, mailErr?.message || mailErr);
    return { cleared: true, emailed: false, reason: 'send_failed' };
  }
}

/**
 * Dunning sweep (nightly): for every user with a paymentFailure record —
 *  - Retry the card (if a saved authorization exists) on day 1/3/7/14 after
 *    the first failure. A successful retry clears the state immediately.
 *  - Otherwise send a reminder email on those days (Resend; send failures
 *    are logged and never fail the sweep).
 *  - At 21 days with no recovery, downgrade the subscription locally
 *    (status CANCELLED) and send a one-shot cancellation email. Paystack
 *    has already stopped collecting on its side.
 *
 * The charge goes through the normal charge.success webhook path, so
 * eventId idempotency applies to any credit top-up made by retries.
 */
export async function runDunningSweep(): Promise<DunningOutcome[]> {
  const users = await scanItems<any>(TABLES.USERS, { limit: 500 });
  const outcomes: DunningOutcome[] = [];

  for (const u of users) {
    const pf = u.paymentFailure;
    if (!pf?.firstFailedAt) continue;

    // Only an ACTIVE-ish subscription is worth dunning: without one there is
    // no renewal to rescue and nothing to cancel — retrying nextChargeAmount
    // against the saved card would charge for a plan that doesn't exist.
    // Defense-in-depth behind the charge.failed webhook guard (one-off
    // purchase failures no longer create paymentFailure at all); this also
    // stops the post-downgrade tail from re-processing a user every night.
    const status = String(u.subscription?.status || '');
    if (status !== 'ACTIVE' && status !== 'DOWNGRADE_PENDING') continue;

    // Already recovered? (a later successful charge cleared it)
    if (!pf.lastAttemptAt) continue;

    const days = daysSince(pf.firstFailedAt);

    // ── Recovered outside the sweep (e.g. user paid manually) ──────────
    // A successful payment clears paymentFailure in the webhook; if the
    // record still exists here, it's still failing.
    try {
      if (days >= DOWNGRADE_AFTER_DAYS) {
        // ── Day 21+: graceful downgrade ────────────────────────────────
        if (u.subscription?.status === 'ACTIVE') {
          await updateUser(u.id, {
            subscription: { ...u.subscription, status: 'CANCELLED' as const },
          });
          outcomes.push({ userId: u.id, email: u.email, action: 'downgraded', detail: `21+ days unpaid — subscription cancelled` });
          // Real cancellation email (Resend) — was a console.log placeholder.
          // Sent ONLY on the actual downgrade (this branch), so later sweeps
          // hitting the already-cancelled plan can never re-send it. Send
          // failure is logged, never fatal.
          try {
            const { sendEmail, subscriptionCancelledTemplate } = await import('./email');
            const tpl = subscriptionCancelledTemplate({
              fullName: u.fullName || 'there',
              planLabel: String(u.subscription?.planId || 'PropReel plan'),
              amountZar: Math.max(50, Math.round(u.subscription?.nextChargeAmount || 50)),
              manageUrl: `${process.env.APP_URL || 'https://www.propreel.co.za'}/dashboard/billing`,
            });
            const sent = await sendEmail({ to: u.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
            console.log(`[dunning-email] to=${u.email} sent=${sent.ok ? 'yes' : `no (${sent.error})`} subject="${tpl.subject}"`);
          } catch (mailErr: any) {
            console.error(`[dunning-email] cancellation send failed for ${u.email}:`, mailErr?.message || mailErr);
          }
        } else {
          outcomes.push({ userId: u.id, email: u.email, action: 'ok', detail: `21+ days unpaid, subscription already ${u.subscription?.status || 'none'}` });
        }
        continue;
      }

      const stepDue = DUNNING_STEPS_DAYS.some(d => days >= d && days < d + 1) ||
        // Catch-up if the sweep missed the exact window (cron skipped a night)
        (DUNNING_STEPS_DAYS.some((d, i) => days >= d && (i === DUNNING_STEPS_DAYS.length - 1 || days < DUNNING_STEPS_DAYS[i + 1])) &&
          // Only retry once per step: last attempt must be older than this step's start
          daysSince(pf.lastAttemptAt) >= 1);

      if (stepDue) {
        const authCode = u.paystackAuthorizationCode;
        let retried = false;
        let reference: string | undefined;

        if (authCode) {
          try {
            const { chargeAuthorization } = await import('./paystack');
            const charge = await chargeAuthorization(u.email, Math.max(50, Math.round(u.subscription?.nextChargeAmount || 50)), authCode, {
              user_id: u.id, type: 'dunning_retry',
            });
            retried = charge.status === 'success';
            reference = charge.reference;
            if (retried) {
              // Success: record the pay marker so the webhook doesn't double-
              // credit (webhook may still arrive; eventId idempotency on the
              // ledger covers the rest); the shared helper closes the episode
              // and sends the recovery email exactly once (own try/catch, so a
              // send failure can never fall through to the payment-failed email
              // below — the charge actually succeeded).
              const { putItem } = await import('./db');
              await putItem(TABLES.SETTINGS, { id: `pay_${charge.reference}`, userId: u.id, type: 'payment_processed', createdAt: new Date().toISOString() });
              await clearDunningAndNotify(u.id);
              outcomes.push({ userId: u.id, email: u.email, action: 'recovered', detail: `retry charged R${u.subscription?.nextChargeAmount || '?'}`, reference: charge.reference });
              continue;
            }
          } catch (e: any) {
            console.error(`Dunning retry charge failed for ${u.id}:`, e?.message || e);
          }
        }

        if (!retried) {
          await updateUser(u.id, {
            paymentFailure: { ...pf, count: (pf.count || 0) + 1, lastAttemptAt: new Date().toISOString(), lastReference: reference },
          });
          outcomes.push({ userId: u.id, email: u.email, action: authCode ? 'failed' : 'reminder', detail: authCode ? `retry failed (day ${days.toFixed(0)})` : `no saved card — reminder logged (day ${days.toFixed(0)})` });
        }
        // Real failure email now (Resend) — was a console.log placeholder.
        // Send failure only logs; dunning itself must never break on it.
        try {
          const { sendEmail, paymentFailedTemplate } = await import('./email');
          const tpl = paymentFailedTemplate({
            fullName: u.fullName || 'there',
            planLabel: String(u.subscription?.planId || 'PropReel plan'),
            amountZar: Math.max(50, Math.round(u.subscription?.nextChargeAmount || 50)),
            daysUnpaid: days,
            manageUrl: `${process.env.APP_URL || 'https://www.propreel.co.za'}/dashboard/billing`,
          });
          const sent = await sendEmail({ to: u.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
          console.log(`[dunning-email] to=${u.email} sent=${sent.ok ? 'yes' : `no (${sent.error})`} subject="${tpl.subject}"`);
        } catch (mailErr: any) {
          console.error(`[dunning-email] send failed for ${u.email}:`, mailErr?.message || mailErr);
        }
      } else {
        outcomes.push({ userId: u.id, email: u.email, action: 'ok', detail: `day ${days.toFixed(0)} — next step not due` });
      }
    } catch (e: any) {
      outcomes.push({ userId: u.id, email: u.email, action: 'failed', detail: String(e?.message || e).slice(0, 160) });
    }
  }

  return outcomes;
}
