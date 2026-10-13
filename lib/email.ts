/**
 * Transactional email via Resend (free tier) — replaces the Supabase built-in
 * SMTP that capped signups at ~2 confirmations/hour.
 *
 * Requires RESEND_API_KEY. EMAIL_FROM defaults to the branded sender; while
 * propreel.co.za is not yet verified in the Resend dashboard the API rejects
 * it, so we automatically fall back to Resend's onboarding sender. NOTE: the
 * onboarding sender only delivers to the Resend account's own email address —
 * verify the domain (DNS records at the registrar) before real traffic.
 */

import type { PnlReport } from './pnl';

const RESEND_API_URL = 'https://api.resend.com/emails';

const BRANDED_FROM = process.env.EMAIL_FROM || 'PropReel <no-reply@propreel.co.za>';
const FALLBACK_FROM = 'PropReel <onboarding@resend.dev>';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Optional attachments — `content` is base64 (e.g. a statement PDF). */
  attachments?: Array<{ filename: string; content: string; type?: string }>;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** true when the branded sender was rejected and the onboarding sender was used */
  usedFallback?: boolean;
}

async function postEmail(from: string, input: SendEmailInput): Promise<{ status: number; body: any }> {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.attachments?.length
        ? {
            attachments: input.attachments.map(a => ({
              filename: a.filename,
              content: a.content,
              ...(a.type ? { type: a.type } : {}),
            })),
          }
        : {}),
    }),
  });
  let body: any = {};
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  return { status: res.status, body };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    const error = 'RESEND_API_KEY is not configured';
    console.error(`[email] ${error} — would have sent "${input.subject}" to ${input.to}`);
    return { ok: false, error };
  }

  try {
    const primary = await postEmail(BRANDED_FROM, input);
    if (primary.status < 300) {
      return { ok: true, id: primary.body?.id };
    }

    // Domain not verified yet → retry once with Resend's onboarding sender.
    const isDomainError = /not verified/i.test(String(primary.body?.message || ''));
    if (isDomainError) {
      const fallback = await postEmail(FALLBACK_FROM, input);
      if (fallback.status < 300) {
        console.warn(`[email] branded sender ${BRANDED_FROM} rejected (domain unverified) — sent via ${FALLBACK_FROM}. Verify the domain in Resend to restore branded sending.`);
        return { ok: true, id: fallback.body?.id, usedFallback: true };
      }
      console.error(`[email] fallback send failed (${fallback.status}):`, fallback.body);
      return { ok: false, error: String(fallback.body?.message || `Resend error ${fallback.status}`) };
    }

    console.error(`[email] send failed (${primary.status}):`, primary.body);
    return { ok: false, error: String(primary.body?.message || `Resend error ${primary.status}`) };
  } catch (e: any) {
    console.error('[email] send threw:', e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

function layout(title: string, bodyHtml: string, cta?: { url: string; label: string }): string {
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td style="border-radius:8px;background:#7e22ce"><a href="${cta.url}" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none">${cta.label}</a></td></tr></table>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0b14;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b14;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#151527;border:1px solid #262643;border-radius:16px;padding:32px">
        <tr><td style="padding-bottom:8px">
          <div style="font-size:22px;font-weight:bold;color:#ffffff">▶ PropReel</div>
        </td></tr>
        <tr><td style="padding-top:16px">
          <h1 style="margin:0 0 16px;font-size:20px;color:#ffffff">${title}</h1>
          <div style="font-size:15px;line-height:1.6;color:#c9c9dd">${bodyHtml}</div>
          ${ctaHtml}
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #262643;font-size:12px;color:#7b7b99">
            If the button doesn't work, copy and paste this link into your browser:<br/>
            ${cta ? `<span style="word-break:break-all;color:#a78bfa">${cta.url}</span>` : ''}
            <br/><br/>PropReel — AI property videos for South African estate agents.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function confirmEmailTemplate(name: string, confirmUrl: string): { subject: string; html: string; text: string } {
  const first = (name || '').split(' ')[0] || 'there';
  return {
    subject: 'Confirm your PropReel email address',
    html: layout(
      `Welcome to PropReel, ${first}!`,
      `<p>Thanks for signing up. Please confirm your email address to activate your account and claim your free credits.</p>
       <p>This link expires in 24 hours.</p>`,
      { url: confirmUrl, label: 'Confirm my email' }
    ),
    text: `Confirm your PropReel email: ${confirmUrl} (expires in 24 hours)`,
  };
}

export function resetPasswordTemplate(resetUrl: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Reset your PropReel password',
    html: layout(
      'Reset your password',
      `<p>We received a request to reset your PropReel password. This link expires in 1 hour.</p>
       <p>If you didn't request this, you can safely ignore this email.</p>`,
      { url: resetUrl, label: 'Choose a new password' }
    ),
    text: `Reset your PropReel password: ${resetUrl} (expires in 1 hour)`,
  };
}

/**
 * Sent when someone submits SIGN-UP for an address that already has a
 * confirmed account. The API answers the caller with an indistinguishable
 * "check your email" (anti-enumeration, L-2) — this mail is the only place
 * the real outcome is revealed, and only to the mailbox owner.
 */
export function accountExistsTemplate(loginUrl: string, resetUrl: string): { subject: string; html: string; text: string } {
  return {
    subject: 'You already have a PropReel account',
    html: layout(
      'You already have an account',
      `<p>Someone (hopefully you) tried to sign up for PropReel with this email address, but an account already exists.</p>
       <p>If it was you, just sign in — or set a new password if you've forgotten it. If it wasn't you, no action is needed: nothing about your account has changed.</p>`,
      { url: loginUrl, label: 'Sign in to PropReel' }
    ),
    text: `You already have a PropReel account. Sign in: ${loginUrl} — or set a new password: ${resetUrl}`,
  };
}

/**
 * Daily trial reminder — sent by the 9am cron while a temporary account's
 * 7-day clock is still ticking. Copy nudges the one conversion action:
 * subscribe before the deadline or the account is deleted.
 */
export function trialReminderTemplate(
  name: string,
  daysLeft: number,
  expiresAtIso: string,
  upgradeUrl: string
): { subject: string; html: string; text: string } {
  const first = (name || '').split(' ')[0] || 'there';
  const expires = new Date(expiresAtIso).toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg',
  });
  const urgency = daysLeft <= 1;
  const subject = urgency
    ? 'Last day of your PropReel trial — subscribe to keep your account'
    : `${daysLeft} days left on your PropReel trial`;
  return {
    subject,
    html: layout(
      urgency ? 'Your trial ends today' : `${daysLeft} days left on your trial`,
      `<p>Hi ${first} — your PropReel temporary account has <b>${daysLeft} day${daysLeft === 1 ? '' : 's'}</b> remaining (expires <b>${expires}</b>).</p>
       <p>Your ${SIGNUP_BONUS_CREDITS} test credits are still in your balance. Subscribe to a plan before the deadline and everything carries over — projects, branding and credits. After expiry the account is removed.</p>`,
      { url: upgradeUrl, label: 'Choose a plan' }
    ),
    text: `Hi ${first} — your PropReel trial has ${daysLeft} day${daysLeft === 1 ? '' : 's'} left (expires ${expires}). Subscribe to keep your account: ${upgradeUrl}`,
  };
}

