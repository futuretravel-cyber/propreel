import React, { useState } from "react";
import { Download, Video, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// 11 SA Property Templates × 2 orientations = 22 downloadable JSON files
const SA_TEMPLATES = [
  {
    id: "luxury_home",
    name: "Luxury Home",
    description: "Cinematic dark-gold style for high-end luxury residential properties. Serif elegance, gold accents, dramatic overlays.",
    tags: ["Luxury", "High-end", "Upmarket"],
    preview_color: "#1a0a2e",
    accent: "#c9a84c",
    font: "Playfair Display",
    overlay_opacity: 0.55,
    badge_label: "LUXURY LIVING",
  },
  {
    id: "family_home",
    name: "Family Home",
    description: "Warm and welcoming style for suburban family residential properties. Soft blues, greens, approachable feel.",
    tags: ["Residential", "Family", "Suburbs"],
    preview_color: "#1e3a5f",
    accent: "#4CAF50",
    font: "Montserrat",
    overlay_opacity: 0.45,
    badge_label: "FAMILY HOME",
  },
  {
    id: "security_estate",
    name: "Security Estate",
    description: "Bold, trustworthy style for gated and security estates. Deep navy, blue accents, authoritative typography.",
    tags: ["Estate", "Security", "Gated"],
    preview_color: "#0f2940",
    accent: "#2196F3",
    font: "Montserrat",
    overlay_opacity: 0.5,
    badge_label: "SECURITY ESTATE",
  },
  {
    id: "coastal_lifestyle",
    name: "Coastal Lifestyle",
    description: "Fresh ocean-inspired style for beachfront, coastal and waterfront homes. Light blues, airy feel.",
    tags: ["Coastal", "Beach", "Waterfront"],
    preview_color: "#0d4f6e",
    accent: "#00b4d8",
    font: "Montserrat",
    overlay_opacity: 0.4,
    badge_label: "COASTAL LIVING",
  },
  {
    id: "modern_minimal",
    name: "Modern Minimal",
    description: "Sleek, minimal style for contemporary homes and city apartments. Dark background, teal accents, clean type.",
    tags: ["Modern", "Minimal", "Contemporary"],
    preview_color: "#1a1a2e",
    accent: "#21ABB5",
    font: "Montserrat",
    overlay_opacity: 0.45,
    badge_label: "MODERN LIVING",
  },
  {
    id: "farm",
    name: "Farm",
    description: "Earthy, natural aesthetic for farms, smallholdings, and agricultural properties.",
    tags: ["Farm", "Rural", "Agricultural"],
    preview_color: "#2d4a1e",
    accent: "#8bc34a",
    font: "Montserrat",
    overlay_opacity: 0.45,
    badge_label: "FARM & LIFESTYLE",
  },
  {
    id: "commercial",
    name: "Commercial",
    description: "Professional, corporate style for commercial properties, offices and industrial spaces.",
    tags: ["Commercial", "Office", "Business"],
    preview_color: "#0f2940",
    accent: "#607D8B",
    font: "Montserrat",
    overlay_opacity: 0.5,
    badge_label: "COMMERCIAL PROPERTY",
  },
  {
    id: "new_dev",
    name: "New Dev",
    description: "Bold and exciting launch style for off-plan and new development projects.",
    tags: ["New Dev", "Off-plan", "Launch"],
    preview_color: "#b71c1c",
    accent: "#ff5722",
    font: "Montserrat",
    overlay_opacity: 0.5,
    badge_label: "NEW DEVELOPMENT",
  },
  {
    id: "just_listed",
    name: "Just Listed",
    description: "High-energy just-listed alert style. Strong red banner, bold typography, urgency-driven.",
    tags: ["Just Listed", "New", "Alert"],
    preview_color: "#7f0000",
    accent: "#ff1744",
    font: "Montserrat",
    overlay_opacity: 0.5,
    badge_label: "JUST LISTED",
  },
  {
    id: "investment",
    name: "Investment",
    description: "Clean, data-focused style highlighting yield and investment value for buy-to-let and commercial.",
    tags: ["Investment", "Rental", "Yield"],
    preview_color: "#1b1b2f",
    accent: "#9c27b0",
    font: "Montserrat",
    overlay_opacity: 0.5,
    badge_label: "INVESTMENT PROPERTY",
  },
  {
    id: "modern_apartment",
    name: "Modern Apartment",
    description: "Urban, sleek style for city apartments, penthouses, and lock-up-and-go lifestyle properties.",
    tags: ["Apartment", "City", "Urban"],
    preview_color: "#212121",
    accent: "#E91E63",
    font: "Montserrat",
    overlay_opacity: 0.45,
    badge_label: "CITY APARTMENT",
  },
];

// Full Ken Burns preset library — 9 directions, used per photo index
const KB_PRESETS = [
  { sx: 1.0, sy: 1.0, ex: 1.35, ey: 1.35, px: [0, 0],   py: [0, 0]   }, // zoom in centre
  { sx: 1.1, sy: 1.1, ex: 1.4,  ey: 1.4,  px: [-6, 6],  py: [2, -2]  }, // pan left→right
  { sx: 1.1, sy: 1.1, ex: 1.4,  ey: 1.4,  px: [6, -6],  py: [-2, 2]  }, // pan right→left
  { sx: 1.1, sy: 1.1, ex: 1.38, ey: 1.38, px: [0, 0],   py: [8, -8]  }, // pan up
  { sx: 1.1, sy: 1.1, ex: 1.38, ey: 1.38, px: [0, 0],   py: [-8, 8]  }, // pan down
  { sx: 1.45,sy: 1.45,ex: 1.0,  ey: 1.0,  px: [0, 0],   py: [0, 0]   }, // zoom out
  { sx: 1.05,sy: 1.05,ex: 1.35, ey: 1.35, px: [-5, 5],  py: [-5, 5]  }, // diagonal TL→BR
  { sx: 1.05,sy: 1.05,ex: 1.35, ey: 1.35, px: [5, -5],  py: [5, -5]  }, // diagonal TR→BL
  { sx: 1.0, sy: 1.0, ex: 1.42, ey: 1.42, px: [-4, 4],  py: [3, -3]  }, // slow drift
];

function kbAnimation(i, duration) {
  const p = KB_PRESETS[i % KB_PRESETS.length];
  return {
    time: "start",
    duration,
    easing: "linear",
    type: "scale",
    scope: "element",
    scale_x: { from: p.sx, to: p.ex },
    scale_y: { from: p.sy, to: p.ey },
    x: { from: `${p.px[0]}%`, to: `${p.px[1]}%` },
    y: { from: `${p.py[0]}%`, to: `${p.py[1]}%` },
  };
}

const SAMPLE_PHOTOS = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1920",
  "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1920",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1920",
  "https://images.unsplash.com/photo-1600573472550-8090b5e0745e?w=1920",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1920",
  "https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=1920",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920",
];

