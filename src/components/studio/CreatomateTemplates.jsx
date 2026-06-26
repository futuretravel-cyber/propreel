import React, { useState } from "react";
import { Download, Video, Check, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// 9 SA Property Templates × 2 orientations
const SA_TEMPLATES = [
  {
    id: "luxury_estate",
    name: "Luxury Estate",
    description: "High-end, cinematic style for luxury properties. Dark overlays, serif typography, gold accents.",
    tags: ["Luxury", "High-end", "Upmarket"],
    preview_color: "#1a0a2e",
    accent: "#c9a84c",
  },
  {
    id: "family_home",
    name: "Family Home",
    description: "Warm, welcoming style for family residential properties. Soft blues and greens.",
    tags: ["Residential", "Family", "Suburbs"],
    preview_color: "#1e3a5f",
    accent: "#4CAF50",
  },
  {
    id: "modern_apartment",
    name: "Modern Apartment",
    description: "Sleek, minimalist style for modern apartments and city living.",
    tags: ["Apartment", "Modern", "City"],
    preview_color: "#1a1a2e",
    accent: "#21ABB5",
  },
  {
    id: "coastal_property",
    name: "Coastal Property",
    description: "Fresh ocean-inspired style for beachfront and coastal homes.",
    tags: ["Coastal", "Beach", "Waterfront"],
    preview_color: "#0d4f6e",
    accent: "#00b4d8",
  },
  {
    id: "farm_smallholding",
    name: "Farm & Smallholding",
    description: "Earthy, natural style for farms, smallholdings, and rural properties.",
    tags: ["Farm", "Rural", "Agricultural"],
    preview_color: "#2d4a1e",
    accent: "#8bc34a",
  },
  {
    id: "commercial_office",
    name: "Commercial / Office",
    description: "Professional, corporate style for commercial properties and offices.",
    tags: ["Commercial", "Office", "Business"],
    preview_color: "#0f2940",
    accent: "#2196F3",
  },
  {
    id: "new_development",
    name: "New Development",
    description: "Bold, exciting style for off-plan and new development launches.",
    tags: ["New Dev", "Off-plan", "Launch"],
    preview_color: "#b71c1c",
    accent: "#ff5722",
  },
  {
    id: "holiday_retreat",
    name: "Holiday Retreat",
    description: "Relaxed, aspirational style for holiday homes and retreat properties.",
    tags: ["Holiday", "Retreat", "Getaway"],
    preview_color: "#3e2723",
    accent: "#ff8f00",
  },
  {
    id: "investment_rental",
    name: "Investment / Rental",
    description: "Clean, data-focused style highlighting rental yield and investment value.",
    tags: ["Investment", "Rental", "Yield"],
    preview_color: "#1b1b2f",
    accent: "#9c27b0",
  },
];

function buildCreatomateTemplate(template, orientation, photos = []) {
  const isPortrait = orientation === "portrait";
  const w = isPortrait ? 1080 : 1920;
  const h = isPortrait ? 1920 : 1080;
  const duration = 30; // 30 second video
  const photoDuration = 3;
  const samplePhotos = photos.length > 0 ? photos : [
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920",
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1920",
    "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1920",
    "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1920",
    "https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=1920",
  ];

  const photoElements = samplePhotos.slice(0, 8).map((url, i) => ({
    type: "image",
    source: url,
    time: i * photoDuration,
    duration: photoDuration,
    width: "100%",
    height: "100%",
    x: "50%",
    y: "50%",
    x_anchor: "50%",
    y_anchor: "50%",
    fit: "cover",
    animations: [
      {
        time: "start",
        duration: photoDuration,
        type: "scale",
        scope: "element",
        easing: "linear",
        scale_x: { from: 1.0, to: 1.3 },
        scale_y: { from: 1.0, to: 1.3 },
        x: { from: `${-5 + (i % 3) * 5}%`, to: `${5 - (i % 3) * 5}%` },
        y: { from: `${-3 + (i % 2) * 6}%`, to: `${3 - (i % 2) * 6}%` },
      },
    ],
    transitions: i > 0 ? [{ type: "fade", duration: 0.5 }] : [],
  }));

  return {
    output_format: "mp4",
    width: w,
    height: h,
    duration,
    frame_rate: 25,
    elements: [
      // Ken Burns photo slideshow
      ...photoElements,

      // Dark gradient overlay for text readability
      {
        type: "shape",
        shape: "rectangle",
        fill_color: template.preview_color,
        opacity: 0.4,
        width: "100%",
        height: "100%",
        x: "50%",
        y: "50%",
      },

      // Bottom gradient for text area
      {
        type: "shape",
        shape: "rectangle",
        fill_color: `linear-gradient(to top, ${template.preview_color} 0%, transparent 100%)`,
        width: "100%",
        height: "40%",
        x: "50%",
        y: "100%",
        y_anchor: "100%",
      },

      // INTRO — Property name / heading
      {
        type: "text",
        text: "{{heading}}",
        time: 0,
        duration: 5,
        font_family: "Montserrat",
        font_weight: "800",
        font_size: isPortrait ? 72 : 56,
        fill_color: "#ffffff",
        x: "6%",
        y: isPortrait ? "80%" : "78%",
        x_anchor: "0%",
        y_anchor: "0%",
        width: "88%",
        animations: [
          { time: "start", duration: 0.6, type: "slide", direction: "up", easing: "ease-out" },
          { time: "end", duration: 0.4, type: "fade", easing: "ease-in" },
        ],
      },

      // Subheading / area
      {
        type: "text",
        text: "{{subheading}}",
        time: 0,
        duration: 5,
        font_family: "Montserrat",
        font_weight: "400",
        font_size: isPortrait ? 42 : 32,
        fill_color: "rgba(255,255,255,0.8)",
        x: "6%",
        y: isPortrait ? "88%" : "88%",
        x_anchor: "0%",
        y_anchor: "0%",
        width: "88%",
        animations: [
          { time: "start", duration: 0.6, delay: 0.2, type: "slide", direction: "up", easing: "ease-out" },
          { time: "end", duration: 0.4, type: "fade", easing: "ease-in" },
        ],
      },

      // Accent bar (brand colour)
      {
        type: "shape",
        shape: "rectangle",
        fill_color: template.accent,
        time: 0,
        duration: 5,
        width: "4px",
        height: isPortrait ? 180 : 130,
        x: "3%",
        y: isPortrait ? "80%" : "78%",
        x_anchor: "0%",
        y_anchor: "0%",
        animations: [
          { time: "start", duration: 0.4, type: "slide", direction: "up", easing: "ease-out" },
        ],
      },

      // Template label badge
      {
        type: "text",
        text: template.name.toUpperCase(),
        time: 0,
        duration: 4,
        font_family: "Montserrat",
        font_weight: "700",
        font_size: isPortrait ? 28 : 22,
        fill_color: "#ffffff",
        background_color: template.accent,
        background_x_padding: "16px",
        background_y_padding: "8px",
        background_border_radius: "4px",
        x: "6%",
        y: isPortrait ? "7%" : "7%",
        x_anchor: "0%",
        y_anchor: "0%",
        animations: [
          { time: "start", duration: 0.5, type: "fade", easing: "ease-out" },
          { time: "end", duration: 0.3, type: "fade", easing: "ease-in" },
        ],
      },

      // LOGO watermark
      {
        type: "image",
        source: "{{logo_url}}",
        time: 0,
        duration,
        width: isPortrait ? 200 : 180,
        height: isPortrait ? 80 : 70,
        x: isPortrait ? "94%" : "94%",
        y: "5%",
        x_anchor: "100%",
        y_anchor: "0%",
        fit: "contain",
        opacity: 0.9,
      },

      // Mid video — feature text
      {
        type: "text",
        text: "{{feature_1}}",
        time: 6,
        duration: 4,
        font_family: "Montserrat",
        font_weight: "600",
        font_size: isPortrait ? 52 : 40,
        fill_color: "#ffffff",
        x: "50%",
        y: "85%",
        x_anchor: "50%",
        y_anchor: "0%",
        animations: [
          { time: "start", duration: 0.5, type: "fade", easing: "ease-out" },
          { time: "end", duration: 0.4, type: "fade", easing: "ease-in" },
        ],
      },

      // OUTRO — Agent card background
      {
        type: "shape",
        shape: "rectangle",
        fill_color: template.preview_color,
        time: duration - 6,
        duration: 6,
        width: "100%",
        height: "100%",
        x: "50%",
        y: "50%",
        opacity: 0.85,
      },

      // OUTRO — Agent name
      {
        type: "text",
        text: "{{agent_name}}",
        time: duration - 5.5,
        duration: 5.5,
        font_family: "Montserrat",
        font_weight: "700",
        font_size: isPortrait ? 64 : 52,
        fill_color: "#ffffff",
        x: "50%",
        y: "48%",
        x_anchor: "50%",
        y_anchor: "0%",
        animations: [
          { time: "start", duration: 0.5, type: "slide", direction: "up", easing: "ease-out" },
        ],
      },

      // OUTRO — Phone
      {
        type: "text",
        text: "{{agent_phone}}",
        time: duration - 5,
        duration: 5,
        font_family: "Montserrat",
        font_weight: "400",
        font_size: isPortrait ? 44 : 36,
        fill_color: template.accent,
        x: "50%",
        y: isPortrait ? "58%" : "60%",
        x_anchor: "50%",
        y_anchor: "0%",
        animations: [
          { time: "start", duration: 0.5, delay: 0.2, type: "slide", direction: "up", easing: "ease-out" },
        ],
      },

      // OUTRO — Agency logo
      {
        type: "image",
        source: "{{logo_url}}",
        time: duration - 5,
        duration: 5,
        width: isPortrait ? 280 : 240,
        height: isPortrait ? 100 : 80,
        x: "50%",
        y: isPortrait ? "72%" : "74%",
        x_anchor: "50%",
        y_anchor: "0%",
        fit: "contain",
        animations: [
          { time: "start", duration: 0.5, delay: 0.4, type: "fade", easing: "ease-out" },
        ],
      },

      // Voiceover audio
      {
        type: "audio",
        source: "{{voiceover_url}}",
        time: 0,
        volume: 1.0,
      },

      // Background music (ducked)
      {
        type: "audio",
        source: "{{music_url}}",
        time: 0,
        volume: 0.15,
        loop: true,
      },
    ],
    // Variable map for Creatomate API
    variables: {
      heading: "Property Address Here",
      subheading: "Suburb, City · Beds · Baths",
      feature_1: "4 Bed · 3 Bath · 2 Garage",
      agent_name: "Agent Full Name",
      agent_phone: "+27 82 000 0000",
      logo_url: "https://your-logo-url.com/logo.png",
      voiceover_url: "",
      music_url: "",
    },
  };
}

export default function CreatomateTemplates({ project, brandKit, voiceoverUrl, musicUrl }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [expandedTemplate, setExpandedTemplate] = useState(null);

  const downloadTemplate = (template, orientation) => {
    const json = buildCreatomateTemplate(template, orientation, project?.selected_photo_ids || project?.photos || []);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creatomate-${template.id}-${orientation}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    SA_TEMPLATES.forEach((template, i) => {
      setTimeout(() => {
        downloadTemplate(template, "landscape");
        setTimeout(() => downloadTemplate(template, "portrait"), 200);
      }, i * 500);
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#DEF5F7]/40 to-white border border-[#21ABB5]/20 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 bg-[#21ABB5] rounded-md flex items-center justify-center">
            <Video className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs font-semibold text-[#0F082B]">Creatomate Video Templates</span>
        </div>
        <p className="text-[10px] text-[#606060] mb-2">
          Download JSON templates to import into Creatomate for real downloadable .mp4 video rendering with Ken Burns effects.
        </p>
        <a href="https://creatomate.com" target="_blank" rel="noreferrer" className="text-[10px] text-[#21ABB5] flex items-center gap-1 hover:underline">
          Sign up at creatomate.com — from $49/mo <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* How to use */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
        <p className="text-[10px] font-semibold text-amber-800">How to use:</p>
        <ol className="text-[10px] text-amber-700 space-y-0.5 list-decimal list-inside">
          <li>Download a template JSON below</li>
          <li>Go to Creatomate → Templates → Import JSON</li>
          <li>Customise colours, fonts, and your logo</li>
          <li>Use the Creatomate API to render with your photos &amp; voiceover</li>
        </ol>
      </div>

      {/* Download all */}
      <Button onClick={downloadAll} variant="outline" className="w-full rounded-xl gap-2 text-xs border-[#21ABB5] text-[#21ABB5] hover:bg-[#DEF5F7]/30">
        <Download className="w-3.5 h-3.5" /> Download All 18 Templates (9 × Landscape + Portrait)
      </Button>

      {/* Individual templates */}
      <div className="space-y-2">
        {SA_TEMPLATES.map(template => (
          <div key={template.id} className="border border-gray-100 rounded-xl overflow-hidden">
            {/* Template header */}
            <button
              onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: template.preview_color }}>
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: template.accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#0F082B]">{template.name}</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {template.tags.map(tag => (
                    <span key={tag} className="text-[9px] bg-gray-100 text-[#606060] px-1.5 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
              {expandedTemplate === template.id
                ? <ChevronUp className="w-4 h-4 text-[#606060] flex-shrink-0" />
                : <ChevronDown className="w-4 h-4 text-[#606060] flex-shrink-0" />}
            </button>

            {/* Expanded */}
            {expandedTemplate === template.id && (
              <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50">
                <p className="text-[10px] text-[#606060]">{template.description}</p>
                <div className="text-[10px] text-[#606060] space-y-0.5">
                  <p>✓ Ken Burns zoom & pan effects on every photo</p>
                  <p>✓ Animated intro with heading & agent brand</p>
                  <p>✓ Mid-video feature callouts</p>
                  <p>✓ Outro with agent card, logo, phone</p>
                  <p>✓ Voiceover + background music layers</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => downloadTemplate(template, "landscape")}
                    className="flex-1 bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-lg gap-1 text-xs"
                  >
                    <Download className="w-3 h-3" /> Landscape
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => downloadTemplate(template, "portrait")}
                    className="flex-1 bg-[#0F082B] hover:bg-[#1a0f3d] text-white rounded-lg gap-1 text-xs"
                  >
                    <Download className="w-3 h-3" /> Portrait
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