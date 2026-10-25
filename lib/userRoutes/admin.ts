/**
 * /api/users — platform admin + ops domain.
 *
 * Admin-only stats / user list / ledger / ops reports, API-key propagation
 * (Vercel env + Modal secrets), P&L, image presets, update mode and the
 * admin action log. Dispatched from api/users.ts.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { TABLES, scanItems } from '../../lib/db';
import { getSessionUser, getTokenFromRequest, requireAdminSession, isAdminEmail } from '../../lib/auth';
import { workerTokenHeaders } from '../../lib/workerToken';
import { getMaintenanceState, setMaintenanceState } from '../../lib/maintenance';
import { signS3Url, toEdgeUrl } from '../../lib/s3Urls';
import { SERVICE_KEYS, ALL_FIELD_NAMES } from '../../lib/serviceKeys';

// ── Admin → API Keys propagation (consolidated into this function: the
// Hobby plan caps a deployment at 12 serverless functions). GET returns
// per-var configuration status (existence only, never values); POST
// upserts the Vercel project env (+ production redeploy) and the matching
// Modal secret via the worker's bearer-gated /admin/secret route.
// Values are pass-through only — never persisted, logged, or re-returned.
const VERCEL_API = 'https://api.vercel.com';
const WORKER_URL = () =>
  (process.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run').replace(/\/$/, '');

async function vercelFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN is not configured');
  const team = process.env.VERCEL_TEAM_ID ? `teamId=${process.env.VERCEL_TEAM_ID}` : '';
  return fetch(`${VERCEL_API}${path}${path.includes('?') ? '&' : '?'}${team}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

async function upsertVercelEnv(key: string, value: string): Promise<'created' | 'updated'> {
  const listRes = await vercelFetch(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/env`);
  if (!listRes.ok) throw new Error(`Vercel env list failed: ${listRes.status} ${(await listRes.text()).slice(0, 200)}`);
  const { envs } = (await listRes.json()) as { envs: Array<{ id: string; key: string; target?: string[] }> };
  const existing = envs.find(e => e.key === key);
  if (existing) {
    const patch = await vercelFetch(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/env/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
    if (!patch.ok) throw new Error(`Vercel env patch failed: ${patch.status} ${(await patch.text()).slice(0, 200)}`);
    return 'updated';
  }
  const create = await vercelFetch(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/env`, {
    method: 'POST',
    body: JSON.stringify({ key, value, target: ['production', 'preview', 'development'] }),
  });
  if (!create.ok) throw new Error(`Vercel env create failed: ${create.status} ${(await create.text()).slice(0, 200)}`);
  return 'created';
}

async function updateModalSecret(name: string, envDict: Record<string, string>): Promise<{ ok: boolean; via?: string; error?: string }> {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return { ok: false, error: 'ADMIN_API_KEY not configured' };
  try {
    const res = await fetch(`${WORKER_URL()}/admin/secret`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, env_dict: envDict }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as any)?.detail || `worker ${res.status}` };
    return { ok: true, via: (data as any)?.via };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'worker unreachable' };
  }
}

async function triggerProductionRedeploy(): Promise<{ ok: boolean; url?: string; error?: string }> {
  const id = process.env.VERCEL_PROJECT_ID;
  const projRes = await vercelFetch(`/v9/projects/${id}`);
  if (!projRes.ok) return { ok: false, error: `project lookup failed: ${projRes.status}` };
  const { name } = (await projRes.json()) as { name: string };
  const res = await vercelFetch('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({ name, target: ['production'] }),
  });
  if (!res.ok) return { ok: false, error: `redeploy failed: ${res.status} ${(await res.text()).slice(0, 200)}` };
  const data = (await res.json()) as { url?: string; id?: string };
  return { ok: true, url: data.url || data.id };
}

export async function adminApiKeysRoute(req: VercelRequest, res: VercelResponse) {
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

  if (req.method === 'GET') {
    const envPresence: Record<string, boolean> = {};
    for (const f of ALL_FIELD_NAMES) envPresence[f] = !!process.env[f];
    return res.status(200).json({
      success: true,
      services: SERVICE_KEYS.map(s => ({ id: s.id, label: s.label, blurb: s.blurb, fields: s.fields.map(f => ({ name: f.name, label: f.label })) })),
      configured: envPresence,
      plumbing: {
        vercelToken: !!process.env.VERCEL_TOKEN,
        projectId: !!process.env.VERCEL_PROJECT_ID,
        adminApiKey: !!process.env.ADMIN_API_KEY,
      },
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { service_id, values, redeploy } = (req.body || {}) as {
    service_id?: string; values?: Record<string, string>; redeploy?: boolean;
  };
  const spec = SERVICE_KEYS.find(s => s.id === service_id);
  if (!spec) return res.status(400).json({ error: `Unknown service: ${service_id}` });
  const clean: Record<string, string> = {};
  for (const f of spec.fields) {
    const v = values?.[f.name];
    if (typeof v === 'string' && v.trim()) clean[f.name] = v.trim();
  }
  if (!Object.keys(clean).length) return res.status(400).json({ error: 'No values supplied' });
  for (const k of Object.keys(clean)) {
    if (!spec.fields.some(f => f.name === k && ALL_FIELD_NAMES.includes(k))) {
      return res.status(400).json({ error: `Field not allowed for this service: ${k}` });
    }
  }

  const vercel: Array<{ key: string; result?: string; error?: string }> = [];
  const vercelFields = spec.fields.filter(f => f.vercelEnv && clean[f.name]);
  if (vercelFields.length && !process.env.VERCEL_TOKEN) {
    for (const f of vercelFields) vercel.push({ key: f.name, error: 'VERCEL_TOKEN not configured' });
  } else {
    for (const f of vercelFields) {
      try {
        vercel.push({ key: f.name, result: await upsertVercelEnv(f.name, clean[f.name]) });
      } catch (e: any) {
        vercel.push({ key: f.name, error: e?.message || 'failed' });
      }
    }
  }

  const modal: Array<{ secret: string; ok: boolean; via?: string; error?: string }> = [];
  const groups = new Map<string, Record<string, string>>();
  for (const f of spec.fields) {
    if (f.modalSecret && clean[f.name]) {
      const g = groups.get(f.modalSecret) || {};
      g[f.name] = clean[f.name];
      groups.set(f.modalSecret, g);
    }
  }
  for (const [secretName, envDict] of groups) {
    modal.push({ secret: secretName, ...(await updateModalSecret(secretName, envDict)) });
  }

  let redeployResult: { ok: boolean; url?: string; error?: string } | null = null;
  const vercelOk = vercel.some(v => v.result);
  if (redeploy !== false && vercelOk) {
    redeployResult = await triggerProductionRedeploy().catch((e: any) => ({ ok: false, error: e?.message || 'redeploy failed' }));
  }

  // Security audit 2026-10-25 (L-1): this response used to echo the submitted
  // secret values back as copyable `envLines` — contradicting the "never
  // re-returned" rule above. Values are write-only now: the admin panel
  // composes the .env block locally from its own form state. Only the KEY
  // names go back over the wire.
  return res.status(200).json({
    success: vercel.every(v => !v.error) && modal.every(m => m.ok),
    vercel,
    modal,
    redeploy: redeployResult,
    updatedKeys: Object.keys(clean),
  });
}


/**
 * Nested route: GET /api/users?action=admin_stats — real platform stats.
 * Admin-only (server-side email check). Counts come from DynamoDB directly.
 */
