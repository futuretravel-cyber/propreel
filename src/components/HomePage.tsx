import { useState } from 'react';
import { Play, X, Sparkles, Check, ArrowRight, Star, Camera, Sofa, Trash2, MoonIcon, Share2, FileText, Video, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SmartImage, BeforeAfterSlider, ShowreelVideo } from './SmartMedia';
import { PublicLayout } from './PublicLayout';
import { track } from '../lib/analytics';
import { mockReviews } from '../lib/mockData';

const SIGNUP_BONUS = 5;

// Local WebP media (converted from generator output 2026-10-01 — see scripts/convert-images.mjs)
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

// Drop a real rendered clip into public/media/showreel.mp4 to enable it.
const SHOWREEL_SRC: string | undefined = undefined;

export function DemoRenderForm() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setState('loading');
    setMessage('');
    track('demo_render_requested', { host: (() => { try { return new URL(url).hostname; } catch { return 'invalid'; } })() });
    try {
      const res = await fetch('/api/leads?action=demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_url: url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Demo render unavailable right now');
      setState('idle');
      setMessage('Request received! Your watermarked preview will be emailed when ready.');
    } catch (err: any) {
      setState('error');
      setMessage(err.message || 'Something went wrong');
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Paste a Property24 / Private Property listing URL…"
          aria-label="Listing URL"
          className="flex-1 min-h-[48px] px-4 rounded-xl border border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-base"
          required
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          className="btn btn-primary min-h-[48px] px-6 text-base disabled:opacity-60"
        >
          {state === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          Free preview
        </button>
      </div>
      {message && (
        <p role="status" className={`mt-3 text-sm ${state === 'error' ? 'text-red-600' : 'text-purple-700'}`}>{message}</p>
      )}
      <p className="mt-2 text-xs text-gray-500">One free watermarked 360p preview per person. No signup needed.</p>
    </form>
  );
}

function DemoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Product demo video">
      <div className="relative w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close demo" className="absolute -top-10 right-0 text-white/80 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
          <X className="w-7 h-7" />
        </button>
        <ShowreelVideo src={SHOWREEL_SRC} poster={img(IMG.hero, 1200)} className="w-full rounded-2xl shadow-2xl aspect-video object-cover" />
      </div>
    </div>
  );
}

