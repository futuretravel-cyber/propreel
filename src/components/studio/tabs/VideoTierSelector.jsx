import React from "react";
import { Check, Zap, Sparkles } from "lucide-react";

export const VIDEO_TIERS = [
  { id: "essential", name: "Essential", motion: "Zoom / Pan", resolution: "1080p", speed: "Instant", baseCredits: 5, durations: [30, 60] },
  { id: "social",    name: "Social",    motion: "AI Motion",  resolution: "720p",  speed: "~15 min",  baseCredits: 15, durations: [30, 60] },
  { id: "cinematic", name: "Cinematic", motion: "AI Motion",  resolution: "720p",  speed: "~15 min",  baseCredits: 30, durations: [30, 60] },
  { id: "premium",   name: "Premium",   motion: "AI Motion",  resolution: "1080p", speed: "~30 min",  baseCredits: 50, durations: [30, 60, 90] },
  { id: "pro",       name: "Pro",       motion: "AI Motion",  resolution: "1080p", speed: "~10 min",  baseCredits: 75, durations: [30, 60, 90] },
];

// 1 image per 5 seconds of video
export const getMaxImages = (durationSeconds) => Math.round((durationSeconds || 30) / 5);

// Credit cost scales linearly with duration (30s = base cost)
export const getTierCredits = (tierId, durationSeconds) => {
  const tier = VIDEO_TIERS.find(t => t.id === tierId) || VIDEO_TIERS[0];
  return Math.round(tier.baseCredits * ((durationSeconds || 30) / 30));
};

export default function VideoTierSelector({ selectedTier, onSelectTier, selectedDuration, onSelectDuration }) {
  const currentTier = VIDEO_TIERS.find(t => t.id === selectedTier) || VIDEO_TIERS[0];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-sm font-semibold text-gray-900 mb-1">🎬 Video Tier</p>
      <p className="text-xs text-gray-400 mb-3">Choose the quality and motion style for this video.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
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
              <p className="text-[10px] font-semibold text-purple-700 mt-1">from {getTierCredits(tier.id, tier.durations[0])} credits</p>
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-gray-700 mb-2">Video Length</p>
      <div className="grid grid-cols-3 gap-2 max-w-md">
        {currentTier.durations.map(seconds => {
          const isSelected = selectedDuration === seconds;
          return (
            <button
              key={seconds}
              onClick={() => onSelectDuration(seconds)}
              className={`flex flex-col items-center gap-0.5 p-3 rounded-xl border-2 transition-all ${
                isSelected ? "border-purple-700 bg-purple-50" : "border-gray-100 bg-gray-50 hover:border-gray-300"
              }`}
            >
              <p className="text-sm font-bold text-gray-900">{seconds} sec</p>
              <p className="text-xs text-gray-500">{getMaxImages(seconds)} images</p>
              <p className="text-[10px] font-semibold text-purple-700">{getTierCredits(currentTier.id, seconds)} credits</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}