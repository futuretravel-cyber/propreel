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
import { getSessionUser, getTokenFromRequest } from '../lib/auth';
import { sniffMedia, audioMime } from '../lib/mediaSniff';
import { signS3Url, toEdgeUrl } from '../lib/s3Urls';
import { consumeRateLimit } from '../lib/rateLimit';

/**
 * Admin-managed music library.
 *   GET    /api/music                 → list tracks (public; used by the Studio picker)
 *   POST   /api/music                 → register an uploaded track (bytes re-sniffed first)
 *   DELETE /api/music?id=xxx          → delete track (admin only)
 *   POST   /api/music?action=upload   → presigned PUT, size pinned    { name, genre, contentType, size }
 *   POST   /api/music?action=verify_upload → magic-byte audio check   { user_id, key }
 *
 * Audio bytes upload browser→S3 directly (propreel-raw-assets/music/…);
 * metadata lives in the propreel-settings table under type:"music_track".
 * Admin actions authenticate via the SESSION COOKIE — a client-sent user_id
 * is only cross-checked against the session, never trusted on its own.
 */

const S3_BUCKET = process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets';
const S3_REGION = process.env.AWS_REGION || 'af-south-1';
const ALLOWED_AUDIO = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/aac'];
/** Hard cap on audio uploads — the 15MB the admin UI has always promised, now enforced server-side. */
const MAX_BYTES = 15 * 1024 * 1024;

// ── Admin tutorial videos (the SAME shared media route — api/** sits on
// the Vercel Hobby 12-function cap, so tutorials ride here rather than in
// a 13th lambda). Flow mirrors the audio path exactly; only the sniff and
// the key space differ.
const ALLOWED_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
/** ≤100 MB per the tutorial publishing checklist (S3 + CDN-friendly). */
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
/** Browser-playable formats only — mkv/avi upload fine elsewhere but a
 * playlist the whole dashboard can play must not need an extension hack. */
const VIDEO_FORMATS = ['mp4', 'mov', 'webm'];

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

/**
 * Admin gate: identity comes from the SESSION COOKIE, never from a
 * client-supplied user_id — anyone who guessed an admin's id could
 * otherwise mint presigned audio URLs or delete tracks. A claimed
 * user_id, when present, must match the signed-in session.
 */
async function requireAdmin(req: VercelRequest): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const sessionUser = await getSessionUser(getTokenFromRequest(req));
  if (!sessionUser) return { ok: false, error: 'Sign in required' };
  const claimed = (req.query.user_id as string) || req.body?.user_id;
  if (claimed && claimed !== sessionUser.id) return { ok: false, error: 'Sign in required' };
  const { isAdminActor } = await import('../lib/auth');
  if (!isAdminActor(sessionUser)) return { ok: false, error: 'Admin access required' };
  return { ok: true, userId: sessionUser.id };
}

const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
/** Hard cap on studio photo uploads — client-side checks are advisory only. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Formats sharp's header parse is allowed to confirm (SVG parses as 'svg' → rejected). */
const ALLOWED_IMAGE_FORMATS = ['jpeg', 'png', 'webp'];
/** Per-user fixed-window caps for the S3-minting actions (lib/rateLimit). */
const RATE_WINDOW_SEC = 300; // 5 minutes
const PRESIGN_LIMIT = 60;    // signed URLs per window — wizard batches are ≤20
const VERIFY_LIMIT = 80;     // S3 HEAD/GET/COPY verifications per window

/** 429 with Retry-After — shared by every rate-limited action below. */
function tooManyUploads(res: VercelResponse, retryAfterSec: number) {
  res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
  return res.status(429).json({ error: `Upload limit reached — try again in ${Math.max(1, retryAfterSec)}s` });
}

type AudioCheck =
  | { ok: true; contentType: string; bytes: number; storedType: string }
  | { ok: false; status: number; error: string };

/**
 * Read an object's header and confirm its bytes really are audio — sharp
 * can't parse audio, so lib/mediaSniff checks the binary signatures
 * (mp3/wav/ogg/m4a/aac/flac). Anything that sniffs as an image, a video
 * container or garbage is rejected and the object is deleted, so a renamed
 * .mp3 never reaches the Studio music picker (played by all users).
 */
type VideoCheck =
  | { ok: true; contentType: string; bytes: number; storedType: string }
  | { ok: false; status: number; error: string };

/** Same contract as verifyAudioObject, for tutorial how-to videos: HEAD
 * the object, 4KB ranged GET, and lib/mediaSniff's binary signature —
 * only browser-playable MP4/MOV/WebM survives. Anything else (a renamed
 * HTML trap, an MKV, an image) is deleted from the bucket. */
