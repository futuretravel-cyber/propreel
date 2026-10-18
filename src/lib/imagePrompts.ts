// Image preset metadata for the PropReel UI (ids, labels, strengths).
// Each render costs 2 credits.
//
// SECURITY: prompt + negativePrompt text lives ONLY in the Modal worker
// (modal/image_prompts.py) — the worker resolves preset_id → prompt at edit
// time, and full text reaches the admin viewer via GET /api/users?action=image_presets
// (session-gated Vercel route that proxies the worker server-side).
// Never add prompt bodies back here: they would ship in the public bundle.

export interface ImagePreset {
  id: string;
  label: string;
  emoji: string;
  category: 'photo_editor' | 'staging' | 'removal' | 'twilight';
  strength: { min: number; max: number; default: number };
  guidanceScale: { min: number; max: number; default: number };
}

export const IMAGE_PRESETS: ImagePreset[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // AI PHOTO EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'golden_sunset',
    label: 'Golden Sunset Sky',
    emoji: '🌅',
    category: 'photo_editor',
    strength: { min: 0.4, max: 0.45, default: 0.42 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'clear_blue_sky',
    label: 'Clear Blue Sky',
    emoji: '☀️',
    category: 'photo_editor',
    strength: { min: 0.4, max: 0.45, default: 0.42 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'lush_green_lawn',
    label: 'Lush Green Lawn',
    emoji: '🌿',
    category: 'photo_editor',
    strength: { min: 0.3, max: 0.35, default: 0.32 },
    guidanceScale: { min: 4, max: 4, default: 4 }
  },
  {
    id: 'brighten_warm',
    label: 'Brighten & Warm',
    emoji: '💡',
    category: 'photo_editor',
    strength: { min: 0.2, max: 0.3, default: 0.25 },
    guidanceScale: { min: 3.5, max: 4.5, default: 4 }
  },
  {
    id: 'declutter',
    label: 'Declutter & Clean',
    emoji: '🧹',
    category: 'photo_editor',
    strength: { min: 0.35, max: 0.45, default: 0.4 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'hdr_boost',
    label: 'HDR Boost',
    emoji: '🌈',
    category: 'photo_editor',
    strength: { min: 0.2, max: 0.3, default: 0.25 },
    guidanceScale: { min: 3.5, max: 4.5, default: 4 }
  },
  {
    id: 'remove_cars',
    label: 'Remove Cars',
    emoji: '🚗',
    category: 'photo_editor',
    strength: { min: 0.4, max: 0.5, default: 0.45 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'crystal_pool',
    label: 'Crystal Pool',
    emoji: '💧',
    category: 'photo_editor',
    strength: { min: 0.3, max: 0.4, default: 0.35 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'fresh_white_walls',
    label: 'Fresh White Walls',
    emoji: '🎨',
    category: 'photo_editor',
    strength: { min: 0.3, max: 0.35, default: 0.32 },
    guidanceScale: { min: 4, max: 4, default: 4 }
  },
  {
    id: 'magic_hour',
    label: 'Magic Hour',
    emoji: '🌤️',
    category: 'photo_editor',
    strength: { min: 0.4, max: 0.45, default: 0.42 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'fix_dark_corners',
    label: 'Fix Dark Corners',
    emoji: '🔆',
    category: 'photo_editor',
    strength: { min: 0.25, max: 0.3, default: 0.27 },
    guidanceScale: { min: 3.5, max: 4, default: 3.75 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VIRTUAL STAGING
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'luxury_modern',
    label: 'Luxury Modern',
    emoji: '🛋️',
    category: 'staging',
    strength: { min: 0.45, max: 0.55, default: 0.5 },
    guidanceScale: { min: 4.5, max: 5.5, default: 5 }
  },
  {
    id: 'scandinavian_minimal',
    label: 'Scandinavian Minimal',
    emoji: '✨',
    category: 'staging',
    strength: { min: 0.4, max: 0.5, default: 0.45 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'contemporary_dark',
    label: 'Contemporary Dark',
    emoji: '🖤',
    category: 'staging',
    strength: { min: 0.45, max: 0.55, default: 0.5 },
    guidanceScale: { min: 4.5, max: 5.5, default: 5 }
  },
  {
    id: 'coastal_relaxed',
    label: 'Coastal Relaxed',
    emoji: '🌊',
    category: 'staging',
    strength: { min: 0.4, max: 0.5, default: 0.45 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'family_comfortable',
    label: 'Family Comfortable',
    emoji: '👨‍👩‍👧',
    category: 'staging',
    strength: { min: 0.4, max: 0.5, default: 0.45 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'luxury_bedroom',
    label: 'Luxury Bedroom',
    emoji: '🛏️',
    category: 'staging',
    strength: { min: 0.45, max: 0.55, default: 0.5 },
    guidanceScale: { min: 4.5, max: 5.5, default: 5 }
  },
  {
    id: 'home_office',
    label: 'Home Office',
    emoji: '💼',
    category: 'staging',
    strength: { min: 0.4, max: 0.5, default: 0.45 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'industrial_loft',
    label: 'Industrial Loft',
    emoji: '⚙️',
    category: 'staging',
    strength: { min: 0.45, max: 0.55, default: 0.5 },
    guidanceScale: { min: 4.5, max: 5.5, default: 5 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FURNITURE REMOVAL
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'remove_all_furniture',
    label: 'Remove All Furniture',
    emoji: '🗑️',
    category: 'removal',
    strength: { min: 0.5, max: 0.6, default: 0.55 },
    guidanceScale: { min: 4.5, max: 5.5, default: 5 }
  },
  {
    id: 'remove_clutter',
    label: 'Remove Clutter Only',
    emoji: '🧹',
    category: 'removal',
    strength: { min: 0.35, max: 0.45, default: 0.4 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'remove_personal_items',
    label: 'Remove Personal Items',
    emoji: '👤',
    category: 'removal',
    strength: { min: 0.4, max: 0.5, default: 0.45 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'remove_vehicles',
    label: 'Remove Vehicles',
    emoji: '🚗',
    category: 'removal',
    strength: { min: 0.45, max: 0.55, default: 0.5 },
    guidanceScale: { min: 4.5, max: 5.5, default: 5 }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TWILIGHT PHOTOGRAPHY
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'blue_hour',
    label: 'Blue Hour',
    emoji: '🌆',
    category: 'twilight',
    strength: { min: 0.45, max: 0.55, default: 0.5 },
    guidanceScale: { min: 4.5, max: 5.5, default: 5 }
  },
  {
    id: 'golden_dusk',
    label: 'Golden Dusk',
    emoji: '🌇',
    category: 'twilight',
    strength: { min: 0.4, max: 0.5, default: 0.45 },
    guidanceScale: { min: 4.5, max: 5.5, default: 5 }
  },
  {
    id: 'night_lights',
    label: 'Night Lights',
    emoji: '🌃',
    category: 'twilight',
    strength: { min: 0.45, max: 0.55, default: 0.5 },
    guidanceScale: { min: 4.5, max: 5.5, default: 5 }
  },
  {
    id: 'dramatic_sunset',
    label: 'Dramatic Sunset',
    emoji: '🌅',
    category: 'twilight',
    strength: { min: 0.45, max: 0.55, default: 0.5 },
    guidanceScale: { min: 5, max: 6, default: 5.5 }
  },
  {
    id: 'moody_atmospheric',
    label: 'Moody & Atmospheric',
    emoji: '🌫️',
    category: 'twilight',
    strength: { min: 0.4, max: 0.5, default: 0.45 },
    guidanceScale: { min: 4, max: 5, default: 4.5 }
  },
  {
    id: 'festive_evening',
    label: 'Festive Evening',
    emoji: '🎄',
    category: 'twilight',
    strength: { min: 0.45, max: 0.55, default: 0.5 },
    guidanceScale: { min: 4.5, max: 5.5, default: 5 }
  }
];

// Credit cost per image render
export const IMAGE_RENDER_CREDIT_COST = 2;

// Helper functions
export function getPresetsByCategory(category: ImagePreset['category']): ImagePreset[] {
  return IMAGE_PRESETS.filter(p => p.category === category);
}

export function getPresetById(id: string): ImagePreset | undefined {
  return IMAGE_PRESETS.find(p => p.id === id);
}
