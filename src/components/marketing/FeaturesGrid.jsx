import React from "react";
import { Video, Download, Armchair, Image, Wand2, Mic, SlidersHorizontal } from "lucide-react";

const features = [
  { icon: Video, title: "Photo to Video", desc: "Transform listing photos into captivating video tours.", wide: true },
  { icon: Download, title: "One-click Import", desc: "Pull listing photos from Property24 in seconds.", wide: false },
  { icon: Armchair, title: "AI Virtual Staging", desc: "Furnish empty rooms with AI — SA furniture styles.", wide: false },
  { icon: Image, title: "AI Photo Edits", desc: "Blue sky replacement, twilight conversion, lawn greening.", wide: true },
  { icon: Wand2, title: "Viral Visual Effects", desc: "Cinematic transitions, VFX, lifestyle shots.", wide: true },
  { icon: Mic, title: "AI Voiceovers", desc: "Narrations in South African English. Choose your voice.", wide: false },
  { icon: SlidersHorizontal, title: "Studio Editor", desc: "Fine-tune transitions, captions, and branding.", wide: false },
];

export default function FeaturesGrid() {
  return (
    <section className="py-20 px-4 bg-[#F8F9FA]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0F082B] mb-4">
            Everything You Need to Create <span className="text-purple-700">Stunning</span> Property Videos
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className={`bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:border-purple-200 transition-all duration-300 group ${
                f.wide ? "sm:col-span-2" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-4 group-hover:bg-purple-700 transition-colors">
                <f.icon className="w-5 h-5 text-purple-700 group-hover:text-white transition-colors" />
              </div>
              <h3 className="font-bold text-[#0F082B] mb-2">{f.title}</h3>
              <p className="text-sm text-[#606060] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}