import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, Share2, Pencil, SlidersHorizontal, CheckCircle2, Clock, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import SlideshowPlayer from "@/components/studio/SlideshowPlayer";

const statusConfig = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600", icon: FileEdit },
  processing: { label: "Processing", color: "bg-amber-100 text-amber-700", icon: Clock },
  ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
};

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [brandKit, setBrandKit] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Project.get(id)
      .then(async (p) => {
        setProject(p);
        if (p.brand_kit_id) {
          try {
            const kit = await base44.entities.BrandKit.get(p.brand_kit_id);
            setBrandKit(kit);
          } catch {}
        }
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

  const status = statusConfig[project.status] || statusConfig.draft;
  const StatusIcon = status.icon;
  const slideshowPhotos = project.selected_photo_ids?.length ? project.selected_photo_ids : project.photos || [];

  return (
    <div>
      <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-[#606060] hover:text-[#0F082B] mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to projects
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#0F082B]">{project.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${status.color}`}>
              <StatusIcon className="w-3 h-3" /> {status.label}
            </span>
            <span className="text-xs text-[#606060]">
              {new Date(project.created_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/projects/${id}/quick-edit`}>
            <Button variant="outline" className="rounded-xl gap-2"><Pencil className="w-4 h-4" /> Quick Edit</Button>
          </Link>
          <Link to={`/projects/${id}/studio`}>
            <Button variant="outline" className="rounded-xl gap-2"><SlidersHorizontal className="w-4 h-4" /> Studio</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video / Slideshow player */}
        <div className="lg:col-span-2">
          {project.status === "ready" && slideshowPhotos.length > 0 ? (
            <>
              <SlideshowPlayer
                photos={slideshowPhotos}
                voiceoverUrl={project.voiceover_url}
                musicUrl={project.music_url}
                brandKit={brandKit}
                introTemplate={project.intro_template}
                outroTemplate={project.outro_template}
                heading={project.intro_heading || project.name}
                subheading={project.intro_subheading}
                orientation={project.orientation}
                clipDuration={project.clip_duration || 5}
              />

              <div className="flex gap-3 mt-4 justify-center flex-wrap">
                {project.voiceover_url && (
                  <a href={project.voiceover_url} download target="_blank" rel="noreferrer">
                    <Button variant="outline" className="rounded-xl gap-2">
                      <Download className="w-4 h-4" /> Download Voiceover
                    </Button>
                  </a>
                )}
                <Button
                  variant="outline"
                  className="rounded-xl gap-2"
                  onClick={() => { navigator.clipboard.writeText(window.location.href); }}
                >
                  <Share2 className="w-4 h-4" /> Copy link
                </Button>
              </div>
            </>
          ) : (
            <div className={`bg-gray-900 rounded-2xl overflow-hidden flex items-center justify-center ${project.orientation === "portrait" ? "aspect-[9/16] max-w-xs mx-auto" : "aspect-video"}`}>
              <div className="text-center text-white px-6">
                {project.status === "processing" ? (
                  <>
                    <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4 mx-auto" />
                    <p className="text-sm font-medium opacity-70">Rendering video...</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm opacity-50 mb-3">No video rendered yet</p>
                    <Link to={`/projects/${id}/studio`}>
                      <Button size="sm" className="bg-[#21ABB5] hover:bg-[#1a9da6] text-white rounded-xl">Open Studio</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Details sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-semibold text-[#0F082B] mb-4">Project Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#606060]">Orientation</span>
                <span className="font-medium text-[#0F082B] capitalize">{project.orientation || "Landscape"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#606060]">Photos in video</span>
                <span className="font-medium text-[#0F082B]">{slideshowPhotos.length} ({Math.round(slideshowPhotos.length * (project.clip_duration || 3))}s)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#606060]">Resolution</span>
                <span className="font-medium text-[#0F082B]">{project.resolution || "1080p"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#606060]">AI Engine</span>
                <span className="font-medium text-[#0F082B]">{project.ai_engine || "v25"}</span>
              </div>
              {project.music_track && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#606060]">Music</span>
                  <span className="font-medium text-[#0F082B] truncate max-w-[120px]">{project.music_track}</span>
                </div>
              )}
              {project.voiceover_script && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#606060]">Voiceover</span>
                  <span className="font-medium text-[#21ABB5]">✓ Included</span>
                </div>
              )}
              {project.intro_template && project.intro_template !== "None" && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#606060]">Intro</span>
                  <span className="font-medium text-[#0F082B]">{project.intro_template}</span>
                </div>
              )}
              {project.outro_template && project.outro_template !== "None" && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#606060]">Outro</span>
                  <span className="font-medium text-[#0F082B]">{project.outro_template}</span>
                </div>
              )}
              {brandKit && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#606060]">Brand Kit</span>
                  <span className="font-medium text-[#0F082B] truncate max-w-[120px]">{brandKit.name}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-[#606060]">Credits used</span>
                <span className="font-medium text-[#0F082B]">{project.credits_used || 0}</span>
              </div>
            </div>
          </div>

          {slideshowPhotos.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-semibold text-[#0F082B] mb-3">Photos ({slideshowPhotos.length})</h3>
              <div className="grid grid-cols-3 gap-2">
                {slideshowPhotos.slice(0, 9).map((url, i) => (
                  <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                {slideshowPhotos.length > 9 && (
                  <div className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center">
                    <span className="text-xs text-[#606060] font-medium">+{slideshowPhotos.length - 9} more</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}