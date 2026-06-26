import React, { useState } from "react";
import {
  Video, Music, Mic, User, Star, Layers, Monitor, Smartphone,
  Check, Play, Loader2, Download, ChevronDown, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import SlideshowPlayer from "@/components/studio/SlideshowPlayer";
import ElevenLabsVoiceover from "@/components/studio/ElevenLabsVoiceover";
import VoiceoverSelector from "@/components/studio/VoiceoverSelector";
import CreatomateDownload from "@/components/studio/CreatomateDownload";

const INTRO_TEMPLATES = ["None", "Address Reveal", "Open House", "Just Listed", "Price Drop", "Luxury Feature", "Simple"];
const OUTRO_TEMPLATES = ["None", "Agent Card", "Contact Block", "Agency Logo"];

const SECTIONS = [
  { key: "creatomate", label: "Creatomate Templates", icon: Video,   desc: "9 Pro video templates with Ken Burns effect" },
  { key: "avatar",     label: "HeyGen AI Avatar",     icon: User,    desc: "AI presenter for your listing video" },
  { key: "voiceover",  label: "ElevenLabs Voiceover", icon: Mic,     desc: "Realistic AI voiceover narration" },
  { key: "intros",     label: "Intro / Outro",         icon: Layers,  desc: "Branded intro and outro overlays" },
  { key: "format",     label: "Landscape / Portrait",  icon: Monitor, desc: "Choose video orientation" },
  { key: "brandkit",   label: "Brand Kit",             icon: Star,    desc: "Apply your agent branding" },
  { key: "music",      label: "Music",                 icon: Music,   desc: "Background music track" },
];

function Section({ sectionKey, label, icon: Icon, desc, children }) {
  const [open, setOpen] = useState(sectionKey === "creatomate");
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
            <Icon className="w-4 h-4 text-purple-700" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">{label}</p>
            <p className="text-xs text-gray-400">{desc}</p>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="border-t border-gray-100 p-5">{children}</div>}
    </div>
  );
}

