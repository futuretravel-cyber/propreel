import React, { useState, useRef } from "react";
import {
  Video, Music, Mic, User, Star, Layers, Monitor, Smartphone,
  Check, Play, Loader2, Download, ChevronDown, ChevronRight, Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import SlideshowPlayer from "@/components/studio/SlideshowPlayer";
import CreatomateDownload from "@/components/studio/CreatomateDownload";

const INTRO_TEMPLATES = ["None", "Address Reveal", "Open House", "Just Listed", "Price Drop", "Luxury Feature", "Simple"];
const OUTRO_TEMPLATES = ["None", "Agent Card", "Contact Block", "Agency Logo"];

const SECTIONS = [
  { key: "creatomate", label: "Creatomate Templates", icon: Video,   desc: "9 Pro video templates with Ken Burns effect" },
  { key: "avatar",     label: "HeyGen AI Avatar",     icon: User,    desc: "AI presenter for your listing video" },
  { key: "voiceover",  label: "ElevenLabs Voiceover", icon: Mic,     desc: "Realistic AI voiceover narration" },
  { key: "intros",     label: "Intro / Outro",         icon: Layers,  desc: "Branded intro and outro overlays" },
  { key: "format",     label: "Landscape / Portrait",  icon: Monitor, desc: "Choose video orientation" },
  { key: "brandkit",   label: "Brand Kit",             icon: Star,    desc: "Apply your agent branding" },
  { key: "music",      label: "Music",                 icon: Music,   desc: "Background music track" },
];

function Section({ sectionKey, label, icon: Icon, desc, children }) {
  const [open, setOpen] = useState(sectionKey === "creatomate");
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
            <Icon className="w-4 h-4 text-purple-700" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">{label}</p>
            <p className="text-xs text-gray-400">{desc}</p>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="border-t border-gray-100 p-5">{children}</div>}
    </div>
  );
}

