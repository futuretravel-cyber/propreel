import React, { useState, useEffect } from "react";
import { Mic, Play, Check, Sparkles, ChevronDown, ChevronUp, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

// ElevenLabs voice IDs — curated for SA English use
const ELEVENLABS_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",  accent: "American English", gender: "Female", desc: "Clear, professional — excellent for property listings" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi",    accent: "American English", gender: "Female", desc: "Strong, confident — luxury properties" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",   accent: "American English", gender: "Female", desc: "Soft, warm — residential family homes" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni",  accent: "American English", gender: "Male",   desc: "Well-rounded — any property type" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold",  accent: "American English", gender: "Male",   desc: "Deep, authoritative — high-end estates" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",    accent: "American English", gender: "Male",   desc: "Neutral, professional — commercial properties" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam",     accent: "American English", gender: "Male",   desc: "Raspy, energetic — lifestyle & off-plan" },
];

async function generateWithElevenLabs(apiKey, voiceId, text) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`);
  const blob = await response.blob();
  return blob;
}

export default function ElevenLabsVoiceover({ script, setScript, selectedVoice, setSelectedVoice, projectName, heading, subheading, photoCount, onVoiceoverReady }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("elevenlabs_api_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(!localStorage.getItem("elevenlabs_api_key"));
  const [previewLoading, setPreviewLoading] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genScript, setGenScript] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [details, setDetails] = useState({ bedrooms: "", bathrooms: "", price: "", features: "", neighbourhood: "", tone: "professional" });

  const saveApiKey = () => {
    localStorage.setItem("elevenlabs_api_key", apiKey);
    setShowKeyInput(false);
  };

  const handlePreview = async (voice) => {
    if (!script.trim() || !apiKey) return;
    setPreviewLoading(voice.id);
    try {
      const blob = await generateWithElevenLabs(apiKey, voice.id, script.slice(0, 300));
      const url = URL.createObjectURL(blob);
      new Audio(url).play();
    } catch {
      alert("Preview failed — check your ElevenLabs API key");
    }
    setPreviewLoading(null);
  };

  const handleGenerateVoiceover = async () => {
    if (!script.trim() || !apiKey || !selectedVoice) return;
    setGenerating(true);
    try {
      const blob = await generateWithElevenLabs(apiKey, selectedVoice, script);
      // Upload to Base44 storage
      const file = new File([blob], "voiceover.mp3", { type: "audio/mpeg" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onVoiceoverReady(file_url);
    } catch (e) {
      alert("Generation failed: " + e.message);
    }
    setGenerating(false);
  };

  const handleGenerateScript = async () => {
    setGenScript(true);
    const videoDuration = photoCount ? `${photoCount * 4} seconds` : "60 seconds";
    const prompt = `You are a South African real estate copywriter. Write a professional voiceover script for a property listing video.

Property: ${heading || projectName || "Property listing"}
Area: ${details.neighbourhood || "South Africa"}
Bedrooms: ${details.bedrooms || "not specified"}
Bathrooms: ${details.bathrooms || "not specified"}
Price: ${details.price || "not specified"}
Features: ${details.features || "not specified"}
Tone: ${details.tone}
Duration: ${videoDuration} (approximately ${Math.ceil(parseInt(videoDuration) * 2.5)} words max)