export default function StudioVideoGenerator({
  project, projectId, photos,
  brandKits, musicTracks,
  selectedBrandKitId, setSelectedBrandKitId,
  voiceoverUrl, setVoiceoverUrl,
  musicUrl, setMusicUrl,
  selectedBrandKit,
}) {
  const { toast } = useToast();
  const [orientation, setOrientation] = useState(project?.orientation || "landscape");
  const [introTemplate, setIntroTemplate] = useState(project?.intro_template || "Address Reveal");
  const [outroTemplate, setOutroTemplate] = useState(project?.outro_template || "Agent Card");
  const [heading, setHeading] = useState(project?.intro_heading || "");
  const [subheading, setSubheading] = useState(project?.intro_subheading || "");
  const [musicTrack, setMusicTrack] = useState(null);
  const [voiceoverScript, setVoiceoverScript] = useState(project?.voiceover_script || "");
  const [voiceoverVoice, setVoiceoverVoice] = useState(project?.voiceover_voice || "alloy");
  const [voiceEngine, setVoiceEngine] = useState("builtin");
  const [rendering, setRendering] = useState(false);
  const [heygenApiKey, setHeygenApiKey] = useState("");

  const handleRenderVoiceover = async () => {
    if (!voiceoverScript.trim()) return;
    setRendering(true);
    try {
      const result = await base44.integrations.Core.GenerateSpeech({
        text: voiceoverScript,
        voice: voiceoverVoice,
        language_code: "en",
      });
      setVoiceoverUrl(result.url);
      await base44.entities.Project.update(projectId, { voiceover_url: result.url, voiceover_script: voiceoverScript });
      toast({ title: "Voiceover generated!" });
    } catch {
      toast({ title: "Voiceover failed", variant: "destructive" });
    }
    setRendering(false);
  };

  const handleMusicTrack = (track) => {
    setMusicTrack(track.id);
    setMusicUrl(track.file_url || "");
  };

  return (
    <div className="space-y-4">
      {/* Live Preview */}
      {photos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-900">Live Preview</p>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-0.5">
              <button onClick={() => setOrientation("landscape")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${orientation === "landscape" ? "bg-purple-700 text-white" : "text-gray-500"}`}>
                <Monitor className="w-3.5 h-3.5" /> Landscape
              </button>
              <button onClick={() => setOrientation("portrait")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${orientation === "portrait" ? "bg-purple-700 text-white" : "text-gray-500"}`}>
                <Smartphone className="w-3.5 h-3.5" /> Portrait
              </button>
            </div>
          </div>
          <SlideshowPlayer
            photos={photos}
            voiceoverUrl={voiceoverUrl}
            musicUrl={musicUrl}
            brandKit={selectedBrandKit}
            introTemplate={introTemplate}
            outroTemplate={outroTemplate}
            heading={heading || project?.name}
            subheading={subheading}
            orientation={orientation}
            clipDuration={project?.clip_duration || 5}
          />
        </div>
      )}

      {/* Creatomate */}
      <Section sectionKey="creatomate" label="Creatomate Templates" icon={Video} desc="9 professional video templates — download and render on Creatomate">
        <CreatomateDownload project={project} />
      </Section>

      {/* HeyGen Avatar */}
      <Section sectionKey="avatar" label="HeyGen AI Avatar" icon={User} desc="Add a talking AI presenter to your listing video">
        <div className="space-y-3">
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-purple-900 mb-1">🎬 HeyGen Integration</p>
            <p className="text-xs text-purple-700 mb-3">Enter your HeyGen API key to generate a talking avatar video for this listing. The avatar will read your voiceover script.</p>
            <input
              type="password"
              value={heygenApiKey}
              onChange={e => setHeygenApiKey(e.target.value)}
              placeholder="HeyGen API Key (sk-...)"
              className="w-full border border-purple-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-purple-700 bg-white"
            />
          </div>
          {voiceoverScript && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-700 mb-1">Script preview</p>
              <p className="text-xs text-gray-500 line-clamp-3">{voiceoverScript}</p>
            </div>
          )}
          <Button
            onClick={() => toast({ title: "HeyGen integration", description: "Enter your HeyGen API key and voiceover script to generate an avatar video." })}
            disabled={!heygenApiKey || !voiceoverScript}
            className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-10 text-sm"
          >
            <User className="w-4 h-4" /> Generate Avatar Video
          </Button>
          <p className="text-xs text-gray-400 text-center">
            Don't have HeyGen? <a href="https://www.heygen.com" target="_blank" rel="noopener" className="text-purple-700 underline">Get your API key at heygen.com →</a>
          </p>
        </div>
      </Section>

      {/* Voiceover */}
      <Section sectionKey="voiceover" label="ElevenLabs / Built-in Voiceover" icon={Mic} desc="Generate professional AI narration for your video">
        <div className="space-y-3">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            <button onClick={() => setVoiceEngine("builtin")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${voiceEngine === "builtin" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              Built-in AI
            </button>
            <button onClick={() => setVoiceEngine("elevenlabs")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${voiceEngine === "elevenlabs" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"}`}>
              ElevenLabs ✨
            </button>
          </div>

          {voiceEngine === "builtin" ? (
            <div className="space-y-3">
              <VoiceoverSelector
                script={voiceoverScript}
                setScript={setVoiceoverScript}
                selectedVoice={voiceoverVoice}
                setSelectedVoice={setVoiceoverVoice}
                projectName={project?.name}
                heading={heading}
                subheading={subheading}
                photoCount={photos.length}
              />
              {voiceoverScript.trim() && (
                <Button onClick={handleRenderVoiceover} disabled={rendering} className="w-full bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-10">
                  {rendering ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Mic className="w-4 h-4" /> Generate Voiceover</>}
                </Button>
              )}
            </div>
          ) : (
            <ElevenLabsVoiceover
              script={voiceoverScript}
              setScript={setVoiceoverScript}
              selectedVoice={voiceoverVoice}
              setSelectedVoice={setVoiceoverVoice}
              projectName={project?.name}
              heading={heading}
              subheading={subheading}
              photoCount={photos.length}
              onVoiceoverReady={(url) => {
                setVoiceoverUrl(url);
                base44.entities.Project.update(projectId, { voiceover_url: url });
              }}
            />
          )}

          {voiceoverUrl && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-800 mb-2">✓ Voiceover ready</p>
              <audio controls src={voiceoverUrl} className="w-full" style={{ height: "36px" }} />
              <a href={voiceoverUrl} download="voiceover.mp3" className="text-[10px] text-purple-700 underline mt-1 block">Download MP3</a>
            </div>
          )}
        </div>
      </Section>

      {/* Intro / Outro */}
      <Section sectionKey="intros" label="Intro / Outro" icon={Layers} desc="Branded intro and outro overlays for your video">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Intro Template</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {INTRO_TEMPLATES.map(t => (
                <button key={t} onClick={() => setIntroTemplate(t)}
                  className={`aspect-video rounded-xl border-2 text-[10px] font-medium flex items-center justify-center p-1 text-center transition-all ${introTemplate === t ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-500 hover:border-gray-300 bg-gray-50"}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-[10px] font-medium text-gray-500 mb-1 block">Heading</label>
                <input value={heading} onChange={e => setHeading(e.target.value)} placeholder={project?.name} className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-purple-700" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 mb-1 block">Subheading</label>
                <input value={subheading} onChange={e => setSubheading(e.target.value)} placeholder="Subtitle..." className="w-full border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-purple-700" />
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Outro Template</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {OUTRO_TEMPLATES.map(t => (
                <button key={t} onClick={() => setOutroTemplate(t)}
                  className={`aspect-video rounded-xl border-2 text-[10px] font-medium flex items-center justify-center p-1 text-center transition-all ${outroTemplate === t ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-500 hover:border-gray-300 bg-gray-50"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Format */}
      <Section sectionKey="format" label="Landscape / Portrait" icon={Monitor} desc="Choose your video orientation and resolution">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setOrientation("landscape")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${orientation === "landscape" ? "border-purple-700 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
              <Monitor className={`w-8 h-8 ${orientation === "landscape" ? "text-purple-700" : "text-gray-400"}`} />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">Landscape</p>
                <p className="text-xs text-gray-500">16:9 · YouTube, Facebook, TV</p>
              </div>
              {orientation === "landscape" && <Check className="w-4 h-4 text-purple-700" />}
            </button>
            <button onClick={() => setOrientation("portrait")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${orientation === "portrait" ? "border-purple-700 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
              <Smartphone className={`w-8 h-8 ${orientation === "portrait" ? "text-purple-700" : "text-gray-400"}`} />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">Portrait</p>
                <p className="text-xs text-gray-500">9:16 · Reels, TikTok, Stories</p>
              </div>
              {orientation === "portrait" && <Check className="w-4 h-4 text-purple-700" />}
            </button>
          </div>
        </div>
      </Section>

      {/* Brand Kit */}
      <Section sectionKey="brandkit" label="Brand Kit" icon={Star} desc="Apply your logo, profile photo and contact info">
        <div className="space-y-2">
          {brandKits.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-2">No brand kits set up yet.</p>
              <Link to="/brand-kits" className="text-sm text-purple-700 underline">Create a Brand Kit →</Link>
            </div>
          ) : (
            brandKits.map(kit => (
              <button key={kit.id} onClick={() => setSelectedBrandKitId(kit.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${selectedBrandKitId === kit.id ? "border-purple-700 bg-purple-50" : "border-gray-100 hover:border-gray-200"}`}>
                {kit.profile_photo_url ? (
                  <img src={kit.profile_photo_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-700 flex-shrink-0">
                    {kit.agent_name?.[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{kit.name}</p>
                  <p className="text-xs text-gray-500 truncate">{kit.agent_name}</p>
                </div>
                {selectedBrandKitId === kit.id && <Check className="w-4 h-4 text-purple-700 flex-shrink-0" />}
              </button>
            ))
          )}
        </div>
      </Section>

      {/* Music */}
      <Section sectionKey="music" label="Music" icon={Music} desc="Background music track for your video">
        <div className="space-y-2">
          {musicTracks.length === 0 ? (
            <div className="text-center py-4">
              <Music className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No music tracks available. Add tracks from the Admin panel.</p>
            </div>
          ) : (
            musicTracks.map(track => (
              <button key={track.id} onClick={() => handleMusicTrack(track)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${musicTrack === track.id ? "border-purple-700 bg-purple-50" : "border-gray-100 bg-gray-50 hover:border-gray-200"}`}>
                <button
                  onClick={e => { e.stopPropagation(); new Audio(track.file_url).play(); }}
                  className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center flex-shrink-0 hover:bg-purple-800"
                >
                  <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                </button>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{track.name}</p>
                  <p className="text-xs text-gray-500">{track.genre}{track.duration ? ` · ${track.duration}` : ""}</p>
                </div>
                {musicTrack === track.id && <Check className="w-4 h-4 text-purple-700 flex-shrink-0" />}
              </button>
            ))
          )}
        </div>
      </Section>
    </div>
  );
}