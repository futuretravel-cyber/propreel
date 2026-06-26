import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Play, Pause, Download, Monitor, Smartphone, Layers, Music, Mic, Star, Check, Wand2, User, Loader2, Share2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import BrandingPreview from "@/components/studio/BrandingPreview";
import VoiceoverSelector from "@/components/studio/VoiceoverSelector";
import ElevenLabsVoiceover from "@/components/studio/ElevenLabsVoiceover";
import AIPhotoEditor from "@/components/studio/AIPhotoEditor";
import AvatarSelector from "@/components/studio/AvatarSelector";
import HeyGenAvatar from "@/components/studio/HeyGenAvatar";
import VideoExportModal from "@/components/studio/VideoExportModal";
import SlideshowPlayer from "@/components/studio/SlideshowPlayer";
import CreatomateTemplates from "@/components/studio/CreatomateTemplates";

const INTRO_TEMPLATES = ["None", "Address Reveal", "Open House", "Just Listed", "Price Drop", "Luxury Feature", "Simple"];
const OUTRO_TEMPLATES = ["None", "Agent Card", "Contact Block", "Agency Logo"];

const sidebarTabs = [
  { key: "templates",   label: "Templates", icon: Layers },
  { key: "brandkit",    label: "Brand Kit", icon: Star },
  { key: "music",       label: "Music",     icon: Music },
  { key: "voiceover",   label: "Voice",     icon: Mic },
  { key: "avatar",      label: "Avatar",    icon: User },
  { key: "photos",      label: "AI Edits",  icon: Wand2 },
  { key: "creatomate",  label: "Export",    icon: Video },
];

