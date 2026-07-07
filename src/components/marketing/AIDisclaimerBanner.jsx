import React from "react";
import { AlertTriangle } from "lucide-react";

// Compulsory AI usage & refund disclaimer shown on the public landing page
export default function AIDisclaimerBanner() {
  return (
    <section className="bg-amber-50 border-y border-amber-100">
      <div className="max-w-5xl mx-auto px-6 py-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 leading-relaxed">
          <span className="font-semibold">AI Disclaimer:</span> This platform uses artificial intelligence (AI) to generate content. AI can make mistakes, produce inaccurate results, or generate unexpected outputs. By using this service, you acknowledge that AI-generated content may not always meet your expectations. Credits spent on unsatisfactory results are non-refundable.
        </p>
      </div>
    </section>
  );
}