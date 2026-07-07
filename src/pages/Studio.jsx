import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Save, Share2, Loader2, FileText, Camera, Sofa,
  Trash2, Sunset, Share, Video, Check, ChevronLeft, ChevronRight, Menu, X
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
import SlideshowPlayer from "@/components/studio/SlideshowPlayer";
import AIDisclaimerNotice from "@/components/shared/AIDisclaimerNotice";

const TABS = [
  { key: "description",   label: "Property Description",       icon: FileText,  short: "Description" },
  { key: "ai_editor",     label: "AI Photo Editor",            icon: Camera,    short: "AI Editor" },
  { key: "staging",       label: "Virtual Staging",            icon: Sofa,      short: "Staging" },
  { key: "furniture",     label: "Furniture Removal",          icon: Trash2,    short: "Furniture" },
  { key: "twilight",      label: "Twilight Photography",       icon: Sunset,    short: "Twilight" },
  { key: "social",        label: "Social Media",               icon: Share,     short: "Social" },
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
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Project not found</h2>
        <Link to="/projects" className="text-purple-700 text-sm hover:underline">Back to projects</Link>
      </div>
    );
  }

  const selectedBrandKit = brandKits.find(k => k.id === selectedBrandKitId) || null;
  const activeTabData = TABS.find(t => t.key === activeTab);

  const sharedPhotoProps = {
    photos,
    onPhotoReplaced: handlePhotoReplaced,
    onAddPhoto: handleAddPhoto,
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "description":
        return <StudioDescription project={project} listing={listing} onDescriptionGenerated={(text) => setPropertyDescription(text)} />;
      case "ai_editor":
        return <StudioAIPhotoEditor {...sharedPhotoProps} projectId={id} />;
      case "staging":
        return <StudioVirtualStaging {...sharedPhotoProps} projectId={id} />;
      case "furniture":
        return <StudioFurnitureRemoval {...sharedPhotoProps} projectId={id} />;
      case "twilight":
        return <StudioTwilight {...sharedPhotoProps} projectId={id} />;
      case "social":
        return <StudioSocialMedia photos={photos} project={project} listing={listing} />;
      case "video":
        return (
          <StudioVideoGenerator
            project={project}
            projectId={id}
            photos={photos}
            editedPhotos={photos}
            brandKits={brandKits}
            musicTracks={musicTracks}
            selectedBrandKitId={selectedBrandKitId}
            setSelectedBrandKitId={setSelectedBrandKitId}
            voiceoverUrl={voiceoverUrl}
            setVoiceoverUrl={setVoiceoverUrl}
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
    <div className="fixed inset-0 bg-gray-50 flex flex-col z-50">
      {/* ── TOP BAR ── */}
      <header className="flex items-center justify-between px-4 lg:px-6 h-14 bg-white border-b border-gray-100 flex-shrink-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={`/projects/${id}`} className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-purple-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-[10px]">PR</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 truncate max-w-[160px] lg:max-w-xs">{project.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="rounded-lg gap-1.5 text-xs hidden sm:flex">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : "Save"}
          </Button>
          {/* Mobile panel toggle — only on small screens */}
          <button
            className="md:hidden p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
            onClick={() => setMobilePanelOpen(o => !o)}
          >
            {mobilePanelOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden min-h-0 min-w-0">

        {/* ── VERTICAL TAB RAIL (tablet+) ── */}
        <nav className="hidden md:flex flex-col w-[52px] lg:w-[200px] bg-white border-r border-gray-100 flex-shrink-0 overflow-y-auto">
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
                      ? "bg-purple-700 text-white shadow-sm"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
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
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobilePanelOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl overflow-y-auto">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <span className="font-bold text-gray-900 text-sm">Studio Tools</span>
                <button onClick={() => setMobilePanelOpen(false)}><X className="w-4 h-4" /></button>
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
                        active ? "bg-purple-700 text-white" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
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
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40 flex overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 flex-shrink-0 text-[10px] font-medium transition-colors ${
                  active ? "text-purple-700 border-t-2 border-purple-700" : "text-gray-400"
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
                  <activeTabData.icon className="w-5 h-5 text-purple-700" />
                  <h1 className="text-lg font-bold text-gray-900">{activeTabData.label}</h1>
                </>
              )}
            </div>

            {activeTab !== "description" && <AIDisclaimerNotice />}
            {renderTabContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

function EmptyPhotos() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
      <Camera className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <h3 className="font-semibold text-gray-700 mb-1">No photos in this project</h3>
      <p className="text-sm text-gray-400">Upload photos first from the Project Details page.</p>
    </div>
  );
}