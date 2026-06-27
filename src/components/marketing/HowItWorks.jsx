import React from "react";
import { Link } from "react-router-dom";
import { Upload, Sliders, Sparkles, Share2, ArrowRight, Play, Music, Type, Image } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    num: "01",
    icon: Upload,
    title: "Upload your listing photos",
    desc: "Upload from your device, or import from Property24 or Private Property with one click.",
    mock: (
      <div className="mt-4 border-2 border-dashed border-purple-200 rounded-xl p-6 bg-purple-50/30 text-center">
        <Upload className="w-8 h-8 text-purple-700 mx-auto mb-2" />
        <p className="text-xs text-[#606060]">Drag & drop photos here</p>
        <p className="text-[10px] text-gray-400 mt-1">JPG, PNG up to 25MB</p>
      </div>
    ),
  },
  {
    num: "02",
    icon: Sliders,
    title: "Customise the look and feel",
    desc: "Choose orientation, captions, music, and brand elements.",
    mock: (
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#606060] w-20">Orientation</span>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <span className="text-[10px] font-medium bg-purple-700 text-white px-3 py-1.5 rounded-md">Landscape</span>
            <span className="text-[10px] font-medium text-gray-500 px-3 py-1.5">Portrait</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Music className="w-4 h-4 text-purple-700" />
          <span className="text-xs text-[#606060]">Music</span>
          <div className="w-8 h-4 bg-purple-700 rounded-full relative"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full" /></div>
        </div>
        <div className="flex items-center gap-3">
          <Type className="w-4 h-4 text-purple-700" />
          <span className="text-xs text-[#606060]">Captions</span>
          <span className="text-[10px] bg-gray-100 px-2 py-1 rounded">Modern Bold</span>
        </div>
      </div>
    ),
  },
  {
    num: "03",
    icon: Sparkles,
    title: "Get your polished video instantly",
    desc: "AI-powered editing handles everything. No skills needed.",
    mock: (
      <div className="mt-4 bg-gray-900 rounded-xl p-4 text-center">
        <Play className="w-8 h-8 text-white mx-auto mb-2" />
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-purple-700 rounded-full" style={{ width: "72%" }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-2">Rendering... 72%</p>
      </div>
    ),
  },
  {
    num: "04",
    icon: Share2,
    title: "Add your branding",
    desc: "Add your agency logo, contact details, watermark. Share to Instagram, TikTok, WhatsApp.",
    mock: (
      <div className="mt-4 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center"><Image className="w-4 h-4 text-purple-700" /></div>
          <div>
            <p className="text-[10px] font-semibold text-[#0F082B]">Smit Properties</p>
            <p className="text-[8px] text-gray-400">+27 82 123 4567</p>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["Instagram", "TikTok", "WhatsApp", "Facebook"].map((s) => (
            <span key={s} className="text-[8px] bg-white border border-gray-200 rounded-md px-2 py-1">{s}</span>
          ))}
        </div>
      </div>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 px-4" id="features">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0F082B] mb-4">How It Works</h2>
          <p className="text-lg text-[#606060]">Four simple steps to create professional property videos</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div key={s.num} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:border-purple-200 transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold text-purple-700">{s.num}</span>
                <s.icon className="w-5 h-5 text-purple-700" />
              </div>
              <h3 className="font-bold text-[#0F082B] mb-2">{s.title}</h3>
              <p className="text-sm text-[#606060] leading-relaxed">{s.desc}</p>
              {s.mock}
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-12">
          <Link to="/register">
            <Button className="bg-purple-700 hover:bg-purple-800 text-white font-semibold px-8 h-12 rounded-xl text-base gap-2">
              Start creating free <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Button variant="outline" className="h-12 rounded-xl text-base gap-2 border-gray-200 px-8">
            <Play className="w-4 h-4 fill-purple-700 text-purple-700" /> Watch demo
          </Button>
        </div>
      </div>
    </section>
  );
}