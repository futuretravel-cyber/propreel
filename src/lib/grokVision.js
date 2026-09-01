import { base44 } from "@/api/base44Client";

let cachedApiKey = null;

async function getApiKey() {
  if (cachedApiKey) return cachedApiKey;
  const settings = await base44.entities.AppSetting.list();
  const s = settings?.[0];
  cachedApiKey = s?.xai_api_key || "";
  return cachedApiKey;
}

/**
 * Calls the xAI Grok Vision API (model: grok-2-vision-1212) with a system prompt,
 * user text, and optional image URLs for vision analysis.
 *
 * @param {string} systemPrompt - System message directing the AI's behaviour
 * @param {string} userPrompt - User text prompt with the task details
 * @param {string[]} imageUrls - Optional array of image URLs for vision analysis
 * @returns {Promise<string>} The generated text response
 */
export async function callGrokVision(systemPrompt, userPrompt, imageUrls = []) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("xAI API key not configured. Ask an admin to set it in Admin → API & AWS Settings.");
  }

  const userContent = [
    { type: "text", text: userPrompt },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-2-vision-1212",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`xAI API error (${response.status}): ${errText || response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}