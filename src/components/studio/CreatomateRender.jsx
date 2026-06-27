import React, { useState, useEffect } from "react";
import { Video, Key, Play, Loader2, CheckCircle2, ExternalLink, RefreshCw, Download, AlertCircle, Copy } from "lucide-react";

const WEBHOOK_URL = "https://app--propreel.base44.app/api/apps/6a3d034ac0fe750276476665/functions/creatomateWebhook";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const SA_TEMPLATES = [
  { id: "luxury_home",       name: "Luxury Home",          preview_color: "#1a0a2e", accent: "#c9a84c" },
  { id: "family_home",       name: "Family Home",          preview_color: "#1e3a5f", accent: "#4CAF50" },
  { id: "security_estate",   name: "Security Estate",      preview_color: "#0f2940", accent: "#2196F3" },
  { id: "coastal_lifestyle", name: "Coastal Lifestyle",    preview_color: "#0d4f6e", accent: "#00b4d8" },
  { id: "modern_minimal",    name: "Modern Minimal",       preview_color: "#1a1a2e", accent: "#21ABB5" },
  { id: "farm",              name: "Farm",                 preview_color: "#2d4a1e", accent: "#8bc34a" },
  { id: "commercial",        name: "Commercial",           preview_color: "#0f2940", accent: "#607D8B" },
  { id: "new_dev",           name: "New Dev",              preview_color: "#b71c1c", accent: "#ff5722" },
  { id: "just_listed",       name: "Just Listed",          preview_color: "#7f0000", accent: "#ff1744" },
  { id: "investment",        name: "Investment",           preview_color: "#1b1b2f", accent: "#9c27b0" },
  { id: "modern_apartment",  name: "Modern Apartment",     preview_color: "#212121", accent: "#E91E63" },
];

