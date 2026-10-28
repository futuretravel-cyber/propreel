import { TIERS, CREDIT_PACK_RAND } from '../../lib/renderPricing';
import { PLANS, SIGNUP_BONUS, RETENTION_DAYS } from './constants';
import {
  CREDIT_EXPIRY_RULE,
  CREDIT_ROLLOVER_RULE,
  CREDIT_CANCEL_RULE,
  CREDIT_SPEND_RULE,
} from '../../lib/creditPolicy';

export interface FaqItem {
  q: string;
  a: string;
  category: string;
}

// Credit ranges derived from the canonical tier table so this FAQ can never
// drift from what job_token actually charges.
const tierCreditRanges = TIERS.map((t) => {
  const cs = t.configurations.map((c) => c.credits);
  return `${t.label} ${Math.min(...cs)}–${Math.max(...cs)}`;
}).join(', ');
const allTierCredits = TIERS.flatMap((t) => t.configurations.map((c) => c.credits));
const tierCreditSpan = `${Math.min(...allTierCredits)}–${Math.max(...allTierCredits)}`;
const essential30 = TIERS.find((t) => t.id === 'ESSENTIAL')?.configurations[0]?.credits ?? 5;
const agencyCredits = PLANS.find((p) => p.id === 'AGENCY')?.monthlyCredits ?? 0;

/** The single FAQ list — rendered both in the in-app Help modal and on the
 *  public /faq page, which the marketing footer links to. */
export const FAQS: FaqItem[] = [
  {
    category: 'Getting started',
    q: 'How do credits work?',
    a: `Every action in PropReel uses credits: AI photo edits (including staging) cost 2 credits, video tiers cost ${tierCreditSpan} credits depending on tier (${tierCreditRanges}), a property description is 1 credit, a social post is 2 credits, and AI Avatar videos are billed at 2 credits per 10 seconds of narration (90-second cap). You get ${SIGNUP_BONUS} free credits on signup — enough for one Essential 30-second reel (${essential30} credits). Credits are listed at R${CREDIT_PACK_RAND.toFixed(2)} each, so a balance always shows its rand value.`,
  },
  {
    category: 'Getting started',
    q: 'How do I create my first video?',
    a: 'Open the Video Generator and follow the eight steps: add your listing details, pick a tier (Essential is the cheapest way to try it), choose orientation, upload photos, write or generate a voiceover, optionally add an AI Avatar, choose music and branding, then Generate. You can step back and forth without losing anything — drafts are saved automatically.',
  },
  {
    category: 'Getting started',
    q: 'Which tier should I start with?',
    a: `Essential renders locally from your photos at 1080p for ${TIERS.find((t) => t.id === 'ESSENTIAL')?.configurations.map((c) => `${c.duration}s = ${c.credits} credits`).join(' and ')}. Social, Cinematic and Premium add AI motion and narration at higher resolutions. Start with Essential to check your listing details and photos, then move up once the content is right.`,
  },
  {
    category: 'Credits & billing',
    q: 'How do I top up credits?',
    a: `Go to Credits → Top up, pick an amount (minimum 50 credits — R${(50 * CREDIT_PACK_RAND).toFixed(0)}), and pay securely with Paystack using card, EFT or SnapScan. Credits are added the moment the payment is confirmed.`,
  },
  {
    category: 'Credits & billing',
    q: 'Do unused credits roll over?',
    a: `${CREDIT_ROLLOVER_RULE} ${CREDIT_EXPIRY_RULE}`,
  },
  {
    category: 'Credits & billing',
    q: 'Can I cancel anytime?',
    a: `Yes — no contracts. Cancel from Credits → Billing → Cancel subscription; your plan stays active until the end of the paid period. ${CREDIT_CANCEL_RULE}`,
  },
  {
    category: 'Credits & billing',
    q: 'What if I do not like the result?',
    a: `${CREDIT_SPEND_RULE} We cannot refund a render you simply do not like, so check your photos and script first — and use the cheaper Essential tier while you are experimenting.`,
  },
  {
    category: 'Videos & renders',
    q: 'My render failed. What now?',
    a: 'Failed renders are refunded automatically — the credits return to your balance and the project is marked failed. Open the project to retry, and if it fails twice in a row contact support with the project name so we can look at the worker logs.',
  },
  {
    category: 'Videos & renders',
    q: 'How long does a render take?',
    a: 'Essential and Social tiers typically finish in 2–4 minutes. Cinematic and Premium take 5–10 minutes depending on length and voiceover. The progress bar shows elapsed time against a typical render and tells you when a job is taking longer than usual.',
  },
  {
    category: 'Videos & renders',
    q: 'How long are my photos and videos kept?',
    a: `Uploaded photos, edited images, rendered reels and AI Avatar clips are stored for ${RETENTION_DAYS} days and then permanently deleted, automatically every night. Download anything you want to keep. Your project records and descriptions stay in your account until you delete them.`,
  },
  {
    category: 'Tools',
    q: 'What is the AI Photo Editor?',
    a: 'It enhances listing photos in one click: sky replacement, lawn greening, decluttering, twilight conversion and virtual staging across eight furniture styles. Every edit costs 2 credits, and you can compare before and after side by side before downloading.',
  },
  {
    category: 'Account & agency',
    q: 'How does the Agency plan work?',
    a: `The Agency plan gives your brokerage a shared pool of ${agencyCredits.toLocaleString('en-ZA')} credits a month for up to 25 agents. Invite team members from the Agency page, set per-agent limits, and see team-wide spend analytics.`,
  },
  {
    category: 'Account & agency',
    q: 'How do I delete my account?',
    a: 'Go to Settings → Account → Delete account. We permanently remove your data in line with POPIA within 30 days. Cancel any active subscription first.',
  },
  {
    category: 'Account & agency',
    q: 'Is my listing data safe?',
    a: 'Yes. Data is encrypted in transit and at rest in South African data centres. We never sell data or use your listings to train AI models. Full detail is in our Privacy Policy and PAIA Manual.',
  },
];

export const FAQ_CATEGORIES = [...new Set(FAQS.map((f) => f.category))];
