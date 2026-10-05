import { VercelRequest, VercelResponse } from '@vercel/node';
import {
  S3Client, PutObjectCommand, DeleteObjectCommand,
  HeadObjectCommand, GetObjectCommand, CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import sharp from 'sharp';
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

const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
/** Hard cap on studio photo uploads — client-side checks are advisory only. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Formats sharp's header parse is allowed to confirm (SVG parses as 'svg' → rejected). */
const ALLOWED_IMAGE_FORMATS = ['jpeg', 'png', 'webp'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // ── POST /api/music?action=presign — signed upload for studio images ──
    // Any signed-in user may upload their own property photos (shared with the
    // music route to stay under the Vercel Hobby 12-function cap).
    //
    // The declared size is validated here AND signed into the URL
    // (Content-Length lands in X-Amz-SignedHeaders), so the PUT itself is
    // cryptographically capped — an attacker cannot upload more bytes than
    // they declared at presign time, and presign refuses >25MB outright.
    if (req.method === 'POST' && req.query.action === 'presign') {
      const userId = req.body?.user_id;
      if (!userId) return res.status(401).json({ error: 'Sign in to upload images' });
      const requester = await getUser(userId);
      if (!requester) return res.status(401).json({ error: 'Sign in to upload images' });

      const { contentType, size } = req.body || {};
      if (!ALLOWED_IMAGES.includes(contentType)) {
        return res.status(400).json({ error: 'contentType must be image/jpeg, image/png or image/webp' });
      }
      const bytes = Number(size);
      if (!Number.isFinite(bytes) || bytes <= 0) {
        return res.status(400).json({ error: 'size (bytes) is required' });
      }
      if (bytes > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: 'Images must be 25MB or smaller' });
      }
      const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
      const key = `uploads/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const put = new PutObjectCommand({
        Bucket: S3_BUCKET, Key: key, ContentType: contentType, ContentLength: bytes,
      });
      const uploadUrl = await getSignedUrl(s3() as any, put, { expiresIn: 300 });
      return res.status(200).json({ success: true, uploadUrl, publicUrl: publicUrl(key), key, expiresIn: 300 });
    }

    // ── POST /api/music?action=verify_upload — server-side binary check ──
    // The bytes go browser→S3 directly, so this is where the upload actually
    // gets validated: sharp parses the real header (magic-byte signature),
    // size and stored content-type are re-checked, and anything that is not a
    // JPEG/PNG/WebP — SVGs with embedded scripts, HTML, truncated garbage —
    // is deleted from the bucket. The client calls this after every PUT; the
    // verified content-type is copied back onto the object so what gets served
    // always matches what the bytes really are.
    if (req.method === 'POST' && req.query.action === 'verify_upload') {
      const userId = req.body?.user_id;
      if (!userId) return res.status(401).json({ error: 'Sign in to verify uploads' });
      const requester = await getUser(userId);
      if (!requester) return res.status(401).json({ error: 'Sign in to verify uploads' });
      const key = req.body?.key;
      // Ownership: keys are minted as uploads/<userId>/… — never touch another
      // user's objects (or anything outside the uploads prefix).
      if (typeof key !== 'string' || !key.startsWith(`uploads/${userId}/`)) {
        return res.status(400).json({ error: 'Invalid upload key' });
      }

      const destroy = async () => { await s3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })).catch(() => {}); };
      try {
        const head = await s3().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        const len = Number(head.ContentLength || 0);
        if (len <= 0 || len > MAX_IMAGE_BYTES) {
          await destroy();
          return res.status(413).json({ error: 'Uploaded image must be between 1 byte and 25MB' });
        }

        // First 4KB is all sharp needs to parse the header and identify it.
        const part = await s3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, Range: 'bytes=0-4095' }));
        const head4k = Buffer.from(await (part.Body as any).transformToByteArray());
        let format: string | undefined;
        try { format = (await sharp(head4k).metadata()).format; } catch { format = undefined; }
        if (!format || !ALLOWED_IMAGE_FORMATS.includes(format)) {
          await destroy();
          return res.status(415).json({ error: 'Not a valid JPEG, PNG or WebP image — the file was discarded' });
        }

        // Normalise the stored content-type to what the bytes really are
        // (clients PUT their own Content-Type header; this pins it server-side
        // for everything that passes verification).
        const normalized = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
        if ((head.ContentType || '') !== normalized) {
          await s3().send(new CopyObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            CopySource: `${S3_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
            MetadataDirective: 'REPLACE',
            ContentType: normalized,
          }));
        }
        return res.status(200).json({ success: true, contentType: normalized, bytes: len });
      } catch (err: any) {
        if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
          return res.status(404).json({ error: 'Uploaded file not found — try the upload again' });
        }
        console.error('verify_upload failed:', err);
        return res.status(500).json({ error: 'Could not verify the upload — try again' });
      }
    }

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
