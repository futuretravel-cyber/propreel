/**
 * Builds the support-assistant knowledge index.
 *
 * The corpus is the site's own answer surface — the single FAQ list the Help
 * modal and /faq share, the blog posts, and the user-facing docs/tutorials —
 * so the chatbot cannot invent a feature or a price that the site doesn't
 * already state. Re-runs on every `npm run build`, so documenting a new
 * feature is all it takes to teach the assistant about it.
 *
 * Output: lib/chatIndex.json (bundled into the API function, never into the
 * shipped client bundle — see scripts/check-bundle-stealth.mjs).
 *
 * Run: npx tsx scripts/build-chat-index.ts
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { FAQS } from '../src/lib/faq';
import { getAllPosts } from '../src/blog/posts';
import {
  TIERS,
  CREDIT_PACK_RAND,
  NARRATION_CREDITS,
  NARRATION_WORDS_PER_SEC,
  FLASHHEAD_CREDITS_PER_10S,
  FLASHHEAD_MAX_SECONDS,
  scriptCreditsForDuration,
} from '../lib/renderPricing';
import { CAMERA_MOVE_LABEL, ROOM_TYPE_LABEL } from '../lib/videoPrompts';
import { IMAGE_PRESETS } from '../src/lib/imagePrompts';
import {
  PLANS,
  SIGNUP_BONUS,
  SA_LANGUAGES,
  DEFAULT_VOICE_LANGUAGE,
  ORIENTATIONS,
  ORIENTATION_PHOTO_TIP,
  SOCIAL_PLATFORMS,
} from '../src/lib/constants';
import {
  CREDIT_EXPIRY_RULE,
  CREDIT_ROLLOVER_RULE,
  CREDIT_CANCEL_RULE,
  CREDIT_SPEND_RULE,
} from '../lib/creditPolicy';

export interface Chunk {
  /** Short human label the widget shows as a source, e.g. "FAQ · Credits". */
  source: string;
  /** Route a user can open for the full answer. */
  href: string;
  title: string;
  text: string;
}

/**
 * Vendor and internal-infrastructure vocabulary. The assistant answers
 * customers, so the model must never see (or repeat) which services run
 * underneath — the same invariant the stealth build guard enforces on dist/.
 */
const SCRUB: Array<[RegExp, string]> = [
  [/fal\.ai|fal-ai|fal\.run|fal\.media/gi, 'the render service'],
  [/modal\.run|modal\.com/gi, 'the render service'],
  [/amazonaws|dynamodb|cloudfront|af-south-1|s3 bucket/gi, 'our storage'],
  [/openrouter|narakeet|minimax|hailuo|seedance|seedvr|flashhead|flashvsr|kling|wan-2/gi, 'the media service'],
  [/gpt-4[\w.-]*|gpt-image[\w.-]*/gi, 'the language model'],
  [/groq/gi, 'the assistant service'],
  [/gemini/gi, 'the assistant service'],
  [/\bfal\b|\baws\b/gi, 'the service'],
];

function scrub(text: string): string {
  return SCRUB.reduce((acc, [re, to]) => acc.replace(re, to), text);
}

/** Collapse markdown into readable prose — the model gets text, not syntax. */
function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/\*\*|__/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const clean = (s: string) => scrub(plain(s)).replace(/\s+/g, ' ').trim();

/** Split a markdown file on level-2 headings so each chunk is one topic. */
function splitByHeading(md: string): Array<{ title: string; body: string }> {
  const lines = md.split(/\r?\n/);
  const out: Array<{ title: string; body: string }> = [];
  let title = '';
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body.length > 80) out.push({ title, body });
    buf = [];
  };
  for (const line of lines) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) {
      flush();
      title = m[1].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return out;
}

const chunks: Chunk[] = [];

// ── 1. FAQ (the site's authoritative answers) ─────────────────────────
for (const item of FAQS) {
  chunks.push({
    source: `FAQ · ${item.category}`,
    href: '/faq',
    title: item.q,
    text: clean(`${item.q} ${item.a}`),
  });
}

// ── 1b. Product facts generated from the price tables ─────────────────
// Prose drifts; these chunks are built from the same constants the checkout
// charges with, so a quoted price, photo cap or resolution is always current.
// Without them the assistant could only say "it depends on the tier" when
// asked how many photos a render takes.
const zar = (credits: number) => `R${(credits * CREDIT_PACK_RAND).toFixed(2)}`;

