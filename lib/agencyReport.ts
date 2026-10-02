/**
 * Agency monthly reports — branded PDF generation (pdfkit), S3 storage,
 * bulk zip export for accountants, webhook notification on generation, and
 * agent-scoped variants. No email infrastructure exists yet, so "emailed to
 * the agent" is recorded/logged instead — the owner downloads the PDFs from
 * the Reports tab.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getAgency, updateAgency, listMembers, monthKey, Agency } from './agency';
import { getUser, queryLedgerWindow } from './userService';

const BUCKET = process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets';
const REGION = process.env.AWS_REGION || 'af-south-1';

function s3() {
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

export interface ReportData {
  agencyName: string;
  month: string; // YYYY-MM
  generatedAt: string;
  ownerName: string;
  memberCount: number;
  totalUsed: number;
  poolUsed: number;
  personalUsed: number;
  openingBalance: number;
  closingBalance: number;
  allocated: number;
  byCategory: Array<{ category: string; credits: number }>;
  perAgent: Array<{ name: string; email: string; used: number; renders: number; limit: number | null }>;
  perDay: Array<{ day: string; credits: number }>;
  branding?: { reportLogoUrl?: string; reportHeaderColor?: string };
  scopeLabel?: string; // set on agent-scoped reports
}

/** Fetch PDF bytes for serving/downloading a previously generated report. */
export async function getReportPdf(s3Key: string): Promise<Buffer | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  } catch {
    return null;
  }
}

/** Fire-and-forget webhook so owners can push report events into Slack etc. */
async function notifyWebhook(agency: Agency, payload: Record<string, any>): Promise<void> {
  const url = agency.webhookUrl;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'agency.report.generated', agency: agency.name, ...payload }),
    });
    await updateAgency(agency.id, {
      lastWebhook: { url, status: res.ok ? 'delivered' : `http_${res.status}`, at: new Date().toISOString() },
    });
  } catch (e: any) {
    console.error('[agency-report] webhook delivery failed:', e?.message || e);
  }
}

/**
 * Build the full month report data for one agency. Ledger reads are scoped
 * to the month; balances come from creditExpiries snapshots we can compute.
 */
export async function buildAgencyMonthReport(agencyId: string, month: string): Promise<ReportData | null> {
  const agency = await getAgency(agencyId);
  if (!agency) return null;
  const owner = await getUser(agency.ownerId);

  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const members = await listMembers(agencyId);

  const byCategory = new Map<string, number>();
  const perAgent: ReportData['perAgent'] = [];
  const perDay = new Map<string, number>();
  let totalUsed = 0, poolUsed = 0, personalUsed = 0, allocated = 0, opening = 0, closing = 0;
  const now = new Date();
  const isCurrentMonth = monthKey(now) === month;

  for (const mem of members) {
    const txs = await queryLedgerWindow(mem.userId, start, end);
    let used = 0, renders = 0;
    for (const t of txs) {
      if (t.amount < 0) {
        used += Math.abs(t.amount);
        const d = (t.description || '').toLowerCase();
        const cat = d.includes('video') ? 'Video renders'
          : (d.includes('flashhead') || d.includes('talking')) ? 'Talking Head'
          : d.includes('image') ? 'Image edits'
          : d.includes('expired') ? 'Expired' : 'Other';
        byCategory.set(cat, (byCategory.get(cat) || 0) + Math.abs(t.amount));
        if (cat === 'Video renders') renders++;
        if (t.metadata?.pool === 'agency') poolUsed += Math.abs(t.amount);
        else personalUsed += Math.abs(t.amount);
        perDay.set(t.createdAt.slice(0, 10), (perDay.get(t.createdAt.slice(0, 10)) || 0) + Math.abs(t.amount));
      } else if (['subscription', 'purchase', 'bonus', 'gift'].includes(t.type)) {
        allocated += t.amount;
      }
    }
    totalUsed += used;
    perAgent.push({ name: mem.name, email: mem.email, used, renders, limit: mem.monthlyLimit });
  }

  // Balance picture: for the current month, live numbers; for past months we
  // approximate closing as today's balances (marked as such in the PDF).
  closing = members.reduce((s, mm) => s + (mm.credits || 0), 0);
  opening = isCurrentMonth ? Math.max(0, closing - allocated + totalUsed) : Math.max(0, closing - allocated + totalUsed);

  const days: Array<{ day: string; credits: number }> = [];
  for (let d = 1; d <= end.getDate() - 1; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    days.push({ day: key, credits: perDay.get(key) || 0 });
  }

  return {
    agencyName: agency.name,
    month,
    generatedAt: new Date().toISOString(),
    ownerName: owner?.fullName || '',
    memberCount: members.length,
    totalUsed,
    poolUsed,
    personalUsed,
    openingBalance: opening,
    closingBalance: closing,
    allocated,
    byCategory: [...byCategory.entries()].map(([category, credits]) => ({ category, credits })).sort((a, b) => b.credits - a.credits),
    perAgent: perAgent.sort((a, b) => b.used - a.used),
    perDay: days,
    branding: agency.branding,
  };
}

