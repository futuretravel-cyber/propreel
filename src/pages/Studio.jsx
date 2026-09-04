import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Save, Share2, Loader2, FileText, Camera, Sofa,
  Trash2, Sunset, Share, Video, Check, ChevronLeft, ChevronRight, Menu, X, Clapperboard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// Tab sub-panels
import StudioDescription from "@/components/studio/tabs/StudioDescription";
import StudioAIPhotoEditor from "@/components/studio/tabs/StudioAIPhotoEditor";
import StudioVirtualStaging from "@/components/studio/tabs/StudioVirtualStaging";
import StudioFurnitureRemoval from "@/components/studio/tabs/StudioFurnitureRemoval";
import StudioTwilight from "@/components/studio/tabs/StudioTwilight";
import StudioSocialMedia from "@/components/studio/tabs/StudioSocialMedia";
import StudioVideoGenerator from "@/components/studio/tabs/StudioVideoGenerator";
import AIDisclaimerNotice from "@/components/shared/AIDisclaimerNotice";

const TABS = [
  { key: "description",   label: "Property Description",       icon: FileText,  short: "Description", creditNote: "2 credits per generation" },
  { key: "ai_editor",     label: "AI Photo Editor",            icon: Camera,    short: "AI Editor",    creditNote: "2 credits per photo render" },
  { key: "staging",       label: "Virtual Staging",            icon: Sofa,      short: "Staging",      creditNote: "2 credits per photo render" },
  { key: "furniture",     label: "Furniture Removal",          icon: Trash2,    short: "Furniture",    creditNote: "2 credits per photo render" },
  { key: "twilight",      label: "Twilight Photography",       icon: Sunset,    short: "Twilight",     creditNote: "2 credits per photo render" },
  { key: "social",        label: "Social Media",               icon: Share,     short: "Social",       creditNote: "2 credits per post render" },
  { key: "video",         label: "AI Video Generator",         icon: Video,     short: "Video" },
];