for (const tier of TIERS) {
  const configs = tier.configurations.map((c) => {
    const res = c.resolution ?? tier.resolution;
    return `${c.duration}-second reel from ${c.images} photos at ${res} costs ${c.credits} credits (${zar(c.credits)})`;
  });
  const maxPhotos = Math.max(...tier.configurations.map((c) => c.images));
  chunks.push({
    source: `Pricing · ${tier.label}`,
    href: '/pricing',
    title: `${tier.label} tier — photo count, duration, resolution and credits`,
    text: clean(
      `${tier.label} tier. ${tier.description} ${configs.join('; ')}. ` +
        `Up to ${maxPhotos} photos per render for this tier; the reel uses exactly the photo count listed for the length you choose. ` +
        `One credit is worth R${CREDIT_PACK_RAND.toFixed(2)}.`
    ),
  });
}

chunks.push({
  source: 'Pricing · Plans',
  href: '/pricing',
  title: 'Monthly plans, included credits and rand prices',
  text: clean(
    `Subscription plans: ${PLANS.map(
      (p: any) => `${p.name} costs R${p.monthlyZar} per month for ${p.monthlyCredits} credits (R${p.annualZar} per month if billed annually)`
    ).join('; ')}. New accounts get ${SIGNUP_BONUS} free credits on signup with no card. ` +
      `Top-up packs cost R${CREDIT_PACK_RAND.toFixed(2)} per credit.`
  ),
});

// Budget maths: the one question every price list invites. Generated from the
// tier table so the counts cannot drift, and stated as arithmetic the model
// can imitate for any other amount — it previously answered "I can't calculate
// that" despite the tier prices being in its notes.
const REF_RAND = 100;
const refCredits = Math.floor(REF_RAND / CREDIT_PACK_RAND);
const reelCount = (credits: number) => Math.floor(refCredits / credits);
chunks.push({
  source: 'Pricing · Budget maths',
  href: '/pricing',
  title: `What R${REF_RAND} buys: credits in, reels out, per tier`,
  text: clean(
    `Budget maths. Credits cost R${CREDIT_PACK_RAND.toFixed(2)} each, so R${REF_RAND} is at least ${refCredits} credits (${REF_RAND} ÷ ${CREDIT_PACK_RAND.toFixed(2)} = ${(REF_RAND / CREDIT_PACK_RAND).toFixed(1)}). For any other amount the same two steps work: divide the rand by ${CREDIT_PACK_RAND.toFixed(2)} to get credits, then divide by the tier's credit price. ` +
      `Per tier, ` +
      TIERS.map(
        (t) =>
          `${t.label} — ${t.configurations
            .map((c) => {
              const n = reelCount(c.credits);
              return `${c.duration}s at ${c.credits} credits gives ${n === 0 ? 'not enough for one reel' : `${n} reel${n === 1 ? '' : 's'}`}`;
            })
            .join(', ')}`
      ).join('. ') +
      `. Renders are charged when they start and a failed render is refunded, so a retry costs nothing. New accounts also get ${SIGNUP_BONUS} free credits — enough for one Essential 30-second reel, so R${REF_RAND} plus the bonus is more than the tier counts above.`
  ),
});

// 1d. Subscription policy. The corpus stated plan prices but never whether a
// plan is REQUIRED, so the assistant hedged on the most basic buying question
// ("do I need a subscription?"). Free accounts are the default since
// 2026-10-21; only legacy trial rows still gate rendering.
const trialSrc = existsSync('lib/trial.ts') ? readFileSync('lib/trial.ts', 'utf8') : '';
const trialDays = /export const TRIAL_DAYS = (\d+)/.exec(trialSrc)?.[1] ?? '7';
const planRate = (p: any) =>
  `R${(p.monthlyZar / p.monthlyCredits).toFixed(2)} per credit`;
chunks.push({
  source: 'Pricing · Subscription or pay-as-you-go',
  href: '/pricing',
  title: 'Do you need a subscription? No — credits, optional plans and the old trial explained',
  text: clean(
    `No subscription is needed to use PropReel. Signing up creates a free account with ${SIGNUP_BONUS} free credits and no card, and every tool — photo edits, staging, furniture removal, Day to Twilight, property descriptions, social posts, the video tiers and the AI Avatar — is paid for with credits, never with a plan. Credits cost R${CREDIT_PACK_RAND.toFixed(2)} each and can be bought whenever you need them (minimum top-up 50 credits = R${(50 * CREDIT_PACK_RAND).toFixed(0)}, paid by card, EFT or SnapScan). ` +
      `Plans are optional and only change what a credit costs: ${PLANS.map(
        (p: any) => `${p.name} is R${p.monthlyZar} a month for ${p.monthlyCredits} credits (${planRate(p)})`
      ).join('; ')}. Plan credits roll over month to month while the plan is active, and a plan can be cancelled at any time without losing credits you already bought. ` +
      `New accounts do not get a timed free trial: they are permanent free accounts with ${SIGNUP_BONUS} free credits and no expiry, created since 21 October 2026. Accounts opened before then with the old ${trialDays}-day trial keep that clock — ${trialDays} days after signup without a subscription, signing in shows a trial-ended notice and rendering stays locked until they subscribe, although projects, branding and credits are kept for 30 days.`
  ),
});

