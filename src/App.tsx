import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import NotFoundPage from './pages/NotFoundPage';
import HelpModal from './components/HelpModal';
import OfflineBanner from './components/OfflineBanner';
import { useState, useEffect, useRef } from 'react';
import MobileNav from './components/MobileNav';
import { DashboardSkeleton, BillingSkeleton, ProjectsSkeleton, StudioSkeleton, useSimulatedLoading } from './components/Skeleton';
import { useAuth, useCredit, AuthProvider, CreditProvider } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import SignupPage from './pages/SignupPage';
import PaymentPage from './pages/PaymentPage';
import RefundPolicyPage from './pages/RefundPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import CookiePolicyPage from './pages/CookiePolicyPage';
import PAIAManualPage from './pages/PAIAManualPage';
import DataProcessingAgreementPage from './pages/DataProcessingAgreementPage';
import TutorialVideoPage from './pages/TutorialVideoPage';
import CancelSubscriptionPage from './pages/CancelSubscriptionPage';
import DeleteAccountPage from './pages/DeleteAccountPage';
import CreditSystemDashboard from './components/CreditSystemDashboard';
import AdminIntegrations from './components/AdminIntegrations';
import NotificationCenter from './components/NotificationCenter';
import GlobalSearch from './components/GlobalSearch';
import { SearchButton } from './components/GlobalSearch';
import OnboardingTutorial from './components/OnboardingTutorial';
import CollaborationPanel from './components/CollaborationPanel';
import { TIERS, ORIENTATIONS, VOICES, SOCIAL_PLATFORMS, TONES, PHOTO_PRESETS, STAGING_STYLES, ROOM_TYPES, REMOVAL_MODES, TWILIGHT_STYLES, PLANS, SIGNUP_BONUS } from './lib/constants';
import { IMAGE_PRESETS, IMAGE_RENDER_CREDIT_COST } from './lib/imagePrompts';
import { PropReelAPI } from './lib/api';
import { formatZar, formatDate, formatRelative, wordCount, downloadText } from './lib/utils';
import { useApprovedReviews } from './lib/useReviews';
import { useActivity } from './lib/useActivity';
import { useRenderProgress, typicalVideoSeconds } from './lib/useRenderProgress';
import RenderProgressBar from './components/RenderProgressBar';
import EnhancedProjects from './components/EnhancedProjects';
import SecuritySettings from './components/SecuritySettings';
import AITalkingProfile from './components/AITalkingProfile';
import AdminMusicLibrary from './components/AdminMusicLibrary';
import FlashHeadVideo from './components/FlashHeadVideo';
import {
  Home as HomeIcon, Video, Image, Wand2, Sofa, Trash2, Moon, Share2, Play,
  LayoutDashboard, List, BarChart3, CreditCard, Building2, Settings, Shield,
  Users, Star, ChevronRight, Check, X, Menu, LogOut, Zap, Crown, Sparkles,
  TrendingUp, Eye, Clock, AlertCircle, Download, Copy, RefreshCw, Plus,
  Search, Filter, ArrowRight, Globe, Phone, Mail, MapPin, ChevronDown,
  Monitor, Smartphone, Mic, Camera, Palette, Sun, Cloud, Moon as MoonIcon, Bell,
  FileText, XCircle, Music, User, Keyboard, Tag, HelpCircle
} from 'lucide-react';

import { lazy, Suspense } from 'react';
import ShareSheet from './components/ShareSheet';
import ImageWorkbench from './components/ImageWorkbench';
import { buildPromptRotation } from './lib/videoPrompts';
import { ThemeProvider } from './lib/theme';
import HomePage from './components/HomePage';
import StatusPage from './pages/StatusPage';
import { PublicLayout } from './components/PublicLayout';
import { track } from './lib/analytics';

// Code-split the heavy dashboard sections (recharts, framer-motion, admin UI)
// so the marketing site loads without them.
const EnhancedOverview = lazy(() => import('./components/EnhancedOverview'));
const EnhancedBilling = lazy(() => import('./components/EnhancedBilling'));
const EnhancedAnalytics = lazy(() => import('./components/EnhancedAnalytics'));
const EnhancedAgency = lazy(() => import('./components/EnhancedAgency'));

// Keyboard shortcuts modal
function KeyboardShortcutsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  
  const shortcuts = [
    { keys: ['N'], description: 'Open Studio', category: 'Navigation' },
    { keys: ['R'], description: 'Recent Projects', category: 'Navigation' },
    { keys: ['⌘', 'K'], description: 'Global Search', category: 'Navigation' },
    { keys: ['?'], description: 'Show keyboard shortcuts', category: 'Help' },
    { keys: ['Esc'], description: 'Close modals', category: 'General' },
    { keys: ['Tab'], description: 'Switch between tools', category: 'Studio' },
    { keys: ['Enter'], description: 'Generate / Submit', category: 'Studio' },
  ];

  const categories = [...new Set(shortcuts.map(s => s.category))];

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-x-4 top-24 z-50 max-w-lg mx-auto">
        <div className="card-dark overflow-hidden animate-scale-in">
          <div className="flex items-center justify-between p-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <Keyboard className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-white">Keyboard Shortcuts</h3>
            </div>
            <button onClick={onClose} className="text-ink-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {categories.map(cat => (
              <div key={cat} className="mb-4 last:mb-0">
                <p className="text-xs text-ink-500 uppercase tracking-wide mb-2">{cat}</p>
                <div className="space-y-2">
                  {shortcuts.filter(s => s.category === cat).map((shortcut, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-ink-300">{shortcut.description}</span>
                      <div className="flex gap-1">
                        {shortcut.keys.map((key, ki) => (
                          <span key={ki} className="px-2 py-0.5 rounded bg-ink-800 text-ink-200 text-xs font-mono border border-white/5">
                            {key}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-white/5 text-center">
            <p className="text-xs text-ink-500">Press <kbd className="px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 text-xs">?</kbd> anytime or <kbd className="px-1.5 py-0.5 rounded bg-ink-800 text-ink-400 text-xs">Esc</kbd> to close</p>
          </div>
        </div>
      </div>
    </>
  );
}

// Tooltip component for icon-only buttons
function Tooltip({ content, children, side = 'top', delay = 300 }: { content: string; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; delay?: number }) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShow(true), delay);
  };
  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    setShow(false);
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && (
        <div
          className={`absolute z-50 px-2 py-1 text-xs text-white bg-ink-800 rounded shadow-lg whitespace-nowrap transition-opacity ${side === 'top' ? 'bottom-full mb-1' : side === 'bottom' ? 'top-full mt-1' : side === 'left' ? 'right-full mr-1' : 'left-full ml-1'}`}
          role="tooltip"
        >
          {content}
          <div className={`absolute ${side === 'top' ? 'top-full left-1/2 -translate-x-1/2 border-4 border-ink-800 b-0' : side === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 border-4 border-ink-800 t-0' : ''}`} />
        </div>
      )}
    </div>
  );
}

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Tooltip as RTooltip } from 'recharts';

export { KeyboardShortcutsModal, Tooltip };

