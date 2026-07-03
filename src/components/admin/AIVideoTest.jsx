import React, { useState, useRef } from "react";
import { Upload, Loader2, Download, Film, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const MOTIONS = {
  "Push-In": "Slow cinematic camera dolly push forward through the space",
  "Pull-Back": "Slow cinematic camera dolly pulling back and away from the space",
  "Pan Left": "Smooth cinematic camera pan to the left across the space",
  "Pan Right": "Smooth cinematic camera pan to the right across the space",
  "Pedestal Up": "Smooth cinematic camera rising upward through the space",
  "Pedestal Down": "Smooth cinematic camera lowering downward through the space",
  "Orbit": "Smooth cinematic camera orbiting around the central subject of the space",
};

const BASE_PROMPT_TEMPLATE = (motionLine) => `${motionLine}. Depth-aware 3D camera motion \u2014 the feeling of physically moving through the space, not just sliding a flat image. Smooth, stable, professional real estate photography motion. Foreground elements drift past naturally as the camera advances, revealing spatial depth and layout. Preserve original lighting exactly \u2014 warm tones, window light, shadows remain consistent across all frames, no flickering. Maintain architectural integrity: walls stay straight, floors remain level, furniture proportions hold true, no warping or melting. Natural parallax between near and far objects. Atmospheric, inviting, high-end property showcase feel. No people, no animals, no added objects, no distortion, no morphing, no sudden camera jumps.`;

export default function AIVideoTest() {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [motion, setMotion] = useState("Push-In");
  const [generating, setGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      toast({ title: "Please upload a JPG or PNG image", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image must be under 10MB", variant: "destructive" });
      return;
    }
    setVideoUrl(null);
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setImageUrl(file_url);
      setImageFile(file);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    setUploading(false);
  };

  const handleGenerate = async () => {
    if (!imageUrl) return;
    setGenerating(true);
    setVideoUrl(null);
    try {
      const prompt = BASE_PROMPT_TEMPLATE(MOTIONS[motion]);
      const result = await base44.integrations.Core.GenerateVideo({
        prompt: `${prompt} Reference image provided for the exact space, furniture and lighting to animate.`,
        duration: 6,
        aspect_ratio: "16:9",
      });
      setVideoUrl(result.url);
      toast({ title: "Video generated!" });
    } catch {
      toast({ title: "Video generation failed", variant: "destructive" });
    }
    setGenerating(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6 max-w-2xl">
      <div>
        <h3 className="font-bold text-[#0F082B] mb-1 flex items-center gap-2"><Film className="w-4 h-4 text-[#21ABB5]" /> AI Video Test</h3>
        <p className="text-sm text-[#606060]">Upload a property photo and generate a depth-aware cinematic camera motion video.</p>
      </div>

      {/* Upload */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Image (JPG/PNG, max 10MB)</p>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/jpg" onChange={handleFileSelect} className="hidden" />
        {imagePreview ? (
          <div className="relative rounded-xl overflow-hidden border border-gray-200 aspect-video">
            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
            <button onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-2 right-2 bg-white/90 hover:bg-white text-xs font-semibold px-3 py-1.5 rounded-lg">
              Change Image
            </button>
          </div>
        ) : (
          <button onClick={() => fileInputRef.current?.click()}
            className="w-full aspect-video rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 hover:border-[#21ABB5] transition-colors">
            <ImageIcon className="w-8 h-8 text-gray-300" />
            <span className="text-sm text-gray-400 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> Click to upload image</span>
          </button>
        )}
      </div>

      {/* Duration + Aspect Ratio (fixed) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-medium text-gray-500 uppercase">Duration</p>
          <p className="text-sm font-semibold text-[#0F082B]">5 seconds</p>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-medium text-gray-500 uppercase">Aspect Ratio</p>
          <p className="text-sm font-semibold text-[#0F082B]">16:9 Landscape</p>
        </div>
      </div>

      {/* Motion Type */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Motion Type</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.keys(MOTIONS).map((m) => (
            <button key={m} onClick={() => setMotion(m)}
              className={`text-xs font-medium rounded-xl px-3 py-2.5 border-2 transition-all ${motion === m ? "border-[#21ABB5] bg-[#DEF5F7] text-[#0F082B]" : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-300"}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={handleGenerate} disabled={!imageUrl || uploading || generating}
        className="w-full bg-[#21ABB5] hover:bg-[#1a8990] text-white rounded-xl gap-2 h-11">
        {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating video (30-60s)...</> : <><Film className="w-4 h-4" /> Generate Video</>}
      </Button>

      {/* Output */}
      {videoUrl && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-emerald-800">✓ Video ready</p>
          <video controls src={videoUrl} className="w-full rounded-lg aspect-video bg-black" />
          <a href={videoUrl} download="ai-video-test.mp4"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#21ABB5] hover:underline">
            <Download className="w-3.5 h-3.5" /> Download Video
          </a>
        </div>
      )}
    </div>
  );
}