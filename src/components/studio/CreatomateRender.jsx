import React, { useState } from "react";
import { Play, Loader2, CheckCircle2, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/pc3exi3npkd98b1gje2rq68jvdls46zl";

export default function CreatomateRender({ project, voiceoverUrl, musicUrl, selectedBrandKit }) {
  const { toast } = useToast();
  const [orientation, setOrientation] = useState("landscape");
  const [heading, setHeading] = useState(project?.name || "");
  const [rendering, setRendering] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const photos = project?.selected_photo_ids?.length ? project.selected_photo_ids : project?.photos || [];

  const handleRender = async () => {
    if (!photos.length) {
      toast({ title: "No photos in project", variant: "destructive" });
      return;
    }

    setRendering(true);

    const payload = {
      images: photos,
      aspect_ratio: orientation,
      voice_url: voiceoverUrl || "",
      music_url: musicUrl || "",
      headline_text: heading || project?.name || "",
      agent_headshot: selectedBrandKit?.profile_photo_url || "",
      company_logo: selectedBrandKit?.logo_url || "",
      agent_name: selectedBrandKit?.agent_name || "",
      agent_phone: selectedBrandKit?.phone || "",
    };

    try {
      const res = await fetch(MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setSubmitted(true);
      if (project?.id) {
        base44.entities.Project.update(project.id, { status: "processing" }).catch(() => {});
      }
      toast({ title: "✅ Render job submitted to Make.com!" });
    } catch (e) {
      toast({ title: `Render failed: ${e.message}`, variant: "destructive" });
    }

    setRendering(false);
  };

  return (
    <div className="space-y-5">
      {/* Orientation */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Orientation</p>
        <div className="flex gap-2">
          <button onClick={() => setOrientation("landscape")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${orientation === "landscape" ? "border-purple-700 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
            <Monitor className="w-3.5 h-3.5" /> 16:9 Landscape
          </button>
          <button onClick={() => setOrientation("portrait")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${orientation === "portrait" ? "border-purple-700 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
            <Smartphone className="w-3.5 h-3.5" /> 9:16 Portrait
          </button>
        </div>
      </div>

      {/* Headline */}
      <div>
        <label className="text-[11px] font-medium text-gray-500 mb-1 block">Headline Text</label>
        <input value={heading} onChange={e => setHeading(e.target.value)} placeholder={project?.name}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-700" />
      </div>

      {/* Photos summary */}
      {photos.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {photos.slice(0, 10).map((url, i) => (
            <div key={i} className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {photos.length > 10 && (
            <div className="flex-shrink-0 w-12 h-12 rounded-lg border border-gray-200 flex items-center justify-center text-[10px] text-gray-400 font-bold">
              +{photos.length - 10}
            </div>
          )}
        </div>
      )}

      {/* Render button */}
      <Button onClick={handleRender} disabled={rendering || !photos.length}
        className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl gap-2 h-11">
        {rendering
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
          : <><Play className="w-4 h-4" /> Render Video</>}
      </Button>

      {/* Success state */}
      {submitted && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Render job submitted</p>
            <p className="text-xs text-emerald-700 mt-0.5">Your video is being processed. You'll receive the finished MP4 via your Make.com workflow.</p>
          </div>
        </div>
      )}
    </div>
  );
}