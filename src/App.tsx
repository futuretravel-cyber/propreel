import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation, useSearchParams} from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { Tooltip, CopyButton } from './components/ui';
import CookieConsent from './components/CookieConsent';
import NotFoundPage from './pages/NotFoundPage';
import OfflineBanner from './components/OfflineBanner';
import { useState, useEffect, useRef, type ComponentProps } from 'react';
import { MotionConfig} from 'framer-motion';
import MobileNav from './components/MobileNav';
import UploadQueueNotifier from './components/UploadQueueNotifier';
import AIDisclaimerGate from './components/AIDisclaimerGate';
import { DashboardSkeleton, ProjectsSkeleton} from './components/Skeleton';
import { useAuth, useCredit, CreditProvider, isFreeTierUser} from './context/AuthContext';
import { ToastProvider, useToast} from './context/ToastContext';
import { ConfirmProvider, useConfirm} from './context/ConfirmContext';
import { SearchButton} from './components/GlobalSearch';
import { TIERS, ORIENTATIONS, SA_LANGUAGES, DEFAULT_VOICE_LANGUAGE, voicesForLanguage, SOCIAL_PLATFORMS, TONES, ROOM_TYPES, PLANS, SIGNUP_BONUS, RETENTION_NOTICE, RETENTION_NOTICE_LONG, RETENTION_DAYS, PROVINCES, PROPERTY_TYPES} from './lib/constants';
import { CREDIT_EXPIRY_RULE, CREDIT_ROLLOVER_RULE} from '../lib/creditPolicy';
import { IMAGE_PRESETS} from './lib/imagePrompts';
import { PropReelAPI, useUploadWait} from './lib/api';
import { drainBacklog, enqueueImagesForAI, uploadStatusText, useUploadQueue} from './lib/uploadQueue';
import { AI_DISCLAIMER_TEXT, guardAIRender} from './lib/aiDisclaimer';
import FeatureChips from './components/FeatureChips';
import CurrencyInput from './components/CurrencyInput';
import { geocodeAddress, findNearbyAmenities} from './lib/propertyListing';
import { useStudioDraft, studioDraftKey, dataUrlToFile} from './lib/studioDrafts';
import { useRepairDraftPhotos} from './lib/repairDraftPhotos';
import { useReorderable} from './lib/reorder';
import { formatZar, formatDate, wordCount, downloadText, creditListZar, creditValueZar, zarComma, zarCommaCompact} from './lib/utils';
import type { PhotoMeta } from '../lib/videoPrompts';
import { movesForRoomType, CAMERA_MOVE_LABEL, ROOM_TYPE_LABEL} from '../lib/videoPrompts';
import { buildBudgetCameraPayload} from '../lib/budgetVideoPrompts';
import { TIERS as VIDEO_TIERS} from '../lib/videoTiers';
import { playRenderComplete} from './lib/renderSound';
import { useApprovedReviews} from './lib/useReviews';
import { useActivity} from './lib/useActivity';
import { useRenderProgress, typicalVideoSeconds} from './lib/useRenderProgress';
import { useFlashHead} from './lib/useFlashHead';
import { flashheadCreditsForText, narrationSecondsForText, FLASHHEAD_MAX_SECONDS, NARRATION_WORDS_PER_SEC, DESCRIPTION_CREDITS as DESCRIPTION_RENDER_COST, SOCIAL_POST_CREDITS as SOCIAL_POST_COST, scriptCreditsForDuration, CREDIT_PACK_RAND, rerenderClipCredits} from '../lib/renderPricing';
import { pollRenderJob, pollRerender} from './lib/renderPoll';
import type { RenderClip } from './lib/renderPoll';
import ClipReviewPanel from './components/ClipReviewPanel';
import { useVoicePreview} from './lib/useVoicePreview';
import { useVoiceoverLanguageCheck, type VoiceoverLanguageCheck } from './lib/useVoiceoverLanguageCheck';
import LanguageMismatchBanner from './components/LanguageMismatchBanner';
import RenderProgressBar from './components/RenderProgressBar';
import { queueVideoRender, takeVideoRender} from './lib/videoPrefill';
import { ORIENTATION_PHOTO_TIP} from './lib/constants';
import { Video, Image, Sofa, Trash2, Share2, Play, Square, LayoutDashboard, List, BarChart3, CreditCard, Building2, Settings, Shield, Star, ChevronRight, Check, X, Menu, LogOut, Zap, Crown, Sparkles, Loader2, Clock, AlertCircle, AlertTriangle, Download, Copy, RefreshCw, VolumeX, Search, Phone, Mail, MapPin, ChevronDown, ChevronLeft, Mic, Camera, Palette, Moon as MoonIcon, Bell, FileText, XCircle, Music, User, Keyboard, Tag, HelpCircle, FolderOpen, GraduationCap, PiggyBank} from 'lucide-react';

import { lazy, Suspense} from 'react';
import HomePage from './components/HomePage';
import { PublicLayout} from './components/PublicLayout';
import { track} from './lib/analytics';
import { RouteSEO} from './lib/seo';
import { workerHeaders, jobHeaders} from './lib/workerAuth';

// Code-split the heavy dashboard sections (recharts, framer-motion, admin UI)
// so the marketing site loads without them.
const EnhancedOverview = lazy(() => import('./components/EnhancedOverview'));
const EnhancedAnalytics = lazy(() => import('./components/EnhancedAnalytics'));
const EnhancedAgency = lazy(() => import('./components/EnhancedAgency'));

// ── Dashboard-only code, split out of the main chunk ──────────────────
// The marketing homepage never needs these; deferring them keeps the
// first-load bundle small for visitors who haven't signed up yet.
const PropertyListingsBase = lazy(() => import('./components/PropertyListings'));
const EnhancedProjectsBase = lazy(() => import('./components/EnhancedProjects'));
const AgentBrandingBase = lazy(() => import('./components/AgentBranding'));
const SecuritySettingsBase = lazy(() => import('./components/SecuritySettings'));
const DashboardTutorialsBase = lazy(() => import('./components/DashboardTutorials'));
const MaintenanceGate = lazy(() => import('./components/MaintenanceGate').then(m => ({ default: m.MaintenanceGate })));
const CreditSystemDashboard = lazy(() => import('./components/CreditSystemDashboard'));
const AdminIntegrations = lazy(() => import('./components/AdminIntegrations'));
const NotificationCenter = lazy(() => import('./components/NotificationCenter'));
// Free-tier out-of-credits conversion nudge (modal → plans).
const LowCreditNudge = lazy(() => import('./components/LowCreditNudge'));

const OnboardingTutorialBase = lazy(() => import('./components/OnboardingTutorial'));
const HelpModalBase = lazy(() => import('./components/HelpModal'));

