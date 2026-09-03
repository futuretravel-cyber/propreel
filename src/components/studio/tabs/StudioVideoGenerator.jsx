import React, { useState, useRef } from "react";
import {
  Music, Mic, User, Star, Monitor, Smartphone,
  Check, Play, Loader2, Download, ChevronDown, ChevronRight, Upload, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { uploadToS3 } from "@/lib/awsS3";
import { generatePollyVoiceover } from "@/lib/awsPolly";
import { generateScriptWithRetry } from "@/lib/scriptRetryHandler";
import { useToast } from "@/components/ui/use-toast";
import VideoTierSelector, { VIDEO_TIERS, getMaxImages } from "@/components/studio/tabs/VideoTierSelector";

const MODAL_RENDER_ENDPOINT = "https://futuretravel--propreel-render-engine-grok-tiers-fastapi-entry.modal.run/v1/api/render";

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

function Section({ sectionKey, label, icon: Icon, desc, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
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
  project, projectId, photos: projectPhotos, onPhotoDeleted,
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
  const [videoTier, setVideoTier] = useState(project?.video_tier || "essential");
  const [videoDuration, setVideoDuration] = useState(project?.video_duration || 30);

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
  const [rendering, setRendering] = useState(false);
  const [submittingRender, setSubmittingRender] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [retryInfo, setRetryInfo] = useState(null);
  const [voiceoverApproved, setVoiceoverApproved] = useState(false);

  const handleUploadPhotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const currentCount = (photoSource === "uploaded" ? uploadedPhotos.length : 0);
    const remainingSlots = maxImages - currentCount;
    if (remainingSlots <= 0) {
      toast({ title: `Image limit reached`, description: `This video length allows a maximum of ${maxImages} images. Choose a longer length to add more.`, variant: "destructive" });
      e.target.value = "";
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
    e.target.value = "";
  };

  const handleDeletePhoto = (idx) => {
    if (photoSource === "uploaded" && uploadedPhotos.length > 0) {
      setUploadedPhotos(prev => prev.filter((_, i) => i !== idx));
    } else {
      onPhotoDeleted?.(idx);
    }
  };

  const handleRenderVoiceover = async () => {
    if (!voiceoverScript.trim()) return;
    setRendering(true);
    try {
      const audioUrl = await generatePollyVoiceover(voiceoverScript, narratorVoice);
      setVoiceoverUrl(audioUrl);
      setVoiceoverApproved(false);
      await base44.entities.Project.update(projectId, { voiceover_url: audioUrl, voiceover_script: voiceoverScript, voiceover_voice: narratorVoice });
      toast({ title: "Voiceover generated! Preview and approve to continue." });
    } catch (e) {
      toast({ title: "Voiceover failed", description: e.message, variant: "destructive" });
    }
    setRendering(false);
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
      setVoiceoverApproved(false);
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
    setVoiceoverApproved(false);
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
      const renderApiUrl = settings?.[0]?.aws_render_api_url || MODAL_RENDER_ENDPOINT;

      const payload = {
        record_id: projectId,
        tier: videoTier,
        orientation: orientation,
        images: photos,
        voiceover_text: voiceoverScript || "",
        voice_id: narratorVoice || "Joanna",
        include_agent_branding: selectedBrandKit?.include_agent_branding !== false,
        video_duration: videoDuration,
        voiceover_url: voiceoverUrl || "",
        music_url: musicUrl || "",
        headline_text: heading || project?.name || "",
        agent_headshot: selectedBrandKit?.profile_photo_url || "",
        company_logo: selectedBrandKit?.logo_url || "",
        agent_name: selectedBrandKit?.agent_name || "",
        agent_phone: selectedBrandKit?.phone || "",
      };

      const res = await fetch(renderApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);

      const responseData = await res.json().catch(() => ({}));
      const jobId = responseData.job_id || responseData.task_id || responseData.id;

      await base44.entities.Project.update(projectId, {
        status: "processing",
        ...(jobId ? { render_job_id: jobId } : {}),
      });
      toast({ title: "✅ Render job submitted!", description: jobId ? `Job ID: ${jobId}` : "Your video will appear here when ready." });
    } catch (e) {
      toast({ title: `Render failed: ${e.message}`, variant: "destructive" });
    }
    setSubmittingRender(false);
  };

  return (
    <div className="space-y-4">
      {/* Video Tier */}
      <VideoTierSelector
        selectedTier={videoTier}
        onSelectTier={handleSelectTier}
        selectedDuration={videoDuration}
        onSelectDuration={handleSelectDuration}
      />

      {/* Photo Source */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-sm font-semibold text-gray-900 mb-1">📸 Video Photos</p>
        <p className="text-xs text-gray-400 mb-1">Use your project photos or upload new ones for the video.</p>
        <p className="text-xs font-semibold text-purple-700 mb-3">Max {maxImages} images for {videoDuration}s video · Using {photos.length} of {maxImages}</p>
        {allPhotos.length > maxImages && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3 text-xs text-amber-800">
            Only the first {maxImages} photos will be used. Choose a longer video length to include more.
          </div>
        )}
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
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading || (photoSource === "uploaded" && uploadedPhotos.length >= maxImages)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 border-dashed border-gray-300 text-gray-500 hover:border-purple-700 hover:text-purple-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Uploading..." : "Upload New Photos"}
            </button>
          </div>
        </div>
        {photos.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {photos.map((url, i) => (
              <div key={i} className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
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

      {/* Property Description shortcut */}
      {propertyDescription && (
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
          <p className="text-sm font-semibold text-purple-900 mb-2">📝 Property Description Available</p>
          <p className="text-xs text-purple-700 line-clamp-3">{propertyDescription}</p>
          <button onClick={() => { setVoiceoverScript(propertyDescription); setVoiceoverApproved(false); }} className="mt-2 text-xs text-purple-700 font-semibold hover:underline">
            → Use as voiceover script
          </button>
        </div>
      )}

      {/* AI Voice */}
      <Section sectionKey="voiceover" label="AI Voiceover" icon={Mic} desc="Generate professional AI narration for your video">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-700">Voiceover Script</label>
              <button onClick={handleGenerateScript} disabled={generatingScript}
                className="flex items-center gap-1 text-xs text-purple-700 font-medium hover:underline">
                {generatingScript ? <Loader2 className="w-3 h-3 animate-spin" /> : "✨"}
                {generatingScript ? (retryInfo ? `Retrying (${retryInfo.attempt}/${retryInfo.maxRetries})...` : "Generating...") : "AI Write"}
              </button>
            </div>
            <textarea value={voiceoverScript} onChange={e => { setVoiceoverScript(e.target.value); setVoiceoverApproved(false); }}
              placeholder="Write or generate your voiceover script..."
              rows={4} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-purple-700 placeholder:text-gray-400" />
          </div>
          {/* Voiceover Narrator — used in final render */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 block">Voiceover Narrator</label>
            <p className="text-[10px] text-gray-400 mb-2">Select the narrator voice for the final rendered video.</p>
            <Select value={narratorVoice} onValueChange={handleSelectNarrator}>
              <SelectTrigger className="w-full rounded-xl h-10 text-sm">
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
          <Button onClick={handleRenderVoiceover} disabled={rendering || !voiceoverScript.trim()}
            className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-10">
            {rendering ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating voiceover...</> : <><Mic className="w-4 h-4" /> Generate Voiceover</>}
          </Button>
          {voiceoverUrl && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-800 mb-2">{voiceoverApproved ? "✓ Voiceover approved" : "✓ Voiceover ready — preview and approve"}</p>
              <audio controls src={voiceoverUrl} className="w-full" style={{ height: "36px" }} />
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => setVoiceoverApproved(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${voiceoverApproved ? "bg-emerald-600 text-white" : "bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}>
                  <Check className="w-3.5 h-3.5" /> {voiceoverApproved ? "Approved" : "Approve Voiceover"}
                </button>
                <a href={voiceoverUrl} download="voiceover.mp3" className="text-[10px] text-purple-700 underline">Download MP3</a>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Format */}
      <Section sectionKey="format" label="Landscape / Portrait" icon={Monitor} desc="Choose your video orientation">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setOrientation("landscape")}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${orientation === "landscape" ? "border-purple-700 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
            <Monitor className={`w-8 h-8 ${orientation === "landscape" ? "text-purple-700" : "text-gray-400"}`} />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Landscape</p>
              <p className="text-xs text-gray-500">16:9 · YouTube, Facebook</p>
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
      <Section sectionKey="brandkit" label="Agent Profile Branding" icon={Star} desc="Apply your logo, profile photo and contact info">
        <div className="space-y-2">
          {brandKits.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-2">No agent profiles set up yet.</p>
              <Link to="/brand-kits" className="text-sm text-purple-700 underline">Create Agent Profile →</Link>
            </div>
          ) : (
            brandKits.map(kit => (
              <button key={kit.id} onClick={() => setSelectedBrandKitId(kit.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${selectedBrandKitId === kit.id ? "border-purple-700 bg-purple-50" : "border-gray-100 hover:border-gray-200"}`}>
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

      {/* Render Video */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-sm font-semibold text-gray-900 mb-1">🎬 Render Video</p>
        <p className="text-xs text-gray-400 mb-4">Submit to the Modal render engine to generate your final video.</p>
        <Button onClick={handleRenderVideo} disabled={submittingRender || !photos.length || (!!voiceoverUrl && !voiceoverApproved)}
          className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl gap-2 h-11">
          {submittingRender
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            : <><Play className="w-4 h-4" /> Render Video</>}
        </Button>
        {voiceoverUrl && !voiceoverApproved && (
          <p className="text-xs text-amber-600 mt-2 text-center">⚠️ Preview and approve the voiceover above before rendering.</p>
        )}
      </div>
    </div>
  );
}