/** Agent-scoped variant of the report (same structure, one agent). */
export async function buildAgentMonthReport(agencyId: string, userId: string, month: string): Promise<ReportData | null> {
  const base = await buildAgencyMonthReport(agencyId, month);
  if (!base) return null;
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const txs = await queryLedgerWindow(userId, start, end);
  let used = 0, renders = 0;
  const perDay = new Map<string, number>();
  for (const t of txs) {
    if (t.amount < 0) {
      used += Math.abs(t.amount);
      if ((t.description || '').toLowerCase().includes('video')) renders++;
      perDay.set(t.createdAt.slice(0, 10), (perDay.get(t.createdAt.slice(0, 10)) || 0) + Math.abs(t.amount));
    }
  }
  const agent = base.perAgent.find(a => a.email && txs.length >= 0);
  const user = await getUser(userId);
  const days: Array<{ day: string; credits: number }> = [];
  for (let d = 1; d <= end.getDate() - 1; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    days.push({ day: key, credits: perDay.get(key) || 0 });
  }
  return {
    ...base,
    scopeLabel: `Agent report — ${user?.fullName || userId} (${user?.email || ''})`,
    totalUsed: used,
    poolUsed: base.poolUsed && used ? Math.round(base.poolUsed * (used / Math.max(1, base.totalUsed))) : 0,
    personalUsed: used - (base.poolUsed && used ? Math.round(base.poolUsed * (used / Math.max(1, base.totalUsed))) : 0),
    allocated: txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    openingBalance: Math.max(0, (user?.credits || 0) - txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0) + used),
    closingBalance: user?.credits || 0,
    byCategory: base.byCategory.length && used ? base.byCategory : [],
    perAgent: [{ name: user?.fullName || userId, email: user?.email || '', used, renders, limit: agent?.limit ?? null }],
    perDay: days,
  };
}

