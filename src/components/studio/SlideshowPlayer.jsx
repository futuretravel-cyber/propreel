import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AIDisclaimerBadge from "@/components/shared/AIDisclaimerBadge";

const KB_PRESETS = [
  { from: "scale(1) translate(0%, 0%)",      to: "scale(1.35) translate(0%, 0%)" },
  { from: "scale(1.1) translate(-6%, 2%)",   to: "scale(1.4) translate(6%, -2%)" },
  { from: "scale(1.1) translate(6%, -2%)",   to: "scale(1.4) translate(-6%, 2%)" },
  { from: "scale(1.1) translate(0%, 8%)",    to: "scale(1.38) translate(0%, -8%)" },
  { from: "scale(1.1) translate(0%, -8%)",   to: "scale(1.38) translate(0%, 8%)" },
  { from: "scale(1.45) translate(0%, 0%)",   to: "scale(1) translate(0%, 0%)" },
  { from: "scale(1.05) translate(-5%, -5%)", to: "scale(1.35) translate(5%, 5%)" },
  { from: "scale(1.05) translate(5%, 5%)",   to: "scale(1.35) translate(-5%, -5%)" },
  { from: "scale(1.0) translate(-4%, 3%)",   to: "scale(1.42) translate(4%, -3%)" },
];

function pickPreset(focus, index) {
  if (!focus) return KB_PRESETS[index % KB_PRESETS.length];
  const { x, y } = focus;
  if (x === "left" && y === "top")     return KB_PRESETS[1];
  if (x === "right" && y === "top")    return KB_PRESETS[2];
  if (x === "left" && y === "bottom")  return KB_PRESETS[6];
  if (x === "right" && y === "bottom") return KB_PRESETS[7];
  if (x === "left")  return KB_PRESETS[1];
  if (x === "right") return KB_PRESETS[2];
  if (y === "bottom") return KB_PRESETS[3];
  if (y === "top")    return KB_PRESETS[4];
  return index % 2 === 0 ? KB_PRESETS[0] : KB_PRESETS[5];
}

async function analyzePhotos(photoUrls) {
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `Analyze these real estate property photos. For each photo identify:
1. Primary subject position: x ("left", "center", "right"), y ("top", "center", "bottom")
2. Scene type (e.g. "kitchen", "bedroom", "exterior", "pool")
Return JSON with a "scenes" array, one entry per photo in order.`,
    file_urls: photoUrls.slice(0, 20),
    response_json_schema: {
      type: "object",
      properties: {
        scenes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              x: { type: "string" },
              y: { type: "string" },
              description: { type: "string" },
            },
          },
        },
      },
    },
  });
  return result?.scenes || photoUrls.map(() => ({ x: "center", y: "center", description: "" }));
}

