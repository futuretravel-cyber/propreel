import { VercelRequest, VercelResponse } from '@vercel/node';
import { putItem, getItem, TABLES } from '../lib/db';
import { getUser, updateUser, addCredits, getUserByEmail } from '../lib/userService';

/**
 * Unified growth/leads endpoint (Hobby plan has a 12-function limit).
 * Routes on ?action= :
 *   demo     — anonymous homepage demo-render lead capture (1/IP/day)
 *   referral — credit the referrer when a new referred user signs up
 */

const REFERRAL_BONUS_CREDITS = 20;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = (req.query.action as string) || '';

  try {
    // ── POST /api/leads?action=demo ─────────────────────────────────
    if (action === 'demo') {
      const { listing_url, email } = req.body || {};

      if (!listing_url || typeof listing_url !== 'string' || listing_url.length > 500) {
        return res.status(400).json({ error: 'A valid listing URL is required' });
      }
      const url = listing_url.trim();
      if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'URL must start with http:// or https://' });
      }

      // Rate limit: 1 per IP per day (best-effort; shared IPs may collide)
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      const today = new Date().toISOString().slice(0, 10);
      const limitKey = `demo-limit-${ip}-${today}`;

      const existing = await getItem<{ id: string; count: number }>(TABLES.SETTINGS, { id: limitKey });
      if (existing && existing.count >= 1) {
        return res.status(429).json({
          error: 'You have already used your free preview today. Create an account for 5 free credits!',
        });
      }
      await putItem(TABLES.SETTINGS, {
        id: limitKey,
        count: (existing?.count || 0) + 1,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });

      const leadId = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await putItem(TABLES.SETTINGS, {
        id: leadId,
        type: 'demo_lead',
        listingUrl: url,
        email: email || null,
        ip,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      console.log(`Demo render lead captured: ${leadId} for ${url}`);
      return res.status(202).json({
        success: true,
        message: 'Request received — your watermarked preview is being prepared.',
        leadId,
      });
    }

    // ── POST /api/leads?action=referral ─────────────────────────────
    if (action === 'referral') {
      const { referrer, newUserId, newUserEmail } = req.body || {};

      if (!referrer || !newUserId) {
        return res.status(400).json({ error: 'referrer and newUserId are required' });
      }

      let referrerUser = await getUser(referrer);
      if (!referrerUser && typeof referrer === 'string' && referrer.includes('@')) {
        referrerUser = await getUserByEmail(referrer.toLowerCase());
      }
      if (!referrerUser) {
        return res.status(404).json({ error: 'Referrer not found' });
      }

      const newUser = await getUser(newUserId);
      if (!newUser) {
        return res.status(404).json({ error: 'New user not found' });
      }
      if ((newUser as any).referralRedeemed) {
        return res.status(200).json({ success: true, alreadyRedeemed: true });
      }

      await updateUser(newUserId, { referralRedeemed: true, referredBy: referrerUser.id } as any);
      await addCredits(
        referrerUser.id,
        REFERRAL_BONUS_CREDITS,
        'bonus',
        `Referral bonus — ${newUserEmail || newUser.email} joined via your invite`,
        { kind: 'referral', newUserId }
      );

      return res.status(200).json({
        success: true,
        creditsGranted: REFERRAL_BONUS_CREDITS,
        referrerEmail: referrerUser.email,
      });
    }

    return res.status(404).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('Leads endpoint error:', error);
    return res.status(500).json({ error: 'Failed to process request' });
  }
}
