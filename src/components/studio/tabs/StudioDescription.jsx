import React, { useState } from "react";
import { Sparkles, Loader2, Copy, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const TONES = [
  { key: "professional", label: "👔 Professional", desc: "Clear, factual and authoritative." },
  { key: "exciting",     label: "🔥 Exciting & Urgent", desc: "High energy, FOMO-driven." },
  { key: "luxury",       label: "✨ Luxury & Aspirational", desc: "Evocative, lifestyle-focused." },
  { key: "friendly",     label: "😊 Friendly & Approachable", desc: "Warm and conversational." },
];

export default function StudioDescription({ project, listing }) {
  const { toast } = useToast();
  const [tone, setTone] = useState("professional");
  const [aiPrompt, setAiPrompt] = useState("");
  const [description, setDescription] = useState(listing?.description || "");
  const [generating, setGenerating] = useState(false);
  const [amenities, setAmenities] = useState([]);
  const [loadingAmenities, setLoadingAmenities] = useState(false);
  const [copied, setCopied] = useState(false);

  const suburb = listing?.suburb || "";
  const city = listing?.city || "";

  const fetchAmenities = async () => {
    if (!suburb) return;
    setLoadingAmenities(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `For the suburb "${suburb}${city ? `, ${city}` : ""}, South Africa", list the key nearby amenities that matter to property buyers. Include schools, shopping centres, hospitals, transport. Return JSON with: { amenities: [{ type: string, name: string, distance_km: number }] }. Max 8 items.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            amenities: {
              type: "array",
              items: { type: "object", properties: { type: { type: "string" }, name: { type: "string" }, distance_km: { type: "number" } } }
            }
          }
        }
      });
      setAmenities(result.amenities || []);
    } catch {}
    setLoadingAmenities(false);
  };

  const generate = async () => {
    setGenerating(true);
    const toneLabel = TONES.find(t => t.key === tone)?.label?.replace(/^[^\s]+ /, "") || "Professional";
    const amenityText = amenities.map(a => `${a.name} (${a.type}) — ${a.distance_km}km away`).join(", ");
    const propType = listing?.property_type || "Property";
    const beds = listing?.bedrooms || "N/A";
    const baths = listing?.bathrooms || "N/A";
    const garages = listing?.garages || "N/A";
    const price = listing?.price ? `R ${Number(listing.price).toLocaleString("en-ZA")}` : "POA";
    const erf = listing?.erf_size ? `${listing.erf_size}m²` : "N/A";
    const floor = listing?.floor_size ? `${listing.floor_size}m²` : "N/A";
    const feats = listing?.features?.join(", ") || "N/A";

    const prompt = `You are a South African real estate copywriter. Write a compelling ${toneLabel}-tone property listing description.

Property: ${propType} | Beds: ${beds} | Baths: ${baths} | Garages: ${garages} | Price: ${price} | Erf: ${erf} | Floor: ${floor}
Features: ${feats}
Nearby (DO NOT mention the address, only distances): ${amenityText || "N/A"}
${aiPrompt ? `Agent instructions: ${aiPrompt}` : ""}

RULES:
- ${toneLabel} tone throughout
- DO NOT mention street address
- Reference amenity distances naturally (e.g. "minutes from Sandton City")
- South African English (metres, rand, braai, etc.)
- 3-4 compelling paragraphs
- End with a clear call to action
- Return ONLY the description text`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      setDescription(typeof result === "string" ? result.trim() : "");
    } catch {
      toast({ title: "Generation failed", variant: "destructive" });
    }
    setGenerating(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(description);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!" });
  };

  return (
    <div className="space-y-6">
      {/* Amenities fetch */}
      {suburb && (
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-purple-900">📍 Area Amenities Research</p>
            <Button size="sm" variant="outline" onClick={fetchAmenities} disabled={loadingAmenities} className="text-xs rounded-xl gap-1.5">
              {loadingAmenities ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {loadingAmenities ? "Researching..." : amenities.length ? "Refresh" : "Fetch Amenities"}
            </Button>
          </div>
          {amenities.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {amenities.map((a, i) => (
                <span key={i} className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">
                  {a.name} · {a.distance_km}km
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-purple-600">Click "Fetch Amenities" to research nearby schools, shops, hospitals and more for {suburb}.</p>
          )}
        </div>
      )}

      {/* Tone selection */}
      <div>
        <label className="text-sm font-semibold text-gray-900 block mb-3">Description Tone</label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TONES.map(t => (
            <button
              key={t.key}
              onClick={() => setTone(t.key)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${tone === t.key ? "border-purple-700 bg-purple-50" : "border-gray-200 hover:border-gray-300 bg-white"}`}
            >
              <p className="text-sm font-semibold text-gray-900 mb-0.5">{t.label}</p>
              <p className="text-xs text-gray-500">{t.desc}</p>
              {tone === t.key && <Check className="w-4 h-4 text-purple-700 mt-1" />}
            </button>
          ))}
        </div>
      </div>

      {/* AI instructions */}
      <div>
        <label className="text-sm font-semibold text-gray-900 block mb-2">Additional AI Instructions (optional)</label>
        <textarea
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          placeholder="e.g. Emphasise the mountain views, highlight the recent kitchen renovation, mention the top school catchment..."
          rows={3}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-700/30 resize-none bg-white"
        />
      </div>

      <Button onClick={generate} disabled={generating} className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl gap-2 h-11">
        {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating description...</> : <><Sparkles className="w-4 h-4" /> Generate Description</>}
      </Button>

      {/* Editable result */}
      {description && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-900">Generated Description</label>
            <button onClick={copy} className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={12}
            className="w-full border border-purple-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-700/30 resize-none leading-relaxed bg-white"
          />
          <p className="text-xs text-gray-400">{description.length} characters · Edit directly above</p>
        </div>
      )}
    </div>
  );
}