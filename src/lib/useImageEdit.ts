import { useCallback, useState } from 'react';
import { falEditImage, type EditProgress } from './falImage';
import { jobHeaders } from './workerAuth';
import { useCredit } from '../context/AuthContext';
import { track } from './analytics';
import { PropReelAPI } from './api';
import { IMAGE_PRESETS } from './imagePrompts';
import { playRenderComplete } from './renderSound';

import { IMAGE_EDIT_CREDITS as IMAGE_EDIT_COST, STAGING_EDIT_CREDITS, isStagingPreset } from '../../lib/renderPricing';

type Stage = 'idle' | 'uploading' | 'deducting' | 'rendering' | 'done';

/**
 * Shared pipeline for all four image tools (Photo Editor, Staging, Removal,
 * Twilight): S3 upload → 2-credit atomic deduction → Modal /edit_image →
 * result URL. Failed renders refund the 2 credits automatically.
 */
export function useImageEdit() {
  const { refundCredits, user, refresh } = useCredit() as any;
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  // Live removal progress (gate leftovers, sweeps, engine passes). Kept after
  // the edit finishes so the panel can show the verdict it ended on, and
  // cleared when the next edit starts.
  const [progress, setProgress] = useState<EditProgress | null>(null);

  /** Price for this render: brush-masked staging presets run Fill Pro
   *  (4 credits); removal and every other preset are the base 2-credit
   *  edit. Mirrors jobCredits(). */
  const costFor = (presetId?: string) =>
    isStagingPreset(presetId) ? STAGING_EDIT_CREDITS : IMAGE_EDIT_COST;

  const edit = useCallback(async (opts: {
    file: File;
    presetId: string;
    strength?: number;
    guidanceScale?: number;
    customPrompt?: string;
    maskFile?: File | null; // brush mask (staging) → Fill Pro path
  }): Promise<{ imageUrl: string } | null> => {
    setError(null);
    setProgress(null);

    if (!user) {
      setError('You must be signed in');
      return null;
    }
    if (((user as any).credits ?? 0) < costFor(opts.presetId)) {
      setError(`Not enough credits — this render costs ${costFor(opts.presetId)} credits. Recharge from your dashboard.`);
      return null;
    }

    // 1) Presigned upload: browser → S3 (propreel-raw-assets/uploads/…),
    //    then server-side verification (magic bytes + size) before we spend
    //    any credits on the edit itself.
    setStage('uploading');
    let publicUrl: string;
    try {
      publicUrl = await PropReelAPI.uploadImageFile(user.id, opts.file);
    } catch (e: any) {
      setError(e.message || 'Upload failed');
      setStage('idle');
      return null;
    }

    // 1b) Optional paint-mask: brush overlay exported as a white-on-black
    //     PNG, uploaded to the raw bucket (uploads/ prefix, presigned like
    //     the photo). Presence of mask_url switches the worker to the
    //     anchored Fill Pro two-call staging path.
    let maskUrl: string | undefined;
    if (opts.maskFile) {
      try {
        maskUrl = await PropReelAPI.uploadImageFile(user.id, opts.maskFile);
      } catch (e: any) {
        setError(e.message || 'Mask upload failed');
        setStage('idle');
        return null;
      }
    }

    // 2) Pay at mint: ?action=job_token charges the 2 credits server-side
    //    (price lives in lib/renderPricing) and returns the single-use token
    //    the worker demands before it starts an edit job.
    setStage('deducting');
    let jobToken: Record<string, string>;
    try {
      jobToken = await jobHeaders('edit', {
        presetId: opts.presetId,
        metadata: { kind: 'IMAGE_EDIT', presetId: opts.presetId },
      });
      void refresh();
    } catch (e: any) {
      setError(e?.message || 'Could not charge credits — check your balance and try again');
      setStage('idle');
      return null;
    }

    // 3) Render via Modal (fal-ai/flux/dev/image-to-image)
    setStage('rendering');
    try {
      const result = await falEditImage({
        imageUrl: publicUrl,
        presetId: opts.presetId,
        strength: opts.strength,
        guidanceScale: opts.guidanceScale,
        customPrompt: opts.customPrompt,
        maskUrl,
      }, jobToken, setProgress);
      track('render_completed', { kind: 'IMAGE_EDIT', presetId: opts.presetId });
      playRenderComplete();
      // Store the output in My Projects (kind: IMAGE) so every Photo Editor /
      // Staging / Removal / Twilight render has a home. Best-effort: the edit
      // itself already succeeded, so a failed row write must not surface.
      try {
        const preset = IMAGE_PRESETS.find(p => p.id === opts.presetId);
        const base = opts.file.name.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
        await PropReelAPI.createProject({
          userId: user.id,
          title: `${preset?.label || 'Image edit'}${base ? ` — ${base}` : ''}`.slice(0, 120),
          kind: 'IMAGE',
          status: 'READY',
          thumbnailUrl: result.imageUrl,
          tags: [opts.presetId],
          description: opts.customPrompt || preset?.label || '',
        } as any);
      } catch { /* non-fatal — the image edit itself succeeded */ }
      setStage('done');
      return { imageUrl: result.imageUrl };
    } catch (e: any) {
      // Failed renders auto-refund (spec: refund within 60s)
      await refundCredits('edit').catch(() => {});
      setError(e.message || 'Render failed — your 2 credits were refunded');
      setStage('idle');
      return null;
    }
  }, [user, refundCredits, refresh]);

  return { edit, stage, error, setError, progress, busy: stage === 'uploading' || stage === 'deducting' || stage === 'rendering' };
}
