import { base44 } from "@/api/base44Client";

/**
 * Admin-locked master prompt templates and optimal denoiser strengths.
 * These defaults are hardcoded in this registry module and serve as the
 * fallback when no database override exists in AppSetting.prompt_templates.
 *
 * Strength tiers (per admin policy):
 *   0.20 — Lighting/Color tweaks (subtle, preserves geometry)
 *   0.28 — Surface changes (locks brickwork, stairs, windows)
 *   0.35 — Staging/Removal (controlled addition/removal)
 */
export const DEFAULT_PROMPT_TEMPLATES = {
  // ── AI Photo Editor — Lighting/Color tweaks (0.20) ──
  brighten:     { prompt: "Brighten and warm this real estate photograph. Increase overall exposure slightly, add warm golden ambient lighting, and ensure all rooms appear well-lit and inviting. Apply professional real estate photography color grading with soft, natural tones.", strength: 0.20 },
  hdr:          { prompt: "Apply high dynamic range (HDR) processing to this real estate photo. Enhance crisp details, balance deep shadows and bright highlights, and produce professional architectural photography quality with rich, true-to-life colors and sharp focus throughout.", strength: 0.20 },
  fix_lighting: { prompt: "Fix dark corners and uneven lighting in this real estate photo. Brighten shadowed areas, balance the exposure throughout the room, and ensure every corner is well-lit and visible. Apply even, natural-looking illumination.", strength: 0.20 },
  magic_hour:   { prompt: "Transform this real estate photo to capture magic hour lighting. Apply warm, soft twilight tones with gentle golden light, soft shadows, and an inviting atmosphere. Maintain all structural elements while enhancing the mood.", strength: 0.20 },

  // ── AI Photo Editor — Surface changes (0.28) ──
  paint_walls:  { prompt: "Repaint all walls in this room to a fresh, clean, bright white. Remove any wallpaper, stains, or discoloration. Ensure the new white paint looks smooth and professional while preserving all architectural details, trim, and fixtures exactly as they are.", strength: 0.28 },
  declutter:    { prompt: "Declutter and clean this real estate photo. Remove all small personal items, clutter, and unnecessary objects from surfaces. Straighten remaining items, make beds look pristine, and ensure the space looks like a professionally staged model home.", strength: 0.28 },
  remove_car:   { prompt: "Remove all vehicles, cars, and trucks from the driveway and street in this real estate photo. Replace the removed areas with clean, matching pavement or road surface. Ensure the ground blends naturally with the surrounding environment.", strength: 0.28 },
  pool_sparkle: { prompt: "Enhance the swimming pool in this real estate photo. Make the pool water crystal clear, bright cyan-blue, and pristine. Add gentle sparkle and reflection to the water surface. Ensure the pool deck and surrounding area remain unchanged.", strength: 0.28 },
  sky_golden:   { prompt: "Enhance this real estate photograph by replacing the current sky with a breathtaking golden sunset sky. Add warm, inviting amber and honey-toned lighting across the entire scene. Ensure the property remains the focal point while the sky transitions into rich golden hues with soft cloud formations.", strength: 0.28 },
  sky_blue:     { prompt: "Replace the sky in this real estate photo with a crystal-clear, vibrant blue sky. Remove any clouds or haze. Ensure professional real estate photography quality with crisp, bright lighting that makes the property look inviting and well-lit.", strength: 0.28 },
  lawn:         { prompt: "Restore and enhance the lawn and grass areas in this real estate photo. Make the grass lush, vibrant green, and healthy. Fill in any bare or patchy spots with thick, manicured turf. Ensure the lawn looks professionally maintained and well-watered.", strength: 0.28 },

  // ── Virtual Staging (0.35) ──
  vs_luxury:       { prompt: "Virtually stage this empty room with high-end luxury modern furniture. Add a sleek contemporary sofa in neutral tones, a glass coffee table, designer accent chairs, and elegant decor pieces. Use a refined color palette of whites, grays, and warm metallics. Ensure photorealistic quality with natural shadows and reflections.", strength: 0.35 },
  vs_minimal:      { prompt: "Virtually stage this empty room with Scandinavian minimalist furniture. Add light wood furniture pieces, white textured fabrics, a simple low-profile sofa, and clean open space. Use a bright, airy color palette with natural materials. Ensure photorealistic quality.", strength: 0.35 },
  vs_contemporary: { prompt: "Virtually stage this empty room with contemporary dark furniture. Add a moody, elegant sofa in charcoal or black, dark wood accents, and sophisticated decor. Use deep, rich tones with subtle metallic highlights. Ensure photorealistic quality with dramatic lighting.", strength: 0.35 },
  vs_coastal:      { prompt: "Virtually stage this empty room with coastal relaxed furniture. Add light blue and white upholstered pieces, natural rattan or wicker accents, and breezy textiles. Use a fresh, airy color palette inspired by the seaside. Ensure photorealistic quality.", strength: 0.35 },
  vs_family:       { prompt: "Virtually stage this empty room with cozy, comfortable family-friendly furniture. Add a plush sectional sofa, warm textile throws, soft accent pillows, and a welcoming coffee table. Use warm, inviting tones. Ensure photorealistic quality.", strength: 0.35 },
  vs_bedroom_lux:  { prompt: "Virtually stage this empty room as a luxury master bedroom. Add a plush king-sized bed with high-end linens and layered pillows, elegant nightstands with lamps, and a sophisticated area rug. Use premium fabrics and a refined color palette. Ensure photorealistic quality.", strength: 0.35 },
  vs_office:       { prompt: "Virtually stage this empty room as a premium home office. Add a modern desk, an ergonomic designer chair, stylish bookshelves, and professional decor. Use a productive yet elegant color scheme. Ensure photorealistic quality with natural lighting.", strength: 0.35 },
  vs_industrial:   { prompt: "Virtually stage this empty room with industrial loft furniture. Add a leather sofa, metal and wood accent tables, and raw-textured decor pieces. Use a palette of browns, blacks, and grays with exposed material textures. Ensure photorealistic quality.", strength: 0.35 },

  // ── Furniture Removal (0.35) ──
  fr_all:      { prompt: "Empty this room completely. Remove all furniture, decor, rugs, and personal items. Leave a clean, empty floor with blank walls. Ensure the room looks like a vacant property ready for new occupants. Maintain all architectural features, windows, and fixtures exactly as they are.", strength: 0.35 },
  fr_clutter:  { prompt: "Remove all small clutter and personal items from this room. Clear countertops, tables, and surfaces of papers, magazines, toys, and decorative clutter. Leave the main furniture pieces in place. Ensure the room looks clean, tidy, and professionally presented.", strength: 0.35 },
  fr_personal: { prompt: "Remove all personal photographs, framed pictures, clothes, toys, and private items from this room. Make it look like a depersonalized model home. Keep the main furniture and decor but strip away anything that identifies the current occupant.", strength: 0.35 },
  fr_cars:     { prompt: "Remove all vehicles, cars, and trucks from the driveway and street in this real estate exterior photo. Replace the removed vehicle areas with clean, matching pavement or road surface. Ensure the ground blends naturally with the surrounding environment.", strength: 0.35 },

  // ── Twilight Photography (0.35) ──
  tw_blue_hour:    { prompt: "Convert this daytime exterior real estate photo into a blue hour twilight shot. Replace the sky with a deep, rich blue twilight sky. Turn on all interior and exterior lights so they glow warm and inviting against the blue hour backdrop. Ensure professional architectural twilight photography quality.", strength: 0.35 },
  tw_golden_dusk:  { prompt: "Convert this daytime exterior real estate photo into a golden dusk scene. Replace the sky with a warm, golden sunset sky with soft cloud formations. Turn on all interior lights so they glow warmly. Apply golden ambient lighting across the entire scene.", strength: 0.35 },
  tw_night_lights: { prompt: "Convert this daytime exterior real estate photo into a nighttime shot. Replace the sky with a dark night sky. Turn on all interior and exterior house lights so the property is brilliantly illuminated against the dark sky. Ensure professional nighttime real estate photography quality.", strength: 0.35 },
  tw_sunset_sky:   { prompt: "Convert this daytime exterior real estate photo to feature a dramatic, vibrant sunset sky. Replace the sky with rich reds, oranges, and purples. Turn on all interior lights for a warm glow. Create a striking silhouette effect with the property.", strength: 0.35 },
  tw_moody_dusk:   { prompt: "Convert this daytime exterior real estate photo into a moody, atmospheric twilight scene. Add soft fog or mist, muted twilight tones, and gentle exterior lighting. Apply an architectural-digest-quality atmospheric mood to the entire scene.", strength: 0.35 },
  tw_christmas:    { prompt: "Convert this daytime exterior real estate photo into a festive twilight evening scene. Add warm string lights or subtle holiday lighting glow around the property. Turn on all interior lights. Apply a cozy, inviting evening atmosphere.", strength: 0.35 },
};

