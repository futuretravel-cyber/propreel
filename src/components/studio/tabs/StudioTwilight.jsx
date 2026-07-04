import React, { useState, useRef } from "react";
import { Loader2, Check, X, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { spendCredits, PHOTO_TOOL_CREDIT_COST } from "@/lib/credits";
import AIDisclaimerBadge from "@/components/shared/AIDisclaimerBadge";

const TWILIGHT_STYLES = [
  { key: "blue_hour",    label: "🌆 Blue Hour",            prompt: "Convert this property photo to a stunning blue hour twilight shot. Deep blue-purple sky, warm interior lights glowing through windows, exterior lights on. Dramatic and luxurious. Photorealistic." },
  { key: "golden_dusk",  label: "🌅 Golden Dusk",          prompt: "Convert to golden dusk. Orange and pink horizon, last rays of sunlight, warm glow on the facade, exterior lights starting to appear. Warm and inviting." },
  { key: "night_lights", label: "🌃 Night Lights",         prompt: "Convert to a full night shot. Dark sky with stars, all interior lights glowing warmly through windows, exterior pathway and landscape lighting. Premium feel." },
  { key: "sunset_sky",   label: "🔴 Dramatic Sunset",      prompt: "Replace the sky with a dramatic red-orange sunset. Vivid clouds, warm light bathing the whole property. Keep the property structure identical." },
  { key: "moody_dusk",   label: "🌫️ Moody & Atmospheric",  prompt: "Create a moody atmospheric dusk shot. Soft purple-blue tones, subtle mist, warm interior glows, cinematic feel." },
  { key: "christmas",    label: "🎄 Festive Evening",      prompt: "Convert to a festive evening shot with warm Christmas fairy lights on the exterior, glowing windows, and a dark twilight sky." },
];

export default function StudioTwilight({ photos: projectPhotos, onPhotoReplaced, projectId }) {
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

  const runTwilight = async () => {
    const style = TWILIGHT_STYLES.find(s => s.key === selectedStyle);
    if (!style) return;
    const { success } = await spendCredits(PHOTO_TOOL_CREDIT_COST);
    if (!success) {
      toast({ title: "Out of credits", description: "Upgrade your plan to keep converting photos.", variant: "destructive" });
      return;
    }
    setProcessing(true);
    setResultPhoto(null);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Professional real estate twilight photography for South African property marketing. ${style.prompt} Maintain all architectural features and property structure unchanged. High quality photorealistic result.`,
        existing_image_urls: [originalPhoto],
      });
      setResultPhoto(result.url);
      toast({ title: "Twilight conversion complete!" });
    } catch {
      toast({ title: "Conversion failed", variant: "destructive" });
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
        prompt: TWILIGHT_STYLES.find(s => s.key === selectedStyle)?.prompt || "",
      }).catch(() => {});
    }
    setResultPhoto(null);
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

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select Exterior Photo ({allPhotos.length ? selectedIdx + 1 : 0} of {allPhotos.length})</p>
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
              {(resultPhoto || appliedEdits[selectedIdx]) && (
                <button onClick={() => downloadPhoto(resultPhoto || appliedEdits[selectedIdx], `twilight-${selectedIdx + 1}.jpg`)} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
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
              ) : appliedEdits[selectedIdx] ? (
                <>
                  <AIDisclaimerBadge />
                  <img src={appliedEdits[selectedIdx]} alt="Applied" className="w-full h-full object-cover" />
                </>
              ) : (
                <p className="text-sm text-indigo-300">Twilight result will appear here</p>
              )}
            </div>
          </div>
        </div>
      )}

      {allPhotos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-900 mb-4">Choose Twilight Style</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {TWILIGHT_STYLES.map(style => (
              <button key={style.key} onClick={() => setSelectedStyle(style.key)}
                className={`text-sm font-medium rounded-xl px-3 py-3 border-2 text-left transition-all leading-tight ${selectedStyle === style.key ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-300"}`}>
                {style.label}
              </button>
            ))}
          </div>
          <Button onClick={runTwilight} disabled={processing || !selectedStyle} className="w-full bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl gap-2 h-11">
            {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Converting to twilight...</> : <>🌆 Convert to Twilight</>}
          </Button>
        </div>
      )}
    </div>
  );
}