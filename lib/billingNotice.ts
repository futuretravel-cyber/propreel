import { scanItems, TABLES } from './db';
import { getUser, updateUser, getPlans } from './userService';
import { sendEmail, upcomingBillingTemplate } from './email';

/**
 * Upcoming-billing notice (nightly cron): emails every ACTIVE subscriber
 * whose Paystack recurrence charges in the next BILLING_NOTICE_DAYS days.
 *
 * Idempotency: one marker row per user+cycle in the settings table
 * (billnotice_<userId>_<periodEndISO-date>) — a re-run or cron double-fire
 * can never email the same subscriber twice for the same renewal.
 *
 * The actual charge is Paystack's job (their subscription engine charges the
 * saved card on the billing date; webhook `charge.success`/`subscription.renewal`
 * then allocates credits). This sweep only NOTIFIES — it never touches money.
 */
export const BILLING_NOTICE_DAYS = 3; // email the subscriber this many days before the cycle charge

export interface BillingNoticeOutcome {
  userId: string;
  email: string;
  action: 'emailed' | 'skipped_recent' | 'skipped_no_plan' | 'skipped_email_failed';
  detail?: string;
}

function planLabelOf(planId: string | undefined, plans: Record<string, { name?: string; monthlyZar?: number; annualZar?: number }>): string {
  const p = (planId && plans[String(planId).toUpperCase()]) || null;
  return p?.name || String(planId || 'PropReel plan');
}

function cycleLabelOf(cycle: string | undefined): string {
  return cycle === 'ANNUAL' ? 'annual' : 'monthly';
}

export async function runBillingNoticeSweep(opts: { dryRun?: boolean } = {}): Promise<BillingNoticeOutcome[]> {
  const users = await scanItems<any>(TABLES.USERS, { limit: 500 });
  const plans = await getPlans();
  const outcomes: BillingNoticeOutcome[] = [];
  const appUrl = process.env.APP_URL || 'https://www.propreel.co.za';

  for (const u of users) {
    const sub = u?.subscription;
    if (!sub || sub.status !== 'ACTIVE' || !sub.currentPeriodEnd) continue;

    const periodEnd = new Date(sub.currentPeriodEnd);
    const daysAhead = (periodEnd.getTime() - Date.now()) / 86400000;
    if (daysAhead < 0 || daysAhead > BILLING_NOTICE_DAYS) continue;

    if (opts.dryRun) {
      const plan = plans[String(sub.planId || '').toUpperCase()];
      const amount = Math.round(
        (sub.cycle === 'ANNUAL' ? (plan?.annualZar ?? 0) * 12 : (plan?.monthlyZar ?? 0))
      );
      outcomes.push({ userId: u.id, email: u.email, action: 'skipped_recent', detail: `DRY-RUN would email: ${planLabelOf(sub.planId, plans)} R${amount} on ${new Date(sub.currentPeriodEnd).toISOString().slice(0, 10)}` });
      console.log(`[billing-notice][dry] ${u.email} → ${planLabelOf(sub.planId, plans)} R${amount} on ${sub.currentPeriodEnd.slice(0, 10)}`);
      continue;
    }

    // Idempotency marker per cycle
    const markerId = `billnotice_${u.id}_${sub.currentPeriodEnd.slice(0, 10)}`;
    const { putItemIfNotExists } = await import('./db');
    const claimed = await putItemIfNotExists(TABLES.SETTINGS, {
      id: markerId,
      type: 'billing_notice',
      userId: u.id,
      createdAt: new Date().toISOString(),
    });
    if (!claimed) {
      outcomes.push({ userId: u.id, email: u.email, action: 'skipped_recent' });
      continue;
    }

    const plan = plans[String(sub.planId || '').toUpperCase()];
    const amount = Math.round(
      (sub.cycle === 'ANNUAL' ? (plan?.annualZar ?? 0) * 12 : (plan?.monthlyZar ?? 0))
    );
    const tpl = upcomingBillingTemplate({
      fullName: u.fullName || 'there',
      planLabel: planLabelOf(sub.planId, plans),
      amountZar: amount,
      chargeDateLabel: periodEnd.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }),
      cycleLabel: cycleLabelOf(sub.cycle),
      manageUrl: `${appUrl}/dashboard/billing`,
    });

    const sent = await sendEmail({ to: u.email, subject: tpl.subject, html: tpl.html, text: tpl.text }).catch(() => null);
    if (sent?.ok) {
      outcomes.push({ userId: u.id, email: u.email, action: 'emailed', detail: tpl.subject });
    } else {
      // Release the claim so a later sweep can retry the send (no silent skip)
      const { deleteItem } = await import('./db');
      await deleteItem(TABLES.SETTINGS, { id: markerId }).catch(() => {});
      outcomes.push({ userId: u.id, email: u.email, action: 'skipped_email_failed', detail: sent?.error || 'send failed' });
    }

    console.log(`[billing-notice] ${u.email} → ${tpl.subject}`);
  }

  return outcomes;
}
