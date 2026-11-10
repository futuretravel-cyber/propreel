import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { track } from '../lib/analytics';

interface ShareSheetProps {
  videoUrl: string;
  caption?: string;
  hashtags?: string[];
  onClose: () => void;
}

const PLATFORMS: Array<{ id: string; label: string; build: (url: string, text: string) => string }> = [
  { id: 'whatsapp', label: 'WhatsApp', build: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t}\n${u}`)}` },
  { id: 'facebook', label: 'Facebook', build: u => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: 'x', label: 'X (Twitter)', build: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: 'linkedin', label: 'LinkedIn', build: u => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  { id: 'telegram', label: 'Telegram', build: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: 'email', label: 'Email', build: (u, t) => `mailto:?subject=${encodeURIComponent('New property video')}&body=${encodeURIComponent(`${t}\n\n${u}`)}` },
];

/**
 * One-click share sheet for finished renders, with per-platform captions.
 * Uses the Web Share API when available (mobile), otherwise per-platform links.
 */
// Render videos are shared via the /share page so social platforms read
// og:video tags. Other links are shared as they are.
function toShareLink(url: string): string {
  const m = url.match(/^https:\/\/cdn\.propreel\.co\.za\/renders\/([A-Za-z0-9_-]+)\/video\.mp4$/);
  return m ? `https://api.propreel.co.za/share/${m[1]}` : url;
}

export default function ShareSheet({ videoUrl: rawVideoUrl, caption = '', hashtags = [], onClose }: ShareSheetProps) {
  const videoUrl = toShareLink(rawVideoUrl);
  const [copied, setCopied] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Escape closes the sheet (the backdrop handles click-outside).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const text = `${caption}${hashtags.length ? '\n\n' + hashtags.map(h => `#${h.replace(/\s+/g, '')}`).join(' ') : ''}`;

  const share = (platformId: string) => {
    track('share_clicked', { platform: platformId });
    const platform = PLATFORMS.find(p => p.id === platformId);
    if (platform) window.open(platform.build(videoUrl, text), '_blank', 'noopener,width=600,height=500');
  };

  const nativeShare = async () => {
    track('share_clicked', { platform: 'native' });
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My PropReel listing video', text, url: videoUrl });
        onClose();
        return;
      } catch {
        /* user cancelled — fall through to sheet */
      }
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(videoUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = videoUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    track('share_clicked', { platform: 'copy' });
    setTimeout(() => setCopied(false), 2000);
  };

  // Instagram and TikTok have no web share intents — caption + link on the
  // clipboard is the real flow for them (paste into the post composer).
  const copyCaptionAndLink = async () => {
    const payload = `${text}\n${videoUrl}`;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedCaption(true);
    track('share_clicked', { platform: 'copy_caption' });
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const hasNative = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Share video">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-gray-900">Share your video</h3>
          <button onClick={onClose} aria-label="Close share sheet" className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {caption && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-4 max-h-24 overflow-y-auto">{text}</p>}

        <div className="grid grid-cols-3 gap-3">
          {PLATFORMS.map(p => (
            <button
              key={p.id}
              onClick={() => share(p.id)}
              className="min-h-[64px] rounded-xl border border-gray-200 hover:border-purple-400 hover:bg-purple-50 text-sm font-medium text-gray-800 transition flex items-center justify-center px-2"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          {hasNative && (
            <button onClick={nativeShare} className="btn btn-primary flex-1 min-h-[48px]">
              More options…
            </button>
          )}
          <button onClick={copyLink} className={`btn flex-1 min-h-[48px] ${copied ? 'bg-green-600 text-white' : 'border border-gray-300 text-gray-700'}`}>
            {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy link</>}
          </button>
        </div>

        <button onClick={copyCaptionAndLink} className={`mt-3 w-full btn min-h-[48px] ${copiedCaption ? 'bg-green-600 text-white' : 'border border-gray-300 text-gray-700'}`}>
          {copiedCaption ? <><Check className="w-4 h-4" /> Caption & link copied!</> : <><Copy className="w-4 h-4" /> Copy caption & link (Instagram / TikTok)</>}
        </button>
        <p className="mt-2 text-xs text-gray-500 text-center">Instagram and TikTok have no web share button — copy, then paste into your post.</p>
      </div>
    </div>
  );
}