async function verifyVideoObject(key: string): Promise<VideoCheck> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const len = Number(head.ContentLength || 0);
    if (len <= 0 || len > MAX_VIDEO_BYTES) {
      await s3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })).catch(() => {});
      return { ok: false, status: 413, error: 'Video must be between 1 byte and 100MB' };
    }
    const part = await s3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, Range: 'bytes=0-4095' }));
    const head4k = Buffer.from(await (part.Body as any).transformToByteArray());
    const sniff = sniffMedia(head4k);
    if (sniff.kind !== 'video' || !sniff.format || !VIDEO_FORMATS.includes(sniff.format)) {
      await s3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })).catch(() => {});
      return { ok: false, status: 415, error: 'Not a browser-playable MP4, MOV or WebM video — the file was discarded' };
    }
    return { ok: true, contentType: sniff.format === 'mp4' ? 'video/mp4' : `video/${sniff.format}`, bytes: len, storedType: head.ContentType || '' };
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) {
      return { ok: false, status: 404, error: 'Uploaded video not found — try the upload again' };
    }
    console.error('tutorial verify failed:', err);
    return { ok: false, status: 500, error: 'Could not verify the video — try again' };
  }
}

async function verifyAudioObject(key: string): Promise<AudioCheck> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const len = Number(head.ContentLength || 0);
    if (len <= 0 || len > MAX_BYTES) {
      await s3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })).catch(() => {});
      return { ok: false, status: 413, error: 'Audio file must be between 1 byte and 15MB' };
    }
    // Only the first 4KB are needed — every audio signature sits in the header.
    const part = await s3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, Range: 'bytes=0-4095' }));
    const head4k = Buffer.from(await (part.Body as any).transformToByteArray());
    const sniff = sniffMedia(head4k);
    if (sniff.kind !== 'audio' || !sniff.format) {
      await s3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })).catch(() => {});
      return { ok: false, status: 415, error: 'Not a valid MP3, WAV, M4A or OGG audio file — the file was discarded' };
    }
    return { ok: true, contentType: audioMime(sniff.format), bytes: len, storedType: head.ContentType || '' };
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) {
      return { ok: false, status: 404, error: 'Uploaded file not found — try the upload again' };
    }
    console.error('verify_audio failed:', err);
    return { ok: false, status: 500, error: 'Could not verify the upload — try again' };
  }
}

/**
 * Copy the sniffed content-type back onto the object so what gets served
 * always matches what the bytes really are (clients PUT their own header).
 */
