import { VercelRequest, VercelResponse } from '@vercel/node';
import { addCredits, deductCredits, getUser, getCreditReport, getUserByEmail, transferCredits, refundDeduction, REFUND_SCOPES, getCreditTransactions, recordTransaction } from '../lib/userService';
import { normalizeJobScope } from '../lib/legacySchema';
import { jobCredits } from '../lib/renderPricing';
import { isTrialRunning, TRIAL_FREE_TRANSLATES } from '../lib/trial';
import { requireOwner, requireAdminSession, sessionUser, isAdminActor } from '../lib/auth';
import { getMaintenanceState } from '../lib/maintenance';

/**
 * Trial free-translate allowance (lib/trial.ts: TRIAL_FREE_TRANSLATES).
 * "Used" = every UNREVERSED translate consumption this account has made —
 * charged or free, both are kind TRANSLATE ledger rows — so the first 3 are
 * free while the trial runs and every one after that is the normal
 * TRANSLATE_CREDITS charge. A failed translate's refund writes the rfnd_
 * marker, which un-counts its row here: the allowance comes back instead of
 * burning a try on a call that produced nothing.
 */
async function translateTrialUsage(userId: string): Promise<{ used: number; remaining: number }> {
  const txns = await getCreditTransactions(userId, 500);
  const reversed = new Set(
    txns
      .filter(t => t.type === 'refund' && t.eventId?.startsWith('rfnd_'))
      .map(t => t.eventId!.slice('rfnd_'.length))
  );
  const used = txns.filter(
    t => t.type === 'deduction' && t.metadata?.kind === 'TRANSLATE' && !reversed.has(t.id)
  ).length;
  return { used, remaining: Math.max(0, TRIAL_FREE_TRANSLATES - used) };
}

