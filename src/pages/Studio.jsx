import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Play, Pause, Download, Monitor, Smartphone, Plus, Layers, Image, Type, Music, Settings, GripVertical, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { base44 } from "@/api/base44Client";

const leftTabs = [
  { key: "templates", label: "Templates", icon: Layers },
  { key: "media", label: "Media", icon: Image },
  { key: "text", label: "Text", icon: Type },
  { key: "audio", label: "Audio", icon: Music },
  { key: "settings", label: "Settings", icon: Settings },
];

const introTemplates = ["Address Reveal", "Open House", "Just Listed", "Price Drop", "Luxury Feature"];
const outroTemplates = ["Agent Card", "Contact Block", "Agency Logo Outro"];
const textStyles = ["Modern Bold", "Minimal Clean", "Gradient Pop", "Outline Style", "Classic Serif", "Tech Sans", "Brush Script", "All Caps", "Lowercase", "Shadow Bold", "Neon Glow", "Retro"];

export default function Studio() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("templates");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [orientation, setOrientation] = useState("landscape");
  const [selectedIntro, setSelectedIntro] = useState(0);
  const [selectedOutro, setSelectedOutro] = useState(0);

  useEffect(() => {
    base44.entities.Project.get(id)
      .then((p) => { setProject(p); setOrientation(p.orientation || "landscape"); })
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

  const clips = project.selected_photo_ids?.length ? project.selected_photo_ids : project.photos || [];
  const totalDuration = clips.length * 3;

  return (
    <div className="-m-4 lg:-m-8 min-h-screen bg-[#0F082B] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14 bg-[#1a1333] border-b border-white/5">
        <div className="flex items-center gap-3">
          <Link to={`/projects/${id}`} className="text-white/60 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="text-sm font-medium text-white truncate">{project.name}</span>
          <span className="text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded">Studio</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 rounded-lg text-sm">Preview</Button>
          <Button className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-lg text-sm gap-2 px-4">
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-72 bg-[#1a1333] border-r border-white/5 flex flex-col overflow-y-auto hidden lg:flex">
          <div className="flex gap-1 p-3 border-b border-white/5 flex-wrap">
            {leftTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === t.key ? "bg-[#21ABB5] text-white" : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                <t.icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            ))}
          </div>

          <div className="p-3 flex-1 overflow-y-auto">
            {activeTab === "templates" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-semibold text-white/70 mb-2">Intro Templates</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {introTemplates.map((t, i) => (
                      <button
                        key={t}
                        onClick={() => setSelectedIntro(i)}
                        className={`aspect-video rounded-lg border text-[10px] font-medium flex items-center justify-center transition-all ${
                          selectedIntro === i ? "border-[#21ABB5] bg-[#21ABB5]/10 text-[#21ABB5]" : "border-white/10 text-white/40 hover:border-white/20"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white/70 mb-2">Outro Templates</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {outroTemplates.map((t, i) => (
                      <button
                        key={t}
                        onClick={() => setSelectedOutro(i)}
                        className={`aspect-video rounded-lg border text-[10px] font-medium flex items-center justify-center transition-all ${
                          selectedOutro === i ? "border-[#21ABB5] bg-[#21ABB5]/10 text-[#21ABB5]" : "border-white/10 text-white/40 hover:border-white/20"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "media" && (
              <div className="space-y-4">
                <button className="w-full border border-dashed border-white/20 rounded-xl p-4 text-center hover:border-[#21ABB5]/50 transition-colors">
                  <Image className="w-5 h-5 text-white/40 mx-auto mb-1" />
                  <span className="text-xs text-white/40">Upload profile photo</span>
                </button>
                <button className="w-full border border-dashed border-white/20 rounded-xl p-4 text-center hover:border-[#21ABB5]/50 transition-colors">
                  <Image className="w-5 h-5 text-white/40 mx-auto mb-1" />
                  <span className="text-xs text-white/40">Upload brand logo</span>
                </button>
              </div>
            )}

            {activeTab === "text" && (
              <div>
                <h4 className="text-xs font-semibold text-white/70 mb-2">Text Styles</h4>
                <div className="grid grid-cols-2 gap-2">
                  {textStyles.map((s) => (
                    <button key={s} className="rounded-lg border border-white/10 p-2 text-[10px] text-white/50 hover:border-[#21ABB5] hover:text-[#21ABB5] transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "audio" && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-white/70 mb-2">Music Library</h4>
                {["Uplifting Morning", "Cinematic Elegance", "SA Sunset Vibes", "Gentle Piano", "Corporate Drive"].map((track) => (
                  <div key={track} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                    <button className="w-7 h-7 rounded-full bg-[#21ABB5] flex items-center justify-center flex-shrink-0">
                      <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                    </button>
                    <span className="text-xs text-white/70 flex-1">{track}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-3">
                  <Volume2 className="w-3.5 h-3.5 text-white/40" />
                  <Slider defaultValue={[70]} max={100} className="flex-1" />
                </div>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Resolution</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-xs text-white/70 outline-none">
                    <option>1080p (HD)</option>
                    <option>720p</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Export Format</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 h-9 text-xs text-white/70 outline-none">
                    <option>MP4</option>
                    <option>GIF</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center canvas */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="flex justify-center gap-2 mb-4">
                <button
                  onClick={() => setOrientation("landscape")}
                  className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 ${orientation === "landscape" ? "bg-[#21ABB5] text-white" : "bg-white/5 text-white/50"}`}
                >
                  <Monitor className="w-3.5 h-3.5" /> Landscape
                </button>
                <button
                  onClick={() => setOrientation("portrait")}
                  className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 ${orientation === "portrait" ? "bg-[#21ABB5] text-white" : "bg-white/5 text-white/50"}`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Portrait
                </button>
              </div>

              <div className={`bg-black rounded-xl overflow-hidden mx-auto ${orientation === "portrait" ? "w-48 aspect-[9/16]" : "w-full max-w-2xl aspect-video"}`}>
                <div className="w-full h-full flex items-center justify-center">
                  <Play className="w-12 h-12 text-white/30" />
                </div>
              </div>

              {/* Playback controls */}
              <div className="flex items-center gap-3 mt-4 max-w-2xl mx-auto">
                <button
                  onClick={() => setPlaying(!playing)}
                  className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white fill-white ml-0.5" />}
                </button>
                <div className="flex-1 h-1 bg-white/10 rounded-full relative">
                  <div className="absolute left-0 top-0 h-full bg-[#21ABB5] rounded-full" style={{ width: `${(currentTime / totalDuration) * 100}%` }} />
                </div>
                <span className="text-xs text-white/50 font-mono">{currentTime}s / {totalDuration}s</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-[#1a1333] border-t border-white/5 p-4 overflow-x-auto">
            <div className="space-y-2 min-w-[600px]">
              {[
                { label: "Video", items: clips },
                { label: "Overlay", items: [] },
                { label: "Text", items: [] },
                { label: "Image", items: [] },
                { label: "Audio", items: [] },
              ].map((track) => (
                <div key={track.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-white/30 w-12 flex-shrink-0">{track.label}</span>
                  <div className="flex-1 h-10 bg-white/5 rounded-lg flex items-center px-1 gap-0.5">
                    {track.label === "Video" ? (
                      clips.map((url, i) => (
                        <div key={i} className="h-8 rounded bg-[#21ABB5]/20 border border-[#21ABB5]/30 flex-1 flex items-center justify-center overflow-hidden">
                          {url && <img src={url} alt="" className="h-full w-full object-cover rounded opacity-60" />}
                        </div>
                      ))
                    ) : (
                      <button className="w-6 h-6 rounded bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                        <Plus className="w-3 h-3 text-white/30" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}