import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Play, Star, ArrowRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

const previewCards = [
  { w: "w-48", h: "h-28", label: "Sandton Villa", aspect: "16:9", bg: "from-[#21ABB5]/20 to-[#21ABB5]/5" },
  { w: "w-32", h: "h-52", label: "Cape Town Penthouse", aspect: "9:16", bg: "from-purple-200/40 to-purple-100/20" },
  { w: "w-48", h: "h-28", label: "Durban Beachfront", aspect: "16:9", bg: "from-amber-200/40 to-amber-100/20" },
  { w: "w-32", h: "h-52", label: "Stellenbosch Estate", aspect: "9:16", bg: "from-emerald-200/40 to-emerald-100/20" },
  { w: "w-48", h: "h-28", label: "Pretoria Suburb", aspect: "16:9", bg: "from-rose-200/40 to-rose-100/20" },
  { w: "w-32", h: "h-52", label: "Camps Bay", aspect: "9:16", bg: "from-blue-200/40 to-blue-100/20" },
  { w: "w-48", h: "h-28", label: "Umhlanga Rocks", aspect: "16:9", bg: "from-[#21ABB5]/15 to-[#21ABB5]/5" },
  { w: "w-32", h: "h-52", label: "Franschhoek Wine Estate", aspect: "9:16", bg: "from-violet-200/40 to-violet-100/20" },
];

export default function HeroSection() {
  const [sliderPos, setSliderPos] = useState(50);
  const sliderRef = useRef(null);
  const dragging = useRef(false);

  const handleMove = (clientX) => {
    if (!dragging.current || !sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pct = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pct);
  };

  return (
    <section className="pt-28 lg:pt-36 pb-8 px-4 overflow-hidden">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-[#DEF5F7] text-[#21ABB5] text-xs font-semibold px-4 py-2 rounded-full mb-6">
          SOUTH AFRICAN REAL ESTATE AI PLATFORM
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#0F082B] leading-tight mb-5 tracking-tight">
          Create Stunning Property Videos{" "}
          <span className="text-[#21ABB5]">Instantly</span> with AI
        </h1>

        <p className="text-lg text-[#606060] max-w-2xl mx-auto mb-8 leading-relaxed">
          Create videos 100× faster from just photos. Built for South African estate agents, photographers, and property media companies.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
          <Link to="/register">
            <Button className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold px-8 h-12 rounded-xl text-base gap-2">
              Get started free <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Button variant="outline" className="h-12 rounded-xl text-base gap-2 border-gray-200 px-8">
            <Play className="w-4 h-4 fill-[#21ABB5] text-[#21ABB5]" /> Watch demo
          </Button>
        </div>

        <p className="text-xs text-[#606060] mb-10">No credit card required</p>

        <div className="flex flex-wrap items-center justify-center gap-6 mb-12">
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <span className="text-sm text-[#606060]">4.9 on Trustpilot</span>
          <span className="text-sm text-[#606060]">•</span>
          <span className="text-sm font-semibold text-[#0F082B]">150,000+ videos created</span>
        </div>

        {/* Before/After Slider */}
        <div
          ref={sliderRef}
          className="relative max-w-3xl mx-auto rounded-2xl overflow-hidden border border-gray-200 shadow-lg mb-10 cursor-col-resize select-none"
          style={{ aspectRatio: "16/9" }}
          onMouseMove={(e) => handleMove(e.clientX)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX)}
          onMouseUp={() => (dragging.current = false)}
          onTouchEnd={() => (dragging.current = false)}
          onMouseLeave={() => (dragging.current = false)}
        >
          {/* "After" - full background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#21ABB5]/10 via-[#DEF5F7] to-white flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#21ABB5] mx-auto mb-3 flex items-center justify-center">
                <Play className="w-8 h-8 text-white fill-white" />
              </div>
              <p className="text-sm font-semibold text-[#0F082B]">Cinematic AI Video</p>
              <p className="text-xs text-[#606060]">After — Polished reel</p>
            </div>
          </div>

          {/* "Before" - clipped left */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-gray-200 via-gray-100 to-gray-50 flex items-center justify-center"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-300 mx-auto mb-3 flex items-center justify-center">
                <div className="w-8 h-6 bg-gray-400 rounded" />
              </div>
              <p className="text-sm font-semibold text-[#0F082B]">Raw Listing Photo</p>
              <p className="text-xs text-[#606060]">Before — Static image</p>
            </div>
          </div>

          {/* Slider handle */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white shadow-lg z-10"
            style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
            onMouseDown={() => (dragging.current = true)}
            onTouchStart={() => (dragging.current = true)}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 bg-white rounded-full shadow-lg border-2 border-[#21ABB5] flex items-center justify-center">
              <GripVertical className="w-4 h-4 text-[#21ABB5]" />
            </div>
          </div>

          {/* Labels */}
          <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-md">Before</div>
          <div className="absolute top-3 right-3 bg-[#21ABB5] text-white text-[10px] font-semibold px-2 py-1 rounded-md">After</div>
        </div>
      </div>

      {/* Scrolling preview strip */}
      <div className="relative overflow-hidden py-4">
        <div className="animate-scroll-left flex gap-4 items-end" style={{ width: "max-content" }}>
          {[...previewCards, ...previewCards].map((c, i) => (
            <div
              key={i}
              className={`${c.w} ${c.h} rounded-xl bg-gradient-to-br ${c.bg} border border-gray-100 flex-shrink-0 flex flex-col items-center justify-end p-3`}
            >
              <span className="text-[10px] font-medium text-[#606060] text-center">{c.label}</span>
              <span className="text-[8px] text-gray-400">{c.aspect}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}