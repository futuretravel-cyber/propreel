/**
 * Blog content — static, in-repo, zero API functions (Hobby cap).
 *
 * Posts are structured blocks rather than markdown so the renderer needs no
 * dependency; inline syntax inside `text` supports [links](/path) and **bold**.
 * slugs drive /blog/:slug routes and the sitemap; RouteSEO reads titles and
 * descriptions via dynamic import so this never lands in the main bundle.
 */

import { CREDIT_PACK_RAND } from '../../lib/renderPricing';
import { SIGNUP_BONUS } from '../lib/constants';

export type Block =
  | { type: 'p' | 'h2' | 'h3' | 'quote' | 'note'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** ISO date — used for display, JSON-LD and sitemap lastmod. */
  date: string;
  updated?: string;
  tags: string[];
  blocks: Block[];
}

const POSTS: BlogPost[] = [
  {
    slug: 'festive-season-property-marketing-south-africa',
    title: 'Selling a House in December: The Festive-Season Listing Playbook',
    description:
      'How South African estate agents should list, market and show property over the December holidays: timing, content, viewings, paperwork and the January follow-through.',
    date: '2026-11-03',
    tags: ['Marketing strategy', 'Listings'],
    blocks: [
      {
        type: 'p',
        text: 'Every year the same thing happens: instructions taper off in late November, agents assume the market has gone to the beach, and then January opens with a queue of buyers who did all their browsing in December and could not get hold of anyone. The festive season is not a dead month for property — it is a quiet month for marketing. Those are two very different problems, and only one of them is worth having.',
      },
      { type: 'h2', text: 'Who is actually looking in December' },
      {
        type: 'p',
        text: 'December viewings skew towards a specific group of buyers, and they are unusually motivated because their timeline is fixed:',
      },
      {
        type: 'ul',
        items: [
          '**Relocating buyers** starting a job in January — they need a roof, not a bargain.',
          '**Families buying for the school year**, who want occupation before the first term.',
          '**South Africans abroad**, home for three weeks with a bond pre-approval already in a drawer from an online application.',
          '**Semigration buyers** from Gauteng to the Cape and KZN coast, using the holiday to test a suburb they have only seen on a map.',
        ],
      },
      {
        type: 'p',
        text: 'None of them are browsing for fun. They are the buyers who will sign an offer in the first two weeks of January — if they saw your listing in December.',
      },
      { type: 'h2', text: 'The mistake: going quiet at the exact moment attention is free' },
      {
        type: 'p',
        text: 'Your competitors are the reason December works. Feed costs are the same year-round, but in mid-December half the agents in your suburb stop posting, so the same budget buys noticeably more reach. A listing marketed properly through December arrives in a thinner feed with less competition for the same buyer. That advantage disappears by the second week of January, when everyone returns and posts three weeks of backlog in two days.',
      },
      { type: 'h2', text: 'Shoot everything before the second week of December' },
      {
        type: 'p',
        text: 'The single constraint that wrecks festive-season marketing is production capacity. Photographers close, sellers go away, and the house is full of visiting relatives and a Christmas tree that dates every photo instantly. Batch your content early:',
      },
      {
        type: 'ol',
        items: [
          '**Photograph and film every live stock listing in one or two days**, and re-shoot anything with a seasonal giveaway in frame.',
          '**Render the video versions from the same photos** rather than booking another shoot — the [listing video guide](/blog/property-listing-video-south-africa) covers the shots that survive a re-crop.',
          '**Cut both formats now:** 16:9 for portals and your website, 9:16 for WhatsApp status and Reels. Doing this in advance is the difference between posting daily and posting never.',
          '**Schedule the copy** — captions, prices, suburb notes — so a hungover 27 December does not become a content gap.',
        ],
      },
      { type: 'h2', text: 'Price for a deadline, not for hope' },
      {
        type: 'p',
        text: 'A December listing that has been on the market since August is not magically fresher because it is December. Buyers on a fixed timeline are decisive but not gullible: they will pay for the right property and skip an overpriced one without a second look, because they do not have months to watch a price drift. If a mandate has gone stale, the honest conversation with the seller belongs in November, while there is still time for a re-launch with fresh photos and a corrected asking price to catch the holiday audience.',
      },
      {
        type: 'note',
        text: 'Freshen the listing, not just the price: new hero photo, new video, rewritten first paragraph. A price drop alone reads as desperation; a re-launch reads as a new option.',
      },
      { type: 'h2', text: 'Make viewings easy while people are away' },
      {
        type: 'ul',
        items: [
          '**Publish viewing windows, not "by appointment".** A buyer on holiday will not chase you; give them two fixed slots and a booking link.',
          '**Video walkthroughs earn their keep in December.** Send a narrated reel first and save the physical viewing for buyers who have already self-qualified — see [why video sells houses faster](/blog/video-sells-houses-faster).',
          '**Sort access before the seller leaves.** Keys, alarm codes and a neighbour or caretaker who can open up. The deal you lose in December is almost always an access problem, not a price problem.',
          '**Be careful with occupied homes and short-term lets.** Confirm in writing when the property is available, who is present, and what may be photographed.',
        ],
      },
      { type: 'h2', text: 'Content that works between Christmas and New Year' },
      {
        type: 'p',
        text: 'People are on their phones with time to spare — the highest-attention, lowest-intent-to-act week of the year. Use it for the content you never have time for otherwise: suburb guides, "what R3m buys in four Cape Town suburbs", before-and-after stagings, a year-in-review of your own sales. None of it is a hard sell, all of it is what a buyer saves and returns to in January. The [social media playbook](/blog/social-media-marketing-estate-agents) and [WhatsApp guide](/blog/whatsapp-property-marketing) cover the formats; December is when you finally have room to run them.',
      },
      { type: 'h2', text: 'Paperwork does not pause for the holidays' },
      {
        type: 'p',
        text: 'Offers signed in mid-December still need bond applications, FICA documents and conveyancing, and the professionals handling them take leave too. Practically: confirm your bond originator’s and transferring attorney’s cut-off dates before you promise a seller a timeline, check when the relevant deeds office winds down, and set expectations in the offer around occupation and registration dates that straddle the break. A buyer who understands the delay is calm; a buyer who was told "three weeks" and waits six weeks starts looking for an exit.',
      },
      { type: 'h2', text: 'The January follow-through is the whole point' },
      {
        type: 'p',
        text: 'December marketing only pays if someone answers in January. Before you close the office, work through every enquiry from the month and tag it: viewing booked, waiting on finance, needs a different suburb, dead. Then diary the first working day for outreach — a short message with the listing link and one question about their timeline beats a generic "are you still interested?" every time.',
      },
      { type: 'note', text: 'The agents who own January are the ones whose December listings were still visible, still accurate and still answered. Quiet is fine. Silent is expensive.' },
      {
        type: 'p',
        text: 'If this month is already full, start with the cheapest win: put a video on every live listing before the second week of December. [Create a free account](/register) — it comes with credits to render your first listing — or [compare plans](/pricing) if you are batching a whole stock book.',
      },
    ],
  },
  {
    slug: 'property-listing-video-south-africa',
    title: 'How to Make a Property Listing Video in South Africa',
    description:
      'A practical guide for SA estate agents: the 60-second listing video formula, what it costs in rand, portal formats, and how to turn listing photos into a reel with AI.',
    date: '2026-10-02',
    tags: ['Video marketing', 'Listings'],
    blocks: [
      {
        type: 'p',
        text: 'South African buyers scroll before they call. Whether a listing lands on Property24, Instagram or a WhatsApp status, the agents who show motion first get the viewings. The good news: a professional-looking listing video no longer needs a camera crew or an editor — just a phone, your existing photos, and about ten minutes.',
      },
      { type: 'h2', text: 'The 60-second listing video formula' },
      {
        type: 'p',
        text: 'Every strong property video follows the same beats, regardless of price bracket:',
      },
      {
        type: 'ul',
        items: [
          '**Hook (0–3s):** the best angle of the property, with suburb and price on screen. If you lose people here, you lose the viewing.',
          '**Walkthrough (3–40s):** flow room to room the way a visitor would experience it — entrance, living areas, kitchen, main bedroom, garden or view.',
          '**Details (40–50s):** beds, baths, erf size, solar or inverter, security, proximity to schools and the highway.',
          '**Call to action (50–60s):** your name, agency, and "Book a viewing" — plus a link you can paste into WhatsApp.',
        ],
      },
      { type: 'h2', text: 'What to shoot (or fake) with a phone' },
      {
        type: 'ul',
        items: [
          '**Landscape for portals, portrait for socials.** Shoot or crop both — a 16:9 cut for the listing page and a 9:16 cut for WhatsApp status, Reels and TikTok.',
          '**Shoot in the morning or late afternoon.** Midday Highveld sun flattens interiors; golden hour flatters Cape and KZN coastlines.',
          '**Steady beats fancy.** Walk slowly, hold the phone with two hands, and let rooms breathe for two seconds before panning.',
          '**No loadshedding? Still check the lights.** Film with every globe working; a dead downlight reads as a defect.',
        ],
      },
      { type: 'h2', text: 'What does a listing video cost in South Africa?' },
      {
        type: 'p',
        text: 'Three options, three budgets:',
      },
      {
        type: 'ol',
        items: [
          '**Videographer on site:** roughly R1 500–R5 000 per property depending on location and edits — worth it for R5m+ listings, hard to justify for every new instruction.',
          '**DIY on a phone:** free, but the editing time is real — most agents underestimate it at 2–4 hours per listing.',
          '**AI from your existing photos:** upload the photos you already took, pick a tier and voice, and get a narrated reel back in minutes. On [PropReel pricing](/pricing) this works out to a few rand per video in credits — [create a free account](/register) and you start with 5 free credits.',
        ],
      },
      { type: 'h2', text: 'Formats portals and social platforms actually accept' },
      {
        type: 'ul',
        items: [
          '**Property24 / Private Property:** 16:9 MP4, keep it under a minute for the listing embed; a YouTube link also works.',
          '**Instagram Reels & TikTok:** 9:16, 15–45 seconds, captions burned in — most viewers watch muted at first.',
          '**WhatsApp status:** 9:16, under 30 seconds, smallest file you can send without quality collapsing.',
          '**Email to your database:** link the video, don’t attach it — attachments get stripped by corporate mail filters.',
        ],
      },
      { type: 'h2', text: 'Turn this week’s listings into videos today' },
      {
        type: 'p',
        text: 'You already have the photos. [Watch the 3-minute tutorial](/tutorial), then render your first property reel — or browse [what agents say](/reviews) after they started shipping video with every listing.',
      },
      { type: 'note', text: `Want the shortcut? PropReel turns listing photos into a narrated, cinematic reel in about the time it takes to write the listing description. [Start free — your first ${SIGNUP_BONUS} credits are on us, no card needed](/register).` },
    ],
  },
  {
    slug: 'social-media-marketing-estate-agents',
    title: 'Social Media Marketing for Estate Agents: A South African Playbook',
    description:
      'Where SA property buyers actually spend their time, what to post, how often, and how to turn one new listing into a week of content — without living on your phone.',
    date: '2026-09-24',
    tags: ['Social media', 'Marketing strategy'],
    blocks: [
      {
        type: 'p',
        text: 'Most agents post when they remember: a photo of a new listing, nothing for two weeks, then three posts in one day. Consistency beats intensity in property marketing, and one listing can feed every platform you use. Here is a playbook that fits around viewings instead of eating them.',
      },
      { type: 'h2', text: 'Where South African buyers actually are' },
      {
        type: 'ul',
        items: [
          '**Facebook:** still the widest reach for family homes and the home of suburb and community groups. Buy-and-sell groups move stock fast in every metro.',
          '**Instagram:** the showcase. Reels of new listings, before/after staging, and "sold in X days" posts build your personal brand with aspirational buyers.',
          '**TikTok:** the discovery engine — one property tour can reach people who were not even looking yet. Cheap to make, expensive to over-produce.',
          '**LinkedIn:** the right channel for commercial property, investor stock and referral relationships with brokers and attorneys.',
          '**WhatsApp:** not a broadcast channel — a conversion channel. More on that in [how to market property on WhatsApp](/blog/whatsapp-property-marketing).',
        ],
      },
      { type: 'h2', text: 'Turn one listing into five posts' },
      {
        type: 'p',
        text: 'The bottleneck is not posting — it is content. One new instruction should yield:',
      },
      {
        type: 'ol',
        items: [
          '**The announcement:** hero photo or 30-second video, price, suburb, key hook ("walking distance to the station").',
          '**The tour:** a narrated video walkthrough — render it from your listing photos with [PropReel](/register) in minutes.',
          '**The detail post:** one feature done well — the kitchen island, the solar setup, the sea view — with a carousel.',
          '**The neighbourhood post:** schools, coffee spots, commute times. This is what gets shared into community groups.',
          '**The social proof:** "Just listed", "Multiple offers", "Sold at asking" — momentum posts make your phone ring.',
        ],
      },
      { type: 'h2', text: 'A cadence you can keep' },
      {
        type: 'ul',
        items: [
          '**Three posts a week minimum** on your main channel — two listings-driven, one personality or market commentary.',
          '**Daily stories** when you have them: arrived at a viewing, inside a new instruction, sold. Stories are for presence, feed posts for reach.',
          '**One long-form item a month:** a suburb market update or price-band analysis. It compounds in search and doubles as email content.',
        ],
      },
      { type: 'h2', text: 'Measure what pays' },
      {
        type: 'p',
        text: 'Ignore vanity metrics. Track three things monthly: direct messages from posts, viewing requests attributed to a specific listing post, and how many enquiries mention seeing "the video". If a format never produces one of those three after a month, stop making it.',
      },
      { type: 'note', text: `The fastest way to raise your posting floor: attach a video to every listing. [See the pricing](/pricing) — from R${CREDIT_PACK_RAND.toFixed(2)} per credit, no subscription required.` },
    ],
  },
  {
    slug: 'virtual-staging-south-africa',
    title: 'Virtual Staging in South Africa: Costs, Rules and Results',
    description:
      'What virtual staging costs compared to physical staging, when it is the right call, the disclosure rules SA agents must follow, and how to get natural-looking results.',
    date: '2026-08-13',
    tags: ['Virtual staging', 'Listings'],
    blocks: [
      {
        type: 'p',
        text: 'An empty home photographs like a promise nobody kept. Physical staging solves it — at R8 000 to R30 000+ per room-set per month for a professional crew. Virtual staging places photoreal furniture into your photos for a fraction of that, which is why SA agencies increasingly use it for show houses, off-plan units and stock that has already been handed over.',
      },
      { type: 'h2', text: 'Virtual vs physical staging' },
      {
        type: 'ul',
        items: [
          `**Cost:** physical staging is a monthly rental plus delivery, styling and collection; virtual staging is a once-off per-photo cost — on PropReel it is charged in credits at R${String(CREDIT_PACK_RAND).replace('.', ',')} each.`,
          '**Speed:** virtual results land in minutes; physical staging books days or weeks ahead.',
          '**What it is for:** physical staging helps buyers *feel* a home during an in-person viewing. Virtual staging helps them *click* on the listing in the first place.',
          '**Honest caveat:** virtual staging cannot furnish a viewing. Budget it as a marketing layer, not a substitute for a well-presented show day.',
        ],
      },
      { type: 'h2', text: 'Disclosure: the line you must not cross' },
      {
        type: 'p',
        text: 'Staged images that misrepresent room size, structure or included furniture are a complaint waiting to happen — and portals expect disclosure. The safe pattern:',
      },
      {
        type: 'ul',
        items: [
          'Label staged photos plainly: "Virtual staging" in the caption or on the image.',
          'Never remove or add structural elements — no fake windows, no erased cracks, no extended erf.',
          'Always keep one unstaged photo of each room in the set.',
          'Disclose inclusions separately: what stays with the property goes in the written description, not the pixels.',
        ],
      },
      { type: 'h2', text: 'Getting results that do not look staged' },
      {
        type: 'ul',
        items: [
          '**Match the market:** contemporary furniture for new developments, warmer family settings for established suburbs; coastal properties want light woods and linen.',
          '**Mind the perspective:** furniture must sit correctly on the floor plane — badly anchored sofas kill trust instantly.',
          '**Declutter first, stage second:** virtual staging layered over a messy room just produces a tidy mess.',
          '**Keep the light:** the furniture must inherit the photo’s lighting direction, or the eye immediately knows something is off.',
        ],
      },
      { type: 'h2', text: 'Try it on a real listing' },
      {
        type: 'p',
        text: 'Upload an empty-room photo, pick a style, and compare before/after in under a minute — it is one of the studio tools inside [PropReel’s free account](/register). Pair the staged set with a narrated video and your listing has both the click and the story.',
      },
    ],
  },
  {
    slug: 'video-sells-houses-faster',
    title: 'Do Listing Videos Really Sell Homes Faster? The Case for Property Video',
    description:
      'Why video outperforms photo galleries on portals, in WhatsApp forwards and in inboxes — and what it means for days-on-market in the South African property market.',
    date: '2026-07-09',
    tags: ['Video marketing', 'Marketing strategy'],
    blocks: [
      {
        type: 'p',
        text: 'Photo galleries tell buyers a property exists. Video lets them rehearse living in it. That difference — between awareness and imagination — is why listings with video consistently hold attention longer, get shared more, and attract more qualified enquiries. Here is the honest case for it.',
      },
      { type: 'h2', text: 'Attention is the scarce resource' },
      {
        type: 'p',
        text: 'A buyer scrolling a portal gives each listing a fraction of a second before deciding. A thumbnail competes with ten thousand other thumbnails; a playing video competes with nothing. Even a fifteen-second silent loop buys you the pause in which the price, the suburb and the hook get read.',
      },
      { type: 'h2', text: 'Video travels further than links' },
      {
        type: 'ul',
        items: [
          '**WhatsApp forwards:** a video file or link in a family group reaches the cousin who is quietly looking — link shares beat photo dumps because they invite a tap-through.',
          '**Social algorithms:** Reels and TikToks get distributed to non-followers; static photo posts mostly reach people who already know you.',
          '**Email:** listings with a video thumbnail see materially better click rates than image-only emails — the play button is an affordance.',
        ],
      },
      { type: 'h2', text: 'The showing-filtering effect' },
      {
        type: 'p',
        text: 'A thorough video pre-qualifies. Buyers who arrive having "walked" the property arrive with real questions — financing, occupation dates, offers — instead of discovering the layout mismatch in person. Fewer wasted Sunday showings, faster offers on the listings that fit.',
      },
      { type: 'h2', text: 'What it costs to skip video' },
      {
        type: 'p',
        text: 'Every week on market costs money: price psychology, seller patience, and your own pipeline. If video shortens days-on-market by even a little across your stock, the maths dwarfs the production cost — and when that cost is a few rand of credits instead of a videographer, the argument barely survives contact with a calculator.',
      },
      { type: 'h2', text: 'Start with your next listing' },
      {
        type: 'p',
        text: 'Render one property video this week and compare the engagement yourself — [the tutorial](/tutorial) takes three minutes, and the first one is free on [your account](/register).',
      },
      { type: 'note', text: 'Agents who ship video with every listing report the difference in their enquiry volume first. [See plans and credit packs](/pricing).' },
    ],
  },
  {
    slug: 'whatsapp-property-marketing',
    title: 'How to Market Property Listings on WhatsApp (Without Being Blocked)',
    description:
      'WhatsApp Status, groups and broadcast rules for SA estate agents: file formats, size limits, cadence, and how to share property videos that people actually watch.',
    date: '2026-09-03',
    tags: ['WhatsApp', 'Social media'],
    blocks: [
      {
        type: 'p',
        text: 'WhatsApp is South Africa’s real social network — and every agent knows it. It is also the fastest way to get muted, reported or blocked. The difference between the two outcomes is format, frequency and usefulness. Here is how to use WhatsApp as a marketing channel that buyers welcome.',
      },
      { type: 'h2', text: 'Status: your free billboard' },
      {
        type: 'ul',
        items: [
          '**One listing per status, morning and evening.** Status expires in 24 hours; staggering beats a burst of eight.',
          '**Video rules:** 9:16 portrait, under 30 seconds, keep the file small — WhatsApp recompresses aggressively, so a crisp short clip survives better than a long one.',
          '**Text + link status:** photo from the listing, price in the caption, link to the full video or listing page. The link is what converts.',
          '**Personalise the first line:** "Morning team — new listing in Bryanston" reads differently from a forwarded blast.',
        ],
      },
      { type: 'h2', text: 'Groups: give value before you sell' },
      {
        type: 'ul',
        items: [
          '**Join suburb and buy/sell groups** as a resident, not an advertiser. Comment helpfully first; post listings when the group culture allows it.',
          '**One post per new instruction per group** — never the same wording five times a day. Repetition is what gets you reported.',
          '**Answer questions publicly.** "What goes for R2.5m in that area?" is a listing opportunity disguised as a favour.',
        ],
      },
      { type: 'h2', text: 'Broadcast lists and WhatsApp Business' },
      {
        type: 'ul',
        items: [
          '**Build opted-in lists** — buyers who said "keep me posted" — and broadcast weekly, not daily.',
          '**WhatsApp Business catalog:** load each listing with price, address and link so your profile doubles as a shopfront.',
          '**Label your contacts** (hot buyer, landlord, investor) so the right broadcast goes to the right slice instead of everyone.',
        ],
      },
      { type: 'h2', text: 'Share the video, not the file' },
      {
        type: 'p',
        text: 'A 200 MB video attachment dies in sending: compression blurs it, and some recipients never download it. Share a link instead — your [PropReel](/register) render has a shareable link that opens in any browser, stays sharp, and lets you see it was opened.',
      },
      { type: 'h2', text: 'The two-minute rule' },
      {
        type: 'note', text: 'If a buyer would not forward your message to a friend looking for property, do not send it. Useful, sharp, rare — that is the whole strategy.',
      },
      { type: 'p', text: 'Ready to make something worth forwarding? [Create your first property video free](/register) — then put the link in your next status.' },
    ],
  },
  {
    slug: 'ai-tools-estate-agents-south-africa',
    title: 'AI Tools for South African Estate Agents (2026 Roundup)',
    description:
      'Practical AI tools for SA agents: listing videos, photo editing, virtual staging, descriptions, captions and admin — with realistic costs in rand and a POPIA sanity check.',
    date: '2026-06-18',
    tags: ['AI tools', 'Marketing strategy'],
    blocks: [
      {
        type: 'p',
        text: 'AI in estate agency is no longer a novelty — it is the difference between an agent who lists twenty properties a month and one who lists six. The useful tools fall into five jobs: making the marketing, writing the marketing, running the admin, understanding the market, and keeping client data safe.',
      },
      { type: 'h2', text: '1. Listing videos from photos (PropReel)' },
      {
        type: 'p',
        text: 'The highest-leverage use: turn the photos you already shoot into narrated, cinematic listing videos with South African voices and rand pricing. One property in, reel, square cut and caption out — see [the pricing](/pricing) or [watch the tutorial](/tutorial).',
      },
      { type: 'h2', text: '2. Photo editing and virtual staging' },
      {
        type: 'p',
        text: 'Decluttered rooms, twilight conversions, sky replacements and staged interiors from the same photos. The rule that keeps you out of trouble: never alter structure, always disclose staging. Details in [virtual staging in South Africa](/blog/virtual-staging-south-africa).',
      },
      { type: 'h2', text: '3. Writing: descriptions, captions and replies' },
      {
        type: 'ul',
        items: [
          '**Listing descriptions:** draft with an AI assistant, then localise — suburbs, erf sizes, security features and loadshedding details are where generic copy betrays itself.',
          '**Social captions:** generate a week of platform-specific captions from one listing, then edit for voice.',
          '**Buyer replies:** templates for the questions you answer ten times a day — bond pre-approval, occupation dates, offers.',
        ],
      },
      { type: 'h2', text: '4. Admin and scheduling' },
      {
        type: 'ul',
        items: [
          'Meeting summaries and call notes turned into follow-up tasks.',
          'Calendar drafting for showings and seller reports.',
          'Market summaries: feed recent sales data in, get a suburb snapshot for a seller presentation.',
        ],
      },
      { type: 'h2', text: '5. Keep POPIA in the loop' },
      {
        type: 'p',
        text: 'Client names, IDs and financials are personal information under POPIA. Before you paste anything into an AI tool: use providers with clear data retention terms, never include ID numbers in prompts, and prefer tools that process data in your own workspace — like a platform built for agency workflows rather than a general chatbot.',
      },
      { type: 'h2', text: 'Where to start' },
      {
        type: 'p',
        text: 'Do not adopt five tools in one week. Pick the job that costs you the most hours — almost always listing content — and automate that first. For most agents that is video: [create a free account](/register), render this week’s new instructions, and judge the enquiries.',
      },
      { type: 'note', text: 'PropReel bundles jobs 1 and 2 — video, photo editing and staging — behind one rand-based credit balance. [Compare plans](/pricing).' },
    ],
  },
];

export function getAllPosts(): BlogPost[] {
  return [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find(p => p.slug === slug);
}

/** Rough reading time from block text — good enough for a "6 min read" label. */
export function readingMinutes(post: BlogPost): number {
  const words = post.blocks
    .map(b => ('text' in b ? b.text : b.items.join(' ')))
    .join(' ')
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
