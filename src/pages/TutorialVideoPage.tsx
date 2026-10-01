import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Check, Clock, Sparkles, Video, Image, FileText, Share2 } from 'lucide-react';

export default function TutorialVideoPage() {
  const [currentStep, setCurrentStep] = useState(0);

  // Step-by-step written walkthrough. (Video tutorials are produced
  // separately; this page intentionally renders an interactive guide
  // rather than embedding placeholder videos.)
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
      detail: 'Credits are deducted when the render starts. You can watch live progress (queued → processing → complete). If a render fails, your credits are refunded automatically.',
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
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-purple-700 hover:text-purple-800 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
            Create Your First Video
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Follow this step-by-step tutorial to create your first stunning property video in under 20 minutes.
          </p>
        </div>

        {/* Step Visual Panel (no placeholder videos — interactive written guide) */}
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
            <h2 className="text-2xl font-bold text-gray-900">
              Step {steps[currentStep].id} of {steps.length}
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-600">
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
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          {/* Current Step Content */}
          <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-200 rounded-2xl p-8 mb-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-700 flex items-center justify-center text-white flex-shrink-0">
                {steps[currentStep].icon}
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {steps[currentStep].title}
                </h3>
                <p className="text-gray-600 text-lg">
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
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            All Tutorial Steps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(index)}
                className={`text-left p-6 rounded-xl border transition-all ${
                  currentStep === index
                    ? 'bg-purple-50 border-purple-300 shadow-lg'
                    : 'bg-white border-gray-200 hover:border-purple-200 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    currentStep === index ? 'bg-purple-700 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {step.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 mb-1">
                      Step {step.id}: {step.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {step.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
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
          <Link to="/register" className="btn bg-white text-purple-700 hover:bg-purple-50 text-lg px-8 py-4">
            <Sparkles className="w-5 h-5" /> Start Free — 5 Credits
          </Link>
        </div>
      </div>
    </div>
  );
}
