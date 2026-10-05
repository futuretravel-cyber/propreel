import { useRef, useState } from 'react';
import { Camera, Download, Loader2, RefreshCw, User, Video, Zap, Check, AlertCircle, Sparkles } from 'lucide-react';
import { useFlashHead } from '../lib/useFlashHead';
import { useCredit } from '../context/AuthContext';
import { useRenderProgress, typicalFlashheadSeconds } from '../lib/useRenderProgress';
import RenderProgressBar from './RenderProgressBar';

const VOICES = [
  { id: 'Aria', label: 'Aria (female, warm)' },
  { id: 'Sarah', label: 'Sarah (female, professional)' },
  { id: 'Laura', label: 'Laura (female, upbeat)' },
  { id: 'Charlotte', label: 'Charlotte (female, friendly)' },
  { id: 'Roger', label: 'Roger (male, confident)' },
  { id: 'George', label: 'George (male, warm)' },
  { id: 'Brian', label: 'Brian (male, deep)' },
];

interface FlashHeadVideoProps {
  /** Pre-fill from the Video tab's AI-generated script (shared Studio state) */
  initialScript?: string;
  /** Two-way sync: edits here update the shared script for the Video tab too */
  onScriptChange?: (script: string) => void;
  /** Notify parent (Video tab) when a talking-head video is ready */
  onVideoGenerated?: (videoUrl: string) => void;
}

/**
 * FlashHead Studio tab: lip-synced talking-head video from the agent's
 * profile picture + the AI-generated voiceover script. 8 credits.
 */
