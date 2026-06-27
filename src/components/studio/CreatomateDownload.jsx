import React, { useState } from "react";
import { Download, ExternalLink, ChevronDown, ChevronUp, CheckCircle2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

const SA_TEMPLATES = [
  { id: "luxury_estate",     name: "Luxury Estate",       tags: ["Luxury", "High-end"],       preview_color: "#1a0a2e", accent: "#c9a84c" },
  { id: "family_home",       name: "Family Home",          tags: ["Residential", "Family"],    preview_color: "#1e3a5f", accent: "#4CAF50" },
  { id: "modern_apartment",  name: "Modern Apartment",     tags: ["Apartment", "City"],        preview_color: "#1a1a2e", accent: "#7c3aed" },
  { id: "coastal_property",  name: "Coastal Property",     tags: ["Coastal", "Beach"],         preview_color: "#0d4f6e", accent: "#00b4d8" },
  { id: "farm_smallholding", name: "Farm & Smallholding",  tags: ["Farm", "Rural"],            preview_color: "#2d4a1e", accent: "#8bc34a" },
  { id: "commercial_office", name: "Commercial / Office",  tags: ["Commercial", "Office"],     preview_color: "#0f2940", accent: "#2196F3" },
  { id: "new_development",   name: "New Development",      tags: ["New Dev", "Launch"],        preview_color: "#b71c1c", accent: "#ff5722" },
  { id: "holiday_retreat",   name: "Holiday Retreat",      tags: ["Holiday", "Getaway"],       preview_color: "#3e2723", accent: "#ff8f00" },
  { id: "investment_rental", name: "Investment / Rental",  tags: ["Investment", "Yield"],      preview_color: "#1b1b2f", accent: "#9c27b0" },
];

function buildTemplate(template, orientation, photos = []) {
  const isPortrait = orientation === "portrait";
  const w = isPortrait ? 1080 : 1920;
  const h = isPortrait ? 1920 : 1080;
  const duration = 30;
  const photoDuration = 3;
  const samplePhotos = photos.length > 0 ? photos : [
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920",
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1920",
    "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1920",
    "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1920",
    "https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=1920",
  ];
  return {
    output_format: "mp4", width: w, height: h, duration, frame_rate: 25,
    elements: [
      ...samplePhotos.slice(0, 8).map((url, i) => ({
        type: "image", source: url, time: i * photoDuration, duration: photoDuration,
        width: "100%", height: "100%", x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%", fit: "cover",
        animations: [{ time: "start", duration: photoDuration, type: "scale", scope: "element", easing: "linear",
          scale_x: { from: 1.0, to: 1.3 }, scale_y: { from: 1.0, to: 1.3 },
          x: { from: `${-5 + (i % 3) * 5}%`, to: `${5 - (i % 3) * 5}%` },
          y: { from: `${-3 + (i % 2) * 6}%`, to: `${3 - (i % 2) * 6}%` } }],
        transitions: i > 0 ? [{ type: "fade", duration: 0.5 }] : [],
      })),
      { type: "shape", shape: "rectangle", fill_color: template.preview_color, opacity: 0.4, width: "100%", height: "100%", x: "50%", y: "50%" },
      { type: "text", text: "{{heading}}", time: 0, duration: 5, font_family: "Montserrat", font_weight: "800",
        font_size: isPortrait ? 72 : 56, fill_color: "#ffffff", x: "6%", y: isPortrait ? "80%" : "78%",
        x_anchor: "0%", y_anchor: "0%", width: "88%",
        animations: [{ time: "start", duration: 0.6, type: "slide", direction: "up", easing: "ease-out" }, { time: "end", duration: 0.4, type: "fade" }] },
      { type: "text", text: "{{subheading}}", time: 0, duration: 5, font_family: "Montserrat", font_weight: "400",
        font_size: isPortrait ? 42 : 32, fill_color: "rgba(255,255,255,0.8)", x: "6%", y: isPortrait ? "88%" : "88%",
        x_anchor: "0%", y_anchor: "0%", width: "88%",
        animations: [{ time: "start", duration: 0.6, delay: 0.2, type: "slide", direction: "up", easing: "ease-out" }] },
      { type: "text", text: "{{agent_name}}", time: duration - 5.5, duration: 5.5, font_family: "Montserrat",
        font_weight: "700", font_size: isPortrait ? 64 : 52, fill_color: "#ffffff",
        x: "50%", y: "48%", x_anchor: "50%", y_anchor: "0%",
        animations: [{ time: "start", duration: 0.5, type: "slide", direction: "up", easing: "ease-out" }] },
      { type: "text", text: "{{agent_phone}}", time: duration - 5, duration: 5, font_family: "Montserrat",
        font_weight: "400", font_size: isPortrait ? 44 : 36, fill_color: template.accent,
        x: "50%", y: isPortrait ? "58%" : "60%", x_anchor: "50%", y_anchor: "0%" },
      { type: "audio", source: "{{voiceover_url}}", time: 0, volume: 1.0 },
      { type: "audio", source: "{{music_url}}", time: 0, volume: 0.15, loop: true },
    ],
    variables: {
      heading: "Property Address Here", subheading: "Suburb, City · Beds · Baths",
      agent_name: "Agent Full Name", agent_phone: "+27 82 000 0000",
      logo_url: "https://your-logo-url.com/logo.png", voiceover_url: "", music_url: "",
    },
  };
}

function triggerDownload(template, orientation, photos) {
  const json = buildTemplate(template, orientation, photos);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `creatomate-${template.id}-${orientation}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CreatomateDownload({ project }) {
  const [expanded, setExpanded] = useState(null);
  const [downloaded, setDownloaded] = useState({});
  const photos = project?.selected_photo_ids?.length ? project.selected_photo_ids : project?.photos || [];

  const handleDownload = (template, orientation) => {
    triggerDownload(template, orientation, photos);
    setDownloaded(prev => ({ ...prev, [`${template.id}-${orientation}`]: true }));
  };

  const handleDownloadAll = () => {
    SA_TEMPLATES.forEach((template, i) => {
      setTimeout(() => {
        triggerDownload(template, "landscape", photos);
        setTimeout(() => triggerDownload(template, "portrait", photos), 300);
      }, i * 700);
    });
    const allDone = {};
    SA_TEMPLATES.forEach(t => { allDone[`${t.id}-landscape`] = true; allDone[`${t.id}-portrait`] = true; });
    setDownloaded(allDone);
  };

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Video className="w-4 h-4 text-purple-700" />
          <span className="text-xs font-bold text-gray-900">Creatomate Video Templates</span>
        </div>
        <p className="text-[10px] text-gray-500">Download JSON templates, import into Creatomate, and render professional .mp4 videos with your photos.</p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
        <p className="text-[10px] font-bold text-amber-900">📋 How to use</p>
        {["Download the JSON file below", "Sign up at creatomate.com", "Templates → Import → upload JSON", "Replace logo/colours, then render with your photos"].map((text, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-amber-800">{i + 1}</span>
            </div>
            <p className="text-[10px] text-amber-800 leading-relaxed">{text}</p>
          </div>
        ))}
        <a href="https://creatomate.com" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-purple-700 font-semibold hover:underline mt-1">
          Open creatomate.com <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <Button onClick={handleDownloadAll} className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 py-3 text-sm font-semibold">
        <Download className="w-4 h-4" /> Download All 18 Templates
      </Button>
      <p className="text-[10px] text-gray-400 text-center -mt-2">9 styles × Landscape + Portrait = 18 JSON files</p>
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Or download individually:</p>
        {SA_TEMPLATES.map(template => (
          <div key={template.id} className="border border-gray-100 rounded-xl overflow-hidden">
            <button onClick={() => setExpanded(expanded === template.id ? null : template.id)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors">
              <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: template.preview_color }}>
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: template.accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900">{template.name}</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {template.tags.map(tag => <span key={tag} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{tag}</span>)}
                </div>
              </div>
              {(downloaded[`${template.id}-landscape`] || downloaded[`${template.id}-portrait`]) && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
              {expanded === template.id ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
            </button>
            {expanded === template.id && (
              <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-2">
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleDownload(template, "landscape")}
                    className={`flex-1 rounded-lg gap-1 text-xs ${downloaded[`${template.id}-landscape`] ? "bg-emerald-500 hover:bg-emerald-600" : "bg-purple-700 hover:bg-purple-800"} text-white`}>
                    {downloaded[`${template.id}-landscape`] ? <><CheckCircle2 className="w-3 h-3" /> Done</> : <><Download className="w-3 h-3" /> Landscape</>}
                  </Button>
                  <Button size="sm" onClick={() => handleDownload(template, "portrait")}
                    className={`flex-1 rounded-lg gap-1 text-xs ${downloaded[`${template.id}-portrait`] ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gray-800 hover:bg-gray-900"} text-white`}>
                    {downloaded[`${template.id}-portrait`] ? <><CheckCircle2 className="w-3 h-3" /> Done</> : <><Download className="w-3 h-3" /> Portrait</>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}