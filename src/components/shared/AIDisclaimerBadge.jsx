import React from "react";
import { Sparkles } from "lucide-react";

// Small overlay badge to mark AI-generated/edited media
export default function AIDisclaimerBadge({ className = "" }) {
  return (
    <div className={`absolute top-2 left-2 z-10 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full ${className}`}>
      <Sparkles className="w-3 h-3" />
      AI Generated
    </div>
  );
}