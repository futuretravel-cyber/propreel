import React, { useState, useMemo } from "react";
import { Clapperboard, Monitor, Smartphone, Zap, Sparkles, Film, Crown, Check, Loader2, AlertCircle, CheckCircle2, Mic, ImagePlus, ShieldCheck, Wand2, ChevronDown } from "lucide-react";
import { appParams } from "@/lib/app-params";

const RENDER_ENDPOINT = "https://vpyz75mmlg.execute-api.af-south-1.amazonaws.com/v1/api/render";

const TIERS = [
  { id: "essential", name: "Essential", icon: Zap, motion: "Zoom / Pan", res: "1080p", speed: "Instant", credits: "5–10", desc: "Fast local render" },
  { id: "social", name: "Social", icon: Sparkles, motion: "AI Motion", res: "720p", speed: "~15 min", credits: "30–70", desc: "Social-ready clips" },
  { id: "cinematic", name: "Cinematic", icon: Film, motion: "AI Motion", res: "720p", speed: "~15 min", credits: "40–90", desc: "Cinematic camera moves" },
  { id: "premium", name: "Premium", icon: Crown, motion: "AI Motion", res: "1080p", speed: "~30 min", credits: "60–150", desc: "Full HD, maximum quality" },
];

const VOICES = [
  { id: "Joanna", name: "Joanna", desc: "US Female" },
  { id: "Kendra", name: "Kendra", desc: "US Female" },
  { id: "Gregory", name: "Gregory", desc: "US Male" },
  { id: "Stephen", name: "Stephen", desc: "US Male" },
  { id: "Amy", name: "Amy", desc: "British Female" },
  { id: "Brian", name: "Brian", desc: "British Male" },
  { id: "Ayanda", name: "Ayanda", desc: "South African Female" },
];

const inputCls = "w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 outline-none transition-all";

