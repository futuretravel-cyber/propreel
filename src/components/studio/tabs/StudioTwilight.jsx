import React, { useState, useRef } from "react";
import { Loader2, Check, X, Download, Video } from "lucide-react";
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
  { key: "tw_blue_hour",    label: "🌆 Blue Hour" },
  { key: "tw_golden_dusk",  label: "🌅 Golden Dusk" },
  { key: "tw_night_lights", label: "🌃 Night Lights" },
  { key: "tw_sunset_sky",   label: "🔴 Dramatic Sunset" },
  { key: "tw_moody_dusk",   label: "🌫️ Moody & Atmospheric" },
  { key: "tw_christmas",    label: "🎄 Festive Evening" },
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
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
        <p className="text-sm font-semibold text-indigo-900 mb-1">🌆 Twilight Photography</p>
        <p className="text-sm text-indigo-700">Convert daytime exterior shots to stunning twilight or dusk photos. Twilight photos consistently outperform daytime photos on property portals — attracting 3x more enquiries.</p>
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
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Day Shot (Original)</p>
              <button onClick={() => downloadPhoto(originalPhoto, `original-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-700">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
            <div className="aspect-video"><img src={originalPhoto} alt="" className="w-full h-full object-cover" /></div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Twilight Conversion</p>
              {(resultPhoto || appliedEdit) && (
                <button onClick={() => downloadPhoto(resultPhoto || appliedEdit, `twilight-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              )}
            </div>
            <div className="relative aspect-video bg-gradient-to-br from-indigo-950 to-indigo-800 flex items-center justify-center">
              {processing ? (
                <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 text-indigo-300 animate-spin" /><p className="text-sm text-indigo-200">Converting to twilight...</p></div>
              ) : resultPhoto ? (
                <>
                  <AIDisclaimerBadge />
                  <img src={resultPhoto} alt="Twilight" className="w-full h-full object-cover" />
                  <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                    <Button size="sm" onClick={applyEdit} className="flex-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs gap-1"><Check className="w-3 h-3" /> Use This Photo</Button>
                    <Button size="sm" variant="outline" onClick={() => setResultPhoto(null)} className="rounded-lg text-xs bg-white"><X className="w-3 h-3" /></Button>
                  </div>
                </>
              ) : appliedEdit ? (
                <>
                  <AIDisclaimerBadge />
                  <img src={appliedEdit} alt="Applied" className="w-full h-full object-cover" />
                </>
              ) : (
                <p className="text-sm text-indigo-300">Twilight result will appear here</p>
              )}
            </div>
          </div>
        </div>
      )}

      {resultPhoto && (
        <Button onClick={() => { onAddPhoto?.(resultPhoto); toast({ title: "✓ Added to Video Project" }); }}
          className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-11">
          <Video className="w-4 h-4" /> Add to Video Project
        </Button>
      )}

      {allPhotos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-3">Choose Twilight Style</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TWILIGHT_STYLES.map(style => (
                <button key={style.key} onClick={() => selectStyle(style)}
                  className={`text-sm font-medium rounded-xl px-3 py-3 border-2 text-left transition-all leading-tight ${selectedStyleKey === style.key ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-100 bg-gray-50 text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-800"}`}>
                  {style.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Custom Twilight Instructions — describe exact changes for this image</label>
            <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
              placeholder="e.g. Convert to a warm dusk scene with all interior lights glowing, a soft purple sky, and gentle mist around the garden..."
              rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-700/30 resize-none bg-white" />
          </div>

          <Button onClick={runTwilight} disabled={processing || (!customPrompt.trim() && !selectedStyleKey)} className="w-full bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl gap-2 h-11">
            {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Converting to twilight...</> : <>🌆 Convert to Twilight ({PHOTO_TOOL_CREDIT_COST} credits)</>}
          </Button>
        </div>
      )}
    </div>
  );
}