// Public/auth route pages — caught by the top-level Suspense around <Routes>.
const SignupPage = lazy(() => import('./pages/SignupPage'));
const TwoFactorSetupPage = lazy(() => import('./pages/TwoFactorSetupPage'));
const ConfirmEmailPage = lazy(() => import('./pages/AuthEmailPages').then(m => ({ default: m.ConfirmEmailPage })));
const ForgotPasswordPage = lazy(() => import('./pages/AuthEmailPages').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/AuthEmailPages').then(m => ({ default: m.ResetPasswordPage })));
const PaymentPage = lazy(() => import('./pages/PaymentPage'));
const StatusPage = lazy(() => import('./pages/StatusPage'));
const FaqPage = lazy(() => import('./pages/FaqPage'));
const TutorialVideoPage = lazy(() => import('./pages/TutorialVideoPage'));
const BlogIndexPage = lazy(() => import('./pages/BlogIndexPage'));
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'));
const RefundPolicyPage = lazy(() => import('./pages/RefundPolicyPage'));
const AiNoticePage = lazy(() => import('./pages/AiNoticePage'));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const CookiePolicyPage = lazy(() => import('./pages/CookiePolicyPage'));
const PAIAManualPage = lazy(() => import('./pages/PAIAManualPage'));
const DataProcessingAgreementPage = lazy(() => import('./pages/DataProcessingAgreementPage'));
const CancelSubscriptionPage = lazy(() => import('./pages/CancelSubscriptionPage'));
const DeleteAccountPage = lazy(() => import('./pages/DeleteAccountPage'));

// Thin wrappers: same names as before (usage sites unchanged), each with its
// own Suspense so a tab-level chunk load never blanks the whole route.
function PropertyListings() {
  return <Suspense fallback={<DashboardSkeleton />}><PropertyListingsBase /></Suspense>;
}
function NewListingPage() {
  return <Suspense fallback={<DashboardSkeleton />}><PropertyListingsNewPage /></Suspense>;
}
function ListingEditPage() {
  return <Suspense fallback={<DashboardSkeleton />}><PropertyListingsEditPage /></Suspense>;
}
const PropertyListingsNewPage = lazy(() => import('./components/PropertyListings').then(m => ({ default: m.NewListingPage })));
const PropertyListingsEditPage = lazy(() => import('./components/PropertyListings').then(m => ({ default: m.ListingEditPage })));
function EnhancedProjects() {
  return <Suspense fallback={<ProjectsSkeleton />}><EnhancedProjectsBase /></Suspense>;
}
function AgentBranding() {
  return <Suspense fallback={<DashboardSkeleton />}><AgentBrandingBase /></Suspense>;
}
function SecuritySettings() {
  return <Suspense fallback={<DashboardSkeleton />}><SecuritySettingsBase /></Suspense>;
}
// ShareSheet / ImageWorkbench / AITalkingProfile wrappers live in
// src/components/ui.tsx now — the tool modules need them too.
// Rendered outside AppRoutes (no surrounding Suspense) — keep their own.
function OnboardingTutorial(props: ComponentProps<typeof OnboardingTutorialBase>) {
  return <Suspense fallback={null}><OnboardingTutorialBase {...props} /></Suspense>;
}
function HelpModal(props: ComponentProps<typeof HelpModalBase>) {
  return <Suspense fallback={null}><HelpModalBase {...props} /></Suspense>;
}

// ── Tool studios, split out of the main chunk ───────────────────────────
// The render wizards (video + budget) and the small AI tool tabs load only
// when their dashboard route opens; usage sites keep their old names.
const VideoWizardBase = lazy(() => import('./components/VideoWizard').then(m => ({ default: m.VideoTab })));
const BudgetVideoWizardBase = lazy(() => import('./components/BudgetVideoWizard').then(m => ({ default: m.BudgetVideoTab })));
const DescriptionTabBase = lazy(() => import('./components/DescriptionTab').then(m => ({ default: m.DescriptionTab })));
const SocialTabBase = lazy(() => import('./components/SocialTab').then(m => ({ default: m.SocialTab })));
const PhotoEditorTabBase = lazy(() => import('./components/PhotoEditorTabs').then(m => ({ default: m.PhotoEditorTab })));
const StagingTabBase = lazy(() => import('./components/PhotoEditorTabs').then(m => ({ default: m.StagingTab })));
const RemovalTabBase = lazy(() => import('./components/PhotoEditorTabs').then(m => ({ default: m.RemovalTab })));
const TwilightTabBase = lazy(() => import('./components/PhotoEditorTabs').then(m => ({ default: m.TwilightTab })));

function VideoTab(props: ComponentProps<typeof VideoWizardBase>) {
  return <Suspense fallback={<DashboardSkeleton />}><VideoWizardBase {...props} /></Suspense>;
}
function BudgetVideoTab() {
  return <Suspense fallback={<DashboardSkeleton />}><BudgetVideoWizardBase /></Suspense>;
}
function DescriptionTab() {
  return <Suspense fallback={<DashboardSkeleton />}><DescriptionTabBase /></Suspense>;
}
function SocialTab() {
  return <Suspense fallback={<DashboardSkeleton />}><SocialTabBase /></Suspense>;
}
function PhotoEditorTab() {
  return <Suspense fallback={null}><PhotoEditorTabBase /></Suspense>;
}
function StagingTab() {
  return <Suspense fallback={null}><StagingTabBase /></Suspense>;
}
function RemovalTab() {
  return <Suspense fallback={null}><RemovalTabBase /></Suspense>;
}
function TwilightTab() {
  return <Suspense fallback={null}><TwilightTabBase /></Suspense>;
}

// Keyboard shortcuts modal
function KeyboardShortcutsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  
  const shortcuts = [
    { keys: ['N'], description: 'Open Video Generator', category: 'Navigation' },
    { keys: ['R'], description: 'Recent Projects', category: 'Navigation' },
    { keys: ['⌘', 'K'], description: 'Global Search', category: 'Navigation' },
    { keys: ['?'], description: 'Show keyboard shortcuts', category: 'Help' },
    { keys: ['Esc'], description: 'Close modals', category: 'General' },
    { keys: ['Tab'], description: 'Switch between tools', category: 'Tools' },
    { keys: ['Enter'], description: 'Generate / Submit', category: 'Tools' },
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

export { KeyboardShortcutsModal, Tooltip };


// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC PAGES
// ═══════════════════════════════════════════════════════════════════════════

function PricingPage() {
  const [annual, setAnnual] = useState(false);
  // Signed-in visitors (e.g. Billing → "Choose a Plan") go straight to this
  // plan's payment page; only new visitors need the register step first.
  const { user } = useAuth();
  const cycle = annual ? 'ANNUAL' : 'MONTHLY';
  const chooseHref = (planId: string, price: number) =>
    user
      ? `/payment?plan=${planId}&cycle=${cycle}&price=${price}`
      : `/register?plan=${planId}&cycle=${cycle}`;
  // Plan bundle economics derived from PLANS: what each credit costs on the
  // monthly ladder vs the R1.50 top-up rate — the "plans are cheaper per
  // credit" line can never drift from what checkout actually charges.
  const planRates = PLANS.map(p => p.monthlyZar / p.monthlyCredits);
  const rateLo = Math.min(...planRates);
  const rateHi = Math.max(...planRates);
  const bundleSavingPct = Math.round((1 - rateLo / CREDIT_PACK_RAND) * 100);
  return (
    <PublicLayout>
      <section className="py-20 bg-ink-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-black text-white">Simple, transparent pricing</h1>
            <p className="mt-4 text-lg text-ink-300">All prices include VAT. Cancel anytime.</p>
            <p className="mt-2 text-sm text-ink-400">
              New here? <Link to="/register" className="text-purple-300 hover:text-purple-200 font-medium">Start free with {SIGNUP_BONUS} free credits</Link> — no card needed, upgrade any time.
            </p>
            <div className="mt-8 inline-flex items-center gap-3 bg-ink-900 border border-white/10 rounded-full p-1">
              <button onClick={() => { track('pricing_toggle', { to: 'monthly' }); setAnnual(false); }} className={`px-5 py-2 rounded-full text-sm font-semibold transition ${!annual ? 'bg-purple-700 text-white' : 'text-ink-400 hover:text-white'}`}>Monthly</button>
              <button onClick={() => { track('pricing_toggle', { to: 'annual' }); setAnnual(true); }} className={`px-5 py-2 rounded-full text-sm font-semibold transition ${annual ? 'bg-purple-700 text-white' : 'text-ink-400 hover:text-white'}`}>Annual <span className="text-green-400 text-xs">Save 15%</span></button>
            </div>
            <p className="mt-6 text-sm text-ink-400">
              Every plan bundles credits at <span className="font-semibold text-ink-200">R{rateLo.toFixed(2)}–R{rateHi.toFixed(2)} each</span> — up to {bundleSavingPct}% below the R{CREDIT_PACK_RAND.toFixed(2)}/credit top-up rate. From {PLANS[0].monthlyCredits} to {PLANS[PLANS.length - 1].monthlyCredits.toLocaleString('en-ZA')} credits a month.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map(plan => {
              const price = annual ? plan.annualZar : plan.monthlyZar;
              return (
                <div key={plan.id} className={`card-dark p-6 relative ${plan.popular ? 'ring-2 ring-purple-600 shadow-xl' : ''}`}>
                  {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-brand">Most popular</div>}
                  <h3 className="font-bold text-xl text-white">{plan.name}</h3>
                  <p className="text-sm text-ink-400 mt-1">{plan.tagline}</p>
                  <div className="mt-4">
                    <span className="text-4xl font-black text-white">{formatZar(price)}</span>
                    <span className="text-ink-400 text-sm">/month</span>
                  </div>
                  <p className="text-xs text-ink-500 mt-1">
                    {annual ? `Billed ${formatZar(plan.annualZar * 12)} once a year` : 'Billed monthly, cancel anytime'}
                  </p>
                  <p className="text-sm text-purple-300 font-semibold mt-2">{plan.monthlyCredits.toLocaleString('en-ZA')} credits/month = {creditValueZar(plan.monthlyCredits)}</p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink-300">
                        <Check className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link to={chooseHref(plan.id, price)} className={`btn w-full mt-6 min-h-[48px] flex items-center justify-center ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}>
                    Choose {plan.name}
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-ink-400 mt-8">All prices include VAT. Credit top-ups available at R{zarComma(CREDIT_PACK_RAND)}/credit (minimum 50 credits — R{zarCommaCompact(50 * CREDIT_PACK_RAND)}).</p>

          {/* Free-signup path — the zero-risk entry for undecided visitors */}
          <div className="mt-6 max-w-2xl mx-auto text-center bg-purple-950/30 border border-purple-500/20 rounded-xl p-4">
            <p className="text-sm text-ink-200">
              <span className="font-semibold text-white">Just exploring?</span>{' '}
              <Link to="/register" className="text-purple-300 hover:text-purple-200 font-medium">Create a free account</Link>{' '}
              — {SIGNUP_BONUS} free credits, no card needed. Enough for one Essential 30-second reel.
            </p>
          </div>
          
          {/* Credit Policy Summary */}
          <div className="mt-12 max-w-3xl mx-auto">
            <h3 className="text-lg font-bold text-white text-center mb-6">How credits work</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-ink-800/50 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-5 h-5 text-purple-400" />
                  <h4 className="font-semibold text-white text-sm">Expiry</h4>
                </div>
                <p className="text-xs text-ink-400">{CREDIT_EXPIRY_RULE}</p>
              </div>
              <div className="bg-ink-800/50 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="w-5 h-5 text-purple-400" />
                  <h4 className="font-semibold text-white text-sm">Rollover</h4>
                </div>
                <p className="text-xs text-ink-400">{CREDIT_ROLLOVER_RULE}</p>
              </div>
              <div className="bg-ink-800/50 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-yellow-400" />
                  <h4 className="font-semibold text-white text-sm">Storage</h4>
                </div>
                <p className="text-xs text-ink-400">
                  Renders and AI Avatar clips are kept for {RETENTION_DAYS} days — download anything you want to keep.
                </p>
              </div>
            </div>
            <p className="text-center text-sm text-ink-400 mt-6">
              Read our full <Link to="/refund-policy" className="text-purple-300 hover:text-purple-200 font-medium">Credit & refund policy</Link>
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
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-black text-white text-center">What Our Agents Say</h1>
          <p className="text-center text-ink-400 mt-4">Verified reviews from paying South African estate agents.</p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading && <p className="text-center text-ink-500 col-span-full">Loading reviews…</p>}
            {!loading && reviews.length === 0 && (
              <p className="text-center text-ink-500 col-span-full">
                No published reviews yet — be the first to <Link to="/register" className="text-purple-400 underline hover:text-purple-300">share your experience</Link>.
              </p>
            )}
            {reviews.map(r => (
              <div key={r.id} className="card-dark p-6">
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-ink-200 mb-4">"{r.comment}"</p>
                <div className="border-t border-white/5 pt-3">
                  <p className="font-semibold text-white text-sm">{r.fullName}</p>
                  <p className="text-ink-400 text-xs">{r.agency}</p>
                  <p className="text-ink-500 text-xs mt-1">{formatDate(r.createdAt)}</p>
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
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-black text-white">About PropReel</h1>
          <p className="mt-6 text-lg text-ink-400 leading-relaxed">
            PropReel was built to solve a simple problem: South African estate agents spend too much time and money creating marketing content for their listings. We use cutting-edge AI to turn your existing property photos into stunning videos, enhanced images, and compelling descriptions — in minutes, not days.
          </p>
          <p className="mt-4 text-lg text-ink-400 leading-relaxed">
            Our platform is designed specifically for the South African property market, with local voices, Rand pricing, and seamless integration with Property24 and Private Property portals.
          </p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div><p className="text-3xl font-black text-purple-400">27</p><p className="text-ink-400">AI Photo Presets</p></div>
            <div><p className="text-3xl font-black text-purple-400">4</p><p className="text-ink-400">AI Video Tiers</p></div>
            <div><p className="text-3xl font-black text-purple-400">R{zarComma(CREDIT_PACK_RAND)}</p><p className="text-ink-400">Per Credit, VAT Included</p></div>
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
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-black text-white text-center">Get in Touch</h1>
          <p className="text-center text-ink-400 mt-4">We'd love to hear from you.</p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
              <div className="space-y-6">
                <div className="flex items-start gap-4"><Mail className="w-5 h-5 text-purple-400 mt-1" /><div><p className="font-semibold text-white">Email</p><p className="text-ink-400">support@propreel.co.za</p></div></div>
                <div className="flex items-start gap-4"><MapPin className="w-5 h-5 text-purple-400 mt-1" /><div><p className="font-semibold text-white">Office</p><p className="text-ink-400">Cape Town, South Africa</p></div></div>
              </div>
            </div>
            <div>
              {sent ? (
                <div className="card-dark p-8 text-center">
                  <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="font-bold text-lg text-white">Message Sent!</h3>
                  <p className="text-ink-400 mt-2">We'll get back to you within 24 hours.</p>
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
                  <div><label className="label text-ink-300">Name</label><input name="name" className="input" placeholder="Your name" required /></div>
                  <div><label className="label text-ink-300">Email</label><input name="email" type="email" className="input" placeholder="you@example.com" required /></div>
                  <div><label className="label text-ink-300">Message</label><textarea name="message" className="input min-h-[120px]" placeholder="How can we help?" required /></div>
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

function GoogleGIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Two-step verification: pending challenge from auth_login
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  // Unconfirmed account (403 EMAIL_NOT_CONFIRMED): offer a resend right here
  // so signing in doesn't become a dead end when the email never arrived.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resendingConfirm, setResendingConfirm] = useState(false);
  // Trial (temporary account) expired: show the "keep browsing / subscribe"
  // notice instead of a raw 403, and let a re-login reactivate the account.
  const [trialExpired, setTrialExpired] = useState(false);
  const [trialReactivate, setTrialReactivate] = useState(false);
  const { login, loginWithTwoFactor, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Where the user was headed before being asked to sign in (?next=/studio)
  const nextPath = searchParams.get('next');

  // Google OAuth sends locked trial accounts here with ?trial=expired —
  // explain before they type anything.
  useEffect(() => {
    if (searchParams.get('trial') === 'expired') setTrialExpired(true);
  }, [searchParams]);

  // Single navigation path for email + Google sign-in: when the auth state
  // settles on a session, complete the stored post-auth redirect (defaults
  // to the dashboard). Google returns to this page after OAuth. An explicit
  // ?next= wins — a signed-in visitor sent here to re-auth before paying must
  // land back on the payment page, not the dashboard.
  useEffect(() => {
    if (!user) return;
    if (nextPath && nextPath.startsWith('/')) {
      navigate(nextPath, { replace: true });
      return;
    }
    import('./lib/postAuth').then(({ takePostAuthRedirect }) => {
      navigate(takePostAuthRedirect(), { replace: true });
    });
  }, [user, navigate, nextPath]);

  const performLogin = async (reactivate: boolean) => {
    setLoading(true);
    setError('');
    setUnconfirmed(false);
    setTrialExpired(false);
    try {
      // Store the destination BEFORE login() fires the auth listener — the
      // user-effect below can otherwise consume a stale/default redirect and
      // strand the visitor on the dashboard instead of back where they were
      // (e.g. the payment page).
      const { setPostAuthRedirect } = await import('./lib/postAuth');
      setPostAuthRedirect(nextPath && nextPath.startsWith('/') ? nextPath : '/dashboard');
      const result = await login(email, password, reactivate ? { reactivate: true } : undefined);
      if (result.requires2fa) {
        // Password accepted — ask for the authenticator code next.
        setTwoFactorToken(result.token || '');
        setTrialReactivate(reactivate);
        setLoading(false);
        return;
      }
      if (result.setupRequired) {
        // Signed up with the two-step checkbox — finish setup before the dashboard.
        setPostAuthRedirect('/2fa-setup');
      }
      toast.success(reactivate ? 'Welcome back — your trial account is active again.' : 'Welcome back!');
    } catch (err: any) {
      if (err.code === 'TRIAL_EXPIRED') {
        // Temporary account hit day 7 without a subscription — the notice
        // below offers "keep browsing" (reactivate) or a plan upgrade.
        setTrialExpired(true);
        setTrialReactivate(false);
      } else {
        setError(err.message || 'Invalid credentials');
      }
      setUnconfirmed(err.code === 'EMAIL_NOT_CONFIRMED');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(false);
  };

  // Re-request the confirmation email for the address typed into the form.
  // No redirect param: the server's stored one is absent, so /confirm-email
  // falls back to this tab's post-auth redirect (payment page or ?next=).
  const resendConfirmation = async () => {
    setResendingConfirm(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users?action=auth_resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not resend the email');
      toast.success(`Confirmation link re-sent to ${email}`, 'Email sent');
    } catch (err: any) {
      toast.error(err.message || 'Could not resend the email');
    }
    setResendingConfirm(false);
  };

  const handleTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorToken) return;
    setTwoFactorBusy(true);
    setError('');
    try {
      await loginWithTwoFactor(email, twoFactorToken, twoFactorCode, trialReactivate ? { reactivate: true } : undefined);
      toast.success(trialReactivate ? 'Welcome back — your trial account is active again.' : 'Welcome back!');
    } catch (err: any) {
      if (err.code === 'TRIAL_EXPIRED') {
        setTrialExpired(true);
        setTrialReactivate(false);
        setTwoFactorToken(null);
        setTwoFactorCode('');
      } else {
        setError(err.message || 'Invalid code');
      }
      setTwoFactorBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
              <img src="/images/logo-icon.png" alt="" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-2xl text-white">PropReel</span>
          </Link>
        </div>
        <div className="card-dark p-8">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome back</h2>
          <p className="text-ink-400 mb-6">
            {twoFactorToken ? 'Enter the 6-digit code from your authenticator app' : 'Sign in to your account'}
          </p>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 text-sm">{error}</div>}
          {trialExpired && (
            <div className="mb-4 p-4 rounded-lg bg-amber-950/40 border border-amber-500/30 space-y-3">
              <p className="text-sm text-amber-300">
                Your 7-day trial has ended. Subscribe to restore full access — or sign in again to keep browsing your account and upgrade whenever you're ready.
              </p>
              <button
                type="button"
                disabled={loading || !email || !password}
                onClick={() => performLogin(true)}
                className="btn btn-secondary w-full text-sm"
              >
                {loading ? 'Signing in…' : 'Keep browsing — sign in again'}
              </button>
              <Link to="/pricing" className="btn btn-primary w-full text-sm">View plans to upgrade</Link>
              <p className="text-[11px] text-ink-500 text-center">Rendering stays locked until you subscribe.</p>
            </div>
          )}
          {unconfirmed && (
            <div className="mb-4 p-3 rounded-lg bg-ink-800/70 border border-white/10 text-center">
              <p className="text-xs text-ink-400 mb-2">Haven’t received the confirmation email? Check your spam folder, or resend it:</p>
              <button onClick={resendConfirmation} disabled={resendingConfirm} className="btn btn-secondary w-full">
                {resendingConfirm ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</> : 'Resend confirmation email'}
              </button>
            </div>
          )}
          {twoFactorToken ? (
            <form onSubmit={handleTwoFactor} className="space-y-4">
              <div>
                <label className="label">Verification code</label>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="input text-center text-xl tracking-[0.5em]"
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  required
                />
              </div>
              <button type="submit" disabled={twoFactorBusy || twoFactorCode.length !== 6} className="btn btn-primary w-full">
                {twoFactorBusy ? 'Verifying…' : 'Verify & Sign In'}
              </button>
              <button type="button" onClick={() => { setTwoFactorToken(null); setTwoFactorCode(''); setError(''); }} className="btn btn-ghost w-full text-sm">
                Back to email & password
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="label">Email</label><input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label mb-0">Password</label>
                <Link to="/forgot-password" className="text-xs text-purple-400 hover:text-purple-300 font-semibold">Forgot Password?</Link>
              </div>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary w-full">{loading ? 'Signing in...' : 'Sign In'}</button>
          </form>
          )}
            <div className="flex items-center gap-3 my-1">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-ink-500">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <button
              onClick={() => {
                const dest = nextPath && nextPath.startsWith('/') ? nextPath : '/dashboard';
                import('./lib/postAuth').then(({ setPostAuthRedirect }) => setPostAuthRedirect(dest));
                track('google_login');
                window.location.href = `/api/users?action=auth_google_start&redirect=${encodeURIComponent(dest)}`;
              }}
              className="btn w-full text-sm justify-center gap-2 bg-white text-gray-900 hover:bg-gray-100 font-medium border-0"
            >
              <GoogleGIcon /> Continue with Google
            </button>
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
  const { register, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) { setError('You must acknowledge the AI disclaimer'); return; }
    setLoading(true);
    setError('');
    try {
      // Email confirmation is mandatory — register() returns needsConfirmation
      // and the confirmation email finishes the signup (see /confirm-email).
      import('./lib/postAuth').then(m => m.setPostAuthRedirect('/dashboard'));
      const result = await register({ email, password, fullName, planId: 'STARTER', cycle: 'MONTHLY', aiAcknowledged: agreed });
      if (result.needsConfirmation) {
        toast.success(`We sent a confirmation link to ${email}`, 'Check your inbox');
        navigate('/login');
      } else {
        toast.success(`Welcome! You've received ${SIGNUP_BONUS} free credits!`, 'Account Created');
        navigate('/dashboard');
      }
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
              <img src="/images/logo-icon.png" alt="" className="w-full h-full object-cover" />
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
              <span className="text-xs text-ink-400">{AI_DISCLAIMER_TEXT} I agree to the <Link to="/terms" className="text-purple-400 hover:text-purple-300 underline">Terms of Service</Link>.</span>
            </label>
            <button type="submit" disabled={loading || !agreed} className="btn btn-primary w-full">{loading ? 'Creating account...' : `Sign Up — Get ${SIGNUP_BONUS} Free Credits`}</button>
          </form>
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
  const { user, balance, logout, isAdmin, lowCreditWarning, acknowledgeLowCredit } = useAuth();
  // Free-tier conversion nudge surfaces (banner + LowCreditNudge modal) use
  // the same eligibility rule as AuthContext.lowCreditWarning.
  const isFreeTier = isFreeTierUser(user);
  const { unreadCount, stats, loading: activityLoading } = useActivity(user?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Top-left profile picture menu (profile / settings / billing / sign out)
  const [profileMenu, setProfileMenu] = useState(false);
  // Container for trigger + dropdown — used to close on outside pointer-down
  // (touch devices never fire mouseleave, so hover-close alone can't do it).
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Agency white-label logo — top-left of the header, beside the search bar.
  // agency_overview carries branding.logoUrl (saved in Agency Dashboard →
  // Settings); fetched once per session, agencies without one keep the
  // default header.
  const [agencyLogo, setAgencyLogo] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setAgencyLogo(null);
    if (!user?.id || !user.agencyId) return;
    (async () => {
      try {
        const res = await fetch(`/api/users?action=agency_overview&user_id=${encodeURIComponent(user.id)}`);
        const data = await res.json();
        if (!cancelled) setAgencyLogo(data?.agency?.branding?.logoUrl || null);
      } catch { /* no logo — keep the default header */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.agencyId]);

  // Close the profile menu whenever the route changes.
  useEffect(() => { setProfileMenu(false); }, [location.pathname]);

  // Outside click/tap and Escape close the menu (standard menu behavior).
  useEffect(() => {
    if (!profileMenu) return;
    const onPointerDown = (e: Event) => {
      const el = profileMenuRef.current;
      if (el && !el.contains(e.target as Node)) setProfileMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setProfileMenu(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileMenu]);

  // App-wide low-credit banner (20/10/5% of plan allowance) — acknowledged
  // per session via lastLowCreditWarnedAt so it stays visible until acted on.
  const bannerVisible = (() => {
    if (lowCreditWarning === 'none') return false;
    if (location.pathname.startsWith('/dashboard/credits') || location.pathname.startsWith('/dashboard/billing')) return false; // credits page hosts Billing as a sub-tab
    const ack = user?.lastLowCreditWarnedAt ? new Date(user.lastLowCreditWarnedAt).getTime() : 0;
    return ack < Date.now() - 12 * 60 * 60 * 1000; // re-surface 12h after ack
  })();

  // Temporary ("trial") account: days left while the 7-day clock ticks.
  // Subscribed users never see it (the server wipes trial fields on upgrade);
  // an expired trial in the dashboard means the user reactivated — show a
  // "subscribe to render" notice instead (locked-out users never get here).
  const trialDaysLeft = (() => {
    if (!user?.trialExpiresAt || user.subscription?.status === 'ACTIVE' || user.role === 'ADMIN') return 0;
    const ms = Date.parse(user.trialExpiresAt) - Date.now();
    if (Number.isNaN(ms) || ms <= 0) return 0;
    return Math.max(1, Math.ceil(ms / 86_400_000));
  })();
  const trialEndedNotice = !!(
    user?.trialExpiresAt &&
    user.subscription?.status !== 'ACTIVE' &&
    user.role !== 'ADMIN' &&
    trialDaysLeft === 0
  );

  const navItems: { path: string; icon: React.ReactNode; label: string; sub?: string }[] = [
    { path: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Overview' },
    { path: '/dashboard/photo-editor', icon: <Camera className="w-5 h-5" />, label: 'Photo Editor' },
    { path: '/dashboard/description', icon: <FileText className="w-5 h-5" />, label: 'Property Description' },
    // Social Media used to be a sub-tab under Property Description — it now
    // earns its own sidebar destination.
    { path: '/dashboard/social', icon: <Share2 className="w-5 h-5" />, label: 'Social Media' },
    // The gentle-motion studio: same render pipeline as Video Generator but
    // on the Budget tier only (Hailuo-02 standard, 30s/5 photos, no
    // voiceover or avatar) — placed between Social and the main generator.
    // One-line subtitles disambiguate the two video entries (audit §2): which
    // to pick is the first question every user asks.
    { path: '/dashboard/budget-video', icon: <PiggyBank className="w-5 h-5" />, label: 'Budget AI Video', sub: 'Gentle motion, no voiceover' },
    { path: '/dashboard/video', icon: <Video className="w-5 h-5" />, label: 'Video Generator', sub: 'Cinematic, narrated' },
    { path: '/dashboard/credits', icon: <Zap className="w-5 h-5" />, label: 'Credits' },
    { path: '/dashboard/listings', icon: <List className="w-5 h-5" />, label: 'Listings' },
    { path: '/dashboard/projects', icon: <FolderOpen className="w-5 h-5" />, label: 'My Projects' },
    { path: '/dashboard/branding', icon: <Palette className="w-5 h-5" />, label: 'Agent Branding' },
    { path: '/dashboard/analytics', icon: <BarChart3 className="w-5 h-5" />, label: 'Analytics' },
    { path: '/dashboard/tutorials', icon: <GraduationCap className="w-5 h-5" />, label: 'Tutorials' },
    // Agency tab only appears once an agency signup exists (or for admins,
    // who have full visibility across the site including agency dashboards)
    ...((user?.agencyId || isAdmin) ? [{ path: '/dashboard/agency', icon: <Building2 className="w-5 h-5" />, label: 'Agency' }] : []),
    // Billing lives inside Credits (?tab=billing); Notifications inside
    // Settings (?tab=notifications) — one less sidebar item each.
    { path: '/dashboard/settings', icon: <Settings className="w-5 h-5" />, label: 'Settings' },
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
                <img src="/images/logo-icon.png" alt="" className="w-full h-full object-cover" />
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
                {item.icon}
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{item.label}</span>
                  {item.sub && <span className="block text-[10px] font-normal text-ink-500 truncate">{item.sub}</span>}
                </span>
              </Link>
            ))}
          </nav>
          <div className="p-3 border-t border-white/5">
            {user?.subscription?.planId !== 'PREMIUM' && user?.subscription?.planId !== 'AGENCY' && user?.role !== 'ADMIN' && !user?.agencyId && !user?.trialExpiresAt && (
              <Link to={`/payment?plan=PREMIUM&cycle=MONTHLY&price=${PLANS.find(pl => pl.id === 'PREMIUM')?.monthlyZar ?? ''}`} className="block mb-3 p-3 rounded-xl bg-gradient-to-r from-purple-700/20 to-purple-900/20 border border-purple-500/20 hover:border-purple-500/40 transition">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-semibold text-white">Upgrade to Premium</span>
                </div>
                <p className="text-xs text-ink-400 mt-1">{(PLANS.find(pl => pl.id === 'PREMIUM')?.monthlyCredits ?? 0).toLocaleString('en-ZA')} credits every month • Dedicated support</p>
              </Link>
            )}
            <div className="card-dark p-3 mb-3">
              <p className="text-xs text-ink-400 uppercase tracking-wide">Credits</p>
              <p className="text-2xl font-bold text-white">{balance.personal}</p>
              {balance.agency > 0 && <p className="text-xs text-ink-400">+ {balance.agency} agency pool</p>}
              <div className="mt-2 pt-2 border-t border-white/5">
                {/* '…' while the ledger fetch runs — rendering 0 here claimed
                    "no usage" before the numbers arrived (the same race made
                    dashboard screenshots disagree with each other). */}
                <p className="text-xs text-ink-500">Used this week: {!user?.id || activityLoading ? '…' : `${stats.used7d} credits`}</p>
                <p className="text-xs text-ink-500">Used this month: {!user?.id || activityLoading ? '…' : `${stats.used30d} credits`}</p>
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
          <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden text-ink-400 hover:text-white" aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} aria-expanded={sidebarOpen}>
            <Menu className="w-6 h-6" />
          </button>
          {agencyLogo && (
            <img src={agencyLogo} alt={`${user?.agencyName || 'Agency'} logo`} className="h-12 max-w-[260px] object-contain" />
          )}
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <SearchButton />
            <Link to="/dashboard/settings?tab=notifications" className="relative text-ink-400 hover:text-white" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </Link>
            <div className="badge badge-brand">
              <Zap className="w-3 h-3" /> {balance.total} credits
            </div>
            {/* Profile picture — top-right account menu.
                pb-2 + top-full bridges the 8px trigger→menu gap INSIDE this
                box: without it the gap belonged to neither element, mouseleave
                fired mid-crossing and the menu vanished before the pointer
                arrived (the reported "closes as I move to click it"). */}
            <div className="relative pb-2" ref={profileMenuRef} onMouseLeave={() => setProfileMenu(false)}>
              <button
                onClick={() => setProfileMenu(m => !m)}
                className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-white/5 transition"
                aria-haspopup="menu"
                aria-expanded={profileMenu}
                aria-label="Account menu"
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.fullName || 'Profile'} className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0" />
                ) : (
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {user?.fullName?.[0] || 'U'}
                  </span>
                )}
                <span className="hidden sm:block text-sm text-ink-300 max-w-[140px] truncate">{user?.fullName}</span>
                <ChevronDown className={`w-4 h-4 text-ink-400 transition ${profileMenu ? 'rotate-180' : ''}`} />
              </button>
              {profileMenu && (
                <div role="menu" className="absolute right-0 top-full w-56 bg-ink-900 border border-white/10 rounded-xl shadow-xl py-1 z-50">
                  <div className="px-3 py-2 border-b border-white/5">
                    <p className="text-sm text-white font-medium truncate">{user?.fullName}</p>
                    <p className="text-xs text-ink-500 truncate">{user?.email}</p>
                  </div>
                  <button role="menuitem" onClick={() => { setProfileMenu(false); navigate('/dashboard/settings?tab=profile'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-300 hover:bg-white/5 hover:text-white text-left">
                    <User className="w-4 h-4" /> Go to profile
                  </button>
                  <button role="menuitem" onClick={() => { setProfileMenu(false); navigate('/dashboard/settings?tab=security'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-300 hover:bg-white/5 hover:text-white text-left">
                    <Settings className="w-4 h-4" /> Go to Settings
                  </button>
                  <button role="menuitem" onClick={() => { setProfileMenu(false); navigate('/dashboard/credits?tab=billing'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-300 hover:bg-white/5 hover:text-white text-left">
                    <CreditCard className="w-4 h-4" /> Go to Billing
                  </button>
                  <div className="border-t border-white/5 mt-1 pt-1">
                    <button role="menuitem" onClick={() => { setProfileMenu(false); logout(); navigate('/'); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-950/40 text-left">
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main-content" className="flex-1 p-4 lg:p-8 pb-28 lg:pb-8 overflow-y-auto">
          <LowCreditNudge />
          {bannerVisible && (
            <div className={`mb-4 rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in ${
              lowCreditWarning === 'critical' ? 'bg-red-950/60 border-red-500/40' :
              lowCreditWarning === 'warning' ? 'bg-yellow-950/60 border-yellow-500/40' :
              'bg-blue-950/60 border-blue-500/40'
            }`}>
              <div className="flex items-center gap-3">
                <AlertTriangle className={`w-5 h-5 shrink-0 ${lowCreditWarning === 'critical' ? 'text-red-300' : lowCreditWarning === 'warning' ? 'text-yellow-300' : 'text-blue-300'}`} />
                <div>
                  <p className={`text-sm font-semibold ${lowCreditWarning === 'critical' ? 'text-red-300' : lowCreditWarning === 'warning' ? 'text-yellow-300' : 'text-blue-300'}`}>
                    {isFreeTier ? (
                      lowCreditWarning === 'critical' ? "You're out of credits — your free welcome credits are used up" :
                      lowCreditWarning === 'warning' ? 'Almost out of free credits' :
                      'Your free credits are running low'
                    ) : (
                      lowCreditWarning === 'critical' ? 'Critical: less than 5% of your monthly credits remain' :
                      lowCreditWarning === 'warning' ? 'Low credit warning: below 10% of your monthly allowance' :
                      'Heads up: credits below 20% of your monthly allowance'
                    )}
                  </p>
                  <p className="text-xs text-ink-400">{balance.personal} credits left{balance.agency > 0 ? ` + ${balance.agency} agency pool` : ''}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {isFreeTier ? (
                  <>
                    <button onClick={() => navigate('/pricing')} className="btn btn-primary text-xs py-2 px-3 whitespace-nowrap">View plans</button>
                    <button onClick={() => navigate('/payment?topup=true&amount=50')} className="btn btn-ghost text-xs py-2 px-3 whitespace-nowrap">Buy credits</button>
                  </>
                ) : (
                  <button onClick={() => navigate('/dashboard/credits')} className="btn btn-primary text-xs py-2 px-3">Recharge Now</button>
                )}
                <button onClick={acknowledgeLowCredit} className="btn btn-ghost text-xs py-2 px-2" aria-label="Dismiss low credit warning"><X className="w-4 h-4" /></button>
              </div>              </div>
            )}
          {(trialDaysLeft > 0 || trialEndedNotice) && (
            <div className={`mb-4 rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in ${
              trialEndedNotice ? 'bg-amber-950/60 border-amber-500/40' : 'bg-purple-950/60 border-purple-500/40'
            }`}>
              <div className="flex items-center gap-3">
                <Clock className={`w-5 h-5 shrink-0 ${trialEndedNotice ? 'text-amber-300' : 'text-purple-300'}`} />
                <div>
                  <p className={`text-sm font-semibold ${trialEndedNotice ? 'text-amber-300' : 'text-purple-300'}`}>
                    {trialEndedNotice
                      ? 'Your free trial has ended — subscribe to unlock rendering'
                      : trialDaysLeft === 1
                        ? '⏳ Last day of your free trial!'
                        : `⏳ ${trialDaysLeft} days left on your free trial`}
                  </p>
                  <p className="text-xs text-ink-400">
                    {trialEndedNotice
                      ? 'Your projects and branding are kept — upgrade any time to pick up where you left off.'
                      : 'Your projects, branding and remaining credits carry over when you upgrade.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => navigate('/dashboard/credits?tab=billing')} className="btn btn-primary text-xs py-2 px-3">{trialEndedNotice ? 'Subscribe now' : 'Upgrade anytime'}</button>
              </div>
            </div>
          )}
          {/* One boundary around every dashboard page: a runtime error in a
              widget (AI response parsing, uploads, players) shows a retry card
              instead of blanking the whole route. */}
          <ErrorBoundary>
            <Suspense fallback={<DashboardSkeleton />}>{children}</Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* Background upload queue's completion toasts live here so they
          outlive whichever tab queued the photos. */}
      <UploadQueueNotifier />

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
  // No artificial skeleton delay: EnhancedOverview renders its own loading
  // state for the data it actually fetches.
  return <Suspense fallback={<DashboardSkeleton />}><EnhancedOverview /></Suspense>;
}

function DashboardListings() {
  // Property portfolio — stats, filters, rendered-reel players, and a
  // dedicated New Listing page (see components/PropertyListings.tsx).
  return <PropertyListings />;
}

function DashboardBranding() {
  // Agent Profile Branding — saved once, auto-applied to every render.
  return <AgentBranding />;
}

function DashboardMyProjects() {
  // Every render job — reels and Talking Head clips — with folders/search.
  return <Suspense fallback={<ProjectsSkeleton />}><EnhancedProjects /></Suspense>;
}

function DashboardAnalytics() {
  return <Suspense fallback={<DashboardSkeleton />}><EnhancedAnalytics /></Suspense>;
}

function DashboardTutorials() {
  return <Suspense fallback={<DashboardSkeleton />}><DashboardTutorialsBase /></Suspense>;
}

function DashboardAgency() {
  return <Suspense fallback={<DashboardSkeleton />}><EnhancedAgency /></Suspense>;
}

const AgencySignupPage = lazy(() => import('./pages/AgencySignupPage'));
function AgencySignup() {
  return <Suspense fallback={<DashboardSkeleton />}><AgencySignupPage /></Suspense>;
}

/**
 * Profile details — actually saved. These fields were rendered with
 * `defaultValue` and the Save/Update buttons had no handlers, so every edit
 * was silently discarded. Password changes are not a client-side form: the
 * account API has no signed-in change-password action, so the card now sends
 * the user to the reset-link flow instead of pretending to save.
 */
function SettingsProfileForm() {
  const { user, refresh } = useCredit();
  const toast = useToast();
  const [form, setForm] = useState({ fullName: '', agencyName: '', phone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      fullName: user.fullName || '',
      agencyName: user.agencyName || '',
      phone: (user as any).phone || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const save = async () => {
    if (!user || saving) return;
    if (!form.fullName.trim()) { toast.error('Your name cannot be empty', 'Profile'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/users?action=update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          updates: {
            fullName: form.fullName.trim(),
            agencyName: form.agencyName.trim(),
            phone: form.phone.trim(),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save your profile');
      await refresh();
      toast.success('Your profile has been updated', 'Saved');
    } catch (e: any) {
      toast.error(e.message || 'Could not save your profile', 'Profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-dark p-6">
        <h3 className="font-semibold text-white mb-1">Profile</h3>
        <p className="text-xs text-ink-500 mb-4">Shown on your branded reels and on your account.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="settings-full-name">Full name</label>
            <input
              id="settings-full-name"
              className="input"
              value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              autoComplete="name"
            />
          </div>
          <div>
            <label className="label" htmlFor="settings-email">Email</label>
            <input id="settings-email" className="input" value={user?.email || ''} disabled />
            <p className="text-xs text-ink-500 mt-1">Contact support to change your sign-in email.</p>
          </div>
          <div>
            <label className="label" htmlFor="settings-agency">Agency</label>
            <input
              id="settings-agency"
              className="input"
              value={form.agencyName}
              onChange={e => setForm(f => ({ ...f, agencyName: e.target.value }))}
              placeholder="Your agency name"
              autoComplete="organization"
            />
          </div>
          <div>
            <label className="label" htmlFor="settings-phone">Phone</label>
            <input
              id="settings-phone"
              className="input"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+27 82 000 0000"
              autoComplete="tel"
            />
          </div>
        </div>
        <button onClick={save} disabled={saving} className="btn btn-primary mt-6">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save changes'}
        </button>
      </div>

      <div className="card-dark p-6">
        <h3 className="font-semibold text-white mb-1">Password</h3>
        <p className="text-sm text-ink-400 mb-4">
          We'll email you a secure link to set a new password. Your current password is never sent to this page.
        </p>
        <Link to="/dashboard/settings?tab=security" className="btn btn-secondary mr-3">Two-step verification</Link>
        <Link
          to="/forgot-password"
          className="btn btn-secondary"
        >
          Send password reset link
        </Link>
      </div>
    </div>
  );
}

function DashboardSettings() {
  // Tab lives in the URL (?tab=profile|security|account) so the profile
  // menu's "Go to profile" / "Go to Settings" land on the right section.
  const [searchParams, setSearchParams] = useSearchParams();
  const TABS = ['profile', 'security', 'account', 'notifications'] as const;
  type SettingsTab = typeof TABS[number];
  const param = searchParams.get('tab');
  const tab: SettingsTab = (TABS as readonly string[]).includes(param || '') ? (param as SettingsTab) : 'profile';
  const setTab = (t: SettingsTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };
  
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">Settings</h1>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button onClick={() => setTab('profile')} className={`tab-pill ${tab === 'profile' ? 'tab-pill-active' : ''}`}>Profile</button>
        <button onClick={() => setTab('security')} className={`tab-pill ${tab === 'security' ? 'tab-pill-active' : ''}`}>Security & Privacy</button>
        <button onClick={() => setTab('account')} className={`tab-pill ${tab === 'account' ? 'tab-pill-active' : ''}`}>Account</button>
        <button onClick={() => setTab('notifications')} className={`tab-pill ${tab === 'notifications' ? 'tab-pill-active' : ''}`}>Notifications</button>
      </div>
      {tab === 'profile' ? (
        <SettingsProfileForm />
      ) : tab === 'security' ? (
        <SecuritySettings />
      ) : tab === 'notifications' ? (
        <NotificationCenter />
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
              <div className="p-4 bg-ink-800/50 rounded-xl">
                <h4 className="font-medium text-white mb-2">Data retention</h4>
                <p className="text-sm text-ink-400">{RETENTION_NOTICE_LONG}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AI TOOL PAGES — Photo Editor / Property Description / Video Generator
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Blocking trial-deadline gate for the Studio (day 6–7 of a temporary
 * account, and for reactivated users whose trial already expired — their
 * renders are server-side blocked anyway). The backdrop does NOT dismiss;
 * the user must explicitly continue, and the upgrade CTA is the primary
 * action. Refilled on every Studio mount — re-entering re-triggers it.
 */
function TrialDeadlineModal() {
  const { user } = useCredit();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const expiresAt = user?.subscription?.status === 'ACTIVE' ? null : user?.trialExpiresAt || null;
  const msLeft = expiresAt ? Date.parse(expiresAt) - Date.now() : NaN;
  const valid = !!expiresAt && !Number.isNaN(msLeft);
  const running = valid && msLeft > 0;
  const daysLeft = running ? Math.max(1, Math.ceil(msLeft / 86_400_000)) : 0;
  const visible = valid && (!running || daysLeft <= 2) && !dismissed;

  useEffect(() => {
    if (visible) track('trial_studio_modal_shown', { daysLeft, ended: !running });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const formatExact = (iso: string) => {
    try {
      return `${new Intl.DateTimeFormat('en-ZA', {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg', hour12: false,
      }).format(new Date(iso))} SAST`;
    } catch {
      return formatDate(expiresAt!);
    }
  };

  const goUpgrade = () => {
    track('trial_studio_upgrade_clicked', { daysLeft, ended: !running });
    navigate('/dashboard/credits?tab=billing');
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={running ? 'Trial deadline' : 'Trial ended'}
    >
      <div className="card-dark w-full max-w-lg p-8 text-center border border-purple-500/40 bg-gradient-to-b from-purple-950/40 to-ink-900 shadow-2xl animate-scale-in">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${running ? 'bg-purple-500/20' : 'bg-amber-500/15'}`}>
          <Clock className={`w-8 h-8 ${running ? 'text-purple-300' : 'text-amber-400'}`} />
        </div>

        {running ? (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">
              {daysLeft === 1 ? '⏳ Last day of your free trial' : `⏳ ${daysLeft} days left on your free trial`}
            </h2>
            <p className="text-sm text-ink-300 mb-1">
              Your trial expires <span className="text-white font-semibold">{formatExact(expiresAt!)}</span>.
            </p>
            <p className="text-sm text-ink-400 mb-6">
              After that your temporary account is locked and its data is permanently deleted 30 days later.
              Upgrade now and your <span className="text-purple-300 font-semibold">projects, branding and {user?.credits ?? 0} credits</span> carry over — nothing is lost.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">Your trial has ended</h2>
            <p className="text-sm text-ink-400 mb-6">
              Rendering is locked until you subscribe. Your projects, branding and credits are kept for 30 days —
              upgrade to pick up exactly where you left off.
            </p>
          </>
        )}

        <button onClick={goUpgrade} className="btn btn-primary w-full text-base py-3 mb-3">
          {running ? 'Upgrade now — keep everything' : 'Subscribe now — unlock rendering'}
        </button>
        <button onClick={() => setDismissed(true)} className="btn btn-ghost w-full text-sm">
          {running ? 'Continue my trial' : 'Keep browsing for now'}
        </button>
        <p className="text-xs text-ink-500 mt-4">
          One click on Billing activates your plan instantly — no form to fill in.
        </p>
      </div>
    </div>
  );
}

/** Shared page header for the three AI tool routes. */
function ToolPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { user } = useCredit();
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="text-ink-400 mt-1">{subtitle}</p>
        <p className="text-xs text-ink-500 mt-1 flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" /> {RETENTION_NOTICE}</p>
        <p className="text-xs text-amber-400/90 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" /> Every tool here renders with AI — outputs can be wrong, and credits spent on unsatisfactory results are non-refundable. <Link to="/ai-notice" className="underline hover:text-amber-300 font-medium">Read the full AI notice</Link></p>
      </div>
      <Link
        to="/dashboard/credits"
        className="badge badge-brand hover:bg-white/10 transition"
        title="Your credit balance — click to top up"
      >
        <Zap className="w-3 h-3" /> {user?.credits ?? 0} credits balance
      </Link>
    </div>
  );
}

/** Sub-tab state in the URL (?tab=…), same deep-link contract the Studio had. */
function useToolTab(valid: string[], fallback: string): [string, (t: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab') || '';
  const tab = valid.includes(raw) ? raw : fallback;
  const setTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };
  return [tab, setTab];
}

// ── Photo Editor: AI Photo Editor 2⚡ / Virtual Staging 2⚡ /
//    Furniture Removal 2⚡ / Twilight 2⚡ ──────────────────────────────────
function PhotoEditorPage() {
  const [tab, setTab] = useToolTab(['photo', 'staging', 'removal', 'twilight'], 'photo');
  const tabs = [
    { id: 'photo', label: 'AI Photo Editor', icon: <Camera className="w-4 h-4" />, cost: 2 },
    { id: 'staging', label: 'Virtual Staging', icon: <Sofa className="w-4 h-4" />, cost: 2 },
    { id: 'removal', label: 'Furniture Removal', icon: <Trash2 className="w-4 h-4" />, cost: 2 },
    { id: 'twilight', label: 'Twilight', icon: <MoonIcon className="w-4 h-4" />, cost: 2 },
  ];
  return (
    <div className="space-y-6 animate-fade-in">
      <TrialDeadlineModal />
      <ToolPageHeader title="Photo Editor" subtitle="AI enhancements for listing photos — edit, stage, clear out furniture, or turn day into dusk." />
      <div className="flex flex-wrap gap-2 pb-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 ${tab === t.id ? 'tab-pill tab-pill-active' : 'tab-pill'}`}>
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
            <span className="text-[10px] font-bold text-yellow-300" title={`${t.cost} credits per render`}>⚡{t.cost}</span>
          </button>
        ))}
      </div>
      {/* Every panel stays mounted (inactive ones display:none) so uploads,
          drafts and in-flight renders survive sub-tab switches. */}
      <div className="card-dark p-6">
        <div className={tab === 'photo' ? undefined : 'hidden'}><ErrorBoundary label="AI Photo Editor"><PhotoEditorTab /></ErrorBoundary></div>
        <div className={tab === 'staging' ? undefined : 'hidden'}><ErrorBoundary label="Virtual Staging"><StagingTab /></ErrorBoundary></div>
        <div className={tab === 'removal' ? undefined : 'hidden'}><ErrorBoundary label="Furniture Removal"><RemovalTab /></ErrorBoundary></div>
        <div className={tab === 'twilight' ? undefined : 'hidden'}><ErrorBoundary label="Twilight"><TwilightTab /></ErrorBoundary></div>
      </div>
    </div>
  );
}

// ── Property Description: 1⚡ AI write-ups. Social Media moved OUT to its
//    own dashboard tool (/dashboard/social) instead of a sub-tab here.
function DescriptionPage() {
  const [searchParams] = useSearchParams();
  // Old ?tab=social deep links (bookmarks, notifications, help pages,
  // old onboarding links) forward to the standalone tool.
  const legacySocial = searchParams.get('tab') === 'social';
  if (legacySocial) return <Navigate to="/dashboard/social" replace />;
  return (
    <div className="space-y-6 animate-fade-in">
      <TrialDeadlineModal />
      <ToolPageHeader title="Property Description" subtitle="AI write-ups for your listing — a full description." />
      <div className="card-dark p-6">
        <ErrorBoundary label="Description"><DescriptionTab /></ErrorBoundary>
      </div>
    </div>
  );
}

// ── Social Media: its own dashboard tab (2⚡ per post) ────────────────────
function SocialMediaPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <TrialDeadlineModal />
      <ToolPageHeader title="Social Media" subtitle="Platform-ready social copy for your listing — fill in the details and let AI write the posts." />
      <div className="card-dark p-6">
        <ErrorBoundary label="Social Media"><SocialTab /></ErrorBoundary>
      </div>
    </div>
  );
}

// ── Video Generator: the 8-step render wizard (see VideoTab) ────────────
function VideoGeneratorPage() {
  const { user } = useCredit();
  // Shared voiceover script: the wizard's AI Write step generates it, the
  // AI Avatar Video step speaks it.
  const [sharedScript, setSharedScript] = useState('');
  // Shared voiceover language (BCP-47): reel and avatar narrate the same
  // script in the same one of South Africa's 11 official languages.
  const [sharedLanguage, setSharedLanguage] = useState(DEFAULT_VOICE_LANGUAGE);
  // Narration on/off (Step 5's "No narration" toggle) lives up here — not in
  // the wizard — because it gates the language check below: with narration
  // off the script is never spoken, so the hook is disabled, which stops an
  // in-flight "Checking the script language…" the instant the toggle flips
  // and lets the agent click Next without waiting for an irrelevant verdict.
  const [noNarration, setNoNarration] = useState(false);
  // Script-vs-language mismatch detection (LLM, debounced, fail-open): the
  // narrator reads the script verbatim with no auto-translation, so a
  // wrong-language script must surface a warning + one-click fix. One shared
  // instance keeps dismissal consistent across the steps that speak it.
  const langCheck = useVoiceoverLanguageCheck(sharedScript, sharedLanguage, setSharedScript, { enabled: !noNarration });
  // Shared avatar photo: chosen in the AI Avatar Video step, persisted so a
  // full page reload doesn't orphan the photo the agent already picked.
  const [sharedProfileImage, setSharedProfileImage, sharedProfileImageReady] = useStudioDraft<string | null>(studioDraftKey(user?.id, 'studio:profile-image'), null);
  // Photos + script handed over from a listing card, a project card or the
  // Property Description page (queued via src/lib/videoPrefill.ts).
  const [prefillImages, setPrefillImages] = useState<string[]>([]);
  useEffect(() => {
    const pf = takeVideoRender();
    if (!pf) return;
    if (pf.script) setSharedScript(pf.script);
    if (pf.images && pf.images.length) setPrefillImages(pf.images);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-6 animate-fade-in">
      <TrialDeadlineModal />
      <ToolPageHeader title="AI Video Generator" subtitle="Cinematic, narrated property reel in 8 guided steps — description, tier, orientation, photos, voiceover, avatar, music & branding, render." />
      <div className="card-dark p-6">
        <ErrorBoundary label="Video Generator">
          <VideoTab sharedScript={sharedScript} onScriptChange={setSharedScript} langCheck={langCheck} initialImages={prefillImages} profileImage={sharedProfileImage} profileImageReady={sharedProfileImageReady} onProfileImageChange={setSharedProfileImage} language={sharedLanguage} onLanguageChange={setSharedLanguage} noNarration={noNarration} onNoNarrationChange={setNoNarration} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

/** Legacy /studio links (help pages, bookmarks, old notifications) land on
 *  the matching new dashboard tool route. */
function StudioRedirect() {
  const [searchParams] = useSearchParams();
  const t = searchParams.get('tab');
  const to =
    t === 'video' || t === 'avatar' ? '/dashboard/video'
    : t === 'social' ? '/dashboard/social'
    : t === 'description' ? '/dashboard/description'
    : t === 'staging' || t === 'removal' || t === 'twilight' ? `/dashboard/photo-editor?tab=${t}`
    : '/dashboard/photo-editor';
  return <Navigate to={to} replace />;
}

// ═════════════════════════════════════════════════════════════════════════
// SHARED AI GENERATION HELPERS (Description + Social tabs)
// ═════════════════════════════════════════════════════════════════════════

 // Priced server-side in lib/renderPricing (the job_token mint is the
 // charge) — these are imported re-exports so the UI badge shows exactly
 // what the API prices. Replace any local re-litigation of the amounts.

// Key-feature chips moved to src/components/FeatureChips.tsx and the upload /
// geocoding helpers below moved to src/lib/propertyListing.ts — both shared
// with the Property Listings page.

// S3 photo upload + OSM geocoding/amenities helpers moved to
// src/lib/propertyListing.ts — shared with the Property Listings page.





function BudgetVideoPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <TrialDeadlineModal />
      <ToolPageHeader
        title="Budget AI Video"
        subtitle="Gentle motion, no voiceover — a calm 30-second reel from 5 photos at a slower, gentler pace than the Video Generator, generated at 512p or 768p."
      />
      <div className="card-dark p-6">
        <ErrorBoundary label="Budget AI Video"><BudgetVideoTab /></ErrorBoundary>
      </div>
    </div>
  );
}

// Admin panel lives in its own module, lazily loaded — it (and its
// recharts bundle) is admin-only and must not sit in the main chunk.
const AdminPage = lazy(() => import('./components/AdminPanel'));

// ═══════════════════════════════════════════════════════════════════════════
// APP ROUTER
// ═══════════════════════════════════════════════════════════════════════════

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-ink-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  // Carry the intended destination so sign-in can return the user here
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-ink-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
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

      // N - Open the AI Video Generator
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        navigate('/dashboard/video');
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
  const location = useLocation();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    // Auto-start only on the dashboard: the tour describes the dashboard, and
    // a fresh signup lands on the payment page first — the tour must never
    // hijack checkout. The post-payment welcome card (and Help → Replay tour)
    // start it explicitly via the `propreel:start-tour` event.
    if (!location.pathname.startsWith('/dashboard')) return;
    if (new URLSearchParams(location.search).get('welcome') === '1') return; // welcome card owns the screen
    try {
      const key = `propreel:onboarded:${user.id || user.email}`;
      if (!localStorage.getItem(key)) {
        setShowOnboarding(true);
      }
    } catch {
      // localStorage unavailable (private mode) — skip onboarding
    }
  }, [user, loading, location.pathname, location.search]);

  useEffect(() => {
    const show = () => setShowHelp(true);
    window.addEventListener('propreel:show-help', show);
    return () => window.removeEventListener('propreel:show-help', show);
  }, []);

  // Restart the tour on demand (e.g. "Start the tour" on the post-payment
  // welcome card, or Help → Replay tour). Clears the seen-flag first so the
  // state doesn't immediately re-close it.
  useEffect(() => {
    const restart = () => {
      try {
        if (user) localStorage.removeItem(`propreel:onboarded:${user.id || user.email}`);
      } catch { /* ignore */ }
      setShowOnboarding(true);
    };
    window.addEventListener('propreel:start-tour', restart);
    return () => window.removeEventListener('propreel:start-tour', restart);
  }, [user]);

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
    {/* Route-level code splitting: public pages lazy-load behind this boundary. */}
    <Suspense fallback={(
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center animate-pulse">
          <img src="/images/logo-icon.png" alt="" className="w-full h-full object-cover" />
        </div>
      </div>
    )}>
    <RouteSEO />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/reviews" element={<ReviewsPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/refund-policy" element={<RefundPolicyPage />} />
      <Route path="/ai-notice" element={<AiNoticePage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/cookies" element={<CookiePolicyPage />} />
      <Route path="/paia" element={<PAIAManualPage />} />
      <Route path="/dpa" element={<DataProcessingAgreementPage />} />
      <Route path="/tutorial" element={<TutorialVideoPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/status" element={<PublicLayout><StatusPage /></PublicLayout>} />
      <Route path="/blog" element={<BlogIndexPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/confirm-email" element={<ConfirmEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/2fa-setup" element={<RequireAuth><TwoFactorSetupPage /></RequireAuth>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/register" element={<SignupPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/payment" element={<PaymentPage />} />
      <Route path="/payment/callback" element={<PaymentPage />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardLayout><DashboardOverview /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/credits" element={<RequireAuth><DashboardLayout><CreditSystemDashboard /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/listings" element={<RequireAuth><DashboardLayout><DashboardListings /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/listings/new" element={<RequireAuth><DashboardLayout><NewListingPage /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/listings/:id/edit" element={<RequireAuth><DashboardLayout><ListingEditPage /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/projects" element={<RequireAuth><DashboardLayout><DashboardMyProjects /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/branding" element={<RequireAuth><DashboardLayout><DashboardBranding /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/analytics" element={<RequireAuth><DashboardLayout><DashboardAnalytics /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/tutorials" element={<RequireAuth><DashboardLayout><DashboardTutorials /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/photo-editor" element={<RequireAuth><DashboardLayout><PhotoEditorPage /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/description" element={<RequireAuth><DashboardLayout><DescriptionPage /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/social" element={<RequireAuth><DashboardLayout><SocialMediaPage /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/budget-video" element={<RequireAuth><DashboardLayout><BudgetVideoPage /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/video" element={<RequireAuth><DashboardLayout><VideoGeneratorPage /></DashboardLayout></RequireAuth>} />
      {/* Billing moved into Credits; Notifications moved into Settings */}
      <Route path="/dashboard/billing" element={<Navigate to="/dashboard/credits?tab=billing" replace />} />
      <Route path="/dashboard/agency" element={<RequireAuth><DashboardLayout><DashboardAgency /></DashboardLayout></RequireAuth>} />
      <Route path="/agency/signup" element={<RequireAuth><AgencySignup /></RequireAuth>} />
      <Route path="/dashboard/settings" element={<RequireAuth><DashboardLayout><DashboardSettings /></DashboardLayout></RequireAuth>} />
      <Route path="/dashboard/cancel-subscription" element={<RequireAuth><CancelSubscriptionPage /></RequireAuth>} />
      <Route path="/dashboard/delete-account" element={<RequireAuth><DeleteAccountPage /></RequireAuth>} />
      <Route path="/dashboard/notifications" element={<Navigate to="/dashboard/settings?tab=notifications" replace />} />
      {/* Legacy /studio links redirect to the matching tool route */}
      <Route path="/studio" element={<StudioRedirect />} />
      <Route path="/admin" element={<RequireAdmin><DashboardLayout><AdminPage /></DashboardLayout></RequireAdmin>} />
      <Route path="/admin/integrations" element={<RequireAdmin><DashboardLayout><AdminIntegrations /></DashboardLayout></RequireAdmin>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
      <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 left-4 z-50 bg-purple-700 text-white px-4 py-2 rounded-lg shadow-lg">
          Skip to main content
        </a>
        <ToastProvider>
         <ConfirmProvider>
          <CreditProvider>
            {/* Update-mode gate: when the Admin → Update Mode row is ON, the
                whole app is replaced by the "We're upgrading" page for
                non-admins; admins get a banner. Polls every 60s. */}
            <Suspense fallback={null}>
              <MaintenanceGate>
                <AppRoutes />
              </MaintenanceGate>
            </Suspense>
            <ShortcutsHelpListener />
            <OnboardingAndHelp />
            <OfflineBanner />
            <AIDisclaimerGate />
            <CookieConsent />
          </CreditProvider>
         </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
      </MotionConfig>
  );
}
