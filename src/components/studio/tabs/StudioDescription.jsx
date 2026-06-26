import React, { useState } from "react";
import { Sparkles, Loader2, Copy, Check, RefreshCw, MapPin, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const TONES = [
  { key: "professional", label: "👔 Professional",        desc: "Clear, factual and authoritative." },
  { key: "exciting",     label: "🔥 Exciting & Urgent",   desc: "High energy, FOMO-driven." },
  { key: "luxury",       label: "✨ Luxury & Aspirational",desc: "Evocative, lifestyle-focused." },
  { key: "friendly",     label: "😊 Friendly & Approachable", desc: "Warm and conversational." },
];

const FEATURES = [
  "Swimming Pool", "Double Garage", "Solar Panels", "Generator", "Fibre Internet",
  "Air Conditioning", "Underfloor Heating", "Security Estate", "Mountain Views", "Sea Views",
  "Garden", "Staff Quarters", "Study", "Scullery", "Braai Area", "Entertainment Area",
  "Pet Friendly", "Borehole", "Water Tanks", "EV Charging",
];

function formatRand(val) {
  if (!val) return "";
  return Number(val).toLocaleString("en-ZA");
}

export default function StudioDescription({ project, listing }) {
  const { toast } = useToast();

  // Property fields (pre-filled from listing if available)
  const [streetAddress, setStreetAddress] = useState(listing?.street_address || "");
  const [suburb, setSuburb] = useState(listing?.suburb || "");
  const [city, setCity] = useState(listing?.city || "");
  const [province, setProvince] = useState(listing?.province || "");
  const [propertyType, setPropertyType] = useState(listing?.property_type || "House");
  const [bedrooms, setBedrooms] = useState(listing?.bedrooms?.toString() || "");
  const [bathrooms, setBathrooms] = useState(listing?.bathrooms?.toString() || "");
  const [garages, setGarages] = useState(listing?.garages?.toString() || "");
  const [price, setPrice] = useState(listing?.price?.toString() || "");
  const [erfSize, setErfSize] = useState(listing?.erf_size?.toString() || "");
  const [floorSize, setFloorSize] = useState(listing?.floor_size?.toString() || "");
  const [features, setFeatures] = useState(listing?.features || []);

  // Address verification
  const [verifying, setVerifying] = useState(false);
  const [addressVerified, setAddressVerified] = useState(listing?.address_verified || false);
  const [addressError, setAddressError] = useState("");

  // AI generation
  const [tone, setTone] = useState("professional");
  const [aiPrompt, setAiPrompt] = useState("");
  const [description, setDescription] = useState(listing?.description || "");
  const [generating, setGenerating] = useState(false);
  const [amenities, setAmenities] = useState([]);
  const [loadingAmenities, setLoadingAmenities] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullAddress = [streetAddress, suburb, city, province].filter(Boolean).join(", ");

  const verifyAddress = async () => {
    if (!streetAddress || !suburb) return;
    setVerifying(true);
    setAddressError("");
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Verify if this South African property address is valid: "${fullAddress}". Return JSON: { valid: boolean, suburb: string, city: string, province: string, note: string }`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            valid: { type: "boolean" },
            suburb: { type: "string" },
            city: { type: "string" },
            province: { type: "string" },
            note: { type: "string" },
          },
        },
      });
      if (result.valid) {
        setAddressVerified(true);
        if (result.suburb) setSuburb(result.suburb);
        if (result.city) setCity(result.city);
        if (result.province) setProvince(result.province);
        toast({ title: "✓ Address verified" });
      } else {
        setAddressError(result.note || "Address could not be verified.");
      }
    } catch {
      setAddressError("Verification failed. Please check manually.");
    }
    setVerifying(false);
  };

  const fetchAmenities = async () => {
    if (!suburb) return;
    setLoadingAmenities(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `For the suburb "${suburb}${city ? `, ${city}` : ""}, South Africa", list key nearby amenities for property buyers. Return JSON: { amenities: [{ type: string, name: string, distance_km: number }] }. Max 8 items.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            amenities: {
              type: "array",
              items: { type: "object", properties: { type: { type: "string" }, name: { type: "string" }, distance_km: { type: "number" } } },
            },
          },
        },
      });
      setAmenities(result.amenities || []);
    } catch {}
    setLoadingAmenities(false);
  };

  const generate = async () => {
    setGenerating(true);
    const toneLabel = TONES.find(t => t.key === tone)?.label?.replace(/^[^\s]+ /, "") || "Professional";
    const amenityText = amenities.map(a => `${a.name} (${a.type}) — ${a.distance_km}km away`).join(", ");
    const prompt = `You are a South African real estate copywriter. Write a compelling ${toneLabel}-tone property listing description.

Property: ${propertyType} | Beds: ${bedrooms || "N/A"} | Baths: ${bathrooms || "N/A"} | Garages: ${garages || "N/A"} | Price: R${formatRand(price) || "POA"} | Erf: ${erfSize ? erfSize + "m²" : "N/A"} | Floor: ${floorSize ? floorSize + "m²" : "N/A"}
Features: ${features.join(", ") || "N/A"}
Nearby (reference distances naturally, do NOT mention the street address): ${amenityText || "N/A"}
${aiPrompt ? `Agent instructions: ${aiPrompt}` : ""}

RULES:
- ${toneLabel} tone throughout
- DO NOT mention the street address
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

  const toggleFeature = (f) =>
    setFeatures(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  return (
    <div className="space-y-6">

      {/* ── Property Details Card ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-0.5">Property Details</h2>
          <p className="text-sm text-gray-500">Enter the listing information. The address is used for AI research only — it won't appear in the description.</p>
        </div>

        {/* Address */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">📍 Property Address</h3>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Street Address *</label>
            <div className="flex gap-2">
              <Input
                value={streetAddress}
                onChange={e => { setStreetAddress(e.target.value); setAddressVerified(false); }}
                placeholder="e.g. 12 Clifton Road"
                className="rounded-xl flex-1"
              />
              <Button
                onClick={verifyAddress}
                disabled={verifying || !streetAddress || !suburb}
                variant="outline"
                className={`rounded-xl gap-1.5 text-xs shrink-0 ${addressVerified ? "border-emerald-400 text-emerald-600" : ""}`}
              >
                {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : addressVerified ? <CheckCircle2 className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                {verifying ? "Verifying..." : addressVerified ? "Verified" : "Verify"}
              </Button>
            </div>
            {addressError && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{addressError}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Suburb *</label>
              <Input value={suburb} onChange={e => { setSuburb(e.target.value); setAddressVerified(false); }} placeholder="e.g. Constantia" className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">City</label>
              <Input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Cape Town" className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Province</label>
              <select value={province} onChange={e => setProvince(e.target.value)} className="w-full border border-input rounded-xl px-3 h-9 text-sm outline-none focus:ring-1 focus:ring-purple-700 bg-white">
                <option value="">Select province...</option>
                {["Western Cape","Gauteng","KwaZulu-Natal","Eastern Cape","Limpopo","Mpumalanga","North West","Free State","Northern Cape"].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Property Type</label>
              <select value={propertyType} onChange={e => setPropertyType(e.target.value)} className="w-full border border-input rounded-xl px-3 h-9 text-sm outline-none focus:ring-1 focus:ring-purple-700 bg-white">
                {["House","Apartment","Townhouse","Plot","Farm","Commercial","Other"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Property Specs */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">🏠 Property Specs</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Bedrooms",       value: bedrooms,   set: setBedrooms,   placeholder: "3" },
              { label: "Bathrooms",      value: bathrooms,  set: setBathrooms,  placeholder: "2" },
              { label: "Garages",        value: garages,    set: setGarages,    placeholder: "2" },
              { label: "Erf Size (m²)",  value: erfSize,    set: setErfSize,    placeholder: "600" },
              { label: "Floor Size (m²)",value: floorSize,  set: setFloorSize,  placeholder: "280" },
            ].map(f => (
              <div key={f.label}>
                <label className="text-xs font-medium text-gray-500 mb-1 block">{f.label}</label>
                <Input type="number" value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} className="rounded-xl" />
              </div>
            ))}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Asking Price (R)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">R</span>
                <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="3,500,000" className="rounded-xl pl-7" />
              </div>
              {price && <p className="text-[10px] text-purple-700 mt-0.5 font-medium">R {formatRand(price)}</p>}
            </div>
          </div>
        </div>

        {/* Key Features */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">✅ Key Features</h3>
          <div className="flex flex-wrap gap-2">
            {FEATURES.map(f => (
              <button
                key={f}
                onClick={() => toggleFeature(f)}
                className={`text-xs rounded-lg px-3 py-1.5 border-2 font-medium transition-all ${features.includes(f) ? "border-purple-700 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
              >
                {features.includes(f) ? "✓ " : ""}{f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Area Amenities ── */}
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

      {/* ── Tone ── */}
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

      {/* ── Additional instructions ── */}
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

      {/* ── Result ── */}
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