export default function StudioVideoGenerator({
  project, projectId, photos: projectPhotos,
  editedPhotos,
  brandKits, musicTracks,
  selectedBrandKitId, setSelectedBrandKitId,
  voiceoverUrl, setVoiceoverUrl,
  musicUrl, setMusicUrl,
  selectedBrandKit,
  propertyDescription,
}) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [photoSource, setPhotoSource] = useState("project");

  const photosForVideo = photoSource === "uploaded" && uploadedPhotos.length
    ? uploadedPhotos
    : projectPhotos;

  const photos = photosForVideo;

  const [orientation, setOrientation] = useState(project?.orientation || "landscape");
  const [introTemplate, setIntroTemplate] = useState(project?.intro_template || "Address Reveal");
  const [outroTemplate, setOutroTemplate] = useState(project?.outro_template || "Agent Card");
  const [heading, setHeading] = useState(project?.intro_heading || "");
  const [subheading, setSubheading] = useState(project?.intro_subheading || "");
  const [musicTrack, setMusicTrack] = useState(null);
  const [voiceoverScript, setVoiceoverScript] = useState(project?.voiceover_script || "");
  const [voiceoverVoice, setVoiceoverVoice] = useState("mapendo");
  const [rendering, setRendering] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [heygenApiKey, setHeygenApiKey] = useState(localStorage.getItem("heygen_api_key") || "");
  const [heygenGenerating, setHeygenGenerating] = useState(false);
  const [heygenVideoUrl, setHeygenVideoUrl] = useState(null);

  // AI Voice options (ElevenLabs IDs)
  const AI_VOICES = [
    { id: "mapendo", name: "Mapendo", gender: "Female", desc: "Approachable, Confident & Warm", elevenId: "21m00Tcm4TlvDq8ikWAM" },
    { id: "sekou",   name: "Sekou",   gender: "Male",   desc: "Friendly and Confident",         elevenId: "ErXwobaYiN019PkySvjV" },
    { id: "mark",    name: "Mark",    gender: "Male",   desc: "Natural Conversations",           elevenId: "VR6AewLTigWG4xSOukaG" },
    { id: "alesha",  name: "Alesha",  gender: "Female", desc: "Laidback, Relaxed and Friendly",  elevenId: "EXAVITQu4vr4xnSDxMaL" },
  ];

  const handleUploadPhotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(async f => {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
        return file_url;
      }));
      setUploadedPhotos(prev => [...prev, ...urls]);
      setPhotoSource("uploaded");
      toast({ title: `${urls.length} photo(s) added to video` });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleRenderVoiceover = async () => {
    if (!voiceoverScript.trim()) return;
    setRendering(true);
    try {
      const apiKey = localStorage.getItem("elevenlabs_api_key");
      const voice = AI_VOICES.find(v => v.id === voiceoverVoice);
      if (apiKey && voice) {
        // Use ElevenLabs
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.elevenId}`, {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ text: voiceoverScript, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
        });
        if (!response.ok) throw new Error("ElevenLabs error");
        const blob = await response.blob();
        const file = new File([blob], "voiceover.mp3", { type: "audio/mpeg" });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setVoiceoverUrl(file_url);
        await base44.entities.Project.update(projectId, { voiceover_url: file_url, voiceover_script: voiceoverScript });
      } else {
        // Fallback built-in
        const result = await base44.integrations.Core.GenerateSpeech({ text: voiceoverScript, language_code: "en" });
        setVoiceoverUrl(result.url);
        await base44.entities.Project.update(projectId, { voiceover_url: result.url, voiceover_script: voiceoverScript });
      }
      toast({ title: "Voiceover generated!" });
    } catch {
      toast({ title: "Voiceover failed", variant: "destructive" });
    }
    setRendering(false);
  };

  const handleGenerateScript = async () => {
    setGeneratingScript(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Write a professional South African real estate voiceover script for: ${project?.name || "property listing"}. About ${photos.length * 4} seconds when read aloud. Use South African English. No stage directions. End with a call to action. Return ONLY the script text.`,
      });
      setVoiceoverScript(typeof result === "string" ? result.trim() : "");
    } catch {}
    setGeneratingScript(false);
  };

  const handleHeyGenGenerate = async () => {
    if (!heygenApiKey || !voiceoverScript) return;
    localStorage.setItem("heygen_api_key", heygenApiKey);
    setHeygenGenerating(true);
    setHeygenVideoUrl(null);
    try {
      // Create HeyGen video with text-to-video API
      const createRes = await fetch("https://api.heygen.com/v2/video/generate", {
        method: "POST",
        headers: { "X-Api-Key": heygenApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          video_inputs: [{
            character: { type: "avatar", avatar_id: "Daisy-inskirt-20220818", avatar_style: "normal" },
            voice: { type: "text", input_text: voiceoverScript.slice(0, 1500), voice_id: "2d5b0e6cf36f460aa7fc47e3eee4ba54" },
          }],
          dimension: { width: 1280, height: 720 },
          aspect_ratio: "16:9",
        }),
      });
      const createData = await createRes.json();
      const videoId = createData?.data?.video_id;
      if (!videoId) throw new Error(createData?.message || "No video ID returned");

      // Poll for completion
      let attempts = 0;
      while (attempts < 30) {
        await new Promise(r => setTimeout(r, 5000));
        const statusRes = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
          headers: { "X-Api-Key": heygenApiKey },
        });
        const statusData = await statusRes.json();
        const status = statusData?.data?.status;
        if (status === "completed") {
          setHeygenVideoUrl(statusData.data.video_url);
          toast({ title: "HeyGen avatar video ready!" });
          break;
        } else if (status === "failed") {
          throw new Error("HeyGen video generation failed");
        }
        attempts++;
      }
      if (attempts >= 30) throw new Error("Timeout — check HeyGen dashboard");
    } catch (e) {
      toast({ title: "HeyGen error", description: e.message, variant: "destructive" });
    }
    setHeygenGenerating(false);
  };

  const handleMusicTrack = (track) => {
    setMusicTrack(track.id);
    setMusicUrl(track.file_url || "");
  };

  return (
    <div className="space-y-4">

      {/* Photo Import Panel */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-sm font-semibold text-gray-900 mb-1">📸 Video Photos</p>
        <p className="text-xs text-gray-400 mb-3">Use your project photos, edited versions from other tabs, or upload new ones.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={() => setPhotoSource("project")}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${photoSource === "project" ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
            📁 Project Photos ({projectPhotos.length})
          </button>
          {uploadedPhotos.length > 0 && (
            <button onClick={() => setPhotoSource("uploaded")}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${photoSource === "uploaded" ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
              ⬆️ Uploaded Photos ({uploadedPhotos.length})
            </button>
          )}
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleUploadPhotos} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 border-dashed border-gray-300 text-gray-500 hover:border-purple-700 hover:text-purple-700 transition-all">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Uploading..." : "Upload New Photos"}
            </button>
          </div>
        </div>
        {photos.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {photos.map((url, i) => (
              <div key={i} className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Property Description (from Description tab) */}
      {propertyDescription && (
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
          <p className="text-sm font-semibold text-purple-900 mb-2">📝 Property Description</p>
          <p className="text-xs text-purple-700 line-clamp-3">{propertyDescription}</p>
          <button onClick={() => setVoiceoverScript(propertyDescription)}
            className="mt-2 text-xs text-purple-700 font-semibold hover:underline">
            → Use as voiceover script
          </button>
        </div>
      )}

      {/* Live Preview */}
      {photos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-900">Live Preview</p>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5">
              <button onClick={() => setOrientation("landscape")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${orientation === "landscape" ? "bg-purple-700 text-white" : "text-gray-500"}`}>
                <Monitor className="w-3.5 h-3.5" /> Landscape
              </button>
              <button onClick={() => setOrientation("portrait")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${orientation === "portrait" ? "bg-purple-700 text-white" : "text-gray-500"}`}>
                <Smartphone className="w-3.5 h-3.5" /> Portrait
              </button>
            </div>
          </div>
          <SlideshowPlayer
            photos={photos}
            voiceoverUrl={voiceoverUrl}
            musicUrl={musicUrl}
            brandKit={selectedBrandKit}
            introTemplate={introTemplate}
            outroTemplate={outroTemplate}
            heading={heading || project?.name}
            subheading={subheading}
            orientation={orientation}
            clipDuration={project?.clip_duration || 5}
          />
        </div>
      )}

      {/* Creatomate */}
      <Section sectionKey="creatomate" label="Creatomate Templates" icon={Video} desc="9 professional video templates — download and render on Creatomate">
        <CreatomateDownload project={project} />
      </Section>

      {/* HeyGen Avatar */}
      <Section sectionKey="avatar" label="HeyGen AI Avatar" icon={User} desc="Add a talking AI presenter to your listing video">
        <div className="space-y-3">
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-purple-900 mb-1">🎬 HeyGen API Key</p>
            <p className="text-xs text-purple-700 mb-2">Your key is saved locally. Get yours at <a href="https://www.heygen.com" target="_blank" rel="noopener" className="underline">heygen.com</a></p>
            <input type="password" value={heygenApiKey} onChange={e => setHeygenApiKey(e.target.value)}
              onBlur={() => heygenApiKey && localStorage.setItem("heygen_api_key", heygenApiKey)}
              placeholder="HeyGen API Key (e.g. NTY3...)"
              className="w-full border border-purple-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-purple-700 bg-white"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Avatar Script</label>
            <textarea value={voiceoverScript} onChange={e => setVoiceoverScript(e.target.value)}
              placeholder="Add your voiceover script from the AI Voice section above, or type it here..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-purple-700 placeholder:text-gray-400"
            />
          </div>
          <Button onClick={handleHeyGenGenerate}
            disabled={!heygenApiKey || !voiceoverScript || heygenGenerating}
            className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-10 text-sm">
            {heygenGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating avatar video...</> : <><User className="w-4 h-4" /> Generate Avatar Video</>}
          </Button>
          {heygenGenerating && (
            <p className="text-xs text-gray-500 text-center">This takes 1–3 minutes. Please wait…</p>
          )}
          {heygenVideoUrl && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-800 mb-2">✓ Avatar video ready!</p>
              <video src={heygenVideoUrl} controls className="w-full rounded-xl" />
              <a href={heygenVideoUrl} download="avatar-video.mp4" className="text-[10px] text-purple-700 underline mt-1 block">Download MP4</a>
            </div>
          )}
        </div>
      </Section>

      {/* AI Voice */}
      <Section sectionKey="voiceover" label="AI Voice" icon={Mic} desc="Generate professional AI narration for your video">
        <div className="space-y-4">
          {/* Script */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-700">Voiceover Script</label>
              <button onClick={handleGenerateScript} disabled={generatingScript}
                className="flex items-center gap-1 text-xs text-purple-700 font-medium hover:underline">
                {generatingScript ? <Loader2 className="w-3 h-3 animate-spin" /> : "✨"}
                {generatingScript ? "Generating..." : "AI Write"}
              </button>
            </div>
            <textarea
              value={voiceoverScript}
              onChange={e => setVoiceoverScript(e.target.value)}
              placeholder="Write or generate your voiceover script..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-purple-700 placeholder:text-gray-400"
            />
            {propertyDescription && !voiceoverScript && (
              <button onClick={() => setVoiceoverScript(propertyDescription)}
                className="text-xs text-purple-700 font-medium hover:underline mt-1">
                → Use property description as script
              </button>
            )}
          </div>

          {/* Voice Selection */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 block">Select Voice</label>
            <div className="grid grid-cols-1 gap-2">
              {AI_VOICES.map(voice => {
                const isSelected = voiceoverVoice === voice.id;
                return (
                  <button key={voice.id} onClick={() => setVoiceoverVoice(voice.id)}
                    className={`flex items-center gap-3 rounded-xl p-3 border-2 text-left transition-all ${isSelected ? "border-purple-700 bg-purple-50" : "border-gray-100 bg-gray-50 hover:border-gray-300"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-purple-700" : "bg-gray-200"}`}>
                      <Mic className={`w-3.5 h-3.5 ${isSelected ? "text-white" : "text-gray-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isSelected ? "text-purple-700" : "text-gray-900"}`}>
                        {voice.name} <span className="font-normal text-gray-500">· {voice.gender}</span>
                      </p>
                      <p className="text-xs text-gray-500">{voice.desc}</p>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-purple-700 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <Button onClick={handleRenderVoiceover} disabled={rendering || !voiceoverScript.trim()}
            className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-10">
            {rendering ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating voiceover...</> : <><Mic className="w-4 h-4" /> Generate Voiceover</>}
          </Button>

          {voiceoverUrl && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-800 mb-2">✓ Voiceover ready</p>
              <audio controls src={voiceoverUrl} className="w-full" style={{ height: "36px" }} />
              <a href={voiceoverUrl} download="voiceover.mp3" className="text-[10px] text-purple-700 underline mt-1 block">Download MP3</a>
            </div>
          )}
        </div>
      </Section>

      {/* Intro / Outro */}
      <Section sectionKey="intros" label="Intro / Outro" icon={Layers} desc="Branded intro and outro overlays for your video">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Intro Template</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {INTRO_TEMPLATES.map(t => (
                <button key={t} onClick={() => setIntroTemplate(t)}
                  className={`aspect-video rounded-xl border-2 text-[10px] font-medium flex items-center justify-center p-1 text-center transition-all ${introTemplate === t ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-500 hover:border-gray-300 bg-gray-50"}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-[10px] font-medium text-gray-500 mb-1 block">Heading</label>
                <input value={heading} onChange={e => setHeading(e.target.value)} placeholder={project?.name} className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-purple-700" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 mb-1 block">Subheading</label>
                <input value={subheading} onChange={e => setSubheading(e.target.value)} placeholder="Subtitle..." className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-purple-700" />
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Outro Template</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {OUTRO_TEMPLATES.map(t => (
                <button key={t} onClick={() => setOutroTemplate(t)}
                  className={`aspect-video rounded-xl border-2 text-[10px] font-medium flex items-center justify-center p-1 text-center transition-all ${outroTemplate === t ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-500 hover:border-gray-300 bg-gray-50"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Format */}
      <Section sectionKey="format" label="Landscape / Portrait" icon={Monitor} desc="Choose your video orientation and resolution">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setOrientation("landscape")}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${orientation === "landscape" ? "border-purple-700 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
            <Monitor className={`w-8 h-8 ${orientation === "landscape" ? "text-purple-700" : "text-gray-400"}`} />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Landscape</p>
              <p className="text-xs text-gray-500">16:9 · YouTube, Facebook, TV</p>
            </div>
            {orientation === "landscape" && <Check className="w-4 h-4 text-purple-700" />}
          </button>
          <button onClick={() => setOrientation("portrait")}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${orientation === "portrait" ? "border-purple-700 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
            <Smartphone className={`w-8 h-8 ${orientation === "portrait" ? "text-purple-700" : "text-gray-400"}`} />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Portrait</p>
              <p className="text-xs text-gray-500">9:16 · Reels, TikTok, Stories</p>
            </div>
            {orientation === "portrait" && <Check className="w-4 h-4 text-purple-700" />}
          </button>
        </div>
      </Section>

      {/* Brand Kit */}
      <Section sectionKey="brandkit" label="Brand Kit" icon={Star} desc="Apply your logo, profile photo and contact info">
        <div className="space-y-2">
          {brandKits.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-2">No brand kits set up yet.</p>
              <Link to="/brand-kits" className="text-sm text-purple-700 underline">Create a Brand Kit →</Link>
            </div>
          ) : (
            brandKits.map(kit => (
              <button key={kit.id} onClick={() => setSelectedBrandKitId(kit.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${selectedBrandKitId === kit.id ? "border-purple-700 bg-purple-50" : "border-gray-100 hover:border-gray-200"}`}>
                {kit.profile_photo_url ? (
                  <img src={kit.profile_photo_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-700 flex-shrink-0">
                    {kit.agent_name?.[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{kit.name}</p>
                  <p className="text-xs text-gray-500 truncate">{kit.agent_name}</p>
                </div>
                {selectedBrandKitId === kit.id && <Check className="w-4 h-4 text-purple-700 flex-shrink-0" />}
              </button>
            ))
          )}
        </div>
      </Section>

      {/* Music */}
      <Section sectionKey="music" label="Music" icon={Music} desc="Background music track for your video">
        <div className="space-y-2">
          {musicTracks.length === 0 ? (
            <div className="text-center py-4">
              <Music className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No music tracks available. Add tracks from the Admin panel.</p>
            </div>
          ) : (
            musicTracks.map(track => (
              <button key={track.id} onClick={() => handleMusicTrack(track)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${musicTrack === track.id ? "border-purple-700 bg-purple-50" : "border-gray-100 bg-gray-50 hover:border-gray-200"}`}>
                <button onClick={e => { e.stopPropagation(); new Audio(track.file_url).play(); }}
                  className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center flex-shrink-0 hover:bg-purple-800">
                  <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                </button>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{track.name}</p>
                  <p className="text-xs text-gray-500">{track.genre}{track.duration ? ` · ${track.duration}` : ""}</p>
                </div>
                {musicTrack === track.id && <Check className="w-4 h-4 text-purple-700 flex-shrink-0" />}
              </button>
            ))
          )}
        </div>
      </Section>
    </div>
  );
}