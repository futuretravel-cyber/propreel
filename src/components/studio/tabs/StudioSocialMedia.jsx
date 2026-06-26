import React, { useState } from "react";
import { Share, Loader2, Copy, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const PLATFORMS = [
  { key: "facebook",   label: "Facebook",   emoji: "📘", maxChars: 500,  desc: "Engaging post for Facebook property groups and your business page." },
  { key: "instagram",  label: "Instagram",  emoji: "📸", maxChars: 300,  desc: "Punchy caption with hashtags for Instagram property marketing." },
  { key: "whatsapp",   label: "WhatsApp",   emoji: "💬", maxChars: 400,  desc: "Short, personal message to send to your buyer database." },
  { key: "linkedin",   label: "LinkedIn",   emoji: "💼", maxChars: 700,  desc: "Professional property announcement for LinkedIn network." },
  { key: "twitter",    label: "Twitter/X",  emoji: "🐦", maxChars: 240,  desc: "Concise tweet-style post with key highlights." },
  { key: "tiktok",     label: "TikTok",     emoji: "🎵", maxChars: 300,  desc: "Trendy, youthful caption for TikTok property tours." },
  { key: "newsletter", label: "Newsletter", emoji: "📧", maxChars: 1000, desc: "Full newsletter section for your monthly property email." },
];

const SA_HASHTAGS = "#PropertyForSale #SouthAfricaProperty #RealEstate #SAProperties #Property24 #PrivateProperty #HomesForSale #DreamHome #PropertyInvestment #LuxuryProperty";

export default function StudioSocialMedia({ photos, project, listing }) {
  const { toast } = useToast();
  const [selectedPlatform, setSelectedPlatform] = useState("instagram");
  const [generating, setGenerating] = useState(false);
  const [posts, setPosts] = useState({});
  const [editedPost, setEditedPost] = useState("");
  const [copied, setCopied] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState(null);

  const platform = PLATFORMS.find(p => p.key === selectedPlatform);
  const currentPost = editedPost || posts[selectedPlatform] || "";

  const buildPropertyDetails = () => {
    if (listing) {
      return `Property: ${listing.property_type || "Property"} | Beds: ${listing.bedrooms || "N/A"} | Baths: ${listing.bathrooms || "N/A"} | Garages: ${listing.garages || "N/A"} | Price: ${listing.price ? `R ${Number(listing.price).toLocaleString("en-ZA")}` : "POA"} | Suburb: ${listing.suburb || ""} | Features: ${listing.features?.join(", ") || "N/A"}`;
    }
    return `Project: ${project?.name || "Property"}`;
  };

  const generatePost = async () => {
    setGenerating(true);
    const plat = PLATFORMS.find(p => p.key === selectedPlatform);
    const prompt = `Write a compelling ${plat.label} social media post for a South African real estate listing.

${buildPropertyDetails()}

Platform: ${plat.label}
Max characters: ${plat.maxChars}
Platform requirements: ${plat.desc}

RULES:
- Write in South African English
- Do NOT mention the street address
- Include relevant South African property hashtags for Instagram and TikTok
- For WhatsApp: make it feel personal, like from an agent to a client
- For LinkedIn: professional tone, mention investment value
- For Facebook: engaging, share-worthy, include a question to drive engagement
- For Twitter/X: punchy, under ${plat.maxChars} chars, include 2-3 hashtags
- For Newsletter: include a clear header, body, and CTA
- Return ONLY the post text, no labels or explanations`;

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

  const generateSocialImage = async () => {
    if (!photos[0]) return;
    setGeneratingImage(true);
    try {
      const platformLabel = platform?.label || "social media";
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `Create a professional ${platformLabel} real estate marketing graphic for a South African property. Modern, clean design. Add an elegant overlay text area. Premium estate agency feel. Suitable for ${platformLabel} posting dimensions.`,
        existing_image_urls: [photos[0]],
      });
      setGeneratedImageUrl(result.url);
      toast({ title: "Social media image created!" });
    } catch {
      toast({ title: "Image generation failed", variant: "destructive" });
    }
    setGeneratingImage(false);
  };

  return (
    <div className="space-y-6">
      {/* Platform tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-sm font-semibold text-gray-900 mb-3">Select Platform</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(p => (
            <button
              key={p.key}
              onClick={() => handlePlatformChange(p.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                selectedPlatform === p.key ? "border-purple-700 bg-purple-50 text-purple-800" : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <span>{p.emoji}</span> {p.label}
            </button>
          ))}
        </div>
        {platform && <p className="text-xs text-gray-400 mt-3">{platform.desc} · Max {platform.maxChars} chars</p>}
      </div>

      {/* Generate */}
      <div className="flex gap-3">
        <Button
          onClick={generatePost}
          disabled={generating}
          className="flex-1 bg-purple-700 hover:bg-purple-800 text-white rounded-xl gap-2 h-11"
        >
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Share className="w-4 h-4" /> Generate {platform?.label} Post</>}
        </Button>
        {photos.length > 0 && (
          <Button
            onClick={generateSocialImage}
            disabled={generatingImage}
            variant="outline"
            className="rounded-xl gap-2 h-11"
          >
            {generatingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : "🖼️"}
            {generatingImage ? "Creating..." : "Make Image"}
          </Button>
        )}
      </div>

      {/* Generated post */}
      {currentPost && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">{platform?.emoji} {platform?.label} Post</p>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${currentPost.length > (platform?.maxChars || 999) ? "text-red-500" : "text-gray-400"}`}>
                {currentPost.length} / {platform?.maxChars}
              </span>
              <button onClick={copy} className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <textarea
            value={currentPost}
            onChange={e => setEditedPost(e.target.value)}
            rows={8}
            className="w-full border border-purple-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-700/30 resize-none leading-relaxed bg-white"
          />
          <div className="text-xs text-gray-400">Tip: Add these hashtags → <span className="text-purple-700 font-medium">{SA_HASHTAGS.split(" ").slice(0, 4).join(" ")}</span></div>
        </div>
      )}

      {/* Generated image */}
      {generatedImageUrl && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="text-sm font-semibold text-gray-900">Social Media Image</p>
            <a href={generatedImageUrl} download="social-image.jpg" className="flex items-center gap-1 text-xs text-purple-700 hover:underline">
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </div>
          <img src={generatedImageUrl} alt="Social" className="w-full object-cover max-h-72" />
        </div>
      )}

      {/* Photo strip for reference */}
      {photos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Listing Photos</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((url, i) => (
              <div key={i} className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-gray-200">
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}