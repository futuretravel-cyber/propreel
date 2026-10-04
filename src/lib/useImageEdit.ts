import { useCallback, useState } from 'react';
import { falEditImage } from './falImage';
import { useCredit } from '../context/AuthContext';
import { track } from './analytics';
import { PropReelAPI } from './api';
import { IMAGE_PRESETS } from './imagePrompts';

const IMAGE_EDIT_COST = 2;

type Stage = 'idle' | 'uploading' | 'deducting' | 'rendering' | 'done';

/**
 * Shared pipeline for all four image tools (Photo Editor, Staging, Removal,
 * Twilight): S3 upload → 2-credit atomic deduction → Modal /edit_image →
 * result URL. Failed renders refund the 2 credits automatically.
 */
export function useImageEdit() {
  const { deductCredits, addCredits, user } = useCredit() as any;
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

    // 1) Presigned upload: browser → S3 (propreel-raw-assets/uploads/…)
    setStage('uploading');
    let publicUrl: string;
    try {
      const contentType = opts.file.type || 'image/jpeg';
      const preRes = await fetch('/api/music?action=presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, contentType }),
      });
      if (!preRes.ok) {
        const d = await preRes.json().catch(() => ({}));
        throw new Error(d.error || 'Upload authorisation failed');
      }
      const pre = await preRes.json();

      const put = await fetch(pre.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: opts.file,
      });
      if (!put.ok) throw new Error('Image upload failed');
      publicUrl = pre.publicUrl;
    } catch (e: any) {
      setError(e.message || 'Upload failed');
      setStage('idle');
      return null;
    }

    // 2) Deduct 2 credits (atomic server-side conditional decrement)
    setStage('deducting');
    const ok = await deductCredits(IMAGE_EDIT_COST, `Image edit — ${opts.presetId}`, { kind: 'IMAGE_EDIT', presetId: opts.presetId });
    if (!ok) {
      setError('Could not deduct credits — check your balance and try again');
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
      });
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
  }, [user, deductCredits, addCredits]);

  return { edit, stage, error, setError, busy: stage === 'uploading' || stage === 'deducting' || stage === 'rendering' };
}