export default function SlideshowPlayer({
  photos = [],
  voiceoverUrl,
  musicUrl,
  brandKit,
  introTemplate,
  outroTemplate,
  heading,
  subheading,
  orientation = "landscape",
  clipDuration = 5,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scenes, setScenes] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  const voiceRef = useRef(null);
  const musicRef = useRef(null);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const lastIndexRef = useRef(-1);

  const totalPhotos = photos.length;
  const totalDuration = totalPhotos * clipDuration;

  useEffect(() => {
    if (!photos.length) return;
    setAnalyzing(true);
    analyzePhotos(photos)
      .then(setScenes)
      .catch(() => setScenes(photos.map(() => ({ x: "center", y: "center" }))))
      .finally(() => setAnalyzing(false));
  }, [photos]);

  useEffect(() => {
    voiceRef.current?.pause();
    voiceRef.current = null;
    musicRef.current?.pause();
    musicRef.current = null;
    if (voiceoverUrl) {
      const a = new Audio(voiceoverUrl);
      a.volume = 1.0;
      a.preload = "auto";
      voiceRef.current = a;
    }
    if (musicUrl) {
      const a = new Audio(musicUrl);
      a.volume = voiceoverUrl ? 0.15 : 0.35;
      a.loop = true;
      a.preload = "auto";
      musicRef.current = a;
    }
    return () => {
      voiceRef.current?.pause();
      musicRef.current?.pause();
    };
  }, [voiceoverUrl, musicUrl]);

  useEffect(() => {
    if (voiceRef.current) voiceRef.current.muted = muted;
    if (musicRef.current) musicRef.current.muted = muted;
  }, [muted]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const stopAll = () => {
    clearInterval(intervalRef.current);
    voiceRef.current?.pause();
    musicRef.current?.pause();
    if (voiceRef.current) voiceRef.current.currentTime = 0;
    if (musicRef.current) musicRef.current.currentTime = 0;
  };

  const handlePlay = () => {
    if (playing) { setPlaying(false); stopAll(); return; }
    setPlaying(true);
    setCurrentIndex(0);
    setProgress(0);
    setAnimKey(k => k + 1);
    lastIndexRef.current = 0;
    startTimeRef.current = Date.now();
    voiceRef.current?.play().catch(() => {});
    musicRef.current?.play().catch(() => {});
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const pct = Math.min(elapsed / totalDuration, 1);
      setProgress(pct * 100);
      const idx = Math.min(Math.floor(elapsed / clipDuration), totalPhotos - 1);
      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx;
        setCurrentIndex(idx);
        setAnimKey(k => k + 1);
      }
      if (elapsed >= totalDuration) {
        clearInterval(intervalRef.current);
        setPlaying(false);
        setProgress(100);
        voiceRef.current?.pause();
        musicRef.current?.pause();
      }
    }, 80);
  };

  if (!photos.length) return null;

  const currentPhoto = photos[currentIndex];
  const currentScene = scenes?.[currentIndex];
  const preset = pickPreset(currentScene, currentIndex);
  const elapsed = (progress / 100) * totalDuration;
  const timeLabel = `${Math.floor(elapsed)}s / ${totalDuration}s`;

  const kbStyle = `@keyframes kenburns-${animKey} { 0% { transform: ${preset.from}; } 100% { transform: ${preset.to}; } }`;

  const showIntro = currentIndex === 0 && playing && introTemplate && introTemplate !== "None";
  const showOutro = currentIndex === totalPhotos - 1 && playing && outroTemplate && outroTemplate !== "None";

  const templateColors = {
    "Address Reveal": { bg: "rgba(15,8,43,0.72)", accent: "#7c3aed" },
    "Open House":     { bg: "rgba(6,78,59,0.72)",  accent: "#34d399" },
    "Just Listed":    { bg: "rgba(120,10,30,0.72)", accent: "#fb7185" },
    "Price Drop":     { bg: "rgba(120,60,0,0.72)",  accent: "#fbbf24" },
    "Luxury Feature": { bg: "rgba(26,10,46,0.72)",  accent: "#a78bfa" },
    "Simple":         { bg: "rgba(30,30,30,0.65)",  accent: "#d1d5db" },
  };
  const tc = templateColors[introTemplate] || templateColors["Address Reveal"];

  return (
    <div className="w-full">
      <style>{kbStyle}</style>
      {analyzing && (
        <div className="flex items-center gap-2 mb-2 text-xs text-purple-700 font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          AI analysing scenes for Ken Burns effect...
        </div>
      )}
      <div className={`relative bg-black rounded-2xl overflow-hidden mx-auto ${orientation === "portrait" ? "aspect-[9/16] max-w-xs" : "aspect-video w-full"}`}>
        {currentPhoto && (
          <div
            key={`kb-${animKey}`}
            className="absolute inset-0 w-full h-full"
            style={{ animation: playing ? `kenburns-${animKey} ${clipDuration}s ease-in-out forwards` : "none", transform: preset.from, willChange: "transform" }}
          >
            <img src={currentPhoto} alt="" className="w-full h-full object-cover"
              style={{ objectPosition: `${currentScene?.x === "left" ? "25%" : currentScene?.x === "right" ? "75%" : "50%"} ${currentScene?.y === "top" ? "25%" : currentScene?.y === "bottom" ? "75%" : "50%"}` }}
            />
          </div>
        )}
        {playing && <AIDisclaimerBadge />}
        {playing && brandKit?.logo_url && (
          <div className="absolute top-3 right-3 z-20 pointer-events-none">
            <img src={brandKit.logo_url} alt="" className="h-8 object-contain drop-shadow-lg" />
          </div>
        )}
        {showIntro && (
          <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-end"
            style={{ background: `linear-gradient(to top, ${tc.bg} 0%, transparent 60%)` }}>
            <div className="p-5">
              <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ backgroundColor: tc.accent, color: "#fff" }}>{introTemplate}</div>
              <p className="text-white font-extrabold text-xl leading-tight drop-shadow-lg">{heading}</p>
              {subheading && <p className="text-white/80 text-sm mt-1 drop-shadow">{subheading}</p>}
              {brandKit?.agent_name && <p className="text-white/60 text-xs mt-2">{brandKit.agent_name}</p>}
            </div>
          </div>
        )}
        {showOutro && (
          <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center" style={{ background: "rgba(0,0,0,0.72)" }}>
            {brandKit?.profile_photo_url && <img src={brandKit.profile_photo_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-white mb-3 shadow-xl" />}
            {brandKit?.logo_url && !brandKit?.profile_photo_url && <img src={brandKit.logo_url} alt="" className="h-14 object-contain mb-3" />}
            <p className="text-white font-bold text-lg">{brandKit?.agent_name || heading}</p>
            {brandKit?.phone && <p className="text-white/70 text-sm mt-1">{brandKit.phone}</p>}
            {brandKit?.email && <p className="text-white/70 text-sm">{brandKit.email}</p>}
            {brandKit?.logo_url && brandKit?.profile_photo_url && <img src={brandKit.logo_url} alt="" className="h-8 object-contain mt-4 opacity-80" />}
          </div>
        )}
        {playing && (
          <div className="absolute top-3 left-3 bg-black/50 text-white text-xs px-2 py-1 rounded-lg font-mono z-20">
            {currentIndex + 1} / {totalPhotos}
          </div>
        )}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-20">
            <button onClick={handlePlay} disabled={analyzing}
              className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl hover:bg-white transition-colors disabled:opacity-60">
              {analyzing ? <Loader2 className="w-6 h-6 text-purple-700 animate-spin" /> : <Play className="w-7 h-7 text-gray-900 fill-gray-900 ml-1" />}
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 space-y-2">
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-purple-700 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={handlePlay} disabled={analyzing}
              className="w-9 h-9 rounded-full bg-purple-700 flex items-center justify-center hover:bg-purple-800 transition-colors disabled:opacity-60">
              {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white fill-white ml-0.5" />}
            </button>
            <button onClick={() => setMuted(m => !m)}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
              {muted ? <VolumeX className="w-3.5 h-3.5 text-gray-500" /> : <Volume2 className="w-3.5 h-3.5 text-gray-500" />}
            </button>
          </div>
          <span className="text-xs text-gray-500 font-mono">{timeLabel}</span>
        </div>
        <div className="flex gap-1 overflow-x-auto py-1">
          {photos.map((url, i) => (
            <div key={i} className={`flex-shrink-0 w-10 h-10 rounded-md overflow-hidden border-2 transition-all ${i === currentIndex ? "border-purple-700" : "border-transparent opacity-50"}`}>
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}