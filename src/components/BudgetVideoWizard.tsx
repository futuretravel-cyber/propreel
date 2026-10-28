import { Link } from 'react-router-dom';
import { ShareSheet } from './ui';
import { useState, useEffect, useRef } from 'react';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ORIENTATIONS, RETENTION_DAYS, ORIENTATION_PHOTO_TIP } from '../lib/constants';
import { PropReelAPI, useUploadWait } from '../lib/api';
import { drainBacklog, enqueueImagesForAI, uploadStatusText, useUploadQueue } from '../lib/uploadQueue';
import { guardAIRender } from '../lib/aiDisclaimer';
import { useStudioDraft, studioDraftKey } from '../lib/studioDrafts';
import { useRepairDraftPhotos } from '../lib/repairDraftPhotos';
import { useReorderable } from '../lib/reorder';
import { type PhotoMeta, movesForRoomType, CAMERA_MOVE_LABEL, ROOM_TYPE_LABEL } from '../../lib/videoPrompts';
import { buildBudgetCameraPayload } from '../../lib/budgetVideoPrompts';
import { TIERS as VIDEO_TIERS } from '../../lib/videoTiers';
import { playRenderComplete } from '../lib/renderSound';
import { useRenderProgress, typicalVideoSeconds } from '../lib/useRenderProgress';
import { rerenderClipCredits } from '../../lib/renderPricing';
import { pollRenderJob, pollRerender, type RenderClip } from '../lib/renderPoll';
import ClipReviewPanel from './ClipReviewPanel';
import RenderProgressBar from './RenderProgressBar';
import { Video, Image, Share2, Play, Check, X, AlertTriangle, RefreshCw, Camera, Music, Tag, PiggyBank } from 'lucide-react';
import { track } from '../lib/analytics';
import { workerHeaders, jobHeaders } from '../lib/workerAuth';
import { RENDER_ENDPOINT } from '../lib/renderEndpoint';
// ═══════════════════════════════════════════════════════════════════════════
// BUDGET AI VIDEO — the gentle-motion tier (MiniMax Hailuo-02 standard)
// ═══════════════════════════════════════════════════════════════════════════
// A second, slimmer render studio on the SAME pipeline as VideoTab, pinned
// to the BUDGET tier only: 512p or 768p generation, 30s from 5 photos, and
// deliberately NO voiceover step, NO AI Avatar step and NO listing-details
// form (they exist to ground a narration budget never has). The gentleness
// promise is stated before credits can be spent — page subtitle, the amber
// box on Step 1, and the config cards — because calmer motion IS the tier's
// product decision, not a side effect. Per-photo camera prompts come from
// lib/budgetVideoPrompts.ts and ride the request's `image_prompts` field,
// which the worker's AI path consumes with precedence over its A/B/C deck.
const BUDGET_TIER_ID = 'BUDGET';

