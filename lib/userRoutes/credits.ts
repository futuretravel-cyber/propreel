/**
 * /api/users — credit minting + billing documents domain.
 *
 * Worker token minting (the free v1 status token and the PAID single-use job
 * token — the charge happens here, priced by lib/renderPricing), the mint
 * quota that rate-limits it, and the session-gated invoice PDF streamer.
 * Dispatched from api/users.ts — the public route surface is unchanged.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { deductCredits } from '../../lib/userService';
import { TABLES, docClient } from '../../lib/db';
import { getSessionUser, getTokenFromRequest, requireOwner, sessionUser } from '../../lib/auth';
import { jobCredits, narrationSecondsForText, FLASHHEAD_MAX_SECONDS, NARRATION_WORDS_PER_SEC } from '../../lib/renderPricing';
import { normalizeJobScope, AVATAR_CHARGE_DESCRIPTION } from '../../lib/legacySchema';
import { createHash } from 'crypto';

// ── worker_token mint rate limit ──────────────────────────────────────────
// Fixed hourly window per key, tracked in DynamoDB (serverless instances are
// stateless, so in-process counters can't hold). Ceilings are deliberately
// generous: a browser tab re-mints ~once per 9 minutes (token cached in
// workerAuth.ts), so even a busy office NAT — ~10 agents × a couple of tabs
// ≈ 30–60 mints/hour — sits comfortably under 150, while scripted bulk
// minting from one host/account gets cut off.
const MINT_WINDOW_MS = 60 * 60 * 1000;
const MINT_LIMIT_PER_IP = 150;
const MINT_LIMIT_PER_USER = 40;

/**
 * Consume one unit from an hourly quota counter and report whether it is
 * still within `limit`. Fails OPEN: a DynamoDB error must never break token
 * minting (and therefore rendering) — it only logs.
 *
 * Fast path is an atomic ADD guarded by the window value, so parallel
 * scripted requests can't race a read-modify-write past the limit; the
 * conditional-reset branch runs at most once per window per key.
 */
export async function consumeMintQuota(
  scope: 'ip' | 'uid',
  value: string,
  limit: number
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const windowStart = Math.floor(Date.now() / MINT_WINDOW_MS) * MINT_WINDOW_MS;
  const id = `rlw_${scope}_${value}`;
  const nowIso = new Date().toISOString();
  const expiresAt = Math.floor((windowStart + MINT_WINDOW_MS) / 1000) + 7200;
  let count: number;
  try {
    try {
      const out = await docClient.send(new UpdateCommand({
        TableName: TABLES.SETTINGS,
        Key: { id },
        UpdateExpression: 'ADD #c :one SET #w = :w, updatedAt = :now, expiresAt = :exp',
        ConditionExpression: 'attribute_not_exists(#w) OR #w = :w',
        ExpressionAttributeNames: { '#c': 'count', '#w': 'windowStart' },
        ExpressionAttributeValues: { ':one': 1, ':w': windowStart, ':now': nowIso, ':exp': expiresAt },
        ReturnValues: 'ALL_NEW',
      }));
      count = Number(out.Attributes?.count ?? 1);
    } catch (e: any) {
      if (e?.name !== 'ConditionalCheckFailedException') throw e;
      // Window rolled since the row was written — start the new window at 1.
      const out = await docClient.send(new UpdateCommand({
        TableName: TABLES.SETTINGS,
        Key: { id },
        UpdateExpression: 'SET #c = :one, #w = :w, updatedAt = :now, expiresAt = :exp',
        ExpressionAttributeNames: { '#c': 'count', '#w': 'windowStart' },
        ExpressionAttributeValues: { ':one': 1, ':w': windowStart, ':now': nowIso, ':exp': expiresAt },
        ReturnValues: 'ALL_NEW',
      }));
      count = Number(out.Attributes?.count ?? 1);
    }
  } catch (e) {
    console.error('mint rate-limit check failed (failing open):', e);
    return { ok: true, retryAfterSec: 0 };
  }
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + MINT_WINDOW_MS - Date.now()) / 1000));
  return { ok: count <= limit, retryAfterSec };
}

function mintTooMany(res: VercelResponse, retryAfterSec: number) {
  res.setHeader('Retry-After', String(retryAfterSec));
  return res.status(429).json({
    ok: false,
    error: `Too many token requests — try again in ${Math.max(1, Math.ceil(retryAfterSec / 60))} minute(s)`,
    code: 'RATE_LIMITED',
    retryAfterSec,
  });
}

