import React from "react";
import { Check, Zap, Sparkles } from "lucide-react";

export const VIDEO_TIERS = [
  {
    id: "essential",
    name: "Essential",
    motion: "Zoom / Pan",
    resolution: "1080p",
    speed: "Instant",
    processing: "Local FFmpeg render",
    configs: [
      { duration: 30, images: 6, credits: 5 },
      { duration: 60, images: 12, credits: 10 },
    ],
  },
  {
    id: "social",
    name: "Social",
    motion: "AI Motion",
    resolution: "720p",
    speed: "~15 min",
    processing: "480p → 720p upscaled",
    configs: [
      { duration: 20, images: 5, credits: 30 },
      { duration: 40, images: 10, credits: 50 },
      { duration: 60, images: 15, credits: 70 },
    ],
  },
  {
    id: "cinematic",
    name: "Cinematic",
    motion: "AI Motion",
    resolution: "720p",
    speed: "~15 min",
    processing: "480p → 720p upscaled",
    configs: [
      { duration: 30, images: 6, credits: 40 },
      { duration: 60, images: 12, credits: 70 },
      { duration: 90, images: 18, credits: 90 },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    motion: "AI Motion",
    resolution: "1080p",
    speed: "~30 min",
    processing: "720p → 1080p upscaled",
    configs: [
      { duration: 30, images: 6, credits: 60 },
      { duration: 60, images: 12, credits: 100 },
      { duration: 90, images: 18, credits: 150 },
    ],
  },
];

export const getTierDurations = (tierId) => {
  const tier = VIDEO_TIERS.find(t => t.id === tierId);
  return tier ? tier.configs.map(c => c.duration) : [30];
};

export const getMaxImages = (tierId, durationSeconds) => {
  const tier = VIDEO_TIERS.find(t => t.id === tierId);
  if (!tier) return Math.round((durationSeconds || 30) / 5);
  const config = tier.configs.find(c => c.duration === durationSeconds);
  return config ? config.images : tier.configs[0].images;
};

export const getTierCredits = (tierId, durationSeconds) => {
  const tier = VIDEO_TIERS.find(t => t.id === tierId) || VIDEO_TIERS[0];
  const config = tier.configs.find(c => c.duration === durationSeconds);
  return config ? config.credits : tier.configs[0].credits;
};

export default function VideoTierSelector({ selectedTier, onSelectTier, selectedDuration, onSelectDuration }) {
  const currentTier = VIDEO_TIERS.find(t => t.id === selectedTier) || VIDEO_TIERS[0];

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <p className="text-sm font-semibold text-slate-100">Video Tier</p>
      </div>
      <p className="text-xs text-slate-500 mb-4">Choose the quality and motion style for this video.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {VIDEO_TIERS.map(tier => {
          const isSelected = selectedTier === tier.id;
          const isInstant = tier.speed === "Instant";
          return (
            <button
              key={tier.id}
              onClick={() => onSelectTier(tier.id)}
              className={`relative flex flex-col gap-1.5 p-4 rounded-xl border text-left transition-all ${
                isSelected
                  ? "border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                  : "border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70"
              }`}
            >
              {isSelected && (
                <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <div className="flex items-center gap-1.5">
                {isInstant ? <Zap className="w-3.5 h-3.5 text-amber-400" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
                <p className="text-sm font-bold text-slate-100">{tier.name}</p>
              </div>
              <p className="text-xs text-slate-400">{tier.motion}</p>
              <p className="text-xs text-slate-500">{tier.resolution} · {tier.speed}</p>
              <p className="text-[10px] font-semibold text-indigo-400 mt-1">from {tier.configs[0].credits} credits</p>
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-slate-300 mb-2">Video Length</p>
      <div className="grid grid-cols-3 gap-2 max-w-md">
        {currentTier.configs.map(config => {
          const isSelected = selectedDuration === config.duration;
          return (
            <button
              key={config.duration}
              onClick={() => onSelectDuration(config.duration)}
              className={`flex flex-col items-center gap-0.5 p-3 rounded-xl border transition-all ${
                isSelected
                  ? "border-indigo-500/50 bg-indigo-500/10"
                  : "border-slate-800 bg-slate-800/40 hover:border-slate-700"
              }`}
            >
              <p className="text-sm font-bold text-slate-100">{config.duration} sec</p>
              <p className="text-xs text-slate-400">{config.images} images</p>
              <p className="text-[10px] font-semibold text-indigo-400">{config.credits} credits</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}