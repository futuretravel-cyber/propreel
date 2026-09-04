import React, { useState, useRef } from "react";
import {
  Music, Mic, Monitor, Smartphone, Star,
  Check, Play, Loader2, Trash2, ImagePlus, Wand2, Clapperboard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";
import { uploadToS3 } from "@/lib/awsS3";
import { generateScriptWithRetry } from "@/lib/scriptRetryHandler";
import { useToast } from "@/components/ui/use-toast";
import VideoTierSelector, { VIDEO_TIERS, getMaxImages } from "@/components/studio/tabs/VideoTierSelector";

const AWS_RENDER_ENDPOINT = "https://vpyz75mmlg.execute-api.af-south-1.amazonaws.com/v1/api/render";

const DURATION_WORD_COUNTS = {
  20: { min: 45, max: 50 },
  30: { min: 68, max: 75 },
  40: { min: 90, max: 100 },
  60: { min: 135, max: 150 },
  90: { min: 200, max: 225 },
};

const POLLY_VOICES = [
  { id: "Joanna",  name: "Joanna",  desc: "US Female" },
  { id: "Kendra",  name: "Kendra",  desc: "US Female" },
  { id: "Gregory", name: "Gregory", desc: "US Male" },
  { id: "Stephen", name: "Stephen", desc: "US Male" },
  { id: "Amy",     name: "Amy",     desc: "British Female" },
  { id: "Brian",   name: "Brian",   desc: "British Male" },
  { id: "Ayanda",  name: "Ayanda",  desc: "South African Female" },
];

function Section({ label, icon: Icon, desc, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-5 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center">
            <Icon className="w-4 h-4 text-purple-700" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">{label}</p>
            <p className="text-xs text-gray-400">{desc}</p>
          </div>
        </div>
        <div className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center transition-transform ${open ? "rotate-180" : ""}`}>
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </button>
      {open && <div className="border-t border-gray-100 px-6 py-5">{children}</div>}
    </div>
  );
}

export default function StudioVideoGenerator({
  project, projectId, photos: projectPhotos, onPhotoDeleted,
  brandKits, musicTracks,
  selectedBrandKitId, setSelectedBrandKitId,
  musicUrl, setMusicUrl,
  selectedBrandKit,
  propertyDescription,
}) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const [photoSource, setPhotoSource] = useState("project");
  const [videoTier, setVideoTier] = useState(project?.video_tier || "essential");
  const [videoDuration, setVideoDuration] = useState(project?.video_duration || 30);
  const [dragOver, setDragOver] = useState(false);

  const maxImages = getMaxImages(videoTier, videoDuration);

  const handleSelectTier = (tierId) => {
    setVideoTier(tierId);
    const tierDurations = VIDEO_TIERS.find(t => t.id === tierId)?.configs.map(c => c.duration) || [30];
    const nextDuration = tierDurations.includes(videoDuration) ? videoDuration : tierDurations[0];
    setVideoDuration(nextDuration);
    base44.entities.Project.update(projectId, { video_tier: tierId, video_duration: nextDuration });
  };

  const handleSelectDuration = (seconds) => {
    setVideoDuration(seconds);
    base44.entities.Project.update(projectId, { video_duration: seconds });
  };

  const allPhotos = photoSource === "uploaded" && uploadedPhotos.length ? uploadedPhotos : projectPhotos;
  const photos = allPhotos.slice(0, maxImages);

  const [orientation, setOrientation] = useState(project?.orientation || "landscape");
  const [heading, setHeading] = useState(project?.intro_heading || "");
  const [subheading, setSubheading] = useState(project?.intro_subheading || "");
  const [musicTrack, setMusicTrack] = useState(null);
  const [voiceoverScript, setVoiceoverScript] = useState(project?.voiceover_script || "");
  const [narratorVoice, setNarratorVoice] = useState(project?.voiceover_voice || "Joanna");
  const [submittingRender, setSubmittingRender] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [retryInfo, setRetryInfo] = useState(null);

  const uploadFiles = async (files) => {
    const currentCount = (photoSource === "uploaded" ? uploadedPhotos.length : 0);
    const remainingSlots = maxImages - currentCount;
    if (remainingSlots <= 0) {
      toast({ title: `Image limit reached`, description: `This video length allows a maximum of ${maxImages} images. Choose a longer length to add more.`, variant: "destructive" });
      return;
    }
    const filesToUpload = files.slice(0, remainingSlots);
    if (filesToUpload.length < files.length) {
      toast({ title: `Only ${remainingSlots} photo(s) added`, description: `This video length allows a maximum of ${maxImages} images.`, variant: "destructive" });
    }
    setUploading(true);
    try {
      const urls = await Promise.all(filesToUpload.map(async f => {
        const file_url = await uploadToS3(f, "video-frames");
        return file_url;
      }));
      setUploadedPhotos(prev => [...prev, ...urls]);
      setPhotoSource("uploaded");
      toast({ title: `${urls.length} photo(s) added to video` });
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const handleUploadPhotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    await uploadFiles(files);
    e.target.value = "";
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    await uploadFiles(files);
  };

  const handleDeletePhoto = (idx) => {
    if (photoSource === "uploaded" && uploadedPhotos.length > 0) {
      setUploadedPhotos(prev => prev.filter((_, i) => i !== idx));
    } else {
      onPhotoDeleted?.(idx);
    }
  };

  const handleGenerateScript = async () => {
    setGeneratingScript(true);
    setRetryInfo(null);
    try {
      const wordCounts = DURATION_WORD_COUNTS[videoDuration] || { min: 68, max: 75 };
      const targetWordCount = Math.round((wordCounts.min + wordCounts.max) / 2);

      const systemPrompt = `You are a professional voiceover narrator for luxury real estate commercial videos. Analyze the property photos and specs. Write an elegant, captivating voiceover script intended for narration.
STRICT REQUIREMENT: The script MUST be exactly ${targetWordCount} words long so that it fits a ${videoDuration}-second video when spoken naturally. Do not include camera directions, speaker labels, or scene notes—return ONLY the spoken script text.`;

      const userPrompt = `Property: ${project?.name || "Property listing"}
Video Duration: ${videoDuration} seconds
Target Word Count: ${targetWordCount} words (range ${wordCounts.min}-${wordCounts.max})

${propertyDescription ? `Property context: ${propertyDescription}` : ""}

Write the voiceover script now. Return ONLY the spoken script text, exactly ${targetWordCount} words.`;

      const text = await generateScriptWithRetry(systemPrompt, userPrompt, photos, (info) => {
        setRetryInfo(info);
        toast({ title: `AI service busy — retrying (${info.attempt}/${info.maxRetries})...` });
      });
      setVoiceoverScript(text);
    } catch (e) {
      toast({ title: "Script generation failed", description: e.message, variant: "destructive" });
    }
    setRetryInfo(null);
    setGeneratingScript(false);
  };

  const handleMusicTrack = (track) => {
    setMusicTrack(track.id);
    setMusicUrl(track.file_url || "");
  };

  const handleSelectNarrator = (voiceId) => {
    setNarratorVoice(voiceId);
    base44.entities.Project.update(projectId, { voiceover_voice: voiceId });
  };

  const handleRenderVideo = async () => {
    if (!photos.length) {
      toast({ title: "No photos to render", variant: "destructive" });
      return;
    }
    setSubmittingRender(true);
    try {
      const settings = await base44.entities.AppSetting.list();
      const renderApiUrl = settings?.[0]?.aws_render_api_url || AWS_RENDER_ENDPOINT;

      // The script is finalized automatically and sent directly in the payload
      const payload = {
        record_id: projectId,
        tier: videoTier,
        orientation: orientation,
        images: photos,
        voiceover_text: voiceoverScript || "",
        voice_id: narratorVoice || "Joanna",
        include_agent_branding: selectedBrandKit?.include_agent_branding !== false,
        video_duration: videoDuration,
        music_url: musicUrl || "",
        headline_text: heading || project?.name || "",
        agent_headshot: selectedBrandKit?.profile_photo_url || "",
        company_logo: selectedBrandKit?.logo_url || "",
        agent_name: selectedBrandKit?.agent_name || "",
        agent_phone: selectedBrandKit?.phone || "",
      };

      // Attach the active user's auth token if available
      const headers = { "Content-Type": "application/json" };
      if (appParams?.token) {
        headers["Authorization"] = `Bearer ${appParams.token}`;
      }

      let res;
      try {
        res = await fetch(renderApiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
      } catch (networkErr) {
        throw new Error(
          networkErr?.message === "Failed to fetch"
            ? "Network error: unable to reach the render service. This may be due to a network issue or CORS restriction."
            : `Network error: ${networkErr?.message || "Unknown"}`
        );
      }

      if (!res.ok) {
        let serverMsg = `Status ${res.status}`;
        try {
          const errBody = await res.json();
          serverMsg = errBody?.message || errBody?.error || errBody?.detail || JSON.stringify(errBody);
        } catch {
          try { serverMsg = await res.text(); } catch {}
        }
        throw new Error(serverMsg);
      }

      const responseData = await res.json().catch(() => ({}));
      const jobId = responseData.job_id || responseData.task_id || responseData.id;

      await base44.entities.Project.update(projectId, {
        status: "processing",
        voiceover_script: voiceoverScript,
        orientation,
        ...(jobId ? { render_job_id: jobId } : {}),
      });
      toast({ title: "✅ Render job submitted!", description: jobId ? `Job ID: ${jobId}` : "Your video will appear here when ready." });
    } catch (e) {
      toast({ title: `Render failed: ${e.message}`, variant: "destructive" });
    }
    setSubmittingRender(false);
  };

  return (
    <div className="space-y-5">
      {/* ── Tier Cards ── */}
      <VideoTierSelector
        selectedTier={videoTier}
        onSelectTier={handleSelectTier}
        selectedDuration={videoDuration}
        onSelectDuration={handleSelectDuration}
      />

      {/* ── Drag & Drop Photos ── */}
      <div className="bg-white rounded-3xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-gray-900">Property Photos</p>
          <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">
            {photos.length} / {maxImages}
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-4">Drag & drop your listing photos here, or click to browse.</p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
            dragOver
              ? "border-purple-700 bg-purple-50 scale-[1.01]"
              : "border-gray-200 bg-gray-50/50 hover:border-purple-300 hover:bg-purple-50/30"
          }`}
        >
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleUploadPhotos} className="hidden" />
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors ${dragOver ? "bg-purple-700" : "bg-purple-100"}`}>
              {uploading ? (
                <Loader2 className="w-6 h-6 text-purple-700 animate-spin" />
              ) : (
                <ImagePlus className={`w-6 h-6 ${dragOver ? "text-white" : "text-purple-700"}`} />
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {uploading ? "Uploading..." : dragOver ? "Drop photos here" : "Drag & drop or click to upload"}
            </p>
            <p className="text-xs text-gray-400 mt-1">JPG, PNG · Max {maxImages} images for {videoDuration}s video</p>
          </div>
        </div>

        {/* Source toggle */}
        {projectPhotos.length > 0 && uploadedPhotos.length > 0 && (
          <div className="flex gap-2 mt-3">
            <button onClick={() => setPhotoSource("project")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${photoSource === "project" ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
              📁 Project Photos ({projectPhotos.length})
            </button>
            <button onClick={() => setPhotoSource("uploaded")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${photoSource === "uploaded" ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
              ⬆️ Uploaded ({uploadedPhotos.length})
            </button>
          </div>
        )}

        {/* Thumbnail strip */}
        {photos.length > 0 && (
          <div className="flex gap-2.5 overflow-x-auto pb-1 mt-4">
            {photos.map((url, i) => (
              <div key={i} className="relative flex-shrink-0 group">
                <div className="w-16 h-16 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
                <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/50 rounded px-1">{i + 1}</span>
                <button
                  onClick={() => handleDeletePhoto(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors z-10"
                  title="Remove photo"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Orientation Toggle ── */}
      <div className="bg-white rounded-3xl border border-gray-100 p-6">
        <p className="text-sm font-semibold text-gray-900 mb-1">Orientation</p>
        <p className="text-xs text-gray-400 mb-4">Choose the aspect ratio for your video.</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setOrientation("landscape")}
            className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${orientation === "landscape" ? "border-purple-700 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${orientation === "landscape" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-400"}`}>
              <Monitor className="w-5 h-5" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-semibold text-gray-900">Landscape</p>
              <p className="text-xs text-gray-500">16:9 · YouTube, Facebook</p>
            </div>
            {orientation === "landscape" && <Check className="w-4 h-4 text-purple-700" />}
          </button>
          <button onClick={() => setOrientation("portrait")}
            className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${orientation === "portrait" ? "border-purple-700 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${orientation === "portrait" ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-400"}`}>
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-semibold text-gray-900">Portrait</p>
              <p className="text-xs text-gray-500">9:16 · Reels, TikTok, Stories</p>
            </div>
            {orientation === "portrait" && <Check className="w-4 h-4 text-purple-700" />}
          </button>
        </div>
      </div>

      {/* ── Streamlined Script Input ── */}
      <div className="bg-white rounded-3xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-gray-900">Voiceover Script</p>
          <button onClick={handleGenerateScript} disabled={generatingScript || !photos.length}
            className="flex items-center gap-1.5 text-xs text-purple-700 font-semibold hover:underline disabled:opacity-40 disabled:no-underline">
            {generatingScript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {generatingScript ? (retryInfo ? `Retrying (${retryInfo.attempt}/${retryInfo.maxRetries})...` : "AI Writing...") : "AI Write Script"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">Write your own or let AI craft the narration — sent automatically with your render.</p>
        <textarea
          value={voiceoverScript}
          onChange={e => setVoiceoverScript(e.target.value)}
          placeholder="Write or generate your voiceover script here..."
          rows={5}
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-purple-700/30 placeholder:text-gray-400 leading-relaxed"
        />
        {propertyDescription && !voiceoverScript && (
          <button onClick={() => setVoiceoverScript(propertyDescription)}
            className="mt-2 text-xs text-purple-700 font-semibold hover:underline">
            → Use property description as script
          </button>
        )}

        {/* Narrator voice */}
        <div className="mt-4">
          <label className="text-xs font-semibold text-gray-700 mb-2 block flex items-center gap-1.5">
            <Mic className="w-3.5 h-3.5 text-purple-700" /> Narrator Voice
          </label>
          <Select value={narratorVoice} onValueChange={handleSelectNarrator}>
            <SelectTrigger className="w-full rounded-xl h-11 text-sm">
              <SelectValue placeholder="Select a narrator voice" />
            </SelectTrigger>
            <SelectContent>
              {POLLY_VOICES.map(voice => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name} · {voice.desc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Brand Kit ── */}
      <Section label="Agent Profile Branding" icon={Star} desc="Apply your logo, profile photo and contact info" defaultOpen={false}>
        <div className="space-y-2">
          {brandKits.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-2">No agent profiles set up yet.</p>
              <Link to="/brand-kits" className="text-sm text-purple-700 underline">Create Agent Profile →</Link>
            </div>
          ) : (
            brandKits.map(kit => (
              <button key={kit.id} onClick={() => setSelectedBrandKitId(kit.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left ${selectedBrandKitId === kit.id ? "border-purple-700 bg-purple-50" : "border-gray-100 hover:border-gray-200"}`}>
                {kit.profile_photo_url ? (
                  <img src={kit.profile_photo_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-700 flex-shrink-0">{kit.agent_name?.[0]}</div>
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

      {/* ── Music ── */}
      <Section label="Music Track" icon={Music} desc="Background music for your video" defaultOpen={false}>
        <div className="space-y-2">
          {musicTracks.length === 0 ? (
            <div className="text-center py-4">
              <Music className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No music tracks available. Add tracks from the Admin panel.</p>
            </div>
          ) : (
            musicTracks.map(track => (
              <button key={track.id} onClick={() => handleMusicTrack(track)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${musicTrack === track.id ? "border-purple-700 bg-purple-50" : "border-gray-100 bg-gray-50 hover:border-gray-200"}`}>
                <button onClick={e => { e.stopPropagation(); new Audio(track.file_url).play(); }}
                  className="w-9 h-9 rounded-full bg-purple-700 flex items-center justify-center flex-shrink-0 hover:bg-purple-800">
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

      {/* ── Render ── */}
      <div className="bg-gradient-to-br from-purple-700 to-purple-900 rounded-3xl p-6 text-center shadow-lg shadow-purple-700/20">
        <Clapperboard className="w-8 h-8 text-white mx-auto mb-2" />
        <p className="text-base font-bold text-white mb-1">Render Your Video</p>
        <p className="text-xs text-purple-200 mb-4">Your script and photos are finalized automatically and sent to the render engine.</p>
        <Button onClick={handleRenderVideo} disabled={submittingRender || !photos.length}
          className="w-full bg-white text-purple-700 hover:bg-purple-50 font-bold rounded-2xl gap-2 h-12 text-sm">
          {submittingRender
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            : <><Play className="w-4 h-4 fill-purple-700" /> Render Video</>}
        </Button>
        {!photos.length && (
          <p className="text-xs text-purple-200 mt-2">Add at least one photo to render.</p>
        )}
      </div>
    </div>
  );
}