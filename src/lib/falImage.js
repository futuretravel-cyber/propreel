import { base44 } from "@/api/base44Client";
import { uploadToS3 } from "@/lib/awsS3";

let cachedApiKey = null;

const NEGATIVE_PROMPT = "text, watermarks, signatures, letters, words, blurry, distorted geometry, extra rooms, structural mutation, changing staircases, shifting windows, hallucinated built-in furniture, cupboards.";

async function getApiKey() {
  if (cachedApiKey) return cachedApiKey;
  const settings = await base44.entities.AppSetting.list();
  const s = settings?.[0];
  cachedApiKey = s?.fal_api_key || "";
  return cachedApiKey;
}

/**
 * Calls Fal.ai FLUX.2 Turbo Edit API, downloads the generated image,
 * and re-uploads it to the propreel-raw-assets S3 bucket.
 *
 * @param {string} imageUrl - Source image URL (must be publicly accessible)
 * @param {string} prompt - Edit/transformation prompt
 * @param {number} strength - Transformation strength / guidance adjustment
 * @param {string} folder - S3 folder for the re-uploaded result
 * @returns {Promise<string>} S3 URL of the generated image
 */
export async function generateFalImage(imageUrl, prompt, strength, folder = "ai-edits") {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Fal.ai API key not configured. Ask an admin to set it in Admin → API & AWS Settings.");
  }

  const response = await fetch("https://fal.run/fal-ai/flux-2/turbo/edit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: prompt,
      negative_prompt: NEGATIVE_PROMPT,
      image_urls: [imageUrl],
      image_size: {
        width: 1920,
        height: 1080
      },
      guidance_scale: strength ? strength * 10 : 3.0, // Maps registry scale to FLUX.2 turbo range
      num_images: 1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Fal.ai API error (${response.status}): ${errText || response.statusText}`);
  }

  const data = await response.json();
  const falImageUrl = data.images?.[0]?.url;
  if (!falImageUrl) {
    throw new Error("Fal.ai returned no image URL.");
  }

  // Download the generated image and re-upload to S3
  const imgResponse = await fetch(falImageUrl);
  if (!imgResponse.ok) {
    throw new Error("Failed to download generated image from Fal.ai.");
  }
  const blob = await imgResponse.blob();
  const file = new File([blob], `fal-edit-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
  return await uploadToS3(file, folder);
}