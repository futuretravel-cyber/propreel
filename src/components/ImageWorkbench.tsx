import { useRef, useState } from 'react';
import { Camera, Download, Loader2, RefreshCw, Zap } from 'lucide-react';
import { useImageEdit } from '../lib/useImageEdit';
import { useRenderProgress, TYPICAL_IMAGE_EDIT_SECONDS } from '../lib/useRenderProgress';
import RenderProgressBar from './RenderProgressBar';
import { useCredit } from '../context/AuthContext';
import { useStudioDraft, studioDraftKey, dataUrlToFile } from '../lib/studioDrafts';
import { useUploadWait } from '../lib/api';

interface ImageWorkbenchProps {
  presetId: string;
  /** Stable per-panel slot so the upload survives reloads (presetId alone
   * changes when the user switches presets, which would drop the draft) */
  draftSlot: string;
  strength?: number;
  guidanceScale?: number;
  customPrompt?: string;
  ctaLabel: string;
  emptyHint: string;
  accept?: string;
}

/**
 * Upload → render → before/after workbench shared by all four image tools.
 * Renders via Modal (fal-ai/flux/dev/image-to-image) and deducts 2 credits.
 */
export default function ImageWorkbench({ presetId, draftSlot, strength, guidanceScale, customPrompt, ctaLabel, emptyHint, accept = 'image/*' }: ImageWorkbenchProps) {
  const { user } = useCredit() as any;
  // The picked image and its render result persist across full page reloads —
  // `file` is rebuilt from the restored data URL on demand (it's not
  // structured-serialisable in a way we can rely on across sessions).
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useStudioDraft<string | null>(studioDraftKey(user?.id, `workbench:${draftSlot}:preview`), null);
  const [resultUrl, setResultUrl] = useStudioDraft<string | null>(studioDraftKey(user?.id, `workbench:${draftSlot}:result`), null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { edit, busy, stage, error, setError } = useImageEdit();
  const uploadWait = useUploadWait();
  // Elapsed-vs-typical progress for the ~30s FLUX edit
  const editProgress = useRenderProgress(TYPICAL_IMAGE_EDIT_SECONDS);

  const pick = (f: File | null) => {
    if (!f) return;
    // Some Windows files carry an empty/odd MIME type — fall back to extension
    const looksImage = f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif|bmp|gif)$/i.test(f.name);
    if (!looksImage) { setError('Please upload an image file'); return; }
    if (f.size > 25 * 1024 * 1024) { setError('Image must be under 25MB'); return; }
    setFile(f);
    setResultUrl(null);
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const run = async () => {
    // After a reload only the data URL survived — rebuild the File for upload
    let f = file;
    if (!f && preview) {
      try {
        f = await dataUrlToFile(preview);
        setFile(f);
      } catch { return; }
    }
    if (!f) return;
    editProgress.start();
    try {
      const res = await edit({ file: f, presetId, strength, guidanceScale, customPrompt });
      if (res) setResultUrl(res.imageUrl);
    } finally {
      editProgress.stop();
    }
  };

  const stageLabel = stage === 'uploading' ? (uploadWait != null ? `Upload limit reached — retrying in ${uploadWait}s…` : 'Uploading image…')
    : stage === 'deducting' ? 'Reserving credits…'
    : stage === 'rendering' ? 'AI is working…'
    : '';

  return (
    <div className="space-y-4">
      {!preview ? (
        <>
          {/* The input lives OUTSIDE the clickable zone: nesting it inside
              re-dispatches its click back up to the zone's handler, which
              some browsers swallow (button appears dead). */}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
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
            aria-label="Upload image"
          >
            <Camera className="w-8 h-8 text-ink-400 mx-auto mb-2" />
            <p className="text-ink-400 text-sm">Drop image here or click to upload</p>
            <p className="text-ink-500 text-xs mt-1">{emptyHint}</p>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-ink-400 mb-1.5 font-medium">Before</p>
            <div className="relative">
              <img src={preview} alt="Original" className="w-full aspect-square object-cover rounded-xl border border-white/10" />
              {/* The image stays exactly where it is (survives tab switches)
                  until the user removes it or the render finishes */}
              <button
                onClick={() => { setFile(null); setPreview(null); setResultUrl(null); setError(null); }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-600 transition"
                aria-label="Remove image"
                disabled={busy}
              >
                ✕
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs text-ink-400 mb-1.5 font-medium">After</p>
            {resultUrl ? (
              <img src={resultUrl} alt="AI result" className="w-full aspect-square object-cover rounded-xl border border-purple-500/30" />
            ) : (
              <div className="w-full aspect-square rounded-xl border border-dashed border-white/10 flex items-center justify-center text-ink-500 text-xs">
                {busy ? <Loader2 className="w-5 h-5 animate-spin text-purple-400" /> : 'Awaiting render'}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-sm text-red-300 flex items-start justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-red-400 hover:text-red-300 min-h-[24px] min-w-[24px]">×</button>
        </div>
      )}

      {preview && (
        <div className="flex gap-3">
          <button onClick={run} disabled={busy} className="btn btn-primary flex-1 min-h-[48px]">
            {busy ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {stageLabel}</>
            ) : (
              <><Zap className="w-4 h-4" /> {ctaLabel}</>
            )}
          </button>
          <RenderProgressBar
            progress={editProgress}
            stage={stage === 'rendering' ? 'processing' : stage === 'uploading' ? 'queued' : ''}
            label="Editing your image"
          />
          {resultUrl && (
            <>
              <a href={resultUrl} target="_blank" rel="noopener" className="btn btn-secondary min-h-[48px]">
                <Download className="w-4 h-4" /> Download
              </a>
              <button onClick={() => { setResultUrl(null); }} className="btn btn-ghost min-h-[48px]" aria-label="Re-render">
                <RefreshCw className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