export default function Studio() {
  const { id } = useParams();
  const { toast } = useToast();

  const [project, setProject] = useState(null);
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("description");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // Photo state — shared across photo tabs
  const [photos, setPhotos] = useState([]);

  // Description from description tab
  const [propertyDescription, setPropertyDescription] = useState("");

  // Brand kits & music
  const [brandKits, setBrandKits] = useState([]);
  const [musicTracks, setMusicTracks] = useState([]);

  // Video generator state (lifted so VideoGenerator tab can read it)
  const [voiceoverUrl, setVoiceoverUrl] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [selectedBrandKitId, setSelectedBrandKitId] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.Project.get(id),
      base44.entities.BrandKit.list(),
      base44.entities.MusicTrack.filter({ is_active: true }, "-created_date", 50),
    ]).then(([p, kits, tracks]) => {
      setProject(p);
      setPhotos(p.selected_photo_ids?.length ? p.selected_photo_ids : p.photos || []);
      setVoiceoverUrl(p.voiceover_url || "");
      setSelectedBrandKitId(p.brand_kit_id || null);
      setBrandKits(kits);
      setMusicTracks(tracks);
      const savedTrack = tracks.find(t => t.name === p.music_track) || null;
      if (savedTrack) setMusicUrl(savedTrack.file_url || "");

      // Try to load linked listing
      if (p.listing_id) {
        return base44.entities.Listing.get(p.listing_id).then(setListing).catch(() => {});
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const handlePhotoReplaced = (idx, newUrl) => {
    setPhotos(prev => {
      const next = [...prev];
      next[idx] = newUrl;
      return next;
    });
  };

  const handleAddPhoto = (url) => {
    setPhotos(prev => (prev.includes(url) ? prev : [...prev, url]));
  };

  const handlePhotoDeleted = (idx) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.Project.update(id, {
        photos,
        voiceover_url: voiceoverUrl,
        brand_kit_id: selectedBrandKitId || "",
      });
      toast({ title: "Saved!" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-slate-100 mb-2">Project not found</h2>
        <Link to="/projects" className="text-indigo-400 text-sm hover:underline">Back to projects</Link>
      </div>
    );
  }

  const selectedBrandKit = brandKits.find(k => k.id === selectedBrandKitId) || null;
  const activeTabData = TABS.find(t => t.key === activeTab);

  const sharedPhotoProps = {
    photos,
    onPhotoReplaced: handlePhotoReplaced,
    onAddPhoto: handleAddPhoto,
    onPhotoDeleted: handlePhotoDeleted,
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "description":
        return <StudioDescription project={project} listing={listing} photos={photos} onPhotoDeleted={handlePhotoDeleted} onDescriptionGenerated={(text) => setPropertyDescription(text)} />;
      case "ai_editor":
        return <StudioAIPhotoEditor {...sharedPhotoProps} projectId={id} />;
      case "staging":
        return <StudioVirtualStaging {...sharedPhotoProps} projectId={id} />;
      case "furniture":
        return <StudioFurnitureRemoval {...sharedPhotoProps} projectId={id} />;
      case "twilight":
        return <StudioTwilight {...sharedPhotoProps} projectId={id} />;
      case "social":
        return <StudioSocialMedia photos={photos} project={project} listing={listing} onPhotoDeleted={handlePhotoDeleted} />;
      case "video":
        return (
          <StudioVideoGenerator
            project={project}
            projectId={id}
            photos={photos}
            onPhotoDeleted={handlePhotoDeleted}
            editedPhotos={photos}
            brandKits={brandKits}
            musicTracks={musicTracks}
            selectedBrandKitId={selectedBrandKitId}
            setSelectedBrandKitId={setSelectedBrandKitId}
            musicUrl={musicUrl}
            setMusicUrl={setMusicUrl}
            selectedBrandKit={selectedBrandKit}
            propertyDescription={propertyDescription}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col z-50">
      {/* ── TOP BAR ── */}
      <header className="flex items-center justify-between px-4 lg:px-6 h-14 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 flex-shrink-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={`/projects/${id}`} className="text-slate-500 hover:text-slate-200 transition-colors flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-600/20">
              <span className="text-white font-bold text-[10px]">PR</span>
            </div>
            <span className="text-sm font-semibold text-slate-100 truncate max-w-[160px] lg:max-w-xs">{project.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}
            className="rounded-lg gap-1.5 text-xs hidden sm:flex bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : "Save"}
          </Button>
          <button
            className="md:hidden p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
            onClick={() => setMobilePanelOpen(o => !o)}
          >
            {mobilePanelOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden min-h-0 min-w-0">

        {/* ── VERTICAL TAB RAIL (tablet+) ── */}
        <nav className="hidden md:flex flex-col w-[56px] lg:w-[220px] bg-slate-900/60 backdrop-blur-xl border-r border-slate-800 flex-shrink-0 overflow-y-auto">
          <div className="p-2 lg:p-3 space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  title={tab.label}
                  className={`w-full flex items-center gap-2.5 px-2 lg:px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all ${
                    active
                      ? "bg-gradient-to-r from-indigo-600/20 to-violet-600/10 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden lg:block leading-tight text-[13px]">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── MOBILE TAB DRAWER ── */}
        {mobilePanelOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobilePanelOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-slate-900 border-r border-slate-800 shadow-2xl overflow-y-auto">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <span className="font-bold text-slate-100 text-sm">Studio Tools</span>
                <button onClick={() => setMobilePanelOpen(false)} className="text-slate-400 hover:text-slate-100"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-3 space-y-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => { setActiveTab(tab.key); setMobilePanelOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-medium text-left transition-all ${
                        active
                          ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        )}

        {/* ── MOBILE horizontal tab strip ── */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800 z-40 flex overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 flex-shrink-0 text-[10px] font-medium transition-colors ${
                  active ? "text-indigo-400 border-t-2 border-indigo-500" : "text-slate-500"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.short}
              </button>
            );
          })}
        </div>

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0 min-w-0">
          <div className="p-4 lg:p-6 max-w-4xl mx-auto w-full">
            {/* Tab heading */}
            <div className="flex items-center gap-2 mb-5">
              {activeTabData && (
                <>
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
                    <activeTabData.icon className="w-4 h-4 text-indigo-400" />
                  </div>
                  <h1 className="text-lg font-bold text-slate-100">{activeTabData.label}</h1>
                  {activeTabData.creditNote && (
                    <span className="text-[11px] font-semibold text-indigo-300 bg-indigo-500/15 border border-indigo-500/20 rounded-full px-2.5 py-1">
                      ⚡ {activeTabData.creditNote}
                    </span>
                  )}
                </>
              )}
            </div>

            <AIDisclaimerNotice />
            {renderTabContent()}
          </div>
        </main>
      </div>
    </div>
  );
}