export function HomePage() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-purple-50 to-white py-20 lg:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(128,0,128,0.08),transparent_70%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-800 px-4 py-2 rounded-full text-sm font-semibold mb-6">
                <Sparkles className="w-4 h-4" /> {SIGNUP_BONUS} Free Credits on Signup
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 leading-tight text-balance">
                Create Stunning Property Videos<br />
                <span className="brand-text-gradient">Instantly with AI</span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-gray-600">
                Turn your property photos into cinematic, narrated listing reels in minutes. Built for South African estate agents.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link to="/register" className="btn btn-primary text-lg px-8 min-h-[52px] flex items-center">
                  Start Free — {SIGNUP_BONUS} Credits <ArrowRight className="w-5 h-5" />
                </Link>
                <button
                  onClick={() => { track('cta_clicked', { cta: 'watch_demo' }); setDemoOpen(true); }}
                  className="btn border border-gray-200 text-gray-700 hover:border-purple-300 text-lg px-8 min-h-[52px] flex items-center gap-2"
                  aria-haspopup="dialog"
                >
                  <Play className="w-5 h-5 text-purple-700" /> Watch demo
                </button>
              </div>
              <div className="mt-8">
                <DemoRenderForm />
              </div>
            </div>
            <div className="relative">
              <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl">
                <ShowreelVideo src={SHOWREEL_SRC} poster={img(IMG.hero, 1200)} className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-xl p-4 max-w-[220px]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <Video className="w-4 h-4 text-purple-700" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">AI Generated</span>
                </div>
                <p className="text-sm text-gray-600">Cinematic property reel created in 2 minutes</p>
              </div>
            </div>
          </div>
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {[
              { label: 'Agents', value: '847+' },
              { label: 'Reels Generated', value: '3,291' },
              { label: 'Agencies', value: '42' },
              { label: 'Avg. Views', value: '12.4K' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-black text-purple-700">{s.value}</p>
                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transform — before/after sliders */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900">Transform Your Listings</h2>
            <p className="mt-4 text-lg text-gray-600">Drag the slider to see what AI does to a listing photo</p>
          </div>

          <div className="grid md:grid-cols-2 gap-10 items-center mb-16">
            <BeforeAfterSlider before={img(IMG.beforeAfter, 800)} after={img(IMG.hero, 800)} beforeLabel="Original" afterLabel="AI Enhanced" />
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">AI Photo Enhancement</h3>
              <p className="text-gray-600 mb-6">
                Transform dull, overcast photos into stunning golden hour shots. Our AI preserves every architectural detail while dramatically improving lighting, sky, and landscaping.
              </p>
              <ul className="space-y-3">
                {['Golden hour lighting in seconds', 'Clear blue sky replacement', 'Lush green lawn enhancement', '100% architectural preservation'].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-purple-700 flex-shrink-0" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="order-2 md:order-1">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Virtual Staging</h3>
              <p className="text-gray-600 mb-6">
                Stage empty rooms with beautiful furniture in any style. From luxury modern to Scandinavian, our AI creates photorealistic staging that helps buyers envision the space.
              </p>
              <ul className="space-y-3">
                {['8 furniture styles available', 'Photorealistic results', 'Multiple room types supported', 'Perfect for empty properties'].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-purple-700 flex-shrink-0" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="order-1 md:order-2">
              <BeforeAfterSlider before={img(IMG.estate, 800)} after={img(IMG.staging, 800)} beforeLabel="Empty" afterLabel="Staged" />
            </div>
          </div>
        </div>
      </section>

      {/* Property Gallery */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900">Reels That Sell</h2>
            <p className="mt-4 text-lg text-gray-600">Every property type, every price band, every major city</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { image: IMG.apartment, title: 'Modern Apartment', location: 'Sandton, Johannesburg', price: 'R3,200,000' },
              { image: IMG.villa, title: 'Waterfront Villa', location: 'Umhlanga, Durban', price: 'R8,900,000' },
              { image: IMG.estate, title: 'Family Estate', location: 'Stellenbosch, Cape Town', price: 'R6,800,000' },
              { image: IMG.townhouse, title: 'Luxury Townhouse', location: 'Waterkloof, Pretoria', price: 'R4,500,000' },
              { image: IMG.hero, title: 'Contemporary Villa', location: 'Camps Bay, Cape Town', price: 'R12,500,000' },
              { image: IMG.editor, title: 'AI Video Editor', location: 'Create cinematic reels', price: 'From 5 credits' },
            ].map((property, i) => (
              <div key={i} className="group cursor-pointer">
                <div className="aspect-video rounded-xl overflow-hidden shadow-lg mb-4">
                  <SmartImage
                    name={property.image}
                    alt={`${property.title} — ${property.location}`}
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <h3 className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors">{property.title}</h3>
                <p className="text-sm text-gray-600">{property.location}</p>
                <p className="text-purple-700 font-semibold mt-1">{property.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900">7 Powerful AI Tools in One Studio</h2>
            <p className="mt-4 text-lg text-gray-600">Everything you need to market properties like a pro.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <FileText className="w-6 h-6" />, title: 'Property Descriptions', desc: 'AI-generated descriptions formatted for Property24 and Private Property.' },
              { icon: <Camera className="w-6 h-6" />, title: 'AI Photo Editor', desc: 'Golden sunsets, clear skies, lush lawns — enhance any photo in seconds.' },
              { icon: <Sofa className="w-6 h-6" />, title: 'Virtual Staging', desc: 'Stage empty rooms with 8 furniture styles. 100% architectural preservation.' },
              { icon: <Trash2 className="w-6 h-6" />, title: 'Furniture Removal', desc: 'Remove all furniture, clutter, or vehicles with a single click.' },
              { icon: <MoonIcon className="w-6 h-6" />, title: 'Twilight Photography', desc: 'Convert day photos to stunning blue-hour twilight shots.' },
              { icon: <Share2 className="w-6 h-6" />, title: 'Social Media Captions', desc: 'Platform-optimized captions for Instagram, Facebook, WhatsApp, and more.' },
            ].map((f, i) => (
              <div key={i} className="card-light p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-4">{f.icon}</div>
                <h3 className="font-bold text-lg text-gray-900">{f.title}</h3>
                <p className="mt-2 text-gray-600 text-sm">{f.desc}</p>
              </div>
            ))}
            <div className="card-light p-6 bg-gradient-to-br from-purple-50 to-white border-purple-200">
              <div className="w-12 h-12 rounded-xl bg-purple-700 text-white flex items-center justify-center mb-4"><Video className="w-6 h-6" /></div>
              <h3 className="font-bold text-lg text-gray-900">AI Video Generator</h3>
              <p className="mt-2 text-gray-600 text-sm">Create cinematic property reels with AI voiceover, transitions, and branding.</p>
              <Link to="/register" className="mt-4 inline-flex items-center gap-1 text-purple-700 font-semibold text-sm hover:gap-2 transition-all min-h-[44px]">
                Try it free <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Built for SA */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900">Built for South Africa 🇿🇦</h2>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">Priced in Rand. Local voices. Property24 & Private Property ready.</p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card-light p-8">
              <p className="text-4xl mb-4">💰</p>
              <h3 className="font-bold text-lg">Rand Pricing</h3>
              <p className="text-gray-600 mt-2">All plans priced in ZAR. No hidden fees. All prices include VAT.</p>
            </div>
            <div className="card-light p-8">
              <p className="text-4xl mb-4">🗣️</p>
              <h3 className="font-bold text-lg">SA English Voice</h3>
              <p className="text-gray-600 mt-2">Ayanda — our South African English voice — plus 6 other professional voices.</p>
            </div>
            <div className="card-light p-8">
              <p className="text-4xl mb-4">📋</p>
              <h3 className="font-bold text-lg">Portal Ready</h3>
              <p className="text-gray-600 mt-2">Download descriptions formatted for Property24 and Private Property portals.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 text-center mb-12">Loved by SA Agents</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {mockReviews.slice(0, 3).map(r => (
              <div key={r.id} className="card-light p-6">
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-gray-700 text-sm mb-4">"{r.comment}"</p>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{r.fullName}</p>
                  <p className="text-gray-500 text-xs">{r.agency}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 bg-gray-50 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 text-center mb-12">Frequently Asked Questions</h2>
          <FaqAccordion />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900">
        <div className="max-w-4xl mx-auto px-4 text-center text-white">
          <h2 className="text-3xl sm:text-4xl font-black">Ready to Transform Your Listings?</h2>
          <p className="mt-4 text-lg text-purple-200">Join 847+ South African agents already using PropReel.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register" className="btn bg-white text-purple-900 hover:bg-purple-50 text-lg px-8 py-4 font-bold min-h-[52px] flex items-center">
              Get {SIGNUP_BONUS} Free Credits <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-purple-300">No credit card required • Cancel anytime</p>
        </div>
      </section>

      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}
    </PublicLayout>
  );
}

const FAQS: Array<{ q: string; a: string }> = [
  { q: 'How long does a property video take to create?', a: 'Most reels render in 2–5 minutes depending on length and resolution. You will get a notification the moment yours is ready.' },
  { q: 'Do I need video editing skills?', a: 'None. Upload photos or paste a listing URL, pick a style, and the AI handles script, voiceover, captions, transitions and music.' },
  { q: 'What are credits?', a: 'Credits are consumed per render or AI edit — e.g. a 30-second 1080p reel uses a set number based on your plan. Unused credits roll over and never expire on paid plans.' },
  { q: 'Can I use my own voice?', a: 'Yes. Record a 30-second sample and PropReel clones your voice so every video sounds like you narrated it.' },
  { q: 'Which portals and platforms does it support?', a: 'Descriptions export formatted for Property24 and Private Property; videos and captions are sized for Instagram, Facebook, TikTok, WhatsApp Business and YouTube.' },
  { q: 'Is my listing data safe?', a: 'Yes — data is stored in AWS in the af-south-1 region, processed under South African POPIA requirements, and never used to train third-party models.' },
  { q: 'Can I cancel anytime?', a: 'Yes, self-service cancellation from your billing page. Your plan stays active until the end of the billing period.' },
  { q: 'Do you support agencies?', a: 'The Agency plan includes 25 seats, a shared credit pool and per-agent analytics. Contact us for custom onboarding.' },
];

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-3">
      {FAQS.map((f, i) => (
        <div key={i} className="card-light overflow-hidden">
          <button
            className="w-full flex items-center justify-between gap-4 p-5 text-left font-semibold text-gray-900 min-h-[44px]"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            aria-controls={`faq-panel-${i}`}
          >
            {f.q}
            <span className={`transition-transform text-purple-700 ${open === i ? 'rotate-45' : ''}`} aria-hidden>+</span>
          </button>
          {open === i && (
            <div id={`faq-panel-${i}`} className="px-5 pb-5 text-gray-600">{f.a}</div>
          )}
        </div>
      ))}
    </div>
  );
}

