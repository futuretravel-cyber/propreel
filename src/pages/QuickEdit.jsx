import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, ArrowLeftRight, X, Check, Download, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function QuickEdit() {
  const { id } = useParams();
  const { toast } = useToast();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedClip, setSelectedClip] = useState(0);
  const [clips, setClips] = useState([]);
  const [clipUpdates, setClipUpdates] = useState(0);

  useEffect(() => {
    base44.entities.Project.get(id)
      .then((p) => {
        setProject(p);
        const photos = p.selected_photo_ids?.length ? p.selected_photo_ids : p.photos || [];
        setClips(photos.map((url, i) => ({ url, included: true, id: i })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#21ABB5] rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-[#0F082B] mb-2">Project not found</h2>
        <Link to="/projects" className="text-[#21ABB5] text-sm hover:underline">Back to projects</Link>
      </div>
    );
  }

  const toggleClip = (idx) => {
    setClips((prev) => prev.map((c, i) => i === idx ? { ...c, included: !c.included } : c));
  };

  return (
    <div>
      <Link to={`/projects/${id}`} className="inline-flex items-center gap-2 text-sm text-[#606060] hover:text-[#0F082B] mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to project
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F082B]">Quick Edit</h1>
          <p className="text-sm text-[#606060] mt-1">{project.name}</p>
        </div>
        <Button className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white font-semibold rounded-xl gap-2 px-6">
          <Download className="w-4 h-4" /> Save & Download
        </Button>
      </div>

      {/* Timeline strip */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 overflow-x-auto">
        <p className="text-xs text-[#606060] mb-3">Timeline — Click a clip to select it</p>
        <div className="flex gap-2 min-w-max">
          {clips.map((clip, i) => (
            <button
              key={i}
              onClick={() => setSelectedClip(i)}
              className={`relative w-24 h-16 rounded-lg overflow-hidden flex-shrink-0 transition-all ${
                selectedClip === i ? "ring-2 ring-[#21ABB5] ring-offset-2" : "hover:ring-2 hover:ring-gray-300"
              } ${!clip.included ? "opacity-40 grayscale" : ""}`}
            >
              {clip.url ? (
                <img src={clip.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-200" />
              )}
              <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-black/60 text-white px-1 rounded">{i + 1}</span>
              {!clip.included && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[9px] bg-red-500/80 text-white px-1.5 py-0.5 rounded">Excluded</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Selected clip actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-[#0F082B] mb-1">Clip {selectedClip + 1}</h3>
          <p className="text-xs text-[#606060] mb-4">
            Clip updates used: {clipUpdates} / 6
          </p>

          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start rounded-xl gap-3 h-12"
              onClick={() => { setClipUpdates((c) => Math.min(c + 1, 6)); toast({ title: "Re-generating clip..." }); }}
            >
              <RefreshCw className="w-4 h-4 text-[#21ABB5]" /> Re-generate this clip with AI
            </Button>
            <Button variant="outline" className="w-full justify-start rounded-xl gap-3 h-12">
              <ArrowLeftRight className="w-4 h-4 text-[#21ABB5]" /> Replace with a different photo
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start rounded-xl gap-3 h-12"
              onClick={() => toggleClip(selectedClip)}
            >
              {clips[selectedClip]?.included ? (
                <><X className="w-4 h-4 text-red-500" /> Exclude this clip</>
              ) : (
                <><Check className="w-4 h-4 text-emerald-500" /> Include this clip</>
              )}
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-[#0F082B] mb-4">Preview</h3>
          <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center">
            {clips[selectedClip]?.url ? (
              <img src={clips[selectedClip].url} alt="" className="w-full h-full object-cover rounded-xl" />
            ) : (
              <span className="text-sm text-white/50">No clip preview</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}