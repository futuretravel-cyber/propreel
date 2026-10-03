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
