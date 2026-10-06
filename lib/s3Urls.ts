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
const RAW_BUCKET = process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets';
const OUTPUT_BUCKET = process.env.AWS_S3_OUTPUT_BUCKET || 'propreel-video-outputs-sa';
/** Regional virtual-hosted suffix — SigV4 covers exactly this host. */
const S3_SUFFIX = `.s3.${REGION}.amazonaws.com`;
const BUCKETS = new Set([OUTPUT_BUCKET, RAW_BUCKET]);

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

/**
 * Parse one of our object URLs → { bucket, key }, else null.
 *
 * Accepts BOTH forms the same object can be addressed by:
 *   • the bucket host (`propreel-raw-assets.s3.af-south-1.amazonaws.com/…`) —
 *     what rows store and what signing mints;
 *   • the media origin (`uploads.propreel.co.za/…`, `cdn.propreel.co.za/…`)
 *     — what response boundaries hand the browser since Phase 2.
 *
 * Recognising the edge form is what keeps a client-echoed edge URL from
 * looking like a foreign host: `rawS3Url` can strip its expiring query and
 * `signS3Url` can mint a fresh presign for it, instead of passing the frozen
 * signature through forever (the Phase-3 "frozen presign" bug).
 */
export function parseObjectUrl(url: string): { bucket: string; key: string } | null {
  try {
    const u = new URL(url);
    let bucket: string | null = null;
    if (u.hostname.endsWith(S3_SUFFIX)) {
      bucket = u.hostname.slice(0, -S3_SUFFIX.length);
      if (!BUCKETS.has(bucket)) return null;
    } else {
      // Media origin — the alias CloudFront fronts for exactly one bucket.
      bucket = edgeBucket(u.hostname);
      if (!bucket) return null;
    }
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

/** Trim an edge-host env var to a bare hostname (or null when unset/garbage). */
function normalizeEdgeHost(value: string | undefined): string | null {
  const host = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return host && !/[^a-z0-9.\-]/i.test(host) ? host : null;
}

/** Configured edge hostname for a bucket; null when unset or malformed. */
function edgeHost(bucket: string): string | null {
  const raw =
    bucket === RAW_BUCKET ? process.env.EDGE_RAW_HOST
    : bucket === OUTPUT_BUCKET ? process.env.EDGE_CDN_HOST
    : undefined;
  return normalizeEdgeHost(raw);
}

/**
 * Inverse of `edgeHost`: which bucket an edge hostname fronts. Null when the
 * host isn't one of ours — or when the EDGE_* vars are unset (rollback), in
 * which case edge URLs simply stop parsing, exactly as before Phase 2.
 */
function edgeBucket(host: string): string | null {
  const h = host.toLowerCase();
  const raw = normalizeEdgeHost(process.env.EDGE_RAW_HOST);
  if (raw && raw.toLowerCase() === h) return RAW_BUCKET;
  const cdn = normalizeEdgeHost(process.env.EDGE_CDN_HOST);
  if (cdn && cdn.toLowerCase() === h) return OUTPUT_BUCKET;
  return null;
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
 *
 * Canonical row form is the BUCKET host, never the media origin: server-side
 * consumers (the worker's `fetch_media`, the social-pack zip, the reaper)
 * resolve bucket URLs straight through the S3 API, signature-independent —
 * an edge host in a row would make them depend on a presign we just stripped.
 * So an edge-hosted input (what clients echo back since Phase 2) is rewritten
 * to its bucket host as its query is stripped.
 */
export function rawS3Url(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== 'string') return url;
  const obj = parseObjectUrl(url);
  if (!obj) return url;
  try {
    const u = new URL(url);
    const origin = u.hostname.endsWith(S3_SUFFIX) ? u.origin : `https://${obj.bucket}${S3_SUFFIX}`;
    return `${origin}${u.pathname}`;
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
