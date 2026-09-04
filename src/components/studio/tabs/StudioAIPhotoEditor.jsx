import React, { useState, useRef } from "react";
import { Wand2, Loader2, Check, X, Download, Video, Camera } from "lucide-react";
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

const AI_EDITS = [
  { key: "sky_golden",   label: "Golden Sunset Sky", icon: "🌅" },
  { key: "sky_blue",     label: "Clear Blue Sky", icon: "☀️" },
  { key: "lawn",         label: "Lush Green Lawn", icon: "🌿" },
  { key: "brighten",     label: "Brighten & Warm", icon: "💡" },
  { key: "declutter",    label: "Declutter & Clean", icon: "🧹" },
  { key: "hdr",          label: "HDR Boost", icon: "🌈" },
  { key: "remove_car",   label: "Remove Cars", icon: "🚗" },
  { key: "pool_sparkle", label: "Crystal Pool", icon: "💧" },
  { key: "paint_walls",  label: "Fresh White Walls", icon: "🎨" },
  { key: "magic_hour",   label: "Magic Hour", icon: "🌤️" },
  { key: "fix_lighting", label: "Fix Dark Corners", icon: "🔆" },
];

export default function StudioAIPhotoEditor({ photos: projectPhotos, onPhotoReplaced, onAddPhoto, onPhotoDeleted, projectId }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const allPhotos = [...projectPhotos, ...uploadedPhotos];

  const {
    selectedIdx, setSelectedIdx,
    customPrompt, setCustomPrompt,
    selectedStyleKey: selectedPresetKey,
    setSelectedStyleKey: setSelectedPresetKey,
    resultPhoto, setResultPhoto,
    strength, setStrength,
    appliedEdit, setAppliedEdit,
    getApplied, deleteWork,
  } = usePhotoWorkState(allPhotos, 0.28);
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

  const selectPreset = (edit) => {
    setSelectedPresetKey(edit.key);
    const t = getTemplate(edit.key);
    if (t) { setStrength(t.strength); }
  };

  const runEdit = async () => {
    let prompt = customPrompt.trim();
    if (!prompt && selectedPresetKey) {
      const t = getTemplate(selectedPresetKey);
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
      const s3Url = await generateFalImage(originalPhoto, prompt, strength, "ai-edits");
      setResultPhoto(s3Url);
      toast({ title: "Edit complete!" });
    } catch (e) {
      toast({ title: "Edit failed", description: e.message, variant: "destructive" });
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
    toast({ title: "✓ Photo updated!" });
  };

  const downloadPhoto = (url, filename) => {
    const a = document.createElement("a");
    a.href = url; a.download = filename || "edited-photo.jpg"; a.target = "_blank"; a.click();
  };

  return (
    <div className="space-y-6">
      <PhotoThumbnailStrip
        photos={allPhotos}
        selectedIdx={selectedIdx}
        onSelect={selectPhoto}
        onDelete={handleDeletePhoto}
        getApplied={getApplied}
        uploading={uploading}
        onUpload={handleUpload}
        fileInputRef={fileInputRef}
      />

      {allPhotos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Original */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Original</p>
              <button onClick={() => downloadPhoto(originalPhoto, `original-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-400">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
            <div className="aspect-video bg-slate-800"><img src={originalPhoto} alt="Original" className="w-full h-full object-cover" /></div>
          </div>
          {/* Result */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">AI Result</p>
              {(resultPhoto || appliedEdit) && (
                <button onClick={() => downloadPhoto(resultPhoto || appliedEdit, `edited-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              )}
            </div>
            <div className="relative aspect-video bg-slate-800 flex items-center justify-center">
              {processing ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
                    <Camera className="w-5 h-5 text-indigo-400 absolute inset-0 m-auto" />
                  </div>
                  <p className="text-sm text-slate-400">AI is editing...</p>
                </div>
              ) : resultPhoto ? (
                <>
                  <AIDisclaimerBadge />
                  <img src={resultPhoto} alt="Edited" className="w-full h-full object-cover" />
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
                <p className="text-sm text-slate-500">Apply an edit to see the result here</p>
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
            <p className="text-sm font-semibold text-slate-200 mb-3">Quick-Action Enhancements</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {AI_EDITS.map(edit => (
                <button key={edit.key} onClick={() => selectPreset(edit)}
                  className={`text-xs font-medium rounded-xl px-3 py-2.5 border text-left transition-all leading-tight flex items-center gap-1.5 ${selectedPresetKey === edit.key ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300" : "border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}>
                  <span>{edit.icon}</span> {edit.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">Custom Edit Instructions — describe exact changes for this image</label>
            <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
              placeholder="e.g. Add a sparkling pool to the backyard, paint the front door navy blue, remove the parked car from the driveway..."
              rows={3} className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none text-slate-100 placeholder:text-slate-500" />
          </div>

          <Button onClick={runEdit} disabled={processing || (!customPrompt.trim() && !selectedPresetKey)}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl gap-2 h-11 shadow-lg shadow-indigo-600/25">
            {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Editing photo...</> : <><Wand2 className="w-4 h-4" /> Apply AI Edit ({PHOTO_TOOL_CREDIT_COST} credits)</>}
          </Button>
        </div>
      )}
    </div>
  );
}