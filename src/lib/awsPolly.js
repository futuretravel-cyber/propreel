import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { base44 } from "@/api/base44Client";
import { uploadToS3 } from "@/lib/awsS3";

let cachedCredentials = null;

async function getCredentials() {
  if (cachedCredentials) return cachedCredentials;
  const settings = await base44.entities.AppSetting.list();
  const s = settings?.[0];
  cachedCredentials = {
    accessKeyId: s?.aws_access_key_id,
    secretAccessKey: s?.aws_secret_access_key,
  };
  return cachedCredentials;
}

/**
 * Generates an MP3 voiceover using AWS Polly with the exact selected voice_id,
 * uploads it to the propreel-raw-assets S3 bucket, and returns the S3 URL.
 *
 * @param {string} text - The script text to synthesize
 * @param {string} voiceId - AWS Polly voice ID (e.g. "Joanna", "Ayanda")
 * @returns {Promise<string>} S3 URL of the generated MP3
 */
export async function generatePollyVoiceover(text, voiceId) {
  const creds = await getCredentials();
  if (!creds.accessKeyId || !creds.secretAccessKey) {
    throw new Error("AWS credentials not configured. Ask an admin to set them in Admin → AWS Settings.");
  }

  // Polly is not available in af-south-1; use us-east-1 for synthesis
  const polly = new PollyClient({
    region: "us-east-1",
    credentials: creds,
  });

  const response = await polly.send(
    new SynthesizeSpeechCommand({
      Text: text,
      VoiceId: voiceId,
      OutputFormat: "mp3",
      Engine: "neural",
      SampleRate: "24000",
    })
  );

  const audioBytes = await response.AudioStream.transformToByteArray();
  const blob = new Blob([audioBytes], { type: "audio/mpeg" });
  const file = new File([blob], `voiceover-${voiceId}-${Date.now()}.mp3`, { type: "audio/mpeg" });

  return await uploadToS3(file, "voiceovers");
}