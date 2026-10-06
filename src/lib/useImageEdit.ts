import { useCallback, useState } from 'react';
import { falEditImage } from './falImage';
import { jobHeaders } from './workerAuth';
import { useCredit } from '../context/AuthContext';
import { track } from './analytics';
import { PropReelAPI } from './api';
import { IMAGE_PRESETS } from './imagePrompts';

import { IMAGE_EDIT_CREDITS as IMAGE_EDIT_COST } from '../../lib/renderPricing';

type Stage = 'idle' | 'uploading' | 'deducting' | 'rendering' | 'done';

/**
 * Shared pipeline for all four image tools (Photo Editor, Staging, Removal,
 * Twilight): S3 upload → 2-credit atomic deduction → Modal /edit_image →
 * result URL. Failed renders refund the 2 credits automatically.
 */
export function useImageEdit() {
  const { addCredits, user, refresh } = useCredit() as any;
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  const edit = useCallback(async (opts: {
    file: File;
    presetId: string;
    strength?: number;
    guidanceScale?: number;
    customPrompt?: string;
  }): Promise<{ imageUrl: string } | null> => {
    setError(null);

    if (!user) {
      setError('You must be signed in');
      return null;
    }
    if (((user as any).credits ?? 0) < IMAGE_EDIT_COST) {
      setError('Not enough credits — each image edit costs 2 credits. Recharge from your dashboard.');
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
      }, jobToken);
      track('render_completed', { kind: 'IMAGE_EDIT', presetId: opts.presetId });
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
      await addCredits(IMAGE_EDIT_COST, 'refund', 'Refund — failed image edit').catch(() => {});
      setError(e.message || 'Render failed — your 2 credits were refunded');
      setStage('idle');
      return null;
    }
  }, [user, addCredits, refresh]);

  return { edit, stage, error, setError, busy: stage === 'uploading' || stage === 'deducting' || stage === 'rendering' };
}