export async function adminStats(req: VercelRequest, res: VercelResponse) {
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

  // scanAll pages past the 1 MB scan window (scanItems stops at the first
  // page), so these counts stay exact as the tables grow.
  const { scanAll } = await import('../../lib/db');
  const users = await scanAll<any>(TABLES.USERS, { maxItems: 5000 });
  const projects = await scanAll<any>(TABLES.PROJECTS, { maxItems: 5000 });

  const creditsSpent = users.reduce((s: number, u: any) => s + Math.max(0, (u.totalSpent ?? 0)), 0);
  const activeUsers = users.filter((u: any) =>
    u.updatedAt && (Date.now() - new Date(u.updatedAt).getTime()) < 30 * 86400000
  ).length;

  // ── AI render activity (last 30d): counts, credits, durations ────────
  // Derived from the real credit ledger (every render deducts credits with
  // metadata) plus measured talking-head runtime stored on project records.
  const txns = await scanAll<any>(TABLES.CREDIT_TRANSACTIONS, { maxItems: 20000 });
  const since = Date.now() - 30 * 86400000;
  const video = { renders: 0, credits: 0, plannedSeconds: 0 };
  const flashhead = { renders: 0, credits: 0, measuredSeconds: 0 };
  const imageEdits = { edits: 0, credits: 0 };
  const dailyMap = new Map<string, { videoRenders: number; videoCredits: number; flashheadRenders: number; flashheadCredits: number; imageEdits: number; imageCredits: number }>();
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const ts = Date.parse(t.createdAt || '');
    if (Number.isNaN(ts) || ts < since) continue;
    const desc = String(t.description || '');
    const isVideo = /video generation/i.test(desc);
    const isFlash = /flashhead/i.test(desc);
    const isImage = /image edit/i.test(desc);
    if (!isVideo && !isFlash && !isImage) continue;
    const day = new Date(ts).toISOString().slice(0, 10);
    const bucket = dailyMap.get(day) || { videoRenders: 0, videoCredits: 0, flashheadRenders: 0, flashheadCredits: 0, imageEdits: 0, imageCredits: 0 };
    const credits = Math.abs(Number(t.amount));
    if (isVideo) {
      video.renders += 1;
      video.credits += credits;
      video.plannedSeconds += Number(t.metadata?.duration) || 0;
      bucket.videoRenders += 1;
      bucket.videoCredits += credits;
    } else if (isImage) {
      imageEdits.edits += 1;
      imageEdits.credits += credits;
      bucket.imageEdits += 1;
      bucket.imageCredits += credits;
    } else {
      flashhead.renders += 1;
      flashhead.credits += credits;
      bucket.flashheadRenders += 1;
      bucket.flashheadCredits += credits;
    }
    dailyMap.set(day, bucket);
  }
  // Talking-head runtime: measured by the worker (ffprobe) and persisted on
  // project records when the client polls to completion.
  flashhead.measuredSeconds = projects
    .filter((p: any) => p.kind === 'FLASHHEAD' && p.durationSeconds)
    .reduce((s: number, p: any) => s + Number(p.durationSeconds), 0);

  const daily: Array<{ date: string; videoRenders: number; videoCredits: number; flashheadRenders: number; flashheadCredits: number; imageEdits: number; imageCredits: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const b = dailyMap.get(day) || { videoRenders: 0, videoCredits: 0, flashheadRenders: 0, flashheadCredits: 0, imageEdits: 0, imageCredits: 0 };
    daily.push({ date: day.slice(5), ...b });
  }

  return res.status(200).json({
    success: true,
    stats: {
      userCount: users.length,
      activeUsers,
      agencyCount: new Set(users.map((u: any) => u.agencyId).filter(Boolean)).size,
      projectCount: projects.length,
      readyReels: projects.filter((p: any) => p.status === 'READY').length,
      processingReels: projects.filter((p: any) => p.status === 'PROCESSING').length,
      failedReels: projects.filter((p: any) => p.status === 'FAILED').length,
      creditsSpent,
    },
    renderMetrics: {
      windowDays: 30,
      video,
      flashhead,
      imageEdits,
      daily,
    },
  });
}


