import React, { useState } from "react";
import { User, Loader2, ExternalLink, Check, AlertCircle, Play, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

// HeyGen public avatar IDs (from HeyGen's public avatar library)
const HEYGEN_AVATARS = [
  { id: "Anna_public_3_20240108", name: "Anna",    style: "Professional", gender: "Female", emoji: "👩‍💼", desc: "Formal blazer, corporate style" },
  { id: "Tyler-incasualsuit-20220721", name: "Tyler", style: "Business Casual", gender: "Male", emoji: "👨‍💼", desc: "Business casual, friendly" },
  { id: "Daisy-inskirt-20220818", name: "Daisy",   style: "Elegant",  gender: "Female", emoji: "👗", desc: "Elegant dress, upmarket" },
  { id: "Bryan-inblacksuit-20220923", name: "Bryan",  style: "Luxury",   gender: "Male",   emoji: "🤵", desc: "Black suit, luxury properties" },
  { id: "Leah-inblazor-20220831", name: "Leah",  style: "Modern",   gender: "Female", emoji: "💼", desc: "Modern blazer, contemporary" },
  { id: "Justin-insuit-20220818", name: "Justin", style: "Classic",  gender: "Male",   emoji: "👔", desc: "Classic suit, all property types" },
];

const POSITIONS = [
  { key: "bottom-left",  label: "Bottom Left" },
  { key: "bottom-right", label: "Bottom Right" },
  { key: "full",         label: "Full Frame" },
];

export default function HeyGenAvatar({ selectedAvatarId, setSelectedAvatarId, script, voiceId, onAvatarVideoReady }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("heygen_api_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(!localStorage.getItem("heygen_api_key"));
  const [position, setPosition] = useState("bottom-right");
  const [generating, setGenerating] = useState(false);
  const [avatarVideoUrl, setAvatarVideoUrl] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [polling, setPolling] = useState(false);

  const saveApiKey = () => {
    localStorage.setItem("heygen_api_key", apiKey);
    setShowKeyInput(false);
  };

  const selectedAvatar = HEYGEN_AVATARS.find(a => a.id === selectedAvatarId);

  const generateAvatarVideo = async () => {
    if (!apiKey || !selectedAvatarId || !script) return;
    setGenerating(true);
    try {
      // Submit HeyGen video generation job
      const res = await fetch("https://api.heygen.com/v2/video/generate", {
        method: "POST",
        headers: {
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          video_inputs: [{
            character: {
              type: "avatar",
              avatar_id: selectedAvatarId,
              avatar_style: "normal",
            },
            voice: {
              type: "text",
              input_text: script.slice(0, 1500),
              voice_id: "1bd001e7e50f421d891986aad5158bc8", // English SA-close voice
            },
          }],
          dimension: { width: 1280, height: 720 },
        }),
      });
      const data = await res.json();
      if (data.data?.video_id) {
        setJobId(data.data.video_id);
        pollForResult(data.data.video_id);
      } else {
        throw new Error(JSON.stringify(data));
      }
    } catch (e) {
      alert("HeyGen generation failed: " + e.message);
      setGenerating(false);
    }
  };

  const pollForResult = async (videoId) => {
    setPolling(true);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
          headers: { "X-Api-Key": apiKey },
        });
        const data = await res.json();
        if (data.data?.status === "completed") {
          clearInterval(interval);
          setAvatarVideoUrl(data.data.video_url);
          if (onAvatarVideoReady) onAvatarVideoReady(data.data.video_url);
          setGenerating(false);
          setPolling(false);
        } else if (data.data?.status === "failed" || attempts > 60) {
          clearInterval(interval);
          alert("Avatar video generation failed or timed out.");
          setGenerating(false);
          setPolling(false);
        }
      } catch {
        clearInterval(interval);
        setGenerating(false);
        setPolling(false);
      }
    }, 5000);
  };

  return (
    <div className="space-y-4">
      {/* API Key */}
      <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-purple-600 rounded-md flex items-center justify-center">
              <Video className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-semibold text-[#0F082B]">HeyGen Avatar AI</span>
          </div>
          {!showKeyInput && apiKey && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">✓ Connected</span>
          )}
        </div>
        {showKeyInput ? (
          <div className="space-y-2">
            <p className="text-[10px] text-[#606060]">Enter your HeyGen API key for talking avatar videos.</p>
            <a href="https://app.heygen.com/settings?nav=API" target="_blank" rel="noreferrer" className="text-[10px] text-purple-600 flex items-center gap-1 hover:underline">
              Get API key at heygen.com <ExternalLink className="w-3 h-3" />
            </a>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Your HeyGen API key"
                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-purple-400"
              />
              <Button size="sm" onClick={saveApiKey} disabled={!apiKey} className="bg-purple-600 text-white rounded-lg text-xs px-3">Save</Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowKeyInput(true)} className="text-[10px] text-[#606060] hover:text-purple-600 underline">Change API key</button>
        )}
      </div>

      <p className="text-[10px] text-[#606060]">A talking AI presenter will be overlaid on your video outro, reading the voiceover script.</p>

      {/* Avatar grid */}
      <div className="grid grid-cols-2 gap-2">
        {HEYGEN_AVATARS.map(avatar => (
          <button
            key={avatar.id}
            onClick={() => { setSelectedAvatarId(avatar.id); setAvatarVideoUrl(null); }}
            className={`p-3 rounded-xl border-2 text-left transition-all ${selectedAvatarId === avatar.id ? "border-purple-500 bg-purple-50" : "border-gray-100 hover:border-gray-200 bg-gray-50"}`}
          >
            <div className="text-2xl mb-1">{avatar.emoji}</div>
            <p className={`text-xs font-semibold ${selectedAvatarId === avatar.id ? "text-purple-700" : "text-[#0F082B]"}`}>{avatar.name}</p>
            <p className="text-[10px] text-[#606060]">{avatar.style}</p>
            <p className="text-[10px] text-[#606060] truncate">{avatar.desc}</p>
          </button>
        ))}
      </div>

      {/* Position */}
      {selectedAvatarId && (
        <div>
          <p className="text-[10px] font-medium text-[#606060] mb-1.5">Avatar position in video</p>
          <div className="flex gap-1.5">
            {POSITIONS.map(pos => (
              <button
                key={pos.key}
                onClick={() => setPosition(pos.key)}
                className={`flex-1 text-[10px] font-medium py-1.5 rounded-lg border-2 transition-all ${position === pos.key ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-100 bg-gray-50 text-[#606060]"}`}
              >
                {pos.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result preview */}
      {avatarVideoUrl && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-700">✓ Avatar video ready!</p>
          <video src={avatarVideoUrl} controls className="w-full rounded-xl border border-gray-200" />
          <a href={avatarVideoUrl} download="avatar.mp4" className="text-[10px] text-[#21ABB5] underline block">Download avatar MP4</a>
        </div>
      )}

      {polling && (
        <div className="flex items-center gap-2 bg-purple-50 rounded-xl p-3">
          <Loader2 className="w-4 h-4 text-purple-600 animate-spin flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-purple-800">Rendering avatar video...</p>
            <p className="text-[10px] text-purple-600">HeyGen is generating your talking avatar. This takes 1-3 minutes.</p>
          </div>
        </div>
      )}

      {selectedAvatarId && !generating && (
        <Button
          onClick={generateAvatarVideo}
          disabled={!apiKey || !script?.trim()}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl gap-2 text-sm"
        >
          <User className="w-4 h-4" /> Generate Talking Avatar (HeyGen)
        </Button>
      )}

      {!script?.trim() && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-800">Add a voiceover script in the Voiceover tab first — the avatar will read it on screen.</p>
        </div>
      )}
    </div>
  );
}