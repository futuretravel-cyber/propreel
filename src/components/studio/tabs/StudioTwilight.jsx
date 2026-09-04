import React, { useState, useRef } from "react";
import { Loader2, Check, X, Download, Video, Sunset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { uploadToS3 } from "@/lib/awsS3";
import { useToast } from "@/components/ui/use-toast";
import { spendCredits, PHOTO_TOOL_CREDIT_COST } from "@/lib/credits";
import { notifyOutOfCredits } from "@/lib/creditsToast";
import { generateFalImage } from "@/lib/falImage";
import AIDisclaimerBadge from "@/components/shared/AIDisclaimerBadge";
import PhotoThumbnailStrip from "@/components/studio/PhotoThumbnailStrip";
import { usePhotoWorkState } from "@/hooks/usePhotoWorkState";
import { usePromptRegistry } from "@/hooks/usePromptRegistry";

const TWILIGHT_STYLES = [
  { key: "tw_blue_hour",    label: "Blue Hour", icon: "🌆", desc: "Deep blue sky, soft glow" },
  { key: "tw_golden_dusk",  label: "Golden Dusk", icon: "🌅", desc: "Warm golden light" },
  { key: "tw_night_lights", label: "Night Lights", icon: "🌃", desc: "Interior glow, dark sky" },
  { key: "tw_sunset_sky",   label: "Dramatic Sunset", icon: "🔴", desc: "Vibrant orange-red sky" },
  { key: "tw_moody_dusk",   label: "Moody & Atmospheric", icon: "🌫️", desc: "Soft mist, dramatic" },
  { key: "tw_christmas",    label: "Festive Evening", icon: "🎄", desc: "Warm holiday lights" },
];

export default function StudioTwilight({ photos: projectPhotos, onPhotoReplaced, onAddPhoto, onPhotoDeleted, projectId }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const allPhotos = [...projectPhotos, ...uploadedPhotos];

  const {
    selectedIdx, setSelectedIdx,
    customPrompt, setCustomPrompt,
    selectedStyleKey, setSelectedStyleKey,
    resultPhoto, setResultPhoto,
    strength, setStrength,
    appliedEdit, setAppliedEdit,
    getApplied, deleteWork,
  } = usePhotoWorkState(allPhotos, 0.45);
  const { getTemplate } = usePromptRegistry();
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const originalPhoto = allPhotos[selectedIdx];

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(async f => {
        const file_url = await uploadToS3(f, "images");
        return file_url;
      }));
      setUploadedPhotos(prev => [...prev, ...urls]);
      toast({ title: `${urls.length} photo(s) uploaded` });
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  };

  const selectPhoto = (idx) => setSelectedIdx(idx);

  const handleDeletePhoto = (idx) => {
    const urlToDelete = allPhotos[idx];
    deleteWork(urlToDelete);
    if (idx < projectPhotos.length) {
      onPhotoDeleted?.(idx);
    } else {
      const uploadIdx = idx - projectPhotos.length;
      setUploadedPhotos(prev => prev.filter((_, i) => i !== uploadIdx));
    }
    if (allPhotos.length <= 1) setSelectedIdx(0);
    else if (idx <= selectedIdx) setSelectedIdx(Math.max(0, selectedIdx - 1));
  };

  const selectStyle = (style) => {
    setSelectedStyleKey(style.key);
    const t = getTemplate(style.key);
    if (t) { setStrength(t.strength); }
  };

  const runTwilight = async () => {
    let prompt = customPrompt.trim();
    if (!prompt && selectedStyleKey) {
      const t = getTemplate(selectedStyleKey);
      prompt = t?.prompt || "";
    }
    if (!prompt) return;
    const { success } = await spendCredits(PHOTO_TOOL_CREDIT_COST);
    if (!success) {
      notifyOutOfCredits(toast, PHOTO_TOOL_CREDIT_COST);
      return;
    }
    setProcessing(true);
    setResultPhoto(null);
    try {
      const s3Url = await generateFalImage(originalPhoto, prompt, strength, "twilight");
      setResultPhoto(s3Url);
      toast({ title: "Twilight conversion complete!" });
    } catch (e) {
      toast({ title: "Conversion failed", description: e.message, variant: "destructive" });
    }
    setProcessing(false);
  };

  const applyEdit = () => {
    if (!resultPhoto) return;
    setAppliedEdit(resultPhoto);
    if (selectedIdx < projectPhotos.length) onPhotoReplaced(selectedIdx, resultPhoto);
    else onAddPhoto?.(resultPhoto);
    if (projectId) {
      base44.entities.PhotoEdit.create({
        project_id: projectId,
        edit_type: "ai_edit",
        original_url: originalPhoto,
        result_url: resultPhoto,
        photo_index: selectedIdx,
        prompt: customPrompt,
      }).catch(() => {});
    }
    toast({ title: "✓ Twilight photo applied!" });
  };

  const downloadPhoto = (url, filename) => {
    const a = document.createElement("a");
    a.href = url; a.download = filename || "twilight-photo.jpg"; a.target = "_blank"; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sunset className="w-4 h-4 text-indigo-400" />
          <p className="text-sm font-semibold text-indigo-200">Twilight Photography</p>
        </div>
        <p className="text-sm text-indigo-300/80">Convert daytime exterior shots to stunning twilight or dusk photos. Twilight photos consistently outperform daytime photos on property portals — attracting 3x more enquiries.</p>
      </div>

      <PhotoThumbnailStrip
        photos={allPhotos}
        selectedIdx={selectedIdx}
        onSelect={selectPhoto}
        onDelete={handleDeletePhoto}
        getApplied={getApplied}
        uploading={uploading}
        onUpload={handleUpload}
        fileInputRef={fileInputRef}
        label="Select Exterior Photo"
      />

      {allPhotos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Day Shot (Original)</p>
              <button onClick={() => downloadPhoto(originalPhoto, `original-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-400">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
            <div className="aspect-video bg-slate-800"><img src={originalPhoto} alt="" className="w-full h-full object-cover" /></div>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Twilight Conversion</p>
              {(resultPhoto || appliedEdit) && (
                <button onClick={() => downloadPhoto(resultPhoto || appliedEdit, `twilight-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              )}
            </div>
            <div className="relative aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
              {processing ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
                    <Sunset className="w-5 h-5 text-indigo-400 absolute inset-0 m-auto" />
                  </div>
                  <p className="text-sm text-slate-400">Converting to twilight...</p>
                </div>
              ) : resultPhoto ? (
                <>
                  <AIDisclaimerBadge />
                  <img src={resultPhoto} alt="Twilight" className="w-full h-full object-cover" />
                  <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                    <Button size="sm" onClick={applyEdit} className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-xs gap-1"><Check className="w-3 h-3" /> Use This Photo</Button>
                    <Button size="sm" variant="outline" onClick={() => setResultPhoto(null)} className="rounded-lg text-xs bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"><X className="w-3 h-3" /></Button>
                  </div>
                </>
              ) : appliedEdit ? (
                <>
                  <AIDisclaimerBadge />
                  <img src={appliedEdit} alt="Applied" className="w-full h-full object-cover" />
                </>
              ) : (
                <p className="text-sm text-slate-500">Twilight result will appear here</p>
              )}
            </div>
          </div>
        </div>
      )}

      {resultPhoto && (
        <Button onClick={() => { onAddPhoto?.(resultPhoto); toast({ title: "✓ Added to Video Project" }); }}
          className="w-full bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-xl gap-2 h-11">
          <Video className="w-4 h-4" /> Add to Video Project
        </Button>
      )}

      {allPhotos.length > 0 && (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-200 mb-3">Choose Twilight Style</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TWILIGHT_STYLES.map(style => (
                <button key={style.key} onClick={() => selectStyle(style)}
                  className={`p-3 rounded-xl border text-left transition-all leading-tight ${selectedStyleKey === style.key ? "border-indigo-500/50 bg-indigo-500/15" : "border-slate-800 bg-slate-800/40 hover:border-slate-700"}`}>
                  <p className="text-sm font-semibold text-slate-100 flex items-center gap-1.5"><span>{style.icon}</span> {style.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{style.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">Custom Twilight Instructions — describe exact changes for this image</label>
            <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
              placeholder="e.g. Convert to a warm dusk scene with all interior lights glowing, a soft purple sky, and gentle mist around the garden..."
              rows={3} className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none text-slate-100 placeholder:text-slate-500" />
          </div>

          <Button onClick={runTwilight} disabled={processing || (!customPrompt.trim() && !selectedStyleKey)}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl gap-2 h-11 shadow-lg shadow-indigo-600/25">
            {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Converting to twilight...</> : <><Sunset className="w-4 h-4" /> Convert to Twilight ({PHOTO_TOOL_CREDIT_COST} credits)</>}
          </Button>
        </div>
      )}
    </div>
  );
}