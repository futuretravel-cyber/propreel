import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Play, ArrowRight, GripVertical, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";

const HERO_VIDEO = "https://media.base44.com/videos/public/6a3d034ac0fe750276476665/58d86fd5e_generated_video.mp4";

const PROPERTY_IMAGES = {
  clifton: "https://media.base44.com/images/public/6a3d034ac0fe750276476665/440304db6_generated_image.png",
  sandton: "https://media.base44.com/images/public/6a3d034ac0fe750276476665/f97b84cb9_generated_image.png",
  interior: "https://media.base44.com/images/public/6a3d034ac0fe750276476665/912441b3b_generated_image.png",
  hermanus: "https://media.base44.com/images/public/6a3d034ac0fe750276476665/27ab3c7c7_generated_image.png",
  franschhoek: "https://media.base44.com/images/public/6a3d034ac0fe750276476665/97187bdcc_generated_image.png",
  campsbay: "https://media.base44.com/images/public/6a3d034ac0fe750276476665/a75998de2_generated_image.png",
};

const previewCards = [
  { w: "w-48", h: "h-28", label: "Clifton, Cape Town", aspect: "16:9", img: PROPERTY_IMAGES.clifton },
  { w: "w-32", h: "h-52", label: "Cape Town Interior", aspect: "9:16", img: PROPERTY_IMAGES.interior },
  { w: "w-48", h: "h-28", label: "Sandton, JHB", aspect: "16:9", img: PROPERTY_IMAGES.sandton },
  { w: "w-32", h: "h-52", label: "Camps Bay", aspect: "9:16", img: PROPERTY_IMAGES.campsbay },
  { w: "w-48", h: "h-28", label: "Hermanus Coast", aspect: "16:9", img: PROPERTY_IMAGES.hermanus },
  { w: "w-32", h: "h-52", label: "Franschhoek Estate", aspect: "9:16", img: PROPERTY_IMAGES.franschhoek },
  { w: "w-48", h: "h-28", label: "Clifton, Cape Town", aspect: "16:9", img: PROPERTY_IMAGES.clifton },
  { w: "w-32", h: "h-52", label: "Sandton, JHB", aspect: "9:16", img: PROPERTY_IMAGES.sandton },
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
        <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 text-xs font-semibold px-4 py-2 rounded-full mb-6">
          SOUTH AFRICAN REAL ESTATE AI PLATFORM
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#0F082B] leading-tight mb-5 tracking-tight">
          Create Stunning Property Videos{" "}
          <span className="text-purple-700">Instantly</span> with AI
        </h1>

        <p className="text-lg text-[#606060] max-w-2xl mx-auto mb-8 leading-relaxed">
          Create videos 100× faster from just photos. Built for South African estate agents, photographers, and property media companies.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Link to="/register">
            <Button className="bg-purple-700 hover:bg-purple-800 text-white font-semibold px-8 h-12 rounded-xl text-base gap-2">
              Get started free <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-sm text-[#606060]">
            <Gift className="w-4 h-4 text-emerald-500" />
            <span>Get <span className="font-bold text-emerald-600">5 free credits</span> when you sign up — no card required</span>
          </div>
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
          {/* "After" - cinematic video */}
          <div className="absolute inset-0 bg-black">
            <video
              src={HERO_VIDEO}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute bottom-4 right-4 bg-purple-700 text-white text-xs font-semibold px-3 py-1 rounded-lg flex items-center gap-1.5">
              <Play className="w-3 h-3 fill-white" /> AI Video
            </div>
          </div>

          {/* "Before" - raw listing photo, clipped left */}
          <div
            className="absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            <img src={PROPERTY_IMAGES.clifton} alt="Before" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-br from-gray-900/20 to-transparent" />
            <div className="absolute bottom-4 left-4 bg-black/60 text-white text-xs font-semibold px-3 py-1 rounded-lg">
              Raw Photo
            </div>
          </div>

          {/* Slider handle */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white shadow-lg z-10"
            style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
            onMouseDown={() => (dragging.current = true)}
            onTouchStart={() => (dragging.current = true)}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 bg-white rounded-full shadow-lg border-2 border-purple-700 flex items-center justify-center">
            <GripVertical className="w-4 h-4 text-purple-700" />
            </div>
          </div>

          {/* Labels */}
          <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] font-semibold px-2 py-1 rounded-md z-20">Before</div>
          <div className="absolute top-3 right-3 bg-purple-700 text-white text-[10px] font-semibold px-2 py-1 rounded-md z-20">After</div>
        </div>
      </div>

      {/* Scrolling preview strip */}
      <div className="relative overflow-hidden py-4">
        <div className="animate-scroll-left flex gap-4 items-end" style={{ width: "max-content" }}>
          {[...previewCards, ...previewCards].map((c, i) => (
            <div
              key={i}
              className={`${c.w} ${c.h} rounded-xl overflow-hidden border border-gray-100 flex-shrink-0 relative group`}
            >
              <img src={c.img} alt={c.label} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col items-start justify-end p-2">
                <span className="text-[10px] font-semibold text-white leading-tight">{c.label}</span>
                <span className="text-[8px] text-white/60">{c.aspect}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}