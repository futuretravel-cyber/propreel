/**
 * Tutorial video content — the 9 service scripts the tutorial videos are
 * built from (AI Video Generator already has a published recording).
 *
 * Grounded facts only (verified 2026-10-22 against src/App.tsx,
 * lib/renderPricing.ts, src/lib/imagePrompts.ts, src/lib/constants.ts):
 *   Photo Editor /dashboard/photo-editor — 4 tabs, 2⚡ each
 *   Staging presets 8 styles, Removal 4 modes, Twilight styles, Editor presets
 *   Property Description /dashboard/description — 1⚡
 *   Social Media /dashboard/social — 4-step wizard, 2⚡/post,
 *     platforms Instagram 300 / Facebook 500 / WhatsApp 400 / LinkedIn 700 / Twitter
 *   Video Generator /dashboard/video — 8-step wizard; AI Writer = 1⚡ per 30s
 *     (cap 6⚡); AI Avatar (FlashHead) = 2⚡ per 10s of narration
 *   Billing /dashboard/credits — packs at R1.50/credit, plans bundle cheaper,
 *     auto-topup, agency credit transfer
 *   Signup bonus: 5 free credits, no card
 *
 * VO target: ~2.4 words/sec (Narakeet billing rate) → each beat's `vo`
 * drives its own slide's on-screen duration in the assembler.
 *
 * No Fal anywhere in this pipeline: slides render via sharp, voiceover via
 * Narakeet (the product's own narrator), assembly via local ffmpeg.
 */

export type MockSpec =
  | { type: 'presets'; label: string; chips: string[]; cols?: number }
  | { type: 'chips'; label: string; chips: string[]; cols?: number }
  | { type: 'steps'; label: string; steps: string[] }
  | { type: 'compare'; label: string; before: string; after: string }
  | { type: 'platforms'; label: string; cards: { name: string; meta: string }[] }
  | { type: 'script'; label: string; counter: string; lines: number }
  | { type: 'avatar'; label: string; person: string; caption: string }
  | { type: 'billing'; label: string; cards: { name: string; meta: string }[] }
  | { type: 'render'; label: string; state: string };

export interface TutBeat {
  kind: 'hook' | 'step' | 'result' | 'cta';
  stepNo?: number;
  eyebrow?: string;
  heading: string;
  sub?: string;
  bullets?: string[];
  badge?: string;
  mock?: MockSpec;
  /** Narakeet narration for this slide (en-ZA). */
  vo: string;
}

export interface TutService {
  slug: string;
  /** Must match AdminTutorials CATEGORIES exactly. */
  category: string;
  title: string;
  description: string;
  beats: TutBeat[];
}

/** The narrator for every tutorial beat (en-ZA, female).
 *  2026-10-22: Narakeet's account balance was exhausted mid-batch
 *  ("Account limits exceeded"), so the whole set is voiced with edge-tts'
 *  Microsoft neural SA English voice — free, no key, same en-ZA accent. */
export const TUTORIAL_VOICE = 'en-ZA-LeahNeural';