/**
 * Nested route: GET /api/users?action=list_users — real user list (admin-only).
 *
 * Besides the profile basics it returns each account's subscription and
 * billing state (subscription row, trial/dunning/pending-upgrade flags,
 * whether a card is on file) — the read half of the admin panel's
 * subscription viewer/editor; the write half is
 * POST /api/subscriptions?action=admin_set_subscription.
 */
export async function listUsers(req: VercelRequest, res: VercelResponse) {
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });
  const { scanAll } = await import('../../lib/db');
  const users = await scanAll<any>(TABLES.USERS, { maxItems: 5000 });
  // Only return safe fields
  const safe = users.map((u: any) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role || 'AGENT',
    credits: u.credits ?? 0,
    planId: u.planId || null,
    // Subscription + billing state (admin-only route, see header comment)
    subscription: u.subscription || null,
    trialExpiresAt: u.trialExpiresAt || null,
    trialEndedAt: u.trialEndedAt || null,
    paymentFailure: u.paymentFailure || null,
    pendingPlanUpgrade: u.pendingPlanUpgrade || null,
    hasCard: Boolean(u.paystackAuthorizationCode),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    // AI-notice ack as it stands on the row — version + timestamp for the
    // admin user detail view (non-secret; safeUser returns them too)
    aiNoticeAckVersion: u.aiNoticeAckVersion || null,
    aiNoticeAckAt: u.aiNoticeAckAt || null,
  }));
  safe.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return res.status(200).json({ success: true, users: safe });
}


