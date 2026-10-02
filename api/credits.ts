import { VercelRequest, VercelResponse } from '@vercel/node';
import { addCredits, deductCredits, getUser, getCreditReport, getUserByEmail, transferCredits } from '../lib/userService';

/**
 * Unified credits endpoint (Hobby plan has a 12-function limit).
 * Routes on ?action= : add | deduct | transfer | gift_email | report
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';

  try {
    // ── GET /api/credits?action=report&user_id=…&period=… ──────────
    if (req.method === 'GET' && action === 'report') {
      const userId = req.query.user_id as string;
      const period = (req.query.period as string) || '30d';

      if (!userId) {
        return res.status(400).json({ error: 'user_id is required' });
      }

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

    // ── POST /api/credits?action=add ───────────────────────────────
    if (req.method === 'POST' && action === 'add') {
      const { user_id, amount, source, description, metadata, expires_at } = req.body;

      if (!user_id || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid request parameters' });
      }

      if (!source || !['purchase', 'bonus', 'gift', 'refund', 'subscription'].includes(source)) {
        return res.status(400).json({ error: 'Invalid source type' });
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

    // ── POST /api/credits?action=deduct ────────────────────────────
    if (req.method === 'POST' && action === 'deduct') {
      const { user_id, amount, reason, metadata, pool } = req.body;

      if (!user_id || !amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid request parameters' });
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
