import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Check, Upload, X, Wand2, Sparkles, Loader2, MapPin, CheckCircle2, AlertCircle, Copy, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import BulkPhotoEditor from "@/components/listings/BulkPhotoEditor";

const TONES = [
  { key: "professional", label: "Professional", emoji: "👔", desc: "Clear, factual and authoritative. Ideal for corporate buyers." },
  { key: "exciting", label: "Exciting & Urgent", emoji: "🔥", desc: "High energy, FOMO-driven. Great for competitive markets." },
  { key: "luxury", label: "Luxury & Aspirational", emoji: "✨", desc: "Evocative, lifestyle-focused. Perfect for upmarket properties." },
  { key: "friendly", label: "Friendly & Approachable", emoji: "😊", desc: "Warm and conversational. Great for family homes." },
];

const FEATURES = [
  "Swimming Pool", "Double Garage", "Solar Panels", "Generator", "Fibre Internet",
  "Air Conditioning", "Underfloor Heating", "Security Estate", "Mountain Views", "Sea Views",
  "Garden", "Staff Quarters", "Study", "Scullery", "Braai Area", "Entertainment Area",
  "Pet Friendly", "Borehole", "Water Tanks", "EV Charging"
];

function formatRand(val) {
  if (!val) return "";
  return Number(val).toLocaleString("en-ZA");
}

const STEPS = ["Property Details", "Photos", "Description", "Export"];

