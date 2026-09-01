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
      throw new Error("AWS S3 credentials not configured. Ask an admin to set them in Admin → API & AWS Settings.");
    }
    s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: false, // Virtual-hosted style: https://<bucket>.s3.<region>.amazonaws.com
      // AWS SDK v3 uses SigV4 signing by default — required for af-south-1
    });
  }
  return s3Client;
}

const EXT_CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};

function getContentType(file) {
  if (file.type) return file.type;
  const ext = (file.name || "").split(".").pop()?.toLowerCase() || "";
  return EXT_CONTENT_TYPES[ext] || "application/octet-stream";
}

/**
 * Uploads a file directly to the AWS S3 propreel-raw-assets bucket (af-south-1).
 * Uses PUT with the file's content-type. Logs detailed errors on failure.
 *
 * S3 CORS must include: https://propreel.co.za, https://www.propreel.co.za, https://propreel.base44.app
 *
 * @param {File} file - The file to upload
 * @param {string} keyPrefix - S3 key prefix (e.g. "images", "headshots", "logos", "music", "video-frames")
 * @returns {Promise<string>} The public S3 URL of the uploaded file
 */
export async function uploadToS3(file, keyPrefix = "uploads") {
  const config = await getS3Config();
  const s3 = await getS3Client();

  const ext = (file.name || "file.jpg").split(".").pop() || "jpg";
  const key = `${keyPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const contentType = getContentType(file);

  console.log("[S3 Upload] Starting:", {
    bucket: config.bucket,
    region: config.region,
    key,
    contentType,
    fileSize: file.size,
    fileName: file.name,
  });

  try {
    // Convert File/Blob to ArrayBuffer — avoids "e.getReader is not a function"
    // TypeError that occurs when the SDK tries to treat the File as a ReadableStream
    const bodyBuffer = await file.arrayBuffer();

    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: bodyBuffer,
        ContentType: contentType,
      })
    );

    const url = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
    console.log("[S3 Upload] Success:", url);
    return url;
  } catch (error) {
    // Extract the exact AWS S3 error code and XML body for debugging
    const awsErrorCode = error.name || error.Code || "Unknown";
    const rawBody = error.$response?.body;
    let xmlError = null;
    if (rawBody) {
      try { xmlError = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody); } catch { xmlError = "(unparseable)"; }
    }

    console.error("[S3 Upload] FAILED — AWS Error Details:", {
      // AWS error code: AccessDenied, SignatureDoesNotMatch, InvalidAccessKeyId, etc.
      awsErrorCode,
      awsErrorMessage: error.message,
      // Full SDK metadata: httpStatusCode, requestId, cfId, extendedRequestId, attempts
      metadata: error.$metadata,
      // Raw S3 XML error body if available
      rawXmlError: xmlError,
      rawResponse: error.$response ? {
        statusCode: error.$response.statusCode,
        headers: error.$response.headers,
      } : null,
      // Full error for deep inspection
      fullError: error,
      // Request context
      bucket: config.bucket,
      region: config.region,
      endpoint: `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`,
      key,
      contentType,
      fileName: file.name,
      fileSize: file.size,
    });

    const status = error.$metadata?.httpStatusCode;
    let friendlyMessage;
    if (!status || status === 0 || error.name === "NetworkError") {
      friendlyMessage = "Upload failed: S3 CORS or network error. Ensure S3 CORS includes https://propreel.co.za, https://www.propreel.co.za, and https://propreel.base44.app.";
    } else if (status === 403) {
      friendlyMessage = `Upload failed (${awsErrorCode}): Please check AWS credentials / S3 permissions.`;
    } else if (status === 404) {
      friendlyMessage = "Upload failed: S3 bucket not found. Check bucket name in Admin settings.";
    } else {
      friendlyMessage = `Upload failed (${status} ${awsErrorCode}): ${error.message || "Please check AWS credentials / S3 permissions."}`;
    }
    throw new Error(friendlyMessage);
  }
}