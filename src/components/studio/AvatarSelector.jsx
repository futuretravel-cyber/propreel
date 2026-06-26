import React, { useState } from "react";
import { User, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const AVATARS = [
  { id: "sarah", name: "Sarah", style: "Professional", gender: "female", description: "Corporate realtor style", emoji: "👩‍💼" },
  { id: "james", name: "James", style: "Friendly", gender: "male", description: "Approachable estate agent", emoji: "👨‍💼" },
  { id: "amara", name: "Amara", style: "Luxury", gender: "female", description: "High-end property specialist", emoji: "👩🏾‍💼" },
  { id: "david", name: "David", style: "Modern", gender: "male", description: "Contemporary style agent", emoji: "🧑‍💼" },
];

const POSITIONS = [
  { key: "bottom-left", label: "Bottom left" },
  { key: "bottom-right", label: "Bottom right" },
  { key: "top-left", label: "Top left" },
];

export default function AvatarSelector({ selectedAvatarId, setSelectedAvatarId, project }) {
  const { toast } = useToast();
  const [position, setPosition] = useState("bottom-right");
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const selectedAvatar = AVATARS.find(a => a.id === selectedAvatarId);

  const generatePreview = async () => {
    if (!selectedAvatar) return;
    setGenerating(true);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Professional real estate agent avatar: ${selectedAvatar.name}, ${selectedAvatar.style} style, ${selectedAvatar.gender}, wearing smart business attire, white background, portrait headshot, photorealistic, high quality, South African real estate professional`,
      });
      setPreviewUrl(result.url);
      toast({ title: `${selectedAvatar.name} avatar generated!` });
    } catch {
      toast({ title: "Generation failed", variant: "destructive" });
    }
    setGenerating(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-[#0F082B]">AI Avatar</p>
      <p className="text-[10px] text-[#606060]">Add a virtual presenter to your video intro or outro.</p>

      {/* Avatar grid */}
      <div className="grid grid-cols-2 gap-2">
        {AVATARS.map(avatar => (
          <button
            key={avatar.id}
            onClick={() => { setSelectedAvatarId(avatar.id); setPreviewUrl(null); }}
            className={`p-3 rounded-xl border-2 text-left transition-all ${selectedAvatarId === avatar.id ? "border-[#21ABB5] bg-[#DEF5F7]/30" : "border-gray-100 hover:border-gray-200 bg-gray-50"}`}
          >
            <div className="text-2xl mb-1">{avatar.emoji}</div>
            <p className={`text-xs font-semibold ${selectedAvatarId === avatar.id ? "text-[#21ABB5]" : "text-[#0F082B]"}`}>{avatar.name}</p>
            <p className="text-[10px] text-[#606060]">{avatar.style}</p>
          </button>
        ))}
      </div>

      {/* Avatar preview */}
      {previewUrl && (
        <div className="relative">
          <img src={previewUrl} alt="" className="w-full aspect-square object-cover rounded-xl" />
          <div className="absolute bottom-2 right-2 bg-[#21ABB5] text-white text-[10px] font-semibold px-2 py-0.5 rounded">
            {selectedAvatar?.name}
          </div>
        </div>
      )}

      {/* Position */}
      {selectedAvatarId && (
        <div>
          <p className="text-[10px] font-medium text-[#606060] mb-1.5">Position in video</p>
          <div className="flex gap-1.5">
            {POSITIONS.map(pos => (
              <button
                key={pos.key}
                onClick={() => setPosition(pos.key)}
                className={`flex-1 text-[10px] font-medium py-1.5 rounded-lg border-2 transition-all ${position === pos.key ? "border-[#21ABB5] bg-[#DEF5F7]/30 text-[#21ABB5]" : "border-gray-100 bg-gray-50 text-[#606060]"}`}
              >
                {pos.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedAvatarId && (
        <Button
          onClick={generatePreview}
          disabled={generating}
          className="w-full bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-xl gap-2 text-sm"
        >
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating avatar...</> : <><User className="w-4 h-4" /> Generate AI Avatar Preview</>}
        </Button>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
        <p className="text-[10px] text-amber-800">
          <span className="font-semibold">Note:</span> AI avatar overlays are rendered on the intro/outro frames. For best results, ensure your brand kit is also selected.
        </p>
      </div>
    </div>
  );
}