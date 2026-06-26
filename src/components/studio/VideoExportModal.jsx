import React, { useState } from "react";
import { X, Download, Share2, Copy, Check, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VideoExportModal({ project, photos, voiceoverUrl, onClose }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = window.location.origin + `/projects/${project.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPhoto = (url, index) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name?.replace(/\s+/g, "_")}_photo_${index + 1}.jpg`;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAllPhotos = () => {
    photos.forEach((url, i) => {
      setTimeout(() => downloadPhoto(url, i), i * 300);
    });
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`Check out this property video: ${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const shareEmail = () => {
    const subject = encodeURIComponent(`Property Video: ${project.name}`);
    const body = encodeURIComponent(`Hi,\n\nPlease find the property video here:\n${shareUrl}\n\nKind regards`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#0F082B]">Export & Share</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Share link */}
          <div>
            <p className="text-sm font-semibold text-[#0F082B] mb-2">Share link</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-[#606060] truncate font-mono">
                {shareUrl}
              </div>
              <Button onClick={copyLink} size="sm" variant="outline" className="rounded-xl gap-1.5 shrink-0">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          {/* Share via */}
          <div>
            <p className="text-sm font-semibold text-[#0F082B] mb-2">Share via</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={shareWhatsApp}
                className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 hover:bg-green-50 hover:border-green-300 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-[#0F082B]">WhatsApp</span>
              </button>
              <button
                onClick={shareEmail}
                className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-[#0F082B]">Email</span>
              </button>
            </div>
          </div>

          {/* Download assets */}
          <div>
            <p className="text-sm font-semibold text-[#0F082B] mb-2">Download</p>
            <div className="space-y-2">
              {photos.length > 0 && (
                <button
                  onClick={downloadAllPhotos}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-[#DEF5F7] flex items-center justify-center">
                    <Download className="w-4 h-4 text-[#21ABB5]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#0F082B]">Download photos</p>
                    <p className="text-xs text-[#606060]">{photos.length} high-res photos (JPG)</p>
                  </div>
                </button>
              )}
              {voiceoverUrl && (
                <a
                  href={voiceoverUrl}
                  download={`${project.name?.replace(/\s+/g, "_")}_voiceover.mp3`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[#DEF5F7] flex items-center justify-center">
                    <Download className="w-4 h-4 text-[#21ABB5]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#0F082B]">Download voiceover</p>
                    <p className="text-xs text-[#606060]">AI narration (MP3)</p>
                  </div>
                </a>
              )}
            </div>
          </div>

          {/* Property24 / social note */}
          <div className="bg-[#DEF5F7]/50 rounded-xl p-3">
            <p className="text-xs text-[#606060]">
              <span className="font-semibold text-[#0F082B]">💡 Pro tip:</span> Copy the share link and paste it directly into your Property24, Private Property, or social media listing for instant sharing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}