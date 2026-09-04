import React, { useState, useRef } from "react";
import { Share, Loader2, Copy, Check, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { uploadToS3 } from "@/lib/awsS3";
import { useToast } from "@/components/ui/use-toast";
import { spendCredits, PHOTO_TOOL_CREDIT_COST } from "@/lib/credits";
import { notifyOutOfCredits } from "@/lib/creditsToast";
import { generateScriptWithRetry } from "@/lib/scriptRetryHandler";
import PhotoThumbnailStrip from "@/components/studio/PhotoThumbnailStrip";

const PLATFORMS = [
  { key: "facebook",   label: "Facebook",   emoji: "📘", maxChars: 500,  desc: "Engaging post for Facebook property groups.", imagePrompt: "Facebook post image 1200x630px landscape, premium South African real estate marketing graphic, clean modern design" },
  { key: "instagram",  label: "Instagram",   emoji: "📸", maxChars: 300,  desc: "Punchy caption with hashtags for Instagram.", imagePrompt: "Instagram square post 1080x1080px, stunning South African property marketing photo, bold elegant estate agency aesthetic, deep purple accent colours" },
  { key: "whatsapp",   label: "WhatsApp",   emoji: "💬", maxChars: 400,  desc: "Short, personal message to send to your buyer database.", imagePrompt: "WhatsApp status image 1280x720px landscape, South African property for sale, clean professional real estate graphic" },
  { key: "linkedin",   label: "LinkedIn",    emoji: "💼", maxChars: 700,  desc: "Professional property announcement for LinkedIn.", imagePrompt: "LinkedIn post image 1200x627px, corporate professional South African real estate property announcement" },
  { key: "twitter",    label: "Twitter/X",   emoji: "🐦", maxChars: 240,  desc: "Concise tweet-style post with key highlights.", imagePrompt: "Twitter/X post image 1600x900px wide landscape, South African property listing graphic, modern bold design" },
  { key: "tiktok",     label: "TikTok",       emoji: "🎵", maxChars: 300,  desc: "Trendy, youthful caption for TikTok property tours.", imagePrompt: "TikTok thumbnail 1080x1920px vertical portrait, trendy South African property tour cover, vibrant modern design" },
  { key: "newsletter", label: "Newsletter",  emoji: "📧", maxChars: 1000, desc: "Full newsletter section for your monthly property email.", imagePrompt: "Email newsletter header 600x400px, professional South African real estate property listing banner" },
];

export default function StudioSocialMedia({ photos: projectPhotos, project, listing, onPhotoDeleted }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  const allPhotos = [...projectPhotos, ...uploadedPhotos];
  const [uploading, setUploading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const handleDeletePhoto = (idx) => {
    if (idx < projectPhotos.length) {
      onPhotoDeleted?.(idx);
    } else {
      const uploadIdx = idx - projectPhotos.length;
      setUploadedPhotos(prev => prev.filter((_, i) => i !== uploadIdx));
    }
    if (allPhotos.length <= 1) setSelectedIdx(0);
    else if (idx <= selectedIdx) setSelectedIdx(Math.max(0, selectedIdx - 1));
  };

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
        const file_url = await uploadToS3(f, "images");
        return file_url;
      }));
      setUploadedPhotos(prev => [...prev, ...urls]);
      toast({ title: `${urls.length} photo(s) uploaded` });
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
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
    const { success } = await spendCredits(PHOTO_TOOL_CREDIT_COST);
    if (!success) {
      notifyOutOfCredits(toast, PHOTO_TOOL_CREDIT_COST);
      return;
    }
    setGenerating(true);
    const plat = PLATFORMS.find(p => p.key === selectedPlatform);

    const platformRules = {
      instagram: "Max 300 chars. Punchy caption with line breaks. Include 5-8 relevant real estate hashtags.",
      facebook: "Max 500 chars. Engaging story-style post for community groups. Include a call to action.",
      whatsapp: "Max 400 chars. Direct, personal broadcast message format with key highlights and emoji bullet points.",
      linkedin: "Max 700 chars. Professional announcement tone. Focus on investment and market potential.",
      twitter: "Max 240 chars. Concise tweet with price, location, beds/baths, and one key highlight.",
      tiktok: "Max 300 chars. Casual, trendy, youthful voiceover-style caption.",
      newsletter: "Max 1000 chars. Comprehensive property feature section for monthly email blasts.",
    };

    const systemPrompt = `You are an expert South African real estate social media copywriter. You create platform-optimized posts that drive engagement and enquiries. STRICTLY validate that your response does not exceed the platform's character limit before returning it.`;

    const userPrompt = `Write a ${plat.label} post for a South African real estate listing.

${buildPropertyDetails()}

Platform: ${plat.label}
${platformRules[plat.key] || `Max ${plat.maxChars} chars`}

RULES:
- Write in South African English
- Do NOT mention the street address
- STRICTLY ensure the response does NOT exceed ${plat.maxChars} characters
- Return ONLY the post text`;

    try {
      const text = await generateScriptWithRetry(systemPrompt, userPrompt, allPhotos);
      setPosts(prev => ({ ...prev, [selectedPlatform]: text }));
      setEditedPost(text);
    } catch (e) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
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
    const referencePhoto = allPhotos[selectedIdx] || allPhotos[0];
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
      {/* Platform selector */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-5">
        <p className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><Share className="w-4 h-4 text-indigo-400" /> Select Platform</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(p => (
            <button key={p.key} onClick={() => handlePlatformChange(p.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${selectedPlatform === p.key ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300" : "border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}>
              <span>{p.emoji}</span> {p.label}
            </button>
          ))}
        </div>
        {platform && <p className="text-xs text-slate-500 mt-3">{platform.desc} · Max {platform.maxChars} chars</p>}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button onClick={generatePost} disabled={generating}
          className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl gap-2 h-11 shadow-lg shadow-indigo-600/25">
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate {platform?.label} Post</>}
        </Button>
        {allPhotos.length > 0 && (
          <Button onClick={generateSocialImage} disabled={generatingImage} variant="outline"
            className="rounded-xl gap-2 h-11 bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white">
            {generatingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generatingImage ? "Creating..." : "Make Image"}
          </Button>
        )}
      </div>

      {/* Generated post */}
      {currentPost && (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-100">{platform?.emoji} {platform?.label} Post</p>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${currentPost.length > (platform?.maxChars || 999) ? "text-red-400" : "text-slate-500"}`}>{currentPost.length} / {platform?.maxChars}</span>
              <button onClick={copy} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button onClick={downloadPost} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
          <textarea value={currentPost} onChange={e => setEditedPost(e.target.value)} rows={8}
            className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none leading-relaxed text-slate-100 placeholder:text-slate-500" />
        </div>
      )}

      {/* Generated image */}
      {generatedImageUrl && (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="text-sm font-semibold text-slate-100">{platform?.emoji} {platform?.label} Image</p>
            <a href={generatedImageUrl} download={`${selectedPlatform}-image.jpg`} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </div>
          <img src={generatedImageUrl} alt="Social" className="w-full object-cover max-h-80" />
        </div>
      )}

      <PhotoThumbnailStrip
        photos={allPhotos}
        selectedIdx={selectedIdx}
        onSelect={setSelectedIdx}
        onDelete={handleDeletePhoto}
        uploading={uploading}
        onUpload={handleUpload}
        fileInputRef={fileInputRef}
        label="Listing Photos"
      />
    </div>
  );
}