/**
 * 30-day media retention — the backend half of the promise the UI makes
 * (RETENTION_NOTICE in src/lib/constants.ts).
 *
 * Runs nightly from the existing process-expired-credits cron (no new
 * serverless function — Vercel Hobby's 12-function cap). Every user media
 * object older than RETENTION_DAYS is permanently deleted:
 *
 *   propreel-video-outputs-sa  renders/ thumbnails/ edited/ upscaled/
 *                              flashhead/ jobs/*.json  (render job payloads)
 *   propreel-raw-assets        uploads/  (photos uploaded from the browser)
 *
 * Deliberately exempt (NOT user media — financial/operational records):
 *   propreel-raw-assets        music/ (admin music library), pnl/,
 *                              invoices/, reports/ (agency PDFs)
 *   propreel-video-outputs-sa  jobs/health/ (fal.ai probe, overwritten)
 */

const OUTPUT_BUCKET = process.env.AWS_S3_OUTPUT_BUCKET || 'propreel-video-outputs-sa';
const RAW_BUCKET = process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets';
const REGION = process.env.AWS_REGION || 'af-south-1';

/** Keep media for 30 days — keep in sync with RETENTION_DAYS in the frontend. */
export const RETENTION_DAYS = 30;

export interface PurgeResult {
  scanned: number;
  deleted: number;
  errors: number;
  cutoff: string;
}

/** Shared S3 client for the output/raw buckets (creds from the Vercel env). */
export async function s3() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

/** Only these key families are purgeable in the raw bucket. */
function rawKeyIsUserMedia(key: string): boolean {
  return key.startsWith('uploads/');
}

/** Never purge these key families in the output bucket. */
function outputKeyIsExempt(key: string): boolean {
  return key.startsWith('jobs/health/');
}

async function purgeBucket(opts: {
  bucket: string;
  include: (key: string) => boolean;
  cutoff: number;
}): Promise<{ scanned: number; deleted: number; errors: number }> {
  const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const client = await s3();
  let scanned = 0;
  let deleted = 0;
  let errors = 0;
  let token: string | undefined;

  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: opts.bucket,
      ContinuationToken: token,
      MaxKeys: 1000,
    }));
    const contents = page.Contents || [];
    token = page.IsTruncated ? page.NextContinuationToken : undefined;

    const doomed = contents.filter(o =>
      o.Key &&
      o.LastModified &&
      o.LastModified.getTime() < opts.cutoff &&
      opts.include(o.Key)
    );
    scanned += contents.length;

    // DeleteObjects batches up to 1000 keys per call.
    for (let i = 0; i < doomed.length; i += 1000) {
      const batch = doomed.slice(i, i + 1000);
      try {
        const res = await client.send(new DeleteObjectsCommand({
          Bucket: opts.bucket,
          Delete: { Objects: batch.map(o => ({ Key: o.Key! })), Quiet: true },
        }));
        deleted += batch.length - (res.Errors?.length || 0);
        errors += res.Errors?.length || 0;
      } catch (err) {
        console.error(`[media-retention] delete batch failed in ${opts.bucket}:`, err);
        errors += batch.length;
      }
    }
  } while (token);

  return { scanned, deleted, errors };
}

/**
 * Delete every user media object in AWS that is older than RETENTION_DAYS.
 * Called nightly; failures are thrown so the cron can record them (the cron
 * wraps each stage independently, so a purge failure never blocks credit
 * expiry or the render reaper).
 */
export async function purgeExpiredMedia(days = RETENTION_DAYS): Promise<PurgeResult> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const [out, raw] = await Promise.all([
    purgeBucket({ bucket: OUTPUT_BUCKET, include: k => !outputKeyIsExempt(k), cutoff }),
    purgeBucket({ bucket: RAW_BUCKET, include: rawKeyIsUserMedia, cutoff }),
  ]);
  return {
    scanned: out.scanned + raw.scanned,
    deleted: out.deleted + raw.deleted,
    errors: out.errors + raw.errors,
    cutoff: new Date(cutoff).toISOString(),
  };
}