function buildRenderPayload({ template, orientation, photos, heading, subheading, agentName, agentPhone, voiceoverUrl, musicUrl }) {
  const isPortrait = orientation === "portrait";
  const w = isPortrait ? 1080 : 1920;
  const h = isPortrait ? 1920 : 1080;
  const photoDuration = 3.5;
  const usedPhotos = photos.slice(0, 10);
  const totalDuration = Math.max(usedPhotos.length * photoDuration + 5, 20);

  return {
    output_format: "mp4",
    width: w, height: h,
    duration: totalDuration,
    frame_rate: 25,
    elements: [
      ...usedPhotos.map((url, i) => ({
        type: "image", source: url,
        time: i * photoDuration, duration: photoDuration + 0.5,
        width: "100%", height: "100%",
        x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%", fit: "cover",
        animations: [{ time: "start", duration: photoDuration, type: "scale", scope: "element", easing: "linear",
          scale_x: { from: 1.0, to: 1.3 }, scale_y: { from: 1.0, to: 1.3 } }],
        transitions: i > 0 ? [{ type: "fade", duration: 0.5 }] : [],
      })),
      { type: "shape", shape: "rectangle", fill_color: template.preview_color, opacity: 0.45, width: "100%", height: "100%", x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%" },
      { type: "text", text: heading || "Property Listing", time: 0, duration: 5,
        font_family: "Montserrat", font_weight: "800",
        font_size: isPortrait ? 72 : 56, fill_color: "#ffffff",
        x: "6%", y: isPortrait ? "80%" : "78%", x_anchor: "0%", y_anchor: "0%", width: "88%",
        animations: [{ time: "start", duration: 0.6, type: "slide", direction: "up", easing: "ease-out" }] },
      { type: "text", text: subheading || "", time: 0, duration: 5,
        font_family: "Montserrat", font_weight: "400",
        font_size: isPortrait ? 40 : 30, fill_color: "rgba(255,255,255,0.8)",
        x: "6%", y: isPortrait ? "89%" : "88%", x_anchor: "0%", y_anchor: "0%", width: "88%",
        animations: [{ time: "start", duration: 0.6, delay: 0.2, type: "slide", direction: "up", easing: "ease-out" }] },
      ...(agentName ? [
        { type: "text", text: agentName, time: totalDuration - 5, duration: 5,
          font_family: "Montserrat", font_weight: "700",
          font_size: isPortrait ? 60 : 48, fill_color: "#ffffff",
          x: "50%", y: "46%", x_anchor: "50%", y_anchor: "0%",
          animations: [{ time: "start", duration: 0.5, type: "slide", direction: "up", easing: "ease-out" }] },
      ] : []),
      ...(agentPhone ? [
        { type: "text", text: agentPhone, time: totalDuration - 4.5, duration: 4.5,
          font_family: "Montserrat", font_weight: "400",
          font_size: isPortrait ? 44 : 34, fill_color: template.accent,
          x: "50%", y: isPortrait ? "58%" : "58%", x_anchor: "50%", y_anchor: "0%" },
      ] : []),
      ...(voiceoverUrl ? [{ type: "audio", source: voiceoverUrl, time: 0, volume: 1.0 }] : []),
      ...(musicUrl ? [{ type: "audio", source: musicUrl, time: 0, volume: voiceoverUrl ? 0.15 : 0.35, loop: true }] : []),
    ],
  };
}

const STATUS_LABELS = { planned: "Queued", rendering: "Rendering…", succeeded: "Done", failed: "Failed" };

export default function CreatomateRender({ project, voiceoverUrl, musicUrl, selectedBrandKit }) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("creatomate_api_key") || "");
  const [showKey, setShowKey] = useState(!localStorage.getItem("creatomate_api_key"));
  const [selectedTemplate, setSelectedTemplate] = useState(SA_TEMPLATES[0]);
  const [orientation, setOrientation] = useState("landscape");
  const [heading, setHeading] = useState(project?.name || "");
  const [subheading, setSubheading] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderId, setRenderId] = useState(null);
  const [renderStatus, setRenderStatus] = useState(null); // planned | rendering | succeeded | failed
  const [renderUrl, setRenderUrl] = useState(null);
  const [polling, setPolling] = useState(false);

  const photos = project?.selected_photo_ids?.length ? project.selected_photo_ids : project?.photos || [];

  const saveKey = () => {
    localStorage.setItem("creatomate_api_key", apiKey);
    setShowKey(false);
    toast({ title: "API key saved" });
  };

  const handleRender = async () => {
    if (!apiKey) { toast({ title: "Enter your Creatomate API key first", variant: "destructive" }); return; }
    if (!photos.length) { toast({ title: "No photos in project", variant: "destructive" }); return; }
    setRendering(true);
    setRenderId(null);
    setRenderStatus(null);
    setRenderUrl(null);

    const payload = buildRenderPayload({
      template: selectedTemplate,
      orientation,
      photos,
      heading,
      subheading,
      agentName: selectedBrandKit?.agent_name || "",
      agentPhone: selectedBrandKit?.phone || "",
      voiceoverUrl: voiceoverUrl || "",
      musicUrl: musicUrl || "",
    });

    try {
      const res = await fetch("https://api.creatomate.com/v1/renders", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ source: payload, metadata: { project_id: project?.id } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const render = Array.isArray(data) ? data[0] : data;
      setRenderId(render.id);
      setRenderStatus(render.status);
      if (render.url) setRenderUrl(render.url);
      toast({ title: "Render submitted! Polling for status…" });
      setPolling(true);
    } catch (e) {
      toast({ title: `Render failed: ${e.message}`, variant: "destructive" });
    }
    setRendering(false);
  };

  // Poll every 5s until done/failed
  useEffect(() => {
    if (!polling || !renderId || !apiKey) return;
    if (renderStatus === "succeeded" || renderStatus === "failed") { setPolling(false); return; }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`https://api.creatomate.com/v1/renders/${renderId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setRenderStatus(data.status);
        if (data.url) setRenderUrl(data.url);
        if (data.status === "succeeded") {
          setPolling(false);
          clearInterval(interval);
          // Save video_url to project
          if (project?.id) {
            base44.entities.Project.update(project.id, { video_url: data.url, status: "ready" }).catch(() => {});
          }
          toast({ title: "✅ Video rendered successfully!" });
        } else if (data.status === "failed") {
          setPolling(false);
          clearInterval(interval);
          toast({ title: "❌ Render failed on Creatomate", variant: "destructive" });
        }
      } catch {}
    }, 5000);

    return () => clearInterval(interval);
  }, [polling, renderId, apiKey, renderStatus]);

  return (
    <div className="space-y-5">
      {/* API Key */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-purple-700" />
            <p className="text-sm font-semibold text-gray-900">Creatomate API Key</p>
          </div>
          {!showKey && apiKey && (
            <button onClick={() => setShowKey(true)} className="text-xs text-purple-700 hover:underline">Change</button>
          )}
        </div>
        {showKey ? (
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="paste your Creatomate API key…"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-700"
            />
            <Button onClick={saveKey} size="sm" className="bg-purple-700 hover:bg-purple-800 text-white rounded-xl">Save</Button>
          </div>
        ) : (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> API key saved
            <a href="https://creatomate.com/docs/api/rest-api" target="_blank" rel="noreferrer"
              className="ml-auto text-purple-700 flex items-center gap-0.5 hover:underline">
              API docs <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        )}
      </div>

      {/* Webhook URL */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-amber-900 mb-1">📌 Creatomate Webhook URL</p>
        <p className="text-[10px] text-amber-700 mb-2">Paste this into your Creatomate Project Settings → Webhook URL field so rendered videos are saved automatically.</p>
        <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2">
          <code className="text-[10px] text-gray-700 flex-1 break-all select-all">{WEBHOOK_URL}</code>
          <button onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); }}
            className="flex-shrink-0 p-1 hover:bg-amber-100 rounded-lg transition-colors" title="Copy">
            <Copy className="w-3.5 h-3.5 text-amber-700" />
          </button>
        </div>
      </div>

      {/* Template selection */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-sm font-semibold text-gray-900 mb-3">Video Style</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {SA_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => setSelectedTemplate(t)}
              className={`p-3 rounded-xl border-2 flex items-center gap-2 text-left transition-all ${selectedTemplate.id === t.id ? "border-purple-700 bg-purple-50" : "border-gray-100 hover:border-gray-300"}`}>
              <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: t.preview_color }}>
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.accent }} />
              </div>
              <span className="text-[11px] font-semibold text-gray-800 leading-tight">{t.name}</span>
            </button>
          ))}
        </div>

        {/* Orientation */}
        <p className="text-xs font-semibold text-gray-700 mb-2">Orientation</p>
        <div className="flex gap-2 mb-4">
          {["landscape", "portrait"].map(o => (
            <button key={o} onClick={() => setOrientation(o)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border-2 transition-all capitalize ${orientation === o ? "border-purple-700 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
              {o === "landscape" ? "16:9 Landscape" : "9:16 Portrait"}
            </button>
          ))}
        </div>

        {/* Heading / Subheading */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-gray-500 mb-1 block">Intro Heading</label>
            <input value={heading} onChange={e => setHeading(e.target.value)} placeholder={project?.name}
              className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-purple-700" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 mb-1 block">Intro Subheading</label>
            <input value={subheading} onChange={e => setSubheading(e.target.value)} placeholder="3 Beds · 2 Baths · R3.5M"
              className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-purple-700" />
          </div>
        </div>
      </div>

      {/* Photos summary */}
      {photos.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {photos.slice(0, 10).map((url, i) => (
            <div key={i} className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {photos.length > 10 && <div className="flex-shrink-0 w-12 h-12 rounded-lg border border-gray-200 flex items-center justify-center text-[10px] text-gray-400 font-bold">+{photos.length - 10}</div>}
        </div>
      )}

      {/* Render button */}
      <Button onClick={handleRender} disabled={rendering || polling || !apiKey || !photos.length}
        className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl gap-2 h-11">
        {rendering ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting render…</>
          : polling ? <><Loader2 className="w-4 h-4 animate-spin" /> Rendering on Creatomate…</>
          : <><Play className="w-4 h-4" /> Render Video</>}
      </Button>

      {/* Status */}
      {renderStatus && (
        <div className={`rounded-2xl border p-4 ${renderStatus === "succeeded" ? "bg-emerald-50 border-emerald-200" : renderStatus === "failed" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            {renderStatus === "succeeded" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              : renderStatus === "failed" ? <AlertCircle className="w-4 h-4 text-red-500" />
              : <Loader2 className="w-4 h-4 animate-spin text-amber-600" />}
            <p className={`text-sm font-semibold ${renderStatus === "succeeded" ? "text-emerald-800" : renderStatus === "failed" ? "text-red-700" : "text-amber-800"}`}>
              {STATUS_LABELS[renderStatus] || renderStatus}
            </p>
            {renderId && <span className="text-[10px] text-gray-400 ml-auto font-mono">{renderId.slice(0, 12)}…</span>}
          </div>

          {renderStatus === "rendering" || renderStatus === "planned" ? (
            <p className="text-xs text-amber-700">Polling every 5 seconds… this usually takes 30–90 seconds.</p>
          ) : null}

          {renderUrl && renderStatus === "succeeded" && (
            <div className="mt-3 space-y-2">
              <video src={renderUrl} controls className="w-full rounded-xl max-h-48 bg-black" />
              <a href={renderUrl} download target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-xl transition-colors">
                <Download className="w-3.5 h-3.5" /> Download MP4
              </a>
            </div>
          )}

          {renderStatus !== "succeeded" && renderId && (
            <button onClick={() => setPolling(true)} disabled={polling}
              className="mt-2 flex items-center gap-1 text-xs text-purple-700 hover:underline disabled:opacity-50">
              <RefreshCw className="w-3 h-3" /> Refresh status
            </button>
          )}
        </div>
      )}
    </div>
  );
}