/** International dialing codes for the signup/phone fields */
export const PHONE_COUNTRY_CODES = [
  { code: 'ZA', dial: '+27', label: 'South Africa' },
  { code: 'GB', dial: '+44', label: 'United Kingdom' },
  { code: 'US', dial: '+1', label: 'United States' },
  { code: 'CA', dial: '+1', label: 'Canada' },
  { code: 'AU', dial: '+61', label: 'Australia' },
  { code: 'NZ', dial: '+64', label: 'New Zealand' },
  { code: 'IE', dial: '+353', label: 'Ireland' },
  { code: 'AE', dial: '+971', label: 'United Arab Emirates' },
  { code: 'NG', dial: '+234', label: 'Nigeria' },
  { code: 'KE', dial: '+254', label: 'Kenya' },
  { code: 'GH', dial: '+233', label: 'Ghana' },
  { code: 'EG', dial: '+20', label: 'Egypt' },
  { code: 'ZW', dial: '+263', label: 'Zimbabwe' },
  { code: 'NA', dial: '+264', label: 'Namibia' },
  { code: 'BW', dial: '+267', label: 'Botswana' },
  { code: 'MZ', dial: '+258', label: 'Mozambique' },
  { code: 'ZM', dial: '+260', label: 'Zambia' },
  { code: 'SZ', dial: '+268', label: 'Eswatini' },
  { code: 'LS', dial: '+266', label: 'Lesotho' },
  { code: 'MU', dial: '+230', label: 'Mauritius' },
  { code: 'IN', dial: '+91', label: 'India' },
  { code: 'PK', dial: '+92', label: 'Pakistan' },
  { code: 'BD', dial: '+880', label: 'Bangladesh' },
  { code: 'CN', dial: '+86', label: 'China' },
  { code: 'HK', dial: '+852', label: 'Hong Kong' },
  { code: 'JP', dial: '+81', label: 'Japan' },
  { code: 'KR', dial: '+82', label: 'South Korea' },
  { code: 'SG', dial: '+65', label: 'Singapore' },
  { code: 'TH', dial: '+66', label: 'Thailand' },
  { code: 'ID', dial: '+62', label: 'Indonesia' },
  { code: 'PH', dial: '+63', label: 'Philippines' },
  { code: 'DE', dial: '+49', label: 'Germany' },
  { code: 'FR', dial: '+33', label: 'France' },
  { code: 'NL', dial: '+31', label: 'Netherlands' },
  { code: 'BE', dial: '+32', label: 'Belgium' },
  { code: 'ES', dial: '+34', label: 'Spain' },
  { code: 'IT', dial: '+39', label: 'Italy' },
  { code: 'PT', dial: '+351', label: 'Portugal' },
  { code: 'CH', dial: '+41', label: 'Switzerland' },
  { code: 'AT', dial: '+43', label: 'Austria' },
  { code: 'SE', dial: '+46', label: 'Sweden' },
  { code: 'NO', dial: '+47', label: 'Norway' },
  { code: 'DK', dial: '+45', label: 'Denmark' },
  { code: 'PL', dial: '+48', label: 'Poland' },
  { code: 'RU', dial: '+7', label: 'Russia' },
  { code: 'TR', dial: '+90', label: 'Turkey' },
  { code: 'SA', dial: '+966', label: 'Saudi Arabia' },
  { code: 'IL', dial: '+972', label: 'Israel' },
  { code: 'BR', dial: '+55', label: 'Brazil' },
  { code: 'MX', dial: '+52', label: 'Mexico' },
  { code: 'AR', dial: '+54', label: 'Argentina' },
];

// TIERS lives in lib/renderPricing.ts — one price table shared with the
// API, which prices render jobs itself when minting a paid job token
// (worker-side credit enforcement). Re-exported here so every UI import
// keeps working unchanged.
export { TIERS } from '../../lib/renderPricing';
// Cash price per top-up-pack credit — same constant the server charges with.
export { CREDIT_PACK_RAND } from '../../lib/renderPricing';