function buildTemplate(template, orientation, photos = []) {
  const isPortrait = orientation === "portrait";
  const w = isPortrait ? 1080 : 1920;
  const h = isPortrait ? 1920 : 1080;
  const clipDur = 4.5;   // seconds per photo
  const introDur = 5.5;  // intro overlay duration
  const outroDur = 6.0;  // outro card duration
  const usedPhotos = (photos.length ? photos : SAMPLE_PHOTOS).slice(0, 10);
  const photosEnd = usedPhotos.length * clipDur;
  const totalDur = photosEnd + outroDur;

  const fontHeading = template.font || "Montserrat";

  /* ── PHOTO SLIDESHOW WITH FULL KEN BURNS ── */
  const photoElements = usedPhotos.map((url, i) => ({
    type: "image",
    source: url,
    time: i * clipDur,
    duration: clipDur + 0.6, // slight overlap for cross-fade
    width: "100%",
    height: "100%",
    x: "50%",
    y: "50%",
    x_anchor: "50%",
    y_anchor: "50%",
    fit: "cover",
    animations: [kbAnimation(i, clipDur + 0.6)],
    transitions: i > 0 ? [{ type: "fade", duration: 0.6 }] : [],
  }));

  /* ── PERSISTENT DARK OVERLAY ── */
  const overlay = {
    type: "shape",
    shape: "rectangle",
    fill_color: template.preview_color,
    opacity: template.overlay_opacity,
    time: 0,
    duration: photosEnd,
    width: "100%",
    height: "100%",
    x: "50%",
    y: "50%",
    x_anchor: "50%",
    y_anchor: "50%",
  };

  /* ── BOTTOM GRADIENT (intro text readability) ── */
  const bottomGrad = {
    type: "shape",
    shape: "rectangle",
    fill_color: `linear-gradient(to top, ${template.preview_color}ee 0%, transparent 100%)`,
    time: 0,
    duration: introDur,
    width: "100%",
    height: "45%",
    x: "50%",
    y: "100%",
    y_anchor: "100%",
    x_anchor: "50%",
  };

  /* ── INTRO: BADGE LABEL ── */
  const introBadge = {
    type: "text",
    text: template.badge_label,
    time: 0.2,
    duration: introDur - 0.2,
    font_family: "Montserrat",
    font_weight: "700",
    font_size: isPortrait ? 30 : 22,
    fill_color: "#ffffff",
    background_color: template.accent,
    background_x_padding: "18px",
    background_y_padding: "9px",
    background_border_radius: "4px",
    x: "6%",
    y: isPortrait ? "6%" : "7%",
    x_anchor: "0%",
    y_anchor: "0%",
    animations: [
      { time: "start", duration: 0.5, type: "fade", easing: "ease-out" },
      { time: "end", duration: 0.4, type: "fade", easing: "ease-in" },
    ],
  };

  /* ── INTRO: ACCENT BAR ── */
  const introBar = {
    type: "shape",
    shape: "rectangle",
    fill_color: template.accent,
    time: 0,
    duration: introDur,
    width: 5,
    height: isPortrait ? 200 : 140,
    x: "3%",
    y: isPortrait ? "79%" : "76%",
    x_anchor: "0%",
    y_anchor: "0%",
    animations: [
      { time: "start", duration: 0.4, type: "slide", direction: "up", easing: "ease-out" },
    ],
  };

  /* ── INTRO: HEADING ── */
  const introHeading = {
    type: "text",
    text: "{{heading}}",
    time: 0,
    duration: introDur,
    font_family: fontHeading,
    font_weight: "800",
    font_size: isPortrait ? 76 : 58,
    fill_color: "#ffffff",
    x: "7%",
    y: isPortrait ? "80%" : "77%",
    x_anchor: "0%",
    y_anchor: "0%",
    width: "87%",
    line_height: 1.15,
    animations: [
      { time: "start", duration: 0.6, type: "slide", direction: "up", easing: "ease-out" },
      { time: "end", duration: 0.5, type: "fade", easing: "ease-in" },
    ],
  };

  /* ── INTRO: SUBHEADING ── */
  const introSub = {
    type: "text",
    text: "{{subheading}}",
    time: 0.2,
    duration: introDur - 0.2,
    font_family: "Montserrat",
    font_weight: "400",
    font_size: isPortrait ? 42 : 32,
    fill_color: "rgba(255,255,255,0.85)",
    x: "7%",
    y: isPortrait ? "90%" : "89%",
    x_anchor: "0%",
    y_anchor: "0%",
    width: "87%",
    animations: [
      { time: "start", duration: 0.6, delay: 0.25, type: "slide", direction: "up", easing: "ease-out" },
      { time: "end", duration: 0.5, type: "fade", easing: "ease-in" },
    ],
  };

  /* ── WATERMARK LOGO (persistent) ── */
  const watermark = {
    type: "image",
    source: "{{logo_url}}",
    time: 0,
    duration: photosEnd,
    width: isPortrait ? 220 : 190,
    height: isPortrait ? 88 : 72,
    x: isPortrait ? "93%" : "94%",
    y: "4%",
    x_anchor: "100%",
    y_anchor: "0%",
    fit: "contain",
    opacity: 0.88,
  };

  /* ── MID-VIDEO FEATURE CALLOUTS ── */
  const midFeature1 = {
    type: "text",
    text: "{{feature_1}}",
    time: clipDur * 2 + 0.5,
    duration: clipDur - 0.5,
    font_family: "Montserrat",
    font_weight: "600",
    font_size: isPortrait ? 54 : 42,
    fill_color: "#ffffff",
    x: "50%",
    y: "86%",
    x_anchor: "50%",
    y_anchor: "0%",
    animations: [
      { time: "start", duration: 0.5, type: "fade", easing: "ease-out" },
      { time: "end", duration: 0.4, type: "fade", easing: "ease-in" },
    ],
  };

  const midFeature2 = {
    type: "text",
    text: "{{feature_2}}",
    time: clipDur * 4 + 0.5,
    duration: clipDur - 0.5,
    font_family: "Montserrat",
    font_weight: "600",
    font_size: isPortrait ? 54 : 42,
    fill_color: template.accent,
    x: "50%",
    y: "86%",
    x_anchor: "50%",
    y_anchor: "0%",
    animations: [
      { time: "start", duration: 0.5, type: "fade", easing: "ease-out" },
      { time: "end", duration: 0.4, type: "fade", easing: "ease-in" },
    ],
  };

  /* ── OUTRO: FULL DARK BACKGROUND ── */
  const outroBg = {
    type: "shape",
    shape: "rectangle",
    fill_color: template.preview_color,
    time: photosEnd,
    duration: outroDur,
    width: "100%",
    height: "100%",
    x: "50%",
    y: "50%",
    x_anchor: "50%",
    y_anchor: "50%",
    opacity: 0.95,
    animations: [
      { time: "start", duration: 0.5, type: "fade", easing: "ease-in" },
    ],
  };

  /* ── OUTRO: ACCENT LINE ── */
  const outroLine = {
    type: "shape",
    shape: "rectangle",
    fill_color: template.accent,
    time: photosEnd + 0.3,
    duration: outroDur - 0.3,
    width: isPortrait ? 120 : 90,
    height: 3,
    x: "50%",
    y: isPortrait ? "39%" : "37%",
    x_anchor: "50%",
    y_anchor: "0%",
    animations: [
      { time: "start", duration: 0.6, type: "wipe", direction: "right", easing: "ease-out" },
    ],
  };

  /* ── OUTRO: AGENT PROFILE PHOTO ── */
  const outroPhoto = {
    type: "image",
    source: "{{agent_photo_url}}",
    time: photosEnd,
    duration: outroDur,
    width: isPortrait ? 180 : 150,
    height: isPortrait ? 180 : 150,
    x: "50%",
    y: isPortrait ? "20%" : "18%",
    x_anchor: "50%",
    y_anchor: "0%",
    fit: "cover",
    border_radius: "50%",
    animations: [
      { time: "start", duration: 0.6, delay: 0.2, type: "scale", scale_x: { from: 0.6, to: 1.0 }, scale_y: { from: 0.6, to: 1.0 }, easing: "ease-out" },
    ],
  };

  /* ── OUTRO: AGENT NAME ── */
  const outroName = {
    type: "text",
    text: "{{agent_name}}",
    time: photosEnd + 0.4,
    duration: outroDur - 0.4,
    font_family: fontHeading,
    font_weight: "700",
    font_size: isPortrait ? 64 : 50,
    fill_color: "#ffffff",
    x: "50%",
    y: isPortrait ? "48%" : "47%",
    x_anchor: "50%",
    y_anchor: "0%",
    animations: [
      { time: "start", duration: 0.5, type: "slide", direction: "up", easing: "ease-out" },
    ],
  };

  /* ── OUTRO: PHONE ── */
  const outroPhone = {
    type: "text",
    text: "{{agent_phone}}",
    time: photosEnd + 0.6,
    duration: outroDur - 0.6,
    font_family: "Montserrat",
    font_weight: "400",
    font_size: isPortrait ? 44 : 36,
    fill_color: template.accent,
    x: "50%",
    y: isPortrait ? "59%" : "60%",
    x_anchor: "50%",
    y_anchor: "0%",
    animations: [
      { time: "start", duration: 0.5, delay: 0.15, type: "slide", direction: "up", easing: "ease-out" },
    ],
  };

  /* ── OUTRO: EMAIL ── */
  const outroEmail = {
    type: "text",
    text: "{{agent_email}}",
    time: photosEnd + 0.8,
    duration: outroDur - 0.8,
    font_family: "Montserrat",
    font_weight: "300",
    font_size: isPortrait ? 34 : 28,
    fill_color: "rgba(255,255,255,0.72)",
    x: "50%",
    y: isPortrait ? "66%" : "67%",
    x_anchor: "50%",
    y_anchor: "0%",
    animations: [
      { time: "start", duration: 0.5, delay: 0.3, type: "slide", direction: "up", easing: "ease-out" },
    ],
  };

  /* ── OUTRO: AGENCY LOGO ── */
  const outroLogo = {
    type: "image",
    source: "{{logo_url}}",
    time: photosEnd + 0.5,
    duration: outroDur - 0.5,
    width: isPortrait ? 300 : 260,
    height: isPortrait ? 110 : 90,
    x: "50%",
    y: isPortrait ? "75%" : "77%",
    x_anchor: "50%",
    y_anchor: "0%",
    fit: "contain",
    animations: [
      { time: "start", duration: 0.6, delay: 0.4, type: "fade", easing: "ease-out" },
    ],
  };

  /* ── AUDIO: VOICEOVER (full video length) ── */
  const voiceover = {
    type: "audio",
    source: "{{voiceover_url}}",
    time: 0,
    duration: totalDur,
    volume: 1.0,
  };

  /* ── AUDIO: BACKGROUND MUSIC (ducked, looped) ── */
  const music = {
    type: "audio",
    source: "{{music_url}}",
    time: 0,
    duration: totalDur,
    volume: 0.14,
    loop: true,
  };

  return {
    output_format: "mp4",
    width: w,
    height: h,
    duration: totalDur,
    frame_rate: 25,
    elements: [
      ...photoElements,
      overlay,
      bottomGrad,
      introBadge,
      introBar,
      introHeading,
      introSub,
      watermark,
      midFeature1,
      midFeature2,
      outroBg,
      outroLine,
      outroPhoto,
      outroName,
      outroPhone,
      outroEmail,
      outroLogo,
      voiceover,
      music,
    ],
    // Replaceable variable tokens — fill these via the Creatomate API or template editor
    variables: {
      heading: "4 Bedroom Home in Sandton",
      subheading: "Sandton, Johannesburg · 4 Bed · 3 Bath · 2 Garage",
      feature_1: "4 Beds · 3 Baths · 2 Garages",
      feature_2: "Heated Pool · Solar · Borehole",
      agent_name: "Agent Full Name",
      agent_phone: "+27 82 000 0000",
      agent_email: "agent@agencyname.co.za",
      agent_photo_url: "https://your-cdn.com/agent-photo.jpg",
      logo_url: "https://your-cdn.com/agency-logo.png",
      voiceover_url: "https://your-cdn.com/voiceover.mp3",
      music_url: "https://your-cdn.com/background-music.mp3",
    },
    // Template metadata
    _template_meta: {
      id: template.id,
      name: template.name,
      orientation,
      description: template.description,
      accent_color: template.accent,
      background_color: template.preview_color,
      clip_count: usedPhotos.length,
      total_duration_seconds: totalDur,
      generated_by: "PropReel",
      version: "2.0",
    },
  };
}

