import React from "react";
import { Play, Phone, Mail, MapPin } from "lucide-react";

const TEMPLATE_STYLES = {
  "Address Reveal": { bg: "from-[#0F082B] to-[#1a1040]", accent: "#21ABB5", textPos: "bottom" },
  "Open House": { bg: "from-emerald-900 to-emerald-700", accent: "#34d399", textPos: "center" },
  "Just Listed": { bg: "from-rose-900 to-rose-700", accent: "#fb7185", textPos: "bottom" },
  "Price Drop": { bg: "from-amber-800 to-amber-600", accent: "#fbbf24", textPos: "center" },
  "Luxury Feature": { bg: "from-[#1a0a2e] to-[#2d1b69]", accent: "#a78bfa", textPos: "bottom" },
  "Simple": { bg: "from-gray-800 to-gray-700", accent: "#d1d5db", textPos: "bottom" },
};

const OUTRO_STYLES = {
  "Agent Card": "agent",
  "Contact Block": "contact",
  "Agency Logo": "logo",
};

export default function BrandingPreview({ orientation, introTemplate, outroTemplate, heading, subheading, brandKit, musicTrack, previewMode = "intro" }) {
  const style = TEMPLATE_STYLES[introTemplate] || TEMPLATE_STYLES["Address Reveal"];
  const isPortrait = orientation === "portrait";

  return (
    <div className={`relative bg-gradient-to-br ${style.bg} overflow-hidden w-full h-full flex flex-col`}>
      {/* Simulated video background */}
      <div className="absolute inset-0 opacity-20">
        <div className="w-full h-full bg-gradient-to-br from-white/5 to-transparent" />
      </div>

      {/* Logo watermark top-right */}
      {brandKit?.logo_url && (
        <div className="absolute top-3 right-3 z-10">
          <img src={brandKit.logo_url} alt="Logo" className="h-6 object-contain opacity-90" />
        </div>
      )}

      {previewMode === "intro" && (
        <>
          {/* Tag */}
          {introTemplate !== "Simple" && (
            <div
              className="absolute top-3 left-3 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: style.accent, color: "#fff" }}
            >
              {introTemplate}
            </div>
          )}

          {/* Main text — bottom or center */}
          <div className={`absolute inset-x-0 px-4 ${style.textPos === "center" ? "top-1/2 -translate-y-1/2 text-center" : "bottom-4"}`}>
            <h2 className={`font-extrabold text-white leading-tight ${isPortrait ? "text-sm" : "text-xs"}`}>
              {heading || "12 Clifton Road, Cape Town"}
            </h2>
            <p className="text-white/70 mt-0.5" style={{ fontSize: "9px" }}>
              {subheading || "Beautiful family home in a prime location"}
            </p>
          </div>
        </>
      )}

      {previewMode === "outro" && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-2">
          {OUTRO_STYLES[outroTemplate] === "agent" && (
            <>
              {brandKit?.profile_photo_url ? (
                <img src={brandKit.profile_photo_url} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white/30" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg">
                  {brandKit?.agent_name?.[0] || "A"}
                </div>
              )}
              <p className="text-white font-bold text-xs text-center">{brandKit?.agent_name || "Agent Name"}</p>
              {brandKit?.phone && (
                <div className="flex items-center gap-1 text-white/70" style={{ fontSize: "9px" }}>
                  <Phone className="w-2.5 h-2.5" /> {brandKit.phone}
                </div>
              )}
              {brandKit?.email && (
                <div className="flex items-center gap-1 text-white/70" style={{ fontSize: "9px" }}>
                  <Mail className="w-2.5 h-2.5" /> {brandKit.email}
                </div>
              )}
            </>
          )}
          {OUTRO_STYLES[outroTemplate] === "contact" && (
            <>
              <p className="text-white font-bold text-xs">{brandKit?.agent_name || "Contact Us"}</p>
              <div className="space-y-1 mt-1">
                {brandKit?.phone && <div className="flex items-center gap-1 text-white/70" style={{ fontSize: "9px" }}><Phone className="w-2.5 h-2.5" /> {brandKit.phone}</div>}
                {brandKit?.email && <div className="flex items-center gap-1 text-white/70" style={{ fontSize: "9px" }}><Mail className="w-2.5 h-2.5" /> {brandKit.email}</div>}
              </div>
            </>
          )}
          {OUTRO_STYLES[outroTemplate] === "logo" && (
            <>
              {brandKit?.logo_url ? (
                <img src={brandKit.logo_url} alt="Logo" className="h-10 object-contain" />
              ) : (
                <div className="w-20 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white/50 text-xs">Logo</div>
              )}
              <p className="text-white/60" style={{ fontSize: "9px" }}>{brandKit?.agent_name || "Your Agency"}</p>
            </>
          )}
        </div>
      )}

      {previewMode === "video" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-2">
              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
            </div>
            <p className="text-white/60 text-[9px]">Property clips</p>
          </div>
        </div>
      )}

      {/* Music badge */}
      {musicTrack && (
        <div className="absolute bottom-1 right-2 flex items-center gap-1 bg-black/40 rounded px-1.5 py-0.5" style={{ fontSize: "8px" }}>
          <span className="text-white/60">♪</span>
          <span className="text-white/60 truncate max-w-[60px]">{musicTrack}</span>
        </div>
      )}
    </div>
  );
}