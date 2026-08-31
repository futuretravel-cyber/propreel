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
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-sm font-semibold text-gray-900 mb-1">🎬 Video Tier</p>
      <p className="text-xs text-gray-400 mb-3">Choose the quality and motion style for this video.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        {VIDEO_TIERS.map(tier => {
          const isSelected = selectedTier === tier.id;
          const isInstant = tier.speed === "Instant";
          return (
            <button
              key={tier.id}
              onClick={() => onSelectTier(tier.id)}
              className={`relative flex flex-col gap-1.5 p-3 rounded-xl border-2 text-left transition-all ${
                isSelected ? "border-purple-700 bg-purple-50" : "border-gray-100 bg-gray-50 hover:border-gray-300"
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-700 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <div className="flex items-center gap-1.5">
                {isInstant ? <Zap className="w-3.5 h-3.5 text-amber-500" /> : <Sparkles className="w-3.5 h-3.5 text-purple-600" />}
                <p className="text-sm font-bold text-gray-900">{tier.name}</p>
              </div>
              <p className="text-xs text-gray-500">{tier.motion}</p>
              <p className="text-xs text-gray-500">{tier.resolution} · {tier.speed}</p>
              <p className="text-[10px] font-semibold text-purple-700 mt-1">from {tier.configs[0].credits} credits</p>
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-gray-700 mb-2">Video Length</p>
      <div className="grid grid-cols-3 gap-2 max-w-md">
        {currentTier.configs.map(config => {
          const isSelected = selectedDuration === config.duration;
          return (
            <button
              key={config.duration}
              onClick={() => onSelectDuration(config.duration)}
              className={`flex flex-col items-center gap-0.5 p-3 rounded-xl border-2 transition-all ${
                isSelected ? "border-purple-700 bg-purple-50" : "border-gray-100 bg-gray-50 hover:border-gray-300"
              }`}
            >
              <p className="text-sm font-bold text-gray-900">{config.duration} sec</p>
              <p className="text-xs text-gray-500">{config.images} images</p>
              <p className="text-[10px] font-semibold text-purple-700">{config.credits} credits</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}