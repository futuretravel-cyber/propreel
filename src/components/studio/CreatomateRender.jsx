import React, { useState } from "react";
import { Play, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { spendCredits, getVideoTierCredits } from "@/lib/credits";
import { notifyOutOfCredits } from "@/lib/creditsToast";

export default function CreatomateRender({ project, photos: photosProp, voiceoverUrl, musicUrl, selectedBrandKit, orientation: orientationProp, heading: headingProp }) {
  const { toast } = useToast();
  const [rendering, setRendering] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Use photos passed from parent (may include uploaded ones), fallback to project photos
  const photos = photosProp?.length
    ? photosProp
    : (project?.selected_photo_ids?.length ? project.selected_photo_ids : project?.photos || []);

  const orientation = orientationProp || "landscape";
  const heading = headingProp || project?.name || "";

  const handleRender = async () => {
    if (!photos.length) {
      toast({ title: "No photos to render", variant: "destructive" });
      return;
    }

    const tierCost = getVideoTierCredits(project?.video_tier, project?.video_duration);
    const { success } = await spendCredits(tierCost);
    if (!success) {
      notifyOutOfCredits(toast, tierCost);
      return;
    }

    setRendering(true);
    setSubmitted(false);

    const payload = {
      images: photos,
      aspect_ratio: orientation,
      voice_url: voiceoverUrl || "",
      music_url: musicUrl || "",
      headline_text: heading,
      agent_headshot: selectedBrandKit?.profile_photo_url || "",
      company_logo: selectedBrandKit?.logo_url || "",
      agent_name: selectedBrandKit?.agent_name || "",
      agent_phone: selectedBrandKit?.phone || "",
    };

    try {
      const res = await base44.functions.invoke("makeWebhook", payload);
      if (!res.data?.ok) throw new Error(res.data?.body || `Status ${res.data?.status}`);

      setSubmitted(true);
      if (project?.id) {
        base44.entities.Project.update(project.id, { status: "processing" }).catch(() => {});
      }
      toast({ title: "✅ Render job submitted!" });
    } catch (e) {
      toast({ title: `Render failed: ${e.message}`, variant: "destructive" });
    }

    setRendering(false);
  };

  return (
    <div className="space-y-4">
      {/* Summary of what will be sent */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-1.5 text-xs text-gray-600">
        <div className="flex justify-between"><span className="font-medium text-gray-700">Photos</span><span>{photos.length} image{photos.length !== 1 ? "s" : ""}</span></div>
        <div className="flex justify-between"><span className="font-medium text-gray-700">Orientation</span><span className="capitalize">{orientation}</span></div>
        <div className="flex justify-between"><span className="font-medium text-gray-700">Headline</span><span className="truncate max-w-[180px] text-right">{heading || "—"}</span></div>
        <div className="flex justify-between"><span className="font-medium text-gray-700">Voiceover</span><span>{voiceoverUrl ? "✓ Ready" : "None"}</span></div>
        <div className="flex justify-between"><span className="font-medium text-gray-700">Music</span><span>{musicUrl ? "✓ Ready" : "None"}</span></div>
        <div className="flex justify-between"><span className="font-medium text-gray-700">Agent</span><span>{selectedBrandKit?.agent_name || "None"}</span></div>
      </div>

      <Button onClick={handleRender} disabled={rendering || !photos.length}
        className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl gap-2 h-11">
        {rendering
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
          : <><Play className="w-4 h-4" /> Render Video</>}
      </Button>

      {submitted && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Render job submitted</p>
            <p className="text-xs text-emerald-700 mt-0.5">Your video is being processed via Make.com. You'll receive the finished MP4 through your workflow.</p>
          </div>
        </div>
      )}
    </div>
  );
}