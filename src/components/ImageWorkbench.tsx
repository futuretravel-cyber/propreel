import { useEffect, useRef, useState } from 'react';
import { Brush, Eraser, Camera, Download, Loader2, RefreshCw, Zap } from 'lucide-react';
import { useImageEdit } from '../lib/useImageEdit';
import { useRenderProgress, TYPICAL_IMAGE_EDIT_SECONDS } from '../lib/useRenderProgress';
import RenderProgressBar from './RenderProgressBar';
import { useCredit } from '../context/AuthContext';
import { useStudioDraft, studioDraftKey, dataUrlToFile } from '../lib/studioDrafts';
import { useUploadWait } from '../lib/api';
import { guardAIRender } from '../lib/aiDisclaimer';
import { downloadRemoteFile } from '../lib/utils';
import { useBrushMask } from '../lib/useBrushMask';
import MaskTutorial from './ModalMaskTutorial';

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
  // Brush mask (staging presets only): paint over furniture to replace.
  const isStaging = ['luxury_modern', 'scandinavian_minimal', 'coastal_relaxed',
    'family_comfortable', 'luxury_bedroom', 'home_office', 'industrial_loft'].includes(presetId);
  // The mask tutorial plays EVERY time the staging tab is entered (or the
  // draft first appears) — small enough that it teaches without blocking.
  const [tutorialOpen, setTutorialOpen] = useState(false);
  useEffect(() => {
    if (preview && isStaging) setTutorialOpen(true);
    else setTutorialOpen(false);
    // Intentionally re-arms whenever the photo changes: a new photo = a fresh
    // surface to paint on, so a new popup is wanted.
  }, [preview, isStaging]);
  const mask = useBrushMask(isStaging && !!preview);
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
      const maskFile = isStaging ? mask.exportMaskFile() : null;
      if (isStaging && !maskFile) {
        setError('Paint over the furniture you want replaced before generating — everything you leave unpainted is locked.');
        editProgress.stop();
        return;
      }
      const res = await edit({ file: f, presetId, strength, guidanceScale, customPrompt, maskFile });
      if (res) setResultUrl(res.imageUrl);
    } finally {
      editProgress.stop();
    }
  };

  const stageLabel = stage === 'uploading' ? (uploadWait != null ? `Upload limit reached — retrying in ${uploadWait}s…` : 'Uploading image…')
    : stage === 'deducting' ? 'Reserving credits…'
    : stage === 'rendering' ? 'AI is working…'
    : '';

  // See downloadRemoteFile: a cross-origin <a download> opens a tab instead
  // of saving (the attribute is ignored cross-origin), so we fetch → blob →
  // same-origin object URL, which every browser downloads.
  const downloadResult = async () => {
    if (!resultUrl) return;
    try {
      await downloadRemoteFile(resultUrl);
    } catch {
      // CORS or network edge cases — degrade to the old open-in-tab flow
      window.open(resultUrl, '_blank', 'noopener');
    }
  };

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
              {/* Natural aspect, full width: the whole photo stays visible —
                  the old aspect-square + object-cover cropped landscape shots
                  and upscaled them (cut off + soft). Click opens full size. */}
              {isStaging ? (
                /* Mask editor: the photo sits under a translucent overlay
                   canvas; purple-white strokes mark what gets replaced.
                   Everything NOT painted stays pixel-locked (Fill Pro
                   constrains the edit to the mask). The canvas backing store
                   is sized to the photo's real pixels inside useBrushMask and
                   pointer coords are mapped through the live layout rect —
                   strokes land exactly under the cursor on any aspect. */
                <div
                  className="relative"
                  onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); mask.stroke(e); }}
                  onPointerMove={e => {
                    if (e.buttons === 1) mask.stroke(e);
                    else mask.track(e);
                  }}
                  onPointerUp={() => mask.endStroke()}
                  onPointerCancel={() => mask.endStroke()}
                  onPointerLeave={() => { mask.endStroke(); mask.hideCursor(); }}
                  style={{ touchAction: 'none' }}
                >
                  <img ref={mask.drawImageRef} src={preview} alt="Original" className="w-full h-auto rounded-xl border border-white/10 pointer-events-none select-none" draggable={false} />
                  {/* Off-screen export twin: same strokes, white on black —
                      purple is screen-only (brand theme), the mask file the
                      worker receives stays strictly white-on-black. */}
                  <canvas
                    ref={mask.bindExportCanvas}
                    width={2}
                    height={2}
                    className="hidden"
                    aria-hidden="true"
                  />
                  <canvas
                    ref={mask.bindCanvas}
                    className="absolute inset-0 w-full h-full cursor-crosshair rounded-xl"
                    style={{ mixBlendMode: 'screen', opacity: 0.55 }}
                    aria-label="Mask painter — paint over the furniture you want replaced"
                  />
                  {mask.cursor && (
                    /* Live brush footprint ring — shows exactly what a stroke
                       will cover before you click. */
                    <div
                      className="absolute rounded-full ring-2 ring-purple-400/95 bg-purple-500/30 pointer-events-none mix-blend-screen"
                      style={{
                        width: `${mask.brushPct}%`,
                        aspectRatio: '1 / 1',
                        maxWidth: '14%',
                        maxHeight: '14%',
                        left: `${mask.cursor.xPct}%`,
                        top: `${mask.cursor.yPct}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                  )}
                </div>
              ) : (
              <a href={preview || undefined} target="_blank" rel="noopener" title="Open full size" className="block">
                <img src={preview} alt="Original" className="w-full h-auto rounded-xl border border-white/10" />
              </a>
              )}
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
              <a href={resultUrl} target="_blank" rel="noopener" title="Open full size" className="block">
                <img src={resultUrl} alt="AI result" className="w-full h-auto rounded-xl border border-purple-500/30" />
              </a>
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

      {preview && isStaging && (
        <div className="rounded-lg bg-purple-950/40 border border-purple-500/25 px-3 py-2">
          <MaskTutorial
            photoSrc={preview}
            variant="hint"
            hasStrokes={mask.hasStrokes}
            onClearStrokes={mask.clear}
            busy={busy}
          />
        </div>
      )}

      {preview && isStaging && tutorialOpen && (
        <MaskTutorial
          photoSrc={preview}
          hasStrokes={mask.hasStrokes}
          onClearStrokes={mask.clear}
          onClose={() => setTutorialOpen(false)}
        />
      )}

      {preview && (
        <div className="flex gap-3">
            <button onClick={() => guardAIRender(run)} disabled={busy || (isStaging && !mask.hasStrokes)} className="btn btn-primary flex-1 min-h-[48px]">
            {busy ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {stageLabel}</>
            ) : (
              <><Zap className="w-4 h-4" /> {isStaging && !mask.hasStrokes ? 'Paint the mask to enable' : ctaLabel}</>
            )}
          </button>
          <RenderProgressBar
            progress={editProgress}
            stage={stage === 'rendering' ? 'processing' : stage === 'uploading' ? 'queued' : ''}
            label="Editing your image"
          />
          {resultUrl && (
            <>
              <button onClick={() => downloadResult()} className="btn btn-secondary min-h-[48px]">
                <Download className="w-4 h-4" /> Download
              </button>
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