export const TUTORIALS: TutService[] = [
  // ─────────────────────────────────────────────────────────── 1. PHOTO EDITOR
  {
    slug: 'photo-editor',
    category: 'Photo Editor',
    title: 'Fix Up Listing Photos in Seconds',
    description:
      'One-click AI presets — HDR Boost, Clear Blue Sky, Declutter & Clean and more — turn average shots into portal-ready photos for 2 credits each.',
    beats: [
      {
        kind: 'hook',
        eyebrow: 'AI PHOTO EDITOR',
        heading: 'Great listing photos, without Photoshop',
        sub: 'Eleven one-click AI presets. No editing skills. Two credits a photo.',
        badge: '2⚡ per photo',
        vo: 'Great listing photos sell homes — and you should never need Photoshop to get them. PropReel\'s AI Photo Editor fixes a shot in seconds, for just two credits.',
      },
      {
        kind: 'step',
        stepNo: 1,
        eyebrow: 'STEP 1',
        heading: 'Open the Photo Editor tab',
        sub: 'Dashboard → Photo Editor → AI Photo Editor',
        bullets: [
          'Upload the photo you want to fix',
          'JPEG, PNG or WEBP — up to 25MB each',
          'The same page also hosts Staging, Removal and Twilight',
        ],
        mock: { type: 'steps', label: 'Photo Editor', steps: ['AI Photo Editor', 'Virtual Staging', 'Furniture Removal', 'Twilight'] },
        vo: 'From your dashboard, open the Photo Editor tab and upload the photo you want to improve. Everything AI happens on this one page.',
      },
      {
        kind: 'step',
        stepNo: 2,
        eyebrow: 'STEP 2',
        heading: 'Pick a preset',
        sub: 'Real-estate presets, not generic filters',
        bullets: [
          'HDR Boost · Brighten & Warm · Fix Dark Corners',
          'Clear Blue Sky · Golden Sunset · Magic Hour',
          'Lush Green Lawn · Crystal Pool · Fresh White Walls',
          'Declutter & Clean · Remove Cars',
        ],
        mock: { type: 'presets', label: 'Presets', chips: ['HDR Boost', 'Clear Blue Sky', 'Declutter & Clean', 'Lush Green Lawn', 'Remove Cars', 'Crystal Pool'] },
        vo: 'Choose a preset built for property photos: boost the HDR, clear the sky, freshen the lawn, or declutter the room. Each one is tuned for real estate.',
      },
      {
        kind: 'step',
        stepNo: 3,
        eyebrow: 'STEP 3',
        heading: 'Render and compare',
        sub: 'Credits are only charged when the edit succeeds',
        bullets: [
          'Live progress while the AI works',
          'Before-and-after side by side',
          'Happy? Download it or send it straight to a video',
        ],
        mock: { type: 'compare', label: 'Before / After', before: 'Before', after: 'After' },
        vo: 'Hit render and watch the before and after appear side by side. The charge only lands when the edit succeeds — failed edits never cost you credits.',
      },
      {
        kind: 'result',
        heading: 'Portal-ready in under a minute',
        sub: 'Download the photo, or reuse it in Virtual Staging or a video reel',
        badge: '2⚡ per photo · 30-day retention',
        vo: 'Download your finished photo, or feed it straight into staging or a video reel. Every edit is kept safely for thirty days.',
      },
      {
        kind: 'cta',
        heading: 'Try the Photo Editor now',
        sub: 'New accounts start with 5 free credits — no card needed',
        vo: 'Try it today. New accounts start with five free credits, and no card is required. Visit PropReel dot co dot za.',
      },
    ],
  },

  // ────────────────────────────────────────────────────── 2. VIRTUAL STAGING
  {
    slug: 'virtual-staging',
    category: 'Virtual Staging',
    title: 'Stage an Empty Room in Under a Minute',
    description:
      'Furnish empty rooms with eight AI interior styles — Luxury Modern to Home Office — for 2 credits, with an optional brush mask to stage only part of the room.',
    beats: [
      {
        kind: 'hook',
        eyebrow: 'VIRTUAL STAGING',
        heading: 'Empty rooms don\'t sell. Staged rooms do.',
        sub: 'AI-furnished interiors in under a minute — two credits a photo.',
        badge: '2⚡ per photo',
        vo: 'Empty rooms don\'t sell. With PropReel\'s Virtual Staging, you furnish any room with AI in under a minute, for just two credits.',
      },
      {
        kind: 'step',
        stepNo: 1,
        eyebrow: 'STEP 1',
        heading: 'Open Virtual Staging',
        sub: 'Dashboard → Photo Editor → Virtual Staging tab',
        bullets: [
          'Upload a clear photo of the empty room',
          'Wide shots with the full floor visible work best',
          'The room type is detected for you',
        ],
        mock: { type: 'steps', label: 'Photo Editor', steps: ['AI Photo Editor', 'Virtual Staging', 'Furniture Removal', 'Twilight'] },
        vo: 'Open the Virtual Staging tab inside the Photo Editor and upload a photo of the empty room. Clear, wide shots work best.',
      },
      {
        kind: 'step',
        stepNo: 2,
        eyebrow: 'STEP 2',
        heading: 'Choose an interior style',
        sub: 'Eight professionally tuned looks',
        bullets: [
          'Luxury Modern · Scandinavian Minimal · Contemporary Dark',
          'Coastal Relaxed · Family Comfortable · Luxury Bedroom',
          'Home Office · Industrial Loft',
        ],
        mock: { type: 'chips', label: 'Style', chips: ['Luxury Modern', 'Scandinavian Minimal', 'Contemporary Dark', 'Coastal Relaxed', 'Home Office', 'Industrial Loft'], cols: 3 },
        vo: 'Pick an interior style — from Luxury Modern to Scandinavian Minimal, or a dedicated Home Office look. Each is tuned by professional interior designers.',
      },
      {
        kind: 'step',
        stepNo: 3,
        eyebrow: 'STEP 3',
        heading: 'Stage all — or just part',
        sub: 'Optional brush mask for partial staging',
        bullets: [
          'Stage everything with one click',
          'Or brush over just the area you want furnished',
          'Keep the existing furniture you want to highlight',
        ],
        mock: { type: 'presets', label: 'Brush mask', chips: ['Stage all', 'Brush an area'] },
        vo: 'Stage the whole room with one click — or brush over just the part you want furnished, and keep the rest of the photo exactly as it is.',
      },
      {
        kind: 'result',
        heading: 'A furnished photo, ready to list',
        sub: 'Download it, or pair it with a narrated video reel of the same property',
        badge: '2⚡ per photo · refunded if it fails',
        vo: 'Seconds later you have a furnished, market-ready photo. Download it, or pair it with a narrated video reel of the same property.',
      },
      {
        kind: 'cta',
        heading: 'Stage your first room free',
        sub: '5 welcome credits on signup — no card required',
        vo: 'Stage your first room on us. New accounts get five free credits, with no card required. Visit PropReel dot co dot za.',
      },
    ],
  },

  // ─────────────────────────────────────────────────── 3. FURNITURE REMOVAL
  {
    slug: 'furniture-removal',
    category: 'Furniture Removal',
    title: 'Empty a Room With One Click',
    description:
      'Remove all furniture, clutter, personal items or vehicles from a photo with a single click — no mask to paint — for 2 credits.',
    beats: [
      {
        kind: 'hook',
        eyebrow: 'FURNITURE REMOVAL',
        heading: 'Clear the room. Keep the shot.',
        sub: 'One click empties it — no mask to paint. Two credits.',
        badge: '2⚡ per photo',
        vo: 'Selling a furnished home? Sometimes an empty room shows better. PropReel clears it in one click — no mask to paint — for just two credits.',
      },
      {
        kind: 'step',
        stepNo: 1,
        eyebrow: 'STEP 1',
        heading: 'Open the Removal tab',
        sub: 'Dashboard → Photo Editor → Furniture Removal',
        bullets: [
          'Upload the photo you want to clear',
          'Works on any room, driveway or garage shot',
        ],
        mock: { type: 'steps', label: 'Photo Editor', steps: ['AI Photo Editor', 'Virtual Staging', 'Furniture Removal', 'Twilight'] },
        vo: 'Open the Furniture Removal tab and upload the photo you want to clear. It works on living rooms, bedrooms, driveways and garages alike.',
      },
      {
        kind: 'step',
        stepNo: 2,
        eyebrow: 'STEP 2',
        heading: 'Choose what goes',
        sub: 'Four removal modes',
        bullets: [
          'Remove All Furniture — a fully empty room',
          'Remove Clutter Only — tidy, keep the furniture',
          'Remove Personal Items — photos, toothbrushes, mail',
          'Remove Vehicles — cars and bikes out of the driveway',
        ],
        mock: { type: 'chips', label: 'Removal mode', chips: ['Remove All Furniture', 'Remove Clutter Only', 'Remove Personal Items', 'Remove Vehicles'], cols: 2 },
        vo: 'Choose what goes: all the furniture, just the clutter, personal items like family photos, or vehicles in the driveway. Each is a single click.',
      },
      {
        kind: 'step',
        stepNo: 3,
        eyebrow: 'STEP 3',
        heading: 'Render',
        sub: 'The AI rebuilds the room behind what it removes',
        bullets: [
          'Floors, walls and light are reconstructed naturally',
          'Before-and-after compare when it finishes',
          'Only charged when the edit succeeds',
        ],
        mock: { type: 'compare', label: 'Before / After', before: 'Furnished', after: 'Empty' },
        vo: 'Hit render. The AI rebuilds the floors, walls and lighting behind whatever it removes, so the empty room looks completely natural.',
      },
      {
        kind: 'result',
        heading: 'A clean, empty canvas',
        sub: 'Download it — or stage it fresh with Virtual Staging next',
        badge: '2⚡ per photo',
        vo: 'You get a clean, empty canvas — download it as is, or immediately restage it in a fresh style with Virtual Staging.',
      },
      {
        kind: 'cta',
        heading: 'Clear your first room free',
        sub: '5 welcome credits on signup — no card required',
        vo: 'Clear your first room on us. New accounts start with five free credits, no card needed. Visit PropReel dot co dot za.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────── 4. TWILIGHT
  {
    slug: 'twilight',
    category: 'Twilight',
    title: 'Turn Day Into Dusk in One Click',
    description:
      'Blue Hour, Golden Dusk, Night Lights and more — premium twilight photography conversions for 2 credits, shot-anytime.',
    beats: [
      {
        kind: 'hook',
        eyebrow: 'TWILIGHT PHOTOGRAPHY',
        heading: 'The most valuable shot in real estate — on demand',
        sub: 'Blue hour conversions from any daytime photo. Two credits.',
        badge: '2⚡ per photo',
        vo: 'Twilight photos are the most valuable shots in real estate — and you can only normally take them at dusk. PropReel turns any daytime photo into twilight, for two credits.',
      },
      {
        kind: 'step',
        stepNo: 1,
        eyebrow: 'STEP 1',
        heading: 'Open the Twilight tab',
        sub: 'Dashboard → Photo Editor → Twilight',
        bullets: [
          'Upload a clear daytime exterior shot',
          'Front-of-property photos convert best',
        ],
        mock: { type: 'steps', label: 'Photo Editor', steps: ['AI Photo Editor', 'Virtual Staging', 'Furniture Removal', 'Twilight'] },
        vo: 'Open the Twilight tab and upload a daytime exterior photo. Front-of-property shots with visible windows convert best.',
      },
      {
        kind: 'step',
        stepNo: 2,
        eyebrow: 'STEP 2',
        heading: 'Pick your mood',
        sub: 'Four twilight styles',
        bullets: [
          'Blue Hour — the classic deep-blue sky',
          'Golden Dusk — warm, glowing horizon',
          'Night Lights — lit windows, evening calm',
          'Dramatic Sunset — bold colour overhead',
        ],
        mock: { type: 'chips', label: 'Twilight style', chips: ['Blue Hour', 'Golden Dusk', 'Night Lights', 'Dramatic Sunset'], cols: 2 },
        vo: 'Pick your mood: the classic Blue Hour, a warm Golden Dusk, an evening Night Lights look, or a bold Dramatic Sunset.',
      },
      {
        kind: 'step',
        stepNo: 3,
        eyebrow: 'STEP 3',
        heading: 'Render and download',
        sub: 'Windows, garden and sky all relit consistently',
        bullets: [
          'The whole scene is relit — not just the sky',
          'Windows glow naturally against the dusk',
          'Charged only when it succeeds',
        ],
        mock: { type: 'compare', label: 'Before / After', before: 'Midday', after: 'Twilight' },
        vo: 'Render, and the entire scene relights consistently — sky, windows and garden — not just a colour filter on top of the original.',
      },
      {
        kind: 'result',
        heading: 'Scroll-stopping listings',
        sub: 'Use it on portals, brochures and social posts',
        badge: '2⚡ per photo · 30-day retention',
        vo: 'The result stops scrollers on portals and social feeds — and it\'s kept for thirty days, ready for every channel.',
      },
      {
        kind: 'cta',
        heading: 'Convert your first photo free',
        sub: '5 welcome credits on signup — no card required',
        vo: 'Convert your first photo on us — five free credits on signup, no card needed. Visit PropReel dot co dot za.',
      },
    ],
  },

  // ───────────────────────────────────────────── 5. AI AVATAR (FLASHHEAD)
  {
    slug: 'ai-avatar-flashhead',
    category: 'AI Avatar (FlashHead)',
    title: 'Add a Talking Presenter to Your Reel',
    description:
      'Your photo plus your script becomes a lip-synced AI presenter that narrates the video reel — from 2 credits per 10 seconds.',
    beats: [
      {
        kind: 'hook',
        eyebrow: 'AI AVATAR · FLASHHEAD',
        heading: 'Your face. Your voiceover. On every listing.',
        sub: 'A lip-synced AI presenter for your video reels — from 2⚡ per 10 seconds.',
        badge: '2⚡ / 10s of narration',
        vo: 'What if every listing video opened with you — without ever booking a studio? PropReel\'s AI Avatar turns your photo and script into a lip-synced presenter.',
      },
      {
        kind: 'step',
        stepNo: 1,
        eyebrow: 'STEP 1',
        heading: 'Start a video, write the script',
        sub: 'Video Generator → the Voiceover step',
        bullets: [
          'The avatar speaks the same script as the reel',
          'Generate it with the built-in AI Writer',
          'Edit any line — the avatar follows your final text',
        ],
        mock: { type: 'steps', label: 'Video Generator', steps: ['Description', 'Tier & Photos', 'Voiceover', 'AI Avatar', 'Music & Branding', 'Render'] },
        vo: 'Inside the Video Generator, write the voiceover script first — with the built-in AI Writer if you like. Your avatar will speak exactly that text.',
      },
      {
        kind: 'step',
        stepNo: 2,
        eyebrow: 'STEP 2',
        heading: 'Add your photo',
        sub: 'One clear headshot is all it needs',
        bullets: [
          'Front-facing, good lighting',
          'Persisted across the wizard — no re-uploads',
          'Also reusable from your Agent Branding profile',
        ],
        mock: { type: 'avatar', label: 'Presenter', person: 'Your headshot', caption: 'Lip-synced to your script' },
        vo: 'On the AI Avatar step, add one clear photo of yourself. PropReel keeps it for the whole wizard, and lip-syncs it to every word of your script.',
      },
      {
        kind: 'step',
        stepNo: 3,
        eyebrow: 'STEP 3',
        heading: 'Render the reel',
        sub: 'Presenter composited top-left, narrating the tour',
        bullets: [
          'Priced by narration length: 2⚡ per 10-second block',
          'A 30-second script = 6⚡ on top of the render',
          'Progress is shown live, step by step',
        ],
        mock: { type: 'render', label: 'Render', state: 'Avatar clip → full reel' },
        vo: 'Render as usual. Your presenter is composited into the reel, narrating the tour. Pricing is simple: two credits for every ten seconds of narration.',
      },
      {
        kind: 'result',
        heading: 'A branded reel with you in it',
        sub: 'Download, share to WhatsApp or social, or keep in Projects',
        badge: '2⚡ / 10s · kept 30 days',
        vo: 'The finished reel has you in it — ready to download, share to WhatsApp, or post straight to social. Kept safely for thirty days.',
      },
      {
        kind: 'cta',
        heading: 'Put yourself in your next reel',
        sub: '5 welcome credits on signup — no card required',
        vo: 'Put yourself in your next listing reel. Start free with five credits — no card needed. Visit PropReel dot co dot za.',
      },
    ],
  },

  // ──────────────────────────────────────────── 6. PROPERTY DESCRIPTION
  {
    slug: 'property-description',
    category: 'Property Description',
    title: 'Portal-Ready Write-Ups for One Credit',
    description:
      'Fill in the address, features and amenities — AI writes a full, portal-ready listing description for 1 credit.',
    beats: [
      {
        kind: 'hook',
        eyebrow: 'PROPERTY DESCRIPTION',
        heading: 'A full listing write-up, for one credit',
        sub: 'Portals-ready copy in your tone — in seconds.',
        badge: '1⚡ per description',
        vo: 'Staring at a blank page before a portal deadline? PropReel writes your full property description for one credit — in seconds.',
      },
      {
        kind: 'step',
        stepNo: 1,
        eyebrow: 'STEP 1',
        heading: 'Open Property Description',
        sub: 'Dashboard → Property Description',
        bullets: [
          'Start from a saved Listing, or type the details fresh',
          'Address, price, beds, baths and features',
        ],
        mock: { type: 'steps', label: 'Property Description', steps: ['Property facts', 'Amenities', 'Tone & length', 'Generate'] },
        vo: 'Open the Property Description tab. Start from one of your saved listings so the real facts fill in automatically — or type the details fresh.',
      },
      {
        kind: 'step',
        stepNo: 2,
        eyebrow: 'STEP 2',
        heading: 'Set the tone and length',
        sub: 'Written to suit the channel',
        bullets: [
          'Tone options to match your brand voice',
          'Lengths for portals, flyers or social',
          'All eleven official SA languages supported downstream',
        ],
        mock: { type: 'chips', label: 'Tone', chips: ['Professional', 'Warm', 'Luxury', 'Direct'], cols: 2 },
        vo: 'Choose the tone that matches your brand and the length you need — a full portal write-up, a short flyer version, or something in between.',
      },
      {
        kind: 'step',
        stepNo: 3,
        eyebrow: 'STEP 3',
        heading: 'Generate and copy',
        sub: 'Edit anything before you publish',
        bullets: [
          'Full description, generated in seconds',
          'Edit freely — it\'s your copy',
          'Copy straight into Property24 or Private Property',
        ],
        mock: { type: 'script', label: 'Generated copy', counter: '1 credit', lines: 6 },
        vo: 'Generate, and your description arrives in seconds. Edit any line, then copy it straight into your portal listing. It only costs one credit.',
      },
      {
        kind: 'result',
        heading: 'Listing copy that reads like you wrote it',
        sub: 'Kept in your projects — reuse it for social posts next',
        badge: '1⚡ per description',
        vo: 'And because it uses your real listing facts, the copy reads like you wrote it yourself — ready for the portal immediately.',
      },
      {
        kind: 'cta',
        heading: 'Write your first description free',
        sub: '5 welcome credits on signup — no card required',
        vo: 'Write your first description on us — five free credits when you join, no card needed. Visit PropReel dot co dot za.',
      },
    ],
  },

  // ──────────────────────────────────────────────────────── 7. SOCIAL MEDIA
  {
    slug: 'social-media',
    category: 'Social Media',
    title: 'One Listing, Every Platform\'s Post',
    description:
      'A four-step wizard writes platform-tuned captions — Instagram, Facebook, WhatsApp, LinkedIn and X — sized to each character limit, for 2 credits.',
    beats: [
      {
        kind: 'hook',
        eyebrow: 'SOCIAL MEDIA',
        heading: 'Every platform wants different copy. Now you write it once.',
        sub: 'Tuned captions for Instagram, Facebook, WhatsApp, LinkedIn and X — 2⚡ a post.',
        badge: '2⚡ per post',
        vo: 'Instagram wants punch, Facebook wants story, WhatsApp wants it short. PropReel writes every one of those posts from a single set of listing details — for two credits.',
      },
      {
        kind: 'step',
        stepNo: 1,
        eyebrow: 'STEP 1',
        heading: 'Open Social Media',
        sub: 'Dashboard → Social Media — four guided steps',
        bullets: [
          'Step 1: location and price facts',
          'Step 2: features and highlights',
          'Step 3: add your best photo',
          'Step 4: pick a platform and generate',
        ],
        mock: { type: 'steps', label: 'Four steps', steps: ['Location & price', 'Features', 'Photos', 'Platform & generate'] },
        vo: 'Open the Social Media tool. Four guided steps walk you through the listing facts, the highlights, your photos, and the platform you\'re posting to.',
      },
      {
        kind: 'step',
        stepNo: 2,
        eyebrow: 'STEP 2',
        heading: 'Pick your platform',
        sub: 'Each caption is written to its own rules',
        bullets: [
          'Instagram — 300 chars, punchy, hashtags',
          'Facebook — 500 chars, story-style',
          'WhatsApp — 400 chars, broadcast format',
          'LinkedIn — 700 chars, investment angle · X for short',
        ],
        mock: { type: 'platforms', label: 'Platforms', cards: [
          { name: 'Instagram', meta: '300 chars' },
          { name: 'Facebook', meta: '500 chars' },
          { name: 'WhatsApp', meta: '400 chars' },
          { name: 'LinkedIn', meta: '700 chars' },
        ] },
        vo: 'Pick a platform. Each post follows that platform\'s rules — character limit, tone and format — so nothing gets cut off, and nothing reads like a copy-paste.',
      },
      {
        kind: 'step',
        stepNo: 3,
        eyebrow: 'STEP 3',
        heading: 'Generate, preview, copy',
        sub: 'Live previews against every platform\'s limit',
        bullets: [
          'Caption previews per platform',
          'Character counters turn red if you\'re over',
          'Edit, then copy — or save to the project',
        ],
        mock: { type: 'platforms', label: 'Preview', cards: [
          { name: 'Instagram', meta: '248 / 300 ✓' },
          { name: 'Facebook', meta: '441 / 500 ✓' },
          { name: 'WhatsApp', meta: '330 / 400 ✓' },
        ] },
        vo: 'Generate, and preview the caption against every platform\'s character limit — the counters flag anything over. Edit freely, then copy it out.',
      },
      {
        kind: 'result',
        heading: 'A week of posts from one sitting',
        sub: 'Save each post to the project and schedule around launch day',
        badge: '2⚡ per post',
        vo: 'Switch platforms and generate again — the whole set of posts for a launch day, from one sitting, for two credits each.',
      },
      {
        kind: 'cta',
        heading: 'Write your first post free',
        sub: '5 welcome credits on signup — no card required',
        vo: 'Write your first post on us — five free credits on signup, no card needed. Visit PropReel dot co dot za.',
      },
    ],
  },

  // ──────────────────────────────────────────────────────────── 8. AI WRITER
  {
    slug: 'ai-writer',
    category: 'AI Writer',
    title: 'Voiceover Scripts Sized to Your Video',
    description:
      'The Video Generator\'s AI Writer drafts a narration script sized word-for-word to your video length, with a live words-remaining counter — 1⚡ per 30 seconds.',
    beats: [
      {
        kind: 'hook',
        eyebrow: 'AI WRITER',
        heading: 'Never count words for a voiceover again',
        sub: 'Scripts sized exactly to your video length — from 1⚡.',
        badge: '1⚡ per 30 seconds (max 6⚡)',
        vo: 'A voiceover that runs long ruins a reel. PropReel\'s AI Writer sizes your narration script word-perfect to the video you chose — from just one credit.',
      },
      {
        kind: 'step',
        stepNo: 1,
        eyebrow: 'STEP 1',
        heading: 'Reach the Voiceover step',
        sub: 'Video Generator → Voiceover',
        bullets: [
          'Your tier, duration and photos are already chosen',
          'The word target is calculated for you — 2.4 words a second',
          'Listing details automatically ground the script',
        ],
        mock: { type: 'steps', label: 'Video Generator', steps: ['Description', 'Tier & Photos', 'Voiceover', 'AI Avatar', 'Music & Branding', 'Render'] },
        vo: 'In the Video Generator, reach the Voiceover step. Your duration is already chosen, so the script is automatically sized to the exact number of words your reel can hold.',
      },
      {
        kind: 'step',
        stepNo: 2,
        eyebrow: 'STEP 2',
        heading: 'Generate the script',
        sub: 'A live counter keeps you inside the budget',
        bullets: [
          'Words-remaining counter updates as you type',
          'AI drafts it from your real listing facts',
          'Edit any line freely',
        ],
        mock: { type: 'script', label: 'Script editor', counter: 'Words remaining: 12', lines: 6 },
        vo: 'Hit generate. The AI Writer drafts narration from your real listing facts, and a live counter shows exactly how many words your video budget has left.',
      },
      {
        kind: 'step',
        stepNo: 3,
        eyebrow: 'STEP 3',
        heading: 'Pick a voice',
        sub: 'SA English — and all 11 official languages',
        bullets: [
          'Nine SA English voices, plus 10 more languages',
          'Preview before you render',
          'One credit per 30 seconds, capped at six',
        ],
        mock: { type: 'chips', label: 'Voice', chips: ['Aletta', 'Piet', 'Charlize', 'Hilda', 'Riaan', 'Sarah'], cols: 3 },
        vo: 'Pick a voice — nine South African English voices, plus ten more official languages. Scripts cost one credit per thirty seconds, capped at six.',
      },
      {
        kind: 'result',
        heading: 'Narration that fits, every time',
        sub: 'The same script also feeds your AI Avatar presenter',
        badge: '1⚡ / 30s · cap 6⚡',
        vo: 'The result: narration that fits your reel exactly — and if you add an AI presenter later, it speaks this same script.',
      },
      {
        kind: 'cta',
        heading: 'Draft your first script free',
        sub: '5 welcome credits on signup — no card required',
        vo: 'Draft your first script on us — five free credits on signup, no card needed. Visit PropReel dot co dot za.',
      },
    ],
  },

  // ──────────────────────────────────────────────────── 9. BILLING & CREDITS
  {
    slug: 'billing-credits',
    category: 'Billing & Credits',
    title: 'Credits, Packs and Plans Explained',
    description:
      'How PropReel credits work — R1.50 per credit in top-up packs, cheaper bundled in plans, auto-topup, and agency credit transfers.',
    beats: [
      {
        kind: 'hook',
        eyebrow: 'BILLING & CREDITS',
        heading: 'One credit. Every tool. No subscriptions required.',
        sub: 'Top up when you need to — or bundle cheaper with a plan.',
        badge: '1⚡ = R1.50 in packs',
        vo: 'Every tool on PropReel runs on one simple credit. Here\'s how buying them works — and how to pay the least for what you use.',
      },
      {
        kind: 'step',
        stepNo: 1,
        eyebrow: 'STEP 1',
        heading: 'Credits power everything',
        sub: 'The same credit, across every service',
        bullets: [
          'Description 1⚡ · Photo tools 2⚡ a photo',
          'Social post 2⚡ · Script 1⚡ per 30s',
          'Avatar 2⚡ per 10s · Video reels from 5⚡',
        ],
        mock: { type: 'chips', label: 'Prices', chips: ['Description 1⚡', 'Photo edit 2⚡', 'Social post 2⚡', 'Script 1⚡/30s', 'Avatar 2⚡/10s', 'Reel from 5⚡'], cols: 3 },
        vo: 'One credit buys the same everywhere: one for a property description, two for a photo edit, and video reels starting from just five credits.',
      },
      {
        kind: 'step',
        stepNo: 2,
        eyebrow: 'STEP 2',
        heading: 'Top up, or bundle with a plan',
        sub: 'Plans are always cheaper per credit',
        bullets: [
          'Credit packs: R1.50 per credit, any time',
          'Plans bundle credits at a lower effective rate',
          'Annual plans save a further 15%',
        ],
        mock: { type: 'billing', label: 'Ways to buy', cards: [
          { name: 'Credit pack', meta: 'R1.50 / credit' },
          { name: 'Monthly plan', meta: 'Bundle discount' },
          { name: 'Annual plan', meta: 'Extra 15% off' },
        ] },
        vo: 'Buy credits in a top-up pack at one rand fifty each — or bundle them cheaper with a plan, where annual billing saves you another fifteen percent.',
      },
      {
        kind: 'step',
        stepNo: 3,
        eyebrow: 'STEP 3',
        heading: 'Never stall mid-listing',
        sub: 'Auto-topup and agency transfers',
        bullets: [
          'Auto-topup buys credits when your balance runs low',
          'Saved card — set it once, forget it',
          'Agencies: transfer credits to your agents\' accounts',
        ],
        mock: { type: 'billing', label: 'Automation', cards: [
          { name: 'Auto-topup', meta: 'When balance runs low' },
          { name: 'Agency pool', meta: 'Transfer to agents' },
        ] },
        vo: 'Turn on auto-topup and credits reload automatically when your balance runs low. Agency admins can also share a credit pool with every agent on the team.',
      },
      {
        kind: 'result',
        heading: 'Charged only for what succeeds',
        sub: 'Failed renders and edits are refunded — every transaction is listed',
        badge: 'Transparent history · 365-day credit validity',
        vo: 'Everything is auditable: every charge lands in your history, and failed renders are refunded automatically. Purchased credits stay valid for a year.',
      },
      {
        kind: 'cta',
        heading: 'Start with 5 free credits',
        sub: 'No card required — upgrade whenever you\'re ready',
        vo: 'Try it all before you pay: new accounts get five free credits, with no card required. Visit PropReel dot co dot za.',
      },
    ],
  },
];

/** Sanity: every VO beat is non-empty (the assembler skips empty audio). */
export function assertContentValid(): string[] {
  const problems: string[] = [];
  for (const t of TUTORIALS) {
    if (!t.category || !t.slug || !t.title) problems.push(`${t.slug}: missing identity fields`);
    t.beats.forEach((b, i) => {
      if (!b.vo || b.vo.trim().length < 10) problems.push(`${t.slug} beat ${i}: empty vo`);
      if (!b.heading) problems.push(`${t.slug} beat ${i}: empty heading`);
    });
  }
  return problems;
}
