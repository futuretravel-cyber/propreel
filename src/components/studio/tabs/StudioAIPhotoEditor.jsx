import React, { useState, useRef } from "react";
import { Wand2, Loader2, Check, X, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const AI_EDITS = [
  { key: "sky_golden",   label: "🌅 Golden Sunset Sky",  prompt: "Replace the sky with a dramatic golden sunset sky with warm orange and pink clouds. Keep the property and foreground exactly as-is." },
  { key: "sky_blue",     label: "☀️ Clear Blue Sky",      prompt: "Replace the sky with a perfect clear blue sky with fluffy white clouds. Keep all property structures and landscaping identical." },
  { key: "lawn",         label: "🌿 Lush Green Lawn",     prompt: "Make all grass and lawn areas lush, vibrant green as if freshly watered in spring. Keep all structures identical." },
  { key: "brighten",     label: "💡 Brighten & Warm",     prompt: "Significantly brighten this photo. Make it look well-lit, warm, and inviting. Eliminate harsh shadows." },
  { key: "declutter",    label: "🧹 Declutter & Clean",   prompt: "Remove ALL clutter, personal items, and mess from this photo. Make it look clean, minimal, and professionally staged." },
  { key: "hdr",          label: "🌈 HDR Boost",           prompt: "Apply HDR-style enhancement. Rich colours, deep blacks, bright highlights, dramatic detail. Photorealistic." },
  { key: "remove_car",   label: "🚗 Remove Cars",         prompt: "Remove all cars and vehicles from this photo. Replace with clean driveway or street." },
  { key: "pool_sparkle", label: "💧 Crystal Pool",        prompt: "Make the swimming pool water crystal clear, bright blue, sparkling. Keep all surroundings identical." },
  { key: "paint_walls",  label: "🎨 Fresh White Walls",   prompt: "Change all wall colours to a clean, fresh off-white. Keep all furniture, floors, and fixtures exactly the same." },
  { key: "magic_hour",   label: "🌤️ Magic Hour",          prompt: "Convert to magic hour/golden hour lighting. Warm orange-gold sunlight, long shadows, highly cinematic." },
  { key: "fix_lighting", label: "🔆 Fix Dark Corners",    prompt: "Fix all dark corners and shadows. Add realistic ambient fill lighting so the entire space is evenly lit." },
];

export default function StudioAIPhotoEditor({ photos: projectPhotos, onPhotoReplaced, projectId }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const allPhotos = [...projectPhotos, ...uploadedPhotos];

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedEdit, setSelectedEdit] = useState(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [processing, setProcessing] = useState(false);
  const [resultPhoto, setResultPhoto] = useState(null);
  const [appliedEdits, setAppliedEdits] = useState({});
  const [uploading, setUploading] = useState(false);

  const originalPhoto = allPhotos[selectedIdx];

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(async f => {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
        return file_url;
      }));
      setUploadedPhotos(prev => [...prev, ...urls]);
      toast({ title: `${urls.length} photo(s) uploaded` });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  };

  const selectPhoto = (idx) => { setSelectedIdx(idx); setResultPhoto(null); setSelectedEdit(null); setCustomPrompt(""); };

  const runEdit = async () => {
    const prompt = selectedEdit === "custom" ? customPrompt : AI_EDITS.find(e => e.key === selectedEdit)?.prompt || "";
    if (!prompt.trim()) return;
    setProcessing(true);
    setResultPhoto(null);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Professional real estate photo edit for South African property marketing. ${prompt} Maintain photorealistic style.`,
        existing_image_urls: [originalPhoto],
      });
      setResultPhoto(result.url);
      toast({ title: "Edit complete!" });
    } catch {
      toast({ title: "Edit failed", variant: "destructive" });
    }
    setProcessing(false);
  };

  const applyEdit = () => {
    if (!resultPhoto) return;
    setAppliedEdits(prev => ({ ...prev, [selectedIdx]: resultPhoto }));
    if (selectedIdx < projectPhotos.length) onPhotoReplaced(selectedIdx, resultPhoto);
    if (projectId) {
      base44.entities.PhotoEdit.create({
        project_id: projectId,
        edit_type: "ai_edit",
        original_url: originalPhoto,
        result_url: resultPhoto,
        photo_index: selectedIdx,
        prompt: selectedEdit === "custom" ? customPrompt : AI_EDITS.find(e => e.key === selectedEdit)?.prompt || "",
      }).catch(() => {});
    }
    setResultPhoto(null);
    toast({ title: "✓ Photo updated!" });
  };

  const downloadPhoto = (url, filename) => {
    const a = document.createElement("a");
    a.href = url; a.download = filename || "edited-photo.jpg"; a.target = "_blank"; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select Photo ({allPhotos.length ? selectedIdx + 1 : 0} of {allPhotos.length})</p>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-xl gap-1.5 text-xs">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Uploading..." : "Upload Photos"}
            </Button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {allPhotos.map((url, i) => (
            <button key={i} onClick={() => selectPhoto(i)}
              className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${selectedIdx === i ? "border-purple-700 shadow-md" : "border-transparent opacity-50 hover:opacity-80"}`}>
              <img src={appliedEdits[i] || url} alt="" className="w-full h-full object-cover" />
              {appliedEdits[i] && <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-purple-700 rounded-full flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white" /></div>}
            </button>
          ))}
          {allPhotos.length === 0 && <p className="text-sm text-gray-400">Upload photos to get started.</p>}
        </div>
      </div>

      {allPhotos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Original</p>
              <button onClick={() => downloadPhoto(originalPhoto, `original-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-700">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
            <div className="aspect-video"><img src={originalPhoto} alt="Original" className="w-full h-full object-cover" /></div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">AI Result</p>
              {(resultPhoto || appliedEdits[selectedIdx]) && (
                <button onClick={() => downloadPhoto(resultPhoto || appliedEdits[selectedIdx], `edited-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              )}
            </div>
            <div className="relative aspect-video bg-gray-50 flex items-center justify-center">
              {processing ? (
                <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 text-purple-700 animate-spin" /><p className="text-sm text-gray-500">AI is editing...</p></div>
              ) : resultPhoto ? (
                <>
                  <img src={resultPhoto} alt="Edited" className="w-full h-full object-cover" />
                  <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                    <Button size="sm" onClick={applyEdit} className="flex-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs gap-1"><Check className="w-3 h-3" /> Use This Photo</Button>
                    <Button size="sm" variant="outline" onClick={() => setResultPhoto(null)} className="rounded-lg text-xs"><X className="w-3 h-3" /></Button>
                  </div>
                </>
              ) : appliedEdits[selectedIdx] ? (
                <img src={appliedEdits[selectedIdx]} alt="Applied" className="w-full h-full object-cover" />
              ) : (
                <p className="text-sm text-gray-400">Apply an edit to see the result here</p>
              )}
            </div>
          </div>
        </div>
      )}

      {allPhotos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">Choose an AI Edit</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
            {AI_EDITS.map(edit => (
              <button key={edit.key} onClick={() => setSelectedEdit(edit.key)}
                className={`text-xs font-medium rounded-xl px-3 py-2.5 border-2 text-left transition-all leading-tight ${selectedEdit === edit.key ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-300"}`}>
                {edit.label}
              </button>
            ))}
          </div>
          <div className={`border-2 rounded-xl p-3 mb-4 transition-all ${selectedEdit === "custom" ? "border-purple-700 bg-purple-50" : "border-gray-100"}`}>
            <button onClick={() => setSelectedEdit("custom")} className="w-full text-left mb-2">
              <p className={`text-xs font-semibold ${selectedEdit === "custom" ? "text-purple-700" : "text-gray-600"}`}>✏️ Custom Edit — describe exactly what you want</p>
            </button>
            <textarea value={customPrompt} onChange={e => { setCustomPrompt(e.target.value); setSelectedEdit("custom"); }}
              placeholder="e.g. Add a sparkling pool to the backyard, paint the front door navy blue..."
              rows={2} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-purple-700 resize-none bg-white" />
          </div>
          <Button onClick={runEdit} disabled={processing || !selectedEdit || (selectedEdit === "custom" && !customPrompt.trim())}
            className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-11">
            {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Editing photo...</> : <><Wand2 className="w-4 h-4" /> Apply AI Edit</>}
          </Button>
        </div>
      )}
    </div>
  );
}