export function BudgetVideoTab() {
  const { user, refundCredits, refresh } = useCredit();
  const toast = useToast();
  const uploadWait = useUploadWait();
  const uploadQueue = useUploadQueue('budget');
  // The single tier this studio renders — catalog-driven so its prices can
  // never drift from the job_token charge (lib/videoTiers → lib/renderPricing).
  const budgetTier = VIDEO_TIERS.find(t => t.id === BUDGET_TIER_ID);
  const [configIndex, setConfigIndex] = useState(0);
  // Config-level resolution: the two cards ARE the 512p/768p choice — the
  // only tier where the agent picks fal resolution instead of duration.
  const selectedConfig = budgetTier?.configurations[configIndex];
  const [orientation, setOrientation] = useState('LANDSCAPE');
  const [branding, setBranding] = useState(true);
  // The default Agent Branding profile drives the initial toggle state
  useEffect(() => {
    const def = user?.agentProfiles?.find(p => p.isDefault);
    if (def && typeof def.includeBranding === 'boolean') setBranding(def.includeBranding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.agentProfiles]);
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const [musicTracks, setMusicTracks] = useState<Array<{ id: string; name: string; genre: string; url: string }>>([]);
  useEffect(() => {
    fetch('/api/music')
      .then(r => r.json())
      .then(d => setMusicTracks(d.tracks || []))
      .catch(() => setMusicTracks([]));
  }, []);
  // Separate IndexedDB drafts from the main wizard — an agent drafting a
  // budget reel and a cinematic reel in one session never cross-contaminate.
  const [uploadedImages, setUploadedImages] = useStudioDraft<string[]>(studioDraftKey(user?.id, 'budget:images'), []);
  const draftKey = studioDraftKey(user?.id, 'budget:images');
  const budgetPhotoRepair = useRepairDraftPhotos(draftKey, uploadedImages, setUploadedImages);
  const userFacingPhoto = (src: string) => budgetPhotoRepair.display[src] || src;
  const budgetOrder = useReorderable(setUploadedImages);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoDrag, setPhotoDrag] = useState(false);
  const photosInputRef = useRef<HTMLInputElement>(null);
  // Per-photo (roomType, move) tags — the same taxonomy the main Photos step
  // speaks, but resolved through the GENTLE prompt library. Gates leaving the
  // Photos step exactly like VideoTab's does.
  const [photoMeta, setPhotoMeta] = useStudioDraft<Record<string, PhotoMeta>>(studioDraftKey(user?.id, 'budget:photoMeta'), {});
  const setPhotoMetaFor = (url: string, patch: Partial<PhotoMeta>) =>
    setPhotoMeta(prev => {
      const prior = prev[url];
      // Explicit precedence (patch > existing > default) — see VideoTab's
      // identical helper for why object-spread was wrong here.
      const roomType = patch.roomType ?? prior?.roomType ?? 'interior';
      const move = patch.move ?? prior?.move ?? 'in';
      return { ...prev, [url]: { roomType, move } };
    });
  // Backlog drain — photos uploaded while this route was unmounted land here.
  useEffect(() => {
    const urls = drainBacklog('budget');
    if (urls.length) setUploadedImages(prev => [...prev, ...urls].slice(0, selectedConfig?.images ?? 5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadQueue, setUploadedImages]);
  const handlePhotos = (list: FileList | null) => {
    if (!list || !list.length) return;
    const room = (selectedConfig?.images ?? 5) - uploadedImages.length - uploadQueue.pending;
    if (room <= 0) {
      toast.error(`A budget reel takes ${selectedConfig?.images ?? 5} photos — remove one first`, 'Photo limit reached');
      return;
    }
    setUploadingPhotos(true);
    enqueueImagesForAI(list, user?.id, room, {
      scope: 'budget',
    }).finally(() => {
      setUploadingPhotos(false);
      if (photosInputRef.current) photosInputRef.current.value = '';
    });
  };
  const [generating, setGenerating] = useState(false);
  const [lastRenderUrl, setLastRenderUrl] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState('');
  // Cancel plumbing — same refs-as-flags contract as VideoTab's poll loop.
  const cancelRequestedRef = useRef(false);
  const recordIdRef = useRef<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Elapsed-vs-typical progress — budget is always 30s, but the helper
  // scales with clip count so the bar's expectation tracks the real job.
  const reelProgress = useRenderProgress(typicalVideoSeconds(uploadedImages.length || 1));
  // ── PER-CLIP REVIEW (Option 2, 2026-10-23) — same gate as the main tab.
  // The worker parks AI-tier renders at `clips_ready`; the panel re-rolls
  // bad clips (paid per clip) and only then stitches the reel.
  const [clipReview, setClipReview] = useState<{ recordId: string; clips: RenderClip[]; projectId?: string } | null>(null);
  const [rerollingIndex, setRerollingIndex] = useState<number | null>(null);
  const [assemblingReview, setAssemblingReview] = useState(false);

  // No avatar phase exists here (budget has no add-on), so cancel is one
  // worker call — the poll loop stops on its next tick and the catch path
  // refunds whatever actually landed.
  const cancelRender = async () => {
    if (cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    setCancelling(true);
    const id = recordIdRef.current;
    if (!id) return;
    try {
      await fetch(`${RENDER_ENDPOINT}/cancel_render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await workerHeaders()) },
        body: JSON.stringify({ record_id: id }),
      });
    } catch { /* best-effort — polling stops either way */ }
  };

  // ── PER-CLIP REVIEW actions (Option 2, budget) ────────────────────────
  const rerollCredits = rerenderClipCredits(BUDGET_TIER_ID, configIndex);

  /** Budget twin of VideoTab's finalize: player + READY row + fanfare. */
  const finalizeRender = (o: { url: string; duration?: number; thumb?: string }, pid?: string | null) => {
    setLastRenderUrl(o.url);
    if (user && pid && o.url) {
      PropReelAPI.updateProject(user.id, pid, {
        status: 'READY',
        videoUrl: o.url,
        ...(o.duration ? { durationSeconds: o.duration } : {}),
        ...(o.thumb ? { thumbnailUrl: o.thumb } : {}),
      }).catch(() => {});
    }
    setGenerating(false);
    reelProgress.stop();
    setCancelling(false);
    playRenderComplete();
    toast.success('Budget reel rendered successfully!', 'Render Complete');
  };

  /** Shared verdict for "the job left the review without us" — mirrors
   *  VideoTab's handleReviewEnded exactly (finalize / fail+refund / still
   *  parked at `clips_ready`), so both tabs behave the same. */
  const handleReviewEnded = async (
    recordId: string,
    pid?: string | null,
    fallbackMessage?: string
  ): Promise<'completed' | 'cancelled' | 'failed' | 'reviewing'> => {
    const st = await fetch(
      `${RENDER_ENDPOINT}/render_status?record_id=${encodeURIComponent(recordId)}`,
      { headers: await workerHeaders(), signal: AbortSignal.timeout(15_000) }
    ).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (st?.status === 'clips_ready') return 'reviewing';
    if (st?.status === 'completed' && st.video_url) {
      setClipReview(null);
      finalizeRender({
        url: String(st.video_url),
        duration: st.duration_seconds ? Number(st.duration_seconds) : undefined,
        thumb: st.thumbnail_url ? String(st.thumbnail_url) : undefined,
      }, pid);
      return 'completed';
    }
    setClipReview(null);
    if (user && pid) PropReelAPI.updateProject(user.id, pid, { status: 'FAILED' }).catch(() => {});
    try { await refundCredits('render'); } catch { /* best-effort */ }
    setGenerating(false);
    reelProgress.stop();
    setCancelling(false);
    if (st?.status === 'cancelled') {
      toast.info('Render cancelled — your credits were refunded.', 'Render Cancelled');
      return 'cancelled';
    }
    toast.error(fallbackMessage || 'Failed to generate video — credits refunded', 'Error');
    return 'failed';
  };

  /** Re-roll ONE budget clip: paid mint → /rerender_clip → bounded marker
   *  watch. Non-success refunds the charge; the old clip always stays. */
  const handleRerender = async (index: number, promptOverride?: string) => {
    if (!clipReview || rerollingIndex !== null || assemblingReview) return;
    const { recordId, clips, projectId: pid } = clipReview;
    const previous = clips[index]?.rerendered_at;
    setRerollingIndex(index);
    let charged = false;
    try {
      const mint = await jobHeaders('rerender', {
        tier: BUDGET_TIER_ID,
        configIndex,
        metadata: { recordId, clipIndex: index },
        pool: (user?.agencyPoolCredits ?? 0) > 0 ? 'agency' : 'personal',
      });
      charged = true;
      const res = await fetch(`${RENDER_ENDPOINT}/rerender_clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...mint },
        body: JSON.stringify({ record_id: recordId, clip_index: index, ...(promptOverride ? { prompt: promptOverride } : {}) }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'The re-roll could not start');
      }
      const verdict = await pollRerender({
        endpoint: RENDER_ENDPOINT,
        recordId,
        clipIndex: index,
        previousRerenderedAt: previous,
      });
      if (verdict.kind === 'done') {
        setClipReview(prev => (prev && prev.recordId === recordId ? { ...prev, clips: verdict.clips } : prev));
        void refresh();
        track('clip_rerolled', { tier: BUDGET_TIER_ID, clip_index: index });
        toast.success(`Clip ${index + 1} came back fresh — watch it below, then create the final video when every clip looks right.`, 'Clip re-rolled');
        return;
      }
      const message = verdict.kind === 'error'
        ? verdict.message
        : `The render moved on (${verdict.status}) — the re-roll could not be applied.`;
      if (charged) { try { await refundCredits('rerender'); } catch { /* best-effort */ } }
      const state = await handleReviewEnded(recordId, pid, message);
      if (state === 'reviewing') toast.error(message, 'Re-roll not completed');
    } catch (e: any) {
      if (charged) { try { await refundCredits('rerender'); } catch { /* best-effort */ } }
      const message = e?.message || 'The re-roll could not start';
      const state = await handleReviewEnded(recordId, pid, message);
      if (state === 'reviewing') toast.error(message, 'Re-roll not completed');
    } finally {
      setRerollingIndex(null);
    }
  };

  /** Assemble the reviewed clips (free — the render charge paid for this
   *  reel) and poll through the SAME shared loop. The tab's Cancel button
   *  works during assembly via cancelRequestedRef. */
  const assembleReviewedReel = async () => {
    if (!clipReview || assemblingReview || rerollingIndex !== null) return;
    const { recordId, projectId: pid } = clipReview;
    setAssemblingReview(true);
    try {
      const res = await fetch(`${RENDER_ENDPOINT}/assemble_reel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await workerHeaders()) },
        body: JSON.stringify({ record_id: recordId }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Could not start creating the final video');
      }
      track('render_assembled', { tier: BUDGET_TIER_ID });
      setClipReview(null);
      setGenerating(true);
      setRenderStatus('processing');
      reelProgress.start();
      const outcome = await pollRenderJob(recordId, {
        endpoint: RENDER_ENDPOINT,
        isCancelled: () => cancelRequestedRef.current,
        onStatus: setRenderStatus,
      });
      if (outcome.kind === 'cancelled') throw new Error('Render cancelled');
      if (outcome.kind === 'review') {
        setClipReview({ recordId, clips: outcome.clips, projectId: pid });
        setGenerating(false);
        reelProgress.stop();
        return;
      }
      finalizeRender(outcome, pid);
    } catch (e: any) {
      const message = e?.message || 'The final video could not be created — credits refunded';
      const state = await handleReviewEnded(recordId, pid, message);
      if (state === 'reviewing') toast.error(message, 'Assembly not started');
    } finally {
      setAssemblingReview(false);
    }
  };

  /** Cancel from the review panel — worker cancel, FAILED row, render charge
   *  refunded (re-roll charges stand: those fal calls really ran). */
  const cancelReviewedRender = async () => {
    if (!clipReview) return;
    const { recordId, projectId: pid } = clipReview;
    setCancelling(true);
    try {
      await fetch(`${RENDER_ENDPOINT}/cancel_render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await workerHeaders()) },
        body: JSON.stringify({ record_id: recordId }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch { /* best-effort — the review can be abandoned either way */ }
    setClipReview(null);
    if (user && pid) PropReelAPI.updateProject(user.id, pid, { status: 'FAILED' }).catch(() => {});
    try { await refundCredits('render'); } catch { /* best-effort */ }
    setGenerating(false);
    reelProgress.stop();
    setCancelling(false);
    toast.info('Render cancelled — your credits were refunded.', 'Render Cancelled');
  };

  const generateReel = async () => {
    if (!budgetTier || !selectedConfig) return;
    setGenerating(true);
    reelProgress.start();
    const recordId = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    recordIdRef.current = recordId;
    cancelRequestedRef.current = false; // the flag belongs to THIS render only
    setCancelling(false);
    // Hoisted out of the try: the catch path fails the project record so the
    // nightly reaper (PROCESSING rows only) can never refund it a second time.
    let projectId: string | null = null;
    let wasCancelled = false;
    // Refund only if THIS deduction actually landed — a mint that failed
    // (not enough credits) must not add credits to the balance.
    let charged = false;

    try {
      // 1) Project record first — a budget reel is still a real render row.
      if (user) {
        try {
          const project = await PropReelAPI.createProject({
            userId: user.id,
            title: 'Budget Property Video',
            status: 'PROCESSING',
            videoTier: BUDGET_TIER_ID,
            durationSeconds: selectedConfig.duration,
            jobId: recordId,
            creditsSpent: selectedConfig.credits,
          } as any);
          projectId = project.id;
        } catch { /* non-fatal — render can still proceed */ }
      }

      // 2) Pay at mint time: the server prices from lib/videoTiers' BUDGET
      //    configs (20⚡ 512p / 34⚡ 768p) and hands back a single-use token
      //    the worker refuses to render without.
      const usePool = (user?.agencyPoolCredits ?? 0) > 0;
      const jobToken = await jobHeaders('render', {
        tier: BUDGET_TIER_ID,
        configIndex,
        metadata: { tier: BUDGET_TIER_ID, duration: selectedConfig.duration, recordId },
        pool: usePool ? 'agency' : 'personal',
      });
      charged = true;
      void refresh(); // the balance display — the charge landed server-side

      const brandProfile = user?.agentProfiles?.find(p => p.isDefault) || user?.agentProfiles?.[0];
      const contactLine = brandProfile
        ? [brandProfile.fullName, brandProfile.phone, brandProfile.email].filter(Boolean).join(' · ')
        : '';
      const hostedPhoto = brandProfile?.photoUrl && !brandProfile.photoUrl.startsWith('data:') ? brandProfile.photoUrl : undefined;
      const brandingPayload = branding ? {
        photo_url: hostedPhoto,
        logo_url: brandProfile?.logoUrl || undefined,
        contact_line: contactLine || undefined,
      } : undefined;

      // 3) Start the async render job (bounded — a hung POST on a Modal cold
      //    container used to leave the spinner in dead-air for the deadline).
      if (cancelRequestedRef.current) { wasCancelled = true; throw new Error('Render cancelled'); }
      const START_TIMEOUT_MS = 45_000;
      let response: Response;
      try {
        response = await fetch(`${RENDER_ENDPOINT}/render_video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...jobToken },
          body: JSON.stringify({
            record_id: recordId,
            tier: BUDGET_TIER_ID,
            config_index: configIndex,
            orientation,
            images: uploadedImages,
            // The gentle prompts ride `image_prompts` — the field the worker's
            // AI path reads (prompt per image, precedence over its deck).
            // photo_meta in that request model carries roomType/move, NOT
            // prompt text, so it is deliberately not sent here.
            image_prompts: buildBudgetCameraPayload(uploadedImages, photoMeta),
            // Silent by design: no voiceover, no avatar — but a selected
            // music track still beds under the cuts (the worker mixes it
            // for silent AI reels).
            voiceover_text: '',
            include_agent_branding: branding,
            audio: false,
            // PER-CLIP REVIEW (Option 2): pause at `clips_ready` before
            // assembly so the agent watches and re-rolls each clip.
            review: true,
            music_url: selectedMusic || undefined,
            branding: brandingPayload,
          }),
          signal: AbortSignal.timeout(START_TIMEOUT_MS),
        });
      } catch (e: any) {
        if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
          throw new Error('The render service did not respond while starting — your charge is being refunded; try again in a minute.');
        }
        throw e;
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to start budget video generation');
      }

      const result = await response.json();
      track('render_started', { tier: BUDGET_TIER_ID, orientation });      // 4) Poll /render_status until terminal (the worker may still answer
      // synchronously for a finished job). One shared state machine with the
      // main wizard — lib/renderPoll owns the review gate for BOTH tabs.
      let finalUrl: string | null = result?.video_url || null;
      let measuredDuration: number | undefined;
      let thumbUrl: string | undefined;
      if (!finalUrl && result?.record_id) {
        const outcome = await pollRenderJob(result.record_id, {
          endpoint: RENDER_ENDPOINT,
          isCancelled: () => cancelRequestedRef.current,
          onStatus: setRenderStatus,
        });
        if (outcome.kind === 'cancelled') { wasCancelled = true; throw new Error('Render cancelled'); }
        if (outcome.kind === 'review') {
          // PER-CLIP REVIEW GATE (Option 2): clips exist, reel not assembled.
          // The render charge stands (generation happened) — return BEFORE
          // the catch path: no refund, no FAILED row.
          setClipReview({ recordId: result.record_id, clips: outcome.clips, projectId: projectId ?? undefined });
          track('render_review_entered', { tier: BUDGET_TIER_ID });
          setGenerating(false);
          reelProgress.stop();
          setCancelling(false);
          toast.info('Every clip is ready — watch them below, re-roll any that look wrong, then create the final video.', 'Review your clips');
          return;
        }
        finalUrl = outcome.url;
        measuredDuration = outcome.duration;
        thumbUrl = outcome.thumb;
      }
      if (wasCancelled) throw new Error('Render cancelled');
      if (!finalUrl) {
        // Never report success without a video — refund instead.
        throw new Error('The render did not finish within 25 minutes — your credits were refunded. Please try again from the Studio.');
      }
      setLastRenderUrl(finalUrl);

      // 5) Finalize the project record
      if (user && projectId && finalUrl) {
        PropReelAPI.updateProject(user.id, projectId, {
          status: 'READY',
          videoUrl: finalUrl,
          ...(measuredDuration ? { durationSeconds: measuredDuration } : {}),
          ...(thumbUrl ? { thumbnailUrl: thumbUrl } : {}),
        }).catch(() => {});
      }

      setGenerating(false);
      reelProgress.stop();
      setCancelling(false);
      playRenderComplete();
      toast.success('Budget reel rendered successfully!', 'Render Complete');
    } catch (error: any) {
      console.error('Error generating budget video:', error);
      // Fail the record FIRST: the nightly reaper only refunds PROCESSING
      // rows, so once this lands the refund below is the only one that runs.
      if (user && projectId) {
        PropReelAPI.updateProject(user.id, projectId, { status: 'FAILED' }).catch(() => {});
      }
      if (charged) {
        try {
          await refundCredits('render');
        } catch { /* best-effort */ }
      }
      setGenerating(false);
      reelProgress.stop();
      setCancelling(false);
      if (wasCancelled) {
        toast.info('Render cancelled — your credits were refunded.', 'Render Cancelled');
      } else {
        toast.error(error.message || 'Failed to generate video — credits refunded', 'Error');
      }
    }
  };

  // ── 5-step wizard — the main flow minus voiceover, avatar and listing
  // details (those steps exist only to ground a narration budget never has).
  const WIZARD_STEPS = [
    { id: 'config', label: 'Resolution & Price' },
    { id: 'orientation', label: 'Orientation' },
    { id: 'photos', label: 'Photos' },
    { id: 'extras', label: 'Music & Branding' },
    { id: 'render', label: 'Render' },
  ];
  const [step, setStep] = useState(0);
  // Every photo must carry room type + camera move before rendering, same
  // gate as the main wizard — the gentle prompts are per-photo by design.
  const photosMissingMeta = step === 2
    ? uploadedImages.filter(u => { const m = photoMeta[u]; return !m || !m.roomType || !m.move; }).length
    : 0;
  const canNext = step !== 2 || (uploadedImages.length > 0 && photosMissingMeta === 0);
  const nextStep = () => { if (step < WIZARD_STEPS.length - 1 && canNext) setStep(step + 1); };
  const prevStep = () => setStep(s => Math.max(0, s - 1));

  if (!budgetTier || !selectedConfig) {
    return <p className="text-sm text-ink-400">The Budget tier is missing from the price catalog — please reload the page. If it persists, contact support.</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><PiggyBank className="w-5 h-5 text-purple-400" /> Budget AI Video</h2>
      <p className="text-xs text-ink-400 -mt-3">Gentle motion, no voiceover. Want a cinematic, narrated reel instead? <Link to="/dashboard/video" className="text-purple-300 underline hover:text-purple-200">Video Generator</Link></p>

      {/* Wizard steps — same numbered layout as the Video Generator flow */}
      <div className="flex items-center">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.id} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
            {i > 0 && <div className={`h-0.5 flex-1 mx-2 ${i <= step ? 'bg-purple-600' : 'bg-white/10'}`} />}
            <div className="flex flex-col items-center gap-1" aria-current={i === step ? 'step' : undefined}>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                i < step ? 'bg-purple-700 text-white' : i === step ? 'bg-purple-700/30 border border-purple-500 text-white' : 'bg-white/10 text-ink-400'
              }`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </span>
              <span className={`text-[11px] hidden sm:block ${i === step ? 'text-white' : 'text-ink-500'}`}>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Step 1 — Resolution & Price, with the motion disclaimer front and
          center: the agent must understand the trade BEFORE credits move. */}
      {step === 0 && (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-200/90 leading-relaxed">
            <p className="font-semibold text-amber-300">Gentler motion — that is the point</p>
            <p className="mt-1">
              Budget reels are a slower, calmer camera pace with noticeably less movement than the Video Generator's cinematic tiers. There is no voiceover and no AI avatar on this tier — it is photos, gentle motion and optional music and branding. For bold walk-throughs and dramatic fly-throughs, use the <Link to="/dashboard/video" className="underline hover:text-amber-200">Video Generator</Link> instead.
            </p>
          </div>
        </div>
        <div>
          <label className="label">Resolution & Price</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {budgetTier.configurations.map((config, idx) => (
              <button
                key={idx}
                onClick={() => setConfigIndex(idx)}
                className={`p-5 rounded-xl text-left transition ${configIndex === idx ? 'bg-purple-700/20 border border-purple-500/30' : 'bg-white/5 hover:bg-white/10'}`}
              >
                <p className={`text-2xl font-bold ${configIndex === idx ? 'text-purple-300' : 'text-white'}`}>{config.resolution}</p>
                <p className="text-xs text-ink-400 mt-1">{config.duration}s video from {config.images} photos — gentle cinematic motion, no voiceover</p>
                <p className="text-sm font-semibold text-purple-400 mt-2">{config.credits} credits</p>
                {configIndex === idx && (user?.credits ?? 0) < config.credits && !((user?.agencyPoolCredits ?? 0) > 0) && (
                  <p className="text-xs text-amber-400/90 mt-2">You have ⚡{user?.credits ?? 0} — <Link to="/dashboard/credits" className="underline hover:text-amber-300">top up</Link> before rendering.</p>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-500 mt-2">
            Budget reels are always {selectedConfig.duration}s from {selectedConfig.images} photos — the only choice is how sharp the source generation is.
          </p>
        </div>
      </div>
      )}

      {/* Step 2 — Orientation */}
      {step === 1 && (
      <div>
        <div className="flex items-center justify-between">
          <label className="label">Orientation</label>
          <button
            type="button"
            onClick={() => { setOrientation('LANDSCAPE'); toast.info('Orientation reset to Landscape', 'Step 2'); }}
            className="text-xs text-ink-400 hover:text-red-400"
          >
            Clear
          </button>
        </div>
        <div className="flex gap-3">
          {ORIENTATIONS.map(o => (
            <button key={o.id} onClick={() => setOrientation(o.id)} className={`flex items-center gap-3 px-6 py-3 rounded-xl transition ${orientation === o.id ? 'bg-purple-700/20 border border-purple-500/30 text-purple-300' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}>
              <span className="text-xl">{o.icon}</span>
              <div className="text-left">
                <p className="font-medium text-sm">{o.label}</p>
                <p className="text-xs text-ink-400">{o.ratio}</p>
              </div>
            </button>
          ))}
        </div>
        {ORIENTATION_PHOTO_TIP[orientation] && (
          <p className="text-xs text-ink-400 mt-3 leading-relaxed">
            {ORIENTATION_PHOTO_TIP[orientation]}
          </p>
        )}
      </div>
      )}

      {/* Step 3 — Photos + per-photo camera tags (the gentle prompts) */}
      {step === 2 && (
      <div>
        <div className="flex items-center justify-between">
          <label className="label">Property Photos ({uploadedImages.length} / {selectedConfig.images})</label>
          {uploadedImages.length > 0 && (
            <button onClick={() => { setUploadedImages([]); setPhotoMeta({}); }} className="text-xs text-ink-400 hover:text-red-400">Clear all</button>
          )}
        </div>
        <input
          ref={photosInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={e => handlePhotos(e.target.files)}
        />
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${photoDrag ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 hover:border-purple-500/30'}`}
          onClick={() => photosInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setPhotoDrag(true); }}
          onDragLeave={() => setPhotoDrag(false)}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); setPhotoDrag(false); handlePhotos(e.dataTransfer.files); }}
          role="button"
          tabIndex={0}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && photosInputRef.current?.click()}
          aria-label="Upload property photos"
        >
          <Image className="w-8 h-8 text-ink-400 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">
            {uploadingPhotos || uploadQueue.pending > 0 ? uploadStatusText(uploadQueue, uploadWait) : uploadedImages.length ? 'Add more photos' : 'Drop photos here or click to upload'}
          </p>
          <p className="text-ink-500 text-xs mt-1">Up to {selectedConfig.images} photos for the 30s budget reel — JPEG/PNG/WEBP up to 25MB</p>
        </div>
        {uploadedImages.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            {uploadedImages.map((src, i) => (
              <div key={src} className={budgetOrder.dragClass(i, 'relative group')} {...budgetOrder.dragProps(i)}>
                <img src={userFacingPhoto(src)} alt={`Photo ${i + 1}`} className="w-full aspect-[4/3] object-cover rounded-lg border border-white/10 pointer-events-none" draggable={false} />
                <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">{i + 1}</span>
                <button
                  onClick={e => { e.stopPropagation(); setUploadedImages(prev => prev.filter((_, idx) => idx !== i)); }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 transition"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <X className="w-3 h-3" />
                </button>
                {/* Per-photo camera metadata — the gentle prompt is picked from
                    it. Same taxonomy as the main Photos step: EXTERIOR also
                    gets the pull-back (Zoom out); INTERIOR never does. */}
                <div className="mt-2 space-y-2 rounded-lg bg-black/40 p-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wide text-ink-500">Photo is from a</span>
                    <div className="flex gap-1 mt-1">
                      {(['interior', 'exterior'] as const).map(rt => (
                        <button
                          key={rt}
                          type="button"
                          onClick={e => { e.stopPropagation(); setPhotoMetaFor(src, { roomType: rt, move: 'in' }); }}
                          className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition ${(photoMeta[src]?.roomType ?? 'interior') === rt ? 'bg-purple-600 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}
                        >
                          {ROOM_TYPE_LABEL[rt]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wide text-ink-500">Camera move</span>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      {movesForRoomType(photoMeta[src]?.roomType ?? 'interior').map(mv => (
                        <button
                          key={mv}
                          type="button"
                          onClick={e => { e.stopPropagation(); setPhotoMetaFor(src, { move: mv }); }}
                          className={`rounded px-2 py-1 text-[11px] font-medium transition ${(photoMeta[src]?.move ?? 'in') === mv ? 'bg-purple-600 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}
                        >
                          {CAMERA_MOVE_LABEL[mv]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Step 4 — Music & Branding (same enhancements as the main flow —
          music now genuinely mixes on a silent AI reel) */}
      {step === 3 && (
      <div className="space-y-6">
        <div>
          <label className="label flex items-center gap-2">
            <Music className="w-4 h-4 text-purple-400" />
            Background Music (Optional)
          </label>
          <div className="bg-ink-800/50 rounded-xl p-4">
            {musicTracks.length === 0 ? (
              <p className="text-sm text-ink-400">No music tracks available yet — your administrator can upload tracks in Admin → Music Library.</p>
            ) : (
              <select
                className="input"
                value={selectedMusic || ''}
                onChange={(e) => setSelectedMusic(e.target.value || null)}
              >
                <option value="">No background music</option>
                {musicTracks.map(t => (
                  <option key={t.id} value={t.url}>{t.name} ({t.genre})</option>
                ))}
              </select>
            )}
            {selectedMusic && musicTracks.some((t) => t.url === selectedMusic) && (
              <div className="mt-3">
                <audio
                  key={selectedMusic}
                  controls
                  preload="none"
                  src={selectedMusic}
                  aria-label="Preview the selected background music"
                  className="w-full"
                />
                <p className="text-xs text-ink-500 mt-1">
                  Preview — this is how the track will sound under your reel.
                </p>
              </div>
            )}
            <p className="text-xs text-ink-500 mt-2">
              Budget reels are silent by design (no voiceover), so the selected track plays under the whole reel. Music tracks are managed by administrators.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="label">Enhancements</label>
            {(branding || selectedMusic) && (
              <button
                type="button"
                onClick={() => { setBranding(false); setSelectedMusic(null); toast.info('Enhancements cleared — branding & music off', 'Step 4'); }}
                className="text-xs text-ink-400 hover:text-red-400"
              >
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setBranding(!branding)}
              aria-pressed={branding}
              className={`p-4 rounded-xl text-left transition min-h-[44px] ${branding ? 'bg-purple-700/25 border border-purple-500/50' : 'bg-white/5 border border-transparent hover:bg-white/10'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${branding ? 'text-purple-300' : 'text-ink-300'}`}>Agent Profile Branding</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${branding ? 'bg-purple-600 text-white' : 'bg-white/10 text-ink-400'}`}>{branding ? 'INCLUDED' : 'OFF'}</span>
              </div>
              <p className="text-xs text-ink-500 mt-1">Profile picture, agency logo & contact details on the reel</p>
            </button>
            <button
              type="button"
              onClick={() => setSelectedMusic(selectedMusic ? null : (musicTracks[0]?.url || 'default'))}
              aria-pressed={!!selectedMusic}
              disabled={musicTracks.length === 0}
              className={`p-4 rounded-xl text-left transition min-h-[44px] disabled:opacity-40 ${selectedMusic ? 'bg-purple-700/25 border border-purple-500/50' : 'bg-white/5 border border-transparent hover:bg-white/10'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${selectedMusic ? 'text-purple-300' : 'text-ink-300'}`}>Music Track</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedMusic ? 'bg-purple-600 text-white' : 'bg-white/10 text-ink-400'}`}>{selectedMusic ? 'INCLUDED' : 'OFF'}</span>
              </div>
              <p className="text-xs text-ink-500 mt-1">{musicTracks.length === 0 ? 'No tracks uploaded yet' : selectedMusic ? 'Tap to remove — choose specific track above' : 'Tap to include — pick the track above'}</p>
            </button>
          </div>
        </div>
      </div>
      )}

      {step === 2 && !canNext && (
        <p className="text-xs text-amber-400/90 text-center">
          {uploadedImages.length === 0
            ? 'Add at least one property photo to continue — a reel needs images to render.'
            : `Tag every photo with a room type (Interior / Exterior) and a camera move before continuing — ${photosMissingMeta} photo${photosMissingMeta === 1 ? '' : 's'} still untagged.`}
        </p>
      )}

      {/* Step 5 — Render / Video Player */}
      {step === 4 && (
      <div className="space-y-3">
        {/* Review gate: Generate steps aside while clips await review. */}
        {!clipReview && (
        <button
          onClick={() => guardAIRender(generateReel)}
          disabled={generating}
          className="btn btn-primary w-full text-lg py-4"
        >
          {generating ? (
            <><RefreshCw className="w-5 h-5 animate-spin" /> Generating Video...</>
          ) : (
            <><Play className="w-5 h-5" /> Generate Video ({selectedConfig.credits} credits)</>
          )}
        </button>
        )}
        {!generating && clipReview && (
          <ClipReviewPanel
            clips={clipReview.clips}
            rerenderCredits={rerollCredits}
            busyIndex={rerollingIndex}
            assembling={assemblingReview}
            cancelling={cancelling}
            onRerender={handleRerender}
            onAssemble={assembleReviewedReel}
            onCancel={cancelReviewedRender}
          />
        )}
        {generating && (
          <RenderProgressBar
            progress={reelProgress}
            stage={renderStatus === 'processing' ? 'processing' : renderStatus === 'queued' ? 'queued' : ''}
            label="Rendering your budget reel"
          />
        )}
        {generating && (
          <button
            type="button"
            onClick={cancelRender}
            disabled={cancelling}
            className="btn btn-secondary w-full min-h-[48px] text-red-300 hover:text-red-200 border border-red-500/30"
          >
            {cancelling ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Cancelling… saving your credits</>
            ) : (
              <><X className="w-4 h-4" /> Cancel render — unused credits come back</>
            )}
          </button>
        )}
        {!generating && (user?.credits ?? 0) < selectedConfig.credits && !((user?.agencyPoolCredits ?? 0) > 0) && (
          <p className="text-xs text-amber-400/90 text-center">
            You have ⚡{user?.credits ?? 0} — this render costs ⚡{selectedConfig.credits}. <Link to="/dashboard/credits" className="underline hover:text-amber-300">Top up</Link> before generating.
          </p>
        )}
        {!generating && (
          <p className="text-xs text-ink-400 text-center">
            {selectedConfig.duration}s reel from {uploadedImages.length || selectedConfig.images} photo{(uploadedImages.length || selectedConfig.images) === 1 ? '' : 's'} at {selectedConfig.resolution} · gentle, slower motion — no voiceover or avatar{selectedMusic ? ' · music included' : ''}{branding ? ' · agent branding included' : ''}
          </p>
        )}
        {!generating && lastRenderUrl && (
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => { setLastRenderUrl(null); setShareOpen(false); toast.info('Finished video cleared from this page — it stays in Projects', 'Step 5'); }}
              className="text-xs text-ink-400 hover:text-red-400"
            >
              Clear video
            </button>
          </div>
        )}
        {!generating && lastRenderUrl && (
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              controls
              playsInline
              src={lastRenderUrl}
              className="w-full max-h-[420px]"
              aria-label="Rendered video preview"
            />
          </div>
        )}
        {!generating && lastRenderUrl && (
          <p className="text-xs text-ink-500 text-center">
            Your reel is kept for {RETENTION_DAYS} days — download it from the share sheet to keep it.
          </p>
        )}
        {!generating && lastRenderUrl && (
          <button
            onClick={() => setShareOpen(true)}
            className="btn btn-primary w-full min-h-[48px]"
          >
            <Share2 className="w-4 h-4" /> Share to social media
          </button>
        )}
      </div>
      )}

      {/* Wizard nav — Back / Next (the photos gate on step 3 blocks Next) */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
        <button
          type="button"
          onClick={prevStep}
          disabled={step === 0 || generating}
          className="btn btn-ghost min-h-[44px] px-4 disabled:opacity-40"
        >
          ← Back
        </button>
        <span className="text-xs text-ink-500">Step {step + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[step].label}</span>
        {step < WIZARD_STEPS.length - 1 ? (
          <button
            type="button"
            onClick={nextStep}
            disabled={!canNext}
            className="btn btn-primary min-h-[44px] px-6 disabled:opacity-40"
            title={canNext ? undefined : 'Add at least one property photo to continue'}
          >
            Next →
          </button>
        ) : <div className="w-24" />}
      </div>
      {shareOpen && lastRenderUrl && (
        <ShareSheet
          videoUrl={lastRenderUrl}
          caption=""
          hashtags={['PropertyForSale', 'SouthAfrica', 'RealEstate']}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

// Budget AI Video page — same chrome as the other tool pages.