/**
 * One-shot email when the nightly sweep soft-deletes an unconverted trial
 * (day 7). Tells them the account is locked, data is kept for 30 days, and
 * how to reactivate by subscribing.
 */
export function trialEndedTemplate(
  name: string,
  loginUrl: string
): { subject: string; html: string; text: string } {
  const first = (name || '').split(' ')[0] || 'there';
  return {
    subject: 'Your PropReel trial has ended',
    html: layout(
      'Your trial has ended',
      `<p>Hi ${first} — your 7-day PropReel trial has ended, so your temporary account is now locked.</p>
       <p>Good news: your projects, branding and credits are kept for 30 days. Sign in, choose a plan and everything is restored exactly as you left it. After 30 days the account and its data are permanently deleted.</p>`,
      { url: loginUrl, label: 'Sign in & subscribe' }
    ),
    text: `Hi ${first} — your PropReel trial has ended. Your account is locked but kept for 30 days. Sign in and choose a plan to restore it: ${loginUrl}`,
  };
}

const SIGNUP_BONUS_CREDITS = 5;

/**
 * Monthly Profit & Loss report — emailed by the 1st-of-month cron after the
 * books close. Carries the headline P&L numbers, every analyst insight and a
 * CTA to the pinned statement PDF (also attached by the caller).
 */
