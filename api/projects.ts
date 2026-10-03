import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, updateUser, deductCredits, addCredits } from '../lib/userService';
import { TABLES, queryItems, putItem, updateItem, scanItems } from '../lib/db';
import { deleteItem } from '../lib/db-helpers';
import JSZip from 'jszip';

export interface ProjectFolder {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
}

export interface ProjectRecord {
  userId: string;
  id: string;
  title: string;
  address?: string;
  suburb?: string;
  city?: string;
  province?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  garages?: number;
  propertyType?: string;
  features?: string[];
  status?: 'DRAFT' | 'PROCESSING' | 'READY' | 'FAILED';
  /** REEL = AI video render, FLASHHEAD = Talking Head lip-sync clip */
  kind?: 'REEL' | 'FLASHHEAD';
  voice?: string;
  /** Modal job id — lets the reaper reconcile abandoned renders */
  jobId?: string;
  /** Credits reserved for this render — what the reaper refunds if it failed */
  creditsSpent?: number;
  videoTier?: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  folder?: string;
  tags?: string[];
  favorite?: boolean;
  /** Portfolio listing extras (Property Listings page) */
  photos?: string[];
  description?: string;
  marketStatus?: 'ACTIVE' | 'DRAFT' | 'SOLD' | 'EXPIRED';
  soldAt?: string;
  erfSize?: number;
  floorSize?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Unified projects endpoint (replaces the folders-only function; same function
 * count on the Hobby plan).
 *
 * Routes:
 *   GET    /api/projects?user_id=…                      → { projects }
 *   POST   /api/projects                                → { project }
 *   PUT    /api/projects { user_id, id, updates }       → { project }
 *   DELETE /api/projects?user_id=…&id=…                 → { success }
 *   GET    /api/projects?action=folders&user_id=…       → { folders }
 *   PUT    /api/projects?action=folders { user_id, folders } → { folders }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';

