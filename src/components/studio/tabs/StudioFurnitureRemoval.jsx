import React, { useState, useRef } from "react";
import { Trash2, Loader2, Check, X, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const REMOVAL_MODES = [
  { key: "all",      label: "🗑️ Remove All Furniture",   prompt: "Remove ALL furniture, decor, rugs, curtains, and movable items from this room. Leave only the empty room — floors, walls, windows, built-in units. Do not add anything." },
  { key: "clutter",  label: "🧹 Remove Clutter Only",    prompt: "Remove all clutter, personal items, mess, and temporary items. Keep the main furniture but make the space look spotlessly clean." },
  { key: "personal", label: "👤 Remove Personal Items",  prompt: "Remove all personal items: photos, children's toys, clothing, paperwork, and personal decor. Keep structural furniture only." },
  { key: "cars",     label: "🚗 Remove Vehicles",        prompt: "Remove all cars, motorcycles, and vehicles from the driveway and street. Replace with clean empty driveway or road surface." },
  { key: "objects",  label: "📦 Remove Specific Objects", prompt: "Remove any temporary or unwanted objects that detract from the property's appeal. Clean up the space professionally." },
];

export default function StudioFurnitureRemoval({ photos: projectPhotos, onPhotoReplaced }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const allPhotos = [...projectPhotos, ...uploadedPhotos];

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedMode, setSelectedMode] = useState(null);
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

  const selectPhoto = (idx) => { setSelectedIdx(idx); setResultPhoto(null); setSelectedMode(null); setCustomPrompt(""); };

  const runRemoval = async () => {
    const mode = REMOVAL_MODES.find(m => m.key === selectedMode);
    const prompt = selectedMode === "custom" ? customPrompt : mode?.prompt;
    if (!prompt?.trim()) return;
    setProcessing(true);
    setResultPhoto(null);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Professional real estate photo for South African property marketing. ${prompt} Maintain photorealistic quality and keep all architectural features unchanged.`,
        existing_image_urls: [originalPhoto],
      });
      setResultPhoto(result.url);
      toast({ title: "Removal complete!" });
    } catch {
      toast({ title: "Processing failed", variant: "destructive" });
    }
    setProcessing(false);
  };

  const applyEdit = () => {
    if (!resultPhoto) return;
    setAppliedEdits(prev => ({ ...prev, [selectedIdx]: resultPhoto }));
    if (selectedIdx < projectPhotos.length) onPhotoReplaced(selectedIdx, resultPhoto);
    setResultPhoto(null);
    toast({ title: "✓ Photo updated!" });
  };

  const downloadPhoto = (url, filename) => {
    const a = document.createElement("a");
    a.href = url; a.download = filename || "photo.jpg"; a.target = "_blank"; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
        <p className="text-sm font-semibold text-orange-900 mb-1">🗑️ AI Furniture & Object Removal</p>
        <p className="text-sm text-orange-700">Remove furniture, clutter, vehicles, or personal items from property photos. Great for presenting a clean, neutral space to buyers.</p>
      </div>

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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Before</p>
              <button onClick={() => downloadPhoto(originalPhoto, `before-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-700">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
            <div className="aspect-video"><img src={originalPhoto} alt="" className="w-full h-full object-cover" /></div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">After Removal</p>
              {(resultPhoto || appliedEdits[selectedIdx]) && (
                <button onClick={() => downloadPhoto(resultPhoto || appliedEdits[selectedIdx], `after-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              )}
            </div>
            <div className="relative aspect-video bg-gray-50 flex items-center justify-center">
              {processing ? (
                <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 text-purple-700 animate-spin" /><p className="text-sm text-gray-500">AI is removing items...</p></div>
              ) : resultPhoto ? (
                <>
                  <img src={resultPhoto} alt="Result" className="w-full h-full object-cover" />
                  <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                    <Button size="sm" onClick={applyEdit} className="flex-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs gap-1"><Check className="w-3 h-3" /> Use This Photo</Button>
                    <Button size="sm" variant="outline" onClick={() => setResultPhoto(null)} className="rounded-lg text-xs"><X className="w-3 h-3" /></Button>
                  </div>
                </>
              ) : appliedEdits[selectedIdx] ? (
                <img src={appliedEdits[selectedIdx]} alt="Applied" className="w-full h-full object-cover" />
              ) : (
                <p className="text-sm text-gray-400">Result will appear here</p>
              )}
            </div>
          </div>
        </div>
      )}

      {allPhotos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">Choose Removal Mode</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
            {REMOVAL_MODES.map(mode => (
              <button key={mode.key} onClick={() => setSelectedMode(mode.key)}
                className={`text-sm font-medium rounded-xl px-3 py-3 border-2 text-left transition-all ${selectedMode === mode.key ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-300"}`}>
                {mode.label}
              </button>
            ))}
            <button onClick={() => setSelectedMode("custom")}
              className={`text-sm font-medium rounded-xl px-3 py-3 border-2 text-left transition-all ${selectedMode === "custom" ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-300"}`}>
              ✏️ Custom Removal
            </button>
          </div>
          {selectedMode === "custom" && (
            <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
              placeholder="Describe exactly what to remove, e.g. Remove the red couch and the ceiling fan..."
              rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-700/30 resize-none mb-4 bg-white" />
          )}
          <Button onClick={runRemoval} disabled={processing || !selectedMode || (selectedMode === "custom" && !customPrompt.trim())}
            className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-11">
            {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Trash2 className="w-4 h-4" /> Remove Items</>}
          </Button>
        </div>
      )}
    </div>
  );
}