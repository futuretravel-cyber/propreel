import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, updateUser, getUserByEmail, deleteUser } from '../lib/userService';
import { TABLES, queryItems } from '../lib/db';
import { deleteItem } from '../lib/db-helpers';

// Admin accounts receive 1000 credits on first sign-in (spec doc)
const ADMIN_EMAILS = ['futuretravel@gmail.com', 'ulric@propreel.co.za'];
const ADMIN_GRANT_CREDITS = 1000;

// Default notification preferences applied to new users
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailNotifications: true,
  pushNotifications: true,
  renderComplete: true,
  lowCredits: true,
  newFeatures: true,
  billingAlerts: true,
  marketingEmails: false,
};

/**
 * Nested route: POST /api/users?action=delete — real account deletion.
 * Removes the DynamoDB user row, the user's projects, and the Supabase auth
 * identity (so the email can never sign in again). Credits are intentionally
 * forfeited per the deletion flow the user confirms in the UI.
 */
async function deleteAccount(req: VercelRequest, res: VercelResponse) {
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

  const user = await getUser(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // 1) Delete all of the user's projects
  try {
    const projects = await queryItems(TABLES.PROJECTS, { expression: 'userId = :u', values: { ':u': user_id } });
    for (const p of projects) {
      await deleteItem(TABLES.PROJECTS, { userId: user_id, id: (p as any).id });
    }
  } catch (e) {
    console.error('Project deletion error during account delete:', e);
  }

  // 2) Delete the DynamoDB user row
  await deleteUser(user_id);

  // 3) Delete the Supabase auth identity (requires service role key)
  try {
    if (user.supabaseUserId && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_URL) {
      const { createClient } = await import('@supabase/supabase-js');
      const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await admin.auth.admin.deleteUser(user.supabaseUserId);
      if (error) console.error('Supabase auth user deletion error:', error);
    }
  } catch (e) {
    console.error('Supabase deletion error:', e);
  }

  console.log(`Account deleted: ${user_id} (${user.email})`);
  return res.status(200).json({ success: true, message: 'Account permanently deleted' });
}

/**
 * Nested route: POST /api/users?action=update — whitelisted profile updates.
 */
async function updateUserFields(req: VercelRequest, res: VercelResponse) {
  const { user_id, updates } = req.body || {};
  if (!user_id || typeof updates !== 'object' || updates === null) {
    return res.status(400).json({ error: 'Missing user_id or updates' });
  }
  const user = await getUser(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Only allow safe, self-service fields through
  const allowed = [
    'fullName', 'phone', 'avatarUrl', 'agencyName',
    'autoTopup', 'notificationPreferences', 'businessProfile',
  ] as const;
  const clean: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) clean[key] = updates[key as keyof typeof updates];
  }
  if (Object.keys(clean).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  await updateUser(user_id, clean as any);
  const updated = await getUser(user_id);
  return res.status(200).json({ success: true, user: updated });
}

/**
 * Nested route: GET /api/users?action=admin_stats — real platform stats.
 * Admin-only (server-side email check). Counts come from DynamoDB directly.
 */
async function adminStats(req: VercelRequest, res: VercelResponse) {
  const email = String(req.query.email || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { scanItems } = await import('../lib/db');
  const users = await scanItems<any>(TABLES.USERS, { limit: 500 });
  const projects = await scanItems<any>(TABLES.PROJECTS, { limit: 1000 });

  const creditsSpent = users.reduce((s: number, u: any) => s + Math.max(0, (u.totalSpent ?? 0)), 0);
  const activeUsers = users.filter((u: any) =>
    u.updatedAt && (Date.now() - new Date(u.updatedAt).getTime()) < 30 * 86400000
  ).length;

  // ── AI render activity (last 30d): counts, credits, durations ────────
  // Derived from the real credit ledger (every render deducts credits with
  // metadata) plus measured talking-head runtime stored on project records.
  const txns = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { limit: 2000 });
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
 */
async function listUsers(req: VercelRequest, res: VercelResponse) {
  const email = String(req.query.email || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { scanItems } = await import('../lib/db');
  const users = await scanItems<any>(TABLES.USERS, { limit: 200 });
  // Only return safe fields
  const safe = users.map((u: any) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role || 'AGENT',
    credits: u.credits ?? 0,
    planId: u.planId || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));
  safe.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return res.status(200).json({ success: true, users: safe });
}

/**
 * Nested route: GET/POST /api/users?action=preferences (moved from the retired
 * /api/notifications/preferences function to stay under the Vercel Hobby cap).
 */
async function notificationPreferences(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const userId = req.query.user_id as string;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ success: true, preferences: user.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES });
  }
  if (req.method === 'POST') {
    const { user_id, preferences } = req.body || {};
    if (!user_id || typeof preferences !== 'object' || preferences === null) {
      return res.status(400).json({ error: 'Missing user_id or preferences' });
    }
    const user = await getUser(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const cleaned: Record<string, boolean> = { ...(user.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES) };
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)) {
      if (key in preferences) cleaned[key] = Boolean(preferences[key]);
    }
    await updateUser(user_id, { notificationPreferences: cleaned });
    return res.status(200).json({ success: true, preferences: cleaned, message: 'Notification preferences saved' });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * Nested route: GET /api/users?action=admin_ledger — platform-wide credit
 * ledger (admin-only). Powers the audit-log view in the dashboard.
 */
async function adminLedger(req: VercelRequest, res: VercelResponse) {
  const email = String(req.query.email || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { scanItems } = await import('../lib/db');
  const limit = Math.min(500, Math.max(10, parseInt(req.query.limit as string) || 150));
  const typeFilter = (req.query.type as string) || '';

  const txns = await scanItems<any>(TABLES.CREDIT_TRANSACTIONS, { limit: 2000 });
  // Hide internal index rows (idx_<eventId> dedupe helpers)
  let rows = txns.filter((t: any) => t.type !== 'event_index');
  if (typeFilter) rows = rows.filter((t: any) => t.type === typeFilter);
  rows.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  rows = rows.slice(0, limit);

  // Resolve emails for display
  const users = await scanItems<any>(TABLES.USERS, { limit: 500 });
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
      createdAt: t.createdAt,
    })),
  });
}

/**
 * GET    /api/users?email=xxx   → find user by email
 * GET    /api/users?id=xxx      → get user by id
 * POST   /api/users             → create or update user after OAuth/signup
 *
 * Body (POST):
 *   supabaseUserId, email, fullName, role?, agencyName?, planId?, cycle?
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Nested routes (function consolidation)
  if (req.query.action === 'preferences') {
    return notificationPreferences(req, res);
  }
  if (req.query.action === 'update' && req.method === 'POST') {
    return updateUserFields(req, res);
  }
  if (req.query.action === 'delete' && req.method === 'POST') {
    return deleteAccount(req, res);
  }
  if (req.method === 'GET' && req.query.action === 'admin_stats') {
    return adminStats(req, res);
  }
  if (req.method === 'GET' && req.query.action === 'list_users') {
    return listUsers(req, res);
  }
  if (req.method === 'GET' && req.query.action === 'admin_ledger') {
    return adminLedger(req, res);
  }

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