Write ONLY the spoken script. No directions, no brackets. Use South African English. End with a clear call to action.`;
    try {
      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      setScript(result.trim());
      setShowAiPanel(false);
    } catch {}
    setGenScript(false);
  };

  return (
    <div className="space-y-4">
      {/* API Key section */}
      <div className="bg-gradient-to-br from-[#DEF5F7]/40 to-white border border-[#21ABB5]/20 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#21ABB5] rounded-md flex items-center justify-center">
              <Mic className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-semibold text-[#0F082B]">ElevenLabs Voice AI</span>
          </div>
          {!showKeyInput && apiKey && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">✓ Connected</span>
          )}
        </div>

        {showKeyInput ? (
          <div className="space-y-2">
            <p className="text-[10px] text-[#606060]">Enter your ElevenLabs API key for ultra-realistic SA English voices.</p>
            <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" className="text-[10px] text-[#21ABB5] flex items-center gap-1 hover:underline">
              Get free API key at elevenlabs.io <ExternalLink className="w-3 h-3" />
            </a>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk_..."
                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]"
              />
              <Button size="sm" onClick={saveApiKey} disabled={!apiKey} className="bg-[#21ABB5] text-white rounded-lg text-xs px-3">Save</Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowKeyInput(true)} className="text-[10px] text-[#606060] hover:text-[#21ABB5] underline">
            Change API key
          </button>
        )}
      </div>

      {/* Script */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-[#0F082B]">Voiceover Script</label>
          <button onClick={() => setShowAiPanel(v => !v)} className="flex items-center gap-1 text-xs font-medium text-[#21ABB5]">
            <Sparkles className="w-3.5 h-3.5" /> AI Write
            {showAiPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {showAiPanel && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#606060] mb-1 block">Bedrooms</label>
                <input value={details.bedrooms} onChange={e => setDetails(d => ({ ...d, bedrooms: e.target.value }))} placeholder="e.g. 4" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]" />
              </div>
              <div>
                <label className="text-[10px] text-[#606060] mb-1 block">Bathrooms</label>
                <input value={details.bathrooms} onChange={e => setDetails(d => ({ ...d, bathrooms: e.target.value }))} placeholder="e.g. 2" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]" />
              </div>
            </div>
            <input value={details.price} onChange={e => setDetails(d => ({ ...d, price: e.target.value }))} placeholder="Asking price e.g. R4.5 million" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]" />
            <input value={details.neighbourhood} onChange={e => setDetails(d => ({ ...d, neighbourhood: e.target.value }))} placeholder="Area e.g. Constantia, Cape Town" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]" />
            <input value={details.features} onChange={e => setDetails(d => ({ ...d, features: e.target.value }))} placeholder="Key features e.g. pool, solar, mountain views" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5]" />
            <select value={details.tone} onChange={e => setDetails(d => ({ ...d, tone: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#21ABB5] bg-white">
              <option value="professional">Professional</option>
              <option value="luxury">Luxury / Upmarket</option>
              <option value="friendly">Friendly & Approachable</option>
              <option value="energetic">Energetic & Exciting</option>
            </select>
            <Button onClick={handleGenerateScript} disabled={genScript} className="w-full bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-lg h-8 gap-2 text-xs">
              {genScript ? <><Loader2 className="w-3 h-3 animate-spin" /> Writing...</> : <><Sparkles className="w-3 h-3" /> Generate Script</>}
            </Button>
          </div>
        )}

        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          placeholder="Write your voiceover script here, or use AI to generate one..."
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-[#21ABB5] placeholder:text-gray-400"
        />
        <p className="text-[10px] text-[#606060] mt-1">{script.length} chars · ~{Math.ceil(script.split(" ").length / 2.5)}s audio</p>
      </div>

      {/* Voice selection */}
      <div>
        <label className="text-xs font-semibold text-[#0F082B] mb-2 block">Select Voice</label>
        <div className="space-y-1.5">
          {ELEVENLABS_VOICES.map(voice => {
            const isSelected = selectedVoice === voice.id;
            return (
              <button
                key={voice.id}
                onClick={() => setSelectedVoice(voice.id)}
                className={`w-full flex items-center gap-3 rounded-xl p-2.5 border-2 text-left transition-all ${isSelected ? "border-[#21ABB5] bg-[#DEF5F7]/30" : "border-gray-100 bg-gray-50 hover:border-gray-300"}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-[#21ABB5]" : "bg-gray-200"}`}>
                  <Mic className={`w-3 h-3 ${isSelected ? "text-white" : "text-gray-500"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${isSelected ? "text-[#21ABB5]" : "text-[#0F082B]"}`}>
                    {voice.name} <span className="font-normal text-[#606060]">· {voice.gender}</span>
                  </p>
                  <p className="text-[10px] text-[#606060] truncate">{voice.desc}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {script.trim() && apiKey && (
                    <button
                      onClick={e => { e.stopPropagation(); handlePreview(voice); }}
                      disabled={previewLoading === voice.id}
                      className="w-6 h-6 rounded-full bg-gray-200 hover:bg-[#21ABB5] flex items-center justify-center transition-colors group"
                    >
                      {previewLoading === voice.id
                        ? <Loader2 className="w-2.5 h-2.5 text-gray-500 animate-spin" />
                        : <Play className="w-2.5 h-2.5 text-gray-500 group-hover:text-white fill-current ml-0.5" />}
                    </button>
                  )}
                  {isSelected && <Check className="w-4 h-4 text-[#21ABB5]" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate button */}
      <Button
        onClick={handleGenerateVoiceover}
        disabled={generating || !script.trim() || !apiKey || !selectedVoice}
        className="w-full bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-xl gap-2 text-sm"
      >
        {generating
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating with ElevenLabs...</>
          : <><Mic className="w-4 h-4" /> Generate Voiceover (ElevenLabs)</>}
      </Button>

      {!apiKey && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-800">Add your ElevenLabs API key above to enable realistic voice generation. Free plan includes 10,000 characters/month.</p>
        </div>
      )}
    </div>
  );
}