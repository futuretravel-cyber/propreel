import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Play, Image, Video, Sparkles, Zap } from 'lucide-react';

interface Step {
  id: string;
  title: string;
  description: string;
  icon: any;
  action?: string;
  completed?: boolean;
}

export default function OnboardingTutorial({ onComplete }: { onComplete?: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  // Fires when the tour is finished or dismissed, so the parent can persist
  // the "seen" flag and unmount the tutorial.
  const finish = () => {
    setIsOpen(false);
    onComplete?.();
  };

  const steps: Step[] = [
    {
      id: 'welcome',
      title: 'Welcome to PropReel!',
      description: 'Let\'s take a quick tour to help you get started with creating stunning property videos.',
      icon: Sparkles
    },
    {
      id: 'create-project',
      title: 'Create Your First Project',
      description: 'Start by creating a new project. Add property details, photos, and let AI do the magic.',
      icon: Video,
      action: '/studio'
    },
    {
      id: 'edit-photos',
      title: 'Enhance Photos with AI',
      description: 'Use our AI Photo Editor to enhance lighting, sky, and landscaping in seconds.',
      icon: Image,
      action: '/studio?tab=photo'
    },
    {
      id: 'generate-video',
      title: 'Generate Your First Video',
      description: 'Create a cinematic property video with AI voiceover, transitions, and branding.',
      icon: Video,
      action: '/studio?tab=video'
    },
    {
      id: 'share-social',
      title: 'Share on Social Media',
      description: 'Generate platform-specific captions for Instagram, Facebook, WhatsApp, and more.',
      icon: Zap,
      action: '/studio?tab=social'
    },
    {
      id: 'complete',
      title: 'You\'re All Set!',
      description: 'You\'re ready to create amazing property videos. Check out our advanced features anytime.',
      icon: Check
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCompletedSteps([...completedSteps, steps[currentStep].id]);
      setCurrentStep(currentStep + 1);
    } else {
      finish();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleAction = () => {
    const step = steps[currentStep];
    if (step.action) {
      window.location.href = step.action;
    }
    handleNext();
  };

  if (!isOpen) return null;

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

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
          <div className="p-8">
            <p className="text-ink-300 text-lg leading-relaxed mb-6">
              {currentStepData.description}
            </p>

            {/* Visual Guide */}
            {currentStep === 0 && (
              <div className="grid grid-cols-3 gap-4 mb-6">
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

            {currentStep === 1 && (
              <div className="bg-ink-800/50 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-xl bg-purple-700/20 flex items-center justify-center">
                    <Video className="w-8 h-8 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Studio</p>
                    <p className="text-sm text-ink-400">Your creative workspace</p>
                  </div>
                </div>
                <p className="text-sm text-ink-300">
                  The Studio is where you'll create all your property marketing content. 
                  From videos to photos to social media captions, everything is in one place.
                </p>
              </div>
            )}

            {currentStep === 2 && (
              <div className="bg-ink-800/50 rounded-xl p-6 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="aspect-video rounded-lg bg-ink-700 flex items-center justify-center">
                    <span className="text-ink-500 text-sm">Before</span>
                  </div>
                  <div className="aspect-video rounded-lg bg-gradient-to-br from-orange-900/50 to-purple-900/50 flex items-center justify-center">
                    <span className="text-white text-sm">After ✨</span>
                  </div>
                </div>
                <p className="text-sm text-ink-300 mt-4">
                  Our AI Photo Editor can transform daylight photos into golden hour shots, 
                  clear up skies, enhance landscaping, and more — all while preserving the property's architecture.
                </p>
              </div>
            )}

            {currentStep === 3 && (
              <div className="bg-ink-800/50 rounded-xl p-6 mb-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-700/20 flex items-center justify-center text-xs text-purple-400 font-bold">1</div>
                    <span className="text-sm text-ink-300">Upload property photos</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-700/20 flex items-center justify-center text-xs text-purple-400 font-bold">2</div>
                    <span className="text-sm text-ink-300">Choose video tier and style</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-700/20 flex items-center justify-center text-xs text-purple-400 font-bold">3</div>
                    <span className="text-sm text-ink-300">Select AI voice for narration</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-700/20 flex items-center justify-center text-xs text-purple-400 font-bold">4</div>
                    <span className="text-sm text-ink-300">Generate cinematic video</span>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="bg-gradient-to-br from-purple-950/50 to-ink-900 rounded-xl p-6 mb-6 border border-purple-500/20">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-400" />
                  </div>
                  <p className="text-white font-medium mb-2">Tutorial Complete!</p>
                  <p className="text-sm text-ink-300">
                    You now have 5 free credits to start creating. Explore all features at your own pace.
                  </p>
                </div>
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

            {currentStepData.action ? (
              <button
                onClick={handleAction}
                className="btn btn-primary gap-2"
              >
                {currentStep === steps.length - 1 ? 'Finish' : 'Try It'} <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="btn btn-primary gap-2"
              >
                {currentStep === steps.length - 1 ? 'Finish' : 'Next'} <ChevronRight className="w-4 h-4" />
              </button>
            )}
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
