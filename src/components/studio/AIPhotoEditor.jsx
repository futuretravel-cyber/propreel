import React, { useState } from "react";
import { Wand2, Loader2, Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const EDIT_PRESETS = [
  { key: "sky", label: "Sky Replacement", prompt: "Replace the sky with a dramatic golden sunset sky. Keep the property and foreground exactly the same." },
  { key: "twilight", label: "Day to Twilight", prompt: "Convert this daytime real estate photo to a beautiful twilight/dusk shot with warm interior lights glowing and a purple-orange sky." },
  { key: "lawn", label: "Lawn Greening", prompt: "Make the lawn and garden grass lush, vibrant green. Keep all structures and the property unchanged." },
  { key: "declutter", label: "Declutter / Clean", prompt: "Remove all clutter, personal items, and mess from this room. Make it look clean, minimal and staged for real estate." },
  { key: "brighten", label: "Brighten Interior", prompt: "Brighten this interior real estate photo. Make it look well-lit, warm, and inviting. Enhance all light sources." },
  { key: "virtual_stage", label: "Virtual Staging", prompt: "Add modern, elegant South African furniture to this empty room. Style it as a luxury show home for real estate marketing." },
];

export default function AIPhotoEditor({ photos, onPhotoReplaced }) {
  const { toast } = useToast();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [editing, setEditing] = useState(false);
  const [editedPhotos, setEditedPhotos] = useState({}); // idx -> edited url
  const [previewing, setPreviewing] = useState(null); // idx being previewed

  const handleEdit = async () => {
    const prompt = selectedPreset
      ? EDIT_PRESETS.find(p => p.key === selectedPreset)?.prompt
      : customPrompt;
    if (!prompt) return;

    setEditing(true);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Real estate photo edit: ${prompt}`,
        existing_image_urls: [photos[selectedIdx]],
      });
      setEditedPhotos(prev => ({ ...prev, [selectedIdx]: result.url }));
      toast({ title: "AI edit complete!" });
    } catch {
      toast({ title: "Edit failed", description: "Please try again.", variant: "destructive" });
    }
    setEditing(false);
  };

  const applyEdit = (idx) => {
    onPhotoReplaced(idx, editedPhotos[idx]);
    toast({ title: "Photo updated in video" });
  };

  const discardEdit = (idx) => {
    setEditedPhotos(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-[#0F082B]">AI Photo Editor</p>
      <p className="text-[10px] text-[#606060]">Select a photo, choose an edit, then apply it to your video.</p>

      {/* Photo selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {photos.map((url, i) => (
          <button
            key={i}
            onClick={() => setSelectedIdx(i)}
            className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${selectedIdx === i ? "border-[#21ABB5]" : "border-gray-200 opacity-60 hover:opacity-100"}`}
          >
            <img src={editedPhotos[i] || url} alt="" className="w-full h-full object-cover" />
            {editedPhotos[i] && (
              <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#21ABB5] rounded-full flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Before/After preview */}
      {editedPhotos[selectedIdx] ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-[#606060] mb-1 text-center">Before</p>
              <img src={photos[selectedIdx]} alt="" className="w-full aspect-video object-cover rounded-lg" />
            </div>
            <div>
              <p className="text-[10px] text-[#21ABB5] mb-1 text-center font-semibold">After (AI)</p>
              <img src={editedPhotos[selectedIdx]} alt="" className="w-full aspect-video object-cover rounded-lg ring-2 ring-[#21ABB5]" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => applyEdit(selectedIdx)} className="flex-1 bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-lg gap-1.5 text-xs">
              <Check className="w-3.5 h-3.5" /> Use in video
            </Button>
            <Button size="sm" variant="outline" onClick={() => discardEdit(selectedIdx)} className="rounded-lg gap-1.5 text-xs">
              <X className="w-3.5 h-3.5" /> Discard
            </Button>
          </div>
        </div>
      ) : (
        <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
          <img src={photos[selectedIdx]} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Edit presets */}
      <div>
        <p className="text-[10px] font-medium text-[#606060] mb-2">AI edit presets</p>
        <div className="grid grid-cols-2 gap-1.5">
          {EDIT_PRESETS.map(preset => (
            <button
              key={preset.key}
              onClick={() => { setSelectedPreset(preset.key); setCustomPrompt(""); }}
              className={`text-[10px] font-medium rounded-lg px-2 py-2 border-2 text-left transition-all ${selectedPreset === preset.key ? "border-[#21ABB5] bg-[#DEF5F7]/30 text-[#21ABB5]" : "border-gray-100 bg-gray-50 text-[#606060] hover:border-gray-300"}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom prompt */}
      <div>
        <p className="text-[10px] font-medium text-[#606060] mb-1">Or custom instruction</p>
        <textarea
          value={customPrompt}
          onChange={e => { setCustomPrompt(e.target.value); setSelectedPreset(null); }}
          placeholder="e.g. Add a sparkling pool to the backyard..."
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5] resize-none"
        />
      </div>

      <Button
        onClick={handleEdit}
        disabled={editing || (!selectedPreset && !customPrompt.trim())}
        className="w-full bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-xl gap-2 text-sm"
      >
        {editing ? <><Loader2 className="w-4 h-4 animate-spin" /> Editing with AI...</> : <><Wand2 className="w-4 h-4" /> Apply AI Edit</>}
      </Button>
    </div>
  );
}