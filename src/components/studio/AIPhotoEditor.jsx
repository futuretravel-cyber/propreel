import React, { useState, useCallback } from "react";
import { Wand2, Loader2, Check, X, Sparkles, SplitSquareHorizontal, Maximize2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// Scene-aware edit suggestions
const SCENE_PRESETS = {
  exterior: [
    { key: "sky_golden", label: "🌅 Golden Sunset Sky", prompt: "Replace the sky with a dramatic golden sunset sky with warm orange and pink clouds. Keep the property and foreground exactly as-is, pixel-perfect building preservation." },
    { key: "sky_blue", label: "☀️ Clear Blue Sky", prompt: "Replace the sky with a perfect clear blue sky with fluffy white clouds. Keep all property structures and landscaping identical." },
    { key: "sky_twilight", label: "🌆 Twilight Dusk", prompt: "Convert to beautiful twilight/dusk. Deep blue-purple sky, warm interior lights glowing through windows, soft ambient exterior lighting." },
    { key: "lawn_green", label: "🌿 Lush Lawn", prompt: "Make all grass and lawn areas lush, vibrant green as if freshly watered in spring. Keep all structures, paths, and hardscaping identical." },
    { key: "pool_sparkle", label: "💧 Sparkle Pool", prompt: "Make the swimming pool water crystal clear, sparkling bright blue. Enhance pool lighting if any. Keep all surroundings identical." },
    { key: "driveway", label: "🚗 Clean Driveway", prompt: "Remove all cars, remove oil stains, make the driveway and paving look clean, freshly swept, and pristine." },
    { key: "garden", label: "🌺 Garden Bloom", prompt: "Enhance all garden plants and flowers to be in full bloom, lush and colourful. Keep all structures identical." },
  ],
  interior: [
    { key: "brighten", label: "💡 Brighten & Warm", prompt: "Significantly brighten this interior photo. Make it look well-lit, warm, and inviting. Enhance ceiling lights and natural window light. Eliminate harsh shadows." },
    { key: "declutter", label: "🧹 Declutter Room", prompt: "Remove ALL clutter, personal items, magazines, toys, dishes, and mess from this room. Make it look clean, minimal, and professionally staged for real estate." },
    { key: "tv_black", label: "📺 Black TV Screen", prompt: "Make the television screen completely black/off. Do not change anything else in the room." },
    { key: "virtual_stage_luxury", label: "🛋️ Luxury Staging", prompt: "Virtually stage this empty room with modern luxury South African furniture. Add a stylish sofa, coffee table, artwork, plants, and rugs. Make it look like a high-end show home." },
    { key: "virtual_stage_minimal", label: "✨ Minimal Staging", prompt: "Virtually stage this room with minimal, Scandinavian-style furniture. Clean lines, neutral tones, uncluttered. Perfect for modern buyers." },
    { key: "remove_furniture", label: "🗑️ Remove Furniture", prompt: "Remove ALL furniture from this room. Leave only the empty room with floors, walls, and windows visible. Do not add anything." },
    { key: "paint_walls", label: "🎨 Fresh White Walls", prompt: "Change all wall colours to a clean, fresh off-white or warm white. Keep all furniture, floors, and fixtures exactly the same." },
    { key: "fix_lighting", label: "🔆 Fix Dark Corners", prompt: "Fix all dark corners and shadows in this room. Add realistic ambient fill lighting so the entire room is evenly lit and inviting." },
  ],
  kitchen: [
    { key: "brighten", label: "💡 Brighten & Warm", prompt: "Brighten this kitchen photo significantly. Make it look well-lit, warm, and inviting with enhanced overhead and under-cabinet lighting." },
    { key: "declutter", label: "🧹 Clear Counters", prompt: "Remove all items from kitchen counters — dishes, appliances, food, clutter. Leave counters completely clear and clean." },
    { key: "modern_update", label: "🔧 Modern Upgrade", prompt: "Digitally upgrade this kitchen. Replace dated hardware with brushed steel handles. Add modern pendant lights. Make it look contemporary and desirable." },
    { key: "stone_counter", label: "🪨 Stone Countertops", prompt: "Replace kitchen countertops with beautiful marble or quartz stone countertops. Keep all cabinets, appliances, and layout identical." },
  ],
  bedroom: [
    { key: "brighten", label: "💡 Brighten Room", prompt: "Brighten this bedroom photo. Enhance natural light from windows and bedside lamps. Make it look airy and inviting." },
    { key: "virtual_stage_bed", label: "🛏️ Luxury Bed Dressing", prompt: "Replace or enhance the bedding with luxury hotel-quality white linen, decorative cushions, and a throw blanket. Add bedside lamps if missing." },
    { key: "declutter", label: "🧹 Tidy Bedroom", prompt: "Remove all personal items, clothes on floor, and clutter from this bedroom. Make it look clean, hotel-like." },
    { key: "neutral_walls", label: "🎨 Neutral Walls", prompt: "Change all walls to a calm, neutral greige or warm white colour. Keep all furniture and floors identical." },
  ],
  bathroom: [
    { key: "brighten", label: "💡 Brighten", prompt: "Significantly brighten this bathroom. Enhance mirror lighting and overhead lights. Make tiles sparkle." },
    { key: "spa_style", label: "🛁 Spa Makeover", prompt: "Make this bathroom look like a luxury spa. Add fluffy white towels, candles, and orchid plants. Make surfaces gleam." },
    { key: "declutter", label: "🧹 Clear Surfaces", prompt: "Remove all personal items, toiletries, towels from surfaces. Leave the bathroom empty and pristine for photography." },
    { key: "tile_enhance", label: "✨ Enhance Tiles", prompt: "Make all bathroom tiles look freshly cleaned and gleaming. Remove grout discoloration. Make the room look spotless." },
  ],
  pool: [
    { key: "pool_sparkle", label: "💧 Crystal Pool", prompt: "Make the swimming pool water crystal clear, bright blue, sparkling. Enhance pool lighting. Make surrounds look pristine." },
    { key: "twilight_pool", label: "🌆 Twilight Pool", prompt: "Convert to twilight scene. Pool lit from within, warm patio lights, purple-blue sky. Very dramatic and desirable." },
    { key: "surround_clean", label: "🧹 Clean Surrounds", prompt: "Clean all pool surrounds, remove leaves and debris from water, power-wash the paving, make the entire pool area look pristine." },
  ],
  unknown: [
    { key: "enhance", label: "✨ Auto Enhance", prompt: "Enhance this real estate photo: improve brightness, contrast, colour saturation, and sharpness. Make it look like a professional real estate photograph." },
    { key: "sky_blue", label: "☀️ Better Sky", prompt: "If sky is visible, replace with a perfect clear blue sky. Enhance overall photo quality and appeal." },
    { key: "declutter", label: "🧹 Declutter", prompt: "Remove all clutter and personal items from this photo. Make it look clean and professionally staged." },
    { key: "brighten", label: "💡 Brighten", prompt: "Brighten this photo significantly. Improve lighting to make the space look inviting and well-lit." },
  ],
};

const SCENE_LABELS = {
  exterior: "🏠 Exterior",
  interior: "🛋️ Interior / Living Room",
  kitchen: "🍳 Kitchen",
  bedroom: "🛏️ Bedroom",
  bathroom: "🚿 Bathroom",
  pool: "💧 Pool / Outdoor",
  unknown: "📷 General",
};

const UNIVERSAL_PRESETS = [
  { key: "hdr", label: "🌈 HDR Boost", prompt: "Apply HDR-style enhancement to this real estate photo. Rich colours, deep blacks, bright highlights, dramatic detail." },
  { key: "remove_car", label: "🚗 Remove Cars", prompt: "Remove all cars and vehicles from this photo. Replace with clean driveway or street as appropriate." },
  { key: "add_people", label: "👨‍👩‍👧 Lifestyle Scene", prompt: "Add a happy, well-dressed South African family enjoying the space (not looking at camera). Make it feel aspirational and liveable." },
  { key: "twilight_any", label: "🌆 Magic Hour", prompt: "Convert this photo to magic hour/golden hour lighting. Warm orange-gold sunlight, long shadows, highly cinematic." },
  { key: "rain_remove", label: "☀️ Remove Rain/Clouds", prompt: "Remove any grey clouds, overcast sky, or rain. Replace with beautiful clear blue sky and sunshine." },
  { key: "watermark_remove", label: "🚫 Remove Watermarks", prompt: "Remove any watermarks, text overlays, or timestamps from this photo. Restore the underlying image." },
];

async function analyzeScene(photoUrl) {
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this real estate property photo. Identify:
1. scene_type: one of "exterior", "interior", "kitchen", "bedroom", "bathroom", "pool", "unknown"
2. description: 1-sentence description of what you see
3. top_issues: array of up to 3 strings describing the main issues (e.g. "overcast sky", "cluttered counters", "dark room")
4. suggested_edits: array of up to 3 specific edit suggestions as short labels`,
      file_urls: [photoUrl],
      response_json_schema: {
        type: "object",
        properties: {
          scene_type: { type: "string" },
          description: { type: "string" },
          top_issues: { type: "array", items: { type: "string" } },
          suggested_edits: { type: "array", items: { type: "string" } },
        },
      },
    });
    return result;
  } catch {
    return { scene_type: "unknown", description: "", top_issues: [], suggested_edits: [] };
  }
}

export default function AIPhotoEditor({ photos, onPhotoReplaced }) {
  const { toast } = useToast();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [editing, setEditing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [editedPhotos, setEditedPhotos] = useState({});
  const [sceneData, setSceneData] = useState({});
  const [resolution, setResolution] = useState("standard");
  const [compareMode, setCompareMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState("smart");

  const currentScene = sceneData[selectedIdx];
  const scenePresets = currentScene ? (SCENE_PRESETS[currentScene.scene_type] || SCENE_PRESETS.unknown) : [];
  const hasEdit = !!editedPhotos[selectedIdx];

  const selectPhoto = useCallback(async (idx) => {
    setSelectedIdx(idx);
    setSelectedPreset(null);
    setCustomPrompt("");
    setCompareMode(false);
    if (!sceneData[idx]) {
      setAnalyzing(true);
      const data = await analyzeScene(photos[idx]);
      setSceneData(prev => ({ ...prev, [idx]: data }));
      setAnalyzing(false);
    }
  }, [photos, sceneData]);

  // Auto-analyze first photo on mount
  useState(() => {
    if (photos.length > 0 && !sceneData[0]) {
      selectPhoto(0);
    }
  });

  const handleEdit = async () => {
    let prompt = "";
    if (selectedPreset) {
      const allPresets = [...scenePresets, ...UNIVERSAL_PRESETS];
      prompt = allPresets.find(p => p.key === selectedPreset)?.prompt || "";
    } else {
      prompt = customPrompt;
    }
    if (!prompt) return;

    setEditing(true);
    try {
      const qualityNote = resolution === "hd"
        ? " High definition output, maximum detail, sharp edges, photorealistic."
        : " Standard real estate quality.";
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Professional real estate photo edit for South African property marketing. ${prompt}${qualityNote} Maintain photorealistic style, do not make it look like AI-generated art.`,
        existing_image_urls: [photos[selectedIdx]],
      });
      setEditedPhotos(prev => ({ ...prev, [selectedIdx]: result.url }));
      setCompareMode(true);
      toast({ title: "AI edit complete!", description: "Compare before/after below." });
    } catch {
      toast({ title: "Edit failed", description: "Please try again.", variant: "destructive" });
    }
    setEditing(false);
  };

  const applyEdit = () => {
    onPhotoReplaced(selectedIdx, editedPhotos[selectedIdx]);
    toast({ title: "Photo updated in video!" });
  };

  const discardEdit = () => {
    setEditedPhotos(prev => {
      const next = { ...prev };
      delete next[selectedIdx];
      return next;
    });
    setCompareMode(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#0F082B]">AI Photo Editor</p>
        {currentScene && (
          <span className="text-[10px] bg-[#DEF5F7] text-[#21ABB5] font-semibold px-2 py-0.5 rounded-full">
            {SCENE_LABELS[currentScene.scene_type] || "📷 Detected"}
          </span>
        )}
      </div>

      {/* Photo strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {photos.map((url, i) => (
          <button
            key={i}
            onClick={() => selectPhoto(i)}
            className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${selectedIdx === i ? "border-[#21ABB5]" : "border-gray-200 opacity-60 hover:opacity-100"}`}
          >
            <img src={editedPhotos[i] || url} alt="" className="w-full h-full object-cover" />
            {editedPhotos[i] && (
              <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#21ABB5] rounded-full flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
            {sceneData[i] && !editedPhotos[i] && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[8px] text-center py-0.5 truncate">
                {sceneData[i].scene_type}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Scene analysis */}
      {analyzing && (
        <div className="flex items-center gap-2 bg-[#DEF5F7]/30 rounded-xl p-3">
          <Loader2 className="w-4 h-4 text-[#21ABB5] animate-spin flex-shrink-0" />
          <p className="text-xs text-[#606060]">AI is analysing this photo...</p>
        </div>
      )}

      {currentScene && !analyzing && (
        <div className="bg-[#DEF5F7]/20 border border-[#21ABB5]/20 rounded-xl p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-[#0F082B]">📸 {currentScene.description}</p>
          {currentScene.top_issues?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {currentScene.top_issues.map((issue, i) => (
                <span key={i} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                  ⚠️ {issue}
                </span>
              ))}
            </div>
          )}
          {currentScene.suggested_edits?.length > 0 && (
            <div>
              <p className="text-[10px] text-[#606060] mb-1">💡 AI suggests:</p>
              <div className="flex flex-wrap gap-1">
                {currentScene.suggested_edits.map((s, i) => (
                  <span key={i} className="text-[10px] bg-[#DEF5F7] text-[#21ABB5] px-1.5 py-0.5 rounded-full font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Before/After */}
      {hasEdit && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-[#0F082B]">Before / After</p>
            <button
              onClick={() => setCompareMode(v => !v)}
              className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg transition-colors ${compareMode ? "bg-[#21ABB5] text-white" : "bg-gray-100 text-[#606060]"}`}
            >
              <SplitSquareHorizontal className="w-3 h-3" /> Compare
            </button>
          </div>
          {compareMode ? (
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <p className="text-[10px] text-[#606060] mb-1 text-center">Original</p>
                <img src={photos[selectedIdx]} alt="" className="w-full aspect-video object-cover rounded-lg border border-gray-200" />
              </div>
              <div>
                <p className="text-[10px] text-[#21ABB5] mb-1 text-center font-semibold">AI Edit</p>
                <img src={editedPhotos[selectedIdx]} alt="" className="w-full aspect-video object-cover rounded-lg border-2 border-[#21ABB5]" />
              </div>
            </div>
          ) : (
            <img src={editedPhotos[selectedIdx]} alt="" className="w-full aspect-video object-cover rounded-lg border-2 border-[#21ABB5]" />
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={applyEdit} className="flex-1 bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-lg gap-1 text-xs">
              <Check className="w-3.5 h-3.5" /> Use in video
            </Button>
            <Button size="sm" variant="outline" onClick={discardEdit} className="rounded-lg gap-1 text-xs">
              <X className="w-3.5 h-3.5" /> Discard
            </Button>
          </div>
        </div>
      )}

      {!hasEdit && (
        <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden relative">
          <img src={photos[selectedIdx]} alt="" className="w-full h-full object-cover" />
          {analyzing && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white animate-pulse" />
            </div>
          )}
        </div>
      )}

      {/* Resolution toggle */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setResolution("standard")}
          className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold border-2 transition-all ${resolution === "standard" ? "border-[#21ABB5] bg-[#DEF5F7]/30 text-[#21ABB5]" : "border-gray-100 bg-gray-50 text-[#606060]"}`}
        >
          Standard
        </button>
        <button
          onClick={() => setResolution("hd")}
          className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold border-2 transition-all ${resolution === "hd" ? "border-[#21ABB5] bg-[#DEF5F7]/30 text-[#21ABB5]" : "border-gray-100 bg-gray-50 text-[#606060]"}`}
        >
          ✨ HD Quality
        </button>
      </div>

      {/* Preset categories */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {[
          { key: "smart", label: "🤖 Smart" },
          { key: "scene", label: "📍 Scene" },
          { key: "universal", label: "🌍 Universal" },
          { key: "custom", label: "✏️ Custom" },
        ].map(cat => (
          <button
            key={cat.key}
            onClick={() => { setActiveCategory(cat.key); setSelectedPreset(null); }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all border-2 ${activeCategory === cat.key ? "border-[#21ABB5] bg-[#DEF5F7]/30 text-[#21ABB5]" : "border-gray-100 bg-gray-50 text-[#606060]"}`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {activeCategory === "smart" && currentScene && !analyzing && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-[#606060] font-medium">Recommended for this {currentScene.scene_type}</p>
          <div className="grid grid-cols-1 gap-1.5">
            {scenePresets.slice(0, 4).map(preset => (
              <button
                key={preset.key}
                onClick={() => { setSelectedPreset(preset.key); setCustomPrompt(""); }}
                className={`text-[10px] font-medium rounded-xl px-3 py-2.5 border-2 text-left transition-all ${selectedPreset === preset.key ? "border-[#21ABB5] bg-[#DEF5F7]/30 text-[#21ABB5]" : "border-gray-100 bg-gray-50 text-[#606060] hover:border-gray-300"}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeCategory === "smart" && !currentScene && !analyzing && (
        <div className="text-center py-4 text-[10px] text-[#606060]">
          Select a photo above to get AI-powered suggestions
        </div>
      )}

      {activeCategory === "scene" && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-[#606060] font-medium">All {SCENE_LABELS[currentScene?.scene_type] || "scene"} edits</p>
          <div className="grid grid-cols-1 gap-1.5">
            {scenePresets.map(preset => (
              <button
                key={preset.key}
                onClick={() => { setSelectedPreset(preset.key); setCustomPrompt(""); }}
                className={`text-[10px] font-medium rounded-xl px-3 py-2.5 border-2 text-left transition-all ${selectedPreset === preset.key ? "border-[#21ABB5] bg-[#DEF5F7]/30 text-[#21ABB5]" : "border-gray-100 bg-gray-50 text-[#606060] hover:border-gray-300"}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeCategory === "universal" && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-[#606060] font-medium">Works on any photo</p>
          <div className="grid grid-cols-1 gap-1.5">
            {UNIVERSAL_PRESETS.map(preset => (
              <button
                key={preset.key}
                onClick={() => { setSelectedPreset(preset.key); setCustomPrompt(""); }}
                className={`text-[10px] font-medium rounded-xl px-3 py-2.5 border-2 text-left transition-all ${selectedPreset === preset.key ? "border-[#21ABB5] bg-[#DEF5F7]/30 text-[#21ABB5]" : "border-gray-100 bg-gray-50 text-[#606060] hover:border-gray-300"}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeCategory === "custom" && (
        <div className="space-y-2">
          <p className="text-[10px] text-[#606060] font-medium">Describe the edit you want</p>
          <textarea
            value={customPrompt}
            onChange={e => { setCustomPrompt(e.target.value); setSelectedPreset(null); }}
            placeholder="e.g. Add a sparkling pool to the backyard, Paint the front door red, Add solar panels to the roof..."
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-2.5 py-2 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5] resize-none"
          />
        </div>
      )}

      <Button
        onClick={handleEdit}
        disabled={editing || (!selectedPreset && !customPrompt.trim()) || analyzing}
        className="w-full bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-xl gap-2 text-sm"
      >
        {editing
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Editing with AI...</>
          : <><Wand2 className="w-4 h-4" /> Apply AI Edit {resolution === "hd" ? "(HD)" : ""}</>}
      </Button>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5">
        <p className="text-[10px] text-[#606060]">
          <Info className="w-3 h-3 inline mr-1" />
          AI edits are non-destructive. Compare before/after and only apply edits you're happy with.
        </p>
      </div>
    </div>
  );
}