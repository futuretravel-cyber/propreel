import { base44 } from "@/api/base44Client";
import { uploadToS3 } from "@/lib/awsS3";

let cachedApiKey = null;

// Hard architectural lock prefix injected into every single request
const ARCHITECTURAL_LOCK_PROMPT = 
  "[CRITICAL SYSTEM OVERRIDE: 100% GEOMETRY & STRUCTURAL LOCK] " +
  "Preserve the exact building architecture, staircases, rooflines, windows, doors, and permanent structures from the source image. " +
  "Do not add, remove, or alter any permanent architectural elements unless explicitly instructed. ";

const NEGATIVE_PROMPT = 
  "altered building structure, moved architectural elements, changed staircases, " +
  "shifted windows, warped walls, distorted proportions, extra rooms, structural mutation, " +
  "text, watermarks, signatures, letters, words, blurry, low resolution.";

const MIN_STRENGTH = 0.20;
const MAX_STRENGTH = 0.42; // Capped strictly at 0.42 to prevent full-frame hallucinations!

async function getApiKey() {
  if (cachedApiKey) return cachedApiKey;
  const settings = await base44.entities.AppSetting.list();
  const s = settings?.[0];
  cachedApiKey = s?.fal_api_key || "";
  return cachedApiKey;
}

export async function generateFalImage(imageUrl, prompt, strength, folder = "ai-edits") {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Fal.ai API key not configured. Set it in Admin → API & AWS Settings.");
  }

  // Force strength to respect safe boundaries so the house doesn't get redrawn
  const safeStrength = Math.min(MAX_STRENGTH, Math.max(MIN_STRENGTH, strength || 0.30));

  const response = await fetch("https://fal.run/fal-ai/flux/dev/image-to-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: ARCHITECTURAL_LOCK_PROMPT + prompt,
      negative_prompt: NEGATIVE_PROMPT,
      image_url: imageUrl,
      strength: safeStrength,
      image_size: {
        width: 1920,
        height: 1080
      },
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

  const imgResponse = await fetch(falImageUrl);
  if (!imgResponse.ok) {
    throw new Error("Failed to download generated image from Fal.ai.");
  }
  const blob = await imgResponse.blob();
  const file = new File([blob], `fal-edit-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
  return await uploadToS3(file, folder);
}