/**
 * Nested route: GET /api/users?action=admin_ledger — platform-wide credit
 * ledger (admin-only). Powers the audit-log view in the dashboard.
 */
export async function adminLedger(req: VercelRequest, res: VercelResponse) {
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

  const { scanAll } = await import('../../lib/db');
  const limit = Math.min(500, Math.max(10, parseInt(req.query.limit as string) || 150));
  const typeFilter = (req.query.type as string) || '';

  const txns = await scanAll<any>(TABLES.CREDIT_TRANSACTIONS, { maxItems: 20000 });
  // Hide internal index rows (idx_<eventId> dedupe helpers)
  let rows = txns.filter((t: any) => t.type !== 'event_index');
  if (typeFilter) rows = rows.filter((t: any) => t.type === typeFilter);
  rows.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  rows = rows.slice(0, limit);

  // Resolve emails for display
  const users = await scanAll<any>(TABLES.USERS, { maxItems: 5000 });
  const emailById = new Map<string, string>(users.map((u: any) => [u.id, u.email]));

  return res.status(200).json({
    success: true,
    count: rows.length,
    transactions: rows.map((t: any) => ({
      id: t.id,
      userId: t.userId,
      userEmail: emailById.get(t.userId) || null,
      amount: t.amount,
      type: t.type,
      description: t.description,
      eventId: t.eventId || null,
      pool: t.metadata?.pool || null,
      // Acting admin on support-written rows (e.g. admin_set_subscription)
      by: t.metadata?.by || null,
      createdAt: t.createdAt,
    })),
  });
}


/**
 * Nested route: GET /api/users?action=admin_narakeet_usage&days=30 —
 * ops report: Narakeet voiceover minutes consumed per render (admin only).
 *
 * Sums `narakeet_seconds` — the billed audio duration the worker records on
 * every completed video job status (jobs/{id}.json, retention-exempt so the
 * history persists). Records predating the field are counted as
 * `unmeasured` rather than silently reported as zero spend.
 */
export async function adminNarakeetUsage(req: VercelRequest, res: VercelResponse) {
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

  const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  // Newest N job records read — bounds the Vercel runtime on busy windows.
  const FETCH_CAP = 400;
  // Narakeet's published pay-as-you-go rate (~$0.20 per synthesized minute).
  const USD_PER_MINUTE = 0.2;

  const { s3 } = await import('../../lib/mediaRetention');
  const { ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await s3();
  const bucket = process.env.AWS_S3_OUTPUT_BUCKET || 'propreel-video-outputs-sa';

  // List jobs/ (keys + timestamps only), keep top-level status files inside
  // the window; nested jobs/claims/ and jobs/health/ are never job records.
  const candidates: { key: string; when: Date }[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'jobs/',
      ContinuationToken: token,
      MaxKeys: 1000,
    }));
    for (const o of page.Contents || []) {
      const key = o.Key || '';
      if (!/^jobs\/[^/]+\.json$/.test(key)) continue;
      if (!o.LastModified || o.LastModified.getTime() < cutoff) continue;
      candidates.push({ key, when: o.LastModified });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  candidates.sort((a, b) => b.when.getTime() - a.when.getTime());
  const toFetch = candidates.slice(0, FETCH_CAP);

  const totals = { videoJobs: 0, withNarration: 0, withoutNarration: 0, unmeasured: 0, seconds: 0 };
  const byLang = new Map<string, { renders: number; seconds: number }>();
  const recent: any[] = [];

  for (let i = 0; i < toFetch.length; i += 25) {
    const batch = toFetch.slice(i, i + 25);
    const docs = await Promise.all(batch.map(async c => {
      try {
        const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: c.key }));
        const text = await obj.Body!.transformToString();
        return { c, doc: JSON.parse(text) as any };
      } catch {
        return { c, doc: null as any };
      }
    }));

    for (const { c, doc } of docs) {
      if (!doc) continue;
      const id = String(doc.record_id || c.key.slice('jobs/'.length, -'.json'.length));
      // Classify video jobs; image-edit and other job files carry no
      // voiceover and are excluded entirely.
      const kind = doc.kind === 'flashhead' || id.startsWith('fh_') ? 'flashhead'
        : doc.kind === 'render' || id.startsWith('pr_') ? 'render'
        : null;
      if (!kind) continue;

      totals.videoJobs += 1;
      const secs = typeof doc.narakeet_seconds === 'number' ? doc.narakeet_seconds : null;
      if (secs === null) {
        totals.unmeasured += 1;
      } else {
        totals.seconds += secs;
        if (secs > 0) {
          totals.withNarration += 1;
          const lang = String(doc.narakeet_language || 'unknown');
          const row = byLang.get(lang) || { renders: 0, seconds: 0 };
          row.renders += 1;
          row.seconds += secs;
          byLang.set(lang, row);
        } else {
          totals.withoutNarration += 1;
        }
      }

      if (recent.length < 50) {
        recent.push({
          id,
          kind,
          status: String(doc.status || 'unknown'),
          when: c.when.toISOString(),
          tier: doc.tier || null,
          language: doc.narakeet_language || null,
          voice: doc.narakeet_voice || null,
          seconds: secs,
        });
      }
    }
  }

  const minutes = Math.round((totals.seconds / 60) * 10) / 10;
  return res.status(200).json({
    success: true,
    days,
    cutoffIso: new Date(cutoff).toISOString(),
    listed: candidates.length,
    fetched: toFetch.length,
    totals: {
      ...totals,
      seconds: Math.round(totals.seconds * 10) / 10,
      minutes,
      estCostUsd: Math.round(minutes * USD_PER_MINUTE * 100) / 100,
    },
    usdPerMinute: USD_PER_MINUTE,
    byLanguage: [...byLang.entries()]
      .map(([language, v]) => ({ language, renders: v.renders, minutes: Math.round((v.seconds / 60) * 10) / 10 }))
      .sort((a, b) => b.minutes - a.minutes),
    recent,
  });
}

