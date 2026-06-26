import React, { useState } from "react";
import { Wand2, Loader2, Check, X, SplitSquareHorizontal, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const AI_EDITS = [
  { key: "sky_golden", label: "🌅 Golden Sunset Sky", prompt: "Replace the sky with a dramatic golden sunset sky with warm orange and pink clouds. Keep the property and foreground exactly as-is." },
  { key: "sky_blue", label: "☀️ Clear Blue Sky", prompt: "Replace the sky with a perfect clear blue sky with fluffy white clouds. Keep all property structures and landscaping identical." },
  { key: "twilight", label: "🌆 Twilight Conversion", prompt: "Convert to beautiful twilight/dusk. Deep blue-purple sky, warm interior lights glowing through windows." },
  { key: "lawn", label: "🌿 Lush Green Lawn", prompt: "Make all grass and lawn areas lush, vibrant green as if freshly watered in spring. Keep all structures identical." },
  { key: "brighten", label: "💡 Brighten & Warm", prompt: "Significantly brighten this photo. Make it look well-lit, warm, and inviting. Eliminate harsh shadows." },
  { key: "declutter", label: "🧹 Declutter & Clean", prompt: "Remove ALL clutter, personal items, and mess from this photo. Make it look clean, minimal, and professionally staged." },
  { key: "hdr", label: "🌈 HDR Boost", prompt: "Apply HDR-style enhancement. Rich colours, deep blacks, bright highlights, dramatic detail. Photorealistic." },
  { key: "remove_car", label: "🚗 Remove Cars", prompt: "Remove all cars and vehicles from this photo. Replace with clean driveway or street." },
  { key: "pool_sparkle", label: "💧 Crystal Pool", prompt: "Make the swimming pool water crystal clear, bright blue, sparkling. Keep all surroundings identical." },
  { key: "paint_walls", label: "🎨 Fresh White Walls", prompt: "Change all wall colours to a clean, fresh off-white. Keep all furniture, floors, and fixtures exactly the same." },
  { key: "magic_hour", label: "🌤️ Magic Hour", prompt: "Convert to magic hour/golden hour lighting. Warm orange-gold sunlight, long shadows, highly cinematic." },
  { key: "fix_lighting", label: "🔆 Fix Dark Corners", prompt: "Fix all dark corners and shadows. Add realistic ambient fill lighting so the entire space is evenly lit." },
  { key: "custom", label: "✏️ Custom Edit", prompt: "" },
];

const VIRTUAL_STAGING = [
  { key: "vs_luxury", label: "🛋️ Luxury Modern", style: "luxury", prompt: "Virtually stage this empty room with modern luxury South African furniture. Add a stylish sofa, coffee table, artwork, floor lamp, plants, and a designer rug. Warm neutral tones, high-end finishes. Make it look like a prestigious show home." },
  { key: "vs_minimal", label: "✨ Scandinavian Minimal", style: "minimal", prompt: "Virtually stage this empty room with minimal Scandinavian furniture. Clean lines, white oak, neutral tones, uncluttered. Perfect for modern buyers." },
  { key: "vs_contemporary", label: "🖤 Contemporary Dark", style: "contemporary", prompt: "Virtually stage this room with contemporary dark furniture. Deep charcoal sofa, black accents, brass fixtures, moody lighting. Sophisticated and dramatic." },
  { key: "vs_coastal", label: "🌊 Coastal Relaxed", style: "coastal", prompt: "Virtually stage this room in a relaxed coastal style. Light blue and white tones, natural textures, rattan, linen fabrics. Beachy and inviting." },
  { key: "vs_family", label: "👨‍👩‍👧 Family Comfortable", style: "family", prompt: "Virtually stage this room for a family. Comfortable L-shaped sofa, coffee table with books, warm rugs, family-friendly decor. Inviting and lived-in feel." },
  { key: "vs_bedroom_lux", label: "🛏️ Luxury Bedroom", style: "bedroom", prompt: "Virtually stage this bedroom with luxury hotel-quality white linen, upholstered headboard, bedside lamps, artwork, and a bench at the foot of the bed." },
  { key: "vs_remove", label: "🗑️ Remove Furniture", style: "remove", prompt: "Remove ALL furniture from this room. Leave only the empty room with floors, walls, and windows visible. Do not add anything." },
  { key: "vs_office", label: "💼 Home Office", style: "office", prompt: "Virtually stage this room as a stylish home office. Desk, ergonomic chair, bookshelves, a plant, and good lighting. Professional yet comfortable." },
];

export default function PhotoEditTab({ photos, onPhotoReplaced }) {
  const { toast } = useToast();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeSubTab, setActiveSubTab] = useState("edits"); // "edits" | "staging"
  const [selectedEdit, setSelectedEdit] = useState(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [processing, setProcessing] = useState(false);
  const [resultPhoto, setResultPhoto] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [appliedEdits, setAppliedEdits] = useState({});

  const currentPhoto = appliedEdits[selectedIdx] || photos[selectedIdx];
  const originalPhoto = photos[selectedIdx];
  const hasResult = !!resultPhoto;

  const selectPhoto = (idx) => {
    setSelectedIdx(idx);
    setResultPhoto(null);
    setCompareMode(false);
    setSelectedEdit(null);
    setCustomPrompt("");
  };

  const runEdit = async (prompt) => {
    if (!prompt.trim()) return;
    setProcessing(true);
    setResultPhoto(null);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Professional real estate photo edit for South African property marketing. ${prompt} Maintain photorealistic style, do not make it look like AI-generated art.`,
        existing_image_urls: [originalPhoto],
      });
      setResultPhoto(result.url);
      setCompareMode(true);
      toast({ title: "Edit complete!", description: "Compare before/after and choose to apply." });
    } catch {
      toast({ title: "Edit failed", description: "Please try again.", variant: "destructive" });
    }
    setProcessing(false);
  };

  const handleApplyEdit = () => {
    if (!resultPhoto) return;
    setAppliedEdits(prev => ({ ...prev, [selectedIdx]: resultPhoto }));
    onPhotoReplaced(selectedIdx, resultPhoto);
    setResultPhoto(null);
    setCompareMode(false);
    toast({ title: "✓ Photo updated in video!" });
  };

  const handleDiscard = () => {
    setResultPhoto(null);
    setCompareMode(false);
  };

  const editItems = activeSubTab === "edits" ? AI_EDITS : VIRTUAL_STAGING;
  const isCustom = selectedEdit === "custom";
  const selectedItem = editItems.find(e => e.key === selectedEdit);

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 flex-shrink-0">
        <button
          onClick={() => { setActiveSubTab("edits"); setSelectedEdit(null); setResultPhoto(null); }}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeSubTab === "edits" ? "bg-white text-[#21ABB5] shadow-sm" : "text-[#606060]"}`}
        >
          🪄 AI Photo Edits
        </button>
        <button
          onClick={() => { setActiveSubTab("staging"); setSelectedEdit(null); setResultPhoto(null); }}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeSubTab === "staging" ? "bg-white text-purple-600 shadow-sm" : "text-[#606060]"}`}
        >
          🛋️ Virtual Staging
        </button>
      </div>

      {/* Photo selector */}
      <div className="mb-3 flex-shrink-0">
        <p className="text-[10px] font-semibold text-[#606060] mb-2 uppercase tracking-wide">Select Photo ({selectedIdx + 1} of {photos.length})</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <button
              key={i}
              onClick={() => selectPhoto(i)}
              className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${selectedIdx === i ? "border-[#21ABB5] shadow-sm" : "border-gray-200 opacity-50 hover:opacity-80"}`}
            >
              <img src={appliedEdits[i] || url} alt="" className="w-full h-full object-cover" />
              {appliedEdits[i] && (
                <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#21ABB5] rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Current photo preview */}
      <div className="mb-3 flex-shrink-0">
        {hasResult && compareMode ? (
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-1">
              <div>
                <p className="text-[10px] text-[#606060] mb-0.5 text-center">Original</p>
                <img src={originalPhoto} alt="Original" className="w-full aspect-video object-cover rounded-lg border border-gray-200" />
              </div>
              <div>
                <p className="text-[10px] text-[#21ABB5] font-semibold mb-0.5 text-center">AI Result</p>
                <img src={resultPhoto} alt="Edited" className="w-full aspect-video object-cover rounded-lg border-2 border-[#21ABB5]" />
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" onClick={handleApplyEdit} className="flex-1 bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-lg text-xs gap-1">
                <Check className="w-3 h-3" /> Use this photo
              </Button>
              <Button size="sm" variant="outline" onClick={handleDiscard} className="rounded-lg text-xs gap-1">
                <X className="w-3 h-3" /> Discard
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
            <img src={currentPhoto} alt="" className="w-full h-full object-cover" />
            {processing && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
                <p className="text-white text-xs font-medium">AI is editing...</p>
              </div>
            )}
            {appliedEdits[selectedIdx] && !processing && (
              <div className="absolute top-2 left-2 bg-[#21ABB5] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                ✓ Edited
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit options */}
      {activeSubTab === "edits" && (
        <div className="space-y-2 flex-1 overflow-y-auto">
          <p className="text-[10px] font-semibold text-[#606060] uppercase tracking-wide">
            Choose an edit to apply
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {AI_EDITS.filter(e => e.key !== "custom").map(edit => (
              <button
                key={edit.key}
                onClick={() => setSelectedEdit(edit.key)}
                className={`text-[10px] font-medium rounded-xl px-2 py-2.5 border-2 text-left transition-all leading-tight ${
                  selectedEdit === edit.key
                    ? "border-[#21ABB5] bg-[#DEF5F7]/40 text-[#21ABB5]"
                    : "border-gray-100 bg-gray-50 text-[#606060] hover:border-gray-300"
                }`}
              >
                {edit.label}
              </button>
            ))}
          </div>

          {/* Custom prompt */}
          <div className={`border-2 rounded-xl p-2.5 transition-all ${selectedEdit === "custom" ? "border-[#21ABB5] bg-[#DEF5F7]/20" : "border-gray-100"}`}>
            <button onClick={() => setSelectedEdit("custom")} className="w-full text-left">
              <p className={`text-[10px] font-semibold mb-1.5 ${selectedEdit === "custom" ? "text-[#21ABB5]" : "text-[#606060]"}`}>
                ✏️ Custom Edit — describe what you want
              </p>
            </button>
            <textarea
              value={customPrompt}
              onChange={e => { setCustomPrompt(e.target.value); setSelectedEdit("custom"); }}
              placeholder="e.g. Add a sparkling pool to the backyard, paint the front door red..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] outline-none focus:ring-1 focus:ring-[#21ABB5] resize-none"
            />
          </div>

          <Button
            onClick={() => {
              const prompt = selectedEdit === "custom"
                ? customPrompt
                : AI_EDITS.find(e => e.key === selectedEdit)?.prompt || "";
              runEdit(prompt);
            }}
            disabled={processing || (!selectedEdit) || (selectedEdit === "custom" && !customPrompt.trim())}
            className="w-full bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-xl gap-2"
          >
            {processing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Editing photo...</>
              : <><Wand2 className="w-4 h-4" /> Apply AI Edit</>}
          </Button>
        </div>
      )}

      {activeSubTab === "staging" && (
        <div className="space-y-2 flex-1 overflow-y-auto">
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5">
            <p className="text-[10px] font-semibold text-purple-800 mb-0.5">💡 How Virtual Staging works</p>
            <p className="text-[10px] text-purple-700">
              Select a room style below, then click "Stage This Room". AI will furnish the space. Works best on empty or sparsely furnished rooms.
            </p>
          </div>

          <p className="text-[10px] font-semibold text-[#606060] uppercase tracking-wide">Choose a staging style</p>

          <div className="grid grid-cols-2 gap-1.5">
            {VIRTUAL_STAGING.map(style => (
              <button
                key={style.key}
                onClick={() => setSelectedEdit(style.key)}
                className={`text-[10px] font-medium rounded-xl px-2 py-2.5 border-2 text-left transition-all leading-tight ${
                  selectedEdit === style.key
                    ? "border-purple-500 bg-purple-50 text-purple-700"
                    : "border-gray-100 bg-gray-50 text-[#606060] hover:border-gray-300"
                }`}
              >
                {style.label}
              </button>
            ))}
          </div>

          <Button
            onClick={() => {
              const stage = VIRTUAL_STAGING.find(s => s.key === selectedEdit);
              if (stage) runEdit(stage.prompt);
            }}
            disabled={processing || !selectedEdit}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl gap-2"
          >
            {processing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Staging room...</>
              : <><Wand2 className="w-4 h-4" /> Stage This Room</>}
          </Button>

          <p className="text-[10px] text-[#606060] text-center">
            <Info className="w-3 h-3 inline mr-0.5" />
            AI edits are non-destructive — compare and choose to apply.
          </p>
        </div>
      )}
    </div>
  );
}