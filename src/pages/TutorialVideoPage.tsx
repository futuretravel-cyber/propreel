import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Clock, Sparkles, Video, Image, FileText, Share2, GraduationCap, Loader2, AlertCircle } from 'lucide-react';

interface TutorialVideo {
  id: string;
  title: string;
  category: string;
  description: string;
  url: string;
  durationSeconds: number | null;
  createdAt: string;
}

const ALL = 'All tools';

/**
 * Public /tutorial: the video tutorial library FIRST (the same catalog
 * Admin → Tutorials publishes and Dashboard → Tutorials watches — served
 * by the public /api/music?action=tutorials route), then the written
 * quick-start guide for people who prefer to read.
 */
export default function TutorialVideoPage() {
  const [currentStep, setCurrentStep] = useState(0);

  // ── video catalog ─────────────────────────────────────────────────────
  const [videos, setVideos] = useState<TutorialVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState(ALL);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/music?action=tutorials');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setVideos(data.tutorials || []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => {
    const seen = new Set(videos.map(v => v.category).filter(Boolean));
    return [ALL, ...[...seen].sort()];
  }, [videos]);

  const filtered = useMemo(
    () => (category === ALL ? videos : videos.filter(v => v.category === category)),
    [videos, category],
  );

  const fmtDur = (s: number | null) => {
    if (!s) return null;
    const m = Math.round(s / 60);
    return m >= 1 ? `${m} min` : `${Math.round(s)} sec`;
  };

  // ── written quick-start guide (kept below the videos) ─────────────────
  const steps = [
    {
      id: 1,
      title: 'Create Your Account',
      description: 'Sign up and get 5 free credits to start creating property videos.',
      icon: <Sparkles className="w-6 h-6" />,
      duration: '2 min',
      detail: 'Click "Start Free", choose a plan (or skip to free credits), and sign in with Google or email. Your 5 bonus credits land in your dashboard immediately.',
    },
    {
      id: 2,
      title: 'Upload Property Photos',
      description: 'Upload high-quality photos of your property. We recommend at least 4-8 photos for best results.',
      icon: <Image className="w-6 h-6" />,
      duration: '3 min',
      detail: 'In the Studio, drag photos into the upload area or click to browse. JPEG/PNG/WEBP up to 25MB. Landscape orientation works best for video.',
    },
    {
      id: 3,
      title: 'Choose Your Video Tier',
      description: 'Select from Essential (photo montage), Social, Cinematic, or Premium based on your needs.',
      icon: <Video className="w-6 h-6" />,
      duration: '2 min',
      detail: 'Essential turns photos into a polished montage. Social/Cinematic/Premium use AI video generation at increasing resolution and duration — the credit cost is shown per option.',
    },
    {
      id: 4,
      title: 'Generate AI Voiceover',
      description: 'Let AI write a professional voiceover script or write your own. Choose from 7 different voices.',
      icon: <FileText className="w-6 h-6" />,
      duration: '4 min',
      detail: 'Click "Generate Script" and the AI writes narration sized to your video length. Edit it freely, then pick a voice from the dropdown.',
    },
    {
      id: 5,
      title: 'Create Your Video',
      description: 'Click "Generate Video" and watch as AI creates your cinematic property reel in minutes.',
      icon: <Play className="w-6 h-6" />,
      duration: '5 min',
      detail: 'Credits are deducted when the render starts. You can watch live progress (queued → processing → complete).',
    },
    {
      id: 6,
      title: 'Share & Download',
      description: 'Download your video or share directly to social media platforms with one click.',
      icon: <Share2 className="w-6 h-6" />,
      duration: '2 min',
      detail: 'When the render completes, use the Share sheet for WhatsApp/email/copy-link, or download the MP4. Finished videos also appear on your Projects page.',
    },
  ];

  return (
    <div className="min-h-screen bg-ink-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4">
            PropReel Tutorials
          </h1>
          <p className="text-lg text-ink-400 max-w-2xl mx-auto">
            Watch how every tool works — photo editing, staging, video reels, voiceovers and more —
            then follow the quick-start guide to create your first video.
          </p>
        </div>

        {/* ── Video library ───────────────────────────────────────────── */}
        <section id="videos" className="mb-16">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2 text-white">
              <GraduationCap className="w-5 h-5 text-purple-300" />
              <h2 className="text-xl font-bold">Video tutorials</h2>
              <span className="text-sm text-ink-500 font-normal">
                {filtered.length} {filtered.length === 1 ? 'video' : 'videos'}
              </span>
            </div>
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {categories.map(c => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      c === category
                        ? 'bg-purple-700 text-white'
                        : 'bg-white/5 text-ink-400 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-ink-500 flex items-center gap-2 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading tutorials…
            </p>
          ) : failed ? (
            <div className="space-y-2 text-center py-8">
              <p className="text-sm text-ink-500 flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4" /> Could not load the videos right now.
              </p>
              <button onClick={load} className="btn btn-secondary text-xs">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-ink-500 text-center py-8">
              No tutorial videos{category !== ALL ? ` for ${category}` : ''} yet — the written
              guide below covers everything in the meantime.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map(v => (
                <div key={v.id} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden hover:border-purple-500/40 transition">
                  <video
                    src={v.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full aspect-video bg-black"
                    aria-label={`Tutorial: ${v.title}`}
                  />
                  <div className="p-3.5 space-y-1">
                    <p className="text-sm font-semibold text-white line-clamp-2">{v.title}</p>
                    <p className="flex items-center gap-1.5 text-xs text-purple-300">
                      <Video className="w-3.5 h-3.5" /> {v.category}
                      {fmtDur(v.durationSeconds) && (
                        <span className="text-ink-500 flex items-center gap-1">
                          · <Clock className="w-3 h-3" /> {fmtDur(v.durationSeconds)}
                        </span>
                      )}
                    </p>
                    {v.description && (
                      <p className="text-xs text-ink-500 line-clamp-2">{v.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <hr className="border-white/10 mb-12" />

        {/* ── Written quick-start guide ───────────────────────────────── */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-black text-white mb-3">Quick start in writing</h2>
          <p className="text-ink-400 max-w-2xl mx-auto">
            Follow this step-by-step guide to create your first stunning property video in under 20 minutes.
          </p>
        </div>

        {/* Step Visual Panel */}
        <div className="mb-12">
          <div className="aspect-video bg-gradient-to-br from-purple-900 via-purple-800 to-purple-950 rounded-2xl shadow-2xl flex flex-col items-center justify-center text-center px-8">
            <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center text-white mb-6">
              {steps[currentStep].icon}
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">{steps[currentStep].title}</h2>
            <p className="text-purple-100 max-w-xl">{steps[currentStep].detail}</p>
            <p className="text-purple-300/70 text-sm mt-6 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Step {steps[currentStep].id} of {steps.length} · ~{steps[currentStep].duration}
            </p>
          </div>
        </div>

        {/* Step Navigation */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">
              Step {steps[currentStep].id} of {steps.length}
            </h2>
            <div className="flex items-center gap-2 text-sm text-ink-400">
              <Clock className="w-4 h-4" />
              <span>{steps[currentStep].duration}</span>
            </div>
          </div>

          {/* Step Progress Bar */}
          <div className="flex gap-2 mb-8">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(index)}
                className={`flex-1 h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'bg-purple-700'
                    : index < currentStep
                    ? 'bg-purple-300'
                    : 'bg-white/10'
                }`}
                aria-label={`Go to step ${step.id}: ${step.title}`}
              />
            ))}
          </div>

          {/* Current Step Content */}
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-8 mb-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-700 flex items-center justify-center text-white flex-shrink-0">
                {steps[currentStep].icon}
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-2">
                  Step {steps[currentStep].id}: {steps[currentStep].title}
                </h3>
                <p className="text-lg text-ink-300">
                  {steps[currentStep].description}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" /> Previous Step
            </button>

            {currentStep === steps.length - 1 ? (
              <Link to="/register" className="btn btn-primary">
                <Sparkles className="w-4 h-4" /> Start Creating Now
              </Link>
            ) : (
              <button
                onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
                className="btn btn-primary"
              >
                Next Step <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            )}
          </div>
        </div>

        {/* All Steps Overview */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            All Tutorial Steps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(index)}
                className={`text-left p-6 rounded-xl border transition-all ${
                  currentStep === index
                    ? 'bg-purple-500/10 border-purple-500/40'
                    : 'bg-white/5 border-white/10 hover:border-purple-500/40'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    currentStep === index ? 'bg-purple-700 text-white' : 'bg-white/5 text-ink-400'
                  }`}>
                    {step.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white mb-1">
                      Step {step.id}: {step.title}
                    </h3>
                    <p className="text-sm text-ink-400">
                      {step.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-500">
                  <Clock className="w-3 h-3" />
                  <span>{step.duration}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Start CTA */}
        <div className="mt-16 bg-gradient-to-r from-purple-700 to-purple-900 rounded-2xl p-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Create Your First Video?</h2>
          <p className="text-purple-100 mb-6 max-w-2xl mx-auto">
            Sign up now and get 5 free credits. Create your first property video in under 20 minutes!
          </p>
          <Link to="/register" className="btn bg-white text-ink-900 hover:bg-white/90 text-lg px-8 py-4">
            <Sparkles className="w-5 h-5" /> Start Free — 5 Credits
          </Link>
        </div>
      </div>
    </div>
  );
}
