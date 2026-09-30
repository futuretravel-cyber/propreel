import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, updateUser } from '../../lib/userService';

export interface ProjectFolder {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
}

/**
 * GET /api/projects/folders?user_id=xxx  → { folders: [...] }
 * PUT /api/projects/folders { user_id, folders: [...] }  → replaces folder list
 *
 * Folders are stored on the user record under `projectFolders` so they work
 * without any extra table; per-project folder assignment lives on the project.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = req.method === 'GET' ? (req.query.user_id as string) : req.body?.user_id;

  if (!userId) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  try {
    const user = await getUser(userId);

    if (req.method === 'GET') {
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json({ success: true, folders: user.projectFolders || [] });
    }

    if (req.method === 'PUT') {
      if (!user) return res.status(404).json({ error: 'User not found' });

      const incoming = req.body?.folders;
      if (!Array.isArray(incoming)) {
        return res.status(400).json({ error: 'folders must be an array' });
      }

      // Sanitize; keep the built-in "all" virtual folder out of storage
      const folders: ProjectFolder[] = incoming
        .filter((f: any) => f && typeof f.name === 'string' && f.name.trim())
        .slice(0, 30)
        .map((f: any) => ({
          id: typeof f.id === 'string' && f.id ? f.id : `fld_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          name: String(f.name).trim().slice(0, 40),
          icon: typeof f.icon === 'string' && f.icon ? f.icon.slice(0, 8) : '📁',
          createdAt: typeof f.createdAt === 'string' ? f.createdAt : new Date().toISOString(),
        }));

      await updateUser(userId, { projectFolders: folders });
      return res.status(200).json({ success: true, folders });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Project folders error:', error);
    return res.status(500).json({ error: 'Failed to manage folders' });
  }
}
