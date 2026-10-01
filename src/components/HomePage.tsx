import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Play, Sparkles, ArrowRight, Check, Star, Camera, Sofa, Trash2, MoonIcon,
  Share2, FileText, Video, Loader2, Sun, Moon, Mic, Wand2, Layers, X,
} from 'lucide-react';
import { PublicLayout } from './PublicLayout';
import { useTheme } from '../lib/theme';
import { track } from '../lib/analytics';
import { SmartImage, BeforeAfterSlider } from './SmartMedia';
import { useApprovedReviews } from '../lib/useReviews';

const SIGNUP_BONUS = 5;

const IMG = {
  hero: 'hero-cape-town',
  beforeAfter: 'before-after',
  staging: 'virtual-staging',
  apartment: 'apartment',
  villa: 'waterfront-villa',
  estate: 'family-estate',
  townhouse: 'townhouse',
  editor: 'ai-editor',
};

const img = (base: string, w: number) => `/images/${base}-${w}.webp`;

// Drop a real render at public/media/showreel.mp4 to enable the hero background video.
const SHOWREEL_SRC: string | undefined = undefined;

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
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm font-semibold text-purple-300 mb-8">
            <Sparkles className="w-4 h-4" /> {SIGNUP_BONUS} Free Credits on Signup
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.05] text-balance">
            Create Stunning Property Videos <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-400 to-purple-300">Instantly with AI</span>
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
        </Reveal>
        <Reveal delay={0.32}>
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { label: 'AI Video Tiers', value: '4' },
              { label: 'AI Photo Presets', value: '29' },
              { label: 'Free Credits on Signup', value: '5' },
              { label: 'ZAR Pricing', value: 'R1/cr' },
            ].map(s => (
              <div key={s.label} className="glass rounded-2xl px-4 py-5">
                <p className="text-2xl sm:text-3xl font-black text-purple-300">{s.value}</p>
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
              <img src={img(IMG.townhouse, 800)} alt="Twilight photography" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
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
                <img src={img(IMG.estate, 800)} alt="Before AI" className="absolute inset-0 w-full h-full object-cover" />
                <span className="absolute top-3 left-3 bg-black/60 text-white text-xs font-semibold px-2.5 py-1 rounded-full">Before</span>
              </div>
              <div className="relative border-l border-white/10">
                <img src={img(IMG.villa, 800)} alt="After AI" className="absolute inset-0 w-full h-full object-cover" />
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
                <p className="text-ink-400 text-xs">Social tier reel · 512p</p>
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

/* ── Video editor demo mockup ─────────────────────────────────────── */
function EditorDemo() {
  const badges = [
    { icon: <Mic className="w-4 h-4" />, label: 'AI Voiceovers', sub: '7 voices incl. SA English' },
    { icon: <Sofa className="w-4 h-4" />, label: 'Virtual Staging', sub: '100% geometry lock' },
    { icon: <Wand2 className="w-4 h-4" />, label: 'AI Motion', sub: 'Hailuo-02 engine' },
    { icon: <Layers className="w-4 h-4" />, label: 'Auto Upscale', sub: '720p → 1080p' },
  ];

  return (
    <section className="relative py-24 bg-ink-950 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(800px_400px_at_70%_20%,rgba(168,85,247,0.12),transparent_70%)]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-16">
          <h2 className="text-3xl sm:text-5xl font-black text-white">One Studio. Seven AI Tools.</h2>
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
              className="absolute z-10 glass-strong rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl hidden md:flex"
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

          {/* Player mockup */}
          <Reveal>
            <motion.div
              whileHover={{ scale: 1.01, rotateX: -1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="glass-strong rounded-3xl p-3 shadow-[0_40px_120px_-30px_rgba(128,0,128,0.5)]"
            >
              <div className="rounded-2xl overflow-hidden bg-black relative aspect-video">
                <img src={img(IMG.editor, 1200)} alt="PropReel Studio interface" className="w-full h-full object-cover opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
                {/* Fake studio chrome */}
                <div className="absolute top-0 inset-x-0 flex items-center gap-2 px-4 py-2.5 bg-black/50 backdrop-blur">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                  <span className="ml-3 text-xs text-ink-300 font-medium">propreel.studio — AI Video Generator</span>
                </div>
                {/* Timeline */}
                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center cursor-pointer hover:bg-purple-500 transition">
                      <Play className="w-4 h-4 text-white fill-white" />
                    </div>
                    <div className="flex-1 h-1.5 bg-white/15 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-400"
                        initial={{ width: '0%' }}
                        whileInView={{ width: '68%' }}
                        viewport={{ once: true }}
                        transition={{ duration: 2.2, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-xs text-ink-300 tabular-nums">0:20 / 0:30</span>
                  </div>
                  <div className="flex gap-1.5">
                    {[42, 68, 30, 80, 55].map((w, i) => (
                      <div key={i} className="h-8 rounded bg-white/10 border border-white/5 overflow-hidden flex-1">
                        <motion.div
                          className="h-full bg-purple-600/40"
                          initial={{ width: 0 }}
                          whileInView={{ width: `${w}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1.2, delay: i * 0.12 }}
                        />
                      </div>
                    ))}
                  </div>
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

/* ── Social proof + FAQ + CTA ────────────────────────────────────── */
function SocialProof() {
  const { reviews } = useApprovedReviews();
  return (
    <section className="py-24 bg-ink-950/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black text-white">Loved by SA Agents</h2>
        </Reveal>
        {reviews.length === 0 ? (
          <Reveal className="text-center">
            <p className="text-ink-400">Be the first to share your PropReel story.</p>
          </Reveal>
        ) : (
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
        )}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-950 via-ink-950 to-ink-950" />
      <div className="absolute inset-0 bg-grid-fade opacity-40" />
      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <Reveal>
          <h2 className="text-3xl sm:text-5xl font-black text-white">Ready to Transform Your Listings?</h2>
          <p className="mt-4 text-lg text-purple-200/80">Start free — your first 5 credits are on us.</p>
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
      <VisualShowcase />
      <EditorDemo />
      <SocialProof />
      <FinalCta />
    </PublicLayout>
  );
}
