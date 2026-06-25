import React, { useState } from "react";
import { Mic, Play, Check, Sparkles, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

const SA_VOICES = [
  { id: "alloy",   name: "Thandi",  accent: "Cape Town",  gender: "Female", desc: "Warm, professional SA female voice" },
  { id: "echo",    name: "Sipho",   accent: "Joburg",     gender: "Male",   desc: "Clear, authoritative SA male voice" },
  { id: "nova",    name: "Chloé",   accent: "Cape Town",  gender: "Female", desc: "Light, friendly English accent" },
  { id: "onyx",    name: "Zakhele", accent: "Durban",     gender: "Male",   desc: "Deep, rich SA male voice" },
  { id: "shimmer", name: "Liesel",  accent: "Pretoria",   gender: "Female", desc: "Crisp, energetic Afrikaans-English" },
  { id: "fable",   name: "Gareth",  accent: "Joburg",     gender: "Male",   desc: "Relaxed, conversational tone" },
];

export default function VoiceoverSelector({ script, setScript, selectedVoice, setSelectedVoice, projectName, heading, subheading, photoCount }) {
  const [previewLoading, setPreviewLoading] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [details, setDetails] = useState({
    bedrooms: "",
    bathrooms: "",
    price: "",
    features: "",
    neighbourhood: "",
    tone: "professional",
  });

  const handlePreview = async (voice) => {
    if (!script.trim()) return;
    setPreviewLoading(voice.id);
    try {
      const { url } = await base44.integrations.Core.GenerateSpeech({
        text: script.slice(0, 200),
        voice: voice.id,
        language_code: "en",
      });
      new Audio(url).play();
    } catch {}
    setPreviewLoading(null);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const videoDuration = photoCount ? `${photoCount * 3} seconds (${photoCount} clips)` : "unknown duration";
    const prompt = `You are a South African real estate copywriter. Write a professional voiceover script for a property listing video.

Property details:
- Title: ${heading || projectName || "Property listing"}
- Subtitle: ${subheading || ""}
- Video duration: ${videoDuration}
- Bedrooms: ${details.bedrooms || "not specified"}
- Bathrooms: ${details.bathrooms || "not specified"}
- Asking price: ${details.price || "not specified"}
- Key features: ${details.features || "not specified"}
- Neighbourhood/area: ${details.neighbourhood || "not specified"}
- Tone: ${details.tone}

Requirements:
- Script must fit within ${videoDuration} when read aloud at a natural pace (~2.5 words per second)
- Write in South African English (use "metres", "rand", local phrasing)
- Start with a compelling hook, highlight key features, end with a call to action
- Do NOT include stage directions, just the spoken words
- Return ONLY the script text, nothing else`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      setScript(result.trim());
      setShowAiPanel(false);
    } catch {}
    setGenerating(false);
  };

  return (
    <div className="space-y-4">
      {/* Script */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-[#0F082B]">Voiceover Script</label>
          <button
            onClick={() => setShowAiPanel((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-[#21ABB5] hover:text-[#1a9da6] transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate with AI
            {showAiPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* AI Panel */}
        {showAiPanel && (
          <div className="bg-[#DEF5F7]/30 border border-[#21ABB5]/20 rounded-xl p-4 mb-3 space-y-3">
            <p className="text-xs font-semibold text-[#0F082B]">Tell us more about the property</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#606060] mb-1 block">Bedrooms</label>
                <input
                  value={details.bedrooms}
                  onChange={(e) => setDetails((d) => ({ ...d, bedrooms: e.target.value }))}
                  placeholder="e.g. 4"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#606060] mb-1 block">Bathrooms</label>
                <input
                  value={details.bathrooms}
                  onChange={(e) => setDetails((d) => ({ ...d, bathrooms: e.target.value }))}
                  placeholder="e.g. 2"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#606060] mb-1 block">Asking Price</label>
              <input
                value={details.price}
                onChange={(e) => setDetails((d) => ({ ...d, price: e.target.value }))}
                placeholder="e.g. R3.2 million"
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#606060] mb-1 block">Neighbourhood / Area</label>
              <input
                value={details.neighbourhood}
                onChange={(e) => setDetails((d) => ({ ...d, neighbourhood: e.target.value }))}
                placeholder="e.g. Constantia, Cape Town"
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#606060] mb-1 block">Key Features (comma-separated)</label>
              <input
                value={details.features}
                onChange={(e) => setDetails((d) => ({ ...d, features: e.target.value }))}
                placeholder="e.g. pool, double garage, mountain views, solar"
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#606060] mb-1 block">Tone</label>
              <select
                value={details.tone}
                onChange={(e) => setDetails((d) => ({ ...d, tone: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5] bg-white"
              >
                <option value="professional">Professional</option>
                <option value="luxury">Luxury / Upmarket</option>
                <option value="friendly">Friendly & Approachable</option>
                <option value="energetic">Energetic & Exciting</option>
              </select>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold rounded-lg h-9 gap-2 text-xs"
            >
              {generating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating script...</> : <><Sparkles className="w-3.5 h-3.5" /> Generate Script</>}
            </Button>
          </div>
        )}

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
                      {previewLoading === voice.id
                        ? <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />
                        : <Play className="w-3 h-3 text-gray-500 group-hover:text-white fill-current ml-0.5" />}
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