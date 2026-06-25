import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

/**
 * SlideshowPlayer — plays uploaded photos as a video slideshow with
 * voiceover audio and background music, plus branding overlay.
 *
 * Props:
 *   photos        string[]   — ordered photo URLs
 *   voiceoverUrl  string     — URL of generated speech audio
 *   musicUrl      string     — URL of background music file
 *   brandKit      object     — { agent_name, email, phone, profile_photo_url, logo_url }
 *   introTemplate string
 *   outroTemplate string
 *   heading       string
 *   subheading    string
 *   orientation   "landscape"|"portrait"
 *   clipDuration  number     — seconds per photo (default 3)
 */
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
  const voiceRef = useRef(null);
  const musicRef = useRef(null);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const totalPhotos = photos.length;
  const totalDuration = totalPhotos * clipDuration;

  // Setup audio elements
  useEffect(() => {
    if (voiceoverUrl) {
      voiceRef.current = new Audio(voiceoverUrl);
      voiceRef.current.volume = 1.0;
    }
    if (musicUrl) {
      musicRef.current = new Audio(musicUrl);
      musicRef.current.volume = 0.25;
      musicRef.current.loop = true;
    }
    return () => {
      voiceRef.current?.pause();
      musicRef.current?.pause();
    };
  }, [voiceoverUrl, musicUrl]);

  // Mute/unmute
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
    startTimeRef.current = Date.now();

    voiceRef.current?.play().catch(() => {});
    musicRef.current?.play().catch(() => {});

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const pct = Math.min(elapsed / totalDuration, 1);
      setProgress(pct * 100);
      const idx = Math.min(Math.floor(elapsed / clipDuration), totalPhotos - 1);
      setCurrentIndex(idx);

      if (elapsed >= totalDuration) {
        clearInterval(intervalRef.current);
        setPlaying(false);
        setProgress(100);
        voiceRef.current?.pause();
        musicRef.current?.pause();
      }
    }, 100);
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  if (!photos.length) return null;

  const currentPhoto = photos[currentIndex];
  const elapsed = (progress / 100) * totalDuration;
  const timeLabel = `${Math.floor(elapsed)}s / ${totalDuration}s`;

  return (
    <div className="w-full">
      {/* Viewer */}
      <div className={`relative bg-black rounded-2xl overflow-hidden mx-auto ${orientation === "portrait" ? "aspect-[9/16] max-w-xs" : "aspect-video w-full"}`}>
        {/* Photo */}
        {currentPhoto && (
          <img
            src={currentPhoto}
            alt=""
            className="w-full h-full object-cover transition-opacity duration-500"
            style={{ opacity: playing ? 1 : 0.85 }}
          />
        )}

        {/* Intro branding overlay */}
        {currentIndex === 0 && introTemplate && introTemplate !== "None" && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 flex flex-col justify-end p-6">
            {heading && <p className="text-white font-bold text-xl drop-shadow-lg">{heading}</p>}
            {subheading && <p className="text-white/80 text-sm mt-1 drop-shadow">{subheading}</p>}
            <p className="text-white/60 text-xs mt-1 uppercase tracking-widest">{introTemplate}</p>
          </div>
        )}

        {/* Outro branding overlay */}
        {currentIndex === totalPhotos - 1 && outroTemplate && outroTemplate !== "None" && brandKit && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-6 text-center">
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

        {/* Play button overlay when paused */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <button
              onClick={handlePlay}
              className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl hover:bg-white transition-colors"
            >
              <Play className="w-7 h-7 text-[#0F082B] fill-[#0F082B] ml-1" />
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
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#21ABB5] rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlay}
              className="w-9 h-9 rounded-full bg-[#21ABB5] flex items-center justify-center hover:bg-[#1a9da6] transition-colors"
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
              className={`flex-shrink-0 w-10 h-10 rounded-md overflow-hidden border-2 transition-all ${i === currentIndex ? "border-[#21ABB5]" : "border-transparent opacity-60"}`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}