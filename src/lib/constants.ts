export const TIERS = [
  { 
    id: 'ESSENTIAL', 
    label: 'Essential', 
    description: 'Local FFmpeg zoom/pan render at 1080p',
    processingType: 'local',
    resolution: '1080p',
    configurations: [
      { duration: 30, images: 6, credits: 5 },
      { duration: 60, images: 12, credits: 10 }
    ]
  },
  { 
    id: 'SOCIAL', 
    label: 'Social', 
    description: 'AI Motion at 512p',
    processingType: 'ai',
    resolution: '512p',
    configurations: [
      { duration: 30, images: 5, credits: 30 },
      { duration: 50, images: 10, credits: 50 },
      { duration: 90, images: 15, credits: 80 }
    ]
  },
  { 
    id: 'CINEMATIC', 
    label: 'Cinematic', 
    description: 'AI Motion at 720p',
    processingType: 'ai',
    resolution: '720p',
    configurations: [
      { duration: 30, images: 5, credits: 40 },
      { duration: 60, images: 10, credits: 70 },
      { duration: 90, images: 15, credits: 90 }
    ]
  },
  { 
    id: 'PREMIUM', 
    label: 'Premium', 
    description: 'AI Motion 720p → 1080p upscaled',
    processingType: 'ai_upscaled',
    resolution: '1080p',
    configurations: [
      { duration: 30, images: 5, credits: 60 },
      { duration: 60, images: 10, credits: 100 },
      { duration: 90, images: 15, credits: 150 }
    ]
  },
];

export const ORIENTATIONS = [
  { id: 'LANDSCAPE', label: 'Landscape', ratio: '16:9', icon: '▭' },
  { id: 'PORTRAIT', label: 'Portrait', ratio: '9:16', icon: '▯' },
];

export const VOICES = [
  { id: 'Joanna', label: 'Joanna — US Female (warm)', accent: 'US' },
  { id: 'Kendra', label: 'Kendra — US Female (confident)', accent: 'US' },
  { id: 'Gregory', label: 'Gregory — US Male (authoritative)', accent: 'US' },
  { id: 'Stephen', label: 'Stephen — US Male (calm)', accent: 'US' },
  { id: 'Amy', label: 'Amy — UK Female (elegant)', accent: 'UK' },
  { id: 'Brian', label: 'Brian — UK Male (polished)', accent: 'UK' },
  { id: 'Ayanda', label: 'Ayanda — SA Female (local)', accent: 'ZA' },
];

export const SOCIAL_PLATFORMS = [
  { 
    id: 'instagram', 
    label: 'Instagram', 
    charLimit: 300, 
    icon: '📸',
    rules: 'Max 300 chars, punchy caption, line breaks, 5-8 relevant real estate hashtags'
  },
  { 
    id: 'facebook', 
    label: 'Facebook', 
    charLimit: 500, 
    icon: '👥',
    rules: 'Max 500 chars, engaging story-style post for community groups, call to action'
  },
  { 
    id: 'whatsapp', 
    label: 'WhatsApp', 
    charLimit: 400, 
    icon: '💬',
    rules: 'Max 400 chars, direct, personal broadcast message format with key highlights and emoji bullet points'
  },
  { 
    id: 'linkedin', 
    label: 'LinkedIn', 
    charLimit: 700, 
    icon: '💼',
    rules: 'Max 700 chars, professional announcement tone, investment/market potential focus'
  },
  { 
    id: 'twitter', 
    label: 'X / Twitter', 
    charLimit: 240, 
    icon: '🐦',
    rules: 'Max 240 chars, concise tweet with price, location, beds/baths, and key highlight'
  },
  { 
    id: 'tiktok', 
    label: 'TikTok', 
    charLimit: 300, 
    icon: '🎵',
    rules: 'Max 300 chars, casual, trendy, youthful voiceover-style caption'
  },
  { 
    id: 'newsletter', 
    label: 'Newsletter', 
    charLimit: 1000, 
    icon: '📧',
    rules: 'Max 1000 chars, comprehensive property feature section for monthly email blasts'
  },
];

export const TONES = [
  { id: 'Professional', label: 'Professional', icon: '👔' },
  { id: 'Exciting', label: 'Exciting', icon: '🎉' },
  { id: 'Luxury', label: 'Luxury', icon: '💎' },
  { id: 'Friendly', label: 'Friendly', icon: '😊' },
];

// Import new image prompts
import { IMAGE_PRESETS, getPresetsByCategory } from './imagePrompts';

// Legacy exports for backward compatibility - now using comprehensive prompt library
export const PHOTO_PRESETS = getPresetsByCategory('photo_editor').map(p => ({
  id: p.id,
  label: p.label,
  strength: p.strength.default,
  emoji: p.emoji
}));

export const STAGING_STYLES = getPresetsByCategory('staging').map(p => ({
  id: p.id,
  label: p.label,
  emoji: p.emoji
}));

export const ROOM_TYPES = [
  { id: 'living_room', label: 'Living Room' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'dining_room', label: 'Dining Room' },
  { id: 'home_office', label: 'Home Office' },
  { id: 'patio', label: 'Patio / Outdoor' },
  { id: 'bathroom', label: 'Bathroom' },
];

export const REMOVAL_MODES = getPresetsByCategory('removal').map(p => ({
  id: p.id,
  label: p.label,
  emoji: p.emoji
}));

export const TWILIGHT_STYLES = getPresetsByCategory('twilight').map(p => ({
  id: p.id,
  label: p.label,
  emoji: p.emoji
}));

export const PLANS = [
  {
    id: 'STARTER', name: 'Starter', monthlyZar: 129, annualZar: 110, monthlyCredits: 130,
    tagline: 'For the solo agent getting started.',
    features: ['130 credits every month', 'All 7 Studio tools', 'Landscape & portrait reels', 'Agent branding watermark', 'Email support'],
  },
  {
    id: 'PROFESSIONAL', name: 'Professional', monthlyZar: 589, annualZar: 560, monthlyCredits: 600, popular: true,
    tagline: 'For the active agent with a full pipeline.',
    features: ['600 credits every month', 'Priority render queue', 'AI social captions for 7 platforms', 'Agent profile & verification watermark', 'Priority email support'],
  },
  {
    id: 'PREMIUM', name: 'Premium', monthlyZar: 1270, annualZar: 1200, monthlyCredits: 1300,
    tagline: 'For top producers and boutique teams.',
    features: ['1 300 credits every month', 'Fastest render queue', 'Cinematic + Premium tiers', 'Custom voice selection', 'Dedicated support line'],
  },
  {
    id: 'AGENCY', name: 'Agency', monthlyZar: 5000, annualZar: 5000, monthlyCredits: 5000,
    tagline: 'For brokerages with a team of agents.',
    features: ['5 000 shared credits every month', 'Up to 25 agent seats', 'Shared credit pool', 'Per-agent spend analytics', 'White-glove onboarding'],
  },
];

export const SIGNUP_BONUS = 5;
export const STRENGTH_MIN = 0.25;
export const STRENGTH_MAX = 0.35;