export const ORIENTATIONS = [
  { id: 'LANDSCAPE', label: 'Landscape', ratio: '16:9', icon: '▭' },
  { id: 'PORTRAIT', label: 'Portrait', ratio: '9:16', icon: '▯' },
];

/**
 * Photo-resolution guidance per orientation, shown on the Studio's
 * Orientation step. Grounded in the renderer's actual crop math: the
 * canvas fills by cover-crop, so a photo of the WRONG SHAPE loses more
 * the more mismatched it is — 4:3 in 16:9 loses ~24% of the height, a
 * landscape photo in 9:16 loses about 2/3 of its width. And since the
 * reel canvas is Full-HD (with Ken Burns panning on top), sources under
 * 1080 on their short side look soft. Match the shape, keep it ≥1800px
 * on the short side, stay under the 25MB upload cap.
 */
export const ORIENTATION_PHOTO_TIP: Record<string, string> = {
  LANDSCAPE: 'Best photos: landscape shots in 16:9, about 1920×1080 or larger (a phone photo at full size is ideal). Portrait photos get heavily cropped at the sides here.',
  PORTRAIT: 'Best photos: portrait shots in 9:16, about 1080×1920 or larger. Landscape photos get heavily cropped at the sides here — a 4:3 shot loses only a little, 16:9 loses most of the frame.',
};

export interface StudioVoice {
  id: string;
  label: string;
}

export interface VoiceLanguage {
  /** BCP-47 code sent to the worker (Narakeet languageCode) */
  id: string;
  label: string;
  /** Narakeet voice ids that natively speak this language */
  voices: StudioVoice[];
}

/**
 * The 11 official South African languages for voiceover narration.
 * Both the Video Generator's Narrator Voice and the AI Avatar Video use
 * this list — the selected voice must natively speak the selected language,
 * so voices are grouped per language (Narakeet native voices; the worker
 * re-validates the pair because stale clients post legacy voice names).
 */
export const SA_LANGUAGES: VoiceLanguage[] = [
  {
    id: 'af-ZA',
    label: 'Afrikaans',
    voices: [
      { id: 'rolanda', label: 'Rolanda — Female' },
      { id: 'jochem', label: 'Jochem — Male' },
      { id: 'joost', label: 'Joost — Male' },
      { id: 'laurika', label: 'Laurika — Female' },
    ],
  },
  {
    id: 'en-ZA',
    label: 'English',
    // SA accents restored alongside the trimmed US/UK set — the worker's
    // NARAKEET_VOICES['en-ZA'] still accepts exactly these four SA ids
    // (piet/amy are NOT in the worker's list; adding them would let the
    // picker offer a voice the server silently swaps for aletta).
    voices: [
      { id: 'aletta', label: 'Aletta — SA Female' },
      { id: 'charlize', label: 'Charlize — SA Female' },
      { id: 'hilda', label: 'Hilda — SA Female' },
      { id: 'riaan', label: 'Riaan — SA Male' },
      { id: 'joanna', label: 'Joanna — US Female' },
      { id: 'sarah', label: 'Sarah — US Female' },
      { id: 'brian', label: 'Brian — UK Male' },
      { id: 'zach', label: 'Zach — US Male' },
    ],
  },
  {
    id: 'nso-ZA',
    label: 'Sepedi (Northern Sotho)',
    voices: [
      { id: 'mpho', label: 'Mpho — Female' },
      { id: 'mogau', label: 'Mogau — Male' },
    ],
  },
  {
    id: 'st-ZA',
    label: 'Sesotho (Southern Sotho)',
    voices: [{ id: 'palesa', label: 'Palesa — Female' }],
  },
  {
    id: 'tn-ZA',
    label: 'Setswana',
    voices: [{ id: 'bokang', label: 'Bokang — Female' }],
  },
  {
    id: 'xh-ZA',
    label: 'isiXhosa',
    voices: [
      { id: 'thabo', label: 'Thabo — Male' },
      { id: 'lindiwe', label: 'Lindiwe — Female' },
    ],
  },
  {
    id: 'zu-ZA',
    label: 'isiZulu',
    voices: [
      { id: 'nandi', label: 'Nandi — Female' },
      { id: 'menzi', label: 'Menzi — Male' },
      { id: 'zanele', label: 'Zanele — Female' },
      { id: 'themba', label: 'Themba — Male' },
    ],
  },
  {
    id: 'ssw-ZA',
    label: 'siSwati',
    voices: [{ id: 'nomcebo', label: 'Nomcebo — Female' }],
  },
  {
    id: 'tso-ZA',
    label: 'Xitsonga',
    voices: [{ id: 'basetsana', label: 'Basetsana — Female' }],
  },
  {
    id: 'ven-ZA',
    label: 'Tshivenda',
    voices: [{ id: 'mulalo', label: 'Mulalo — Male' }],
  },
  {
    id: 'nr-ZA',
    label: 'isiNdebele (Southern Ndebele)',
    voices: [{ id: 'dumisani', label: 'Dumisani — Male' }],
  },
];