/**
 * Nested route: GET /api/users?action=image_presets — the full AI prompt
 * library (prompt + negative-prompt text) for the admin Prompts viewer.
 * Admin session required. The text itself never ships in the public JS
 * bundle and the browser never calls the worker for it: this handler
 * proxies the worker's /get_image_presets server-side with the shared HMAC
 * token, so the only public surface is a same-origin, session-gated read.
 */
let promptsCache: { at: number; presets: unknown } | null = null;


export async function imagePresets(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getSessionUser(getTokenFromRequest(req));
  if (!user) return res.status(401).json({ error: 'Sign in required' });
  if (!(user.role === 'ADMIN' || isAdminEmail(user.email))) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // The library only changes when the worker is redeployed — cache per instance.
  if (promptsCache && Date.now() - promptsCache.at < 10 * 60_000) {
    return res.status(200).json({ success: true, presets: promptsCache.presets });
  }

  const workerUrl = process.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const upstream = await fetch(`${workerUrl}/get_image_presets`, {
      headers: workerTokenHeaders(),
      signal: ctrl.signal,
    });
    if (!upstream.ok) {
      console.error(`image_presets upstream failed: ${upstream.status}`);
      return res.status(502).json({ error: 'Prompt library unavailable' });
    }
    const presets = await upstream.json();
    promptsCache = { at: Date.now(), presets };
    return res.status(200).json({ success: true, presets });
  } catch (e) {
    console.error('image_presets proxy error:', e);
    return res.status(502).json({ error: 'Prompt library unavailable' });
  } finally {
    clearTimeout(timer);
  }
}


/**
 * Nested route: GET/POST /api/users?action=pln_* — monthly Profit & Loss
 * statement for the admin dashboard (admin-only, Hobby-cap consolidation).
 *   GET  pln_get            &month=YYYY-MM → statement + 12-month series + analyst insights
 *   POST pln_expense_add    {month, label, category, amount, note?}
 *   POST pln_expense_delete {month, itemId}
 *   GET  pln_pdf            &month=YYYY-MM → downloadable P&L PDF (S3 URL)
 */