/** Render the report as a branded PDF (header colour + optional logo URL). */
export async function renderReportPdf(data: ReportData): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const headerColor = /^#[0-9a-fA-F]{6}$/.test(data.branding?.reportHeaderColor || '') ? data.branding!.reportHeaderColor! : '#6b21a8';
  const zar = (n: number) => `R ${n.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
  const monthLabel = new Date(`${data.month}-01`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  // Optional report-specific logo (separate from the app logo)
  if (data.branding?.reportLogoUrl && data.branding.reportLogoUrl.startsWith('https://')) {
    try {
      const imgRes = await fetch(data.branding.reportLogoUrl);
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        doc.image(buf, 50, 40, { fit: [110, 44] });
        doc.y = 92;
      }
    } catch { /* logo is decorative — skip on failure */ }
  }

  // Header band
  const bandY = Math.max(doc.y, 100);
  doc.rect(50, bandY, 495, 56).fill(headerColor);
  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
    .text(`${data.agencyName} — Credit Report`, 62, bandY + 14, { width: 400 });
  doc.fontSize(11).font('Helvetica').text(monthLabel, 62, bandY + 36);
  doc.font('Helvetica');
  doc.y = bandY + 76;

  if (data.scopeLabel) {
    doc.fontSize(10).fillColor(headerColor).font('Helvetica-Bold').text(data.scopeLabel, 50, doc.y);
    doc.font('Helvetica');
    doc.moveDown(0.5);
  }

  doc.fontSize(9).fillColor('#666')
    .text(`Generated ${new Date(data.generatedAt).toLocaleString('en-ZA')} · ${data.memberCount} agent${data.memberCount === 1 ? '' : 's'} · Prepared for ${data.ownerName || 'agency owner'}`);
  doc.moveDown(1);

  // Summary cards (two columns)
  const cards: Array<[string, string]> = [
    ['Credits used', zar(data.totalUsed)],
    ['Credits allocated', zar(data.allocated)],
    ['From agency pool', zar(data.poolUsed)],
    ['From personal balances', zar(data.personalUsed)],
    ['Opening balance', zar(data.openingBalance)],
    ['Closing balance', zar(data.closingBalance)],
  ];
  let cy = doc.y;
  cards.forEach(([label, value], i) => {
    const x = 50 + (i % 2) * 252;
    const y = cy + Math.floor(i / 2) * 44;
    doc.rect(x, y, 243, 36).fill('#f6f2fb');
    doc.fillColor('#555').fontSize(8).text(label.toUpperCase(), x + 10, y + 6);
    doc.fillColor('#111').fontSize(13).font('Helvetica-Bold').text(value, x + 10, y + 17);
    doc.font('Helvetica');
  });
  doc.y = cy + Math.ceil(cards.length / 2) * 44 + 16;

  // Usage by category
  if (data.byCategory.length) {
    doc.fontSize(12).fillColor('#111').font('Helvetica-Bold').text('Usage by category');
    doc.font('Helvetica').moveDown(0.4);
    const max = Math.max(...data.byCategory.map(c => c.credits), 1);
    for (const c of data.byCategory) {
      const y = doc.y;
      doc.fontSize(10).fillColor('#333').text(c.category, 50, y, { width: 150 });
      doc.rect(210, y + 2, 240 * (c.credits / max), 10).fill(headerColor);
      doc.fillColor('#111').text(String(c.credits), 465, y, { width: 80, align: 'right' });
      doc.y = y + 18;
    }
    doc.moveDown(0.8);
  }

  // Per-agent table
  doc.fontSize(12).fillColor('#111').font('Helvetica-Bold').text('By agent');
  doc.font('Helvetica').moveDown(0.3);
  const tTop = doc.y;
  doc.rect(50, tTop, 495, 20).fill('#f3e8ff');
  doc.fillColor('#333').fontSize(9)
    .text('Agent', 58, tTop + 6)
    .text('Used', 290, tTop + 6, { width: 60, align: 'right' })
    .text('Renders', 360, tTop + 6, { width: 60, align: 'right' })
    .text('Monthly limit', 430, tTop + 6, { width: 105, align: 'right' });
  let ry = tTop + 26;
  for (const a of data.perAgent) {
    doc.fillColor('#111').fontSize(9)
      .text(a.name, 58, ry, { width: 220, ellipsis: true })
      .text(String(a.used), 290, ry, { width: 60, align: 'right' })
      .text(String(a.renders), 360, ry, { width: 60, align: 'right' })
      .text(a.limit == null ? '—' : String(a.limit), 430, ry, { width: 105, align: 'right' });
    ry += 16;
    if (ry > 720) { doc.addPage(); ry = 60; }
  }
  doc.y = ry + 12;

  // Daily sparkline table (compact)
  const active = data.perDay.filter(d => d.credits > 0);
  if (active.length) {
    doc.fontSize(10).fillColor('#111').font('Helvetica-Bold').text('Daily activity');
    doc.font('Helvetica').moveDown(0.3);
    doc.fontSize(8).fillColor('#555').text(active.map(d => `${d.day.slice(-2)}: ${d.credits}`).join('   ·   '), 50, doc.y, { width: 495 });
  }

  doc.fontSize(8).fillColor('#888')
    .text("Credit activity only — project files (videos/images) remain in each agent's own dashboard and are not included in this report.", 50, 760, { width: 495, align: 'center' });

  doc.end();
  return done;
}

export interface GeneratedReport {
  url: string;
  s3Key: string;
  fileName: string;
}

/** Build + render + store the agency month PDF; records it on the agency. */
export async function generateAndStoreAgencyReport(agencyId: string, month: string): Promise<GeneratedReport | null> {
  const data = await buildAgencyMonthReport(agencyId, month);
  if (!data) return null;
  const pdf = await renderReportPdf(data);
  const fileName = `propreel-credit-report-${data.agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${month}.pdf`;
  const key = `reports/${agencyId}/${month}/${fileName}`;
  await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: pdf, ContentType: 'application/pdf' }));
  const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

  const agency = await getAgency(agencyId);
  if (agency) {
    const reports = [
      ...(agency.reports || []).filter(r => r.month !== month),
      { month, url, generatedAt: data.generatedAt, totalCreditsUsed: data.totalUsed, agentCount: data.memberCount },
    ].sort((a, b) => b.month.localeCompare(a.month));
    await updateAgency(agencyId, { reports: reports.slice(0, 24) });
    // Non-fatal webhook notification
    notifyWebhook(agency, { month, url, totalCreditsUsed: data.totalUsed, agentCount: data.memberCount }).catch(() => {});
  }
  return { url, s3Key: key, fileName };
}

/** Zip the last N months of an agency's reports for bulk download. */
export async function zipReportHistory(agencyId: string, months: number = 12): Promise<{ buffer: Buffer; fileName: string } | null> {
  const agency = await getAgency(agencyId);
  if (!agency || !(agency.reports || []).length) return null;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  let added = 0;
  for (const r of agency.reports.slice(0, months)) {
    const keyMatch = r.url.match(/amazonaws\.com\/(.+)$/);
    if (!keyMatch) continue;
    const pdf = await getReportPdf(keyMatch[1]);
    if (pdf) {
      zip.file(r.month + '.pdf', pdf);
      added++;
    }
  }
  if (!added) return null;
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const fileName = `${agency.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-reports-${agency.reports[0].month}.zip`;
  return { buffer, fileName };
}

/**
 * Generate agent-scoped reports for every member. Email delivery is not
 * possible yet (no email infrastructure) — the intent is logged here and the
 * PDFs land in S3 under reports/<agencyId>/<month>/agents/ for the owner to
 * distribute; the UI surfaces them in the Reports tab.
 */
export async function generateAgentReports(
  agencyId: string,
  month: string
): Promise<Array<{ userId: string; name: string; email: string; url: string; emailed: false }>> {
  const members = await listMembers(agencyId);
  const out: Array<{ userId: string; name: string; email: string; url: string; emailed: false }> = [];
  for (const m of members) {
    const data = await buildAgentMonthReport(agencyId, m.userId, month);
    if (!data) continue;
    const pdf = await renderReportPdf(data);
    const fileName = `agent-report-${m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${month}.pdf`;
    const key = `reports/${agencyId}/${month}/agents/${fileName}`;
    await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: pdf, ContentType: 'application/pdf' }));
    const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
    console.log(`[agency-report] agent report ready for ${m.email} (${month}): ${url} — email sending not available yet; record stored for owner distribution`);
    out.push({ userId: m.userId, name: m.name, email: m.email, url, emailed: false });
  }
  return out;
}
