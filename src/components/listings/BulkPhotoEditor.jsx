import React, { useState } from "react";
import { Wand2, Loader2, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const AI_EDITS = [
  { key: "sky_golden", label: "🌅 Golden Sunset Sky", prompt: "Replace the sky with a dramatic golden sunset sky with warm orange and pink clouds. Keep the property and foreground exactly as-is." },
  { key: "sky_blue", label: "☀️ Clear Blue Sky", prompt: "Replace the sky with a perfect clear blue sky with fluffy white clouds. Keep all structures identical." },
  { key: "twilight", label: "🌆 Twilight", prompt: "Convert to twilight/dusk. Deep blue-purple sky, warm interior lights glowing through windows." },
  { key: "brighten", label: "💡 Brighten & Warm", prompt: "Significantly brighten this photo. Make it look well-lit, warm, and inviting. Eliminate harsh shadows." },
  { key: "declutter", label: "🧹 Declutter", prompt: "Remove ALL clutter and personal items. Make it look clean, minimal, and professionally staged." },
  { key: "lawn", label: "🌿 Green Lawn", prompt: "Make all grass areas lush, vibrant green as if freshly watered. Keep all structures identical." },
  { key: "pool_sparkle", label: "💧 Crystal Pool", prompt: "Make the pool water crystal clear, bright blue. Keep all surroundings identical." },
  { key: "hdr", label: "🌈 HDR Boost", prompt: "Apply HDR-style enhancement. Rich colours, deep blacks, bright highlights. Photorealistic." },
];

const STAGING = [
  { key: "vs_luxury", label: "🛋️ Luxury Modern", prompt: "Virtually stage this empty room with modern luxury South African furniture. Add a stylish sofa, coffee table, artwork, floor lamp, plants, designer rug. High-end show home feel." },
  { key: "vs_minimal", label: "✨ Scandinavian", prompt: "Virtually stage with minimal Scandinavian furniture. Clean lines, white oak, neutral tones, uncluttered." },
  { key: "vs_coastal", label: "🌊 Coastal", prompt: "Virtually stage in a relaxed coastal style. Light blue and white tones, natural textures, rattan, linen fabrics." },
  { key: "vs_family", label: "👨‍👩‍👧 Family", prompt: "Virtually stage for a family. Comfortable sofa, coffee table, warm rugs, family-friendly decor." },
  { key: "vs_remove", label: "🗑️ Remove Furniture", prompt: "Remove ALL furniture from this room. Leave only the empty room with floors, walls, and windows visible." },
  { key: "vs_bedroom", label: "🛏️ Luxury Bedroom", prompt: "Virtually stage with luxury hotel-quality white linen, upholstered headboard, bedside lamps, artwork." },
];

export default function BulkPhotoEditor({ photos, onPhotoReplaced, initialMode = "edits", onClose }) {
  const { toast } = useToast();
  const [mode, setMode] = useState(initialMode);
  const [selectedEdit, setSelectedEdit] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(null); // null = all, or index
  const [results, setResults] = useState({}); // idx -> url
  const [done, setDone] = useState({});

  const items = mode === "edits" ? AI_EDITS : STAGING;

  const applyToPhoto = async (idx, prompt) => {
    const result = await base44.integrations.Core.GenerateImage({
      prompt: `Professional real estate photo edit for South African property marketing. ${prompt} Maintain photorealistic style.`,
      existing_image_urls: [photos[idx]],
    });
    return result.url;
  };

  const handleApplySelected = async () => {
    if (!selectedEdit) return;
    const item = items.find(e => e.key === selectedEdit);
    if (!item) return;
    setProcessing(true);

    const idxList = currentPhotoIdx !== null ? [currentPhotoIdx] : photos.map((_, i) => i);

    for (const idx of idxList) {
      try {
        const url = await applyToPhoto(idx, item.prompt);
        setResults(prev => ({ ...prev, [idx]: url }));
      } catch {
        toast({ title: `Photo ${idx + 1} failed`, variant: "destructive" });
      }
    }
    setProcessing(false);
    toast({ title: "✓ AI edits complete!", description: "Review and apply below." });
  };

  const applyResult = (idx) => {
    onPhotoReplaced(idx, results[idx]);
    setDone(prev => ({ ...prev, [idx]: true }));
    toast({ title: `✓ Photo ${idx + 1} updated!` });
  };

  const applyAll = () => {
    Object.entries(results).forEach(([idx, url]) => {
      onPhotoReplaced(Number(idx), url);
      setDone(prev => ({ ...prev, [idx]: true }));
    });
    toast({ title: "✓ All edited photos applied!" });
  };

  const resultCount = Object.keys(results).length;

  return (
    <div className="border-2 border-[#21ABB5]/30 rounded-2xl bg-[#DEF5F7]/10 p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#0F082B]">Bulk Photo Editor</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
        <button onClick={() => { setMode("edits"); setSelectedEdit(null); }} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${mode === "edits" ? "bg-white text-[#21ABB5] shadow-sm" : "text-[#606060]"}`}>
          🪄 AI Photo Edits
        </button>
        <button onClick={() => { setMode("staging"); setSelectedEdit(null); }} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${mode === "staging" ? "bg-white text-purple-600 shadow-sm" : "text-[#606060]"}`}>
          🛋️ Virtual Staging
        </button>
      </div>

      {/* Scope: all photos or single */}
      <div className="mb-4">
        <label className="text-xs font-medium text-[#606060] mb-2 block">Apply to:</label>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCurrentPhotoIdx(null)}
            className={`text-xs px-3 py-1.5 rounded-lg border-2 font-medium transition-all ${currentPhotoIdx === null ? "border-[#21ABB5] bg-[#DEF5F7]/40 text-[#21ABB5]" : "border-gray-200 text-[#606060]"}`}
          >
            All {photos.length} photos
          </button>
          {photos.map((_, i) => (
            <button key={i} onClick={() => setCurrentPhotoIdx(i)}
              className={`text-xs px-3 py-1.5 rounded-lg border-2 font-medium transition-all ${currentPhotoIdx === i ? "border-[#21ABB5] bg-[#DEF5F7]/40 text-[#21ABB5]" : "border-gray-200 text-[#606060]"}`}>
              Photo {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Edit options */}
      <div className="mb-4">
        <label className="text-xs font-medium text-[#606060] mb-2 block">
          {mode === "edits" ? "Choose an edit:" : "Choose a staging style:"}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {items.map(item => (
            <button key={item.key} onClick={() => setSelectedEdit(item.key)}
              className={`text-[11px] font-medium rounded-xl px-2 py-2 border-2 text-left transition-all leading-tight ${selectedEdit === item.key ? (mode === "staging" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-[#21ABB5] bg-[#DEF5F7]/40 text-[#21ABB5]") : "border-gray-100 bg-gray-50 text-[#606060] hover:border-gray-300"}`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={handleApplySelected}
        disabled={processing || !selectedEdit}
        className={`w-full rounded-xl gap-2 mb-4 ${mode === "staging" ? "bg-purple-600 hover:bg-purple-700" : "bg-[#21ABB5] hover:bg-[#1a9da6]"} text-white`}
      >
        {processing
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing {currentPhotoIdx !== null ? `photo ${currentPhotoIdx + 1}` : `all ${photos.length} photos`}...</>
          : <><Wand2 className="w-4 h-4" /> Apply to {currentPhotoIdx !== null ? `Photo ${currentPhotoIdx + 1}` : `All ${photos.length} Photos`}</>}
      </Button>

      {/* Results preview */}
      {resultCount > 0 && (
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#0F082B]">{resultCount} photo{resultCount > 1 ? "s" : ""} edited — review before/after:</p>
            {resultCount > 1 && (
              <Button size="sm" onClick={applyAll} className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-lg text-xs gap-1">
                <Check className="w-3 h-3" /> Apply All
              </Button>
            )}
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {Object.entries(results).map(([idx, url]) => (
              <div key={idx} className="flex items-center gap-3 bg-white rounded-xl p-2 border border-gray-100">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[9px] text-[#606060] mb-0.5 text-center">Original</p>
                    <img src={photos[Number(idx)]} alt="" className="w-full aspect-video object-cover rounded-lg" />
                  </div>
                  <div>
                    <p className="text-[9px] text-[#21ABB5] font-semibold mb-0.5 text-center">AI Edit</p>
                    <img src={url} alt="" className="w-full aspect-video object-cover rounded-lg border-2 border-[#21ABB5]" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {done[idx] ? (
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Check className="w-4 h-4 text-emerald-600" />
                    </div>
                  ) : (
                    <>
                      <button onClick={() => applyResult(Number(idx))} className="w-8 h-8 rounded-full bg-[#21ABB5] flex items-center justify-center hover:bg-[#1a9da6]">
                        <Check className="w-4 h-4 text-white" />
                      </button>
                      <button onClick={() => setResults(prev => { const n = {...prev}; delete n[idx]; return n; })} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-red-100">
                        <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}