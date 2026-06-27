import React, { useState, useRef } from "react";
import { Share, Loader2, Copy, Check, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const PLATFORMS = [
  { key: "facebook",   label: "Facebook",   emoji: "📘", maxChars: 500,  desc: "Engaging post for Facebook property groups.", imagePrompt: "Facebook post image 1200x630px landscape, premium South African real estate marketing graphic, clean modern design" },
  { key: "instagram",  label: "Instagram",  emoji: "📸", maxChars: 300,  desc: "Punchy caption with hashtags for Instagram.", imagePrompt: "Instagram square post 1080x1080px, stunning South African property marketing photo, bold elegant estate agency aesthetic, deep purple accent colours" },
  { key: "whatsapp",   label: "WhatsApp",   emoji: "💬", maxChars: 400,  desc: "Short, personal message to send to your buyer database.", imagePrompt: "WhatsApp status image 1280x720px landscape, South African property for sale, clean professional real estate graphic" },
  { key: "linkedin",   label: "LinkedIn",   emoji: "💼", maxChars: 700,  desc: "Professional property announcement for LinkedIn.", imagePrompt: "LinkedIn post image 1200x627px, corporate professional South African real estate property announcement" },
  { key: "twitter",    label: "Twitter/X",  emoji: "🐦", maxChars: 240,  desc: "Concise tweet-style post with key highlights.", imagePrompt: "Twitter/X post image 1600x900px wide landscape, South African property listing graphic, modern bold design" },
  { key: "tiktok",     label: "TikTok",     emoji: "🎵", maxChars: 300,  desc: "Trendy, youthful caption for TikTok property tours.", imagePrompt: "TikTok thumbnail 1080x1920px vertical portrait, trendy South African property tour cover, vibrant modern design" },
  { key: "newsletter", label: "Newsletter", emoji: "📧", maxChars: 1000, desc: "Full newsletter section for your monthly property email.", imagePrompt: "Email newsletter header 600x400px, professional South African real estate property listing banner" },
];

export default function StudioSocialMedia({ photos: projectPhotos, project, listing }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const allPhotos = [...projectPhotos, ...uploadedPhotos];
  const [uploading, setUploading] = useState(false);

  const [selectedPlatform, setSelectedPlatform] = useState("instagram");
  const [generating, setGenerating] = useState(false);
  const [posts, setPosts] = useState({});
  const [editedPost, setEditedPost] = useState("");
  const [copied, setCopied] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState(null);

  const platform = PLATFORMS.find(p => p.key === selectedPlatform);
  const currentPost = editedPost || posts[selectedPlatform] || "";

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(async f => {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
        return file_url;
      }));
      setUploadedPhotos(prev => [...prev, ...urls]);
      toast({ title: `${urls.length} photo(s) uploaded` });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  };

  const buildPropertyDetails = () => {
    if (listing) {
      return `Property: ${listing.property_type || "Property"} | Beds: ${listing.bedrooms || "N/A"} | Baths: ${listing.bathrooms || "N/A"} | Price: ${listing.price ? `R ${Number(listing.price).toLocaleString("en-ZA")}` : "POA"} | Suburb: ${listing.suburb || ""}`;
    }
    return `Project: ${project?.name || "Property"}`;
  };

  const generatePost = async () => {
    setGenerating(true);
    const plat = PLATFORMS.find(p => p.key === selectedPlatform);
    const prompt = `Write a compelling ${plat.label} social media post for a South African real estate listing.

${buildPropertyDetails()}

Platform: ${plat.label} | Max characters: ${plat.maxChars}
Requirements: ${plat.desc}

RULES:
- Write in South African English
- Do NOT mention the street address
- Include relevant SA property hashtags for Instagram and TikTok
- For WhatsApp: feel personal, like from an agent to a client
- For LinkedIn: professional tone, mention investment value
- For Facebook: engaging, include a question
- Return ONLY the post text`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({ prompt });
      const text = typeof result === "string" ? result.trim() : "";
      setPosts(prev => ({ ...prev, [selectedPlatform]: text }));
      setEditedPost(text);
    } catch {
      toast({ title: "Generation failed", variant: "destructive" });
    }
    setGenerating(false);
  };

  const handlePlatformChange = (key) => {
    setSelectedPlatform(key);
    setEditedPost(posts[key] || "");
    setGeneratedImageUrl(null);
  };

  const copy = () => {
    navigator.clipboard.writeText(currentPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!" });
  };

  const downloadPost = () => {
    const blob = new Blob([currentPost], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${selectedPlatform}-post.txt`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Post downloaded!" });
  };

  const generateSocialImage = async () => {
    const referencePhoto = allPhotos[0];
    if (!referencePhoto) return;
    setGeneratingImage(true);
    try {
      const plat = PLATFORMS.find(p => p.key === selectedPlatform);
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `${plat.imagePrompt}. Use the provided property photo as the main visual. Premium estate agency feel. No text overlay.`,
        existing_image_urls: [referencePhoto],
      });
      setGeneratedImageUrl(result.url);
      toast({ title: `${plat.label} image created!` });
    } catch {
      toast({ title: "Image generation failed", variant: "destructive" });
    }
    setGeneratingImage(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-sm font-semibold text-gray-900 mb-3">Select Platform</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(p => (
            <button key={p.key} onClick={() => handlePlatformChange(p.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${selectedPlatform === p.key ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              <span>{p.emoji}</span> {p.label}
            </button>
          ))}
        </div>
        {platform && <p className="text-xs text-gray-400 mt-3">{platform.desc} · Max {platform.maxChars} chars</p>}
      </div>

      <div className="flex gap-3">
        <Button onClick={generatePost} disabled={generating} className="flex-1 bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-11">
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Share className="w-4 h-4" /> Generate {platform?.label} Post</>}
        </Button>
        {allPhotos.length > 0 && (
          <Button onClick={generateSocialImage} disabled={generatingImage} variant="outline" className="rounded-xl gap-2 h-11">
            {generatingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : "🖼️"}
            {generatingImage ? "Creating..." : "Make Image"}
          </Button>
        )}
      </div>

      {currentPost && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">{platform?.emoji} {platform?.label} Post</p>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${currentPost.length > (platform?.maxChars || 999) ? "text-red-500" : "text-gray-400"}`}>{currentPost.length} / {platform?.maxChars}</span>
              <button onClick={copy} className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button onClick={downloadPost} className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
          <textarea value={currentPost} onChange={e => setEditedPost(e.target.value)} rows={8}
            className="w-full border border-purple-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-700/30 resize-none leading-relaxed bg-white" />
        </div>
      )}

      {generatedImageUrl && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="text-sm font-semibold text-gray-900">{platform?.emoji} {platform?.label} Image</p>
            <a href={generatedImageUrl} download={`${selectedPlatform}-image.jpg`} className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </div>
          <img src={generatedImageUrl} alt="Social" className="w-full object-cover max-h-80" />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Listing Photos</p>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-xl gap-1.5 text-xs">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Uploading..." : "Upload Photos"}
            </Button>
          </div>
        </div>
        {allPhotos.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {allPhotos.map((url, i) => (
              <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-gray-200">
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">No photos yet. Upload photos to generate social media images.</p>
        )}
      </div>
    </div>
  );
}