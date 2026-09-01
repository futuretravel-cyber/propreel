import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { base44 } from "@/api/base44Client";

let cachedConfig = null;
let s3Client = null;

async function getS3Config() {
  if (cachedConfig) return cachedConfig;
  const settings = await base44.entities.AppSetting.list();
  const s = settings?.[0];
  cachedConfig = {
    region: s?.aws_s3_region || "af-south-1",
    bucket: s?.aws_s3_bucket_raw || "propreel-raw-assets",
    accessKeyId: s?.aws_access_key_id,
    secretAccessKey: s?.aws_secret_access_key,
  };
  return cachedConfig;
}

async function getS3Client() {
  const config = await getS3Config();
  if (!s3Client) {
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error("AWS S3 credentials not configured. Ask an admin to set them in Admin → AWS Settings.");
    }
    s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return s3Client;
}

/**
 * Uploads a file directly to the AWS S3 raw-assets bucket.
 * @param {File} file - The file to upload
 * @param {string} keyPrefix - S3 key prefix (e.g. "images", "headshots", "logos", "music", "video-frames")
 * @returns {Promise<string>} The public S3 URL of the uploaded file
 */
export async function uploadToS3(file, keyPrefix = "uploads") {
  const config = await getS3Config();
  const s3 = await getS3Client();

  const ext = (file.name || "file.jpg").split(".").pop() || "jpg";
  const key = `${keyPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: file,
      ContentType: file.type || "application/octet-stream",
    })
  );

  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}