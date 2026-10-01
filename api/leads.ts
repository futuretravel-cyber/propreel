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
  // ── GET /api/leads?action=reviews — public, approved reviews only ──
  if (req.method === 'GET' && (req.query.action as string) === 'reviews') {
    try {
      const { scanItems } = await import('../lib/db');
      const all = await scanItems<any>(TABLES.SETTINGS, { limit: 300 });
      const reviews = all
        .filter(r => r.type === 'review' && r.status === 'approved')
        .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .map((r: any) => ({
          id: r.id,
          fullName: r.fullName,
          agency: r.agency,
          rating: r.rating,
          comment: r.comment,
          featured: Boolean(r.featured),
          createdAt: r.createdAt,
        }));
      return res.status(200).json({ success: true, reviews });
    } catch (e) {
      console.error('Reviews fetch error:', e);
      return res.status(200).json({ success: true, reviews: [] });
    }
  }

  // ── GET /api/leads?action=review_queue (admin) — all pending reviews ──
  if (req.method === 'GET' && (req.query.action as string) === 'review_queue') {
    try {
      const ADMIN_EMAILS = ['futuretravel@gmail.com', 'ulric@propreel.co.za'];
      if (!ADMIN_EMAILS.includes(String(req.query.email || '').toLowerCase())) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const { scanItems } = await import('../lib/db');
      const all = await scanItems<any>(TABLES.SETTINGS, { limit: 300 });
      const pending = all
        .filter(r => r.type === 'review' && r.status === 'pending')
        .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json({ success: true, reviews: pending });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to load review queue' });
    }
  }

  // ── GET /api/leads?action=agency_members&user_id=… ────────────────
  if (req.method === 'GET' && (req.query.action as string) === 'agency_members') {
    try {
      const userId = req.query.user_id as string;
      if (!userId) return res.status(400).json({ error: 'user_id is required' });
      const me = await getUser(userId);
      if (!me) return res.status(404).json({ error: 'User not found' });
      if (!me.agencyId) return res.status(200).json({ success: true, members: [{ id: me.id, fullName: me.fullName, email: me.email, credits: me.credits ?? 0, role: me.role || 'AGENT', avatar: 'ME', createdAt: me.createdAt }], agencyName: null, invites: [] });

      const { scanItems, TABLES: T } = await import('../lib/db');
      const users = await scanItems<any>(T.USERS, { limit: 300 });
      const members = users
        .filter((u: any) => u.agencyId === me.agencyId)
        .map((u: any) => ({
          id: u.id, fullName: u.fullName, email: u.email,
          credits: u.credits ?? 0, role: u.role || 'AGENT',
          avatar: (u.fullName || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase(),
          createdAt: u.createdAt,
        }));
      const invites = (await scanItems<any>(T.SETTINGS, { limit: 300 }))
        .filter((i: any) => i.type === 'agency_invite' && i.agencyId === me.agencyId && i.status === 'pending')
        .map((i: any) => ({ id: i.id, email: i.inviteEmail, createdAt: i.createdAt }));
      return res.status(200).json({ success: true, members, agencyName: me.agencyName, invites });
    } catch (e) {
      console.error('Agency members error:', e);
      return res.status(500).json({ error: 'Failed to load agency members' });
    }
  }

  // ── GET /api/leads?action=status — public system health (no secrets) ──
  // Feeds the /status page: cron freshness from the settings table + a real
  // S3 HeadBucket (verifies credentials and bucket reachability). The API
  // responding at all also proves DynamoDB connectivity.
  if (req.method === 'GET' && (req.query.action as string) === 'status') {
    const cronNames = [
      { name: 'allocate-monthly-credits', label: 'Monthly credit allocation', schedule: '1st of the month, 00:00 UTC', maxAgeHours: 24 * 35 },
      { name: 'process-expired-credits', label: 'Expired credit processing', schedule: 'Daily, 00:00 UTC', maxAgeHours: 30 },
      { name: 'send-expiry-notifications', label: 'Expiry notifications', schedule: 'Daily, 09:00 UTC', maxAgeHours: 30 },
    ];
    const crons = await Promise.all(cronNames.map(async ({ name, label, schedule, maxAgeHours }) => {
      const rec = await getItem<any>(TABLES.SETTINGS, { id: `cron_run_${name}` }).catch(() => null);
      const ageHours = rec?.finishedAt ? (Date.now() - Date.parse(rec.finishedAt)) / 3600000 : null;
      return {
        name,
        label,
        schedule,
        lastRun: rec ? { status: rec.status, finishedAt: rec.finishedAt, durationMs: rec.durationMs, detail: rec.detail || null } : null,
        healthy: rec ? rec.status === 'success' && (ageHours as number) <= maxAgeHours : null,
        ageHours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
      };
    }));

    let storage: { healthy: boolean | null; detail: string } = { healthy: null, detail: 'Not checked' };
    try {
      const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: process.env.AWS_REGION || 'af-south-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });
      await s3.send(new HeadBucketCommand({ Bucket: process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets' }));
      storage = { healthy: true, detail: 'Uploads bucket reachable' };
    } catch (e: any) {
      storage = { healthy: false, detail: String(e?.name || e).slice(0, 140) };
    }

    return res.status(200).json({ success: true, crons, storage, generatedAt: new Date().toISOString() });
  }

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

    // ── POST /api/leads?action=review ───────────────────────────────
    // Submit a product review (stored pending; shown publicly after approval)
    if (action === 'review') {
      const { fullName, agency, rating, comment } = req.body || {};
      if (!fullName || !comment || !rating) {
        return res.status(400).json({ error: 'fullName, rating and comment are required' });
      }
      const reviewId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await putItem(TABLES.SETTINGS, {
        id: reviewId,
        type: 'review',
        fullName: String(fullName).slice(0, 80),
        agency: String(agency || '').slice(0, 80) || null,
        rating: Math.max(1, Math.min(5, Number(rating) || 5)),
        comment: String(comment).slice(0, 600),
        status: 'pending',
        featured: false,
        createdAt: new Date().toISOString(),
      });
      return res.status(201).json({ success: true, message: 'Review submitted for moderation', reviewId });
    }

    // ── POST /api/leads?action=review_moderate (admin) ──────────────
    if (action === 'review_moderate') {
      const ADMIN_EMAILS = ['futuretravel@gmail.com', 'ulric@propreel.co.za'];
      const { reviewId, approve, featured, email } = req.body || {};
      if (!ADMIN_EMAILS.includes(String(email || '').toLowerCase())) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      if (!reviewId) return res.status(400).json({ error: 'reviewId is required' });
      const { updateItem } = await import('../lib/db');
      await updateItem(TABLES.SETTINGS, { id: reviewId }, {
        status: approve ? 'approved' : 'rejected',
        featured: Boolean(featured),
      });
      return res.status(200).json({ success: true });
    }

    // ── POST /api/leads?action=agency_invite ────────────────────────
    // Agency owner invites an agent by email (stored; accepted on signup/signin)
    if (action === 'agency_invite') {
      const { inviter_user_id, invite_email, role } = req.body || {};
      if (!inviter_user_id || !invite_email) {
        return res.status(400).json({ error: 'inviter_user_id and invite_email are required' });
      }
      const inviter = await getUser(inviter_user_id);
      if (!inviter) return res.status(404).json({ error: 'Inviter not found' });

      const invitee = await getUserByEmail(String(invite_email).toLowerCase());
      if (invitee) {
        // Existing user: add them to the inviter's agency right away
        const agencyId = inviter.agencyId || `agy_${inviter.id}`;
        const { putItem: put, TABLES: T } = await import('../lib/db');
        await put(T.AGENCY_MEMBERS, { agencyId, userId: invitee.id, role: role || 'AGENT', addedAt: new Date().toISOString() });
        await updateUser(invitee.id, { agencyId, agencyName: inviter.agencyName || inviter.fullName } as any);
        await updateUser(inviter.id, { agencyId, agencyName: inviter.agencyName || inviter.fullName } as any);
        return res.status(200).json({ success: true, addedExisting: true, member: invitee.email });
      }

      // Not signed up yet: store the pending invite
      await putItem(TABLES.SETTINGS, {
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'agency_invite',
        inviterUserId: inviter_user_id,
        inviterEmail: inviter.email,
        agencyId: inviter.agencyId || `agy_${inviter.id}`,
        agencyName: inviter.agencyName || inviter.fullName,
        inviteEmail: String(invite_email).toLowerCase(),
        role: role || 'AGENT',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      return res.status(201).json({ success: true, pending: true, message: 'Invite stored — they will join your agency when they sign up with this email.' });
    }

    // ── POST /api/leads?action=agency_accept_pending ────────────────
    // Called after signup: attach the new user to any pending agency invites
    if (action === 'agency_accept_pending') {
      const { user_id } = req.body || {};
      if (!user_id) return res.status(400).json({ error: 'user_id is required' });
      const user = await getUser(user_id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { scanItems, putItem: put, TABLES: T } = await import('../lib/db');
      const all = await scanItems<any>(T.SETTINGS, { limit: 300 });
      const invite = all.find(i => i.type === 'agency_invite' && i.status === 'pending' && i.inviteEmail === user.email);
      if (!invite) return res.status(200).json({ success: true, joined: false });

      await put(T.AGENCY_MEMBERS, { agencyId: invite.agencyId, userId: user.id, role: invite.role || 'AGENT', addedAt: new Date().toISOString() });
      await updateUser(user.id, { agencyId: invite.agencyId, agencyName: invite.agencyName } as any);
      const { updateItem } = await import('../lib/db');
      await updateItem(T.SETTINGS, { id: invite.id }, { status: 'accepted', acceptedBy: user.id });
      return res.status(200).json({ success: true, joined: true, agencyName: invite.agencyName });
    }

    // ── POST /api/leads?action=contact ──────────────────────────────
    // Contact-form submission from the public site
    if (action === 'contact') {
      const { name, email, message } = req.body || {};
      if (!name || !email || !message) {
        return res.status(400).json({ error: 'name, email and message are required' });
      }
      await putItem(TABLES.SETTINGS, {
        id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'contact_message',
        name: String(name).slice(0, 80),
        email: String(email).slice(0, 120),
        message: String(message).slice(0, 2000),
        status: 'new',
        createdAt: new Date().toISOString(),
      });
      return res.status(201).json({ success: true, message: 'Message received — we will get back to you within one business day.' });
    }

    return res.status(404).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('Leads endpoint error:', error);
    return res.status(500).json({ error: 'Failed to process request' });
  }
}