// Copy-to-clipboard with visual feedback ("Copied!")
function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied!', className = 'btn btn-secondary' }: { text: string; label?: string; copiedLabel?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (permissions/insecure context) — select+copy fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* nothing more we can do */ }
    }
  };

  return (
    <button onClick={handleCopy} className={className} aria-label={copied ? copiedLabel : label}>
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      {copied ? copiedLabel : label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC PAGES
// ═══════════════════════════════════════════════════════════════════════════

function PricingPage() {
  const [annual, setAnnual] = useState(false);
  return (
    <PublicLayout>
      <section className="py-20 bg-gradient-to-b from-purple-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900">Simple, Transparent Pricing</h1>
            <p className="mt-4 text-lg text-gray-600">All prices include VAT. Cancel anytime.</p>
            <div className="mt-8 inline-flex items-center gap-3 bg-gray-100 rounded-full p-1">
              <button onClick={() => { track('pricing_toggle', { to: 'monthly' }); setAnnual(false); }} className={`px-5 py-2 rounded-full text-sm font-semibold transition ${!annual ? 'bg-white shadow text-purple-700' : 'text-gray-600'}`}>Monthly</button>
              <button onClick={() => { track('pricing_toggle', { to: 'annual' }); setAnnual(true); }} className={`px-5 py-2 rounded-full text-sm font-semibold transition ${annual ? 'bg-white shadow text-purple-700' : 'text-gray-600'}`}>Annual <span className="text-green-600 text-xs">Save 15%</span></button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map(plan => {
              const price = annual ? plan.annualZar : plan.monthlyZar;
              return (
                <div key={plan.id} className={`card-light p-6 relative ${plan.popular ? 'ring-2 ring-purple-700 shadow-xl' : ''}`}>
                  {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-brand">Most Popular</div>}
                  <h3 className="font-bold text-xl text-gray-900">{plan.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{plan.tagline}</p>
                  <div className="mt-4">
                    <span className="text-4xl font-black text-gray-900">{formatZar(price)}</span>
                    <span className="text-gray-500 text-sm">/month</span>
                  </div>
                  <p className="text-sm text-purple-700 font-semibold mt-2">{plan.monthlyCredits} credits/month</p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <Check className="w-4 h-4 text-purple-700 mt-0.5 flex-shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link to={`/register?plan=${plan.id}&cycle=${annual ? 'ANNUAL' : 'MONTHLY'}`} className={`btn w-full mt-6 min-h-[48px] flex items-center justify-center ${plan.popular ? 'btn-primary' : 'border border-gray-200 text-gray-700 hover:border-purple-300'}`}>
                    Choose {plan.name}
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">All prices include VAT. Custom credit top-ups available at R1/credit (min R50).</p>
          
          {/* Credit Policy Summary */}
          <div className="mt-12 max-w-3xl mx-auto">
            <h3 className="text-lg font-bold text-gray-900 text-center mb-6">Our Credit Policy</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-gray-900 text-sm">Purchased Credits</h4>
                </div>
                <p className="text-xs text-gray-600">Non-refundable once spent. Never expire (365 days of inactivity).</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-yellow-600" />
                  <h4 className="font-semibold text-gray-900 text-sm">Subscriptions</h4>
                </div>
                <p className="text-xs text-gray-600">Unused credits roll over. Cancellations apply at next renewal.</p>
              </div>
            </div>
            <p className="text-center text-sm text-gray-500 mt-6">
              Read our full <Link to="/refund-policy" className="text-purple-700 hover:text-purple-800 font-medium">Credit Policy</Link>
            </p>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function ReviewsPage() {
  const { reviews, loading } = useApprovedReviews();
  return (
    <PublicLayout>
      <section className="py-20 bg-gradient-to-b from-purple-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-black text-gray-900 text-center">What Our Agents Say</h1>
          <p className="text-center text-gray-600 mt-4">Verified reviews from paying South African estate agents.</p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading && <p className="text-center text-gray-500 col-span-full">Loading reviews…</p>}
            {!loading && reviews.length === 0 && (
              <p className="text-center text-gray-500 col-span-full">
                No published reviews yet — be the first to <Link to="/register" className="text-purple-700 underline">share your experience</Link>.
              </p>
            )}
            {reviews.map(r => (
              <div key={r.id} className="card-light p-6">
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-gray-700 mb-4">"{r.comment}"</p>
                <div className="border-t border-gray-100 pt-3">
                  <p className="font-semibold text-gray-900 text-sm">{r.fullName}</p>
                  <p className="text-gray-500 text-xs">{r.agency}</p>
                  <p className="text-gray-400 text-xs mt-1">{formatDate(r.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function AboutPage() {
  return (
    <PublicLayout>
      <section className="py-20 bg-gradient-to-b from-purple-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-black text-gray-900">About PropReel</h1>
          <p className="mt-6 text-lg text-gray-600 leading-relaxed">
            PropReel was built to solve a simple problem: South African estate agents spend too much time and money creating marketing content for their listings. We use cutting-edge AI to turn your existing property photos into stunning videos, enhanced images, and compelling descriptions — in minutes, not days.
          </p>
          <p className="mt-4 text-lg text-gray-600 leading-relaxed">
            Our platform is designed specifically for the South African property market, with local voices, Rand pricing, and seamless integration with Property24 and Private Property portals.
          </p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div><p className="text-3xl font-black text-purple-700">29</p><p className="text-gray-600">AI Photo Presets</p></div>
            <div><p className="text-3xl font-black text-purple-700">4</p><p className="text-gray-600">AI Video Tiers</p></div>
            <div><p className="text-3xl font-black text-purple-700">R1</p><p className="text-gray-600">Per Credit, VAT Included</p></div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function ContactPage() {
  const [sent, setSent] = useState(false);
  return (
    <PublicLayout>
      <section className="py-20 bg-gradient-to-b from-purple-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-black text-gray-900 text-center">Get in Touch</h1>
          <p className="text-center text-gray-600 mt-4">We'd love to hear from you.</p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <div className="space-y-6">
                <div className="flex items-start gap-4"><Mail className="w-5 h-5 text-purple-700 mt-1" /><div><p className="font-semibold">Email</p><p className="text-gray-600">support@propreel.co.za</p></div></div>
                <div className="flex items-start gap-4"><Phone className="w-5 h-5 text-purple-700 mt-1" /><div><p className="font-semibold">Phone</p><p className="text-gray-600">+27 21 123 4567</p></div></div>
                <div className="flex items-start gap-4"><MapPin className="w-5 h-5 text-purple-700 mt-1" /><div><p className="font-semibold">Office</p><p className="text-gray-600">Cape Town, South Africa</p></div></div>
              </div>
            </div>
            <div>
              {sent ? (
                <div className="card-light p-8 text-center">
                  <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="font-bold text-lg">Message Sent!</h3>
                  <p className="text-gray-600 mt-2">We'll get back to you within 24 hours.</p>
                </div>
              ) : (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  try {
                    const res = await fetch('/api/leads?action=contact', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: fd.get('name'),
                        email: fd.get('email'),
                        message: fd.get('message'),
                      }),
                    });
                    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to send');
                    setSent(true);
                  } catch {
                    alert('Could not send your message — please email support@propreel.co.za directly.');
                  }
                }} className="space-y-4">
                  <div><label className="label text-gray-700">Name</label><input name="name" className="input-light" placeholder="Your name" required /></div>
                  <div><label className="label text-gray-700">Email</label><input name="email" type="email" className="input-light" placeholder="you@example.com" required /></div>
                  <div><label className="label text-gray-700">Message</label><textarea name="message" className="input-light min-h-[120px]" placeholder="How can we help?" required /></div>
                  <button type="submit" className="btn btn-primary w-full">Send Message</button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH PAGES
// ═══════════════════════════════════════════════════════════════════════════

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, loginWithGoogle } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="font-bold text-2xl text-white">PropReel</span>
          </Link>
        </div>
        <div className="card-dark p-8">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome back</h2>
          <p className="text-ink-400 mb-6">Sign in to your account</p>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="label">Email</label><input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
            <div><label className="label">Password</label><input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required /></div>
            <button type="submit" disabled={loading} className="btn btn-primary w-full">{loading ? 'Signing in...' : 'Sign In'}</button>
          </form>
          <div className="mt-4">
            <button onClick={loginWithGoogle} className="btn btn-secondary w-full">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
          </div>
          <p className="mt-6 text-center text-sm text-ink-400">
            Don't have an account? <Link to="/register" className="text-purple-400 hover:text-purple-300 font-semibold">Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { register, loginWithGoogle } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) { setError('You must acknowledge the AI disclaimer'); return; }
    setLoading(true);
    setError('');
    try {
      await register({ email, password, fullName, planId: 'STARTER', cycle: 'MONTHLY', aiAcknowledged: agreed });
      toast.success(`Welcome! You've received ${SIGNUP_BONUS} free credits!`, 'Account Created');
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="font-bold text-2xl text-white">PropReel</span>
          </Link>
        </div>
        <div className="card-dark p-8">
          <div className="bg-purple-950/50 border border-purple-500/30 rounded-xl p-4 mb-6 text-center">
            <Sparkles className="w-6 h-6 text-purple-400 mx-auto mb-2" />
            <p className="text-purple-200 font-bold text-lg">{SIGNUP_BONUS} Free Credits</p>
            <p className="text-purple-300 text-sm">on signup — no credit card required</p>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Create your account</h2>
          <p className="text-ink-400 mb-6">Start creating property videos in minutes</p>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="label">Full Name</label><input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Smith" required /></div>
            <div><label className="label">Email</label><input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
            <div><label className="label">Password</label><input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} /></div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1 w-4 h-4 rounded border-ink-600 bg-ink-800 text-purple-600 focus:ring-purple-600" />
              <span className="text-xs text-ink-400">I understand that PropReel uses AI technology, which may produce imperfect results, and I agree that spent credits are non-refundable.</span>
            </label>
            <button type="submit" disabled={loading || !agreed} className="btn btn-primary w-full">{loading ? 'Creating account...' : `Sign Up — Get ${SIGNUP_BONUS} Free Credits`}</button>
          </form>
          <div className="mt-4">
            <button onClick={loginWithGoogle} className="btn btn-secondary w-full">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign up with Google
            </button>
          </div>
          <p className="mt-6 text-center text-sm text-ink-400">
            Already have an account? <Link to="/login" className="text-purple-400 hover:text-purple-300 font-semibold">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD LAYOUT
// ═══════════════════════════════════════════════════════════════════════════

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, balance, logout, isAdmin } = useAuth();
  const { unreadCount, stats } = useActivity(user?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Overview' },
    { path: '/dashboard/credits', icon: <Zap className="w-5 h-5" />, label: 'Credits' },
    { path: '/dashboard/listings', icon: <List className="w-5 h-5" />, label: 'Listings' },
    { path: '/studio', icon: <Video className="w-5 h-5" />, label: 'Studio' },
    { path: '/dashboard/analytics', icon: <BarChart3 className="w-5 h-5" />, label: 'Analytics' },
    { path: '/dashboard/billing', icon: <CreditCard className="w-5 h-5" />, label: 'Billing' },
    { path: '/dashboard/agency', icon: <Building2 className="w-5 h-5" />, label: 'Agency' },
    { path: '/dashboard/settings', icon: <Settings className="w-5 h-5" />, label: 'Settings' },
    { path: '/dashboard/notifications', icon: <Bell className="w-5 h-5" />, label: 'Notifications' },
  ];

  if (isAdmin) {
    navItems.push({ path: '/admin', icon: <Shield className="w-5 h-5" />, label: 'Admin' });
    navItems.push({ path: '/admin/integrations', icon: <Zap className="w-5 h-5" />, label: 'Integrations' });
  }

  return (
    <div className="min-h-screen bg-ink-950 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-ink-900 border-r border-white/5 transform transition-transform lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-white/5">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
                <Play className="w-4 h-4 text-white fill-white" />
              </div>
              <span className="font-bold text-lg text-white">PropReel</span>
            </Link>
          </div>
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  location.pathname === item.path ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.icon} {item.label}
              </Link>
            ))}
          </nav>
          <div className="p-3 border-t border-white/5">
            {user?.subscription?.planId !== 'PREMIUM' && user?.subscription?.planId !== 'AGENCY' && user?.role !== 'ADMIN' && (
              <Link to="/payment?plan=PREMIUM&cycle=MONTHLY&price=1270" className="block mb-3 p-3 rounded-xl bg-gradient-to-r from-purple-700/20 to-purple-900/20 border border-purple-500/20 hover:border-purple-500/40 transition">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-semibold text-white">Upgrade to Pro</span>
                </div>
                <p className="text-xs text-ink-400 mt-1">1,300 credits • Priority queue</p>
              </Link>
            )}
            <div className="card-dark p-3 mb-3">
              <p className="text-xs text-ink-400 uppercase tracking-wide">Credits</p>
              <p className="text-2xl font-bold text-white">{balance.personal}</p>
              {balance.agency > 0 && <p className="text-xs text-ink-400">+ {balance.agency} agency pool</p>}
              <div className="mt-2 pt-2 border-t border-white/5">
                <p className="text-xs text-ink-500">Used this week: {stats.used7d} credits</p>
                <p className="text-xs text-ink-500">Used this month: {stats.used30d} credits</p>
              </div>
            </div>
            <button 
              onClick={() => window.open('mailto:support@propreel.co.za?subject=Bug Report', '_blank')}
              className="w-full mb-3 px-3 py-2 rounded-lg text-xs text-ink-400 hover:text-white hover:bg-white/5 transition flex items-center gap-2"
              title="Report a bug or issue"
            >
              <AlertCircle className="w-3 h-3" /> Report a Bug
            </button>
              <Tooltip content="Keyboard shortcuts (?)">
                <button 
                  onClick={() => setShowShortcuts(true)}
                  className="w-full mb-3 px-3 py-2 rounded-lg text-xs text-ink-400 hover:text-white hover:bg-white/5 transition flex items-center gap-2"
                >
                  <Keyboard className="w-3 h-3" /> Keyboard Shortcuts
                </button>
              </Tooltip>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('propreel:show-help'))}
                className="w-full mb-3 px-3 py-2 rounded-lg text-xs text-ink-400 hover:text-white hover:bg-white/5 transition flex items-center gap-2"
              >
                <HelpCircle className="w-3 h-3" /> Help & FAQ
              </button>
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-white text-sm font-bold">
                {user?.fullName?.[0] || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.fullName}</p>
                <p className="text-xs text-ink-400 truncate">{user?.email}</p>
              </div>
              <button onClick={() => { logout(); navigate('/'); }} className="text-ink-400 hover:text-white" aria-label="Log out" title="Log out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 bg-ink-950/80 backdrop-blur-xl border-b border-white/5 px-4 lg:px-8 h-16 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden text-ink-400 hover:text-white" aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} aria-expanded={sidebarOpen}>
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-4 ml-auto">
            <SearchButton />
            <Link to="/dashboard/notifications" className="relative text-ink-400 hover:text-white" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </Link>
            <div className="badge badge-brand">
              <Zap className="w-3 h-3" /> {balance.total} credits
            </div>
          </div>
        </header>
        <main id="main-content" className="flex-1 p-4 lg:p-8 pb-28 lg:pb-8 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal 
        isOpen={showShortcuts} 
        onClose={() => setShowShortcuts(false)} 
      />

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGES
// ═══════════════════════════════════════════════════════════════════════════

function DashboardOverview() {
  const loading = useSimulatedLoading(450);
  if (loading) return <DashboardSkeleton />;
  return <Suspense fallback={<DashboardSkeleton />}><EnhancedOverview /></Suspense>;
}

function DashboardListings() {
  const loading = useSimulatedLoading(400);
  if (loading) return <ProjectsSkeleton />;
  return <EnhancedProjects />;
}

function DashboardAnalytics() {
  return <Suspense fallback={<DashboardSkeleton />}><EnhancedAnalytics /></Suspense>;
}

function DashboardBilling() {
  const loading = useSimulatedLoading(450);
  if (loading) return <BillingSkeleton />;
  return <Suspense fallback={<BillingSkeleton />}><EnhancedBilling /></Suspense>;
}

function DashboardAgency() {
  return <Suspense fallback={<DashboardSkeleton />}><EnhancedAgency /></Suspense>;
}

function DashboardSettings() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'profile' | 'security' | 'account'>('profile');
  
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">Settings</h1>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button onClick={() => setTab('profile')} className={`tab-pill ${tab === 'profile' ? 'tab-pill-active' : ''}`}>Profile</button>
        <button onClick={() => setTab('security')} className={`tab-pill ${tab === 'security' ? 'tab-pill-active' : ''}`}>Security & Privacy</button>
        <button onClick={() => setTab('account')} className={`tab-pill ${tab === 'account' ? 'tab-pill-active' : ''}`}>Account</button>
      </div>
      {tab === 'profile' ? (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Profile</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="label">Full Name</label><input className="input" defaultValue={user?.fullName} /></div>
              <div><label className="label">Email</label><input className="input" defaultValue={user?.email} disabled /></div>
              <div><label className="label">Agency</label><input className="input" defaultValue={user?.agencyName || ''} /></div>
              <div><label className="label">Phone</label><input className="input" placeholder="+27..." /></div>
            </div>
            <button className="btn btn-primary mt-6">Save Changes</button>
          </div>
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Change Password</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="label">Current Password</label><input type="password" className="input" placeholder="••••••••" /></div>
              <div><label className="label">New Password</label><input type="password" className="input" placeholder="••••••••" /></div>
            </div>
            <button className="btn btn-primary mt-6">Update Password</button>
          </div>
        </div>
      ) : tab === 'security' ? (
        <SecuritySettings />
      ) : (
        <div className="space-y-6">
          <div className="card-dark p-6">
            <h3 className="font-semibold text-white mb-4">Account Management</h3>
            <div className="space-y-4">
              <div className="p-4 bg-ink-800/50 rounded-xl">
                <h4 className="font-medium text-white mb-2">Subscription</h4>
                <p className="text-sm text-ink-400 mb-3">Manage your subscription and billing preferences.</p>
                <Link to="/dashboard/cancel-subscription" className="btn btn-secondary w-full">
                  <XCircle className="w-4 h-4" /> Cancel Subscription
                </Link>
              </div>
              <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-xl">
                <h4 className="font-medium text-white mb-2">Delete Account</h4>
                <p className="text-sm text-ink-400 mb-3">Permanently delete your account and all associated data. This action cannot be undone.</p>
                <Link to="/dashboard/delete-account" className="btn btn-danger w-full">
                  <Trash2 className="w-4 h-4" /> Delete Account
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STUDIO (7 TABS)
// ═══════════════════════════════════════════════════════════════════════════

function StudioPage() {
  const loading = useSimulatedLoading(400);
  if (loading) return <StudioSkeleton />;
  return <StudioPageInner />;
}

function StudioPageInner() {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'description');
  const { user } = useCredit();
  // Shared voiceover script: the Video tab generates it, FlashHead speaks it
  const [sharedScript, setSharedScript] = useState('');
  const tabs = [
    { id: 'description', label: 'Description', icon: <FileText className="w-4 h-4" /> },
    { id: 'photo', label: 'Photo Editor', icon: <Camera className="w-4 h-4" /> },
    { id: 'staging', label: 'Virtual Staging', icon: <Sofa className="w-4 h-4" /> },
    { id: 'removal', label: 'Furniture Removal', icon: <Trash2 className="w-4 h-4" /> },
    { id: 'twilight', label: 'Twilight', icon: <MoonIcon className="w-4 h-4" /> },
    { id: 'social', label: 'Social Media', icon: <Share2 className="w-4 h-4" /> },
    { id: 'video', label: 'Video Generator', icon: <Video className="w-4 h-4" /> },
    { id: 'flashhead', label: 'Talking Head', icon: <Mic className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Studio</h1>
          <p className="text-ink-400 mt-1">8 AI-powered tools to market your properties.</p>
        </div>
        <Link
          to="/dashboard/credits"
          className="badge badge-brand hover:bg-white/10 transition"
          title="Recharge credits"
        >
          <Zap className="w-3 h-3" /> {user?.credits ?? 0} credits
        </Link>
      </div>
      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 ${tab === t.id ? 'tab-pill tab-pill-active' : 'tab-pill'}`}>
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>
      {/* Tab Content */}
      <div className="card-dark p-6">
        {tab === 'description' && <DescriptionTab />}
        {tab === 'photo' && <PhotoEditorTab />}
        {tab === 'staging' && <StagingTab />}
        {tab === 'removal' && <RemovalTab />}
        {tab === 'twilight' && <TwilightTab />}
        {tab === 'social' && <SocialTab />}
        {tab === 'video' && <VideoTab sharedScript={sharedScript} onScriptChange={setSharedScript} onNavigateTab={setTab} />}
        {tab === 'flashhead' && <FlashHeadVideo initialScript={sharedScript} onScriptChange={setSharedScript} />}
      </div>
    </div>
  );
}

function DescriptionTab() {
  const [tone, setTone] = useState('Professional');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [fields, setFields] = useState({ address: '', price: '', bedrooms: '', bathrooms: '', garages: '', propertyType: '', features: '' });
  const setField = (k: string) => (e: any) => setFields(f => ({ ...f, [k]: e.target.value }));

  // Real AI generation via fal-ai/any-llm (through the Modal worker)
  const generate = async () => {
    setLoading(true);
    try {
      const text = await PropReelAPI.generateText('description', { tone, ...fields });
      setDescription(text.trim());
      toast.success('Description generated', 'AI Copywriter');
    } catch (e: any) {
      toast.error(e.message || 'Description generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><FileText className="w-5 h-5 text-purple-400" /> Property Description</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className="label">Address</label><input className="input" value={fields.address} onChange={setField('address')} placeholder="15 Vineyard Road, Constantia" /></div>
        <div><label className="label">Price (ZAR)</label><input className="input" type="number" value={fields.price} onChange={setField('price')} placeholder="12500000" /></div>
        <div><label className="label">Bedrooms</label><input className="input" type="number" value={fields.bedrooms} onChange={setField('bedrooms')} placeholder="5" /></div>
        <div><label className="label">Bathrooms</label><input className="input" type="number" value={fields.bathrooms} onChange={setField('bathrooms')} placeholder="4" /></div>
        <div><label className="label">Garages</label><input className="input" type="number" value={fields.garages} onChange={setField('garages')} placeholder="3" /></div>
        <div><label className="label">Property Type</label><input className="input" value={fields.propertyType} onChange={setField('propertyType')} placeholder="House" /></div>
      </div>
      <div>
        <label className="label">Key Features (comma separated)</label>
        <input className="input" value={fields.features} onChange={setField('features')} placeholder="Pool, garden, panoramic views, gas stove, walk-in pantry" />
      </div>
      <div>
        <label className="label">Tone</label>
        <div className="flex flex-wrap gap-2">
          {TONES.map(t => (
            <button key={t.id} onClick={() => setTone(t.id)} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tone === t.id ? 'bg-purple-700 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>
      <button onClick={generate} disabled={loading} className="btn btn-primary">
        {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate Description</>}
      </button>
      {description && (
        <div className="space-y-3">
          <label className="label">Generated Description</label>
          <textarea className="input min-h-[200px]" value={description} onChange={e => setDescription(e.target.value)} />
          <div className="flex gap-3">
            <button onClick={() => downloadText('description-property24.txt', description)} className="btn btn-secondary"><Download className="w-4 h-4" /> Download for Property24</button>
            <button onClick={() => downloadText('description-privateproperty.txt', description)} className="btn btn-secondary"><Download className="w-4 h-4" /> Download for Private Property</button>
            <CopyButton text={description} className="btn btn-ghost" label="Copy" />
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoEditorTab() {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [strength, setStrength] = useState(0.30);
  const [guidance, setGuidance] = useState(4.5);
  const [customPrompt, setCustomPrompt] = useState('');
  const photoPresets = IMAGE_PRESETS.filter(p => p.category === 'photo_editor');
  const active = photoPresets.find(p => p.id === selectedPreset);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Camera className="w-5 h-5 text-purple-400" /> AI Photo Editor</h2>
      <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
        <p className="text-xs text-purple-200 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Each image render costs 2 credits — failed renders are refunded automatically
        </p>
      </div>
      <div>
        <label className="label">Enhancement Preset</label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {photoPresets.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedPreset(p.id); setStrength(p.strength.default); setGuidance(p.guidanceScale.default); }}
              className={`p-4 rounded-xl text-center transition ${selectedPreset === p.id ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}
            >
              <span className="text-2xl">{p.emoji}</span>
              <p className="text-xs mt-2 font-medium">{p.label}</p>
            </button>
          ))}
        </div>
      </div>
      {active && (
        <div className="p-3 bg-ink-800/50 rounded-lg">
          <p className="text-xs text-ink-400">
            <strong className="text-ink-300">{active.label}:</strong> Strength {active.strength.min.toFixed(2)}–{active.strength.max.toFixed(2)}, Guidance {active.guidanceScale.min.toFixed(1)}–{active.guidanceScale.max.toFixed(1)} (sliders locked to preset range)
          </p>
        </div>
      )}
      {selectedPreset && (
        <>
          <div>
            <label className="label">Strength: {strength.toFixed(2)} <span className="text-ink-500 text-xs">(preset range enforced)</span></label>
            <input
              type="range"
              min={active!.strength.min}
              max={active!.strength.max}
              step={0.01}
              value={strength}
              onChange={e => setStrength(Number(e.target.value))}
              className="w-full accent-purple-600"
            />
          </div>
          <div>
            <label className="label">Guidance scale: {guidance.toFixed(1)} <span className="text-ink-500 text-xs">(how strictly the AI follows the prompt)</span></label>
            <input
              type="range"
              min={active!.guidanceScale.min}
              max={active!.guidanceScale.max}
              step={0.1}
              value={guidance}
              onChange={e => setGuidance(Number(e.target.value))}
              className="w-full accent-purple-600"
            />
          </div>
          <div>
            <label className="label">Custom prompt (optional — overrides the preset)</label>
            <textarea
              className="input min-h-[80px]"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="Describe a custom enhancement…"
            />
          </div>
          <ImageWorkbench
            presetId={selectedPreset}
            strength={strength}
            guidanceScale={guidance}
            customPrompt={customPrompt.trim() ? customPrompt : undefined}
            ctaLabel={`Enhance (2 credits)`}
            emptyHint="JPEG, PNG, WEBP up to 25MB"
          />
        </>
      )}
      {!selectedPreset && (
        <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center">
          <Camera className="w-8 h-8 text-ink-400 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">Pick an enhancement preset above to begin</p>
        </div>
      )}
    </div>
  );
}

function StagingTab() {
  const [room, setRoom] = useState('living_room');
  const [style, setStyle] = useState('luxury_modern');
  const stagingPresets = IMAGE_PRESETS.filter(p => p.category === 'staging');
  const selectedPreset = stagingPresets.find(p => p.id === style);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Sofa className="w-5 h-5 text-purple-400" /> Virtual Staging</h2>
      <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
        <p className="text-xs text-purple-200 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Each image render costs 2 credits — failed renders are refunded automatically
        </p>
      </div>
      <div>
        <label className="label">Room Type</label>
        <div className="flex flex-wrap gap-2">
          {ROOM_TYPES.map(r => (
            <button key={r.id} onClick={() => setRoom(r.id)} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${room === r.id ? 'bg-purple-700 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Furniture Style</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stagingPresets.map(s => (
            <button key={s.id} onClick={() => setStyle(s.id)} className={`p-4 rounded-xl text-center transition ${style === s.id ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              <span className="text-2xl">{s.emoji}</span>
              <p className="text-xs mt-2 font-medium">{s.label}</p>
            </button>
          ))}
        </div>
      </div>
      {selectedPreset && (
        <div className="p-3 bg-ink-800/50 rounded-lg">
          <p className="text-xs text-ink-400">
            <strong className="text-ink-300">{selectedPreset.label}:</strong> Strength {selectedPreset.strength.min.toFixed(2)}–{selectedPreset.strength.max.toFixed(2)}, Guidance {selectedPreset.guidanceScale.min.toFixed(1)}–{selectedPreset.guidanceScale.max.toFixed(1)}
          </p>
        </div>
      )}
      <ImageWorkbench
        presetId={style}
        strength={selectedPreset?.strength.default}
        guidanceScale={selectedPreset?.guidanceScale.default}
        ctaLabel="Stage Room (2 credits)"
        emptyHint="Upload an empty room photo — JPEG/PNG/WEBP up to 25MB"
      />
    </div>
  );
}

function RemovalTab() {
  const [mode, setMode] = useState('remove_all_furniture');
  const removalPresets = IMAGE_PRESETS.filter(p => p.category === 'removal');
  const selectedPreset = removalPresets.find(p => p.id === mode);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Trash2 className="w-5 h-5 text-purple-400" /> Furniture Removal</h2>
      <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
        <p className="text-xs text-purple-200 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Each image render costs 2 credits — failed renders are refunded automatically
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {removalPresets.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} className={`p-6 rounded-xl text-center transition ${mode === m.id ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
            <span className="text-3xl">{m.emoji}</span>
            <p className="font-medium mt-3 text-sm">{m.label}</p>
          </button>
        ))}
      </div>
      {selectedPreset && (
        <div className="p-3 bg-ink-800/50 rounded-lg">
          <p className="text-xs text-ink-400">
            <strong className="text-ink-300">{selectedPreset.label}:</strong> Strength {selectedPreset.strength.min.toFixed(2)}–{selectedPreset.strength.max.toFixed(2)}, Guidance {selectedPreset.guidanceScale.min.toFixed(1)}–{selectedPreset.guidanceScale.max.toFixed(1)}
          </p>
        </div>
      )}
      <ImageWorkbench
        presetId={mode}
        strength={selectedPreset?.strength.default}
        guidanceScale={selectedPreset?.guidanceScale.default}
        ctaLabel="Remove (2 credits)"
        emptyHint="Upload a photo with furniture or clutter to remove"
      />
    </div>
  );
}

function TwilightTab() {
  const [style, setStyle] = useState('blue_hour');
  const twilightPresets = IMAGE_PRESETS.filter(p => p.category === 'twilight');
  const selectedPreset = twilightPresets.find(p => p.id === style);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><MoonIcon className="w-5 h-5 text-purple-400" /> Twilight Photography</h2>
      <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
        <p className="text-xs text-purple-200 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Each image render costs 2 credits — failed renders are refunded automatically
        </p>
      </div>
      <div>
        <label className="label">Twilight Style</label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {twilightPresets.map(s => (
            <button key={s.id} onClick={() => setStyle(s.id)} className={`p-4 rounded-xl text-center transition ${style === s.id ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              <span className="text-2xl">{s.emoji}</span>
              <p className="text-xs mt-2 font-medium">{s.label}</p>
            </button>
          ))}
        </div>
      </div>
      {selectedPreset && (
        <div className="p-3 bg-ink-800/50 rounded-lg">
          <p className="text-xs text-ink-400">
            <strong className="text-ink-300">{selectedPreset.label}:</strong> Strength {selectedPreset.strength.min.toFixed(2)}–{selectedPreset.strength.max.toFixed(2)}, Guidance {selectedPreset.guidanceScale.min.toFixed(1)}–{selectedPreset.guidanceScale.max.toFixed(1)}
          </p>
        </div>
      )}
      <ImageWorkbench
        presetId={style}
        strength={selectedPreset?.strength.default}
        guidanceScale={selectedPreset?.guidanceScale.default}
        ctaLabel="Convert to Twilight (2 credits)"
        emptyHint="Upload a daytime exterior photo — best results on clear shots of the full property"
      />
    </div>
  );
}

function SocialTab() {
  const [platform, setPlatform] = useState('instagram');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [socialFields, setSocialFields] = useState({ suburb: '', bedrooms: '', bathrooms: '', price: '', features: '' });
  const setSf = (k: string) => (e: any) => setSocialFields(f => ({ ...f, [k]: e.target.value }));

  const generate = async () => {
    setLoading(true);
    try {
      const text = await PropReelAPI.generateText('social_caption', {
        platform,
        suburb: socialFields.suburb,
        bedrooms: socialFields.bedrooms,
        bathrooms: socialFields.bathrooms,
        price: socialFields.price,
        features: socialFields.features,
      });
      setCaption(text.trim().replace(/^"|"$/g, ''));
    } catch (e: any) {
      toast.error(e.message || 'Caption generation failed');
    } finally {
      setLoading(false);
    }
  };

  const currentPlatform = SOCIAL_PLATFORMS.find(p => p.id === platform);
  const isOverLimit = caption.length > (currentPlatform?.charLimit || 0);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Share2 className="w-5 h-5 text-purple-400" /> Social Media Post Generator</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div><label className="label">Suburb / City</label><input className="input" value={socialFields.suburb} onChange={setSf('suburb')} placeholder="Constantia, Cape Town" /></div>
        <div><label className="label">Price</label><input className="input" value={socialFields.price} onChange={setSf('price')} placeholder="R12,500,000" /></div>
        <div><label className="label">Beds / Baths</label><input className="input" value={socialFields.bedrooms ? `${socialFields.bedrooms} bed` : ''} onChange={setSf('bedrooms')} placeholder="5 bed, 4 bath" /></div>
        <div className="md:col-span-3"><label className="label">Key Features</label><input className="input" value={socialFields.features} onChange={setSf('features')} placeholder="Pool, panoramic views, triple garage" /></div>
      </div>
      <div>
        <label className="label">Select Platform</label>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setPlatform(p.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${platform === p.id ? 'bg-purple-700 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>
        {currentPlatform && (
          <div className="mt-3 p-3 bg-ink-800/50 rounded-lg">
            <p className="text-xs text-ink-400 mb-1">Platform Requirements:</p>
            <p className="text-sm text-white">{currentPlatform.rules}</p>
            <p className="text-xs text-ink-400 mt-2">Character limit: {currentPlatform.charLimit.toLocaleString()}</p>
          </div>
        )}
      </div>
      <button onClick={generate} disabled={loading} className="btn btn-primary">
        {loading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate Post</>}
      </button>
      {caption && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">
              Generated Post 
              <span className={`ml-2 ${isOverLimit ? 'text-red-400' : 'text-ink-400'}`}>
                ({caption.length} / {currentPlatform?.charLimit} chars)
              </span>
            </label>
            {isOverLimit && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Over limit!
              </span>
            )}
          </div>
          <textarea 
            className={`input min-h-[200px] ${isOverLimit ? 'border-red-500/50' : ''}`} 
            value={caption} 
            onChange={e => setCaption(e.target.value)} 
          />
          <div className="flex gap-3">
            <CopyButton text={caption} className="btn btn-secondary" label="Copy to Clipboard" copiedLabel="Copied!" />
            <button onClick={() => setCaption('')} className="btn btn-ghost"><X className="w-4 h-4" /> Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

const RENDER_ENDPOINT = import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';

function VideoTab({ sharedScript, onScriptChange, onNavigateTab }: { sharedScript: string; onScriptChange: (s: string) => void; onNavigateTab: (t: string) => void }) {
  const { user, deductCredits, addCredits } = useCredit();
  const toast = useToast();
  const [tier, setTier] = useState('SOCIAL');
  const [configIndex, setConfigIndex] = useState(0);
  const [orientation, setOrientation] = useState('LANDSCAPE');
  const [voice, setVoice] = useState('Joanna');
  // Script lives in StudioPage state so the FlashHead tab speaks the same text
  const script = sharedScript;
  const setScript = onScriptChange;
  const [branding, setBranding] = useState(true);
  const [aiTalkingProfile, setAiTalkingProfile] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const [musicTracks, setMusicTracks] = useState<Array<{ id: string; name: string; genre: string; url: string }>>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [lastRenderUrl, setLastRenderUrl] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  // Elapsed-vs-typical progress for the reel render (typical scales with clip count)
  const reelProgress = useRenderProgress(typicalVideoSeconds(uploadedImages.length || 1));

  const tierConfig = TIERS.find(t => t.id === tier)!;
  const selectedConfig = tierConfig.configurations[configIndex];

  // Calculate target word count based on selected duration
  const calculateTargetWords = (durationSeconds: number) => {
    const wordsPerSecond = 2.4; // Average speaking rate
    return Math.round(durationSeconds * wordsPerSecond);
  };

  const targetWords = calculateTargetWords(selectedConfig.duration);

  // Reset config index when tier changes
  useEffect(() => {
    setConfigIndex(0);
  }, [tier]);

  // Load admin-managed music tracks for the picker
  useEffect(() => {
    fetch('/api/music')
      .then(r => r.json())
      .then(d => setMusicTracks(d.tracks || []))
      .catch(() => setMusicTracks([]));
  }, []);

  // Real AI script generation via fal-ai/any-llm, sized to the selected duration
  const generateScript = async () => {
    setGeneratingScript(true);
    try {
      const text = await PropReelAPI.generateText('video_script', {
        tier,
        duration_seconds: selectedConfig.duration,
        target_words: targetWords,
      });
      setScript(text.trim());
    } catch (e: any) {
      toast.error(e.message || 'Script generation failed');
    } finally {
      setGeneratingScript(false);
    }
  };

  const generateReel = async () => {
    setGenerating(true);
    reelProgress.start();
    const totalCredits = selectedConfig.credits;
    const recordId = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      // 1) Create the project record first (real data in propreel-projects)
      let projectId: string | null = null;
      if (user) {
        try {
          const project = await PropReelAPI.createProject({
            userId: user.id,
            title: script ? script.slice(0, 60).replace(/\n/g, ' ') : 'Property Video',
            status: 'PROCESSING',
            videoTier: tier,
            durationSeconds: selectedConfig.duration,
            jobId: recordId,
            creditsSpent: selectedConfig.credits,
          } as any);
          projectId = project.id;
        } catch { /* non-fatal — render can still proceed */ }
      }

      // 2) Deduct credits atomically server-side
      await deductCredits(totalCredits, 'Video generation', {
        tier,
        duration: selectedConfig.duration,
        recordId,
      });

      // 3) Start the async render job
      const response = await fetch(`${RENDER_ENDPOINT}/render_video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: recordId,
          tier,
          config_index: configIndex,
          orientation,
          images: uploadedImages,
          // Hailuo-02 prompt rotation: image 1→A, 2→B, 3→C, 4→A, 5→B, …
          image_prompts: buildPromptRotation(uploadedImages),
          voiceover_text: script,
          voice_id: voice,
          include_agent_branding: branding,
          audio: false,
          music_url: selectedMusic || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to start video generation');
      }

      const result = await response.json();
      track('render_started', { tier, orientation });

      // 4) Poll /render_status until terminal (ESSENTIAL renders synchronously
      // and return video_url immediately)
      let finalUrl: string | null = result?.video_url || null;
      let measuredDuration: number | undefined;
      if (!finalUrl && result?.record_id) {
        const deadline = Date.now() + 12 * 60 * 1000;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 5000));
          try {
            const s = await fetch(`${RENDER_ENDPOINT}/render_status?record_id=${encodeURIComponent(result.record_id)}`).then(r => r.json());
            setRenderStatus(String(s.status || '').toLowerCase());
            if (s.status === 'completed' && s.video_url) {
              finalUrl = s.video_url;
              if (s.duration_seconds) measuredDuration = Number(s.duration_seconds);
              break;
            }
            if (s.status === 'failed') {
              throw new Error(s.error || 'Render failed');
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Failed to fetch') throw e;
          }
        }
      }
      if (finalUrl) setLastRenderUrl(finalUrl);

      // 5) Talking Head add-on: render it on the dedicated tab (script carries
      // over; FlashHead's own 8-credit charge happens there — no double billing)
      if (aiTalkingProfile) {
        toast.info(
          'Talking Head add-on: finish on the Talking Head tab — your script is ready and waiting.',
          'One step left'
        );
      }

      // 6) Finalize the project record
      if (user && projectId && finalUrl) {
        PropReelAPI.updateProject(user.id, projectId, {
          status: 'READY',
          videoUrl: finalUrl,
          ...(measuredDuration ? { durationSeconds: measuredDuration } : {}),
        }).catch(() => {});
      }

      setGenerating(false);
      reelProgress.stop();
      toast.success('Video rendered successfully!', 'Render Complete');
    } catch (error: any) {
      console.error('Error generating video:', error);
      // Failed renders refund the credits (spec: refund on failure)
      try {
        await addCredits(totalCredits, 'refund', `Refund — failed video render (${tier})`);
      } catch { /* best-effort */ }
      setGenerating(false);
      reelProgress.stop();
      toast.error(error.message || 'Failed to generate video — credits refunded', 'Error');
    }
  };

  const totalCredits = selectedConfig.credits;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Video className="w-5 h-5 text-purple-400" /> AI Video Generator</h2>
      
      {/* 1. Video Tier */}
      <div>
        <label className="label">Video Tier</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TIERS.map(t => {
            const minCredits = Math.min(...t.configurations.map(c => c.credits));
            const maxCredits = Math.max(...t.configurations.map(c => c.credits));
            const creditRange = minCredits === maxCredits ? `${minCredits}` : `${minCredits}-${maxCredits}`;
            return (
              <button key={t.id} onClick={() => setTier(t.id)} className={`p-4 rounded-xl text-left transition ${tier === t.id ? 'bg-purple-700/20 border border-purple-500/30' : 'bg-white/5 hover:bg-white/10'}`}>
                <p className={`font-bold ${tier === t.id ? 'text-purple-300' : 'text-white'}`}>{t.label}</p>
                <p className="text-xs text-ink-400 mt-1">{t.description}</p>
                <p className="text-xs text-ink-500 mt-1">
                  {t.resolution} • {t.configurations.length} options
                </p>
                <p className="text-sm font-semibold text-purple-400 mt-2">{creditRange} credits</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1.5 Configuration Selection */}
      <div>
        <label className="label">Configuration</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {tierConfig.configurations.map((config, idx) => (
            <button 
              key={idx} 
              onClick={() => setConfigIndex(idx)} 
              className={`p-4 rounded-xl text-left transition ${configIndex === idx ? 'bg-purple-700/20 border border-purple-500/30' : 'bg-white/5 hover:bg-white/10'}`}
            >
              <p className={`font-bold ${configIndex === idx ? 'text-purple-300' : 'text-white'}`}>
                {config.duration}s Video
              </p>
              <p className="text-xs text-ink-400 mt-1">{config.images} images</p>
              <p className="text-sm font-semibold text-purple-400 mt-2">{config.credits} credits</p>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Property Photos */}
      <div>
        <label className="label">Property Photos (max {selectedConfig.images})</label>
        <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center">
          <Image className="w-8 h-8 text-ink-400 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">Drop photos here or click to upload</p>
          <p className="text-ink-500 text-xs mt-1">Select up to {selectedConfig.images} images for {selectedConfig.duration}s video</p>
        </div>
      </div>

      {/* 3. Orientation */}
      <div>
        <label className="label">Orientation</label>
        <div className="flex gap-3">
          {ORIENTATIONS.map(o => (
            <button key={o.id} onClick={() => setOrientation(o.id)} className={`flex items-center gap-3 px-6 py-3 rounded-xl transition ${orientation === o.id ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              <span className="text-xl">{o.icon}</span>
              <div className="text-left">
                <p className="font-medium text-sm">{o.label}</p>
                <p className="text-xs text-ink-400">{o.ratio}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Voiceover Script */}
      <div>
        <div className="flex items-center justify-between">
          <label className="label">
            Voiceover Script 
            <span className="text-xs text-ink-400 ml-2">
              ({wordCount(script)} / {targetWords} words, ~{Math.round(wordCount(script) / 2.4)}s)
            </span>
          </label>
          <button 
            onClick={generateScript} 
            disabled={generatingScript} 
            className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
          >
            {generatingScript ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI Write
          </button>
        </div>
        <textarea 
          className="input min-h-[120px]" 
          value={script} 
          onChange={e => setScript(e.target.value)} 
          placeholder={`Write your voiceover script or use AI to generate one...\n\nTarget: ${targetWords} words for ${selectedConfig.duration}s video`}
        />
        <p className="text-xs text-ink-500 mt-1">
          Target word count: {targetWords} words (based on {selectedConfig.duration}s duration at 2.4 words/second)
        </p>
      </div>

      {/* 5. Narrator Voice */}
      <div>
        <label className="label">Narrator Voice</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {VOICES.map(v => (
            <button key={v.id} onClick={() => setVoice(v.id)} className={`px-3 py-2 rounded-lg text-sm text-left transition ${voice === v.id ? 'bg-purple-700/20 text-purple-300 border border-purple-500/30' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              <Mic className="w-3 h-3 inline mr-1" /> {v.id}
              <span className="text-xs text-ink-500 ml-1">({v.accent})</span>
            </button>
          ))}
        </div>
      </div>

      {/* 6. AI Talking Profile add-on → dedicated Talking Head tab */}
      <AITalkingProfile
        enabled={aiTalkingProfile}
        onToggle={setAiTalkingProfile}
        profileImage={profileImage}
        onProfileImageChange={setProfileImage}
        voiceoverScript={script}
      />
      {aiTalkingProfile && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white flex items-center gap-2">
                <Mic className="w-4 h-4 text-purple-400" /> Talking Head lip-sync add-on
              </p>
              <p className="text-xs text-ink-400 mt-1">
                Your script ({script.trim() ? `${script.trim().split(/\s+/).length} words` : 'not generated yet'}) travels with you —
                finish setup on the Talking Head tab: upload your headshot, pick a voice, render (+8 credits).
              </p>
            </div>
            <button
              onClick={() => {
                onNavigateTab('flashhead');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="btn btn-primary whitespace-nowrap text-sm"
            >
              Continue to Talking Head <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 7. Background Music */}
      <div>
        <label className="label flex items-center gap-2">
          <Music className="w-4 h-4 text-purple-400" />
          Background Music (Optional)
        </label>
        <div className="bg-ink-800/50 rounded-xl p-4">
          {musicTracks.length === 0 ? (
            <p className="text-sm text-ink-400">No music tracks available yet — your administrator can upload tracks in Admin → Music Library.</p>
          ) : (
            <select
              className="input"
              value={selectedMusic || ''}
              onChange={(e) => setSelectedMusic(e.target.value || null)}
            >
              <option value="">No background music</option>
              {musicTracks.map(t => (
                <option key={t.id} value={t.url}>{t.name} ({t.genre})</option>
              ))}
            </select>
          )}
          <p className="text-xs text-ink-500 mt-2">
            Select background music to enhance your video. Music tracks are managed by administrators.
          </p>
        </div>
      </div>

      {/* 8. Branding & Music — tap-to-include toggles */}
      <div className="space-y-3">
        <label className="label">Enhancements</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setBranding(!branding)}
            aria-pressed={branding}
            className={`p-4 rounded-xl text-left transition min-h-[44px] ${branding ? 'bg-purple-700/25 border border-purple-500/50' : 'bg-white/5 border border-transparent hover:bg-white/10'}`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-sm font-semibold ${branding ? 'text-purple-300' : 'text-ink-300'}`}>Agent Profile Branding</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${branding ? 'bg-purple-600 text-white' : 'bg-white/10 text-ink-400'}`}>{branding ? 'INCLUDED' : 'OFF'}</span>
            </div>
            <p className="text-xs text-ink-500 mt-1">Profile picture, agency logo & contact details on the reel</p>
          </button>
          <button
            type="button"
            onClick={() => setSelectedMusic(selectedMusic ? null : (musicTracks[0]?.url || 'default'))}
            aria-pressed={!!selectedMusic}
            disabled={musicTracks.length === 0}
            className={`p-4 rounded-xl text-left transition min-h-[44px] disabled:opacity-40 ${selectedMusic ? 'bg-purple-700/25 border border-purple-500/50' : 'bg-white/5 border border-transparent hover:bg-white/10'}`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-sm font-semibold ${selectedMusic ? 'text-purple-300' : 'text-ink-300'}`}>Music Track</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedMusic ? 'bg-purple-600 text-white' : 'bg-white/10 text-ink-400'}`}>{selectedMusic ? 'INCLUDED' : 'OFF'}</span>
            </div>
            <p className="text-xs text-ink-500 mt-1">{musicTracks.length === 0 ? 'No tracks uploaded yet' : selectedMusic ? 'Tap to remove — choose specific track below' : 'Tap to include — pick the track below'}</p>
          </button>
        </div>
        {selectedMusic && (
          <div className="bg-ink-800/50 rounded-xl p-4">
            <select
              className="input"
              value={selectedMusic}
              onChange={(e) => setSelectedMusic(e.target.value || null)}
              aria-label="Choose music track"
            >
              {musicTracks.map(t => (
                <option key={t.id} value={t.url}>{t.name} ({t.genre})</option>
              ))}
            </select>
            <p className="text-xs text-ink-500 mt-2">Music tracks are uploaded by administrators in Admin → Music Library.</p>
          </div>
        )}
      </div>

      {/* Generate Button */}
      <div className="space-y-3">
        <button 
          onClick={generateReel} 
          disabled={generating} 
          className="btn btn-primary w-full text-lg py-4"
        >
          {generating ? (
            <><RefreshCw className="w-5 h-5 animate-spin" /> Generating Video...</>
          ) : (
            <><Play className="w-5 h-5" /> Generate Video ({totalCredits} credits)</>
          )}
        </button>
        {generating && (
          <RenderProgressBar
            progress={reelProgress}
            stage={renderStatus === 'processing' ? 'processing' : renderStatus === 'queued' ? 'queued' : ''}
            label="Rendering your video reel"
          />
        )}
        {aiTalkingProfile && (
          <p className="text-xs text-ink-400 text-center">
            Video: {selectedConfig.credits} credits here — the Talking Head lip-sync (+8 credits) renders on its own tab with your script.
          </p>
        )}
        {!generating && lastRenderUrl && (
          <button
            onClick={() => setShareOpen(true)}
            className="btn btn-secondary w-full min-h-[48px]"
          >
            <Share2 className="w-4 h-4" /> Share to social media
          </button>
        )}
      </div>
      {shareOpen && lastRenderUrl && (
        <ShareSheet
          videoUrl={lastRenderUrl}
          caption={script.slice(0, 120)}
          hashtags={['PropertyForSale', 'SouthAfrica', 'RealEstate']}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════════════════

function AdminPage() {
  const [tab, setTab] = useState('overview');
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-purple-400" />
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {['overview', 'users', 'reviews', 'settings', 'prompts', 'music'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`tab-pill ${tab === t ? 'tab-pill-active' : ''}`}>
            {t === 'music' ? 'Music Library' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="card-dark p-6">
        {tab === 'overview' && <AdminOverview />}
        {tab === 'users' && <AdminUsers />}
        {tab === 'reviews' && <AdminReviews />}
        {tab === 'settings' && <AdminSettings />}
        {tab === 'prompts' && <AdminPrompts />}
        {tab === 'music' && <AdminMusicLibrary />}
      </div>
    </div>
  );
}

// Platform health from the Modal worker's fal.ai probe (billing/auth locks
// surface here before users hit them). Polled every 60s while the tab is open.
function useFalProbe() {
  const [probe, setProbe] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      const url = `${import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run'}/probe`;
      fetch(url).then(r => r.json()).then(d => { if (alive) setProbe(d); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return probe;
}

function FalHealthCard() {
  const probe = useFalProbe();
  const cls = probe?.class || 'loading';
  const config: Record<string, { color: string; label: string }> = {
    healthy: { color: 'text-green-400', label: 'fal.ai healthy' },
    billing_locked: { color: 'text-red-400', label: 'fal.ai OUT OF BALANCE — renders will fail' },
    auth_failed: { color: 'text-red-400', label: 'fal.ai key rejected — check FAL_KEY secret' },
    provider_error: { color: 'text-yellow-400', label: 'fal.ai degraded' },
    timeout: { color: 'text-yellow-400', label: 'fal.ai slow/timeout' },
    no_data: { color: 'text-ink-400', label: 'Awaiting first probe' },
    loading: { color: 'text-ink-400', label: 'Checking fal.ai status…' },
  };
  const c = config[cls] || config.loading;
  return (
    <div className="bg-ink-800/50 rounded-xl p-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium {c.color}"><span className={c.color}>●</span> <span className="text-white">{c.label}</span></p>
        {probe?.detail && <p className="text-xs text-ink-500 mt-1">{String(probe.detail).slice(0, 120)}</p>}
      </div>
      <div className="text-right">
        {probe?.latencyMs != null && <p className="text-xs text-ink-400">{probe.latencyMs} ms</p>}
        {probe?.checkedAt && <p className="text-[10px] text-ink-500">checked {new Date(probe.checkedAt).toLocaleTimeString()}</p>}
      </div>
    </div>
  );
}

function AdminOverview() {
  const { user } = useCredit();
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user?.email) return;
    fetch(`/api/users?action=admin_stats&email=${encodeURIComponent(user.email)}`)
      .then(r => { if (!r.ok) throw new Error('Admin stats unavailable'); return r.json(); })
      .then(d => setStats(d.stats))
      .catch(e => setError(e.message));
  }, [user?.email]);

  const items = stats ? [
    { label: 'Total Users', value: stats.userCount },
    { label: 'Active Users (30d)', value: stats.activeUsers },
    { label: 'Agencies', value: stats.agencyCount },
    { label: 'Projects', value: stats.projectCount },
    { label: 'Ready Reels', value: stats.readyReels },
    { label: 'Processing', value: stats.processingReels },
    { label: 'Failed', value: stats.failedReels },
    { label: 'Credits Spent', value: stats.creditsSpent },
  ] : [];

  const fmtRuntime = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
  const rm = stats?.renderMetrics;

  return (
    <div className="space-y-6">
      <FalHealthCard />
      {error && <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">{error}</div>}
      {!stats && !error && <p className="text-sm text-ink-400">Loading platform stats…</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map(item => (
          <div key={item.label} className="bg-ink-800/50 rounded-xl p-4">
            <p className="text-xs text-ink-400">{item.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{Number(item.value).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {rm && (
        <div className="bg-ink-800/50 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" /> AI Render Activity
            </h3>
            <span className="text-xs text-ink-500">last {rm.windowDays} days · credits & runtime from the live ledger</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-ink-900/60 rounded-lg p-3">
              <p className="text-[11px] text-ink-400">Video renders</p>
              <p className="text-xl font-bold text-white">{rm.video.renders}</p>
              <p className="text-[11px] text-purple-300">{rm.video.credits} credits</p>
            </div>
            <div className="bg-ink-900/60 rounded-lg p-3">
              <p className="text-[11px] text-ink-400">Video runtime</p>
              <p className="text-xl font-bold text-white">{fmtRuntime(rm.video.plannedSeconds)}</p>
              <p className="text-[11px] text-ink-500">planned duration</p>
            </div>
            <div className="bg-ink-900/60 rounded-lg p-3">
              <p className="text-[11px] text-ink-400">Talking Head renders</p>
              <p className="text-xl font-bold text-white">{rm.flashhead.renders}</p>
              <p className="text-[11px] text-cyan-300">{rm.flashhead.credits} credits</p>
            </div>
            <div className="bg-ink-900/60 rounded-lg p-3">
              <p className="text-[11px] text-ink-400">Talking Head runtime</p>
              <p className="text-xl font-bold text-white">{rm.flashhead.measuredSeconds ? fmtRuntime(rm.flashhead.measuredSeconds) : '—'}</p>
              <p className="text-[11px] text-ink-500">measured by worker</p>
            </div>
          </div>
          <div className="h-[180px]" aria-label="Daily AI credits spent, video versus Talking Head">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rm.daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: '#8b8b9e', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                <YAxis tick={{ fill: '#8b8b9e', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <RTooltip
                  contentStyle={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#c9c9d4' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="videoCredits" name="Video credits" stackId="ai" fill="#7c3aed" radius={[0, 0, 2, 2]} />
                <Bar dataKey="flashheadCredits" name="Talking Head credits" stackId="ai" fill="#22d3ee" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-ink-500">
            Video runtime is the planned tier duration; Talking Head runtime is measured from the finished file. Renders whose browser closed mid-job may be missing duration.
          </p>
        </div>
      )}
    </div>
  );
}

function AdminUsers() {
  const { user } = useCredit();
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    fetch(`/api/users?action=list_users&email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [user?.email]);

  const grant = async (userId: string) => {
    try {
      await fetch('/api/credits?action=add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, amount: 100, source: 'bonus', description: 'Admin grant' }),
      });
      toast.success('Granted 100 credits');
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, credits: (u.credits || 0) + 100 } : u));
    } catch {
      toast.error('Grant failed');
    }
  };

  const shown = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.fullName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input className="input max-w-xs" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-3 py-2 text-xs text-ink-400">User</th>
              <th className="text-left px-3 py-2 text-xs text-ink-400">Role</th>
              <th className="text-left px-3 py-2 text-xs text-ink-400">Credits</th>
              <th className="text-left px-3 py-2 text-xs text-ink-400">Joined</th>
              <th className="text-left px-3 py-2 text-xs text-ink-400"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-400 text-sm">Loading users…</td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-400 text-sm">No users found</td></tr>}
            {shown.map(m => (
              <tr key={m.id} className="border-b border-white/5">
                <td className="px-3 py-3"><p className="text-sm text-white">{m.fullName}</p><p className="text-xs text-ink-400">{m.email}</p></td>
                <td className="px-3 py-3"><span className="badge badge-muted">{(m.role || 'AGENT').toUpperCase()}</span></td>
                <td className="px-3 py-3 text-sm text-white">{m.credits}</td>
                <td className="px-3 py-3 text-xs text-ink-400">{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-3">
                  <button onClick={() => grant(m.id)} className="btn btn-ghost text-xs py-1"><Plus className="w-3 h-3" /> +100</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminReviews() {
  const { user } = useCredit();
  const toast = useToast();
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    fetch(`/api/leads?action=review_queue&email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => setPending(d.reviews || []))
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, [user?.email]);

  const moderate = async (reviewId: string, approve: boolean) => {
    try {
      await fetch('/api/leads?action=review_moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, approve, email: user?.email }),
      });
      setPending(prev => prev.filter(r => r.id !== reviewId));
      toast.success(approve ? 'Review approved and published' : 'Review rejected');
    } catch {
      toast.error('Moderation action failed');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">Pending reviews awaiting moderation.</p>
      {loading && <p className="text-sm text-ink-500">Loading…</p>}
      {!loading && pending.length === 0 && <p className="text-sm text-ink-500">No pending reviews. New submissions appear here.</p>}
      <div className="space-y-3">
        {pending.map(r => (
          <div key={r.id} className="bg-ink-800/50 rounded-xl p-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex gap-1 mb-1">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />)}</div>
              <p className="text-sm text-white">"{r.comment}"</p>
              <p className="text-xs text-ink-400 mt-1">{r.fullName} — {r.agency || 'Independent'}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => moderate(r.id, true)} className="btn btn-primary text-xs py-1 px-3"><Check className="w-3 h-3" /> Approve</button>
              <button onClick={() => moderate(r.id, false)} className="btn btn-ghost text-xs py-1 px-3 text-red-400"><X className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSettings() {
  // Read-only service status. Real secrets live in Vercel env vars and the
  // Modal fal-credentials secret — they are never editable from the UI.
  const probe = useFalProbe();
  const [modalHealth, setModalHealth] = useState<any>(null);
  const [musicApi, setMusicApi] = useState<'ok' | 'fail' | 'loading'>('loading');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run'}/health`)
      .then(r => r.json()).then(setModalHealth).catch(() => setModalHealth(null));
    fetch('/api/music').then(r => setMusicApi(r.ok ? 'ok' : 'fail')).catch(() => setMusicApi('fail'));
  }, []);

  const statusPill = (ok: boolean | null) => (
    <span className={`badge ${ok ? 'badge-success' : 'badge-danger'}`}>{ok ? 'OPERATIONAL' : 'DOWN'}</span>
  );

  const services = [
    { name: 'Modal Render Worker', detail: modalHealth ? `v${modalHealth.version} · ${modalHealth.model}` : 'unreachable', ok: !!modalHealth?.status?.match(/healthy/) },
    { name: 'fal.ai Account', detail: probe?.detail || (probe?.class === 'healthy' ? 'key valid, balance OK' : probe?.class || 'checking…'), ok: probe?.class === 'healthy' },
    { name: 'Vercel API (DynamoDB)', detail: musicApi === 'ok' ? '/api reachable' : musicApi === 'fail' ? '/api unreachable' : 'checking…', ok: musicApi === 'ok' },
    { name: 'Paystack', detail: 'managed via PAYSTACK_SECRET_KEY env var', ok: null as unknown as boolean },
    { name: 'AWS S3 + DynamoDB', detail: 'managed via AWS_* env vars', ok: null as unknown as boolean },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">Live service status. API keys are managed in Vercel environment variables and Modal secrets — never stored in or editable from the app.</p>
      {services.map(s => (
        <div key={s.name} className="bg-ink-800/50 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <h4 className="font-semibold text-white text-sm">{s.name}</h4>
            <p className="text-xs text-ink-400 mt-1">{s.detail}</p>
          </div>
          {s.ok === null || s.ok === undefined
            ? <span className="badge badge-muted">ENV-MANAGED</span>
            : statusPill(s.ok)}
        </div>
      ))}
    </div>
  );
}

function AdminPrompts() {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">
        The live prompt library ({IMAGE_PRESETS.length} presets, mirrored to the Modal worker at deploy time).
        Edit in <code className="text-purple-300">src/lib/imagePrompts.ts</code> + <code className="text-purple-300">modal/image_prompts.py</code> and redeploy.
      </p>
      <div className="space-y-2">
        {IMAGE_PRESETS.map(p => (
          <div key={p.id} className="bg-ink-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="flex items-center gap-2 text-left min-w-0">
                <span className="text-lg">{p.emoji}</span>
                <div className="min-w-0">
                  <h4 className="font-medium text-white text-sm truncate">{p.label}</h4>
                  <p className="text-[10px] text-ink-500">{p.category} · id: {p.id}</p>
                </div>
              </button>
              <div className="flex gap-1 flex-shrink-0">
                <span className="badge badge-brand">str {p.strength.min}–{p.strength.max}</span>
                <span className="badge badge-muted">cfg {p.guidanceScale.min}–{p.guidanceScale.max}</span>
              </div>
            </div>
            {expanded === p.id && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-ink-300 whitespace-pre-wrap">{p.prompt}</p>
                <p className="text-[10px] text-ink-500 whitespace-pre-wrap"><strong>Negative:</strong> {p.negativePrompt}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APP ROUTER
// ═══════════════════════════════════════════════════════════════════════════

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-ink-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="min-h-screen bg-ink-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Global keyboard shortcuts
function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // N - Open Studio
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        navigate('/studio');
      }
      
      // R - Open Recent Projects
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        navigate('/dashboard/listings');
      }
      
      // ? or Shift+/ - Show keyboard shortcuts help
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('propreel:show-shortcuts'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);
}

// Listens for the '?' shortcut event and owns the shortcuts modal
function ShortcutsHelpListener() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('propreel:show-shortcuts', show);
    return () => window.removeEventListener('propreel:show-shortcuts', show);
  }, []);

  return <KeyboardShortcutsModal isOpen={open} onClose={() => setOpen(false)} />;
}

// First-time user onboarding + reusable Help Centre entry point
function OnboardingAndHelp() {
  const { user, loading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    try {
      const key = `propreel:onboarded:${user.id || user.email}`;
      if (!localStorage.getItem(key)) {
        setShowOnboarding(true);
      }
    } catch {
      // localStorage unavailable (private mode) — skip onboarding
    }
  }, [user, loading]);

  useEffect(() => {
    const show = () => setShowHelp(true);
    window.addEventListener('propreel:show-help', show);
    return () => window.removeEventListener('propreel:show-help', show);
  }, []);

  const completeOnboarding = () => {
    setShowOnboarding(false);
    try {
      const key = `propreel:onboarded:${user?.id || user?.email}`;
      localStorage.setItem(key, '1');
    } catch {
      // ignore
    }
  };

  if (loading || !user) return null;

  return (
    <>
      {showOnboarding && <OnboardingTutorial onComplete={completeOnboarding} />}
      {showHelp && <HelpModal isOpen onClose={() => setShowHelp(false)} />}
    </>
  );
}

function AppRoutes() {
  useKeyboardShortcuts();

  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/reviews" element={<ReviewsPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/refund-policy" element={<RefundPolicyPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/cookies" element={<CookiePolicyPage />} />
      <Route path="/paia" element={<PAIAManualPage />} />
      <Route path="/dpa" element={<DataProcessingAgreementPage />} />
      <Route path="/tutorial" element={<TutorialVideoPage />} />
      <Route path="/status" element={<PublicLayout><StatusPage /></PublicLayout>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<SignupPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/payment" element={<PaymentPage />} />
      <Route path="/payment/callback" element={<PaymentPage />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardLayout><DashboardOverview /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/credits" element={<RequireAuth><DashboardLayout><CreditSystemDashboard /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/listings" element={<RequireAuth><DashboardLayout><DashboardListings /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/analytics" element={<RequireAuth><DashboardLayout><DashboardAnalytics /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/billing" element={<RequireAuth><DashboardLayout><DashboardBilling /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/agency" element={<RequireAuth><DashboardLayout><DashboardAgency /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/settings" element={<RequireAuth><DashboardLayout><DashboardSettings /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/cancel-subscription" element={<RequireAuth><CancelSubscriptionPage /></RequireAuth>} />
      <Route path="/dashboard/delete-account" element={<RequireAuth><DeleteAccountPage /></RequireAuth>} />
      <Route path="/dashboard/notifications" element={<RequireAuth><DashboardLayout><NotificationCenter /></DashboardLayout></RequireAuth>} />
      <Route path="/studio" element={<RequireAuth><DashboardLayout><StudioPage /></DashboardLayout></RequireAuth>} />
      <Route path="/admin" element={<RequireAdmin><DashboardLayout><AdminPage /></DashboardLayout></RequireAdmin>} />
      <Route path="/admin/integrations" element={<RequireAdmin><DashboardLayout><AdminIntegrations /></DashboardLayout></RequireAdmin>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 left-4 z-50 bg-purple-700 text-white px-4 py-2 rounded-lg shadow-lg">
          Skip to main content
        </a>
        <ToastProvider>
          <CreditProvider>
            <AppRoutes />
            <ShortcutsHelpListener />
            <OnboardingAndHelp />
            <OfflineBanner />
          </CreditProvider>
        </ToastProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
