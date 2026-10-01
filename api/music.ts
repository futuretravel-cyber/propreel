import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  S3Client, PutObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getItem, putItem, TABLES } from '../lib/db';
import { getUser } from '../lib/userService';

/**
 * Admin-managed music library.
 *   GET    /api/music                 → list tracks (public; used by the Studio picker)
 *   POST   /api/music                 → register an uploaded track  { name, genre, s3Key, durationSeconds? }
 *   DELETE /api/music?id=xxx          → delete track (admin only)
 *   POST   /api/music?action=upload   → get a presigned PUT URL      { name, genre, contentType }
 *
 * Audio bytes upload browser→S3 directly (propreel-raw-assets/music/…);
 * metadata lives in the propreel-settings table under type:"music_track".
 */

const S3_BUCKET = process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets';
const S3_REGION = process.env.AWS_REGION || 'af-south-1';
const ALLOWED_AUDIO = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/aac'];
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

function s3() {
  return new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

function publicUrl(key: string) {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

async function requireAdmin(req: VercelRequest): Promise<{ ok: boolean; error?: string }> {
  const userId = (req.query.user_id as string) || req.body?.user_id;
  if (!userId) return { ok: false, error: 'user_id required' };
  const user = await getUser(userId);
  if (!user) return { ok: false, error: 'User not found' };
  const email = (user.email || '').toLowerCase();
  const isAdmin = user.role === 'ADMIN' || email === 'futuretravel@gmail.com' || email === 'ulric@propreel.co.za';
  if (!isAdmin) return { ok: false, error: 'Admin access required' };
  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // ── GET /api/music — list all tracks ─────────────────────────────
    if (req.method === 'GET') {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLES.SETTINGS,
        FilterExpression: '#t = :mt',
        ExpressionAttributeNames: { '#t': 'type' },
        ExpressionAttributeValues: { ':mt': 'music_track' },
      }));
      const tracks = (result.Items || []).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      return res.status(200).json({ success: true, tracks });
    }

    // ── POST /api/music?action=upload — presigned PUT ────────────────
    if (req.method === 'POST' && req.query.action === 'upload') {
      const admin = await requireAdmin(req);
      if (!admin.ok) return res.status(403).json({ error: admin.error });

      const { name, genre, contentType } = req.body || {};
      if (!name || !genre) return res.status(400).json({ error: 'name and genre are required' });
      if (!ALLOWED_AUDIO.includes(contentType)) {
        return res.status(400).json({ error: `contentType must be one of: ${ALLOWED_AUDIO.join(', ')}` });
      }

      const ext = contentType.includes('mpeg') || contentType.includes('mp3') ? 'mp3' : contentType.split('/')[1].replace('x-', '');
      const key = `music/${Date.now()}-${name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-')}.${ext}`;

      const put = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType });
      const uploadUrl = await getSignedUrl(s3() as any, put, { expiresIn: 300 });

      return res.status(200).json({ success: true, uploadUrl, s3Key: key, expiresIn: 300 });
    }

    // ── POST /api/music — register uploaded track ────────────────────
    if (req.method === 'POST') {
      const admin = await requireAdmin(req);
      if (!admin.ok) return res.status(403).json({ error: admin.error });

      const { name, genre, s3Key, durationSeconds } = req.body || {};
      if (!name || !genre || !s3Key) return res.status(400).json({ error: 'name, genre and s3Key are required' });
      if (!s3Key.startsWith('music/')) return res.status(400).json({ error: 's3Key must be inside music/' });

      const id = `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const track = {
        id,
        type: 'music_track',
        name: String(name).slice(0, 120),
        genre: String(genre).slice(0, 60),
        s3Key,
        url: publicUrl(s3Key),
        durationSeconds: Number(durationSeconds) || null,
        uploadedBy: (req.body?.user_id as string) || null,
        createdAt: new Date().toISOString(),
      };
      await putItem(TABLES.SETTINGS, track);
      return res.status(201).json({ success: true, track });
    }

    // ── DELETE /api/music?id=xxx ─────────────────────────────────────
    if (req.method === 'DELETE') {
      const admin = await requireAdmin(req);
      if (!admin.ok) return res.status(403).json({ error: admin.error });

      const id = req.query.id as string;
      if (!id) return res.status(400).json({ error: 'id required' });

      const existing = await getItem<any>(TABLES.SETTINGS, { id });
      if (!existing || existing.type !== 'music_track') {
        return res.status(404).json({ error: 'Track not found' });
      }

      // Remove the S3 object too (best-effort)
      if (existing.s3Key) {
        try {
          await s3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: existing.s3Key }));
        } catch (e) {
          console.error('S3 audio delete failed (non-fatal):', e);
        }
      }
      await docClient.send(new DeleteCommand({ TableName: TABLES.SETTINGS, Key: { id } }));
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Music API error:', error);
    return res.status(500).json({ error: 'Failed to process music request' });
  }
}
