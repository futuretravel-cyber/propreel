import React, { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

/**
 * Ken Burns presets — each defines a CSS transform animation from → to.
 * The focus point from AI analysis biases which preset is chosen per photo.
 */
const KB_PRESETS = [
  // zoom in toward center
  { from: "scale(1) translate(0%, 0%)",    to: "scale(1.18) translate(0%, 0%)" },
  // zoom in, pan right (subject on left)
  { from: "scale(1.08) translate(-3%, 0%)", to: "scale(1.2) translate(3%, 0%)" },
  // zoom in, pan left (subject on right)
  { from: "scale(1.08) translate(3%, 0%)",  to: "scale(1.2) translate(-3%, 0%)" },
  // zoom in, pan up (subject at bottom)
  { from: "scale(1.08) translate(0%, 3%)",  to: "scale(1.2) translate(0%, -3%)" },
  // zoom in, pan down (subject at top)
  { from: "scale(1.08) translate(0%, -3%)", to: "scale(1.2) translate(0%, 3%)" },
  // slow zoom out
  { from: "scale(1.2) translate(0%, 0%)",   to: "scale(1) translate(0%, 0%)" },
  // diagonal drift
  { from: "scale(1.05) translate(-2%, -2%)", to: "scale(1.18) translate(2%, 2%)" },
  { from: "scale(1.05) translate(2%, -2%)",  to: "scale(1.18) translate(-2%, 2%)" },
];

/**
 * Map AI-detected focus position to a Ken Burns preset index.
 * focus: { x: "left"|"center"|"right", y: "top"|"center"|"bottom" }
 */
function pickPreset(focus) {
  if (!focus) return KB_PRESETS[0];
  const { x, y } = focus;
  if (x === "left")   return KB_PRESETS[1]; // pan toward left subject
  if (x === "right")  return KB_PRESETS[2]; // pan toward right subject
  if (y === "bottom") return KB_PRESETS[3]; // pan up toward bottom subject
  if (y === "top")    return KB_PRESETS[4]; // pan down toward top subject
  // alternate center presets for variety
  return KB_PRESETS[Math.floor(Math.random() * 2) === 0 ? 0 : 5];
}

/**
 * Analyze all photos with AI to get focus points and scene descriptions.
 * Returns array of { x, y, description } per photo.
 */
async function analyzePhotos(photoUrls) {
  const prompt = `Analyze these real estate property photos. For each photo, identify:
1. The primary focus point/subject position (x: "left", "center", or "right"; y: "top", "center", or "bottom")
2. A 1-sentence scene description for cinematic framing

Return a JSON array with one object per photo in order:
[{ "x": "center", "y": "center", "description": "Wide living room with fireplace" }, ...]

Photos to analyze: ${photoUrls.length} photos provided as file_urls.`;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt,
    file_urls: photoUrls.slice(0, 20), // API limit
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
  clipDuration = 3,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scenes, setScenes] = useState(null); // null = not analyzed yet
  const [analyzing, setAnalyzing] = useState(false);
  const [animKey, setAnimKey] = useState(0); // forces CSS animation restart per clip

  const voiceRef = useRef(null);
  const musicRef = useRef(null);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const lastIndexRef = useRef(-1);

  const totalPhotos = photos.length;
  const totalDuration = totalPhotos * clipDuration;

  // Analyze photos on mount
  useEffect(() => {
    if (!photos.length) return;
    setAnalyzing(true);
    analyzePhotos(photos)
      .then(setScenes)
      .catch(() => setScenes(photos.map(() => ({ x: "center", y: "center" }))))
      .finally(() => setAnalyzing(false));
  }, [photos]);

  // Setup audio — tear down old instances before creating new ones
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
      a.volume = 0.25;
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

  const stopAll = () => {
    clearInterval(intervalRef.current);
    voiceRef.current?.pause();
    musicRef.current?.pause();
    if (voiceRef.current) voiceRef.current.currentTime = 0;
    if (musicRef.current) musicRef.current.currentTime = 0;
  };

  const handlePlay = () => {
    if (playing) {
      setPlaying(false);
      stopAll();
      return;
    }
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
        setAnimKey(k => k + 1); // restart Ken Burns animation for new clip
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

  useEffect(() => () => clearInterval(intervalRef.current), []);

  if (!photos.length) return null;

  const currentPhoto = photos[currentIndex];
  const currentScene = scenes?.[currentIndex];
  const preset = pickPreset(currentScene);
  const elapsed = (progress / 100) * totalDuration;
  const timeLabel = `${Math.floor(elapsed)}s / ${totalDuration}s`;

  // Inject keyframe style for Ken Burns animation
  const kbStyle = `
    @keyframes kenburns-${animKey} {
      0%   { transform: ${preset.from}; }
      100% { transform: ${preset.to}; }
    }
  `;

  const isIntro = currentIndex === 0 && introTemplate && introTemplate !== "None";
  const isOutro = currentIndex === totalPhotos - 1 && outroTemplate && outroTemplate !== "None" && brandKit;

  return (
    <div className="w-full">
      <style>{kbStyle}</style>

      {/* Analyzing badge */}
      {analyzing && (
        <div className="flex items-center gap-2 mb-2 text-xs text-[#21ABB5] font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          AI analyzing scenes for Ken Burns effect...
        </div>
      )}

      {/* Viewer */}
      <div
        className={`relative bg-black rounded-2xl overflow-hidden mx-auto ${orientation === "portrait" ? "aspect-[9/16] max-w-xs" : "aspect-video w-full"}`}
      >
        {/* Ken Burns photo */}
        {currentPhoto && (
          <div
            key={`kb-${animKey}`}
            className="absolute inset-0 w-full h-full"
            style={{
              animation: playing
                ? `kenburns-${animKey} ${clipDuration}s ease-in-out forwards`
                : "none",
              transform: preset.from,
            }}
          >
            <img
              src={currentPhoto}
              alt=""
              className="w-full h-full object-cover"
              style={{
                // Smart crop: use object-position based on AI focus point
                objectPosition: `${currentScene?.x === "left" ? "25%" : currentScene?.x === "right" ? "75%" : "50%"} ${currentScene?.y === "top" ? "25%" : currentScene?.y === "bottom" ? "75%" : "50%"}`,
              }}
            />
          </div>
        )}

        {/* Scene description overlay (subtle, bottom-left during playback) */}
        {playing && currentScene?.description && !isIntro && !isOutro && (
          <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
            <p className="text-white/50 text-[10px] drop-shadow">{currentScene.description}</p>
          </div>
        )}

        {/* Intro branding overlay */}
        {isIntro && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20 flex flex-col justify-end p-6 pointer-events-none">
            {heading && <p className="text-white font-bold text-xl drop-shadow-lg leading-tight">{heading}</p>}
            {subheading && <p className="text-white/80 text-sm mt-1 drop-shadow">{subheading}</p>}
            <p className="text-white/50 text-[10px] mt-2 uppercase tracking-widest">{introTemplate}</p>
          </div>
        )}

        {/* Outro branding overlay */}
        {isOutro && (
          <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
            {brandKit.profile_photo_url && (
              <img src={brandKit.profile_photo_url} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-white mb-3" />
            )}
            {brandKit.logo_url && (
              <img src={brandKit.logo_url} alt="" className="h-10 object-contain mb-3" />
            )}
            <p className="text-white font-bold text-lg">{brandKit.agent_name}</p>
            {brandKit.email && <p className="text-white/70 text-sm mt-0.5">{brandKit.email}</p>}
            {brandKit.phone && <p className="text-white/70 text-sm">{brandKit.phone}</p>}
          </div>
        )}

        {/* Pause overlay */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
            <button
              onClick={handlePlay}
              disabled={analyzing}
              className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl hover:bg-white transition-colors disabled:opacity-60"
            >
              {analyzing
                ? <Loader2 className="w-6 h-6 text-[#21ABB5] animate-spin" />
                : <Play className="w-7 h-7 text-[#0F082B] fill-[#0F082B] ml-1" />}
            </button>
          </div>
        )}

        {/* Clip counter */}
        {playing && (
          <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-lg font-mono">
            {currentIndex + 1} / {totalPhotos}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-3 space-y-2">
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-[#21ABB5] rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlay}
              disabled={analyzing}
              className="w-9 h-9 rounded-full bg-[#21ABB5] flex items-center justify-center hover:bg-[#1a9da6] transition-colors disabled:opacity-60"
            >
              {playing
                ? <Pause className="w-4 h-4 text-white" />
                : <Play className="w-4 h-4 text-white fill-white ml-0.5" />}
            </button>
            <button
              onClick={() => setMuted(m => !m)}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-gray-500" /> : <Volume2 className="w-3.5 h-3.5 text-gray-500" />}
            </button>
          </div>
          <span className="text-xs text-[#606060] font-mono">{timeLabel}</span>
        </div>

        {/* Photo strip */}
        <div className="flex gap-1 overflow-x-auto py-1">
          {photos.map((url, i) => (
            <div
              key={i}
              className={`flex-shrink-0 w-10 h-10 rounded-md overflow-hidden border-2 transition-all ${i === currentIndex ? "border-[#21ABB5]" : "border-transparent opacity-50"}`}
            >
              <img
                src={url}
                alt=""
                className="w-full h-full object-cover"
                style={{
                  objectPosition: scenes?.[i]?.x === "left" ? "25% 50%" : scenes?.[i]?.x === "right" ? "75% 50%" : "50% 50%",
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}