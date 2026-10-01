import { useRef, useState } from 'react';
import { Camera, Download, Loader2, RefreshCw, User, Video, Zap, Check, AlertCircle, Sparkles } from 'lucide-react';
import { useFlashHead } from '../lib/useFlashHead';
import { useCredit } from '../context/AuthContext';

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
  const { generate, busy, stage, error, setError, cost } = useFlashHead();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [script, setScript] = useState(initialScript);
  const [voice, setVoice] = useState('Aria');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the shared Studio script in sync (the Video tab reads from it)
  const updateScript = (text: string) => {
    setScript(text);
    onScriptChange?.(text);
  };

  const pick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please upload an image file'); return; }
    if (f.size > 25 * 1024 * 1024) { setError('Image must be under 25MB'); return; }
    setFile(f);
    setResultUrl(null);
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const run = async () => {
    if (!file || !script.trim()) return;
    const res = await generate({ file, voiceoverText: script, voice });
    if (res) {
      setResultUrl(res.videoUrl);
      onVideoGenerated?.(res.videoUrl);
    }
  };

  const stageLabel = stage === 'uploading' ? 'Uploading profile picture…'
    : stage === 'deducting' ? 'Reserving credits…'
    : stage === 'rendering' ? 'AI is generating your lip-sync video — typically 1–3 minutes…'
    : '';

  const canRun = !!file && !!script.trim() && !busy && (user?.credits ?? 0) >= cost;

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
            <div
              className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-purple-500/30 transition cursor-pointer"
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
              aria-label="Upload profile picture"
            >
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0] || null)} />
              <User className="w-8 h-8 text-ink-400 mx-auto mb-2" />
              <p className="text-ink-400 text-sm">Drop a headshot here or click to upload</p>
              <p className="text-ink-500 text-xs mt-1">Front-facing portrait, good lighting — JPEG/PNG up to 25MB</p>
            </div>
          ) : (
            <div className="relative">
              <img src={preview} alt="Profile" className="w-full max-w-[280px] aspect-square object-cover rounded-xl border border-white/10" />
              <button onClick={() => { setFile(null); setPreview(null); setResultUrl(null); }} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80" aria-label="Remove image">✕</button>
            </div>
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
        {!busy && !canRun && (
          <p className="text-xs text-ink-500 text-center">
            {!file && 'Upload your profile picture • '}
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

      {/* How it works */}
      <div className="bg-ink-800/50 rounded-xl p-4">
        <h4 className="font-semibold text-white text-sm mb-2 flex items-center gap-2"><Camera className="w-4 h-4 text-purple-400" /> How it works</h4>
        <ol className="space-y-1.5 text-xs text-ink-300">
          <li>1. Your headshot and script go to FlashHead (fal-ai/flashhead) via our secure render worker</li>
          <li>2. The AI generates a lip-synced talking-head video speaking your script</li>
          <li>3. The finished MP4 is stored in AWS S3 and stays available for download</li>
          <li>4. Use it standalone or attach it in the Video Generator tab's "AI Talking Profile" option</li>
        </ol>
      </div>
    </div>
  );
}