export function pnlReportTemplate(
  report: PnlReport,
  pdfUrl: string
): { subject: string; html: string; text: string } {
  const s = report.statement;
  const money = (n: number) =>
    `R${(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const margin = s.margin.cash !== null ? `${(s.margin.cash * 100).toFixed(1)}%` : 'n/a';

  const subject = `PropReel P&L — ${s.monthLabel}: revenue ${money(s.revenue.total)}, net ${money(s.net.cash)}`;

  const kpiRow = (label: string, value: string) =>
    `<tr><td style="padding:7px 0;color:#9a9ab8;border-bottom:1px solid #262643">${label}</td>` +
    `<td align="right" style="padding:7px 0;color:#ffffff;font-weight:bold;border-bottom:1px solid #262643">${value}</td></tr>`;
  const rows = [
    kpiRow('Revenue (cash collected)', money(s.revenue.total)),
    kpiRow('Operating expenses', money(s.expenses.total)),
    kpiRow('Net profit (cash basis)', money(s.net.cash)),
    kpiRow('Cash margin', margin),
    kpiRow('Credits consumed (recognised)', `${s.usage.creditsConsumed.toLocaleString('en-ZA')} cr ≈ ${money(s.usage.recognizedRevenue)}`),
    kpiRow('Net profit (usage basis)', money(s.net.usage)),
    kpiRow('Paying customers', String(report.metrics.payingCustomers)),
    kpiRow('Active subscribers', String(report.subscribers.active)),
  ].join('');

  const bullets = report.insights.map(i => `<li style="margin:7px 0">${i}</li>`).join('');
  const status = s.inProgress
    ? 'month in progress — figures are month-to-date'
    : 'final — books closed for this month';

  const html = layout(
    `P&amp;L statement — ${s.monthLabel}`,
    `<p>Monthly profit &amp; loss for <b>${s.monthLabel}</b> (${status}). Month boundaries SAST; all amounts in ZAR.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:#0f0f1e;border:1px solid #262643;border-radius:10px;padding:6px 16px">${rows}</table>
     <p style="margin:20px 0 6px;font-size:12px;color:#9a9ab8;text-transform:uppercase;letter-spacing:1px">Analyst notes</p>
     <ul style="margin:0;padding-left:18px">${bullets}</ul>`,
    { url: pdfUrl, label: 'Open the PDF statement' }
  );

  const text = [
    `PropReel P&L — ${s.monthLabel} (${status})`,
    `Revenue: ${money(s.revenue.total)} | Expenses: ${money(s.expenses.total)} | Net (cash): ${money(s.net.cash)} (${margin})`,
    `Credits consumed: ${s.usage.creditsConsumed.toLocaleString('en-ZA')} cr ≈ ${money(s.usage.recognizedRevenue)} | Net (usage): ${money(s.net.usage)}`,
    '',
    ...report.insights.map(i => `- ${i}`),
    '',
    `PDF: ${pdfUrl}`,
  ].join('\n');

  return { subject, html, text };
}

/**
 * Upcoming subscription billing notice — sent a few days before Paystack
 * charges the subscriber's saved card for a new cycle. The money line stays
 * short: a free/active agent only needs WHAT and WHEN (amount, date, plan),
 * not a ledger dump. Managed subscriptions use the sub code reference so
 * support can tie it to a Paystack subscription.
 */
export function upcomingBillingTemplate(rows: {
  fullName: string;
  planLabel: string;
  amountZar: number;
  chargeDateLabel: string;
  cycleLabel: string;
  manageUrl: string;
}): { subject: string; html: string; text: string } {
  const first = rows.fullName.split(' ')[0] || 'there';
  const money = `R${rows.amountZar.toLocaleString('en-ZA')}`;
  const subject = `PropReel billing reminder — ${money} on ${rows.chargeDateLabel}`;

  const html = layout(
    'Your monthly billing reminder',
    `<p>Hi ${first} — a friendly heads-up before your plan renews.</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;background:#0f0f1e;border:1px solid #262643;border-radius:10px;padding:6px 16px">
       <tr><td style="padding:7px 0;color:#9a9ab8">Plan</td><td align="right" style="padding:7px 0;color:#fff;font-weight:bold">${rows.planLabel} (${rows.cycleLabel})</td></tr>
       <tr><td style="padding:7px 0;color:#9a9ab8">Amount</td><td align="right" style="padding:7px 0;color:#fff;font-weight:bold">${money}</td></tr>
       <tr><td style="padding:7px 0;color:#9a9ab8">Card charged on</td><td align="right" style="padding:7px 0;color:#fff;font-weight:bold">${rows.chargeDateLabel}</td></tr>
     </table>
     <p style="color:#9a9ab8">Your saved card is charged automatically by Paystack — no action needed if you're happy. Your credits renew with the cycle and expire 30 days after they're granted, FIFO.</p>`,
    { url: rows.manageUrl, label: 'Manage your subscription' }
  );

  const text = [
    `Hi ${first} — your PropReel plan renews soon.`,
    `Plan: ${rows.planLabel} (${rows.cycleLabel})`,
    `Amount: ${money}`,
    `Card charged on: ${rows.chargeDateLabel}`,
    `Your saved card is charged automatically by Paystack — no action needed.`,
    `Manage: ${rows.manageUrl}`,
  ].join('\n');

  return { subject, html, text };
}

/**
 * Payment-failed notice — fired by the dunning sweep when a month's charge
 * could not be collected. Offers the one-click fix (add a card) that dunning
 * already retries automatically on day 1/3/7/14.
 */
export function paymentFailedTemplate(rows: {
  fullName: string;
  planLabel: string;
  amountZar: number;
  daysUnpaid: number;
  manageUrl: string;
}): { subject: string; html: string; text: string } {
  const first = rows.fullName.split(' ')[0] || 'there';
  const money = `R${rows.amountZar.toLocaleString('en-ZA')}`;
  const day = Math.max(1, Math.round(rows.daysUnpaid));
  const subject = `PropReel payment failed — R${money.slice(1)} needs a card update (day ${day})`;
  const html = layout(
    'Payment failed — update your card',
    `<p>Hi ${first} — your ${rows.planLabel} renewal of <b>${money}</b> could not be collected (attempt day ${day}).</p>
     <p>We retry automatically on day 1, 3, 7, 14 and 21. Add or swap a card before then to keep your plan and credits active — no action means the plan is cancelled after day 21.</p>`,
    { url: rows.manageUrl, label: 'Update my card' }
  );
  const text = [
    `Hi ${first} — your PropReel ${rows.planLabel} renewal of ${money} could not be collected (day ${day}).`,
    `We retry automatically on days 1/3/7/14/21; after day 21 the plan is cancelled.`,
    `Update your card: ${rows.manageUrl}`,
  ].join('\n');
  return { subject, html, text };
}
