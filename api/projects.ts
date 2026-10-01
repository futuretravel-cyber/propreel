import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, updateUser } from '../lib/userService';
import { TABLES, queryItems, putItem, updateItem } from '../lib/db';
import { deleteItem } from '../lib/db-helpers';

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
  videoTier?: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  folder?: string;
  tags?: string[];
  favorite?: boolean;
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
      if (!b.user_id) return res.status(400).json({ error: 'Missing user_id' });

      const user = await getUser(b.user_id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const now = new Date().toISOString();
      const project: ProjectRecord = {
        userId: b.user_id,
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
        videoTier: b.videoTier || 'ESSENTIAL',
        videoUrl: b.videoUrl || null,
        thumbnailUrl: b.thumbnailUrl || null,
        folder: b.folder || undefined,
        tags: Array.isArray(b.tags) ? b.tags.map(String).slice(0, 10) : [],
        favorite: Boolean(b.favorite),
        createdAt: now,
        updatedAt: now,
      };

      await putItem(TABLES.PROJECTS, project);
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
      const allowed = ['title', 'address', 'suburb', 'city', 'province', 'price', 'bedrooms', 'bathrooms', 'garages', 'propertyType', 'features', 'status', 'videoTier', 'videoUrl', 'thumbnailUrl', 'folder', 'tags', 'favorite'] as const;
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