async function setContentType(key: string, contentType: string): Promise<void> {
  await s3().send(new CopyObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    CopySource: `${S3_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
    MetadataDirective: 'REPLACE',
    ContentType: contentType,
  }));
}

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
      // Per-user cap: presign mints signed S3 URLs — cheap individually, but
      // unlimited in bulk. Shared with the audio presign (same 'presign' scope).
      const rl = await consumeRateLimit('presign', String(userId), PRESIGN_LIMIT, RATE_WINDOW_SEC);
      if (!rl.allowed) return tooManyUploads(res, rl.retryAfterSec);

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
      // Private buckets (M-5): the caller previews this URL immediately, so
      // hand it a 1h presigned link. It is persisted through PUT
      // /api/projects, which normalises it back to the raw object URL — rows
      // never keep an expiring signature, and the worker resolves either
      // form through the S3 API anyway.
      const raw = publicUrl(key);
      // Edge rehost (isolation): the browser PUTs through uploads.propreel.co.za
      // and previews through it too — both verified in the Phase-1 probe.
      return res.status(200).json({ success: true, uploadUrl: toEdgeUrl(uploadUrl), publicUrl: toEdgeUrl((await signS3Url(raw)) || raw), key, expiresIn: 300 });
    }

    // ── POST /api/music?action=verify_upload — server-side binary check ──
    // The bytes go browser→S3 directly, so this is where the upload actually
    // gets validated. Images: sharp parses the real header and only
    // JPEG/PNG/WebP survive — SVGs with embedded scripts, HTML, truncated
    // garbage are deleted from the bucket. Audio (music/ keys, admin only):
    // lib/mediaSniff checks the binary signature and only real audio survives
    // — an image or video renamed to .mp3 is rejected and discarded. The
    // verified content-type is copied back onto the object so what gets
    // served always matches what the bytes really are.
    if (req.method === 'POST' && req.query.action === 'verify_upload') {
      const userId = req.body?.user_id;
      if (!userId) return res.status(401).json({ error: 'Sign in to verify uploads' });
      const requester = await getUser(userId);
      if (!requester) return res.status(401).json({ error: 'Sign in to verify uploads' });
      // Per-user cap: each verify is a real S3 HEAD + ranged GET (+ COPY on
      // success) — the expensive side of the pipeline, counted separately.
      const rl = await consumeRateLimit('verify', String(userId), VERIFY_LIMIT, RATE_WINDOW_SEC);
      if (!rl.allowed) return tooManyUploads(res, rl.retryAfterSec);
      const key = req.body?.key;
      // Two key spaces: images under uploads/<userId>/ (ownership enforced by
      // the prefix — never touch another user's objects) and admin audio
      // under music/ (admin enforced below).
      const isImageKey = typeof key === 'string' && key.startsWith(`uploads/${userId}/`);
      const isAudioKey = typeof key === 'string' && key.startsWith('music/');
      if (!isImageKey && !isAudioKey) {
        return res.status(400).json({ error: 'Invalid upload key' });
      }
      if (isAudioKey) {
        const admin = await requireAdmin(req);
        if (!admin.ok) return res.status(403).json({ error: admin.error });
        const v = await verifyAudioObject(key);
        if (!v.ok) return res.status(v.status).json({ error: v.error });
        if (v.storedType !== v.contentType) await setContentType(key, v.contentType);
        return res.status(200).json({ success: true, contentType: v.contentType, bytes: v.bytes });
      }

      const destroy = async () => { await s3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })).catch(() => {}); };
      try {
        const head = await s3().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        const len = Number(head.ContentLength || 0);
        if (len <= 0 || len > MAX_IMAGE_BYTES) {
          await destroy();
          return res.status(413).json({ error: 'Uploaded image must be between 1 byte and 25MB' });
        }

        // First 64KB covers the whole header chain (frame header, EXIF, XMP)
        // — a large APP1 segment can push the frame header past 4KB, which
        // would make sharp give up and discard a perfectly valid photo.
        const part = await s3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, Range: 'bytes=0-65535' }));
        const header = Buffer.from(await (part.Body as any).transformToByteArray());
        let format: string | undefined;
        try { format = (await sharp(header).metadata()).format; } catch { format = undefined; }
        if (!format || !ALLOWED_IMAGE_FORMATS.includes(format)) {
          await destroy();
          return res.status(415).json({ error: 'Not a valid JPEG, PNG or WebP image — the file was discarded' });
        }

        // Normalise the stored content-type to what the bytes really are
        // (clients PUT their own Content-Type header; this pins it server-side
        // for everything that passes verification).
        const normalized = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
        if ((head.ContentType || '') !== normalized) await setContentType(key, normalized);

        // EXIF strip: GPS coordinates on listing photos are sensitive (the
        // address in the caption is ours to publish — the camera's location
        // pin is not). sharp drops ALL metadata on re-encode, and rotate()
        // bakes the orientation flag in first so phone photos don't flip.
        // Only files whose header really carries EXIF pay the full GET +
        // re-encode; everything else passes through byte-for-byte.
        let exifStripped = false;
        if (format === 'jpeg' && header.includes(Buffer.from('Exif\0\0'))) {
          try {
            const full = await s3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
            const raw = Buffer.from(await (full.Body as any).transformToByteArray());
            const rebuilt = await sharp(raw).rotate().jpeg({ quality: 92 }).toBuffer();
            if (rebuilt.length > 0 && rebuilt.length < raw.length * 2) {
              await s3().send(new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: key,
                Body: rebuilt,
                ContentType: normalized,
                ContentLength: rebuilt.length,
              }));
              exifStripped = true;
            }
          } catch (exErr) {
            console.error('EXIF strip failed (non-fatal — image kept):', exErr);
          }
        }
        return res.status(200).json({ success: true, contentType: normalized, bytes: len, exifStripped });
      } catch (err: any) {
        if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
          return res.status(404).json({ error: 'Uploaded file not found — try the upload again' });
        }
        console.error('verify_upload failed:', err);
        return res.status(500).json({ error: 'Could not verify the upload — try again' });
      }
    }

    // ── GET /api/music?action=tutorials — public tutorial list ─────────
    // (Placed BEFORE the generic GET list so the two never mix.) Ordered
    // newest-first by the admin's upload date; viewers get 1h signed edge
    // URLs and rows keep their raw object URLs (M-5, same as tracks).
    if (req.method === 'GET' && req.query.action === 'tutorials') {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLES.SETTINGS,
        FilterExpression: '#t = :tv',
        ExpressionAttributeNames: { '#t': 'type' },
        ExpressionAttributeValues: { ':tv': 'tutorial_video' },
      }));
      const videos = (result.Items || []).sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      const signed = await Promise.all(videos.map(async (v: any) => ({
        ...v,
        url: toEdgeUrl((await signS3Url(v.url)) || v.url),
      })));
      return res.status(200).json({ success: true, tutorials: signed });
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
      // M-5: rows keep the raw object URL (`s3Key` too); the Studio picker
      // gets a 1h signed URL. The fields are spread manually so the stored
      // `url` is never clobbered with an expiring one.
      const signed = await Promise.all(tracks.map(async (t: any) => ({
        ...t,
        url: toEdgeUrl((await signS3Url(t.url)) || t.url),
      })));
      return res.status(200).json({ success: true, tracks: signed });
    }

    // ── POST /api/music?action=tutorial_upload — presigned video PUT ───
    // Admin only. Same size-pinned presign contract as audio (the declared
    // size lands in the signature, so the PUT itself is capped).
    if (req.method === 'POST' && req.query.action === 'tutorial_upload') {
      const admin = await requireAdmin(req);
      if (!admin.ok) return res.status(403).json({ error: admin.error });
      const rl = await consumeRateLimit('presign', String(admin.userId), PRESIGN_LIMIT, RATE_WINDOW_SEC);
      if (!rl.allowed) return tooManyUploads(res, rl.retryAfterSec);

      const { category, contentType, size } = req.body || {};
      if (!category) return res.status(400).json({ error: 'category is required' });
      if (!ALLOWED_VIDEO.includes(contentType)) {
        return res.status(400).json({ error: `contentType must be one of: ${ALLOWED_VIDEO.join(', ')}` });
      }
      const bytes = Number(size);
      if (!Number.isFinite(bytes) || bytes <= 0) {
        return res.status(400).json({ error: 'size (bytes) is required' });
      }
      if (bytes > MAX_VIDEO_BYTES) {
        return res.status(413).json({ error: 'Videos must be 100MB or smaller' });
      }

      const catSlug = String(category).toLowerCase().replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'tutorial';
      const ext = contentType === 'video/quicktime' ? 'mov' : contentType.split('/')[1];
      const key = `tutorials/${Date.now()}-${catSlug}.${ext}`;
      const put = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType, ContentLength: bytes });
      const uploadUrl = await getSignedUrl(s3() as any, put, { expiresIn: 300 });
      return res.status(200).json({ success: true, uploadUrl: toEdgeUrl(uploadUrl), s3Key: key, expiresIn: 300 });
    }

    // ── POST /api/music?action=tutorial_verify — binary video check ────
    if (req.method === 'POST' && req.query.action === 'tutorial_verify') {
      const admin = await requireAdmin(req);
      if (!admin.ok) return res.status(403).json({ error: admin.error });
      const rl = await consumeRateLimit('verify', String(admin.userId), VERIFY_LIMIT, RATE_WINDOW_SEC);
      if (!rl.allowed) return tooManyUploads(res, rl.retryAfterSec);
      const key = req.body?.key;
      if (typeof key !== 'string' || !key.startsWith('tutorials/')) {
        return res.status(400).json({ error: 'Invalid upload key' });
      }
      const v = await verifyVideoObject(key);
      if (!v.ok) return res.status(v.status).json({ error: v.error });
      if (v.storedType !== v.contentType) await setContentType(key, v.contentType);
      return res.status(200).json({ success: true, contentType: v.contentType, bytes: v.bytes });
    }

    // ── POST /api/music?action=tutorial_register — publish metadata ─────
    if (req.method === 'POST' && req.query.action === 'tutorial_register') {
      const admin = await requireAdmin(req);
      if (!admin.ok) return res.status(403).json({ error: admin.error });
      const { title, category, description, language, s3Key, durationSeconds } = req.body || {};
      if (!title || !category || !s3Key) {
        return res.status(400).json({ error: 'title, category and s3Key are required' });
      }
      if (!s3Key.startsWith('tutorials/')) return res.status(400).json({ error: 's3Key must be inside tutorials/' });
      // Belt-and-braces (same as audio): registration re-sniffs the stored
      // bytes, so a request that skipped tutorial_verify still can't
      // publish non-video.
      const check = await verifyVideoObject(s3Key);
      if (!check.ok) return res.status(check.status).json({ error: check.error });
      if (check.storedType !== check.contentType) await setContentType(s3Key, check.contentType);

      const id = `tut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tutorial = {
        id,
        type: 'tutorial_video',
        title: String(title).slice(0, 120),
        category: String(category).slice(0, 60),
        description: String(description || '').slice(0, 300),
        language: String(language || 'en').slice(0, 8),
        s3Key,
        url: publicUrl(s3Key),
        durationSeconds: Number(durationSeconds) || null,
        uploadedBy: admin.userId || null,
        createdAt: new Date().toISOString(),
      };
      await putItem(TABLES.SETTINGS, tutorial);
      return res.status(201).json({ success: true, tutorial: { ...tutorial, url: toEdgeUrl((await signS3Url(tutorial.url)) || tutorial.url) } });
    }

    // ── POST /api/music?action=upload — presigned PUT ────────────────
    if (req.method === 'POST' && req.query.action === 'upload') {
      const admin = await requireAdmin(req);
      if (!admin.ok) return res.status(403).json({ error: admin.error });
      // Same per-user presign budget as the image path (shared scope),
      // keyed by the SESSION identity — not the claimed user_id.
      const rlAudio = await consumeRateLimit('presign', String(admin.userId), PRESIGN_LIMIT, RATE_WINDOW_SEC);
      if (!rlAudio.allowed) return tooManyUploads(res, rlAudio.retryAfterSec);

      const { name, genre, contentType, size } = req.body || {};
      if (!name || !genre) return res.status(400).json({ error: 'name and genre are required' });
      if (!ALLOWED_AUDIO.includes(contentType)) {
        return res.status(400).json({ error: `contentType must be one of: ${ALLOWED_AUDIO.join(', ')}` });
      }
      // The declared size is validated here AND signed into the URL
      // (Content-Length lands in X-Amz-SignedHeaders), so the PUT itself is
      // capped: more bytes than declared break the signature, and declaring
      // >15MB is refused outright.
      const bytes = Number(size);
      if (!Number.isFinite(bytes) || bytes <= 0) {
        return res.status(400).json({ error: 'size (bytes) is required' });
      }
      if (bytes > MAX_BYTES) {
        return res.status(413).json({ error: 'Audio must be 15MB or smaller' });
      }

      const ext = contentType.includes('mpeg') || contentType.includes('mp3') ? 'mp3' : contentType.split('/')[1].replace('x-', '');
      const key = `music/${Date.now()}-${name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-')}.${ext}`;

      const put = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType, ContentLength: bytes });
      const uploadUrl = await getSignedUrl(s3() as any, put, { expiresIn: 300 });

      return res.status(200).json({ success: true, uploadUrl: toEdgeUrl(uploadUrl), s3Key: key, expiresIn: 300 });
    }

    // ── POST /api/music — register uploaded track ────────────────────
    if (req.method === 'POST') {
      const admin = await requireAdmin(req);
      if (!admin.ok) return res.status(403).json({ error: admin.error });

      const { name, genre, s3Key, durationSeconds } = req.body || {};
      if (!name || !genre || !s3Key) return res.status(400).json({ error: 'name, genre and s3Key are required' });
      if (!s3Key.startsWith('music/')) return res.status(400).json({ error: 's3Key must be inside music/' });
      // Belt-and-braces: registration re-sniffs the stored bytes, so a
      // request that skipped verify_upload still can't publish non-audio —
      // every track in the picker (played by all users) passes this gate.
      const check = await verifyAudioObject(s3Key);
      if (!check.ok) return res.status(check.status).json({ error: check.error });
      if (check.storedType !== check.contentType) await setContentType(s3Key, check.contentType);

      const id = `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const track = {
        id,
        type: 'music_track',
        name: String(name).slice(0, 120),
        genre: String(genre).slice(0, 60),
        s3Key,
        url: publicUrl(s3Key),
        durationSeconds: Number(durationSeconds) || null,
        uploadedBy: admin.userId || null,
        createdAt: new Date().toISOString(),
      };
      await putItem(TABLES.SETTINGS, track);
      return res.status(201).json({ success: true, track: { ...track, url: toEdgeUrl((await signS3Url(track.url)) || track.url) } });
    }

    // ── DELETE /api/music?id=xxx [&action=tutorial] ─────────────────
    if (req.method === 'DELETE') {
      const admin = await requireAdmin(req);
      if (!admin.ok) return res.status(403).json({ error: admin.error });

      const id = req.query.id as string;
      if (!id) return res.status(400).json({ error: 'id required' });

      const wantType = req.query.action === 'tutorial' ? 'tutorial_video' : 'music_track';
      const missingLabel = wantType === 'tutorial_video' ? 'Video not found' : 'Track not found';
      const existing = await getItem<any>(TABLES.SETTINGS, { id });
      if (!existing || existing.type !== wantType) {
        return res.status(404).json({ error: missingLabel });
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
