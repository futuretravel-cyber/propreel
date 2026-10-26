import { useRef, useState } from 'react';
import { Camera, Download, Loader2, RefreshCw, Zap } from 'lucide-react';
import { useImageEdit } from '../lib/useImageEdit';
import { useRenderProgress, TYPICAL_IMAGE_EDIT_SECONDS } from '../lib/useRenderProgress';
import RenderProgressBar from './RenderProgressBar';
import { useCredit } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useStudioDraft, studioDraftKey, dataUrlToFile } from '../lib/studioDrafts';
import { useUploadWait } from '../lib/api';
import { guardAIRender } from '../lib/aiDisclaimer';
import { downloadRemoteFile } from '../lib/utils';
import { RETENTION_DAYS } from '../lib/constants';
import { IMAGE_EDIT_CREDITS, STAGING_EDIT_CREDITS, isStagingPreset } from '../../lib/renderPricing';
import CostHeader from './CostHeader';
import { creditListZar } from '../lib/utils';

interface BatchItem {
  file: File;
  preview: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  resultUrl?: string;
  error?: string;
}

/** Agents shoot ~20 photos per listing (audit §7) — one queue entry per
 *  photo, same preset, run sequentially through the same per-photo
 *  charge/refund pipeline as the single-photo flow. */
const BATCH_LIMIT = 20;

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
 * Renders via Modal (openai/gpt-image-2.5/flare/edit) and deducts 2 credits
 * (every category — staging included — prices at the base edit rate).
 */
