import React from "react";
import { Check, Zap, Sparkles } from "lucide-react";

export const VIDEO_TIERS = [
  { id: "essential", name: "Essential", motion: "Zoom / Pan", resolution: "1080p", speed: "Instant", credits: 5 },
  { id: "social",    name: "Social",    motion: "AI Motion",  resolution: "720p",  speed: "~15 min",  credits: 15 },
  { id: "cinematic", name: "Cinematic", motion: "AI Motion",  resolution: "720p",  speed: "~15 min",  credits: 30 },
  { id: "premium",   name: "Premium",   motion: "AI Motion",  resolution: "1080p", speed: "~30 min",  credits: 50 },
  { id: "pro",       name: "Pro",       motion: "AI Motion",  resolution: "1080p", speed: "~10 min",  credits: 75 },
];

export default function VideoTierSelector({ selectedTier, onSelectTier }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-sm font-semibold text-gray-900 mb-1">🎬 Video Tier</p>
      <p className="text-xs text-gray-400 mb-3">Choose the quality and motion style for this video.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
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
              <p className="text-[10px] font-semibold text-purple-700 mt-1">{tier.credits} credits</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}