  // ── Nested: folders (stored on the user record) ──────────────────────
  if (action === 'folders') {
    const userId = req.method === 'GET' ? (req.query.user_id as string) : req.body?.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });

    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.method === 'GET') {
      return res.status(200).json({ success: true, folders: user.projectFolders || [] });
    }

    if (req.method === 'PUT') {
      const incoming = req.body?.folders;
      if (!Array.isArray(incoming)) {
        return res.status(400).json({ error: 'folders must be an array' });
      }
      const folders: ProjectFolder[] = incoming
        .filter((f: any) => f && typeof f.name === 'string' && f.name.trim())
        .slice(0, 30)
        .map((f: any) => ({
          id: typeof f.id === 'string' && f.id ? f.id : `fld_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: String(f.name).trim().slice(0, 40),
          icon: typeof f.icon === 'string' && f.icon ? f.icon.slice(0, 8) : '📁',
          createdAt: typeof f.createdAt === 'string' ? f.createdAt : new Date().toISOString(),
        }));
      await updateUser(userId, { projectFolders: folders });
      return res.status(200).json({ success: true, folders });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ── GET /api/projects?action=agency_history&user_id=… ───────
    // Agency-wide render history for team leads: every reel and Talking
    // Head clip produced by the agency's members, newest first, with
    // per-agent attribution.
    if (req.method === 'GET' && action === 'agency_history') {
      const userId = req.query.user_id as string;
      if (!userId) return res.status(400).json({ error: 'Missing user_id' });
      const user = await getUser(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const isLead = user.role === 'AGENCY_OWNER' || user.role === 'ADMIN';
      if (!isLead || !user.agencyId) {
        return res.status(200).json({ success: true, authorized: false, projects: [] });
      }

      const users = await scanItems<any>(TABLES.USERS, { limit: 300 });
      const members = users.filter((u: any) => u.agencyId === user.agencyId);
      const perMember = await Promise.all(members.map((m: any) =>
        queryItems<any>(TABLES.PROJECTS, { expression: 'userId = :u', values: { ':u': m.id } }).catch(() => [])
      ));
      const memberMap = new Map(members.map((m: any) => [m.id, m]));
      const projects = perMember
        .flat()
        .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 200)
        .map((p: any) => {
          const m = memberMap.get(p.userId);
          return {
            ...p,
            agentName: m?.fullName || 'Unknown agent',
            agentAvatar: String(m?.fullName || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase(),
          };
        });

      return res.status(200).json({
        success: true,
        authorized: true,
        agencyName: user.agencyName || null,
        agentCount: members.length,
        projects,
      });
    }

    // ── GET /api/projects?action=social_pack&user_id=…&id=… ─────
    // Branded download bundle: the reel, the agent's latest Talking Head
    // clip (when one exists), ready-to-post captions, and a branding file.
    if (req.method === 'GET' && action === 'social_pack') {
      const userId = req.query.user_id as string;
      const id = req.query.id as string;
      if (!userId || !id) return res.status(400).json({ error: 'Missing user_id or id' });

      const [user, owned] = await Promise.all([
        getUser(userId),
        queryItems<any>(TABLES.PROJECTS, { expression: 'userId = :u AND id = :i', values: { ':u': userId, ':i': id }, limit: 1 }),
      ]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (!owned.length) return res.status(404).json({ error: 'Project not found' });
      const project = owned[0];
      if (project.status !== 'READY' || !project.videoUrl) {
        return res.status(400).json({ error: 'This project has no finished video yet' });
      }

      const slug = String(project.title || 'property')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'property';
      const zip = new JSZip();

      const fetchVideo = async (url: string): Promise<Buffer> => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Video unavailable (${r.status})`);
        return Buffer.from(await r.arrayBuffer());
      };

      // 1) The card's own video
      try {
        const main = await fetchVideo(project.videoUrl);
        zip.file(`${slug}-${project.kind === 'FLASHHEAD' ? 'talking-head' : 'reel'}.mp4`, main);
      } catch (e: any) {
        return res.status(502).json({ error: `Could not fetch the video: ${e.message}` });
      }

      // 2) The agent's latest ready Talking Head clip (for reel cards)
      if (project.kind !== 'FLASHHEAD') {
        const all = await queryItems<any>(TABLES.PROJECTS, { expression: 'userId = :u', values: { ':u': userId } });
        const talkingHead = all
          .filter((p: any) => p.kind === 'FLASHHEAD' && p.status === 'READY' && p.videoUrl)
          .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
        if (talkingHead) {
          try {
            zip.file('talking-head.mp4', await fetchVideo(talkingHead.videoUrl));
          } catch { /* optional — pack ships without it */ }
        }
      }

      // 3) Ready-to-post captions from the real listing data
      const loc = [project.suburb, project.city].filter(Boolean).join(', ');
      const beds = Number(project.bedrooms) || 0;
      const baths = Number(project.bathrooms) || 0;
      const price = Number(project.price) || 0;
      const stats = [
        beds ? `${beds} bedroom${beds === 1 ? '' : 's'}` : '',
        baths ? `${baths} bathroom${baths === 1 ? '' : 's'}` : '',
        price ? `R ${price.toLocaleString('en-ZA')}` : '',
      ].filter(Boolean).join(' • ');
      const contact = [user.fullName, user.agencyName, user.email].filter(Boolean).join(' | ');
      const captionBody = [
        `🎬 ${project.title}${loc ? ` — ${loc}` : ''}`,
        stats,
        '',
        'Full video walkthrough available — send me a message to arrange a viewing.',
        contact ? `📍 ${contact}` : '',
        '',
        '#PropertyForSale #SouthAfrica #RealEstate',
        loc ? `#${loc.split(',')[0].trim().replace(/\s+/g, '')} #${(project.city || 'Property').replace(/\s+/g, '')}Property` : '#NewListing',
      ].filter(l => l !== undefined).join('\n');
      zip.file('captions.txt', [
        'Ready-to-post captions (edit freely — generated from your listing data).',
        'For AI-written variations, open the Studio → Social Media tab.',
        '',
        '── Instagram / Facebook ──',
        captionBody,
        '',
        '── WhatsApp status ──',
        `🎬 New video tour: ${project.title}${loc ? ` (${loc})` : ''}${stats ? ` — ${stats}` : ''}. Take a look 👇`,
      ].join('\n'));

      // 4) Branding / README
      zip.file('README.txt', [
        'PropReel Social Pack',
        '====================',
        '',
        `Listing: ${project.title}`,
        loc ? `Location: ${loc}` : null,
        `Generated: ${new Date().toISOString().slice(0, 10)}`,
        '',
        'Contents:',
        `• ${slug}-${project.kind === 'FLASHHEAD' ? 'talking-head' : 'reel'}.mp4 — your ${project.kind === 'FLASHHEAD' ? 'Talking Head clip' : 'AI video reel'}`,
        ...(zip.file('talking-head.mp4') ? ['• talking-head.mp4 — your AI Talking Head clip'] : []),
        '• captions.txt — ready-to-post captions with your branding',
        '',
        contact ? `Branded for: ${contact}` : null,
        'Created with PropReel — propreel.co.za',
      ].filter(l => l !== null).join('\n'));

      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="propreel-social-pack-${slug}.zip"`);
      res.setHeader('Content-Length', String(buf.length));
      return res.status(200).send(buf);
    }

    // ── GET /api/projects?user_id=… ──────────────────────────────────
    if (req.method === 'GET') {
      const userId = req.query.user_id as string;
      if (!userId) return res.status(400).json({ error: 'Missing user_id' });

      const projects = await queryItems<ProjectRecord>(TABLES.PROJECTS, {
        expression: 'userId = :u',
        values: { ':u': userId },
      });
      // Newest first
      projects.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json({ success: true, projects });
    }

    // ── POST /api/projects — create ──────────────────────────────────
    if (req.method === 'POST') {
      const b = req.body || {};
      // Accept camelCase too — older bundles sent `userId` and got a 400
      // that callers swallowed, silently losing the render's project row.
      const owner = b.user_id || b.userId;
      if (!owner) return res.status(400).json({ error: 'Missing user_id' });

      const user = await getUser(owner);
      if (!user) return res.status(404).json({ error: 'User not found' });

      // A listing (created from the New Listing wizard — it always sends
      // marketStatus) costs 2 credits, charged server-side so the client
      // can't bypass it. Render-job project rows stay free.
      const NEW_LISTING_COST = 2;
      const isListing = b.marketStatus !== undefined;
      if (isListing) {
        const charged = await deductCredits(owner, NEW_LISTING_COST, 'New listing', { kind: 'NEW_LISTING' });
        if (!charged.success) {
          return res.status(402).json({ error: `Not enough credits — a new listing costs ${NEW_LISTING_COST} credits` });
        }
      }

      const now = new Date().toISOString();
      const project: ProjectRecord = {
        userId: owner,
        id: `prj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: String(b.title || 'Untitled Property').slice(0, 120),
        address: b.address || '',
        suburb: b.suburb || '',
        city: b.city || '',
        province: b.province || '',
        price: Number(b.price) || 0,
        bedrooms: Number(b.bedrooms) || 0,
        bathrooms: Number(b.bathrooms) || 0,
        garages: Number(b.garages) || 0,
        propertyType: b.propertyType || 'House',
        features: Array.isArray(b.features) ? b.features.map(String).slice(0, 20) : [],
        status: (['DRAFT', 'PROCESSING', 'READY', 'FAILED'] as const).includes(b.status) ? b.status : 'DRAFT',
        kind: b.kind === 'FLASHHEAD' ? 'FLASHHEAD' : 'REEL',
        voice: typeof b.voice === 'string' ? b.voice.slice(0, 40) : undefined,
        jobId: typeof b.jobId === 'string' ? b.jobId.slice(0, 120) : undefined,
        creditsSpent: Number(b.creditsSpent) || undefined,
        videoTier: b.videoTier || 'ESSENTIAL',
        videoUrl: b.videoUrl || null,
        thumbnailUrl: b.thumbnailUrl || null,
        folder: b.folder || undefined,
        tags: Array.isArray(b.tags) ? b.tags.map(String).slice(0, 10) : [],
        favorite: Boolean(b.favorite),
        photos: Array.isArray(b.photos) ? b.photos.map(String).slice(0, 30) : [],
        description: typeof b.description === 'string' ? b.description.slice(0, 20000) : undefined,
        marketStatus: (['ACTIVE', 'DRAFT', 'SOLD', 'EXPIRED'] as const).includes(b.marketStatus) ? b.marketStatus : undefined,
        soldAt: typeof b.soldAt === 'string' ? b.soldAt : undefined,
        erfSize: Number(b.erfSize) || undefined,
        floorSize: Number(b.floorSize) || undefined,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await putItem(TABLES.PROJECTS, project);
      } catch (err) {
        if (isListing) await addCredits(owner, NEW_LISTING_COST, 'refund', 'Refund — listing was not saved').catch(() => {});
        throw err;
      }
      return res.status(201).json({ success: true, project });
    }

    // ── PUT /api/projects — update (folder, favorite, status, etc.) ──
    if (req.method === 'PUT') {
      const { user_id, id, updates } = req.body || {};
      if (!user_id || !id) return res.status(400).json({ error: 'Missing user_id or id' });

      const existing = await queryItems<ProjectRecord>(TABLES.PROJECTS, {
        expression: 'userId = :u AND id = :i',
        values: { ':u': user_id, ':i': id },
        limit: 1,
      });
      if (!existing.length) return res.status(404).json({ error: 'Project not found' });

      // Whitelist updatable fields
      const allowed = ['title', 'address', 'suburb', 'city', 'province', 'price', 'bedrooms', 'bathrooms', 'garages', 'propertyType', 'features', 'status', 'kind', 'voice', 'jobId', 'creditsSpent', 'durationSeconds', 'videoTier', 'videoUrl', 'thumbnailUrl', 'folder', 'tags', 'favorite', 'photos', 'description', 'marketStatus', 'soldAt', 'erfSize', 'floorSize'] as const;
      const clean: Record<string, any> = {};
      for (const key of allowed) {
        if (key in (updates || {})) clean[key] = updates[key];
      }
      clean.updatedAt = new Date().toISOString();

      await updateItem(TABLES.PROJECTS, { userId: user_id, id }, clean);

      const [updated] = await queryItems<ProjectRecord>(TABLES.PROJECTS, {
        expression: 'userId = :u AND id = :i',
        values: { ':u': user_id, ':i': id },
        limit: 1,
      });
      return res.status(200).json({ success: true, project: updated });
    }

    // ── DELETE /api/projects?user_id=…&id=… ──────────────────────────
    if (req.method === 'DELETE') {
      const userId = req.query.user_id as string;
      const id = req.query.id as string;
      if (!userId || !id) return res.status(400).json({ error: 'Missing user_id or id' });

      const ok = await deleteItem(TABLES.PROJECTS, { userId, id });
      return res.status(ok ? 200 : 500).json({ success: ok });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Projects endpoint error:', error);
    return res.status(500).json({ error: 'Failed to process project request' });
  }
}