export default function CreatomateTemplates({ project, brandKit, voiceoverUrl, musicUrl }) {
  const [expandedTemplate, setExpandedTemplate] = useState(null);
  const [downloaded, setDownloaded] = useState({});

  const photos = project?.selected_photo_ids?.length
    ? project.selected_photo_ids
    : project?.photos || [];

  const doDownload = (template, orientation) => {
    const json = buildTemplate(template, orientation, photos);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `propreel-${template.id}-${orientation}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(d => ({ ...d, [`${template.id}-${orientation}`]: true }));
  };

  const downloadAll = () => {
    SA_TEMPLATES.forEach((t, i) => {
      setTimeout(() => {
        doDownload(t, "landscape");
        setTimeout(() => doDownload(t, "portrait"), 300);
      }, i * 600);
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-100 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-6 h-6 bg-purple-700 rounded-lg flex items-center justify-center">
            <Video className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-bold text-gray-900">Creatomate JSON Templates</span>
        </div>
        <p className="text-[10px] text-gray-500 mb-2">
          11 professional property video templates × landscape + portrait = <strong>22 downloadable JSON files</strong>. Each includes full Ken Burns effects, animated intro/outro, agent branding, music and AI voiceover pre-wired.
        </p>
        <a href="https://creatomate.com" target="_blank" rel="noreferrer"
          className="text-[10px] text-purple-700 flex items-center gap-1 hover:underline">
          creatomate.com — render from $49/mo <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* How to use */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
        <p className="text-[10px] font-bold text-amber-900 mb-1.5">How to use these templates:</p>
        <ol className="text-[10px] text-amber-800 space-y-1 list-decimal list-inside">
          <li>Download a template JSON (landscape or portrait)</li>
          <li>Creatomate → Templates → <strong>Import JSON</strong></li>
          <li>Replace <code className="bg-amber-100 px-1 rounded">{"{{variables}}"}</code> in the Creatomate editor or via API</li>
          <li>Render via API or Creatomate dashboard — PropReel auto-saves the result via webhook</li>
        </ol>
      </div>

      {/* Download all */}
      <Button onClick={downloadAll} variant="outline"
        className="w-full rounded-xl gap-2 text-xs border-purple-700 text-purple-700 hover:bg-purple-50 font-semibold">
        <Download className="w-3.5 h-3.5" /> Download All 22 Templates (11 × Landscape + Portrait)
      </Button>

      {/* Individual templates */}
      <div className="space-y-2">
        {SA_TEMPLATES.map(template => (
          <div key={template.id} className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center relative overflow-hidden"
                style={{ backgroundColor: template.preview_color }}>
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: template.accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900">{template.name}</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {template.tags.map(tag => (
                    <span key={tag} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {downloaded[`${template.id}-landscape`] && downloaded[`${template.id}-portrait`] && (
                  <span className="text-[9px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-full">✓ Both</span>
                )}
                {expandedTemplate === template.id
                  ? <ChevronUp className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {expandedTemplate === template.id && (
              <div className="border-t border-gray-100 p-3 space-y-3 bg-gray-50">
                <p className="text-[10px] text-gray-500">{template.description}</p>

                <div className="grid grid-cols-2 gap-1.5 text-[10px] text-gray-600">
                  <div className="flex items-center gap-1">✦ Full Ken Burns (9 presets)</div>
                  <div className="flex items-center gap-1">✦ Animated intro + outro</div>
                  <div className="flex items-center gap-1">✦ Heading + Subheading</div>
                  <div className="flex items-center gap-1">✦ Mid-video feature callouts</div>
                  <div className="flex items-center gap-1">✦ Agent photo + name + phone</div>
                  <div className="flex items-center gap-1">✦ Agency logo watermark</div>
                  <div className="flex items-center gap-1">✦ AI Voiceover (full length)</div>
                  <div className="flex items-center gap-1">✦ Music track (ducked)</div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={() => doDownload(template, "landscape")}
                    className={`flex-1 rounded-lg gap-1.5 text-xs ${downloaded[`${template.id}-landscape`] ? "bg-emerald-600 hover:bg-emerald-700" : "bg-purple-700 hover:bg-purple-800"} text-white`}>
                    <Download className="w-3 h-3" />
                    {downloaded[`${template.id}-landscape`] ? "✓ Landscape" : "16:9 Landscape"}
                  </Button>
                  <Button size="sm" onClick={() => doDownload(template, "portrait")}
                    className={`flex-1 rounded-lg gap-1.5 text-xs ${downloaded[`${template.id}-portrait`] ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-900 hover:bg-gray-800"} text-white`}>
                    <Download className="w-3 h-3" />
                    {downloaded[`${template.id}-portrait`] ? "✓ Portrait" : "9:16 Portrait"}
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