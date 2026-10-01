import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, updateUser, getUserByEmail } from '../lib/userService';

// Admin accounts receive 1000 credits on first sign-in (spec doc)
const ADMIN_EMAILS = ['futuretravel@gmail.com', 'ulric@propreel.co.za'];
const ADMIN_GRANT_CREDITS = 1000;

/**
 * GET    /api/users?email=xxx   → find user by email
 * GET    /api/users?id=xxx      → get user by id
 * POST   /api/users             → create or update user after OAuth/signup
 *
 * Body (POST):
 *   supabaseUserId, email, fullName, role?, agencyName?, planId?, cycle?
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const { id, email } = req.query as { id?: string; email?: string };

    if (!id && !email) {
      return res.status(400).json({ error: 'Provide ?id= or ?email=' });
    }

    try {
      const user = id ? await getUser(id) : await getUserByEmail(String(email).toLowerCase());
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.status(200).json(user);
    } catch (error) {
      console.error('Get user error:', error);
      return res.status(500).json({ error: 'Failed to get user' });
    }
  }

  if (req.method === 'POST') {
    const {
      supabaseUserId,
      email,
      fullName,
      role = 'AGENT',
      agencyName = null,
      planId = null,
      cycle = 'MONTHLY',
    } = req.body || {};

    if (!email || !fullName) {
      return res.status(400).json({ error: 'Missing email or fullName' });
    }

    try {
      const normalizedEmail = String(email).toLowerCase();

      // Existing user → update profile fields
      const existing = await getUserByEmail(normalizedEmail);
      if (existing) {
        const updates: Record<string, any> = { fullName, email: normalizedEmail };
        if (supabaseUserId) updates.supabaseUserId = supabaseUserId;
        if (agencyName) updates.agencyName = agencyName;
        await updateUser(existing.id, updates);
        const updated = await getUser(existing.id);
        return res.status(200).json({ success: true, user: updated, created: false });
      }

      // New user → create with signup bonus
      const now = new Date().toISOString();
      const newUser = {
        email: normalizedEmail,
        fullName,
        role,
        credits: 0, // signup bonus credited separately by /api/credits/add
        creditExpiries: [],
        subscription: null,
        autoTopup: { enabled: false, threshold: 50, amount: 200 },
        agencyId: null,
        agencyName,
        avatarUrl: null,
        emailVerified: false,
        lastLowCreditWarnedAt: null,
        supabaseUserId: supabaseUserId || undefined,
        notificationPreferences: {
          emailNotifications: true,
          pushNotifications: true,
          renderComplete: true,
          lowCredits: true,
          newFeatures: true,
          billingAlerts: true,
          marketingEmails: false,
        },
        planId,
        cycle,
        createdAt: now,
        updatedAt: now,
      } as any;

      const created = await import('../lib/userService').then(m => m.createUser(newUser));

      // Grant 5-credit signup bonus (best effort)
      try {
        const { addCredits } = await import('../lib/userService');
        const bonusExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await addCredits(
          created.id,
          5,
          'bonus',
          'Signup bonus — welcome to PropReel!',
          { kind: 'signup_bonus' },
          bonusExpiry
        );

        // Admin accounts: 1000 credits, no expiry (spec doc)
        const email = normalizedEmail.toLowerCase();
        if (ADMIN_EMAILS.includes(email)) {
          try {
            await addCredits(
              created.id,
              ADMIN_GRANT_CREDITS,
              'bonus',
              'Admin account allocation',
              { kind: 'admin_grant' }
            );
            await updateUser(created.id, { role: 'ADMIN' } as any);
          } catch (adminErr) {
            console.error('Admin credit grant error:', adminErr);
          }
        }

        const withBonus = await getUser(created.id);
        return res.status(201).json({ success: true, user: withBonus || created, created: true });
      } catch (bonusError) {
        console.error('Signup bonus error:', bonusError);
        return res.status(201).json({ success: true, user: created, created: true });
      }
    } catch (error) {
      console.error('Create user error:', error);
      return res.status(500).json({ error: 'Failed to create user' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