export async function invoicePdf(req: VercelRequest, res: VercelResponse) {
  // ── GET ?action=invoice_pdf&user_id=…&n=PR-… ─────────────────────────
  // Streams a stored invoice PDF through our own origin. Buckets are
  // private (M-5), and a session gate beats a long-lived signed link:
  // only the owner (or an admin) can fetch it, and the URL stops working
  // the moment it is forwarded or leaked.
  if (req.method === 'GET' && req.query.action === 'invoice_pdf') {
    const userId = String(req.query.user_id || '');
    const invoiceNumber = String(req.query.n || '');
    if (!userId || !/^PR-\d{8}-[A-Za-z0-9]{1,12}$/.test(invoiceNumber)) {
      return res.status(400).json({ error: 'Invalid invoice request' });
    }
    const gate = await requireOwner(req, userId);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });
    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: process.env.AWS_REGION || 'af-south-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });
      const obj = await s3.send(new GetObjectCommand({
        Bucket: process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets',
        Key: `invoices/${userId}/${invoiceNumber}.pdf`,
      }));
      const pdf = Buffer.from(await (obj.Body as any).transformToByteArray());
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${invoiceNumber}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).send(pdf);
    } catch (e: any) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      console.error('invoice_pdf failed:', e);
      return res.status(500).json({ error: 'Could not load the invoice' });
    }
  }
}

/**
 * Token minting (nested routes on /api/users).
 *   GET/POST worker_token — free short-lived HMAC token for the Modal render
 *   POST job_token        — PAID single-use token for exactly one worker job
 *
 * Split out of authRoutes (the mint QUOTA lives here too — this is where
 * credits are charged), same request/response contract as before.
 */
