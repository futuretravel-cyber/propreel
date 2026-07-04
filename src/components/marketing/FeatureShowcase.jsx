import React from "react";
import { FileText, Camera, Sofa, Trash2, Sunset, Share2, Video } from "lucide-react";

const FEATURES = [
  { icon: FileText, title: "Property Description", desc: "AI-written, portal-ready listing copy in seconds." },
  { icon: Camera,    title: "AI Photo Editor",      desc: "Sky swaps, decluttering, lighting fixes and more." },
  { icon: Sofa,      title: "Virtual Staging",      desc: "Furnish empty rooms with realistic AI-generated decor." },
  { icon: Trash2,    title: "Furniture Removal",    desc: "Clear clutter, furniture or vehicles from any photo." },
  { icon: Sunset,    title: "Twilight Photography", desc: "Turn daytime shots into stunning dusk conversions." },
  { icon: Share2,    title: "Social Media Posts",   desc: "Platform-ready captions and images, generated instantly." },
  { icon: Video,     title: "AI Video Generator",   desc: "Turn your photos into a branded property video." },
];

export default function FeatureShowcase() {
  return (
    <section className="py-20 bg-white" id="feature-showcase">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0F082B] mb-3">Everything you need, in one Studio</h2>
          <p className="text-[#606060]">A full suite of AI-powered tools built for South African real estate marketing.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-purple-700" />
              </div>
              <h3 className="font-semibold text-[#0F082B] mb-1.5">{f.title}</h3>
              <p className="text-sm text-[#606060] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}