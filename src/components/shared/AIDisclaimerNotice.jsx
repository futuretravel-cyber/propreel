import React from "react";
import { Info } from "lucide-react";

// Notice banner shown in Studio tools that generate AI content
export default function AIDisclaimerNotice() {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
      <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-amber-800">
        This platform uses artificial intelligence (AI) to generate content. AI can make mistakes, produce inaccurate results, or generate unexpected outputs. By using this service, you acknowledge that AI-generated content may not always meet your expectations. Credits spent on unsatisfactory results are non-refundable.
      </p>
    </div>
  );
}