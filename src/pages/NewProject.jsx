import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Check, Upload, Link as LinkIcon, Cloud, X, GripVertical, Monitor, Smartphone, Wand2, Sparkles, Music, Mic, Play, Download, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import VFXSelector from "@/components/studio/VFXSelector";
import BrandingPreview from "@/components/studio/BrandingPreview";
import VoiceoverSelector from "@/components/studio/VoiceoverSelector";

const stepLabels = ["Create", "Upload Photos", "Edit Photos", "Select Photos", "Video Settings", "Branding"];

// Each photo gets at least 5 seconds — real estate viewers need time to absorb each scene
function getClipDuration(count) {
  return 5;
}

export default function NewProject() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [orientation, setOrientation] = useState("landscape");
  const [resolution, setResolution] = useState("1080p");
  const [aiEngine, setAiEngine] = useState("v25");
  const [importUrl, setImportUrl] = useState("");
  const [uploadTab, setUploadTab] = useState("device");
  const [vfxEffects, setVfxEffects] = useState({});
  const [globalCameraMotion, setGlobalCameraMotion] = useState("Auto");
  const [globalVfxEffects, setGlobalVfxEffects] = useState([]);
  const [introTemplate, setIntroTemplate] = useState("Address Reveal");
  const [outroTemplate, setOutroTemplate] = useState("Agent Card");
  const [heading, setHeading] = useState("");
  const [subheading, setSubheading] = useState("");
  const [musicTracks, setMusicTracks] = useState([]);
  const [musicTrack, setMusicTrack] = useState(null); // will be set to first track id
  const [voiceoverScript, setVoiceoverScript] = useState("");
  const [voiceoverVoice, setVoiceoverVoice] = useState("alloy");
  const [renderStatus, setRenderStatus] = useState(null); // null | 'generating_voiceover' | 'generating_video' | 'done'
  const [brandingTab, setBrandingTab] = useState("Templates");
  const [previewMode, setPreviewMode] = useState("intro");
  const [brandKits, setBrandKits] = useState([]);
  const [selectedBrandKitId, setSelectedBrandKitId] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  // Resume a draft project if ?resume=id is in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    if (resumeId) {
      base44.entities.Project.get(resumeId).then((p) => {
        setProjectId(p.id);
        setProjectName(p.name || "");
        setPhotos(p.photos || []);
        setSelectedPhotos(p.selected_photo_ids || []);
        setOrientation(p.orientation || "landscape");
        setResolution(p.resolution || "1080p");
        setAiEngine(p.ai_engine || "v25");
        setHeading(p.intro_heading || "");
        setSubheading(p.intro_subheading || "");
        setVoiceoverScript(p.voiceover_script || "");
        setVoiceoverVoice(p.voiceover_voice || "alloy");
        setIntroTemplate(p.intro_template || "Address Reveal");
        setOutroTemplate(p.outro_template || "Agent Card");
        setSelectedBrandKitId(p.brand_kit_id || null);
        setStep(1); // resume from upload step
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    base44.entities.BrandKit.filter({ is_default: true }).then((kits) => {
      if (kits.length) setSelectedBrandKitId(kits[0].id);
    });
    base44.entities.BrandKit.list().then(setBrandKits);
    base44.entities.MusicTrack.filter({ is_active: true }, "-created_date", 50).then((tracks) => {
      setMusicTracks(tracks);
      if (tracks.length) setMusicTrack(tracks[0].id);
    });
  }, []);

  const selectedBrandKit = brandKits.find((k) => k.id === selectedBrandKitId) || null;
  const totalVfxCount = Object.keys(vfxEffects).length;

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    setLoading(true);
    try {
      const p = await base44.entities.Project.create({ name: projectName, status: "draft" });
      setProjectId(p.id);
      navigate(`/projects/${p.id}/studio`);
    } catch {
      toast({ title: "Failed to create project", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    setLoading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const res = await base44.integrations.Core.UploadFile({ file });
        uploaded.push(res.file_url);
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setLoading(false);
  };

  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const togglePhotoSelection = (url) => {
    setSelectedPhotos((prev) =>
      prev.includes(url) ? prev.filter((p) => p !== url) : prev.length < 20 ? [...prev, url] : prev
    );
  };

  const handleSaveDraft = async () => {
    if (!projectId) return;
    setSavingDraft(true);
    try {
      await base44.entities.Project.update(projectId, {
        photos,
        selected_photo_ids: selectedPhotos,
        orientation,
        resolution,
        ai_engine: aiEngine,
        intro_heading: heading || projectName,
        intro_subheading: subheading,
        voiceover_script: voiceoverScript,
        voiceover_voice: voiceoverVoice,
        intro_template: introTemplate,
        outro_template: outroTemplate,
        brand_kit_id: selectedBrandKitId || "",
        status: "draft",
      });
      toast({ title: "Project saved", description: "You can continue anytime from your dashboard." });
      navigate("/dashboard");
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
    setSavingDraft(false);
  };

  const handleDragStart = (index) => { dragItem.current = index; };
  const handleDragEnter = (index) => { dragOver.current = index; };
  const handleDragEnd = () => {
    const from = dragItem.current;
    const to = dragOver.current;
    if (from === null || to === null || from === to) return;
    setSelectedPhotos((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      return updated;
    });
    dragItem.current = null;
    dragOver.current = null;
  };

  const handleSaveAndRender = async () => {
    setLoading(true);
    const selectedTrack = musicTracks.find((t) => t.id === musicTrack);
    const clipDuration = getClipDuration(selectedPhotos.length);
    const totalDuration = Math.round(selectedPhotos.length * clipDuration);
    try {
      // Step 1: Save all project settings
      await base44.entities.Project.update(projectId, {
        photos,
        selected_photo_ids: selectedPhotos,
        orientation,
        resolution,
        ai_engine: aiEngine,
        camera_motions: { global: globalCameraMotion },
        vfx_effects: { global: globalVfxEffects },
        music_track: selectedTrack?.name || "",
        voiceover_script: voiceoverScript,
        voiceover_voice: voiceoverVoice,
        intro_template: introTemplate,
        outro_template: outroTemplate,
        intro_heading: heading || projectName,
        intro_subheading: subheading,
        brand_kit_id: selectedBrandKitId || "",
        status: "processing",
        current_step: 6,
      });

      // Step 2: Generate AI voiceover if script provided
      let voiceoverUrl = null;
      if (voiceoverScript.trim()) {
        setRenderStatus("generating_voiceover");
        try {
          const result = await base44.integrations.Core.GenerateSpeech({
            text: voiceoverScript,
            voice: voiceoverVoice,
            language_code: "en",
          });
          voiceoverUrl = result.url;
        } catch {
          // non-fatal
        }
      }

      // Step 3: Save everything and mark ready — slideshow plays in-browser using actual uploaded photos
      setRenderStatus("generating_video");
      const coverPhoto = selectedPhotos[0] || photos[0] || "";
      const musicUrl = selectedTrack?.file_url || "";

      await base44.entities.Project.update(projectId, {
        status: "ready",
        thumbnail_url: coverPhoto,
        voiceover_url: voiceoverUrl || "",
        music_url: musicUrl,
        clip_duration: clipDuration,
        credits_used: 1,
      });

      setRenderStatus("done");
      toast({ title: "Video ready! 🎬", description: `Your ${selectedPhotos.length}-photo slideshow is ready (${totalDuration}s total).` });
      navigate(`/projects/${projectId}/studio`);
    } catch (err) {
      toast({ title: "Failed to start render", variant: "destructive" });
    }
    setLoading(false);
    setRenderStatus(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress bar + Save & Exit */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 flex-wrap flex-1">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i <= step ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-400"
                }`}>
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`hidden sm:block text-xs font-medium mr-1 ${i <= step ? "text-[#0F082B]" : "text-gray-400"}`}>{label}</span>
                {i < stepLabels.length - 1 && (
                  <div className={`hidden sm:block w-6 lg:w-10 h-0.5 ${i < step ? "bg-purple-700" : "bg-gray-200"}`} />
                )}
              </div>
            ))}
          </div>
          {step > 0 && projectId && (
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={savingDraft}
              className="rounded-xl gap-2 text-xs ml-4 shrink-0"
            >
              {savingDraft ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {savingDraft ? "Saving..." : "Save & Exit"}
            </Button>
          )}
        </div>
      </div>

      {/* Step 1: Create */}
      {step === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-[#0F082B] mb-2">Create a Project</h2>
          <p className="text-sm text-[#606060] mb-6">Enter the property address or a name for your project.</p>
          <div className="max-w-md">
            <label className="text-sm font-medium text-[#0F082B] mb-1.5 block">Project name</label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. 12 Clifton Road, Cape Town"
              className="rounded-xl h-11 mb-4"
            />
            <Button
              onClick={handleCreateProject}
              disabled={!projectName.trim() || loading}
              className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl h-11 px-6 gap-2"
            >
              {loading ? "Creating..." : <>Create project <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Upload Photos */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-[#0F082B] mb-2">Upload Photos</h2>
          <p className="text-sm text-[#606060] mb-6">Add listing photos for your property video.</p>

          <div className="flex gap-2 mb-6">
            {[
              { key: "device", label: "From device", icon: Upload },
              { key: "property24", label: "Property24", icon: LinkIcon },
              { key: "dropbox", label: "Dropbox", icon: Cloud },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setUploadTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  uploadTab === tab.key ? "bg-purple-50 text-purple-700" : "bg-gray-50 text-[#606060] hover:bg-gray-100"
                }`}
              >
                <tab.icon className="w-4 h-4" /> {tab.label}
              </button>
            ))}
          </div>

          {uploadTab === "device" && (
            <label className="block border-2 border-dashed border-purple-200 rounded-2xl p-10 text-center cursor-pointer hover:bg-purple-50/30 transition-colors">
              <Upload className="w-10 h-10 text-purple-700 mx-auto mb-3" />
              <p className="text-sm font-medium text-[#0F082B] mb-1">Drag & drop listing photos here, or click to browse</p>
              <p className="text-xs text-[#606060]">JPG, PNG up to 25MB</p>
              <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          )}

          {uploadTab === "property24" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="Paste your Property24 listing URL"
                  className="rounded-xl h-11 flex-1"
                />
                <Button className="bg-purple-700 hover:bg-purple-800 text-white rounded-xl h-11 px-6">Import</Button>
              </div>
              <p className="text-xs text-[#606060]">e.g. https://www.property24.com/for-sale/sandton/12345</p>
            </div>
          )}

          {uploadTab === "dropbox" && (
            <div className="text-center py-8">
              <Cloud className="w-10 h-10 text-[#606060] mx-auto mb-3" />
              <Button variant="outline" className="rounded-xl">Connect Dropbox</Button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-3 border-gray-200 border-t-purple-700 rounded-full animate-spin" />
              <span className="ml-3 text-sm text-[#606060]">Uploading...</span>
            </div>
          )}

          {photos.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-[#0F082B]">{photos.length} / 20 photos uploaded</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {photos.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                    <div className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8">
            <Button variant="outline" onClick={() => setStep(0)} className="rounded-xl gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button
              onClick={() => { setSelectedPhotos([...photos]); setStep(2); }}
              disabled={photos.length === 0}
              className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-6 gap-2"
            >
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Photo Editing */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-[#0F082B] mb-2">Photo Editing & Virtual Staging</h2>
          <p className="text-sm text-[#606060] mb-6">Enhance your photos with AI. This step is optional.</p>

          <div className="flex gap-4 mb-6">
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-purple-50 text-purple-700">
              <Wand2 className="w-4 h-4" /> AI Photo Edits
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-50 text-[#606060] hover:bg-gray-100">
              <Sparkles className="w-4 h-4" /> Virtual Staging
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {photos.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group cursor-pointer hover:ring-2 hover:ring-purple-700 transition-all">
                 <img src={url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                  <Button
                    size="sm"
                    className="bg-purple-700 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                  >
                    <Wand2 className="w-3 h-3 mr-1" /> AI Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-purple-50/50 rounded-xl p-4 mt-6">
            <p className="text-sm text-[#606060]">
              <strong className="text-[#0F082B]">Pro Tip:</strong> AI photo edits include sky replacement, twilight conversion, lawn greening, and furniture removal. Virtual staging lets you furnish empty rooms with SA furniture styles.
            </p>
          </div>

          <div className="flex justify-between mt-8">
            <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-6 gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Select Photos for Video */}
      {step === 3 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-[#0F082B] mb-2">Select Photos for Video</h2>
          <p className="text-sm text-[#606060] mb-6">Choose and order the photos for your video. Each photo becomes a ~3-second clip.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-[#0F082B] mb-3">All Photos</h3>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((url, i) => {
                  const selected = selectedPhotos.includes(url);
                  return (
                    <button
                      key={i}
                      onClick={() => togglePhotoSelection(url)}
                      className={`relative aspect-square rounded-xl overflow-hidden ${selected ? "ring-2 ring-purple-700" : "hover:ring-2 hover:ring-gray-300"} transition-all`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {selected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-purple-700 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#0F082B] mb-3">
                Selected for video ({selectedPhotos.length} photos ≈ {Math.round(selectedPhotos.length * getClipDuration(selectedPhotos.length))}s)
              </h3>
              {selectedPhotos.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-sm text-[#606060]">
                  Click photos to add them to your video
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-purple-700" />
                    <span className="text-xs text-[#606060]">VFX: {totalVfxCount}/3 used across all clips</span>
                  </div>
                  {selectedPhotos.map((url, i) => (
                    <div
                      key={url}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragEnter={() => handleDragEnter(i)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className="flex items-center gap-3 bg-gray-50 rounded-xl p-2 cursor-grab active:opacity-60 active:scale-95 transition-all"
                    >
                      <GripVertical className="w-4 h-4 text-gray-400" />
                      <img src={url} alt="" className="w-12 h-12 rounded-lg object-cover pointer-events-none" />
                      <span className="text-xs text-[#606060] flex-1">Clip {i + 1}</span>
                      <VFXSelector
                        photoIndex={i}
                        vfxEffects={vfxEffects}
                        setVfxEffects={setVfxEffects}
                        totalVfxCount={totalVfxCount}
                      />
                      <button onClick={() => togglePhotoSelection(url)} className="p-1">
                        <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between mt-8">
            <Button variant="outline" onClick={() => setStep(2)} className="rounded-xl gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button
              onClick={() => setStep(4)}
              disabled={selectedPhotos.length === 0}
              className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-6 gap-2"
            >
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Video Settings */}
      {step === 4 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-[#0F082B] mb-2">Video Settings</h2>
          <p className="text-sm text-[#606060] mb-6">Configure your video orientation, effects, and render settings.</p>

          <div className="space-y-8">
            {/* Orientation */}
            <div>
              <h3 className="text-sm font-semibold text-[#0F082B] mb-3">Orientation</h3>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                {[
                  { key: "landscape", label: "Landscape (16:9)", icon: Monitor, desc: "Best for Property24, YouTube, Facebook, LinkedIn" },
                  { key: "portrait", label: "Portrait (9:16)", icon: Smartphone, desc: "Best for Instagram Reels, TikTok" },
                ].map((o) => (
                  <button
                    key={o.key}
                    onClick={() => setOrientation(o.key)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      orientation === o.key ? "border-purple-700 bg-purple-50/30" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <o.icon className={`w-6 h-6 mb-2 ${orientation === o.key ? "text-purple-700" : "text-gray-400"}`} />
                    <p className="text-sm font-semibold text-[#0F082B]">{o.label}</p>
                    <p className="text-xs text-[#606060] mt-1">{o.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Camera Motion */}
            <div>
              <h3 className="text-sm font-semibold text-[#0F082B] mb-3">Camera Motion</h3>
              <p className="text-xs text-[#606060] mb-3">Default: Auto (AI picks the best motion for each clip)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-md">
                {["Auto", "Push In", "Push Out", "Orbit Left", "Orbit Right"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setGlobalCameraMotion(m)}
                    className={`text-xs text-center rounded-lg py-2 px-3 border-2 transition-all font-medium ${
                      globalCameraMotion === m
                        ? "border-purple-700 bg-purple-50/30 text-purple-700"
                        : "bg-gray-50 border-gray-100 text-[#606060] hover:border-gray-300"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Render Settings */}
            <div>
              <h3 className="text-sm font-semibold text-[#0F082B] mb-3">Render Settings</h3>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="text-xs text-[#606060] mb-1 block">AI Engine</label>
                  <select
                    value={aiEngine}
                    onChange={(e) => setAiEngine(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 h-10 text-sm outline-none"
                  >
                    <option value="v25">v25 (Latest)</option>
                    <option value="v24">v24</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#606060] mb-1 block">Resolution</label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 h-10 text-sm outline-none"
                  >
                    <option value="1080p">1080p (HD)</option>
                    <option value="720p">720p (Faster)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* VFX */}
            <div>
              <h3 className="text-sm font-semibold text-[#0F082B] mb-3">Visual Effects (VFX)</h3>
              <p className="text-xs text-[#606060] mb-3">Apply up to 3 VFX effects to your video clips.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                {[
                  { name: "Day to Dusk", desc: "Transforms daytime shot into twilight timelapse" },
                  { name: "Catch the Sunshine", desc: "Morning to daytime timelapse" },
                  { name: "Virtual Staging", desc: "Animates empty room to furnished" },
                  { name: "Lifestyle", desc: "Adds warm lived-in feel" },
                  { name: "Pencil Sketch", desc: "Artistic illustrated look" },
                ].map((vfx) => {
                  const selected = globalVfxEffects.includes(vfx.name);
                  const disabled = !selected && globalVfxEffects.length >= 3;
                  return (
                    <button
                      key={vfx.name}
                      onClick={() => setGlobalVfxEffects((prev) =>
                        prev.includes(vfx.name) ? prev.filter((v) => v !== vfx.name) : [...prev, vfx.name]
                      )}
                      disabled={disabled}
                      className={`flex items-center gap-3 rounded-xl p-3 border-2 text-left transition-all ${
                        selected
                          ? "border-purple-700 bg-purple-50/30"
                          : disabled
                          ? "bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed"
                          : "bg-gray-50 border-gray-100 hover:border-gray-300"
                      }`}
                    >
                      <Sparkles className={`w-4 h-4 flex-shrink-0 ${selected ? "text-purple-700" : "text-[#606060]"}`} />
                       <div>
                        <p className={`text-sm font-medium ${selected ? "text-purple-700" : "text-[#0F082B]"}`}>{vfx.name}</p>
                        <p className="text-xs text-[#606060]">{vfx.desc}</p>
                      </div>
                      {selected && <Check className="w-4 h-4 text-purple-700 ml-auto flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {globalVfxEffects.length > 0 && (
                <p className="text-xs text-purple-700 mt-2">{globalVfxEffects.length}/3 effects selected</p>
              )}
            </div>

            {/* Credit Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-900">Rendering will use 1 video credit. This cannot be undone.</p>
                <p className="text-xs text-amber-700 mt-1">Current balance: 10 credits</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-8">
            <Button variant="outline" onClick={() => setStep(3)} className="rounded-xl gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={() => setStep(5)} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-6 gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 6: Branding — AutoReel-style 3-column studio layout */}
      {step === 5 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-bold text-[#0F082B]">Customise your video</h2>
              <p className="text-xs text-[#606060] mt-0.5">Use the sidebar to add templates, music, voiceovers, and branding.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setStep(4)} className="rounded-xl gap-2 text-sm">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                onClick={handleSaveAndRender}
                disabled={loading}
                className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-5 gap-2 text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {renderStatus === "generating_voiceover" ? "Generating voiceover..." : renderStatus === "generating_video" ? "Rendering video..." : "Saving..."}
                  </>
                ) : (
                  <><Download className="w-4 h-4" /> Render branded video</>
                )}
              </Button>
            </div>
          </div>

          <div className="flex" style={{ minHeight: "560px" }}>
            {/* Icon sidebar */}
            <div className="w-16 bg-gray-50 border-r border-gray-100 flex flex-col items-center py-3 gap-1 flex-shrink-0">
              {[
                { label: "Templates", icon: Sparkles, key: "Templates" },
                { label: "Brand Kit", icon: null, key: "BrandKit", emoji: "🎨" },
                { label: "Music", icon: Music, key: "Music" },
                { label: "Voiceover", icon: Mic, key: "Voiceovers" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setBrandingTab(tab.key)}
                  title={tab.label}
                  className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                    brandingTab === tab.key ? "bg-purple-700 text-white shadow-sm" : "text-[#606060] hover:bg-gray-200"
                  }`}
                >
                  {tab.icon ? <tab.icon className="w-4 h-4" /> : <span className="text-base">{tab.emoji}</span>}
                  <span className="text-[9px] font-medium leading-none">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Control panel */}
            <div className="w-72 border-r border-gray-100 overflow-y-auto flex-shrink-0">
              <div className="p-4">

                {brandingTab === "Templates" && (
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs font-semibold text-[#0F082B] mb-1">Template style</p>
                      <div className="flex gap-1 mb-3">
                        <button onClick={() => setPreviewMode("intro")} className={`px-3 py-1 rounded-lg text-xs font-medium ${previewMode === "intro" ? "bg-purple-700 text-white" : "bg-gray-100 text-[#606060]"}`}>Intro</button>
                        <button onClick={() => setPreviewMode("outro")} className={`px-3 py-1 rounded-lg text-xs font-medium ${previewMode === "outro" ? "bg-purple-700 text-white" : "bg-gray-100 text-[#606060]"}`}>Outro</button>
                      </div>

                      {previewMode === "intro" && (
                        <>
                          <p className="text-[10px] text-[#606060] mb-2">Select an intro template style</p>
                          <div className="grid grid-cols-2 gap-2 mb-4">
                            {["None", "Address Reveal", "Open House", "Just Listed", "Price Drop", "Luxury Feature", "Simple"].map((t) => (
                              <button
                                key={t}
                                onClick={() => setIntroTemplate(t)}
                                className={`aspect-video rounded-lg border-2 text-[10px] font-medium flex items-center justify-center transition-all p-1 text-center ${
                                  introTemplate === t ? "border-purple-700 bg-purple-50/30 text-purple-700" : "border-gray-200 text-[#606060] hover:border-gray-300 bg-gray-50"
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                          <div className="space-y-2">
                            <div>
                              <label className="text-[10px] font-medium text-[#606060] mb-1 block">Line 1</label>
                              <Input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder={projectName} className="rounded-lg h-8 text-xs" />
                            </div>
                            <div>
                              <label className="text-[10px] font-medium text-[#606060] mb-1 block">Line 2</label>
                              <Input value={subheading} onChange={(e) => setSubheading(e.target.value)} placeholder="Beautiful family home..." className="rounded-lg h-8 text-xs" />
                            </div>
                          </div>
                        </>
                      )}

                      {previewMode === "outro" && (
                        <>
                          <p className="text-[10px] text-[#606060] mb-2">Select an outro template style</p>
                          <div className="grid grid-cols-2 gap-2">
                            {["None", "Agent Card", "Contact Block", "Agency Logo"].map((t) => (
                              <button
                                key={t}
                                onClick={() => setOutroTemplate(t)}
                                className={`aspect-video rounded-lg border-2 text-[10px] font-medium flex items-center justify-center transition-all p-1 text-center ${
                                  outroTemplate === t ? "border-purple-700 bg-purple-50/30 text-purple-700" : "border-gray-200 text-[#606060] hover:border-gray-300 bg-gray-50"
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {brandingTab === "BrandKit" && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-[#0F082B]">Brand Kit</p>
                    <p className="text-[10px] text-[#606060]">Your brand kit auto-applies your profile photo, logo, name, and contact info to your video.</p>
                    {brandKits.length === 0 ? (
                      <div className="bg-gray-50 rounded-xl p-4 text-center">
                        <p className="text-xs text-[#606060] mb-2">No brand kits yet.</p>
                        <a href="/brand-kits" target="_blank" className="text-xs text-purple-700 underline">Create a Brand Kit →</a>
                      </div>
                    ) : (
                      brandKits.map((kit) => (
                        <button
                          key={kit.id}
                          onClick={() => setSelectedBrandKitId(kit.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${selectedBrandKitId === kit.id ? "border-purple-700 bg-purple-50/30" : "border-gray-100 hover:border-gray-200"}`}
                        >
                          {kit.profile_photo_url ? (
                            <img src={kit.profile_photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-xs font-bold text-purple-700 flex-shrink-0">
                              {kit.agent_name?.[0]}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#0F082B] truncate">{kit.name}</p>
                            <p className="text-[10px] text-[#606060] truncate">{kit.agent_name}</p>
                            {kit.email && <p className="text-[10px] text-[#606060] truncate">{kit.email}</p>}
                          </div>
                          {selectedBrandKitId === kit.id && <Check className="w-4 h-4 text-purple-700 ml-auto flex-shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                )}

                {brandingTab === "Music" && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-[#0F082B]">Music</p>
                    <p className="text-[10px] text-[#606060]">Select a track to feature in your video.</p>
                    {musicTracks.length === 0 ? (
                      <div className="bg-gray-50 rounded-xl p-4 text-center">
                        <Music className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                        <p className="text-xs text-[#606060]">No music tracks yet.</p>
                      </div>
                    ) : (
                      musicTracks.map((track) => (
                        <button
                          key={track.id}
                          onClick={() => setMusicTrack(track.id)}
                          className={`w-full flex items-center gap-2.5 rounded-xl p-2.5 transition-all border ${musicTrack === track.id ? "border-purple-700 bg-purple-50/20" : "bg-gray-50 border-transparent hover:border-gray-200"}`}
                        >
                          <div
                            onClick={(e) => { e.stopPropagation(); new Audio(track.file_url).play(); }}
                            className="w-7 h-7 rounded-full bg-purple-700 flex items-center justify-center flex-shrink-0 hover:bg-purple-800 transition-colors"
                          >
                            <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-xs font-medium text-[#0F082B] truncate">{track.name}</p>
                            <p className="text-[10px] text-[#606060]">{track.genre}{track.duration ? ` · ${track.duration}` : ""}</p>
                          </div>
                          {musicTrack === track.id && <Check className="w-3.5 h-3.5 text-purple-700 flex-shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                )}

                {brandingTab === "Voiceovers" && (
                  <VoiceoverSelector
                    script={voiceoverScript}
                    setScript={setVoiceoverScript}
                    selectedVoice={voiceoverVoice}
                    setSelectedVoice={setVoiceoverVoice}
                    projectName={projectName}
                    heading={heading}
                    subheading={subheading}
                    photoCount={selectedPhotos.length}
                  />
                )}
              </div>
            </div>

            {/* Right: Live Preview */}
            <div className="flex-1 bg-gray-50 flex flex-col items-center justify-center p-6 gap-4">
              <div className="w-full max-w-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-[#0F082B]">Preview</p>
                  <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                    <button onClick={() => setOrientation("portrait")} className={`px-2.5 py-1 rounded text-[10px] font-medium flex items-center gap-1 transition-colors ${orientation === "portrait" ? "bg-purple-700 text-white" : "text-[#606060]"}`}>
                      <Smartphone className="w-3 h-3" /> Portrait
                    </button>
                    <button onClick={() => setOrientation("landscape")} className={`px-2.5 py-1 rounded text-[10px] font-medium flex items-center gap-1 transition-colors ${orientation === "landscape" ? "bg-purple-700 text-white" : "text-[#606060]"}`}>
                      <Monitor className="w-3 h-3" /> Landscape
                    </button>
                  </div>
                </div>

                <div className={`rounded-xl overflow-hidden border border-gray-200 shadow-md mx-auto ${orientation === "portrait" ? "aspect-[9/16] max-w-[180px]" : "aspect-video w-full"}`}>
                  <BrandingPreview
                    orientation={orientation}
                    introTemplate={introTemplate}
                    outroTemplate={outroTemplate}
                    heading={heading || projectName}
                    subheading={subheading}
                    brandKit={selectedBrandKit}
                    musicTrack={musicTrack}
                    previewMode={previewMode}
                  />
                </div>

                {/* Intro / Outro switcher */}
                <div className="flex gap-1 mt-3 bg-white border border-gray-200 rounded-xl p-1">
                  {["intro", "video", "outro"].map((m) => (
                    <button
                      key={m}
                      onClick={() => setPreviewMode(m)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium capitalize transition-colors ${previewMode === m ? "bg-purple-700 text-white shadow-sm" : "text-[#606060] hover:text-[#0F082B]"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {/* Summary panel */}
                <div className="mt-4 bg-white rounded-xl border border-gray-200 p-3 space-y-1.5">
                  <p className="text-[10px] text-[#606060]"><span className="font-semibold text-[#0F082B]">Intro:</span> {introTemplate || "None"}</p>
                  <p className="text-[10px] text-[#606060]"><span className="font-semibold text-[#0F082B]">Outro:</span> {outroTemplate || "None"}</p>
                  <p className="text-[10px] text-[#606060]"><span className="font-semibold text-[#0F082B]">Music:</span> {musicTracks.find(t => t.id === musicTrack)?.name || "None"}</p>
                  {selectedBrandKit && <p className="text-[10px] text-[#606060]"><span className="font-semibold text-[#0F082B]">Brand Kit:</span> {selectedBrandKit.name}</p>}
                  {voiceoverScript && <p className="text-[10px] text-[#606060]"><span className="font-semibold text-[#0F082B]">Script:</span> {voiceoverScript.slice(0, 40)}...</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}