export default function ImageWorkbench({ presetId, draftSlot, strength, guidanceScale, customPrompt, ctaLabel, emptyHint, accept = 'image/*' }: ImageWorkbenchProps) {
  const { user } = useCredit() as any;
  const confirm = useConfirm();
  // The picked image and its render result persist across full page reloads —
  // `file` is rebuilt from the restored data URL on demand (it's not
  // structured-serialisable in a way we can rely on across sessions).
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useStudioDraft<string | null>(studioDraftKey(user?.id, `workbench:${draftSlot}:preview`), null);
  const [resultUrl, setResultUrl] = useStudioDraft<string | null>(studioDraftKey(user?.id, `workbench:${draftSlot}:result`), null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Batch mode (audit §7): queue the same preset across many photos.
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const unitCost = isStagingPreset(presetId) ? STAGING_EDIT_CREDITS : IMAGE_EDIT_CREDITS;
  const { edit, busy, stage, error, setError } = useImageEdit();
  const uploadWait = useUploadWait();
  // Every image tool renders whole-photo since 2026-10-16: Virtual Staging
  // moved to gpt-image-2.5/flare — the same maskless single call Furniture
  // Removal uses — so there is nothing to paint. The brush overlay, its
  // tutorial and the mask upload went with the masking feature
  // (useBrushMask.ts and ModalMaskTutorial.tsx deleted).
  // Elapsed-vs-typical progress for the ~30s flare edit
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

  const addBatchFiles = (list: FileList | null) => {
    if (!list || !list.length) return;
    const room = BATCH_LIMIT - batch.length;
    if (room <= 0) { setError(`Up to ${BATCH_LIMIT} photos per batch`); return; }
    const accepted: BatchItem[] = [];
    for (const f of Array.from(list).slice(0, room)) {
      const looksImage = f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif|bmp|gif)$/i.test(f.name);
      if (!looksImage || f.size > 25 * 1024 * 1024) continue;
      accepted.push({ file: f, preview: URL.createObjectURL(f), status: 'queued' });
    }
    if (accepted.length) setBatch(prev => [...prev, ...accepted]);
  };

  // Sequential on purpose: one render at a time keeps Modal pressure sane and
  // preserves the per-photo credit check/refund semantics inside edit().
  const runBatch = async () => {
    setBatchRunning(true);
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      if (item.status === 'done') continue;
      const patch = (p: Partial<BatchItem>) =>
        setBatch(prev => prev.map((b, idx) => (idx === i ? { ...b, ...p } : b)));
      patch({ status: 'running', error: undefined });
      try {
        const res = await edit({ file: item.file, presetId, strength, guidanceScale, customPrompt });
        if (res) patch({ status: 'done', resultUrl: res.imageUrl });
        else patch({ status: 'failed', error: 'Render failed' });
      } catch (e: any) {
        patch({ status: 'failed', error: e?.message || 'Render failed' });
      }
    }
    setBatchRunning(false);
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
              <a href={preview || undefined} target="_blank" rel="noopener" title="Open full size" className="block">
                <img src={preview} alt="Original" className="w-full h-auto rounded-xl border border-white/10" />
              </a>
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

      {preview && (
        <div className="space-y-3">
          <CostHeader
            costCredits={unitCost}
            costLabel={isStagingPreset(presetId) ? 'Virtual staging render' : 'Image edit render'}
            chargedWhen="Charged when the render starts · refunded automatically if it fails · one credit = R1,50"
            randValue={creditListZar(unitCost)}
          />

          <div className="flex gap-3">
            {/* Paid action: disclose cost + balance before spending, the
                same pattern as the AI Write confirmation. */}
            <button
              onClick={() => {
                const balance = user?.credits ?? 0;
                confirm(
                  `This render costs ${unitCost} credits.\n\nYou have ${balance} credit${balance === 1 ? '' : 's'}. A failed render is refunded automatically.\n\nGenerate now?`,
                  { title: 'Generate image?', confirmLabel: 'Generate' },
                ).then((ok) => {
                  if (ok) void guardAIRender(run);
                });
              }}
              disabled={busy}
              className="btn btn-primary flex-1 min-h-[48px]"
            >
              {busy ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {stageLabel}</>
              ) : (
                <><Zap className="w-4 h-4" /> {ctaLabel}</>
              )}
            </button>
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
          <p className="text-xs text-ink-500">
            Your balance: <span className="text-white font-semibold tabular-nums">{user?.credits ?? 0} ⚡</span> · {unitCost} ⚡ is charged when the render starts.
          </p>
          {/* Own row: as a flex sibling the bar was squeezed into whatever
              width the buttons left, so the progress read as a thin stripe. */}
          <RenderProgressBar
            progress={editProgress}
            stage={stage === 'rendering' ? 'processing' : stage === 'uploading' ? 'queued' : ''}
            label="Editing your image"
          />
          {resultUrl && (
            <p className="text-xs text-ink-500 text-center">
              Edited images are kept for {RETENTION_DAYS} days — download the ones you want to keep.
            </p>
          )}
        </div>
      )}

      {/* ── Batch mode (audit §7): the same preset across many photos ──────
          One queue entry per photo, run one at a time through the same
          per-photo charge/refund pipeline as the single-photo flow above. */}
      <div className="rounded-xl border border-white/10 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-white">Batch edit</p>
            <p className="text-xs text-ink-500">Apply this preset to up to {BATCH_LIMIT} photos — ⚡{unitCost} credits each, charged per photo as it renders.</p>
          </div>
          <div className="flex gap-2">
            <input
              ref={batchInputRef}
              type="file"
              accept={accept}
              multiple
              className="sr-only"
              onChange={e => { addBatchFiles(e.target.files); e.target.value = ''; }}
            />
            <button onClick={() => batchInputRef.current?.click()} disabled={batchRunning} className="btn btn-secondary text-sm min-h-[40px]">
              Add photos
            </button>
            {batch.length > 0 && (
              <button
                onClick={() => {
                  const n = batch.filter(b => b.status !== 'done').length;
                  const total = unitCost * n;
                  confirm(
                    `This batch renders ${n} photo${n === 1 ? '' : 's'} at ${unitCost} credits each — ${total} credits total${n > 1 ? ', charged per photo as each one renders' : ''}.\n\nYou have ${user?.credits ?? 0} credits. Failed renders are refunded automatically.\n\nRun batch?`,
                    { title: 'Run batch?', confirmLabel: 'Run batch' },
                  ).then((ok) => {
                    if (ok) void guardAIRender(runBatch);
                  });
                }}
                disabled={batchRunning || batch.every(b => b.status === 'done')}
                className="btn btn-primary text-sm min-h-[40px]"
              >
                {batchRunning ? <><Loader2 className="w-4 h-4 animate-spin" /> Running batch…</> : <><Zap className="w-4 h-4" /> Run batch · ⚡{unitCost * batch.filter(b => b.status !== 'done').length}</>}
              </button>
            )}
          </div>
        </div>
        {batch.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {batch.map((item, i) => (
              <div key={`${item.file.name}-${i}`} className="rounded-lg border border-white/10 overflow-hidden bg-ink-900/60">
                <div className="relative">
                  <img src={item.resultUrl || item.preview} alt={item.file.name} className="w-full aspect-square object-cover" />
                  {item.status === 'running' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-300" />
                    </div>
                  )}
                  <button
                    onClick={() => setBatch(prev => prev.filter((_, idx) => idx !== i))}
                    disabled={batchRunning || item.status === 'running'}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-600 transition disabled:opacity-40"
                    aria-label={`Remove ${item.file.name} from batch`}
                  >
                    ✕
                  </button>
                </div>
                <div className="p-2">
                  <p className="text-[10px] text-ink-400 truncate" title={item.file.name}>{item.file.name}</p>
                  <p className={`text-[10px] flex items-center gap-1 ${item.status === 'done' ? 'text-green-400' : item.status === 'failed' ? 'text-red-400' : item.status === 'running' ? 'text-purple-300' : 'text-ink-500'}`}>
                    {item.status === 'done' ? 'Done' : item.status === 'failed' ? (item.error || 'Failed') : item.status === 'running' ? 'Rendering…' : 'Queued'}
                  </p>
                  {item.resultUrl && (
                    <button
                      onClick={() => downloadRemoteFile(item.resultUrl!).catch(() => window.open(item.resultUrl!, '_blank', 'noopener'))}
                      className="mt-1 w-full btn btn-ghost text-[10px] px-2 py-1"
                    >
                      <Download className="w-3 h-3" /> Download
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {batch.length > 0 && (
          <p className="text-xs text-ink-500">
            {batch.filter(b => b.status === 'done').length} done · {batch.filter(b => b.status === 'failed').length} failed · {batch.filter(b => b.status === 'queued').length} queued — edited images are kept for {RETENTION_DAYS} days.
          </p>
        )}
      </div>
    </div>
  );
}