export const DEFAULT_VOICE_LANGUAGE = 'en-ZA';

/** Voices valid for a language — unknown ids fall back to English. */
export function voicesForLanguage(languageId: string): StudioVoice[] {
  return (
    SA_LANGUAGES.find(l => l.id === languageId)?.voices ??
    SA_LANGUAGES.find(l => l.id === DEFAULT_VOICE_LANGUAGE)?.voices ??
    []
  );
}

/**
 * Platform caption limits.
 *
 * `charLimit` is the platform's real hard cap (checked by the over-limit
 * warning); `rules` carries the length we actually recommend to the model.
 * These used to be a single invented "max": Instagram 300, X 240, LinkedIn
 * 700 — which forced agents to cut copy that would have fitted, and told the
 * model to. Sources: Instagram 2,200; X 280; LinkedIn 3,000; TikTok 2,200;
 * Facebook 63,206.
 */
export const SOCIAL_PLATFORMS = [
  {
    id: 'instagram',
    label: 'Instagram',
    charLimit: 2200,
    icon: '📸',
    rules: 'Up to 2,200 chars (aim for 150–300 so the caption is readable before "more"), line breaks between ideas, 5-8 relevant local real estate hashtags'
  },
  {
    id: 'facebook',
    label: 'Facebook',
    charLimit: 63206,
    icon: '👥',
    rules: 'Up to 63,000 chars — aim for 2-4 short paragraphs, story-style, community tone, clear call to action'
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    charLimit: 400,
    icon: '💬',
    rules: 'Around 400 chars for a broadcast message: direct, personal, key highlights as emoji bullet points'
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    charLimit: 3000,
    icon: '💼',
    rules: 'Up to 3,000 chars — 2-3 short paragraphs, professional announcement tone, investment/market potential focus'
  },
  {
    id: 'twitter',
    label: 'X / Twitter',
    charLimit: 280,
    icon: '🐦',
    rules: 'Hard limit 280 chars: price, location, beds/baths and one key highlight, no hashtag stuffing'
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    charLimit: 2200,
    icon: '🎵',
    rules: 'Up to 2,200 chars — casual, trend-aware, youthful caption with 3-5 hashtags'
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    charLimit: 1000,
    icon: '📧',
    rules: 'Max 1,000 chars for the email section: headline, two short paragraphs, one call to action'
  },
];

export const TONES = [
  { id: 'Professional', label: 'Professional', icon: '👔' },
  { id: 'Exciting', label: 'Exciting', icon: '🎉' },
  { id: 'Luxury', label: 'Luxury', icon: '💎' },
  { id: 'Friendly', label: 'Friendly', icon: '😊' },
];

// Import new image prompts
import { getPresetsByCategory } from './imagePrompts';

