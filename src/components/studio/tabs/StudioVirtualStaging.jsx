import React, { useState, useRef } from "react";
import { Sofa, Loader2, Check, X, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { spendCredits, PHOTO_TOOL_CREDIT_COST } from "@/lib/credits";
import AIDisclaimerBadge from "@/components/shared/AIDisclaimerBadge";

const STYLES = [
  { key: "luxury",       label: "🛋️ Luxury Modern",        prompt: "Virtually stage this empty room with modern luxury South African furniture. Add a stylish sofa, coffee table, artwork, floor lamp, plants, and a designer rug. Warm neutral tones, high-end finishes." },
  { key: "minimal",      label: "✨ Scandinavian Minimal",  prompt: "Virtually stage this empty room with minimal Scandinavian furniture. Clean lines, white oak, neutral tones, uncluttered." },
  { key: "contemporary", label: "🖤 Contemporary Dark",     prompt: "Virtually stage this room with contemporary dark furniture. Deep charcoal sofa, black accents, brass fixtures, moody lighting." },
  { key: "coastal",      label: "🌊 Coastal Relaxed",       prompt: "Virtually stage this room in a relaxed coastal style. Light blue and white tones, natural textures, rattan, linen fabrics." },
  { key: "family",       label: "👨‍👩‍👧 Family Comfortable",  prompt: "Virtually stage this room for a family. Comfortable L-shaped sofa, coffee table, warm rugs, family-friendly decor." },
  { key: "bedroom_lux",  label: "🛏️ Luxury Bedroom",       prompt: "Virtually stage this bedroom with luxury hotel-quality white linen, upholstered headboard, bedside lamps, artwork." },
  { key: "office",       label: "💼 Home Office",           prompt: "Virtually stage this room as a stylish home office. Desk, ergonomic chair, bookshelves, a plant, and good lighting." },
  { key: "industrial",   label: "⚙️ Industrial Loft",       prompt: "Virtually stage this room in industrial loft style. Exposed brick effect, leather sofa, metal shelving, Edison bulb lighting." },
];

export default function StudioVirtualStaging({ photos: projectPhotos, onPhotoReplaced, onAddPhoto, projectId }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const allPhotos = [...projectPhotos, ...uploadedPhotos];

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedStyle, setSelectedStyle] = useState(null);
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

  const selectPhoto = (idx) => { setSelectedIdx(idx); setResultPhoto(null); setSelectedStyle(null); };

  const runStaging = async () => {
    const style = STYLES.find(s => s.key === selectedStyle);
    if (!style) return;
    const { success } = await spendCredits(PHOTO_TOOL_CREDIT_COST);
    if (!success) {
      toast({ title: "Out of credits", description: "Upgrade your plan to keep staging photos.", variant: "destructive" });
      return;
    }
    setProcessing(true);
    setResultPhoto(null);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Professional real estate virtual staging for South African property marketing. ${style.prompt} Photorealistic result. Do not change room structure, windows, floors or walls.`,
        existing_image_urls: [originalPhoto],
      });
      setResultPhoto(result.url);
      toast({ title: "Staging complete!" });
    } catch {
      toast({ title: "Staging failed", variant: "destructive" });
    }
    setProcessing(false);
  };

  const applyEdit = () => {
    if (!resultPhoto) return;
    setAppliedEdits(prev => ({ ...prev, [selectedIdx]: resultPhoto }));
    if (selectedIdx < projectPhotos.length) onPhotoReplaced(selectedIdx, resultPhoto);
    else onAddPhoto?.(resultPhoto);
    if (projectId) {
      base44.entities.PhotoEdit.create({
        project_id: projectId,
        edit_type: "virtual_staging",
        original_url: originalPhoto,
        result_url: resultPhoto,
        photo_index: selectedIdx,
        furniture_style: selectedStyle,
      }).catch(() => {});
    }
    setResultPhoto(null);
    toast({ title: "✓ Staged photo applied!" });
  };

  const downloadPhoto = (url, filename) => {
    const a = document.createElement("a");
    a.href = url; a.download = filename || "staged-photo.jpg"; a.target = "_blank"; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
        <p className="text-sm font-semibold text-purple-900 mb-1">💡 How Virtual Staging Works</p>
        <p className="text-sm text-purple-700">Select a photo, choose a staging style, then click Stage. AI furnishes the empty space with realistic furniture. Works best on empty or sparsely furnished rooms.</p>
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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Original</p>
              <button onClick={() => downloadPhoto(originalPhoto, `original-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-700">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
            <div className="aspect-video"><img src={originalPhoto} alt="" className="w-full h-full object-cover" /></div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Staged Result</p>
              {(resultPhoto || appliedEdits[selectedIdx]) && (
                <button onClick={() => downloadPhoto(resultPhoto || appliedEdits[selectedIdx], `staged-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              )}
            </div>
            <div className="relative aspect-video bg-gray-50 flex items-center justify-center">
              {processing ? (
                <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 text-purple-700 animate-spin" /><p className="text-sm text-gray-500">AI is staging the room...</p></div>
              ) : resultPhoto ? (
                <>
                  <AIDisclaimerBadge />
                  <img src={resultPhoto} alt="Staged" className="w-full h-full object-cover" />
                  <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                    <Button size="sm" onClick={applyEdit} className="flex-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs gap-1"><Check className="w-3 h-3" /> Use This Photo</Button>
                    <Button size="sm" variant="outline" onClick={() => setResultPhoto(null)} className="rounded-lg text-xs"><X className="w-3 h-3" /></Button>
                  </div>
                </>
              ) : appliedEdits[selectedIdx] ? (
                <>
                  <AIDisclaimerBadge />
                  <img src={appliedEdits[selectedIdx]} alt="Applied" className="w-full h-full object-cover" />
                </>
              ) : (
                <p className="text-sm text-gray-400">Staged result will appear here</p>
              )}
            </div>
          </div>
        </div>
      )}

      {allPhotos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">Choose a Staging Style</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
            {STYLES.map(style => (
              <button key={style.key} onClick={() => setSelectedStyle(style.key)}
                className={`text-xs font-medium rounded-xl px-3 py-3 border-2 text-left transition-all leading-tight ${selectedStyle === style.key ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-300"}`}>
                {style.label}
              </button>
            ))}
          </div>
          <Button onClick={runStaging} disabled={processing || !selectedStyle} className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-11">
            {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Staging room...</> : <><Sofa className="w-4 h-4" /> Stage This Room</>}
          </Button>
        </div>
      )}
    </div>
  );
}