chunks.push({
  source: 'Credits · Rules',
  href: '/faq',
  title: 'How credits expire, roll over, and what cancellation does',
  text: clean(
    `Credit rules. ${CREDIT_EXPIRY_RULE} ${CREDIT_ROLLOVER_RULE} ${CREDIT_CANCEL_RULE} ${CREDIT_SPEND_RULE}`
  ),
});

// ── 2. Blog posts, one chunk per section ──────────────────────────────
const posts: any[] = getAllPosts();
for (const post of posts) {
  let section = post.title as string;
  let buf: string[] = [];
  const flush = () => {
    const body = clean(buf.join(' '));
    if (body.length > 120) {
      chunks.push({
        source: 'Blog',
        href: `/blog/${post.slug}`,
        title: `${post.title} — ${section}`,
        text: clean(`${section}. ${body}`),
      });
    }
    buf = [];
  };
  for (const block of post.blocks ?? []) {
    if (block.type === 'h2' || block.type === 'h3') {
      flush();
      section = block.text;
    } else if (block.type === 'ul' || block.type === 'ol') {
      buf.push((block.items ?? []).join('. '));
    } else {
      buf.push(block.text ?? '');
    }
  }
  flush();
}

// ── 3. User-facing docs and tutorial scripts ──────────────────────────
// Deliberately an allowlist: internal audits, runbooks and cost analysis
// are not customer-facing knowledge.
const DOC_FILES = ['docs/README.md', 'docs/tutorial-videos-guide.md', 'docs/translate-credit-spec.md'];
for (const rel of DOC_FILES) {
  if (!existsSync(rel)) continue;
  const md = readFileSync(rel, 'utf8');
  for (const part of splitByHeading(md)) {
    const text = clean(`${part.title}. ${part.body}`);
    if (text.length < 150) continue;
    chunks.push({ source: 'Docs', href: '/faq', title: `${basename(rel, '.md')}: ${part.title}`, text });
  }
}

const tutorialDir = 'docs/tutorials';
if (existsSync(tutorialDir)) {
  for (const file of readdirSync(tutorialDir).filter((f) => f.endsWith('.md'))) {
    const md = readFileSync(join(tutorialDir, file), 'utf8');
    for (const part of splitByHeading(md)) {
      const text = clean(`${part.title}. ${part.body}`);
      if (text.length < 150) continue;
      chunks.push({ source: 'Tutorial', href: '/dashboard/tutorials', title: part.title, text });
    }
  }
}

// ── 4. Website pages (policies, account lifecycle, tutorial guide) ────
// These pages are JSX, so the text is extracted from the source rather than
// re-typed here: the index cannot drift from what the page actually says.

/** Pull visible prose out of a React page: drop imports, comments, tags,
 *  attributes and `{expressions}`, decode entities, keep the words. */