let cachedTemplates = null;

/**
 * Loads prompt templates from the AppSetting database record, merging
 * any admin-defined overrides over the hardcoded defaults.
 * @returns {Promise<Object>} Map of option_key -> { prompt, strength }
 */
export async function loadPromptTemplates() {
  if (cachedTemplates) return cachedTemplates;
  try {
    const settings = await base44.entities.AppSetting.list();
    const dbTemplates = settings?.[0]?.prompt_templates;
    if (dbTemplates && typeof dbTemplates === "object" && !Array.isArray(dbTemplates)) {
      cachedTemplates = { ...DEFAULT_PROMPT_TEMPLATES, ...dbTemplates };
    } else {
      cachedTemplates = { ...DEFAULT_PROMPT_TEMPLATES };
    }
  } catch {
    cachedTemplates = { ...DEFAULT_PROMPT_TEMPLATES };
  }
  return cachedTemplates;
}

/**
 * Fetches a single prompt template by option key.
 * @param {string} key - The option key (e.g. "brighten", "vs_luxury", "fr_all")
 * @returns {Promise<{prompt: string, strength: number}|null>}
 */
export async function getPromptTemplate(key) {
  const templates = await loadPromptTemplates();
  return templates[key] || null;
}

/** Clears the in-memory cache so the next call re-fetches from the database. */
export function clearPromptCache() {
  cachedTemplates = null;
}