/**
 * Unified credits endpoint (Hobby plan has a 12-function limit).
 * Routes on ?action= : add (ADMIN) | refund | deduct | transfer | gift_email | translate_quote | report
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';

  // Update-mode gate (mirror of the users.ts gate — lib/maintenance shares
  // the cached state so both functions answer identically): every credit
  // action — including ledger reads — is a 503 for non-admin sessions while
  // the Admin → Update Mode row is ON. Admin actions (gate e.g. `add`)
  // keep working so the admin can operate during the window.
  try {
    const maint = await getMaintenanceState();
    if (maint.enabled) {
      const actor = await sessionUser(req);
      if (!actor || !isAdminActor(actor)) {
        return res.status(503).json({ maintenance: true, error: maint.message, message: maint.message });
      }
    }
  } catch (e) {
    console.error('credit maintenance gate failed (fail-open):', e);
  }

  try {
    // ── GET /api/credits?action=report&user_id=…&period=… ──────────
    if (req.method === 'GET' && action === 'report') {
      const userId = req.query.user_id as string;
      const period = (req.query.period as string) || '30d';

      if (!userId) {
        return res.status(400).json({ error: 'user_id is required' });
      }
      const gate = await requireOwner(req, userId);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

      const days = parseInt(period) || 30;
      const report = await getCreditReport(userId, days);

      // Windowed sums over the FULL server-side set. The client only gets a
      // 100-row slice of `transactions`, so deriving these in the browser
      // undercounted — the sidebar's "used this month" disagreed with the
      // dashboard's "Credits Used" for the same 30 days.
      const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
      const used7d = report.transactions
        .filter(t => t.amount < 0 && Date.parse(t.createdAt) >= weekAgo)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      return res.status(200).json({
        success: true,
        period,
        current_balance: report.currentBalance,
        total_credits_used: report.totalUsed,
        total_credits_purchased: report.totalPurchased,
        used_7d: used7d,
        used_30d: report.totalUsed,
        transaction_count: report.transactions.length,
        // getCreditReport returns newest-first, so this cap keeps the most
        // recent 100 rows (on an ascending list it used to cut the newest).
        transactions: report.transactions.slice(0, 100),
      });
    }

    // ── GET /api/credits?action=translate_quote&user_id=… ─────────
    // What the NEXT Translate costs this account right now — the normal
    // price, or free while the trial's TRIAL_FREE_TRANSLATES allowance
    // lasts. The mismatch banner reads this BEFORE the click, so the cost is
    // always visible up front and the label flips the moment charging starts.
    if (req.method === 'GET' && action === 'translate_quote') {
      const userId = req.query.user_id as string;
      if (!userId) {
        return res.status(400).json({ error: 'user_id is required' });
      }
      const gate = await requireOwner(req, userId);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

      const user = await getUser(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const trialActive = isTrialRunning(user);
      const { remaining } = await translateTrialUsage(userId);
      return res.status(200).json({
        success: true,
        price: jobCredits('translate'),
        trial: trialActive,
        free_remaining: trialActive ? remaining : 0,
      });
    }

    // ── POST /api/credits?action=add ──── ADMIN-ONLY, 'bonus' ONLY ───
    // This used to gate on requireOwner(user_id) — i.e. "the caller may add
    // credits to their OWN account" — which let any signed-in user mint
    // unlimited credits as 'refund', 'bonus' or 'purchase'. Client-initiated
    // refunds now run through ?action=refund (verified against the ledger);
    // purchase/subscription credits are minted server-side by the Paystack
    // paths; the only browser caller left is the admin grant dialog
    // (AdminGiveCredits → Admin → Users → Give).
    if (req.method === 'POST' && action === 'add') {
      const gate = await requireAdminSession(req);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

      const { user_id, amount, source, description, metadata, expires_at } = req.body;
      // Whole positive credits only — a fractional, zero or negative amount
      // here is always a client bug or an abuse attempt, never a use case.
      if (!user_id || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
        return res.status(400).json({ error: 'amount must be a whole number of credits between 1 and 1000000' });
      }
      if (source !== 'bonus') {
        return res.status(403).json({ error: 'Admin grants are limited to source "bonus"' });
      }

      const result = await addCredits(
        user_id,
        amount,
        source,
        description || 'Credit addition',
        // Audit stamp mirrors admin_set_subscription's ADMIN_SUBSCRIPTION_CHANGE
        // row: which admin did it, server-derived — the client cannot forge it.
        { ...(metadata || {}), kind: 'ADMIN_CREDIT_GRANT', by: gate.user.email },
        expires_at
      );

      // Admin audit trail (audit §11) — server-derived actor, best-effort.
      const { recordAdminAction } = await import('../lib/adminAudit');
      await recordAdminAction({
        by: gate.user.email,
        action: 'CREDIT_GRANT',
        target: user_id,
        detail: `Granted ${amount} credits (${source})${description ? ` — ${description}` : ''}`,
      });

      return res.status(200).json({
        success: true,
        new_balance: result.newBalance,
        added: amount,
        source,
      });
    }

    // ── POST /api/credits?action=refund { user_id, scope } ──────────
    // Server-verified reversal: the client names a SCOPE, never an amount
    // or a source. The server finds the matching unreversed deduction in
    // the ledger and returns exactly its amount — at most once per charge
    // (event lock), so a refund can never exceed what was really charged.
    if (req.method === 'POST' && action === 'refund') {
      const { user_id } = req.body || {};
      // Legacy alias normalized (2026-10-27 avatar migration): stale cached
      // bundles still refund scope 'flashhead'.
      const scope = normalizeJobScope(String((req.body || {}).scope || ''));
      if (!user_id || !scope) {
        return res.status(400).json({ error: 'user_id and scope are required' });
      }
      if (!REFUND_SCOPES.includes(scope)) {
        return res.status(400).json({ error: 'Unknown refund scope' });
      }
      const gate = await requireOwner(req, user_id);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

      const result = await refundDeduction(user_id, scope);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Refund failed' });
      }
      return res.status(200).json({
        success: true,
        new_balance: result.newBalance,
        refunded: result.refunded,
        scope,
      });
    }

    // ── POST /api/credits?action=deduct ────────────────────────────
    if (req.method === 'POST' && action === 'deduct') {
      const { user_id, amount, reason, metadata, pool } = req.body;

      if (!user_id || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid request parameters' });
      }
      const gate = await requireOwner(req, user_id);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

      // ── Server-priced kinds: the client cannot choose the amount ─────
      // Product calls are minted (job_token, renderPricing-priced). This
      // endpoint keeps working for them ONLY at the server's own price — a
      // modified client deducting differently gets a 400, never a ledger
      // row (the renderPricing import is the same table UI shows).
      const kind = String(metadata?.kind || '');
      if (kind === 'PROPERTY_DESCRIPTION' || kind === 'SOCIAL_POST' || kind === 'SOCIAL_PACK' || kind === 'TRANSLATE') {
        const expected = jobCredits(kind === 'PROPERTY_DESCRIPTION' ? 'description' : kind === 'SOCIAL_PACK' ? 'social_pack' : kind === 'TRANSLATE' ? 'translate' : 'social_post');
        if (expected == null || amount !== expected) {
          return res.status(400).json({
            error: `This charge is priced server-side — the client cannot choose the amount`,
            expected,
          });
        }
      }

      // Translate: personal-balance only (never the agency pool), and a
      // running trial's first TRIAL_FREE_TRANSLATES translates are FREE —
      // the allowance is checked AFTER amount validation (a wrong price can
      // never consume one) and records a 0-amount consumption row instead of
      // touching the balance. That row counts toward the allowance and is
      // refundable as a no-op reversal when the call fails (refundDeduction).
      if (kind === 'TRANSLATE') {
        if (pool === 'agency') {
          return res.status(400).json({ error: 'Translate charges are personal-balance only' });
        }
        const user = await getUser(user_id);
        if (user && isTrialRunning(user)) {
          const { remaining } = await translateTrialUsage(user_id);
          if (remaining > 0) {
            await recordTransaction({
              userId: user_id,
              amount: 0,
              type: 'deduction',
              description: `Translate voiceover script (trial free — ${TRIAL_FREE_TRANSLATES - remaining + 1}/${TRIAL_FREE_TRANSLATES})`,
              metadata: { kind: 'TRANSLATE', trialFree: true, pool: 'personal' },
            });
            return res.status(200).json({
              success: true,
              free: true,
              free_remaining: remaining - 1,
              new_balance: user.credits,
              deducted: 0,
              reason,
            });
          }
        }
      }

      // pool='agency' spends the shared agency pool instead of the personal
      // balance (the client sends this for preset-tier render features).
      // Per-agent monthly caps are enforced inside deductCredits.
      const result = await deductCredits(user_id, amount, reason || 'Credit deduction', metadata, pool === 'agency' ? 'agency' : 'personal');

      if (!result.success) {
        const isLimit = result.code === 'MONTHLY_LIMIT_REACHED';
        return res.status(isLimit ? 402 : 400).json({
          ok: false,
          error: result.error || 'Failed to deduct credits',
          code: result.code || 'INTERNAL',
          current_balance: result.newBalance,
          ...(isLimit ? { limit_reached: true } : {}),
        });
      }

      return res.status(200).json({
        success: true,
        new_balance: result.newBalance,
        deducted: amount,
        reason,
      });
    }

    // ── POST /api/credits?action=transfer ──────────────────────────
    if (req.method === 'POST' && action === 'transfer') {
      const { from_user_id, to_user_id, amount, reason } = req.body;

      if (!from_user_id || !to_user_id || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid request parameters' });
      }
      const gate = await requireOwner(req, from_user_id);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

      if (from_user_id === to_user_id) {
        return res.status(400).json({ error: 'Cannot transfer to yourself' });
      }

      const fromUser = await getUser(from_user_id);
      const toUser = await getUser(to_user_id);

      if (!fromUser) {
        return res.status(404).json({ ok: false, error: 'Sender not found', code: 'NOT_FOUND' });
      }
      if (!toUser) {
        return res.status(404).json({ ok: false, error: 'Recipient not found', code: 'NOT_FOUND' });
      }
      if (fromUser.credits < amount) {
        return res.status(400).json({
          ok: false,
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          current_balance: fromUser.credits,
          required: amount,
        });
      }

      // Atomic on the sender (conditional decrement); two linked TRANSFER
      // ledger rows are written by transferCredits.
      const result = await transferCredits(from_user_id, to_user_id, amount, reason || 'Credit transfer');
      if (!result.success) {
        return res.status(400).json({ ok: false, error: result.error, code: result.code || 'INTERNAL' });
      }

      const receiver = await getUser(to_user_id);

      return res.status(200).json({
        success: true,
        from_user: {
          id: from_user_id,
          new_balance: result.newBalance,
        },
        to_user: {
          id: to_user_id,
          new_balance: receiver?.credits ?? toUser.credits + amount,
        },
        amount,
        reason,
      });
    }

    // ── POST /api/credits?action=gift_email ────────────────────────
    // Gift credits to a recipient addressed by EMAIL (the client never knows
    // the recipient's internal user id).
    if (req.method === 'POST' && action === 'gift_email') {
      const { from_user_id, to_email, amount, reason } = req.body;

      if (!from_user_id || !to_email || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid request parameters' });
      }
      const gate = await requireOwner(req, from_user_id);
      if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.error, code: gate.code });

      const fromUser = await getUser(from_user_id);
      if (!fromUser) return res.status(404).json({ ok: false, error: 'Sender not found', code: 'NOT_FOUND' });
      if (fromUser.credits < amount) {
        return res.status(400).json({
          ok: false,
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          current_balance: fromUser.credits,
          required: amount,
        });
      }

      const toUser = await getUserByEmail(String(to_email).toLowerCase());
      if (!toUser) return res.status(404).json({ error: 'No PropReel account found for that email' });
      if (toUser.id === from_user_id) {
        return res.status(400).json({ error: 'Cannot gift credits to yourself' });
      }

      // Atomic transfer: sender's deduct is conditional, receiver credit is
      // rolled back automatically if the recipient vanishes mid-transfer.
      const result = await transferCredits(from_user_id, toUser.id, amount, reason || `Credit gift from ${fromUser.email}`);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to gift credits' });
      }

      return res.status(200).json({
        success: true,
        to_email: toUser.email,
        new_balance: result.newBalance,
        amount,
      });
    }

    return res.status(404).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('Credits endpoint error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
