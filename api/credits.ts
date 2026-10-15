import { VercelRequest, VercelResponse } from '@vercel/node';
import { addCredits, deductCredits, getUser, getCreditReport, getUserByEmail, transferCredits, refundDeduction, REFUND_SCOPES } from '../lib/userService';
import { jobCredits } from '../lib/renderPricing';
import { requireOwner, requireAdminSession, sessionUser, isAdminActor } from '../lib/auth';
import { getMaintenanceState } from '../lib/maintenance';

/**
 * Unified credits endpoint (Hobby plan has a 12-function limit).
 * Routes on ?action= : add (ADMIN) | refund | deduct | transfer | gift_email | report
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
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const days = parseInt(period) || 30;
      const report = await getCreditReport(userId, days);

      return res.status(200).json({
        success: true,
        period,
        current_balance: report.currentBalance,
        total_credits_used: report.totalUsed,
        total_credits_purchased: report.totalPurchased,
        transaction_count: report.transactions.length,
        transactions: report.transactions.slice(0, 100),
      });
    }

    // ── POST /api/credits?action=add ──── ADMIN-ONLY, 'bonus' ONLY ───
    // This used to gate on requireOwner(user_id) — i.e. "the caller may add
    // credits to their OWN account" — which let any signed-in user mint
    // unlimited credits as 'refund', 'bonus' or 'purchase'. Client-initiated
    // refunds now run through ?action=refund (verified against the ledger);
    // purchase/subscription credits are minted server-side by the Paystack
    // paths; the only browser caller left is the admin grant button.
    if (req.method === 'POST' && action === 'add') {
      const gate = await requireAdminSession(req);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const { user_id, amount, source, description, metadata, expires_at } = req.body;
      if (!user_id || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid request parameters' });
      }
      if (source !== 'bonus') {
        return res.status(403).json({ error: 'Admin grants are limited to source "bonus"' });
      }

      const result = await addCredits(
        user_id,
        amount,
        source,
        description || 'Credit addition',
        metadata,
        expires_at
      );

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
      const { user_id, scope } = req.body || {};
      if (!user_id || !scope) {
        return res.status(400).json({ error: 'user_id and scope are required' });
      }
      if (!REFUND_SCOPES.includes(scope)) {
        return res.status(400).json({ error: 'Unknown refund scope' });
      }
      const gate = await requireOwner(req, user_id);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

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
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      // ── Server-priced kinds: the client cannot choose the amount ─────
      // Product calls are minted (job_token, renderPricing-priced). This
      // endpoint keeps working for them ONLY at the server's own price — a
      // modified client deducting differently gets a 400, never a ledger
      // row (the renderPricing import is the same table UI shows).
      const kind = String(metadata?.kind || '');
      if (kind === 'PROPERTY_DESCRIPTION' || kind === 'SOCIAL_POST') {
        const expected = jobCredits(kind === 'PROPERTY_DESCRIPTION' ? 'description' : 'social_post');
        if (expected == null || amount !== expected) {
          return res.status(400).json({
            error: `This charge is priced server-side — the client cannot choose the amount`,
            expected,
          });
        }
      }

      // pool='agency' spends the shared agency pool instead of the personal
      // balance (the client sends this for preset-tier render features).
      // Per-agent monthly caps are enforced inside deductCredits.
      const result = await deductCredits(user_id, amount, reason || 'Credit deduction', metadata, pool === 'agency' ? 'agency' : 'personal');

      if (!result.success) {
        const isLimit = (result.error || '').includes('Monthly credit limit reached');
        return res.status(isLimit ? 402 : 400).json({
          error: result.error || 'Failed to deduct credits',
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
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      if (from_user_id === to_user_id) {
        return res.status(400).json({ error: 'Cannot transfer to yourself' });
      }

      const fromUser = await getUser(from_user_id);
      const toUser = await getUser(to_user_id);

      if (!fromUser) {
        return res.status(404).json({ error: 'Sender not found' });
      }
      if (!toUser) {
        return res.status(404).json({ error: 'Recipient not found' });
      }
      if (fromUser.credits < amount) {
        return res.status(400).json({
          error: 'Insufficient credits',
          current_balance: fromUser.credits,
          required: amount,
        });
      }

      // Atomic on the sender (conditional decrement); two linked TRANSFER
      // ledger rows are written by transferCredits.
      const result = await transferCredits(from_user_id, to_user_id, amount, reason || 'Credit transfer');
      if (!result.success) {
        return res.status(400).json({ error: result.error });
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
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const fromUser = await getUser(from_user_id);
      if (!fromUser) return res.status(404).json({ error: 'Sender not found' });
      if (fromUser.credits < amount) {
        return res.status(400).json({
          error: 'Insufficient credits',
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
