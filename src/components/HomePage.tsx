import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Sparkles, ArrowRight, Check, Star, Camera, Sofa, Trash2, MoonIcon,
  Share2, FileText, Video, Mic, Wand2,
} from 'lucide-react';
import { PublicLayout } from './PublicLayout';
import { track } from '../lib/analytics';
import { SmartImage, BeforeAfterSlider } from './SmartMedia';
import { useApprovedReviews } from '../lib/useReviews';
import { SIGNUP_BONUS, TIERS, PHOTO_PRESETS, SA_LANGUAGES } from '../lib/constants';

// Hero stats read the live data tables (TIERS / PHOTO_PRESETS / SA_LANGUAGES)
// so marketing counts can't drift from what the Studio actually offers.
const SA_LANGUAGE_COUNT = SA_LANGUAGES.length;
// The free-credit promise on this page is only true for the cheapest reel.
// Read it from the tier table instead of hardcoding "30-second reel".
const ESSENTIAL_30_CREDITS = TIERS.find(t => t.id === 'ESSENTIAL')?.configurations[0]?.credits ?? 5;

const IMG = {
  hero: 'hero-cape-town',
  beforeAfter: 'before-after',
  staging: 'virtual-staging',
  apartment: 'apartment',
  villa: 'waterfront-villa',
  estate: 'family-estate',
  manorBefore: 'cape-dutch-before',
  manorAfter: 'cape-dutch-after',
  townhouse: 'townhouse',
  twilight: 'twilight-blue-hour',
  editor: 'ai-editor',
  dashOverview: 'dashboard-overview',
  dashNewListing: 'dashboard-new-listing',
  dashProjects: 'dashboard-projects',
  dashCredits: 'dashboard-credits',
};

const img = (base: string, w: number) => `/images/${base}-${w}.webp`;

// Hero background showreel: public/media/showreel.mp4 — 1920×1080, 30 s,
// ~2.6 MB (compressed to the media/README <3 MB spec), muted autoplay loop.
const SHOWREEL_SRC: string | undefined = '/media/showreel.mp4';