export default function FlashHeadVideo({ initialScript = '', onScriptChange, onVideoGenerated }: FlashHeadVideoProps) {
  const { user } = useCredit() as any;
  const { generate, busy, stage, error, setError, jobStatus, cost } = useFlashHead();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Set when the render uses the already-hosted branding photo instead of a
  // fresh upload (no file travels through the browser — the worker fetches
  // the URL directly)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  // Current profile image from Agent Branding (default profile first), with
  // the account avatar as fallback
  const profiles: any[] = user?.agentProfiles || [];
  const brandingPhoto: string | null =
    profiles.find(p => p?.isDefault)?.photoUrl ||
    profiles.find(p => p?.photoUrl)?.photoUrl ||
    user?.avatarUrl ||
    null;
  const [dragging, setDragging] = useState(false);
  const [script, setScript] = useState(initialScript);
  const [voice, setVoice] = useState('Aria');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Elapsed-vs-typical progress: typical scales with the script length
  const scriptWords = script.trim() ? script.trim().split(/\s+/).length : 0;
  const progress = useRenderProgress(typicalFlashheadSeconds(scriptWords));

  // Keep the shared Studio script in sync (the Video tab reads from it)
  const updateScript = (text: string) => {
    setScript(text);
    onScriptChange?.(text);
  };

  const pick = (f: File | null) => {
    if (!f) return;
    const looksImage = f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif|bmp|gif)$/i.test(f.name);
    if (!looksImage) { setError('Please upload an image file'); return; }
    if (f.size > 25 * 1024 * 1024) { setError('Image must be under 25MB'); return; }
    setFile(f);
    setSourceUrl(null);
    setResultUrl(null);
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  // Use the agent's current branding profile image instead of uploading one
  const useBrandingPhoto = () => {
    if (!brandingPhoto) return;
    setFile(null);
    setSourceUrl(brandingPhoto);
    setPreview(brandingPhoto);
    setResultUrl(null);
    setError(null);
  };

  const run = async () => {
    if ((!file && !sourceUrl) || !script.trim()) return;
    progress.start();
    try {
      const res = await generate({ file: file ?? undefined, imageUrl: sourceUrl ?? undefined, voiceoverText: script, voice });
      if (res) {
        setResultUrl(res.videoUrl);
        onVideoGenerated?.(res.videoUrl);
      }
    } finally {
      progress.stop();
    }
  };

  const stageLabel = stage === 'uploading' ? 'Uploading profile picture…'
    : stage === 'deducting' ? 'Reserving credits…'
    : stage === 'rendering' ? 'AI is generating your lip-sync video…'
    : '';

  const canRun = (!!file || !!sourceUrl) && !!script.trim() && !busy && (user?.credits ?? 0) >= cost;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Video className="w-5 h-5 text-purple-400" /> AI Talking Head (FlashHead)</h2>
      <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
        <p className="text-xs text-purple-200 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Each talking-head render costs {cost} credits — failed renders are refunded automatically
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile picture upload */}
        <div>
          <label className="label">Your profile picture</label>
          {!preview ? (
            <>
              {/* Kept outside the clickable zone — see ImageWorkbench */}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={e => { pick(e.target.files?.[0] || null); e.target.value = ''; }}
              />
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition cursor-pointer ${dragging ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 hover:border-purple-500/30'}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragging(false);
                  pick(e.dataTransfer.files?.[0] || null);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
                aria-label="Upload profile picture"
              >
                <User className="w-8 h-8 text-ink-400 mx-auto mb-2" />
                <p className="text-ink-400 text-sm">Drop a headshot here or click to upload</p>
                <p className="text-ink-500 text-xs mt-1">Front-facing portrait, good lighting — JPEG/PNG up to 25MB</p>
              </div>
              {brandingPhoto && (
                <button
                  type="button"
                  onClick={useBrandingPhoto}
                  className="btn btn-secondary w-full mt-3 text-sm"
                  title={brandingPhoto}
                >
                  <User className="w-4 h-4" /> Use my branding profile image
                </button>
              )}
            </>
          ) : (
            <>
              <div className="relative">
                <img src={preview} alt="Profile" className="w-full max-w-[280px] aspect-square object-cover rounded-xl border border-white/10" />
                <button onClick={() => { setFile(null); setSourceUrl(null); setPreview(null); setResultUrl(null); }} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80" aria-label="Remove image">✕</button>
              </div>
              {sourceUrl && (
                <p className="text-xs text-ink-500 mt-1">Using your branding profile image — remove it to upload a different photo.</p>
              )}
            </>
          )}
        </div>

        {/* Script + voice */}
        <div className="space-y-4">
          <div>
            <label className="label">Voiceover script <span className="text-ink-500 text-xs">(the AI-generated script from the Video tab is pre-filled — edit freely; the Video tab stays in sync)</span></label>
            <textarea
              className="input min-h-[140px]"
              value={script}
              onChange={e => updateScript(e.target.value)}
              placeholder="Welcome to this stunning family home in Constantia…"
            />
            <p className="text-xs text-ink-500 mt-1">{script.trim() ? `${script.trim().split(/\s+/).length} words` : 'FlashHead speaks this text with your face'}</p>
          </div>
          <div>
            <label className="label">Voice</label>
            <select className="input" value={voice} onChange={e => setVoice(e.target.value)}>
              {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Generate */}
      <div className="space-y-3">
        <button onClick={run} disabled={!canRun} className="btn btn-primary w-full text-lg py-4">
          {busy ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> {stageLabel || 'Working…'}</>
          ) : resultUrl ? (
            <><RefreshCw className="w-5 h-5" /> Regenerate ({cost} credits)</>
          ) : (
            <><Sparkles className="w-5 h-5" /> Generate Talking-Head Video ({cost} credits)</>
          )}
        </button>
        <RenderProgressBar
          progress={progress}
          stage={stage === 'rendering' ? (jobStatus === 'processing' ? 'processing' : 'queued') : ''}
          label="Generating your talking-head video"
        />
        {!busy && !canRun && (
          <p className="text-xs text-ink-500 text-center">
            {!file && !sourceUrl && 'Upload your profile picture • '}
            {!script.trim() && 'Add a voiceover script • '}
            {(user?.credits ?? 0) < cost && `Need ${cost} credits (you have ${user?.credits ?? 0})`}
          </p>
        )}
        {error && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}
      </div>

      {/* Result */}
      {resultUrl && (
        <div className="card-dark p-4">
          <p className="text-sm text-green-400 flex items-center gap-2 mb-3"><Check className="w-4 h-4" /> Talking-head video ready — stored in your AWS library</p>
          <div className="max-w-md mx-auto rounded-xl overflow-hidden bg-black">
            <video src={resultUrl} controls playsInline className="w-full aspect-square" />
          </div>
          <div className="flex gap-3 mt-3 justify-center">
            <a href={resultUrl} download="propreel-talking-head.mp4" className="btn btn-secondary text-sm"><Download className="w-4 h-4" /> Download</a>
          </div>
        </div>
      )}

    </div>
  );
}
