import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, updateUser, deductCredits, addCredits } from '../lib/userService';
import { TABLES, queryItems, putItem, updateItem, scanItems } from '../lib/db';
import { deleteItem } from '../lib/db-helpers';
import { requireOwner } from '../lib/auth';
import { signProjectUrls, signS3Url, rawS3Url } from '../lib/s3Urls';
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
  kind?: 'REEL' | 'FLASHHEAD' | 'IMAGE' | 'SOCIAL';
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
  /**
   * Server-only: has this listing's 2-credit fee ever been charged? Drafts
   * created from the wizard are free to save, so they start `false` and the
   * fee is taken once when they're published (DRAFT → ACTIVE). Never in the
   * client whitelist — rows written before this flag existed paid at create
   * time, so `undefined` also means "already charged".
   */
  listingFeeCharged?: boolean;
  soldAt?: string;
  erfSize?: number;
  floorSize?: number;
  createdAt: string;
  updatedAt: string;
}

/** Charged once per published listing — free to save as draft. */
const NEW_LISTING_COST = 2;

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
 *   GET    /api/projects?action=geocode&q=…             → { found, lat, lon, display }
 *   GET    /api/projects?action=amenities&lat=…&lon=…   → { amenities }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';

  // ── Nested: folders (stored on the user record) ──────────────────────
  if (action === 'folders') {
    const userId = req.method === 'GET' ? (req.query.user_id as string) : req.body?.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const gate = await requireOwner(req, userId);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

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

  // ── Nested: OpenStreetMap lookups, proxied server-side ──────────────
  // The browser can't be trusted to reach nominatim/overpass directly
  // (extensions, CORS and corporate filters all break the call), so both
  // the Description tab and the Listings wizard talk to our own origin.
  //   GET ?action=geocode&q=…         → { found, lat?, lon?, display? }
  //   GET ?action=amenities&lat=…&lon=… → { amenities }
  if (action === 'geocode' && req.method === 'GET') {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing q' });
    if (q.length > 300) return res.status(400).json({ error: 'Address too long' });
    try {
      const { geocodeAddress } = await import('../lib/geocode');
      const point = await geocodeAddress(q);
      if (!point) return res.status(200).json({ found: false });
      return res.status(200).json({ found: true, ...point });
    } catch (e) {
      console.error('geocode proxy failed:', e);
      // 502 tells the client to fall back to a direct lookup
      return res.status(502).json({ error: 'Geocoding service unreachable' });
    }
  }

  if (action === 'amenities' && req.method === 'GET') {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'Missing lat/lon' });
    }
    try {
      const { nearbyAmenities } = await import('../lib/geocode');
      return res.status(200).json({ amenities: await nearbyAmenities(lat, lon) });
    } catch (e) {
      console.error('amenities proxy failed:', e);
      return res.status(502).json({ error: 'Amenities service unreachable' });
    }
  }

  try {
    // ── GET /api/projects?action=agency_history&user_id=… ───────
    // Agency-wide render history for team leads: every reel and Talking
    // Head clip produced by the agency's members, newest first, with
    // per-agent attribution.
    if (req.method === 'GET' && action === 'agency_history') {
      const userId = req.query.user_id as string;
      if (!userId) return res.status(400).json({ error: 'Missing user_id' });
      const gate = await requireOwner(req, userId);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
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
        projects: await Promise.all(projects.map(signProjectUrls)),
      });
    }

    // ── GET /api/projects?action=social_pack&user_id=…&id=… ─────
    // Branded download bundle: the reel, the agent's latest Talking Head
    // clip (when one exists), ready-to-post captions, and a branding file.
    if (req.method === 'GET' && action === 'social_pack') {
      const userId = req.query.user_id as string;
      const id = req.query.id as string;
      if (!userId || !id) return res.status(400).json({ error: 'Missing user_id or id' });
      const gate = await requireOwner(req, userId);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

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
      // (signS3Url: still works today on public buckets, and keeps the pack
      //  working after the M-5 bucket-policy flip — the raw object URL is
      //  what the DB stores; the fetch just needs read access.)
      try {
        const main = await fetchVideo((await signS3Url(project.videoUrl)) || project.videoUrl);
        zip.file(`${slug}-${project.kind === 'FLASHHEAD' ? 'talking-head' : 'reel'}.mp4`, main);
      } catch (e: any) {
        // L-5: log the fetch failure server-side, never echo it — the error
        // can carry origin/host details of the storage layer.
        console.error('Social pack video fetch failed:', e);
        return res.status(502).json({ error: 'Could not fetch the video — try again in a moment' });
      }

      // 2) The agent's latest ready Talking Head clip (for reel cards)
      if (project.kind !== 'FLASHHEAD') {
        const all = await queryItems<any>(TABLES.PROJECTS, { expression: 'userId = :u', values: { ':u': userId } });
        const talkingHead = all
          .filter((p: any) => p.kind === 'FLASHHEAD' && p.status === 'READY' && p.videoUrl)
          .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
        if (talkingHead) {
          try {
            zip.file('talking-head.mp4', await fetchVideo((await signS3Url(talkingHead.videoUrl)) || talkingHead.videoUrl));
          } catch { /* optional — pack ships without it */ }
        }
      }

      // 3) Ready-to-post captions from the real listing data. The headline
      //    must be COMPLETE and correctly spelled: older video rows stored a
      //    title cut at 60 chars (mid-word), so prefer the full stored
      //    script/description and repair legacy titles on a word boundary.
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
      const flat = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();
      // First complete sentence of the full script/copy (word-boundary safe).
      const sentence = (raw: string): string => {
        const s = flat(raw);
        if (!s) return '';
        const m = s.match(/^[^.!?]{12,}[.!?]/);
        if (m && m[0].length <= 200) return m[0].trim();
        if (s.length <= 140) return s;
        return s.slice(0, 137).replace(/\s+\S*$/, '').trim() + '…';
      };
      // Legacy titles were truncated mid-word at 60 chars — never reprint a
      // partial word ("…three-bedroo"): drop the suspect tail on a word
      // boundary. Short or punctuated titles are already complete.
      const repairedTitle = (raw: string): string => {
        const s = flat(raw);
        if (s.length < 50 || /[.!?,…]$/.test(s)) return s;
        return s.replace(/\s+\S*$/, '').trim() + '…';
      };
      const longHeadline = sentence(project.description || '') || repairedTitle(project.title);
      const shortHeadline = longHeadline.length <= 110
        ? longHeadline
        : longHeadline.slice(0, 107).replace(/\s+\S*$/, '').trim() + '…';

      const hashtagWords = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
      const suburbTag = hashtagWords(project.suburb || (loc.split(',')[0] || ''))[0];
      const cityTag = hashtagWords(project.city || '')[0];
      const hashtags = [
        '#PropertyForSale', '#SouthAfrica', '#RealEstate', '#NewListing',
        suburbTag ? `#${suburbTag}` : '',
        cityTag ? `#${cityTag}Property` : '',
      ].filter((h, i, a) => h && a.indexOf(h) === i).join(' ');

      const captionBody = [
        `🎬 ${longHeadline}${loc ? `\n📍 ${loc}` : ''}`,
        stats,
        '',
        'Full video walkthrough available — send me a message to arrange a viewing.',
        contact ? `📞 ${contact}` : '',
        '',
        hashtags,
      ].filter(l => l !== undefined && l !== '').join('\n');
      zip.file('captions.txt', [
        'Ready-to-post captions (edit freely — generated from your listing data).',
        'For AI-written variations, open Dashboard → Social Media.',
        '',
        '── Instagram / Facebook ──',
        captionBody,
        '',
        '── WhatsApp status ──',
        `🎬 New video tour: ${shortHeadline}${loc ? ` in ${loc}` : ''}${/[.!?…]$/.test(shortHeadline) ? '' : '.'} ${stats ? `${stats}. ` : ''}Take a look 👇`,
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
        'Note: media files generated by PropReel are stored for 30 days only',
        'and are then permanently deleted — download anything you want to keep.',
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
      const gate = await requireOwner(req, userId);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const projects = await queryItems<ProjectRecord>(TABLES.PROJECTS, {
        expression: 'userId = :u',
        values: { ':u': userId },
      });
      // Newest first
      projects.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      // M-5: rows keep the raw object URL; the client gets 1h signed URLs.
      return res.status(200).json({ success: true, projects: await Promise.all(projects.map(signProjectUrls)) });
    }

    // ── POST /api/projects — create ──────────────────────────────────
    if (req.method === 'POST') {
      const b = req.body || {};
      // Accept camelCase too — older bundles sent `userId` and got a 400
      // that callers swallowed, silently losing the render's project row.
      const owner = b.user_id || b.userId;
      if (!owner) return res.status(400).json({ error: 'Missing user_id' });
      const gate = await requireOwner(req, owner);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const user = await getUser(owner);
      if (!user) return res.status(404).json({ error: 'User not found' });

      // A listing (created from the New Listing wizard — it always sends
      // marketStatus) costs 2 credits, charged server-side so the client
      // can't bypass it. Render-job project rows stay free, and drafts are
      // free to save — the fee is taken once when the draft is published
      // (PUT flips DRAFT → ACTIVE on a row with listingFeeCharged: false).
      const isListing = b.marketStatus !== undefined;
      const chargeNow = isListing && b.marketStatus !== 'DRAFT';
      let charged = false;
      if (chargeNow) {
        const r = await deductCredits(owner, NEW_LISTING_COST, 'New listing', { kind: 'NEW_LISTING' });
        if (!r.success) {
          return res.status(402).json({ error: `Not enough credits — a new listing costs ${NEW_LISTING_COST} credits` });
        }
        charged = true;
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
        kind: (['REEL', 'FLASHHEAD', 'IMAGE', 'SOCIAL'] as const).includes(b.kind) ? b.kind : 'REEL',
        voice: typeof b.voice === 'string' ? b.voice.slice(0, 40) : undefined,
        jobId: typeof b.jobId === 'string' ? b.jobId.slice(0, 120) : undefined,
        creditsSpent: Number(b.creditsSpent) || undefined,
        videoTier: b.videoTier || 'ESSENTIAL',
        videoUrl: rawS3Url(b.videoUrl) || null,
        thumbnailUrl: rawS3Url(b.thumbnailUrl) || null,
        folder: b.folder || undefined,
        tags: Array.isArray(b.tags) ? b.tags.map(String).slice(0, 10) : [],
        favorite: Boolean(b.favorite),
        photos: Array.isArray(b.photos) ? b.photos.map(String).map((p: string) => (rawS3Url(p) as string) || p).slice(0, 30) : [],
        description: typeof b.description === 'string' ? b.description.slice(0, 20000) : undefined,
        marketStatus: (['ACTIVE', 'DRAFT', 'SOLD', 'EXPIRED'] as const).includes(b.marketStatus) ? b.marketStatus : undefined,
        listingFeeCharged: isListing ? charged : undefined,
        soldAt: typeof b.soldAt === 'string' ? b.soldAt : undefined,
        erfSize: Number(b.erfSize) || undefined,
        floorSize: Number(b.floorSize) || undefined,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await putItem(TABLES.PROJECTS, project);
      } catch (err) {
        if (charged) await addCredits(owner, NEW_LISTING_COST, 'refund', 'Refund — listing was not saved').catch(() => {});
        throw err;
      }
      return res.status(201).json({ success: true, project: await signProjectUrls(project) });
    }

    // ── PUT /api/projects — update (folder, favorite, status, etc.) ──
    if (req.method === 'PUT') {
      const { user_id, id, updates } = req.body || {};
      if (!user_id || !id) return res.status(400).json({ error: 'Missing user_id or id' });
      const gate = await requireOwner(req, user_id);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

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
      // Never persist an expiring presigned URL — if the client echoes back
      // a signed URL it received from a GET, store the raw object URL.
      if (typeof clean.videoUrl === 'string') clean.videoUrl = rawS3Url(clean.videoUrl);
      if (typeof clean.thumbnailUrl === 'string') clean.thumbnailUrl = rawS3Url(clean.thumbnailUrl);
      if (Array.isArray(clean.photos)) clean.photos = clean.photos.map((p: any) => rawS3Url(String(p)));
      clean.updatedAt = new Date().toISOString();

      // Publishing a free draft (DRAFT → ACTIVE) takes the 2-credit
      // new-listing fee exactly once. `listingFeeCharged` is not client-
      // settable, and legacy rows (no flag) already paid at create time.
      if (clean.marketStatus === 'ACTIVE' && existing[0].marketStatus === 'DRAFT' && existing[0].listingFeeCharged === false) {
        const r = await deductCredits(user_id, NEW_LISTING_COST, 'New listing', { kind: 'NEW_LISTING' });
        if (!r.success) {
          return res.status(402).json({ error: `Not enough credits — a new listing costs ${NEW_LISTING_COST} credits` });
        }
        clean.listingFeeCharged = true;
      }

      await updateItem(TABLES.PROJECTS, { userId: user_id, id }, clean);

      const [updated] = await queryItems<ProjectRecord>(TABLES.PROJECTS, {
        expression: 'userId = :u AND id = :i',
        values: { ':u': user_id, ':i': id },
        limit: 1,
      });
      return res.status(200).json({ success: true, project: await signProjectUrls(updated) });
    }

    // ── DELETE /api/projects?user_id=…&id=… ──────────────────────────
    if (req.method === 'DELETE') {
      const userId = req.query.user_id as string;
      const id = req.query.id as string;
      if (!userId || !id) return res.status(400).json({ error: 'Missing user_id or id' });
      const gate = await requireOwner(req, userId);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const ok = await deleteItem(TABLES.PROJECTS, { userId, id });
      return res.status(ok ? 200 : 500).json({ success: ok });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Projects endpoint error:', error);
    return res.status(500).json({ error: 'Failed to process project request' });
  }
}