export default function NewListing() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listingId, setListingId] = useState(null);

  // Step 0 — Property Details
  const [streetAddress, setStreetAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [propertyType, setPropertyType] = useState("House");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [garages, setGarages] = useState("");
  const [price, setPrice] = useState("");
  const [erfSize, setErfSize] = useState("");
  const [floorSize, setFloorSize] = useState("");
  const [features, setFeatures] = useState([]);
  const [verifying, setVerifying] = useState(false);
  const [addressVerified, setAddressVerified] = useState(false);
  const [addressError, setAddressError] = useState("");

  // Step 1 — Photos
  const [photos, setPhotos] = useState([]);
  const [showBulkEditor, setShowBulkEditor] = useState(false);
  const [bulkEditMode, setBulkEditMode] = useState("edits"); // "edits" | "staging"

  // Step 2 — Description
  const [tone, setTone] = useState("professional");
  const [aiPrompt, setAiPrompt] = useState("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [amenities, setAmenities] = useState([]);
  const [loadingAmenities, setLoadingAmenities] = useState(false);

  // Step 3 — Export
  const [exportP24, setExportP24] = useState(false);
  const [exportPP, setExportPP] = useState(false);
  const [saving, setSaving] = useState(false);

  const fullAddress = [streetAddress, suburb, city, province].filter(Boolean).join(", ");

  const verifyAddress = async () => {
    if (!streetAddress || !suburb) return;
    setVerifying(true);
    setAddressError("");
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Verify if this South African property address is valid and complete: "${fullAddress}". 
Return JSON with: { valid: boolean, formatted_address: string, suburb: string, city: string, province: string, note: string }`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            valid: { type: "boolean" },
            formatted_address: { type: "string" },
            suburb: { type: "string" },
            city: { type: "string" },
            province: { type: "string" },
            note: { type: "string" }
          }
        }
      });
      if (result.valid) {
        setAddressVerified(true);
        if (result.suburb) setSuburb(result.suburb);
        if (result.city) setCity(result.city);
        if (result.province) setProvince(result.province);
        toast({ title: "✓ Address verified", description: result.formatted_address });
      } else {
        setAddressError(result.note || "Address could not be verified. Please check and try again.");
      }
    } catch {
      setAddressError("Verification failed. Please check the address manually.");
    }
    setVerifying(false);
  };

  const fetchAmenities = async () => {
    if (!suburb || !city) return;
    setLoadingAmenities(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `For the suburb "${suburb}, ${city}, South Africa", list the key nearby amenities that matter to property buyers. Include schools, shopping centres, hospitals, transport links, and entertainment. Return JSON with: { amenities: [{ type: string, name: string, distance_km: number }] }. Max 8 items.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            amenities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  name: { type: "string" },
                  distance_km: { type: "number" }
                }
              }
            }
          }
        }
      });
      setAmenities(result.amenities || []);
    } catch {}
    setLoadingAmenities(false);
  };

  const generateDescription = async () => {
    setGenerating(true);
    const toneLabel = TONES.find(t => t.key === tone)?.label || "Professional";
    const amenityText = amenities.map(a => `${a.name} (${a.type}) — ${a.distance_km}km away`).join(", ");
    const prompt = `You are a South African real estate copywriter. Write a compelling property listing description.

Property details:
- Type: ${propertyType}
- Bedrooms: ${bedrooms || "N/A"}, Bathrooms: ${bathrooms || "N/A"}, Garages: ${garages || "N/A"}
- Price: R${formatRand(price)}
- Erf: ${erfSize || "N/A"}m², Floor: ${floorSize || "N/A"}m²
- Key features: ${features.join(", ") || "N/A"}
- Tone: ${toneLabel}
- Area amenities (DO NOT mention the address or street name, only reference distances to amenities): ${amenityText || "N/A"}
${aiPrompt ? `\nExtra instructions from agent: ${aiPrompt}` : ""}

IMPORTANT RULES:
- Write in ${toneLabel} tone
- DO NOT mention the street address or property name
- DO NOT say "located in [suburb]" — only reference how far amenities are (e.g. "minutes from Sandton City")
- Use South African English (metres, rand, braai, etc.)
- Write 3-4 compelling paragraphs
- End with a clear call to action
- Return ONLY the description text, no headings or labels`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      setDescription(result.trim());
    } catch {
      toast({ title: "Generation failed", variant: "destructive" });
    }
    setGenerating(false);
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    setLoading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const res = await base44.integrations.Core.UploadFile({ file });
        uploaded.push(res.file_url);
      }
      setPhotos(prev => [...prev, ...uploaded]);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setLoading(false);
  };

  const handlePhotoReplaced = (idx, newUrl) => {
    setPhotos(prev => { const next = [...prev]; next[idx] = newUrl; return next; });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!" });
  };

  const exportForPortal = (portal) => {
    const portalName = portal === "p24" ? "Property24" : "Private Property";
    const content = `${portalName.toUpperCase()} LISTING EXPORT
${"=".repeat(50)}

PROPERTY TYPE: ${propertyType}
BEDROOMS: ${bedrooms}
BATHROOMS: ${bathrooms}
GARAGES: ${garages}
PRICE: R ${formatRand(price)}
ERF SIZE: ${erfSize}m²
FLOOR SIZE: ${floorSize}m²
SUBURB: ${suburb}
CITY: ${city}
PROVINCE: ${province}

KEY FEATURES:
${features.map(f => `• ${f}`).join("\n")}

LISTING DESCRIPTION:
${description}

---
Exported from AutoReel Studio for ${portalName}
`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `listing-${suburb.replace(/\s/g, "-")}-${portal}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `✓ Exported for ${portalName}!` });
  };

  const saveListing = async () => {
    setSaving(true);
    try {
      const data = {
        street_address: streetAddress,
        suburb, city, province,
        full_address: fullAddress,
        address_verified: addressVerified,
        property_type: propertyType,
        bedrooms: Number(bedrooms) || 0,
        bathrooms: Number(bathrooms) || 0,
        garages: Number(garages) || 0,
        price: Number(price) || 0,
        erf_size: Number(erfSize) || 0,
        floor_size: Number(floorSize) || 0,
        features,
        description_tone: tone,
        description,
        ai_prompt: aiPrompt,
        photos,
        status: "active",
        portal_export_p24: exportP24,
        portal_export_pp: exportPP,
      };
      if (listingId) {
        await base44.entities.Listing.update(listingId, data);
      } else {
        const l = await base44.entities.Listing.create(data);
        setListingId(l.id);
      }
      toast({ title: "✓ Listing saved!" });
      navigate("/listings");
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center gap-1 flex-wrap">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${i <= step ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-400"}`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`hidden sm:block text-xs font-medium mr-1 ${i <= step ? "text-[#0F082B]" : "text-gray-400"}`}>{label}</span>
              {i < STEPS.length - 1 && <div className={`hidden sm:block w-6 h-0.5 ${i < step ? "bg-purple-700" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* ── STEP 0: Property Details ── */}
      {step === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-[#0F082B] mb-1">Property Details</h2>
          <p className="text-sm text-[#606060] mb-6">Enter the listing information. The address is used for AI research only — it won't appear in the description.</p>

          {/* Address */}
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-semibold text-[#0F082B]">📍 Property Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-[#606060] mb-1 block">Street Address *</label>
                <div className="flex gap-2">
                  <Input value={streetAddress} onChange={e => { setStreetAddress(e.target.value); setAddressVerified(false); }} placeholder="e.g. 12 Clifton Road" className="rounded-xl flex-1" />
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
              <div>
                <label className="text-xs font-medium text-[#606060] mb-1 block">Suburb *</label>
                <Input value={suburb} onChange={e => { setSuburb(e.target.value); setAddressVerified(false); }} placeholder="e.g. Constantia" className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#606060] mb-1 block">City</label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Cape Town" className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#606060] mb-1 block">Province</label>
                <select value={province} onChange={e => setProvince(e.target.value)} className="w-full border border-input rounded-xl px-3 h-9 text-sm outline-none focus:ring-1 focus:ring-purple-700 bg-white">
                  <option value="">Select province...</option>
                  {["Western Cape","Gauteng","KwaZulu-Natal","Eastern Cape","Limpopo","Mpumalanga","North West","Free State","Northern Cape"].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#606060] mb-1 block">Property Type</label>
                <select value={propertyType} onChange={e => setPropertyType(e.target.value)} className="w-full border border-input rounded-xl px-3 h-9 text-sm outline-none focus:ring-1 focus:ring-purple-700 bg-white">
                  {["House","Apartment","Townhouse","Plot","Farm","Commercial","Other"].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Property specs */}
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-semibold text-[#0F082B]">🏠 Property Specs</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Bedrooms", value: bedrooms, set: setBedrooms, placeholder: "3" },
                { label: "Bathrooms", value: bathrooms, set: setBathrooms, placeholder: "2" },
                { label: "Garages", value: garages, set: setGarages, placeholder: "2" },
                { label: "Erf Size (m²)", value: erfSize, set: setErfSize, placeholder: "600" },
                { label: "Floor Size (m²)", value: floorSize, set: setFloorSize, placeholder: "280" },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-xs font-medium text-[#606060] mb-1 block">{f.label}</label>
                  <Input type="number" value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} className="rounded-xl" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-[#606060] mb-1 block">Asking Price (R)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#606060]">R</span>
                  <Input
                    type="number"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="3,500,000"
                    className="rounded-xl pl-7"
                  />
                </div>
                {price && <p className="text-[10px] text-purple-700 mt-0.5 font-medium">R {formatRand(price)}</p>}
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-[#0F082B] mb-3">✅ Key Features</h3>
            <div className="flex flex-wrap gap-2">
              {FEATURES.map(f => (
                <button
                  key={f}
                  onClick={() => setFeatures(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                  className={`text-xs rounded-lg px-3 py-1.5 border-2 font-medium transition-all ${features.includes(f) ? "border-purple-700 bg-purple-50 text-purple-700" : "border-gray-200 text-[#606060] hover:border-gray-300"}`}
                >
                  {features.includes(f) ? "✓ " : ""}{f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} disabled={!streetAddress || !suburb} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-6 gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 1: Photos ── */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-[#0F082B] mb-1">Listing Photos</h2>
          <p className="text-sm text-[#606060] mb-6">Upload all photos. You can bulk-edit them with AI before generating your listing.</p>

          <label className="block border-2 border-dashed border-purple-200 rounded-2xl p-8 text-center cursor-pointer hover:bg-purple-50 transition-colors mb-4">
            <Upload className="w-8 h-8 text-purple-700 mx-auto mb-2" />
            <p className="text-sm font-medium text-[#0F082B] mb-1">Click to upload listing photos</p>
            <p className="text-xs text-[#606060]">JPG, PNG up to 25MB each</p>
            <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" />
          </label>

          {loading && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-[#606060]">
              <Loader2 className="w-4 h-4 animate-spin text-purple-700" /> Uploading photos...
            </div>
          )}

          {photos.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-[#0F082B]">{photos.length} photos uploaded</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { setBulkEditMode("edits"); setShowBulkEditor(true); }} variant="outline" className="rounded-xl gap-1.5 text-xs">
                    <Wand2 className="w-3.5 h-3.5" /> Bulk AI Edit
                  </Button>
                  <Button size="sm" onClick={() => { setBulkEditMode("staging"); setShowBulkEditor(true); }} variant="outline" className="rounded-xl gap-1.5 text-xs text-purple-600 border-purple-200 hover:bg-purple-50">
                    <Sparkles className="w-3.5 h-3.5" /> Virtual Staging
                  </Button>
                </div>
              </div>

              {showBulkEditor && (
                <BulkPhotoEditor
                  photos={photos}
                  onPhotoReplaced={handlePhotoReplaced}
                  initialMode={bulkEditMode}
                  onClose={() => setShowBulkEditor(false)}
                />
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 mt-4">
                {photos.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3 text-white" />
                    </button>
                    <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[9px] px-1 rounded">{i + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8">
            <Button variant="outline" onClick={() => setStep(0)} className="rounded-xl gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
            <Button onClick={() => { setStep(2); fetchAmenities(); }} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-6 gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Description ── */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-[#0F082B] mb-1">Generate Description</h2>
          <p className="text-sm text-[#606060] mb-6">Choose a tone, add any extra instructions, then generate your listing description with AI.</p>

          {/* Amenities reference */}
          {(loadingAmenities || amenities.length > 0) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5">
              <p className="text-xs font-semibold text-blue-800 mb-2">📍 Nearby Amenities (used for description — not shown in listing)</p>
              {loadingAmenities ? (
                <div className="flex items-center gap-2 text-xs text-blue-600"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Researching area amenities...</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {amenities.map((a, i) => (
                    <span key={i} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {a.name} · {a.distance_km}km
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tone selection */}
          <div className="mb-5">
            <label className="text-sm font-semibold text-[#0F082B] mb-3 block">Choose description tone</label>
            <div className="grid grid-cols-2 gap-3">
              {TONES.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTone(t.key)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${tone === t.key ? "border-purple-700 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <p className="text-sm font-semibold text-[#0F082B] mb-0.5">{t.emoji} {t.label}</p>
                  <p className="text-xs text-[#606060]">{t.desc}</p>
                  {tone === t.key && <Check className="w-4 h-4 text-purple-700 mt-1" />}
                </button>
              ))}
            </div>
          </div>

          {/* AI Prompt */}
          <div className="mb-5">
            <label className="text-sm font-semibold text-[#0F082B] mb-1 block">Additional AI instructions (optional)</label>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="e.g. Emphasise the mountain views, mention the excellent school catchment, highlight the recent kitchen renovation..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-700 resize-none"
            />
          </div>

          <Button onClick={generateDescription} disabled={generating} className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl gap-2 h-11 mb-5">
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating description...</> : <><Sparkles className="w-4 h-4" /> Generate Description</>}
          </Button>

          {/* Editable description */}
          {description && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-[#0F082B]">Generated Description</label>
                <button onClick={() => copyToClipboard(description)} className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
              </div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={10}
                className="w-full border border-purple-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-purple-700 resize-none leading-relaxed"
              />
              <p className="text-xs text-[#606060]">{description.length} characters · You can edit the description directly above</p>
            </div>
          )}

          <div className="flex justify-between mt-8">
            <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
            <Button onClick={() => setStep(3)} disabled={!description} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-6 gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Export ── */}
      {step === 3 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-[#0F082B] mb-1">Export Listing</h2>
          <p className="text-sm text-[#606060] mb-6">Export your listing description and photos for South African property portals.</p>

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-1.5">
            <h3 className="text-sm font-semibold text-[#0F082B] mb-2">Listing Summary</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <p><span className="text-[#606060]">Type:</span> <span className="font-medium">{propertyType}</span></p>
              <p><span className="text-[#606060]">Price:</span> <span className="font-medium text-purple-700">R {formatRand(price)}</span></p>
              <p><span className="text-[#606060]">Beds:</span> <span className="font-medium">{bedrooms}</span></p>
              <p><span className="text-[#606060]">Baths:</span> <span className="font-medium">{bathrooms}</span></p>
              <p><span className="text-[#606060]">Garages:</span> <span className="font-medium">{garages}</span></p>
              <p><span className="text-[#606060]">Erf:</span> <span className="font-medium">{erfSize ? `${Number(erfSize).toLocaleString()}m²` : "N/A"}</span></p>
              <p><span className="text-[#606060]">Suburb:</span> <span className="font-medium">{suburb}</span></p>
              <p><span className="text-[#606060]">Photos:</span> <span className="font-medium">{photos.length}</span></p>
            </div>
          </div>

          {/* Portal export options */}
          <div className="space-y-3 mb-6">
            <h3 className="text-sm font-semibold text-[#0F082B]">Export for Portal</h3>
            <p className="text-xs text-[#606060]">Download a formatted text file optimised for each portal's listing requirements.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: "p24", name: "Property24", color: "#e63946", desc: "SA's largest property portal. Formatted for their listing submission requirements." },
                { key: "pp", name: "Private Property", color: "#2563eb", desc: "Second-largest SA portal. Optimised description length and feature format." },
              ].map(portal => (
                <div key={portal.key} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: portal.color }} />
                    <span className="text-sm font-semibold text-[#0F082B]">{portal.name}</span>
                  </div>
                  <p className="text-xs text-[#606060] mb-3">{portal.desc}</p>
                  <Button
                    onClick={() => exportForPortal(portal.key)}
                    disabled={!description}
                    size="sm"
                    className="w-full rounded-lg gap-1.5 text-xs"
                    style={{ backgroundColor: portal.color }}
                  >
                    <Download className="w-3.5 h-3.5" /> Download for {portal.name}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Copy description */}
          {description && (
            <div className="border border-gray-200 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-[#0F082B]">📋 Listing Description</h3>
                <button onClick={() => copyToClipboard(description)} className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
                  <Copy className="w-3.5 h-3.5" /> Copy all
                </button>
              </div>
              <p className="text-xs text-[#606060] line-clamp-4 leading-relaxed">{description}</p>
            </div>
          )}

          <div className="flex justify-between mt-8">
            <Button variant="outline" onClick={() => setStep(2)} className="rounded-xl gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
            <Button onClick={saveListing} disabled={saving} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl px-6 gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Check className="w-4 h-4" /> Save Listing</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}