import React, { useState } from "react";
import { Mic, Play, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SA_VOICES = [
  { id: "alloy",   name: "Thandi",  accent: "Cape Town",  gender: "Female", desc: "Warm, professional SA female voice" },
  { id: "echo",    name: "Sipho",   accent: "Joburg",     gender: "Male",   desc: "Clear, authoritative SA male voice" },
  { id: "nova",    name: "Chloé",   accent: "Cape Town",  gender: "Female", desc: "Light, friendly English accent" },
  { id: "onyx",    name: "Zakhele", accent: "Durban",     gender: "Male",   desc: "Deep, rich SA male voice" },
  { id: "shimmer", name: "Liesel",  accent: "Pretoria",   gender: "Female", desc: "Crisp, energetic Afrikaans-English" },
  { id: "fable",   name: "Gareth",  accent: "Joburg",     gender: "Male",   desc: "Relaxed, conversational tone" },
];

export default function VoiceoverSelector({ script, setScript, selectedVoice, setSelectedVoice }) {
  const [previewLoading, setPreviewLoading] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const handlePreview = async (voice) => {
    if (!script.trim()) return;
    setPreviewLoading(voice.id);
    try {
      const previewText = script.slice(0, 200);
      const { url } = await base44.integrations.Core.GenerateSpeech({
        text: previewText,
        voice: voice.id,
        language_code: "en",
      });
      setPreviewUrl(url);
      const audio = new Audio(url);
      audio.play();
    } catch {
      // silent fail on preview
    }
    setPreviewLoading(null);
  };

  return (
    <div className="space-y-4">
      {/* Script */}
      <div>
        <label className="text-xs font-semibold text-[#0F082B] mb-1.5 block">Voiceover Script</label>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="e.g. Welcome to this stunning 4-bedroom family home nestled in the heart of Cape Town..."
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#0F082B] resize-none outline-none focus:ring-1 focus:ring-[#21ABB5] placeholder:text-gray-400"
        />
        <p className="text-xs text-[#606060] mt-1">{script.length} characters · ~{Math.ceil(script.length / 15)}s audio</p>
      </div>

      {/* Voice selection */}
      <div>
        <label className="text-xs font-semibold text-[#0F082B] mb-2 block">SA English Voice</label>
        <div className="grid grid-cols-1 gap-2">
          {SA_VOICES.map((voice) => {
            const isSelected = selectedVoice === voice.id;
            return (
              <button
                key={voice.id}
                onClick={() => setSelectedVoice(voice.id)}
                className={`flex items-center gap-3 rounded-xl p-3 border-2 text-left transition-all ${
                  isSelected ? "border-[#21ABB5] bg-[#DEF5F7]/30" : "border-gray-100 bg-gray-50 hover:border-gray-300"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-[#21ABB5]" : "bg-gray-200"}`}>
                  <Mic className={`w-3.5 h-3.5 ${isSelected ? "text-white" : "text-gray-500"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isSelected ? "text-[#21ABB5]" : "text-[#0F082B]"}`}>
                    {voice.name} <span className="font-normal text-[#606060]">· {voice.accent}</span>
                  </p>
                  <p className="text-xs text-[#606060]">{voice.desc}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {script.trim() && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePreview(voice); }}
                      disabled={previewLoading === voice.id}
                      className="w-7 h-7 rounded-full bg-gray-200 hover:bg-[#21ABB5] flex items-center justify-center transition-colors group"
                    >
                      <Play className="w-3 h-3 text-gray-500 group-hover:text-white fill-current ml-0.5" />
                    </button>
                  )}
                  {isSelected && <Check className="w-4 h-4 text-[#21ABB5]" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}