export async function pnlRoutes(req: VercelRequest, res: VercelResponse, action: string) {
  const body = (req.body || {}) as any;
  const gate = await requireAdminSession(req);
  if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

  const { isMonthKey, buildPnlReport, loadPnlSnapshot, addPnlExpense, deletePnlExpense, generatePnlPdf, EXPENSE_CATEGORIES } =
    await import('../../lib/pnl');

  const month = String(req.query.month || body.month || '').trim();
  if (!isMonthKey(month)) {
    return res.status(400).json({ error: 'month must be YYYY-MM' });
  }

  try {
    if (action === 'pln_get' && req.method === 'GET') {
      // Finalized months serve their frozen snapshot — instant, and immune
      // to the ledger scan window as history grows.
      const snapshot = await loadPnlSnapshot(month);
      if (snapshot) {
        return res.status(200).json({
          success: true,
          ...snapshot.report,
          finalized: true,
          finalizedAt: snapshot.finalizedAt,
          pdfUrl: snapshot.pdfUrl,
        });
      }
      const report = await buildPnlReport(month);
      return res.status(200).json({ success: true, ...report, finalized: false });
    }

    if (action === 'pln_expense_add' && req.method === 'POST') {
      const label = String(body.label || '').trim().slice(0, 120);
      const amount = Math.round(Number(body.amount) * 100) / 100;
      const category = String(body.category || 'Other');
      if (!label || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'label and a positive amount are required' });
      }
      const safeCategory = (EXPENSE_CATEGORIES as readonly string[]).includes(category) ? category : 'Other';
      const item = await addPnlExpense(month, {
        label,
        category: safeCategory,
        amount,
        note: String(body.note || '').trim().slice(0, 300) || undefined,
      });
      return res.status(201).json({ success: true, item });
    }

    if (action === 'pln_expense_delete' && req.method === 'POST') {
      const itemId = String(body.itemId || '');
      if (!itemId) return res.status(400).json({ error: 'itemId is required' });
      const removed = await deletePnlExpense(month, itemId);
      return res.status(200).json({ success: removed });
    }

    if (action === 'pln_pdf' && req.method === 'GET') {
      const { url, instant } = await generatePnlPdf(month);
      // Buckets are private (M-5): the browser opens this link straight
      // after the click, so a 15-minute presigned URL is plenty and never
      // outlives the admin's own download.
      const { signS3Url, toEdgeUrl } = await import('../../lib/s3Urls');
      return res.status(200).json({ success: true, url: toEdgeUrl((await signS3Url(url, 900)) || url), instant });
    }

    return res.status(404).json({ error: `Unknown P&L action: ${action}` });
  } catch (err) {
    console.error('P&L error:', err);
    return res.status(500).json({ error: 'P&L request failed' });
  }
}


export async function maintenanceRoute(req: VercelRequest, res: VercelResponse) {
  // ── ?action=maintenance — site Update Mode state ────────────────────
  // GET: public — the browser boot gate shows the maintenance page even
  // pre-login. POST: admin-session-only { enabled, message }.
  if (req.query.action === 'maintenance') {
    if (req.method === 'GET') {
      const state = await getMaintenanceState();
      return res.status(200).json({ success: true, ...state });
    }
    if (req.method === 'POST') {
      const gate = await requireAdminSession(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });
      const { enabled, message } = req.body || {};
      const state = await setMaintenanceState(
        !!enabled,
        typeof message === 'string' ? message.slice(0, 300) : undefined,
      );
      console.log(`Update mode ${state.enabled ? 'ENABLED' : 'disabled'} by ${gate.user.email}`);
      // Admin audit trail (audit §11) — update-mode toggles are site-wide and
      // belong in the queryable log. Best-effort, never blocks the toggle.
      const { recordAdminAction } = await import('../../lib/adminAudit');
      await recordAdminAction({
        by: gate.user.email,
        action: 'UPDATE_MODE',
        target: 'site',
        detail: `Update mode ${state.enabled ? 'ENABLED' : 'disabled'}${typeof message === 'string' && message ? ` — ${message.slice(0, 120)}` : ''}`,
      });
      return res.status(200).json({ success: true, ...state });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

export async function adminAuditLog(req: VercelRequest, res: VercelResponse) {
  // ── GET ?action=admin_audit_log — the platform admin action log ─────
  // Credit grants, subscription/role changes, review moderation and
  // update-mode toggles (audit §11), admin-session-only like every other
  // admin route.
  if (req.query.action === 'admin_audit_log' && req.method === 'GET') {
    const gate = await requireAdminSession(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });
    try {
      const { listAdminActions } = await import('../../lib/adminAudit');
      const events = await listAdminActions(200);
      return res.status(200).json({ events, generatedAt: new Date().toISOString() });
    } catch (e) {
      console.error('admin_audit_log failed:', e);
      return res.status(500).json({ error: 'Could not load the admin audit log — try again' });
    }
  }
}
