import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const slides = [
  { title: "Property24 One-Click Import", desc: "Import listing photos directly from Property24 URLs. No downloading, no hassle.", color: "from-[#21ABB5]/10 to-[#DEF5F7]" },
  { title: "ZAR Pricing & Local Payments", desc: "All pricing in South African Rand. Pay via PayFast, Ozow, SnapScan, EFT, or card.", color: "from-purple-50 to-purple-100/50" },
  { title: "SA Voice Accents", desc: "AI voiceovers with authentic South African English accents for your property videos.", color: "from-amber-50 to-amber-100/50" },
  { title: "Cape Dutch Virtual Staging", desc: "AI staging with SA furniture styles — from Cape Dutch to Modern Johannesburg.", color: "from-emerald-50 to-emerald-100/50" },
  { title: "WhatsApp Sharing", desc: "Share finished videos directly to WhatsApp — the preferred platform for SA property.", color: "from-green-50 to-green-100/50" },
];

export default function BuiltForSASection() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrent((p) => (p + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="py-20 px-4 bg-[#F8F9FA]">
      <div className="max-w-5xl mx-auto text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0F082B] mb-4">
          Your All-in-One <span className="text-[#21ABB5]">Solution</span> for Property Videos
        </h2>
        <p className="text-lg text-[#606060]">Turn listing photos into cinematic videos in minutes. From Cape Town to Johannesburg.</p>
      </div>

      <div className="max-w-3xl mx-auto relative">
        <div className={`bg-gradient-to-br ${slides[current].color} rounded-2xl p-10 min-h-[220px] flex flex-col items-center justify-center text-center transition-all duration-500`}>
          <h3 className="text-xl font-bold text-[#0F082B] mb-3">{slides[current].title}</h3>
          <p className="text-[#606060] max-w-md">{slides[current].desc}</p>
        </div>

        <button
          onClick={() => setCurrent((p) => (p - 1 + slides.length) % slides.length)}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => setCurrent((p) => (p + 1) % slides.length)}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div className="flex justify-center gap-2 mt-6">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${i === current ? "bg-[#21ABB5] w-6" : "bg-gray-300"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}