/**
 * Presigned GET URLs for user media on our S3 buckets (audit M-5).
 *
 * Rows keep storing the raw object URL; API responses hand the client a
 * short-lived signed URL instead. The key is derived from the stored URL,
 * so OLD rows work with no schema migration, and getSignedUrl is pure
 * local crypto (no network round-trip) — signing on read costs nothing.
 *
 * Deploy-safe: raw URLs stay valid while the buckets are still public, so
 * this ships before the (manual) bucket-policy flip. Checklist for that
 * flip: ShareSheet posts the raw URL to WhatsApp/X — external share links
 * need a story first; emailed P&L/invoice PDF links need long-expiry
 * signing; worker-returned preview URLs are re-signed on next refetch.
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION = process.env.AWS_REGION || 'af-south-1';
const BUCKETS = new Set([
  process.env.AWS_S3_OUTPUT_BUCKET || 'propreel-video-outputs-sa',
  process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets',
]);

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }
  return client;
}

/** Parse one of our S3 object URLs → { bucket, key }, else null. */
export function parseObjectUrl(url: string): { bucket: string; key: string } | null {
  try {
    const u = new URL(url);
    const suffix = `.s3.${REGION}.amazonaws.com`;
    if (!u.hostname.endsWith(suffix)) return null;
    const bucket = u.hostname.slice(0, -suffix.length);
    if (!BUCKETS.has(bucket)) return null;
    const key = decodeURIComponent(u.pathname.replace(/^\//, ''));
    return key ? { bucket, key } : null;
  } catch {
    return null;
  }
}

/**
 * Rewrite one of our object URLs onto its CloudFront edge hostname (media
 * origin isolation — docs/uploads-origin-isolation.md §5). The presign is
 * still minted for the BUCKET host: CloudFront, with an S3 origin, rewrites
 * Host back to the origin domain on the origin fetch, so S3 validates the
 * signature unchanged. Only the hostname the browser sees moves.
 *
 * Env-gated: EDGE_RAW_HOST / EDGE_CDN_HOST unset → no-op (instant rollback
 * = unset the vars, all minting reverts to bucket URLs).
 *
 * RESPONSE BOUNDARIES ONLY — never hand a rehosted URL to a server-side
 * fetch (design risk #6: vendor submits, zip assembly, verification stay
 * direct S3).
 */
export function toEdgeUrl<T extends string | null | undefined>(url: T): T {
  if (!url || typeof url !== 'string') return url;
  const obj = parseObjectUrl(url);
  if (!obj) return url;
  const host = edgeHost(obj.bucket);
  if (!host) return url;
  try {
    const u = new URL(url);
    // Keep the original (still-encoded) path and the presigned query byte-
    // for-byte — only the authority changes.
    return `${u.protocol}//${host}${u.pathname}${u.search}` as T;
  } catch {
    return url;
  }
}

/** Configured edge hostname for a bucket; null when unset or malformed. */
function edgeHost(bucket: string): string | null {
  const raw =
    bucket === (process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets')
      ? process.env.EDGE_RAW_HOST
      : bucket === (process.env.AWS_S3_OUTPUT_BUCKET || 'propreel-video-outputs-sa')
        ? process.env.EDGE_CDN_HOST
        : undefined;
  const host = String(raw || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return host && !/[^a-z0-9.\-]/i.test(host) ? host : null;
}

/**
 * Sign one stored URL for GET (1h default). Non-S3 or unparsable URLs pass
 * through untouched, and signing failures fall back to the raw URL — media
 * may degrade to "public bucket" behaviour but must never disappear.
 */
export async function signS3Url(
  url: string | null | undefined,
  expiresIn = 3600
): Promise<string | null | undefined> {
  if (!url || typeof url !== 'string') return url;
  const obj = parseObjectUrl(url);
  if (!obj) return url;
  try {
    return await getSignedUrl(s3(), new GetObjectCommand({ Bucket: obj.bucket, Key: obj.key }), { expiresIn });
  } catch (e) {
    console.error('signS3Url failed (serving raw URL):', e);
    return url;
  }
}

/**
 * Normalise a URL we are about to PERSIST: if it is one of our object URLs,
 * drop any query string so an expiring presigned URL can never be written
 * into a row (the raw URL is the source of truth; signing happens on read).
 * Anything else — including external listing photos — passes through.
 */
export function rawS3Url(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== 'string') return url;
  if (!parseObjectUrl(url)) return url;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

type MediaFields = {
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  photos?: string[];
};

/**
 * Sign the media fields of a project/listing row (shallow copy), rehosted
 * onto the edge — every call site returns this to the browser.
 */
export async function signProjectUrls<T extends MediaFields>(project: T): Promise<T> {
  if (!project) return project;
  const [videoUrl, thumbnailUrl, photos] = await Promise.all([
    signS3Url(project.videoUrl),
    signS3Url(project.thumbnailUrl),
    project.photos?.length
      ? Promise.all(project.photos.map(p => signS3Url(p).then(v => (v as string) || p)))
      : Promise.resolve(project.photos),
  ]);
  return {
    ...project,
    videoUrl: toEdgeUrl(videoUrl),
    thumbnailUrl: toEdgeUrl(thumbnailUrl),
    photos: Array.isArray(photos) ? photos.map(p => toEdgeUrl(p)) : photos,
  };
}