export default function Studio() {
  const { id } = useParams();
  const { toast } = useToast();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [activeTab, setActiveTab] = useState("templates");
  const [orientation, setOrientation] = useState("landscape");
  const [previewMode, setPreviewMode] = useState("intro");
  const [introTemplate, setIntroTemplate] = useState("Address Reveal");
  const [outroTemplate, setOutroTemplate] = useState("Agent Card");
  const [heading, setHeading] = useState("");
  const [subheading, setSubheading] = useState("");
  const [brandKits, setBrandKits] = useState([]);
  const [selectedBrandKitId, setSelectedBrandKitId] = useState(null);
  const [musicTracks, setMusicTracks] = useState([]);
  const [musicTrack, setMusicTrack] = useState(null);
  const [voiceoverScript, setVoiceoverScript] = useState("");
  const [voiceoverVoice, setVoiceoverVoice] = useState("alloy");
  const [selectedAvatarId, setSelectedAvatarId] = useState(null);
  const [clips, setClips] = useState([]);
  const [voiceoverUrl, setVoiceoverUrl] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [voiceEngine, setVoiceEngine] = useState("builtin"); // "builtin" | "elevenlabs"
  const [avatarEngine, setAvatarEngine] = useState("builtin"); // "builtin" | "heygen"

  useEffect(() => {
    Promise.all([
      base44.entities.Project.get(id),
      base44.entities.BrandKit.list(),
      base44.entities.MusicTrack.filter({ is_active: true }, "-created_date", 50),
    ]).then(([p, kits, tracks]) => {
      setProject(p);
      setOrientation(p.orientation || "landscape");
      setIntroTemplate(p.intro_template || "Address Reveal");
      setOutroTemplate(p.outro_template || "Agent Card");
      setHeading(p.intro_heading || "");
      setSubheading(p.intro_subheading || "");
      setSelectedBrandKitId(p.brand_kit_id || null);
      setVoiceoverScript(p.voiceover_script || "");
      setVoiceoverVoice(p.voiceover_voice || "alloy");
      setVoiceoverUrl(p.voiceover_url || "");
      setClips(p.selected_photo_ids?.length ? p.selected_photo_ids : p.photos || []);
      setBrandKits(kits);
      setMusicTracks(tracks);
      const savedTrack = tracks.find(t => t.name === p.music_track) || (tracks.length ? tracks[0] : null);
      if (savedTrack) {
        setMusicTrack(savedTrack.id);
        setMusicUrl(savedTrack.file_url || "");
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    const selectedTrack = musicTracks.find(t => t.id === musicTrack);
    try {
      await base44.entities.Project.update(id, {
        intro_template: introTemplate,
        outro_template: outroTemplate,
        intro_heading: heading,
        intro_subheading: subheading,
        brand_kit_id: selectedBrandKitId || "",
        music_track: selectedTrack?.name || "",
        music_url: selectedTrack?.file_url || "",
        voiceover_script: voiceoverScript,
        voiceover_voice: voiceoverVoice,
        orientation,
      });
      toast({ title: "Saved!" });
    } catch {}
    setSaving(false);
  };

  const handleRenderVoiceover = async () => {
    if (!voiceoverScript.trim()) return;
    setRendering(true);
    try {
      const result = await base44.integrations.Core.GenerateSpeech({
        text: voiceoverScript,
        voice: voiceoverVoice,
        language_code: "en",
      });
      setVoiceoverUrl(result.url);
      await base44.entities.Project.update(id, { voiceover_url: result.url });
      toast({ title: "Voiceover generated!", description: "Your narration is ready." });
    } catch {
      toast({ title: "Voiceover failed", variant: "destructive" });
    }
    setRendering(false);
  };

  const handlePhotoReplaced = (idx, newUrl) => {
    setClips(prev => {
      const next = [...prev];
      next[idx] = newUrl;
      return next;
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#21ABB5] rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-[#0F082B] mb-2">Project not found</h2>
        <Link to="/projects" className="text-[#21ABB5] text-sm hover:underline">Back to projects</Link>
      </div>
    );
  }

  const selectedBrandKit = brandKits.find(k => k.id === selectedBrandKitId) || null;
  const selectedTrack = musicTracks.find(t => t.id === musicTrack);

  return (
    <div className="-m-4 lg:-m-8 min-h-screen bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 h-14 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link to={`/projects/${id}`} className="text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#21ABB5] flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">AR</span>
            </div>
            <span className="text-sm font-semibold text-[#0F082B] truncate max-w-[200px]">{project.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="rounded-lg gap-2 text-xs">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            size="sm"
            onClick={() => setShowExport(true)}
            className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-lg gap-2 text-xs px-4"
          >
            <Share2 className="w-3.5 h-3.5" /> Export & Share
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Icon sidebar */}
        <div className="w-16 bg-gray-50 border-r border-gray-100 flex flex-col items-center py-3 gap-1 flex-shrink-0">
          {sidebarTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              title={tab.label}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                activeTab === tab.key ? "bg-[#21ABB5] text-white shadow-sm" : "text-[#606060] hover:bg-gray-200"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="text-[9px] font-medium leading-none">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Control panel */}
        <div className="w-72 border-r border-gray-100 overflow-y-auto flex-shrink-0 bg-white">
          <div className="p-4">

            {activeTab === "templates" && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-[#0F082B] mb-2">Template style</p>
                  <div className="flex gap-1 mb-3">
                    <button onClick={() => setPreviewMode("intro")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${previewMode === "intro" ? "bg-[#21ABB5] text-white" : "bg-gray-100 text-[#606060]"}`}>Intro</button>
                    <button onClick={() => setPreviewMode("outro")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${previewMode === "outro" ? "bg-[#21ABB5] text-white" : "bg-gray-100 text-[#606060]"}`}>Outro</button>
                  </div>

                  {previewMode === "intro" && (
                    <>
                      <p className="text-[10px] text-[#606060] mb-2">Select an intro template</p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {INTRO_TEMPLATES.map((t) => (
                          <button key={t} onClick={() => setIntroTemplate(t)}
                            className={`aspect-video rounded-lg border-2 text-[10px] font-medium flex items-center justify-center p-1 text-center transition-all ${
                              introTemplate === t ? "border-[#21ABB5] bg-[#DEF5F7]/30 text-[#21ABB5]" : "border-gray-200 text-[#606060] hover:border-gray-300 bg-gray-50"}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-medium text-[#606060] mb-1 block">Heading</label>
                          <input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder={project.name} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]" />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-[#606060] mb-1 block">Subheading</label>
                          <input value={subheading} onChange={(e) => setSubheading(e.target.value)} placeholder="Subtitle..." className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]" />
                        </div>
                      </div>
                    </>
                  )}

                  {previewMode === "outro" && (
                    <>
                      <p className="text-[10px] text-[#606060] mb-2">Select an outro template</p>
                      <div className="grid grid-cols-2 gap-2">
                        {OUTRO_TEMPLATES.map((t) => (
                          <button key={t} onClick={() => setOutroTemplate(t)}
                            className={`aspect-video rounded-lg border-2 text-[10px] font-medium flex items-center justify-center p-1 text-center transition-all ${
                              outroTemplate === t ? "border-[#21ABB5] bg-[#DEF5F7]/30 text-[#21ABB5]" : "border-gray-200 text-[#606060] hover:border-gray-300 bg-gray-50"}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === "brandkit" && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[#0F082B]">Brand Kit</p>
                <p className="text-[10px] text-[#606060]">Auto-applies your logo, profile photo, name and contact info to the video.</p>
                {brandKits.length === 0 ? (
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-[#606060] mb-2">No brand kits yet.</p>
                    <Link to="/brand-kits" className="text-xs text-[#21ABB5] underline">Create a Brand Kit →</Link>
                  </div>
                ) : (
                  brandKits.map((kit) => (
                    <button key={kit.id} onClick={() => setSelectedBrandKitId(kit.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${selectedBrandKitId === kit.id ? "border-[#21ABB5] bg-[#DEF5F7]/30" : "border-gray-100 hover:border-gray-200"}`}>
                      {kit.profile_photo_url ? (
                        <img src={kit.profile_photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#DEF5F7] flex items-center justify-center text-xs font-bold text-[#21ABB5] flex-shrink-0">
                          {kit.agent_name?.[0]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#0F082B] truncate">{kit.name}</p>
                        <p className="text-[10px] text-[#606060] truncate">{kit.agent_name}</p>
                        {kit.email && <p className="text-[10px] text-[#606060] truncate">{kit.email}</p>}
                      </div>
                      {selectedBrandKitId === kit.id && <Check className="w-4 h-4 text-[#21ABB5] flex-shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            )}

            {activeTab === "music" && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[#0F082B]">Music</p>
                <p className="text-[10px] text-[#606060]">Select a background track for your video.</p>
                {musicTracks.length === 0 ? (
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <Music className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                    <p className="text-xs text-[#606060]">No music tracks available.</p>
                  </div>
                ) : (
                  musicTracks.map((track) => (
                    <button key={track.id} onClick={() => { setMusicTrack(track.id); setMusicUrl(track.file_url || ""); }}
                      className={`w-full flex items-center gap-2.5 rounded-xl p-2.5 transition-all border ${musicTrack === track.id ? "border-[#21ABB5] bg-[#DEF5F7]/20" : "bg-gray-50 border-transparent hover:border-gray-200"}`}>
                      <div onClick={(e) => { e.stopPropagation(); new Audio(track.file_url).play(); }}
                        className="w-7 h-7 rounded-full bg-[#21ABB5] flex items-center justify-center flex-shrink-0 hover:bg-[#1a9da6]">
                        <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-xs font-medium text-[#0F082B] truncate">{track.name}</p>
                        <p className="text-[10px] text-[#606060]">{track.genre}{track.duration ? ` · ${track.duration}` : ""}</p>
                      </div>
                      {musicTrack === track.id && <Check className="w-3.5 h-3.5 text-[#21ABB5] flex-shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            )}

            {activeTab === "voiceover" && (
              <div className="space-y-3">
                {/* Engine toggle */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  <button onClick={() => setVoiceEngine("builtin")} className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${voiceEngine === "builtin" ? "bg-white text-[#0F082B] shadow-sm" : "text-[#606060]"}`}>
                    Built-in AI
                  </button>
                  <button onClick={() => setVoiceEngine("elevenlabs")} className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${voiceEngine === "elevenlabs" ? "bg-white text-[#21ABB5] shadow-sm" : "text-[#606060]"}`}>
                    ElevenLabs ✨
                  </button>
                </div>

                {voiceEngine === "builtin" ? (
                  <>
                    <VoiceoverSelector
                      script={voiceoverScript}
                      setScript={setVoiceoverScript}
                      selectedVoice={voiceoverVoice}
                      setSelectedVoice={setVoiceoverVoice}
                      projectName={project.name}
                      heading={heading}
                      subheading={subheading}
                      photoCount={clips.length}
                    />
                    {voiceoverScript.trim() && (
                      <Button onClick={handleRenderVoiceover} disabled={rendering} className="w-full bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-xl gap-2 text-sm">
                        {rendering ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Mic className="w-4 h-4" /> Generate Voiceover</>}
                      </Button>
                    )}
                  </>
                ) : (
                  <ElevenLabsVoiceover
                    script={voiceoverScript}
                    setScript={setVoiceoverScript}
                    selectedVoice={voiceoverVoice}
                    setSelectedVoice={setVoiceoverVoice}
                    projectName={project.name}
                    heading={heading}
                    subheading={subheading}
                    photoCount={clips.length}
                    onVoiceoverReady={(url) => {
                      setVoiceoverUrl(url);
                      base44.entities.Project.update(id, { voiceover_url: url });
                    }}
                  />
                )}

                {voiceoverUrl && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-xs font-semibold text-emerald-800 mb-2">✓ Voiceover ready</p>
                    <audio controls src={voiceoverUrl} className="w-full" style={{ height: "32px" }} />
                    <a href={voiceoverUrl} download="voiceover.mp3" className="text-[10px] text-[#21ABB5] underline mt-1 block">Download MP3</a>
                  </div>
                )}
              </div>
            )}

            {activeTab === "avatar" && (
              <div className="space-y-3">
                {/* Engine toggle */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  <button onClick={() => setAvatarEngine("builtin")} className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${avatarEngine === "builtin" ? "bg-white text-[#0F082B] shadow-sm" : "text-[#606060]"}`}>
                    AI Image
                  </button>
                  <button onClick={() => setAvatarEngine("heygen")} className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${avatarEngine === "heygen" ? "bg-white text-purple-600 shadow-sm" : "text-[#606060]"}`}>
                    HeyGen 🎬
                  </button>
                </div>
                {avatarEngine === "builtin" ? (
                  <AvatarSelector
                    selectedAvatarId={selectedAvatarId}
                    setSelectedAvatarId={setSelectedAvatarId}
                    project={project}
                  />
                ) : (
                  <HeyGenAvatar
                    selectedAvatarId={selectedAvatarId}
                    setSelectedAvatarId={setSelectedAvatarId}
                    script={voiceoverScript}
                    voiceId={voiceoverVoice}
                    onAvatarVideoReady={(url) => toast({ title: "Avatar video ready!", description: "Download it from the Avatar panel." })}
                  />
                )}
              </div>
            )}

            {activeTab === "photos" && clips.length > 0 && (
              <AIPhotoEditor
                photos={clips}
                onPhotoReplaced={handlePhotoReplaced}
              />
            )}

            {activeTab === "photos" && clips.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-[#606060]">No photos in this project yet.</p>
              </div>
            )}

            {activeTab === "creatomate" && (
              <CreatomateTemplates
                project={project}
                brandKit={brandKits.find(k => k.id === selectedBrandKitId) || null}
                voiceoverUrl={voiceoverUrl}
                musicUrl={musicUrl}
              />
            )}
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 bg-gray-50 flex flex-col items-center justify-start p-6 gap-4 overflow-auto">
          <div className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-[#0F082B]">Live Preview</p>
              <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                <button onClick={() => setOrientation("portrait")}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${orientation === "portrait" ? "bg-[#21ABB5] text-white" : "text-[#606060]"}`}>
                  <Smartphone className="w-3 h-3" /> Portrait
                </button>
                <button onClick={() => setOrientation("landscape")}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${orientation === "landscape" ? "bg-[#21ABB5] text-white" : "text-[#606060]"}`}>
                  <Monitor className="w-3 h-3" /> Landscape
                </button>
              </div>
            </div>

            {/* Slideshow player for live preview */}
            {clips.length > 0 ? (
              <SlideshowPlayer
                photos={clips}
                voiceoverUrl={voiceoverUrl}
                musicUrl={musicUrl}
                brandKit={selectedBrandKit}
                introTemplate={introTemplate}
                outroTemplate={outroTemplate}
                heading={heading || project.name}
                subheading={subheading}
                orientation={orientation}
                clipDuration={project.clip_duration || 5}
              />
            ) : (
              <>
                {/* Static branding preview when no clips */}
                <div className={`rounded-2xl overflow-hidden border border-gray-200 shadow-lg mx-auto ${orientation === "portrait" ? "aspect-[9/16] max-w-[220px]" : "aspect-video w-full"}`}>
                  <BrandingPreview
                    orientation={orientation}
                    introTemplate={introTemplate}
                    outroTemplate={outroTemplate}
                    heading={heading || project.name}
                    subheading={subheading}
                    brandKit={selectedBrandKit}
                    previewMode={previewMode}
                  />
                </div>

                <div className="flex gap-1 mt-3 bg-white border border-gray-200 rounded-xl p-1">
                  {["intro", "video", "outro"].map((m) => (
                    <button key={m} onClick={() => setPreviewMode(m)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${previewMode === m ? "bg-[#21ABB5] text-white" : "text-[#606060] hover:text-[#0F082B]"}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Summary */}
            <div className="mt-3 bg-white rounded-xl border border-gray-200 p-3 space-y-1.5">
              <p className="text-[10px] text-[#606060]"><span className="font-semibold text-[#0F082B]">Intro:</span> {introTemplate}</p>
              <p className="text-[10px] text-[#606060]"><span className="font-semibold text-[#0F082B]">Outro:</span> {outroTemplate}</p>
              <p className="text-[10px] text-[#606060]"><span className="font-semibold text-[#0F082B]">Music:</span> {selectedTrack?.name || "None"}</p>
              {selectedBrandKit && <p className="text-[10px] text-[#606060]"><span className="font-semibold text-[#0F082B]">Brand Kit:</span> {selectedBrandKit.name}</p>}
              {voiceoverUrl && <p className="text-[10px] text-emerald-700 font-semibold">✓ Voiceover ready</p>}
              {selectedAvatarId && <p className="text-[10px] text-[#606060]"><span className="font-semibold text-[#0F082B]">Avatar:</span> {selectedAvatarId}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Export modal */}
      {showExport && (
        <VideoExportModal
          project={project}
          photos={clips}
          voiceoverUrl={voiceoverUrl}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}