/* ── Scroll-reveal helper ─────────────────────────────────────────── */
function Reveal({ children, delay = 0, y = 28, className = '' }: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden">
      {/* Background: looping video behind frosted glass */}
      <div className="absolute inset-0">
        {SHOWREEL_SRC ? (
          <video src={SHOWREEL_SRC} autoPlay muted loop playsInline className="w-full h-full object-cover" />
        ) : (
          <img src={img(IMG.hero, 1200)} alt="" className="w-full h-full object-cover scale-105" aria-hidden />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/80 via-ink-950/70 to-ink-950 backdrop-blur-[6px]" />
        <div className="absolute inset-0 bg-grid-fade opacity-60" />
        {/* Futuristic layers: drifting aurora glow + CRT scanlines */}
        <div className="absolute inset-0 aurora opacity-70" />
        <div className="absolute inset-0 scanlines" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm font-semibold text-purple-300 mb-8">
            <Sparkles className="w-4 h-4" /> {SIGNUP_BONUS} Free Credits on Signup — No Card Needed
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.05] text-balance drop-shadow-[0_0_30px_rgba(168,85,247,0.35)]">
            Create Stunning Property Videos <span className="gradient-text-animated">Instantly with AI</span>
          </h1>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mt-6 text-lg sm:text-xl text-ink-300 max-w-2xl mx-auto">
            Turn property photos into cinematic, narrated listing reels in minutes. Built for South African estate agents.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              onClick={() => track('cta_clicked', { cta: 'hero_start_free' })}
              className="btn btn-primary text-lg px-10 min-h-[52px] animate-pulse-soft"
            >
              Start Free — {SIGNUP_BONUS} Credits <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/pricing"
              className="btn glass text-white text-lg px-10 min-h-[52px] hover:bg-white/10"
            >
              View Pricing
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-400">
            No card needed — your {SIGNUP_BONUS} free credits cover a full Essential 30-second reel.
          </p>
        </Reveal>
        <Reveal delay={0.32}>
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { label: 'AI Video Tiers', value: String(TIERS.length) },
              { label: 'AI Photo Presets', value: String(PHOTO_PRESETS.length) },
              { label: 'Free Credits on Signup', value: String(SIGNUP_BONUS) },
              { label: 'SA voiceover languages', value: String(SA_LANGUAGE_COUNT) },
            ].map(s => (
              <div key={s.label} className="glass hud-frame rounded-2xl px-4 py-5">
                <p className="text-2xl sm:text-3xl font-black gradient-text-animated">{s.value}</p>
                <p className="text-xs sm:text-sm text-ink-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Bento visual showcase ────────────────────────────────────────── */
/* ── Demo reel: a real render playing right below the hero ────────── */
function DemoReel() {
  // Only fetch the 864 KB reel once the visitor scrolls near it.
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { once: true, margin: '150px' });
  return (
    <section ref={ref} className="relative py-20 bg-ink-950 border-b border-white/5 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(700px_350px_at_80%_50%,rgba(168,85,247,0.10),transparent_70%)]" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <Reveal>
          <span className="badge badge-brand mb-4">Live Demo · Real Output</span>
          <h2 className="text-3xl sm:text-4xl font-black text-white">Watch One Photo Become a Reel</h2>
          <p className="mt-4 text-lg text-ink-300">
            An actual PropReel render — AI motion, voiceover and captions from a single listing photo. No editor, no studio.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              'One phone photo in',
              'SA voiceover, music and captions added automatically',
              'Download, share to WhatsApp, or post to the portals',
            ].map(item => (
              <li key={item} className="flex items-start gap-3 text-sm text-ink-200">
                <Check className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" /> {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Link to="/register" onClick={() => track('cta_clicked', { cta: 'demo_reel' })} className="btn btn-primary px-8">
              Start Free — {SIGNUP_BONUS} Credits <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/tutorial" className="btn glass text-white px-8 hover:bg-white/10">Watch the tutorial</Link>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="justify-self-center w-full max-w-[300px]">
          <div className="rounded-[2.5rem] border border-white/10 bg-ink-900 p-2.5 shadow-[0_40px_120px_-30px_rgba(128,0,128,0.6)]">
            <div className="rounded-[2rem] overflow-hidden bg-black">
              {near && (
                <video
                  src="/media/kitchen-after.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                  preload="metadata"
                  className="aspect-[9/16] w-full object-cover"
                />
              )}
            </div>
          </div>
          <p className="text-center text-xs text-ink-500 mt-3">A real 65-second reel, rendered by the Studio.</p>
        </Reveal>
      </div>
    </section>
  );
}

function BentoCard({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={className}>
      <motion.div
        whileHover={{ scale: 1.015 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="glass rounded-3xl overflow-hidden h-full group"
      >
        {children}
      </motion.div>
    </Reveal>
  );
}

function VisualShowcase() {
  return (
    <section className="relative py-24 bg-ink-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-14">
          <h2 className="text-3xl sm:text-5xl font-black text-white">Transform Your Listings</h2>
          <p className="mt-4 text-lg text-ink-400">AI staging, sky replacement and enhancement — before your first coffee</p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 auto-rows-[minmax(180px,auto)] gap-5">
          <BentoCard className="md:col-span-2 md:row-span-2" delay={0}>
            <div className="relative h-full min-h-[420px]">
              <img src={img(IMG.hero, 1200)} alt="AI-enhanced luxury property" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-transparent" />
              <div className="absolute bottom-0 p-6">
                <span className="badge badge-brand mb-3">Sky Replacement + Enhancement</span>
                <h3 className="text-2xl font-bold text-white">Camps Bay Villa</h3>
                <p className="text-ink-300 text-sm mt-1">Overcast drone shot → golden-hour showpiece in one click</p>
              </div>
            </div>
          </BentoCard>

          <BentoCard delay={0.05}>
            <div className="relative h-44">
              <img src={img(IMG.staging, 800)} alt="Virtual staging" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 to-transparent" />
              <div className="absolute bottom-0 p-4">
                <h3 className="font-bold text-white">Virtual Staging</h3>
                <p className="text-ink-400 text-xs">8 furniture styles, zero movers</p>
              </div>
            </div>
          </BentoCard>

          <BentoCard delay={0.1}>
            <div className="relative h-44">
              <img src={img(IMG.twilight, 800)} alt="Twilight photography" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 to-transparent" />
              <div className="absolute bottom-0 p-4">
                <h3 className="font-bold text-white">Twilight Mode</h3>
                <p className="text-ink-400 text-xs">Blue hour, every time</p>
              </div>
            </div>
          </BentoCard>

          <BentoCard className="md:col-span-2" delay={0.15}>
            <div className="grid grid-cols-2 h-full min-h-[200px]">
              <div className="relative">
                <img src={img(IMG.manorBefore, 800)} alt="Before AI" className="absolute inset-0 w-full h-full object-cover" />
                <span className="absolute top-3 left-3 bg-black/60 text-white text-xs font-semibold px-2.5 py-1 rounded-full">Before</span>
              </div>
              <div className="relative border-l border-white/10">
                <img src={img(IMG.manorAfter, 800)} alt="After AI" className="absolute inset-0 w-full h-full object-cover" />
                <span className="absolute top-3 right-3 bg-purple-700 text-white text-xs font-semibold px-2.5 py-1 rounded-full">After</span>
              </div>
            </div>
          </BentoCard>

          <BentoCard delay={0.2}>
            <div className="relative h-44">
              <img src={img(IMG.apartment, 800)} alt="Modern apartment" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 to-transparent" />
              <div className="absolute bottom-0 p-4">
                <h3 className="font-bold text-white">Sandton Apartment</h3>
                <p className="text-ink-400 text-xs">Made for Reels & TikTok</p>
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

/* ── Property showcase gallery — real SA listings, big and interactive ── */
const SHOWCASE: Array<{ base: string; title: string; place: string; tag: string; badge: string; video?: string; videoPoster?: string }> = [
  { base: 'waterfront-villa', title: 'Waterfront Villa', place: 'Constantia, Cape Town', tag: 'Cinematic tier', badge: 'Drone + Golden Hour', video: '/media/waterfront-villa.mp4', videoPoster: '/images/waterfront-villa-poster.webp' },
  { base: 'cape-dutch-after', title: 'Family Estate', place: 'Sandton, Johannesburg', tag: 'Premium tier', badge: 'Virtual Staging', video: '/media/family-estate.mp4', videoPoster: '/images/family-estate-poster.webp' },
  { base: 'townhouse', title: 'Modern Townhouse', place: 'Umhlanga, Durban', tag: 'Essential tier', badge: 'AI Motion', video: '/media/townhouse.mp4', videoPoster: '/images/townhouse-poster.webp' },
  { base: 'twilight-blue-hour', title: 'City Apartment', place: 'Sea Point, Cape Town', tag: 'Social tier', badge: 'Social Pack', video: '/media/city-apartment.mp4', videoPoster: '/images/city-apartment-poster.webp' },
];

function PropertyShowcase() {
  return (
    <section className="py-24 bg-ink-950/60 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-14">
          <span className="badge badge-brand mb-4">Property Showcase</span>
          <h2 className="text-3xl sm:text-5xl font-black text-white">Listings That Sell Themselves</h2>
          <p className="mt-4 text-lg text-ink-400 max-w-2xl mx-auto">Real South African properties, transformed by the Studio. Hover to feel the difference.</p>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {SHOWCASE.map((p, i) => (
            <Reveal key={p.base} delay={i * 0.06}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="group relative rounded-3xl overflow-hidden glass h-[380px]"
              >
                {p.video ? (
                  <video
                    src={p.video}
                    poster={p.videoPoster}
                    aria-label={`${p.title} — ${p.place}`}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-[900ms]"
                  />
                ) : (
                  <img
                    src={img(p.base, 800)}
                    srcSet={`${img(p.base, 480)} 480w, ${img(p.base, 800)} 800w, ${img(p.base, 1200)} 1200w`}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    alt={`${p.title} — ${p.place}`}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-[900ms]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
                {/* Tier tag + hover badge share one wrapping row — as separate
                    left/right absolute chips they overlapped on narrow cards
                    (2-up at ~640px and again in the 4-up grid at lg). */}
                <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="glass text-purple-300 text-xs font-bold px-3 py-1.5 rounded-full">{p.tag}</span>
                  <span className="glass text-ink-200 text-xs px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">{p.badge}</span>
                </div>
                <div className="absolute bottom-0 p-5">
                  <h3 className="text-lg font-bold text-white">{p.title}</h3>
                  <p className="text-ink-400 text-sm">{p.place}</p>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How it works — step-by-step process visualization ────────────── */
const STEPS = [
  { n: '01', title: 'Upload Photos', desc: 'Drop in 4–8 listing photos. Any phone camera works — the AI does the heavy lifting.', icon: <Camera className="w-6 h-6" /> },
  { n: '02', title: 'Pick Your Tier', desc: 'Essential, Social, Cinematic or Premium — Essential is the cheapest way to see a finished reel.', icon: <Video className="w-6 h-6" /> },
  { n: '03', title: 'Let the AI Work', desc: 'Motion, narration, music and captions assemble automatically. Photo presets stage the rooms.', icon: <Wand2 className="w-6 h-6" /> },
  { n: '04', title: 'Share Everywhere', desc: 'Download the reel, grab portal-ready captions and a branded social pack in one click.', icon: <Share2 className="w-6 h-6" /> },
];

function HowItWorks() {
  return (
    <section className="py-24 bg-ink-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(600px_300px_at_20%_30%,rgba(168,85,247,0.08),transparent_70%)]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <Reveal className="text-center mb-16">
          <h2 className="text-3xl sm:text-5xl font-black text-white">From Photos to Sold in Four Steps</h2>
          <p className="mt-4 text-lg text-ink-400">No editing skills. No agency. About ten minutes, start to finish.</p>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {/* Connector line (desktop) */}
          <div className="hidden lg:block absolute top-[52px] left-[12%] right-[12%] h-px bg-gradient-to-r from-purple-600/10 via-purple-500/50 to-purple-600/10" />
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div className="relative glass rounded-3xl p-6 h-full group">
                <div className="relative z-10 w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center text-white mb-5 shadow-lg shadow-purple-900/40">
                  {s.icon}
                </div>
                <span className="absolute top-5 right-6 text-4xl font-black text-white/5 group-hover:text-purple-500/20 transition-colors select-none">{s.n}</span>
                <h3 className="font-bold text-lg text-white">{s.title}</h3>
                <p className="mt-2 text-ink-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.3} className="text-center mt-12">
          <Link to="/register" onClick={() => track('cta_clicked', { cta: 'how_it_works' })} className="btn btn-primary text-base px-8">
            Try it free <ArrowRight className="w-4 h-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Video editor demo mockup ─────────────────────────────────────── */
function EditorDemo() {
  const badges = [
    { icon: <Mic className="w-4 h-4" />, label: 'AI Voiceovers', sub: '7 voices incl. SA English' },
    { icon: <Sofa className="w-4 h-4" />, label: 'Virtual Staging', sub: '100% geometry lock' },
    { icon: <Wand2 className="w-4 h-4" />, label: 'AI Motion', sub: 'Camera motion from one still' },
    { icon: <Mic className="w-4 h-4" />, label: 'AI Avatar Video', sub: 'A talking presenter in your brand' },
  ];

  return (
    <section className="relative py-24 bg-ink-950 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(800px_400px_at_70%_20%,rgba(168,85,247,0.12),transparent_70%)]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-16">
          <h2 className="text-3xl sm:text-5xl font-black text-white">One Studio. Every Asset Your Listing Needs.</h2>
          <p className="mt-4 text-lg text-ink-400">From listing photos to a finished, narrated reel — no editor, no agency, no waiting.</p>
        </Reveal>

        {/* Real before/after: a listing photo (left) vs the AI-rendered reel (right).
            Drag the handle to compare. This is exactly what the Studio produces. */}
        <Reveal className="max-w-4xl mx-auto mb-14">
          <div className="glass-strong rounded-3xl p-3 shadow-[0_40px_120px_-30px_rgba(128,0,128,0.5)]">
            <BeforeAfterSlider
              before="/images/kitchen-before.webp"
              after="/images/kitchen-before.webp"
              afterVideo="/media/kitchen-after.mp4"
              aspect="aspect-[9/16]"
              beforeLabel="Your photo"
              afterLabel="PropReel AI reel"
              className="mx-auto w-full max-w-[320px] sm:max-w-[360px] md:max-w-[400px]"
            />
          </div>
          <p className="text-center text-xs text-ink-500 mt-3">Drag the handle — a single listing photo, before and after the Studio.</p>
        </Reveal>

        <div className="relative max-w-4xl mx-auto">
          {/* Floating glass badges */}
          {badges.map((b, i) => (
            <motion.div
              key={b.label}
              /* lg (not md): at tablet width the max-w-4xl column fills the
                 viewport, so the -4% offsets push these badges past the
                 section's overflow-hidden edge and they get sliced off. */
              className="absolute z-10 glass-strong rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl hidden lg:flex"
              style={{
                top: ['8%', '30%', '55%', '78%'][i],
                [i % 2 === 0 ? 'left' : 'right']: '-4%',
              }}
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="w-9 h-9 rounded-xl bg-purple-700/30 text-purple-300 flex items-center justify-center">{b.icon}</div>
              <div>
                <p className="text-sm font-bold text-white">{b.label}</p>
                <p className="text-xs text-ink-400">{b.sub}</p>
              </div>
            </motion.div>
          ))}

          {/* The real Studio — an actual dashboard screenshot, not a mockup */}
          <Reveal>
            <motion.div
              whileHover={{ scale: 1.01, rotateX: -1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="device-frame neon-ring"
            >
              <div className="rounded-[0.9rem] overflow-hidden relative">
                <img
                  src={img(IMG.dashOverview, 1200)}
                  srcSet={`${img(IMG.dashOverview, 480)} 480w, ${img(IMG.dashOverview, 800)} 800w, ${img(IMG.dashOverview, 1200)} 1200w`}
                  sizes="(max-width: 1024px) 100vw, 860px"
                  alt="The real PropReel dashboard — Studio overview with credits, projects and render status"
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 flex items-center gap-2 glass rounded-full px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse-glow" />
                  <span className="text-[11px] font-semibold text-cyan-200 tracking-wide">LIVE PRODUCT — NOT A MOCKUP</span>
                </div>
              </div>
            </motion.div>
          </Reveal>
        </div>

        {/* Tool grid */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: <FileText className="w-6 h-6" />, title: 'Property Descriptions', desc: 'Portal-ready copy for Property24 & Private Property.' },
            { icon: <Camera className="w-6 h-6" />, title: 'AI Photo Editor', desc: 'Golden sunsets, clear skies, lush lawns in seconds.' },
            { icon: <Sofa className="w-6 h-6" />, title: 'Virtual Staging', desc: '8 styles, 100% architectural preservation.' },
            { icon: <Trash2 className="w-6 h-6" />, title: 'Furniture Removal', desc: 'Declutter or empty a room entirely.' },
            { icon: <MoonIcon className="w-6 h-6" />, title: 'Twilight Photography', desc: 'Blue hour on demand, any time of day.' },
            { icon: <Share2 className="w-6 h-6" />, title: 'Social Captions', desc: 'Platform-optimised posts with strict char limits.' },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 0.05}>
              <motion.div whileHover={{ scale: 1.03 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="glass rounded-2xl p-6 h-full">
                <div className="w-12 h-12 rounded-xl bg-purple-700/25 text-purple-300 flex items-center justify-center mb-4">{f.icon}</div>
                <h3 className="font-bold text-lg text-white">{f.title}</h3>
                <p className="mt-2 text-ink-400 text-sm">{f.desc}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Inside PropReel — real screens from the live Studio ─────────── */
const DASH_SHOTS = [
  { base: 'dashboard-new-listing', tag: 'Listings', title: 'New listing wizard', desc: 'Address, specs and photos — portal-ready in four guided steps.' },
  { base: 'dashboard-projects', tag: 'Media', title: 'Projects library', desc: 'Every reel, photo edit and social pack in one searchable grid.' },
  { base: 'dashboard-listings', tag: 'Portfolio', title: 'Listings tab', desc: 'Live listings with prices, specs and status — your whole book at a glance.' },
  { base: 'dashboard-credits', tag: 'Billing', title: 'Credits & billing', desc: 'Spend, expiry and top-ups — always transparent, never a surprise.' },
];

function InsidePropReel() {
  return (
    <section className="relative py-24 bg-ink-950 overflow-hidden">
      <div className="absolute inset-0 aurora opacity-50" />
      <div className="absolute inset-0 bg-grid-fade opacity-40" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-14">
          <span className="badge badge-brand mb-4">Inside PropReel</span>
          <h2 className="text-3xl sm:text-5xl font-black text-white text-glow">The Studio SA Agents Actually Work In</h2>
          <p className="mt-4 text-lg text-ink-400 max-w-2xl mx-auto">
            Real screens from the live product — captured from the dashboard itself. No mockups, no placeholders.
          </p>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {DASH_SHOTS.map((s, i) => (
            <Reveal key={s.base} delay={i * 0.08}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="device-frame hud-frame h-full"
              >
                <div className="rounded-[0.8rem] overflow-hidden">
                  <img
                    src={`/images/${s.base}-800.webp`}
                    srcSet={`/images/${s.base}-480.webp 480w, /images/${s.base}-800.webp 800w, /images/${s.base}-1200.webp 1200w`}
                    sizes="(max-width: 640px) 100vw, 50vw"
                    alt={`${s.title} — real PropReel dashboard screen`}
                    loading="lazy"
                    className="w-full"
                  />
                </div>
                <div className="px-2 pt-4 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">{s.tag}</span>
                  <h3 className="mt-1 font-bold text-white">{s.title}</h3>
                  <p className="mt-1 text-sm text-ink-400">{s.desc}</p>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Social proof + FAQ + CTA ────────────────────────────────────── */
function SocialProof() {
  const { reviews } = useApprovedReviews();
  // No approved reviews yet → render nothing rather than an empty-looking
  // "Be the first…" section on the marketing homepage. It appears
  // automatically once real reviews are submitted and approved.
  if (reviews.length === 0) return null;
  return (
    <section className="py-24 bg-ink-950/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black text-white">Loved by SA Agents</h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {reviews.slice(0, 3).map((r, i) => (
            <Reveal key={r.id} delay={i * 0.07}>
              <div className="glass rounded-2xl p-6 h-full">
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: r.rating }).map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-ink-200 text-sm mb-4">"{r.comment}"</p>
                <p className="font-semibold text-white text-sm">{r.fullName}</p>
                <p className="text-ink-400 text-xs">{r.agency}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.2} className="text-center mt-10">
          <Link to="/reviews" className="btn glass text-white px-8 hover:bg-white/10">
            Read all reviews <ArrowRight className="w-4 h-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-950 via-ink-950 to-ink-950" />
      <div className="absolute inset-0 bg-grid-fade opacity-40" />
      <div className="absolute inset-0 aurora opacity-60" />
      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <Reveal>
          <h2 className="text-3xl sm:text-5xl font-black text-white">Ready to Transform Your Listings?</h2>
          <p className="mt-4 text-lg text-purple-200/80">Start free — your first {SIGNUP_BONUS} credits are on us, no card needed.</p>
          <div className="mt-10">
            <Link to="/register" className="btn bg-white text-purple-900 hover:bg-purple-50 text-lg px-10 py-4 font-bold min-h-[52px] animate-pulse-soft">
              Get {SIGNUP_BONUS} Free Credits <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-400">No credit card required • Cancel anytime</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <PublicLayout>
      <Hero />
      <DemoReel />
      <VisualShowcase />
      <PropertyShowcase />
      <HowItWorks />
      <EditorDemo />
      <InsidePropReel />
      <SocialProof />
      <FinalCta />
    </PublicLayout>
  );
}