// SA listing form options — live here (not in PropertyListings) so App.tsx's
// own listing form doesn't pull the 47 KB PropertyListings module into the
// main bundle.
export const PROVINCES = [
  'Western Cape', 'Eastern Cape', 'Northern Cape', 'Free State', 'Gauteng',
  'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West',
];
export const PROPERTY_TYPES = ['House', 'Apartment', 'Townhouse', 'Vacant Land', 'Farm', 'Commercial', 'Industrial'];

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

/**
 * Plan ladder. The `features` strings must only promise what the app
 * actually enforces or delivers: every plan gets every Studio tool, every
 * video tier, every narrator voice and all 7 social platforms — the real
 * differences are the monthly credit allowance, the support level and (on
 * Agency) the shared pool and seats. (An earlier version claimed tier
 * gating, queue priority and per-plan platform counts that nothing in the
 * code enforced.)
 */
export const PLANS = [
  {
    id: 'STARTER', name: 'Starter', monthlyZar: 129, annualZar: 110, monthlyCredits: 110,
    tagline: 'For the solo agent getting started.',
    features: ['110 credits every month', 'Every Studio tool — reels, photo editing, descriptions, social', 'Landscape & portrait reels', 'Agent branding watermark', 'Email support'],
  },
  {
    id: 'PROFESSIONAL', name: 'Professional', monthlyZar: 589, annualZar: 560, monthlyCredits: 520, popular: true,
    tagline: 'For the active agent with a full pipeline.',
    features: ['520 credits every month', 'Everything in Starter, with credits for weekly listings', 'Landscape & portrait reels', 'Agent branding watermark', 'Priority email support'],
  },
  {
    id: 'PREMIUM', name: 'Premium', monthlyZar: 1270, annualZar: 1200, monthlyCredits: 1150,
    tagline: 'For top producers and boutique teams.',
    features: ['1 150 credits every month', 'Everything in Professional, with credits for daily listings', 'Landscape & portrait reels', 'Agent branding watermark', 'Dedicated support line'],
  },
  {
    id: 'AGENCY', name: 'Agency', monthlyZar: 5000, annualZar: 5000, monthlyCredits: 4300,
    tagline: 'For brokerages with a team of agents.',
    features: ['4 300 shared credits every month', 'Up to 25 agent seats', 'Shared credit pool', 'Per-agent spend analytics', 'White-glove onboarding'],
  },
];

export const SIGNUP_BONUS = 5;
/**
 * LIST value of one credit — what the price list assigns to a credit
 * (docs/pricing-cost-analysis.md: actions are valued at credits × R1.50,
 * e.g. a Social 30s reel = 34⚡ = R51). Pricing UI shows these equivalents
 * so customers see the Rand worth of what they hold. NOTE: this is the
 * valuation anchor for the ≈ displays. Top-up packs charge exactly this
 * per credit since 2026-10-21 (CREDIT_PACK_RAND in lib/renderPricing).
 */
export const CREDIT_LIST_RAND = 1.5;
export const STRENGTH_MIN = 0.25;
export const STRENGTH_MAX = 0.35;

// ─── 30-day media retention ───────────────────────────────────────────────
// Every user media object in AWS S3 (rendered videos, thumbnails, AI-edited
// images, uploaded photos, talking-head clips) is purged by the nightly cron
// once it is older than RETENTION_DAYS — see lib/mediaRetention.ts. UI copy
// must use these shared strings so the promise and the cron never drift.
export const RETENTION_DAYS = 30;
export const RETENTION_NOTICE =
  `Media storage: ${RETENTION_DAYS} days — uploaded photos, AI-edited images and rendered videos are kept for ${RETENTION_DAYS} days only, then permanently deleted.`;
export const RETENTION_NOTICE_LONG =
  `Your media is stored for ${RETENTION_DAYS} days only. Photos you upload, images produced by the Photo Editor, Virtual Staging, Furniture Removal and Twilight tools, rendered videos and AI Avatar Video clips are kept for ${RETENTION_DAYS} days and then permanently deleted — automatically, every night. Download anything you want to keep before it expires.`;