export async function tokenRoutes(req: VercelRequest, res: VercelResponse, action: string) {
  try {
    // ── GET/POST worker_token — short-lived HMAC token for the Modal render
    // worker (sent as X-PropReel-Token). Shared secret RENDER_API_TOKEN:
    // this endpoint signs "v1.<exp>.<uid>", the worker verifies signature and
    // a 10-minute expiry. Session is optional — anonymous callers get 'anon' —
    // but minting only ever happens through here, so the worker URL in the
    // public bundle is useless to direct scrapers.
    if (action === 'worker_token') {
      if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const secret = process.env.RENDER_API_TOKEN;
      if (!secret) return res.status(500).json({ error: 'RENDER_API_TOKEN is not configured' });

      // Rate limit before paying for session lookups. Per-IP first (bounds
      // anonymous harvesters), then per-user for signed-in callers.
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      const ipQuota = await consumeMintQuota('ip', ip, MINT_LIMIT_PER_IP);
      if (!ipQuota.ok) return mintTooMany(res, ipQuota.retryAfterSec);

      const { createHmac } = await import('crypto');
      const sessionUser = await getSessionUser(getTokenFromRequest(req));
      const uid = sessionUser?.id || 'anon';
      if (sessionUser) {
        const uidQuota = await consumeMintQuota('uid', uid, MINT_LIMIT_PER_USER);
        if (!uidQuota.ok) return mintTooMany(res, uidQuota.retryAfterSec);
      }
      const exp = Math.floor(Date.now() / 1000) + 600; // 10 minutes
      const msg = `v1.${exp}.${uid}`;
      const sig = createHmac('sha256', secret).update(msg).digest('base64url');
      return res.status(200).json({ token: `${msg}.${sig}`, expiresAt: exp * 1000 });
    }


    // ── POST job_token — PAID, single-use token for exactly one worker job ─
    // The worker refuses to start a render / image edit / avatar without one,
    // and refuses a second use of the same token (S3 conditional put claim),
    // so this mint is where the charge happens: the price comes from
    // lib/renderPricing — the browser no longer decides what a job costs, and
    // a modified client can neither render for free nor underpay. The generic
    // v1 token above stays free (status polls and cancels need no charge).
    if (action === 'job_token') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const secret = process.env.RENDER_API_TOKEN;
      if (!secret) return res.status(500).json({ error: 'RENDER_API_TOKEN is not configured' });

      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      const ipQuota = await consumeMintQuota('ip', ip, MINT_LIMIT_PER_IP);
      if (!ipQuota.ok) return mintTooMany(res, ipQuota.retryAfterSec);

      const payer = await getSessionUser(getTokenFromRequest(req));
      if (!payer) return res.status(401).json({ error: 'Sign in to start a paid job' });
      const uidQuota = await consumeMintQuota('uid', payer.id, MINT_LIMIT_PER_USER);
      if (!uidQuota.ok) return mintTooMany(res, uidQuota.retryAfterSec);

      const b = (req.body || {}) as any;
      // Canonical scope vocabulary (2026-10-27 avatar migration) — stale
      // cached bundles still mint scope 'flashhead'; ledger rows are written
      // with the canonical 'avatar' either way.
      const scope = normalizeJobScope(String(b.scope || ''));
      const voiceoverText = typeof b.voiceover_text === 'string' ? b.voiceover_text : String(b.metadata?.voiceover_text ?? '');

      // FlashHead is priced per 10s of narration (per lib/renderPricing), so
      // the script must travel with the mint: no text → legacy flat rate
      // fallback; text beyond the 90-second cap → a clear client error.
      let credits: number | null;
      let priceError: string | null = null;
      if (scope === 'avatar' && voiceoverText.trim()) {
        const seconds = narrationSecondsForText(voiceoverText);
        if (seconds > FLASHHEAD_MAX_SECONDS) {
          priceError =
            `This script is ~${Math.round(seconds)}s of narration — the cap is ${FLASHHEAD_MAX_SECONDS}s ` +
            `(~${Math.ceil(FLASHHEAD_MAX_SECONDS * NARRATION_WORDS_PER_SEC)} words). Shorten the voiceover and try again.`;
        }
      }
      credits = priceError ? null : jobCredits(scope, { tier: b.tier, configIndex: b.config_index, presetId: b.preset_id ?? b.metadata?.presetId, voiceover_text: b.voiceover_text, voiceoverText: b.metadata?.voiceover_text, duration: b.duration ?? b.metadata?.duration });
      if (credits == null) {
        return res.status(400).json({ ok: false, error: priceError || 'Unknown job scope or tier', code: priceError ? 'VALIDATION' : 'UNKNOWN_JOB' });
      }

      // Bind the token to the exact script it paid for (scope avatar):
      // a tampered client must not mint a token for a 10-word script and then
      // POST a 1,000-word one to the worker. The worker re-hashes the body's
      // voiceover_text and rejects a mismatch — the only honest route to a
      // new price is a fresh mint (a fresh charge).
      const scriptHash = scope === 'avatar' && voiceoverText.trim()
        ? createHash('sha256').update(voiceoverText.split(/\s+/).filter(Boolean).join(' ')).digest('hex').slice(0, 16)
        : undefined;

      // Same reasons/metadata the client-side deduct used to write, so the
      // ledger and the analytics that read it keep their shape.
      const reason =
        scope === 'render' ? 'Video generation'
        : scope === 'rerender' ? 'Clip re-render'
        : scope === 'avatar' ? AVATAR_CHARGE_DESCRIPTION
        : scope === 'script' ? 'AI Writer voiceover script'
        : scope === 'description' ? 'Property description'
        : scope === 'social_post' ? 'Social media post'
        : scope === 'social_pack' ? 'Social media pack (all platforms)'
        : `Image edit — ${b.preset_id || b.metadata?.presetId || 'custom'}`;
      // Ledger continuity: the description/social refund matchers (and the
      // analytics that read these rows) keyed on metadata.kind — keep writing
      // it even if a caller forgets to send it.
      const ledgerKind = scope === 'description' ? 'PROPERTY_DESCRIPTION' : scope === 'social_post' ? 'SOCIAL_POST' : scope === 'social_pack' ? 'SOCIAL_PACK' : null;
      // Legacy clients send metadata.kind 'FLASHHEAD' — canonical writes say
      // 'AVATAR' (2026-10-27 avatar schema migration).
      const rawMeta = { ...(b.metadata || {}) };
      if (String(rawMeta.kind || '').toUpperCase() === 'FLASHHEAD') rawMeta.kind = 'AVATAR';
      const metadata = { ...(ledgerKind ? { kind: ledgerKind } : {}), ...rawMeta, scope, ...(b.tier ? { tier: b.tier } : {}), ...(scope === 'avatar' && voiceoverText.trim() ? { narration_words: voiceoverText.split(/\s+/).filter(Boolean).length } : {}) };

      const { createHmac } = await import('crypto');
      const exp = Math.floor(Date.now() / 1000) + 600; // 10 minutes
      const result = await deductCredits(
        payer.id,
        credits,
        reason,
        metadata,
        b.pool === 'agency' ? 'agency' : 'personal'
      );
      if (!result.success) {
        const isLimit = result.code === 'MONTHLY_LIMIT_REACHED';
        return res.status(isLimit ? 402 : 400).json({
          ok: false,
          error: result.error || 'Failed to charge credits',
          code: result.code || 'INTERNAL',
          current_balance: result.newBalance,
          ...(isLimit ? { limit_reached: true } : {}),
        });
      }
      // v3 tokens carry the paid script's hash: msg = v3.<exp>.<uid>.<scope>.<hash>
      const msg = scriptHash
        ? `v3.${exp}.${payer.id}.${scope}.${scriptHash}`
        : `v2.${exp}.${payer.id}.${scope}`;
      const sig = createHmac('sha256', secret).update(msg).digest('base64url');
      return res.status(200).json({
        token: `${msg}.${sig}`,
        expiresAt: exp * 1000,
        scope,
        credits,
        new_balance: result.newBalance,
      });
    }

  } catch (error) {
    console.error(`Auth action ${action} error:`, error);
    return res.status(500).json({ error: 'Authentication request failed' });
  }
}