export default function StudioPage() {
  const [recordId, setRecordId] = useState(`prop_${Date.now()}`);
  const [tier, setTier] = useState("social");
  const [orientation, setOrientation] = useState("landscape");
  const [imagesInput, setImagesInput] = useState("");
  const [voiceoverText, setVoiceoverText] = useState("Exclusive luxury property featuring modern architecture and premium finishes.");
  const [voiceId, setVoiceId] = useState("Joanna");
  const [includeBranding, setIncludeBranding] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'loading'|'success'|'error', message }

  const imagesArray = useMemo(
    () => imagesInput.split(/[\n,]+/).map((u) => u.trim()).filter(Boolean),
    [imagesInput]
  );

  const handleRender = async (e) => {
    e.preventDefault();
    if (imagesArray.length === 0) {
      setStatus({ type: "error", message: "Please provide at least one valid image URL." });
      return;
    }
    setLoading(true);
    setStatus({ type: "loading", message: "Dispatching render job to Propreel engine..." });

    const payload = {
      record_id: recordId,
      tier,
      orientation,
      images: imagesArray,
      voiceover_text: voiceoverText,
      voice_id: voiceId,
      include_agent_branding: includeBranding,
    };

    const headers = { "Content-Type": "application/json" };
    if (appParams?.token) headers["Authorization"] = `Bearer ${appParams.token}`;

    try {
      const response = await fetch(RENDER_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setStatus({ type: "success", message: data.message || "Render job queued successfully.", jobId: data.job_id || data.task_id || data.id });
      } else {
        setStatus({ type: "error", message: data.message || data.error || `Server error (${response.status})` });
      }
    } catch (err) {
      setStatus({ type: "error", message: `Network error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Ambient glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 py-8 lg:py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Clapperboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">Video Studio</h1>
              <p className="text-sm text-slate-400">Transform listing photos into cinematic real estate reels.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleRender} className="space-y-5">
          {/* Record ID */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-5">
            <label className="text-sm font-semibold text-slate-200 mb-2 block flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Property Record ID
            </label>
            <input type="text" value={recordId} onChange={(e) => setRecordId(e.target.value)} className={inputCls} required />
            <p className="text-xs text-slate-500 mt-2">A unique reference linking this render to your property record.</p>
          </div>

          {/* Tier selectors */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-5">
            <label className="text-sm font-semibold text-slate-200 mb-1 block flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Production Tier
            </label>
            <p className="text-xs text-slate-500 mb-4">Choose the quality and motion style for your video.</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {TIERS.map((t) => {
                const active = tier === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => setTier(t.id)}
                    className={`relative flex flex-col gap-1.5 p-4 rounded-xl border text-left transition-all ${
                      active
                        ? "border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                        : "border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70"
                    }`}>
                    {active && (
                      <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <t.icon className={`w-4 h-4 ${active ? "text-indigo-400" : "text-slate-500"}`} />
                      <p className="text-sm font-bold text-slate-100">{t.name}</p>
                    </div>
                    <p className="text-xs text-slate-400">{t.motion}</p>
                    <p className="text-xs text-slate-500">{t.res} · {t.speed}</p>
                    <p className="text-[10px] font-semibold text-indigo-400 mt-0.5">{t.credits} credits</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Orientation */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-5">
            <label className="text-sm font-semibold text-slate-200 mb-1 block flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Orientation
            </label>
            <p className="text-xs text-slate-500 mb-4">Choose the aspect ratio for your video.</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setOrientation("landscape")}
                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${orientation === "landscape" ? "border-indigo-500/50 bg-indigo-500/10" : "border-slate-800 bg-slate-800/40 hover:border-slate-700"}`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${orientation === "landscape" ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                  <Monitor className="w-5 h-5" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-slate-100">Landscape</p>
                  <p className="text-xs text-slate-500">16:9 · YouTube, Facebook</p>
                </div>
                {orientation === "landscape" && <Check className="w-4 h-4 text-indigo-400" />}
              </button>
              <button type="button" onClick={() => setOrientation("portrait")}
                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${orientation === "portrait" ? "border-indigo-500/50 bg-indigo-500/10" : "border-slate-800 bg-slate-800/40 hover:border-slate-700"}`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${orientation === "portrait" ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-slate-100">Portrait</p>
                  <p className="text-xs text-slate-500">9:16 · Reels, TikTok, Stories</p>
                </div>
                {orientation === "portrait" && <Check className="w-4 h-4 text-indigo-400" />}
              </button>
            </div>
          </div>

          {/* Image URLs */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Property Image URLs
              </label>
              {imagesArray.length > 0 && (
                <span className="text-xs font-semibold text-indigo-400 bg-indigo-500/15 border border-indigo-500/20 px-2.5 py-1 rounded-full">
                  {imagesArray.length} image{imagesArray.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">Paste photo URLs — one per line or comma-separated.</p>
            <textarea rows="4" value={imagesInput} onChange={(e) => setImagesInput(e.target.value)}
              placeholder={"https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg\nhttps://example.com/photo3.jpg"}
              className={`${inputCls} resize-none font-mono text-xs leading-relaxed`} required />
            {/* Live thumbnails */}
            {imagesArray.length > 0 && (
              <div className="flex gap-2.5 overflow-x-auto pb-1 mt-4">
                {imagesArray.map((url, i) => (
                  <div key={i} className="relative flex-shrink-0">
                    <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
                      <img src={url} alt="" className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
                      <div className="hidden w-full h-full items-center justify-center text-slate-600">
                        <ImagePlus className="w-5 h-5" />
                      </div>
                    </div>
                    <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/50 rounded px-1">{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Voiceover script + voice */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Voiceover Script
              </label>
              <span className="text-xs text-slate-500">{voiceoverText.trim().split(/\s+/).filter(Boolean).length} words</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Fully editable — this text is narrated and sent straight to the render queue.</p>
            <textarea rows="4" value={voiceoverText} onChange={(e) => setVoiceoverText(e.target.value)}
              className={`${inputCls} resize-none leading-relaxed`} />

            {/* Voice selector */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-300 mb-2 block flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-indigo-400" /> Narrator Voice
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {VOICES.map((v) => {
                  const active = voiceId === v.id;
                  return (
                    <button key={v.id} type="button" onClick={() => setVoiceId(v.id)}
                      className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all ${active ? "border-indigo-500/50 bg-indigo-500/10" : "border-slate-800 bg-slate-800/40 hover:border-slate-700"}`}>
                      <p className="text-sm font-semibold text-slate-100">{v.name}</p>
                      <p className="text-[11px] text-slate-500">{v.desc}</p>
                      {active && <Check className="w-3.5 h-3.5 text-indigo-400 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Branding toggle */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-5">
            <button type="button" onClick={() => setIncludeBranding((v) => !v)}
              className="w-full flex items-center gap-4 text-left">
              <div className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${includeBranding ? "bg-gradient-to-r from-indigo-500 to-violet-600" : "bg-slate-700"}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${includeBranding ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${includeBranding ? "text-indigo-400" : "text-slate-500"}`} />
                  <p className="text-sm font-semibold text-slate-100">Agent Profile & Propreel Verification Watermark</p>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Overlay your branding and a verified badge on the final video.</p>
              </div>
            </button>
          </div>

          {/* Submit */}
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-2xl py-4 text-base shadow-xl shadow-indigo-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Dispatching to render engine…</> : <><Clapperboard className="w-5 h-5" /> Generate Cinematic Reel</>}
          </button>

          {/* Status feedback */}
          {status && (
            <div className={`rounded-2xl border p-5 flex items-start gap-3 ${
              status.type === "success" ? "bg-emerald-500/10 border-emerald-500/20" :
              status.type === "error" ? "bg-red-500/10 border-red-500/20" :
              "bg-indigo-500/10 border-indigo-500/20"
            }`}>
              <div className="flex-shrink-0 mt-0.5">
                {status.type === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
                 status.type === "error" ? <AlertCircle className="w-5 h-5 text-red-400" /> :
                 <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${status.type === "success" ? "text-emerald-200" : status.type === "error" ? "text-red-200" : "text-indigo-200"}`}>
                  {status.type === "success" ? "Render job submitted!" : status.type === "error" ? "Render failed" : "Processing..."}
                </p>
                <p className="text-sm text-slate-300 mt-0.5">{status.message}</p>
                {status.jobId && <p className="text-xs text-slate-500 mt-1.5 font-mono">Job ID: {status.jobId}</p>}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}