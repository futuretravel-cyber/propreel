import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, ChevronRight, ChevronLeft, Check, Zap, Image, Video, Sparkles, FileText, CreditCard, LayoutGrid, Camera, Users } from 'lucide-react';

interface Step {
  id: string;
  title: string;
  description: string;
  icon: any;
  action?: string;
}

/**
 * Guided dashboard tour shown to first-time users (and on demand after a
 * payment via the `propreel:start-tour` event).
 *
 * IMPORTANT: every navigation uses react-router (SPA). The previous version
 * used `window.location.href`, which reloaded the page, remounted the tour at
 * step 1, and trapped users in a 2-step loop.
 */
export default function OnboardingTutorial({ onComplete }: { onComplete?: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  // Fires when the tour is finished or dismissed, so the parent can persist
  // the "seen" flag and unmount the tutorial.
  const finish = () => {
    setIsOpen(false);
    onComplete?.();
  };

  const steps: Step[] = [
    {
      id: 'welcome',
      title: 'Welcome to PropReel! 🎉',
      description: 'Your account is ready. Let\'s take a quick 60-second tour of your new dashboard — you can replay it any time from Help.',
      icon: Sparkles,
    },
    {
      id: 'credits',
      title: 'Your Credits Live Here',
      description: 'Check your balance, top up, view every credit transaction, and set up auto-topup. Renders only cost credits when they succeed — failures are refunded automatically.',
      icon: Zap,
      action: '/dashboard/credits',
    },
    {
      id: 'billing',
      title: 'Billing & Plans',
      description: 'Manage your subscription, buy credit bundles in ZAR, download invoices, and gift credits to your team.',
      icon: CreditCard,
      action: '/dashboard/billing',
    },
    {
      id: 'studio',
      title: 'The Studio — Where Content Is Made',
      description: 'Every AI tool lives in the Studio: property descriptions, photo edits, videos, social posts and talking-head videos.',
      icon: LayoutGrid,
      action: '/studio',
    },
    {
      id: 'description',
      title: 'AI Property Descriptions',
      description: 'Type an address, confirm it on Google Maps, pick key features — AI writes an amenities-rich listing description for 1 credit per render.',
      icon: FileText,
      action: '/studio?tab=description',
    },
    {
      id: 'photo',
      title: 'AI Photo Editor',
      description: 'Upload a photo, pick a preset (day-to-dusk, sky fix, declutter…), and let AI enhance it — 2 credits per render.',
      icon: Camera,
      action: '/studio?tab=photo',
    },
    {
      id: 'video',
      title: 'Create Your Property Video',
      description: 'Upload property photos, choose a tier and voice, then generate a cinematic video with AI voiceover.',
      icon: Video,
      action: '/studio?tab=video',
    },
    {
      id: 'social',
      title: 'Social Media Posts',
      description: 'Fill in the property details (beds, baths, features, photos) and AI writes platform-ready posts — 2 credits per post.',
      icon: Image,
      action: '/studio?tab=social',
    },
    {
      id: 'team',
      title: 'Grow With Your Agency',
      description: 'On the Agency tab you can invite agents, share a credit pool, and track the whole team\'s usage.',
      icon: Users,
      action: '/dashboard/agency',
    },
    {
      id: 'complete',
      title: 'You\'re All Set!',
      description: 'Everything is ready — start with a photo edit or your first video. Reopen this tour any time from the Help button.',
      icon: Check,
    },
  ];

  const goTo = (path?: string) => {
    if (!path) return;
    // SPA navigation keeps the tour state alive (a full page load would
    // restart it from step 1 — the old "stuck on step 2" bug).
    const [pathOnly] = path.split('?');
    if (location.pathname + location.search !== path) navigate(path);
  };

  const handleNext = () => {
    const step = steps[currentStep];
    setCompletedSteps(prev => (prev.includes(step.id) ? prev : [...prev, step.id]));
    goTo(step.action);
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      finish();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  if (!isOpen) return null;

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const isLast = currentStep === steps.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />

      {/* Tutorial Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="card-dark max-w-2xl w-full overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 flex items-center justify-center">
                <currentStepData.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{currentStepData.title}</h2>
                <p className="text-sm text-ink-400">
                  Step {currentStep + 1} of {steps.length}
                </p>
              </div>
            </div>
            <button
              onClick={finish}
              className="text-ink-400 hover:text-white p-2"
              aria-label="Skip tutorial"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="h-1 bg-ink-800">
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Content */}
          <div className="p-8 min-h-[180px]">
            <p className="text-ink-300 text-lg leading-relaxed mb-6">
              {currentStepData.description}
            </p>

            {currentStepData.action && (
              <div className="bg-ink-800/50 rounded-xl p-4 flex items-center gap-3">
                <currentStepData.icon className="w-6 h-6 text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium">Opening: <span className="text-purple-300 font-mono text-xs">{currentStepData.action}</span></p>
                  <p className="text-xs text-ink-400 truncate">The page behind this card switches as you tap Next — the tour never restarts.</p>
                </div>
              </div>
            )}

            {!currentStepData.action && currentStep === 0 && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-ink-800/50 rounded-xl p-4 text-center">
                  <Video className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                  <p className="text-xs text-ink-300">Create Videos</p>
                </div>
                <div className="bg-ink-800/50 rounded-xl p-4 text-center">
                  <Image className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                  <p className="text-xs text-ink-300">Edit Photos</p>
                </div>
                <div className="bg-ink-800/50 rounded-xl p-4 text-center">
                  <Zap className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                  <p className="text-xs text-ink-300">AI Powered</p>
                </div>
              </div>
            )}

            {isLast && (
              <div className="bg-gradient-to-br from-purple-950/50 to-ink-900 rounded-xl p-6 border border-purple-500/20 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-400" />
                </div>
                <p className="text-white font-medium mb-2">Tour Complete!</p>
                <p className="text-sm text-ink-300">
                  Your free credits are waiting in the top-right of your dashboard.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-white/5">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="btn btn-secondary gap-2 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>

            <div className="flex gap-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition ${
                    index === currentStep
                      ? 'bg-purple-500'
                      : completedSteps.includes(steps[index].id)
                      ? 'bg-green-500'
                      : 'bg-ink-700'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleNext}
              className="btn btn-primary gap-2"
            >
              {isLast ? 'Finish' : 'Next'} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Tooltip component for first-time use
export function Tooltip({ children, content, show = true }: { children: React.ReactNode; content: string; show?: boolean }) {
  const [isVisible, setIsVisible] = useState(show);

  if (!isVisible) return <>{children}</>;

  return (
    <div className="relative inline-block">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 animate-fade-in">
        <div className="bg-ink-800 border border-purple-500/30 rounded-lg p-3 shadow-lg max-w-xs">
          <p className="text-sm text-white">{content}</p>
          <button
            onClick={() => setIsVisible(false)}
            className="text-xs text-purple-400 hover:text-purple-300 mt-2"
          >
            Got it
          </button>
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
          <div className="w-2 h-2 bg-ink-800 border-r border-b border-purple-500/30 transform rotate-45" />
        </div>
      </div>
    </div>
  );
}