function jsxProse(src: string): string {
  let out = src;
  out = out.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ');
  out = out.replace(/\/\*[\s\S]*?\*\//g, ' ');
  out = out.replace(/^\s*import[\s\S]*?;\s*$/gm, ' ');
  out = out.replace(/<[^>]*>/g, '\n');
  for (let i = 0; i < 5; i++) out = out.replace(/\{[^{}]*\}/g, ' ');
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
  return out.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

/** Split a page on its <h2> sections so each chunk covers one topic. */
function pageSections(src: string): Array<{ title: string; body: string }> {
  const out: Array<{ title: string; body: string }> = [];
  for (const part of src.split(/(?=<h2)/)) {
    const heading = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(part);
    const title = heading ? jsxProse(heading[1]).replace(/\s+/g, ' ').trim() : 'Overview';
    const body = jsxProse(part);
    if (body.length > 120) out.push({ title, body });
  }
  return out;
}

/** Every single-quoted value of a named field, in source order. */
function fieldStrings(src: string, field: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`${field}:\\s*'((?:\\\\.|[^'])*)'`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1].replace(/\\'/g, "'"));
  return out;
}

const readPage = (rel: string) => (existsSync(rel) ? readFileSync(rel, 'utf8') : '');

// 4a. Policies and account lifecycle — the pages a wrong answer costs money.
const PAGES: Array<{ file: string; href: string; label: string }> = [
  { file: 'src/pages/RefundPolicyPage.tsx', href: '/refund-policy', label: 'Refund & cancellation policy' },
  { file: 'src/pages/TermsOfServicePage.tsx', href: '/terms', label: 'Terms of service' },
  { file: 'src/pages/PrivacyPolicyPage.tsx', href: '/privacy', label: 'Privacy policy' },
  { file: 'src/pages/CookiePolicyPage.tsx', href: '/cookies', label: 'Cookie policy' },
  { file: 'src/pages/AiNoticePage.tsx', href: '/ai-notice', label: 'AI notice' },
  { file: 'src/pages/CancelSubscriptionPage.tsx', href: '/dashboard/cancel-subscription', label: 'Cancelling a subscription' },
  { file: 'src/pages/DeleteAccountPage.tsx', href: '/dashboard/delete-account', label: 'Deleting an account' },
  { file: 'src/pages/StatusPage.tsx', href: '/status', label: 'Service status' },
];

for (const page of PAGES) {
  const src = readPage(page.file);
  if (!src) continue;
  for (const part of pageSections(src)) {
    const text = clean(`${part.title}. ${part.body}`);
    if (text.length < 100) continue;
    chunks.push({ source: page.label, href: page.href, title: `${page.label}: ${part.title}`, text });
  }
}

// 4b. The written quick-start guide on /tutorial (its `steps` array).
const tutorialSrc = readPage('src/pages/TutorialVideoPage.tsx');
if (tutorialSrc) {
  const from = tutorialSrc.indexOf('const steps = [');
  const to = tutorialSrc.indexOf('\n  ];', from);
  const block = from >= 0 && to > from ? tutorialSrc.slice(from, to) : '';
  for (const obj of block.split(/\{\s*id:/).slice(1)) {
    const id = /^\s*(\d+)/.exec(obj)?.[1] ?? '';
    const title = fieldStrings(obj, 'title')[0] ?? '';
    if (!title) continue;
    const description = fieldStrings(obj, 'description')[0] ?? '';
    const detail = fieldStrings(obj, 'detail')[0] ?? '';
    const duration = fieldStrings(obj, 'duration')[0] ?? '';
    const text = clean(`Quick-start step ${id} of 6: ${title} (${duration}). ${description} ${detail}`);
    if (text.length < 80) continue;
    chunks.push({ source: 'Tutorial · Quick start', href: '/tutorial', title: `Step ${id}: ${title}`, text });
  }
}

// 4c. Wizard step copy — the order of the steps plus the helper text.
const WIZARDS: Array<{ file: string; href: string; label: string; name: string }> = [
  { file: 'src/components/VideoWizard.tsx', href: '/dashboard/video', label: 'Video Generator', name: 'the Video Generator' },
  { file: 'src/components/BudgetVideoWizard.tsx', href: '/dashboard/budget-video', label: 'Budget Video', name: 'the Budget Video wizard' },
];

for (const wizard of WIZARDS) {
  const src = readPage(wizard.file);
  if (!src) continue;

  const at = src.indexOf('WIZARD_STEPS');
  const block = at >= 0 ? src.slice(at, src.indexOf('];', at)) : '';
  const labels = fieldStrings(block, 'label');
  if (labels.length) {
    chunks.push({
      source: `${wizard.label} · Steps`,
      href: wizard.href,
      title: `${wizard.label}: the ${labels.length} steps in order`,
      text: clean(
        `${wizard.name} runs in ${labels.length} steps, in this order: ${labels
          .map((l, i) => `${i + 1}. ${l}`)
          .join('; ')}. Users can move back and forth without losing work — drafts are saved.`
      ),
    });
  }

  // Helper copy the fields show under their inputs (long strings only, so
  // short button labels don't drown the useful sentences).
  const helper = [...new Set(['description', 'placeholder', 'hint', 'subtitle'].flatMap((f) => fieldStrings(src, f)))]
    .filter((s) => s.length >= 30 && !s.includes('${') && !/^[a-z-]+$/.test(s))
    .slice(0, 40);
  if (helper.length) {
    chunks.push({
      source: `${wizard.label} · Fields`,
      href: wizard.href,
      title: `${wizard.label}: what each step asks for`,
      text: clean(helper.map((h) => `${h}.`).join(' ')),
    });
  }
}

// 4d. Photo editor tabs (enhance, staging, removal, twilight) and presets.
const photoTabsSrc = readPage('src/components/PhotoEditorTabs.tsx');
if (photoTabsSrc) {
  const text = clean(jsxProse(photoTabsSrc));
  if (text.length > 200) {
    chunks.push({
      source: 'Photo editor · Tabs',
      href: '/dashboard/photo-editor',
      title: 'Photo editor tabs, presets and what each one asks for',
      text,
    });
  }
}

// 4e. Structured choices the pickers offer — generated from the same
// constants the UI renders, so a new voice, language or platform becomes
// answerable the moment it ships instead of waiting for someone to write
// prose about it. Questions like "what languages can the voiceover use?"
// were previously unanswerable: the list only ever existed as array data.
chunks.push({
  source: 'Voiceover · Languages',
  href: '/dashboard/video',
  title: 'Voiceover languages: the 11 official South African languages and the voices for each',
  text: clean(
    `Voiceover languages. The Narrator Voice (Video Generator step 5) and the AI Avatar Video both narrate in any of South Africa's 11 official languages — choose the language first, then a voice that natively speaks it, because a voice cannot read a language it does not speak. ` +
      `${SA_LANGUAGES.map(
        (l) => `${l.label} (${l.id}) has ${l.voices.length} ${l.voices.length === 1 ? 'voice' : 'voices'}: ${l.voices.map((v) => v.label).join(', ')}`
      ).join('; ')}. ` +
      `The default is ${SA_LANGUAGES.find((l) => l.id === DEFAULT_VOICE_LANGUAGE)?.label ?? 'English'}. ` +
      `The script must be written in the selected language: if the voiceover script and the chosen language do not match, the app warns first and offers a one-click translate before anything is rendered.`
  ),
});

chunks.push({
  source: 'Photos · Orientation and size',
  href: '/dashboard/video',
  title: 'Orientation choices, ratios and the photo shape and size each one wants',
  text: clean(
    `Orientation and photo size. ${ORIENTATIONS.map((o) => `${o.label} means ${o.ratio}`).join('; ')}. ` +
      `${ORIENTATIONS.map((o) => `${o.label}: ${ORIENTATION_PHOTO_TIP[o.id]}`).join(' ')} ` +
      `Accepted upload formats are JPG, PNG and WEBP at up to 25 MB per photo. Match the photo shape to the orientation you picked — the reel cover-crops to fill the frame, so a photo of the wrong shape loses its edges.`
  ),
});

chunks.push({
  source: 'Social posts · Limits',
  href: '/dashboard/social',
  title: 'Social caption character limits for each platform',
  text: clean(
    `Social captions per platform. ${SOCIAL_PLATFORMS.map(
      (p) => `${p.label}: up to ${p.charLimit.toLocaleString('en-ZA')} characters — ${p.rules}`
    ).join('; ')}. The over-limit warning uses the platform's real cap, so copy that fits is never cut.`
  ),
});

// 4f. AI Avatar Video photo rules. The numbers are parsed out of the client
// check rather than restated, so tightening the rule updates the answer.
const avatarSrc = readPage('src/lib/useAvatarPhotoIssue.ts');
if (avatarSrc) {
  const minShortSide = /Math\.min\(w, h\)\s*<\s*(\d+)/.exec(avatarSrc)?.[1] ?? '700';
  const landscapeFactor = /w\s*>\s*h\s*\*\s*([\d.]+)/.exec(avatarSrc)?.[1] ?? '1.1';
  const ideal = /ideal:\s*(\d+\s*×\s*\d+\s*square)/.exec(avatarSrc)?.[1] ?? '1080 × 1080 square';
  const widerThan = Math.round((parseFloat(landscapeFactor) - 1) * 100);
  chunks.push({
    source: 'AI Avatar · Photo requirements',
    href: '/dashboard/video',
    title: 'AI Avatar Video: what size and shape the reference photo must be',
    text: clean(
      `AI Avatar Video reference photo. Use a square headshot — ${ideal} is ideal, and the finished avatar clip is itself square, so a square photo maps onto it with no cropping. ` +
        `The minimum is ${minShortSide} px on the short side; anything smaller leaves too few pixels for a clean lip-sync, so the face comes out distorted or the job fails — 720 × 720 px is the practical floor. ` +
        `A landscape photo — one more than about ${widerThan}% wider than it is tall — is centre-cropped, often straight through the face, so crop it square before uploading. ` +
        `The app checks the photo as soon as you pick it and tells you its real dimensions if it is too small or too wide.`
    ),
  });
}

// 4g. Field guidance and validation copy read straight out of the UI.
// "What size must my photo be?" is answered by a string inside a component,
// not by a page: scanning the source for constraint-shaped copy means those
// limits stay exact without being typed twice here.
const CONSTRAINT_RE =
  /\b(at least|at most|up to|minimum|maximum|no more than|must|recommended|recommend|ideal|too small|too large|too big|limit|required|cannot)\b/i;
const MEASURE_RE = /\b\d+\s?(px|mb|kb|characters?|chars?)\b|×\s?\d|\d+\s?x\s?\d/i;

function looksLikeCopy(s: string): boolean {
  return (
    s.split(/\s+/).length >= 4 &&
    !/[{}<>;]/.test(s) &&
    !/^\s*(https?:|\/|\.\/)/.test(s) &&
    !/^[a-z0-9._:/#-]+$/i.test(s) &&
    !/\b(flex|grid|bg-|text-xs|text-sm|rounded|border-|px-|py-|mt-|mb-|gap-|w-full|h-full|className|useState|console)\b/.test(s)
  );
}

function walk(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), ext) : e.name.endsWith(ext) ? [join(dir, e.name)] : []
  );
}

/** Every quoted string in a source file, with `${...}` holes blanked out. */
function quotedStrings(src: string): string[] {
  const out: string[] = [];
  // Quotes may not span lines: an apostrophe in JSX prose ("don't") would
  // otherwise pair with a quote further down and swallow the code between.
  const re = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^{}]*\}/g, ' ').replace(/\\n/g, ' ').replace(/\\'/g, "'");
    out.push(raw.replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** Which dashboard surface a component's guidance belongs to. */
const ROUTES: Record<string, string> = {
  VideoWizard: '/dashboard/video',
  BudgetVideoWizard: '/dashboard/budget-video',
  PhotoEditorTabs: '/dashboard/photo-editor',
  ImageWorkbench: '/dashboard/photo-editor',
  SocialTab: '/dashboard/social',
  DescriptionTab: '/dashboard/video',
  FlashHeadVideo: '/dashboard/video',
  AITalkingProfile: '/dashboard/video',
  EnhancedBilling: '/dashboard/credits',
  CreditSystemDashboard: '/dashboard/credits',
  EnhancedAgency: '/dashboard/agency',
  EnhancedAnalytics: '/dashboard/analytics',
  EnhancedProjects: '/dashboard/projects',
  PropertyListings: '/dashboard/listings',
  SecuritySettings: '/dashboard/settings',
};

const UI_HREF_DEFAULT = '/faq';
const uiFiles = [...walk('src/components', '.tsx'), ...walk('src/pages', '.tsx'), ...walk('src/lib', '.ts')];

for (const file of uiFiles) {
  const base = basename(file).replace(/\.(tsx?|jsx?)$/, '');
  // Admin tooling and the assistant's own copy are not customer knowledge.
  if (base.startsWith('Admin') || base === 'SupportAssistant' || base === 'AdminPanel') continue;

  const facts = [...new Set(quotedStrings(readFileSync(file, 'utf8')))]
    .filter((s) => s.length >= 30 && s.length <= 260)
    .filter((s) => (CONSTRAINT_RE.test(s) || MEASURE_RE.test(s)) && looksLikeCopy(s))
    .slice(0, 40);
  if (facts.length < 2) continue;

  const label = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const href = ROUTES[base] ?? UI_HREF_DEFAULT;
  let buf = '';
  let part = 1;
  const flush = () => {
    if (buf.length > 120) {
      chunks.push({
        source: `UI · ${label}`,
        href,
        title: `${label}: field limits and guidance${part > 1 ? ` (part ${part})` : ''}`,
        text: clean(buf),
      });
      part += 1;
      buf = '';
    }
  };
  for (const fact of facts) {
    if (buf.length + fact.length > 1400) flush();
    buf += (buf ? ' ' : '') + `${fact.replace(/\.$/, '')}.`;
  }
  flush();
}

// 4h. The wizard's Voiceover step (step 5), in detail. The word budget is
// derived from the narration pace constant and the tier durations, so it
// cannot drift from what the counter in the step actually shows.
const tierDurations = [...new Set(TIERS.flatMap((t) => t.configurations.map((c) => c.duration)))].sort(
  (a, b) => a - b
);
const wordsAt = (duration: number) => Math.round(duration * NARRATION_WORDS_PER_SEC);
const wordBudget = tierDurations.map((d) => `${d}s about ${wordsAt(d)} words`).join(', ');
const scriptPrices = tierDurations.map((d) => `${d}s = ${scriptCreditsForDuration(d)}`).join(', ');

chunks.push({
  source: 'Voiceover · Script',
  href: '/dashboard/video',
  title: 'Voiceover step (step 5): the script, the word budget and AI Write',
  text: clean(
    `Voiceover step (Video Generator step 5) — the script. Narration is optional: the Narrator toggle at the top switches it off and the reel renders with music only, and your script and language stay in place for AI Write and the AI Avatar tab. ` +
      `The script box carries a live word budget sized to the video's duration at roughly ${NARRATION_WORDS_PER_SEC} words per second — ${wordBudget}. The counter under the box says how many words are left and turns amber in the last 12 words and red once you are over. Going over never cuts your narration: the clip plays it in full and the final frame holds for a few seconds so the voiceover can finish, but trimming to the number the counter names gives a clean ending. ` +
      `AI Write drafts the script from your Listing details and the photos you uploaded, sized to the duration you picked. It costs ${scriptPrices} credits (1 per 30 seconds, capped at 6) and asks you to confirm the price before it runs. Clear empties the box.`
  ),
});

chunks.push({
  source: 'Voiceover · Language and voice',
  href: '/dashboard/video',
  title: 'Voiceover step: choosing the language and narrator voice, and the mismatch warning',
  text: clean(
    `Voiceover step (step 5) — language and voice. Choose the Voiceover Language first: the Narrator list underneath only ever offers voices that natively speak that language, and changing the language re-picks the first voice for it. Each narrated render is charged ${NARRATION_CREDITS} credit for the narration, shown on the badge beside the Narrator label. The play button beside the list speaks a short sample in the chosen voice and language, and previewing is free. ` +
      `As you type, the step checks whether the script is written in the selected language. On a mismatch it shows a banner offering to translate the script into that language — the banner states the price before you accept — or to keep it as is. Nothing renders while the mismatch is unresolved, because a voice cannot read a language it does not speak and the narration would come out mangled. If the narration runs longer than the tier's duration, the step also warns how many seconds the last frame will hold. ` +
      `The script, language and voice are shared with the AI Avatar Video tab, so what you choose here is what the avatar speaks.`
  ),
});

// 4i. The AI Avatar Video tab — what it needs and what it costs.
chunks.push({
  source: 'AI Avatar · How it works',
  href: '/dashboard/video',
  title: 'AI Avatar Video tab: what it makes and the photo it needs',
  text: clean(
    `AI Avatar Video tab — what it makes. It renders a lip-synced talking-head video of you from one headshot plus a narration script, in any of South Africa's 11 official languages. Reach it from the Avatar tab in the dashboard, or as the optional AI Avatar add-on on step 6 of the Video Generator. ` +
      `The photo: one face, centred, head and shoulders, evenly lit. A 1080 × 1080 square is ideal, and the finished clip is square too, so a square photo maps onto it with no cropping. The minimum is 700 px on the short side — 720 × 720 is the practical floor; a landscape photo more than about 10% wider than it is tall is centre-cropped, which can cut straight through the face. JPEG or PNG up to 25 MB. "Use my branding profile image" reuses the photo from Agent Branding instead of uploading one. The photo is shared with the Video tab, so removing it in one place removes it in the other. As soon as you pick a photo the tab measures it and warns with its real dimensions if it is too small or too wide. ` +
      `The script box arrives pre-filled with the Video tab's AI script and stays in sync in both directions. The avatar speaks the script exactly as written — there is no auto-translation.`
  ),
});

chunks.push({
  source: 'AI Avatar · Price and limits',
  href: '/dashboard/video',
  title: 'AI Avatar Video: price per second, the 90-second cap, and what blocks Generate',
  text: clean(
    `AI Avatar Video — price and limits. Billing is ${FLASHHEAD_CREDITS_PER_10S} credits per 10 seconds of narration, minimum 2 credits, with a hard ${FLASHHEAD_MAX_SECONDS}-second cap (about ${Math.floor(FLASHHEAD_MAX_SECONDS * NARRATION_WORDS_PER_SEC)} words). A script past the cap is refused before anything is charged, and the tab says how long your script actually is. The Generate button carries the exact price for your script and the line beneath it shows your balance. Credits are charged when the render starts; cancelling during the render refunds them, and a failed render is refunded automatically. ` +
      `Generate stays blocked — with the reason spelled out under the button — until there is a photo, a non-empty script, enough credits, a script under the cap, and no unresolved script-vs-language mismatch. ` +
      `The result: the avatar clip renders first, then it is placed in the top-left corner of the reel and its voiceover replaces the reel's own narration. A progress bar tracks elapsed time against a typical render, and the finished clip is stored for 30 days, so download it if you want to keep it.`
  ),
});

// 4j. The three per-photo tags on the Photos step. These are the labels
// agents ask about most precisely ("Photo is from A", "Camera Move",
// "Day to Twilight") and they exist only as button text in the wizard.
const twilightPresets = (IMAGE_PRESETS as Array<{ label: string; category?: string }>)
  .filter((p) => p.category === 'twilight')
  .map((p) => p.label);

chunks.push({
  source: 'Photos step · Tags',
  href: '/dashboard/video',
  title: 'Photos step tags: "Photo is from a", "Camera move" and "Day to Twilight"',
  text: clean(
    `Photos step tags. On the AI tiers every uploaded photo gets three tags under its thumbnail. The Essential tier hides them, because it renders from the photos without AI motion, and the Budget Video wizard shows the same three tags. ` +
      `"Photo is from a" means Interior or Exterior — which way the photo was taken. It tells the renderer what it is looking at, and it sets the camera moves on offer for that photo. ` +
      `"Camera move" is how the camera behaves inside that photo's clip: ${CAMERA_MOVE_LABEL.in} pushes forward into the property, ${CAMERA_MOVE_LABEL.left} sweeps in a wide arc to the left, ${CAMERA_MOVE_LABEL.right} sweeps to the right, and ${CAMERA_MOVE_LABEL.out} pulls back. ${CAMERA_MOVE_LABEL.out} is offered on ${ROOM_TYPE_LABEL.exterior} photos only — retreating out of an interior would exit the room — and switching a photo between Interior and Exterior resets its move to ${CAMERA_MOVE_LABEL.in}, which is the default for every photo. ` +
      `"Day to Twilight" is the light journey for that clip. "Day → Night" (the default) drifts from golden hour into dusk, so the windows glow warm by the end of the clip; "Daylight only" holds steady daylight for the whole clip, with no golden hour and no dusk. ` +
      `The three tags are what the per-photo render instructions are built from, so the AI tiers ask you to set them before Next; the Budget wizard defaults every photo to Interior, ${CAMERA_MOVE_LABEL.in} and Day → Night.`
  ),
});

chunks.push({
  source: 'Render step · Review before assembly',
  href: '/dashboard/video',
  title: 'The render finished: review every clip, then create the final video',
  text: clean(
    `When a render finishes on an AI tier, nothing is stitched yet. The Render step pauses with every generated clip listed and a panel headed "Review each clip before the final video is stitched" — the note under it says plainly that the final video only starts once you create it. ` +
      `Watch each clip in its own player. Under it the footer reads "Clip N of M" with the clip's current camera move, and clips that have already been replaced are marked "re-rolled". ` +
      `When you are happy with all of them, press "Create final video (N clips)". Assembly is free: the tier price you already paid covers narration, music, branding, the avatar if you added one, the endcard and the thumbnail, so stitching the reviewed clips costs nothing extra. ` +
      `If the whole set is wrong, press "Cancel render — unused credits come back" instead: the render charge is refunded and no video is produced. ` +
      `The Essential tier never pauses here — it renders the whole reel in one local pass, so there are no clips to review.`
  ),
});

chunks.push({
  source: 'Render step · Re-roll a clip',
  href: '/dashboard/video',
  title: 'How to change one rendered clip: pick a new camera move or Day to Twilight, then re-roll it',
  text: clean(
    `Changing one clip after the render. Each clip card in the review panel carries two rows of buttons under its player. ` +
      `Camera move offers Zoom in, Left and Right, plus Zoom out on clips tagged Exterior — the same moves the Photos step offered, for this clip alone. Day to Twilight offers "Day → Night" and "Daylight only". ` +
      `Tap the move or light you want: the button highlights to show it is selected but nothing renders yet. The re-roll button at the bottom right of the card changes from "Re-roll" to "Re-roll with changes" and shows its price, and a "reset" link appears so you can drop the change and keep the clip's current move and light. ` +
      `Press "Re-roll with changes" to regenerate only that clip with the new instruction; the card shows "Re-rolling…" and the other clips are untouched. ` +
      `Press "Re-roll" without picking anything to get a fresh attempt at the exact same shot — that is the fix for artefacts like an invented room, a warped wall or fire where there should be none, because a new attempt is a new generation. ` +
      `The price is that clip's share of the tier: the tier's credit price divided by its photo count, rounded up — a 6-photo Social 30-second reel is 34 credits, so one clip is 6 credits — and the button always shows the exact amount before you commit. A failed re-roll keeps the original clip and refunds the charge. Only one re-roll runs at a time, and you cannot create the final video while a re-roll is still in flight.`
  ),
});

chunks.push({
  source: 'Photo editor · Day to Twilight',
  href: '/dashboard/photo-editor',
  title: 'Day to Twilight in the Photo Editor: converting a daytime exterior to dusk',
  text: clean(
    `Day to Twilight in the Photo Editor is a different tool from the Photos-step tag of the same name. The Photos-step tag changes how a clip's light drifts while the reel renders; the Photo Editor tab converts an existing daytime exterior photo into a dusk shot in one click, at 2 credits like every other photo edit. ` +
      `The presets are ${twilightPresets.join(', ')}. Whichever you pick, the architecture stays where it is — walls, windows, roofline and landscaping keep their position and shape — and only the sky, the light and the warm window glow change. ` +
      `It works on exteriors, so use it on the listing's hero shot, then upload that edited image as the first photo of the reel.`
  ),
});

// ── 5. Trim to a sane payload ─────────────────────────────────────────
// Pages carry longer policy paragraphs than the FAQ, so the cap is a little
// roomier than the doc sections (still well inside one retrieval slot).
const MAX_CHARS = 1600;
const finalChunks = chunks
  .map((c) => (c.text.length > MAX_CHARS ? { ...c, text: c.text.slice(0, MAX_CHARS) } : c))
  .filter((c) => c.text.length > 60);

mkdirSync('lib', { recursive: true });
writeFileSync('lib/chatIndex.json', JSON.stringify({ builtAt: new Date().toISOString(), chunks: finalChunks }));

const bytes = Buffer.byteLength(JSON.stringify(finalChunks));
console.log(
  `[chat-index] ${finalChunks.length} chunks (${Math.round(bytes / 1024)} KB) → lib/chatIndex.json ` +
    `— ${FAQS.length} FAQ, ${posts.length} posts, ${finalChunks.filter((c) => c.source === 'Docs' || c.source === 'Tutorial').length} doc sections, ${finalChunks.filter((c) => c.source.startsWith('UI ·')).length} UI fact sections`
);
