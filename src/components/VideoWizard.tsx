import { useState, useEffect, useRef } from 'react';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { TIERS, ORIENTATIONS, SA_LANGUAGES, voicesForLanguage, RETENTION_DAYS, PROVINCES, PROPERTY_TYPES, ORIENTATION_PHOTO_TIP } from '../lib/constants';
import { PropReelAPI, useUploadWait } from '../lib/api';
import { drainBacklog, enqueueImagesForAI, uploadStatusText, useUploadQueue } from '../lib/uploadQueue';
import { guardAIRender } from '../lib/aiDisclaimer';
import FeatureChips from './FeatureChips';
import { useStudioDraft, studioDraftKey, dataUrlToFile } from '../lib/studioDrafts';
import { useRepairDraftPhotos } from '../lib/repairDraftPhotos';
import { useReorderable } from '../lib/reorder';
import { wordCount, creditListZar } from '../lib/utils';
import { type PhotoMeta, movesForRoomType, CAMERA_MOVE_LABEL, ROOM_TYPE_LABEL } from '../../lib/videoPrompts';
import { buildBudgetCameraPayload } from '../../lib/budgetVideoPrompts';
import { TIERS as VIDEO_TIERS } from '../../lib/videoTiers';
import { playRenderComplete } from '../lib/renderSound';
import { useRenderProgress, typicalVideoSeconds } from '../lib/useRenderProgress';
import { useFlashHead } from '../lib/useFlashHead';
import { flashheadCreditsForText, narrationSecondsForText, FLASHHEAD_MAX_SECONDS, NARRATION_WORDS_PER_SEC, scriptCreditsForDuration, rerenderClipCredits, NARRATION_CREDITS } from '../../lib/renderPricing';
import { pollRenderJob, pollRerender, type RenderClip } from '../lib/renderPoll';
import ClipReviewPanel from './ClipReviewPanel';
import { useVoicePreview } from '../lib/useVoicePreview';
import { type VoiceoverLanguageCheck } from '../lib/useVoiceoverLanguageCheck';
import LanguageMismatchBanner from './LanguageMismatchBanner';
import RenderProgressBar from './RenderProgressBar';
import { Video, Image, Share2, Play, Square, Check, X, Sparkles, AlertTriangle, RefreshCw, VolumeX, Mic, Camera, Music, Tag } from 'lucide-react';
import { track } from '../lib/analytics';
import { workerHeaders, jobHeaders } from '../lib/workerAuth';
import { RENDER_ENDPOINT } from '../lib/renderEndpoint';
import { ShareSheet, AITalkingProfile } from './ui';
import { Link } from 'react-router-dom';

export function VideoTab({ sharedScript, onScriptChange, langCheck, initialImages = [], profileImage, profileImageReady = true, onProfileImageChange, language, onLanguageChange, noNarration, onNoNarrationChange }: { sharedScript: string; onScriptChange: (s: string) => void; langCheck: VoiceoverLanguageCheck; initialImages?: string[]; profileImage: string | null; profileImageReady?: boolean; onProfileImageChange: (img: string | null) => void; language: string; onLanguageChange: (l: string) => void; noNarration: boolean; onNoNarrationChange: (v: boolean) => void }) {
  const { user, refundCredits, refresh } = useCredit();
  const toast = useToast();
  const confirm = useConfirm();
  const uploadWait = useUploadWait();
  const uploadQueue = useUploadQueue('video');
  const [tier, setTier] = useState('SOCIAL');
  // Signup grants 5 credits — exactly one Essential 30s reel. SOCIAL costs 34
  // for the same length, so a new account used to land here on a disabled
  // "Generate Video (34 credits)" button. Until the agent picks a tier
  // themselves, start on whatever their balance can actually render.
  const tierTouchedRef = useRef(false);
  useEffect(() => {
    if (!user || tierTouchedRef.current) return;
    const social30 = VIDEO_TIERS.find(t => t.id === 'SOCIAL')?.configurations[0]?.credits ?? 34;
    if ((user.credits ?? 0) < social30) setTier('ESSENTIAL');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.credits]);
  const [configIndex, setConfigIndex] = useState(0);
  const [orientation, setOrientation] = useState('LANDSCAPE');
  // Narrator voices are grouped per language — keep the pick valid when the
  // language changes (the worker also re-validates the pair server-side).
  const languageVoices = voicesForLanguage(language);
  const [voice, setVoice] = useState('aletta');
  useEffect(() => {
    if (!languageVoices.some(v => v.id === voice)) setVoice(languageVoices[0]?.id ?? 'aletta');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);
  // Short sample of the selected narrator voice, spoken in the selected language
  const voicePreview = useVoicePreview(`${language}:${voice}`);
  // Agents can keep the script (AI Write + the avatar tab both need it) but
  // render THIS reel silent — the worker skips synthesis entirely when
  // voiceover_text is empty, so no TTS cost and no freeze-extension. The
  // state itself lives in the page (it gates the shared language check —
  // pressing "No narration" cancels an in-flight "Checking the script
  // language…" and re-arms it when narration comes back on), so this
  // forwards the toggle.
  const setNoNarration = onNoNarrationChange;
  // Script lives in page state so the AI Avatar Video step speaks the same text
  const script = sharedScript;
  const setScript = onScriptChange;
  // Structured listing facts (Step 1) — persisted and auto-folded into the
  // AI Write grounding so the voiceover speaks the real price/beds/features
  // without the agent retyping them. (The free-text Property Description
  // slot was removed — the Listing details form IS the description source.)
  const [fields, setFields] = useStudioDraft<Record<string, string>>(studioDraftKey(user?.id, 'video:listing-details'), {
    address: '', price: '', propertyType: 'House', province: '', bedrooms: '', bathrooms: '', garages: '', erf: '', floor: '', extraFeatures: '',
  });
  const setField = (k: string) => (e: any) => setFields(f => ({ ...f, [k]: e.target.value }));
  const [selectedFeatures, setSelectedFeatures] = useStudioDraft<string[]>(studioDraftKey(user?.id, 'video:listing-features'), []);
  const toggleFeature = (f: string) =>
    setSelectedFeatures(prev => (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]));
  const [branding, setBranding] = useState(true);
  // The default Agent Branding profile drives the initial toggle state
  useEffect(() => {
    const def = user?.agentProfiles?.find(p => p.isDefault);
    if (def && typeof def.includeBranding === 'boolean') setBranding(def.includeBranding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.agentProfiles]);
  const [aiTalkingProfile, setAiTalkingProfile] = useState(false);
  // Step 6 renders no video of its own: the avatar clip is produced inside
  // Generate Video (Step 8) — FIRST — then burned into the top-left corner
  // by the worker, whose narration also replaces the reel's voiceover.
  const flashHead = useFlashHead();
  // Finished avatar clip for this wizard session. Reused on retry so the
  // 8-credit add-on is charged once, and invalidated the moment any input
  // it was rendered from (script / voice / language / photo) changes.
  const [avatarVideoUrl, setAvatarVideoUrl] = useState<string | null>(null);
  const [renderPhase, setRenderPhase] = useState<'avatar' | 'video'>('video');
  useEffect(() => { setAvatarVideoUrl(null); }, [script, voice, language, profileImage]);
  // profileImage is Studio-level state so the Talking Head tab inherits it
  const setProfileImage = onProfileImageChange;
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const [musicTracks, setMusicTracks] = useState<Array<{ id: string; name: string; genre: string; url: string }>>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  // AI Write failures used to surface ONLY as a 5-second toast in the
  // corner while the agent watched the button — a missed toast reads as
  // "it spun and nothing happened". This error stays inline under the
  // button (with the real reason) until the next attempt.
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useStudioDraft<string[]>(studioDraftKey(user?.id, 'video:images'), []);
  // Reload the Studio after an hour and every draft photo's 1h presign has
  // died — the grid shows a few broken tiles and users read that as "it
  // doesn't upload more than 2 photos". Heal: re-sign dead slots (session-
  // gated, per-user prefix), persist the raw bucket form, render the fresh
  // signature. See lib/repairDraftPhotos.ts.
  const draftKey = studioDraftKey(user?.id, 'video:images');
  // photoMeta is keyed by photo URL, so a healed (re-signed) slot has to
  // carry its tags along — without the remap every photo read as "untagged"
  // after a presign repair even though the user had already tagged it.
  // (setPhotoMeta is declared further down; the callback only runs from an
  // effect after the first render, so the binding is live by then.)
  const videoPhotoRepair = useRepairDraftPhotos(draftKey, uploadedImages, setUploadedImages, (healed) => {
    setPhotoMeta(prev => {
      const next = { ...prev };
      let moved = false;
      for (const [oldUrl, newUrl] of Object.entries(healed)) {
        if (next[oldUrl]) {
          next[newUrl] = next[oldUrl];
          delete next[oldUrl];
          moved = true;
        }
      }
      return moved ? next : prev;
    });
  });
  const userFacingPhoto = (src: string) => videoPhotoRepair.display[src] || src;
  const videoOrder = useReorderable(setUploadedImages);
  // Prefilled photos (listing / project / description hand-off). Runs after
  // mount too, because the Studio consumes the queue in its own effect.
  useEffect(() => {
    if (initialImages.length) setUploadedImages(initialImages.slice(0, 12));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImages]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoDrag, setPhotoDrag] = useState(false);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const [lastRenderUrl, setLastRenderUrl] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState('');
  // Cancel an in-flight render: a ref (not state) so the 5s poll loop sees the
  // flag on its very next tick; the worker aborts at its next checkpoint and
  // the catch path below refunds the credits.
  const cancelRequestedRef = useRef(false);
  const recordIdRef = useRef<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Elapsed-vs-typical progress for the reel render (typical scales with clip count)
  const reelProgress = useRenderProgress(typicalVideoSeconds(uploadedImages.length || 1));
  // ── PER-CLIP REVIEW (Option 2, 2026-10-23) ──────────────────────────────
  // Set when generation finishes but assembly has NOT run: the worker parked
  // the job at `clips_ready` with every clip playable. The panel re-rolls bad
  // clips (paid per clip) and only then stitches. `projectId` is captured
  // from generateReel's local — that closure is gone once it returns.
  const [clipReview, setClipReview] = useState<{ recordId: string; clips: RenderClip[]; projectId?: string } | null>(null);
  const [rerollingIndex, setRerollingIndex] = useState<number | null>(null);
  const [assemblingReview, setAssemblingReview] = useState(false);

  // The tier catalog is the shared one (lib/videoTiers) — the same table the
  // server prices renders from, so the UI's credits/images/durations can
  // never drift from the charge. The render body sends the tier id + duration;
  // the worker looks up images/resolution/engine itself.
  const tierConfig = VIDEO_TIERS.find(t => t.id === tier) ?? VIDEO_TIERS[1];
  // Clamp: ESSENTIAL has two lengths, the AI tiers three. Switching from a
  // 90s Social config to Essential used to leave configIndex=2, so
  // selectedConfig was undefined for one render and the whole wizard threw.
  const activeConfigIndex = Math.min(configIndex, tierConfig.configurations.length - 1);
  const selectedConfig = tierConfig.configurations[activeConfigIndex];

  // Calculate target word count based on selected duration
  const calculateTargetWords = (durationSeconds: number) => {
    const wordsPerSecond = 2.4; // Average speaking rate
    return Math.round(durationSeconds * wordsPerSecond);
  };

  const targetWords = calculateTargetWords(selectedConfig.duration);
  // AI Write price for THIS duration — server-priced at the mint by the
  // same call (lib/renderPricing), so the badge can't drift from the charge.
  const scriptPrice = scriptCreditsForDuration(selectedConfig.duration);

  // Narration runs at the same 2.4 words/sec the target uses; when the voiced
  // script outlasts the render, the worker freezes the final frame to fit it.
  // Flag overruns ≥20% of the tier duration before the agent spends credits.
  const estimatedNarrationSec = Math.round(wordCount(script) / 2.4);
  // Live word budget for the input box (same count as the header label).
  const scriptWords = wordCount(script);
  const freezeOverrunSec = estimatedNarrationSec - selectedConfig.duration;
  const narrationTooLong = freezeOverrunSec >= Math.round(selectedConfig.duration * 0.2);

  // AI Write records the duration it was written FOR. Switching configs (30s
  // → 60s …) with a script not written for the new length used to silently
  // render with the WRONG-length narration (frozen tail or a script that
  // stops half way) — the popup asks for an explicit AI Write re-run.
  const scriptWrittenForSec = useRef<number | null>(null);
  const [durationMismatchSeen, setDurationMismatchSeen] = useState(false);
  useEffect(() => {
    if (
      script.trim() &&
      scriptWrittenForSec.current !== null &&
      scriptWrittenForSec.current !== selectedConfig.duration &&
      !durationMismatchSeen
    ) {
      setDurationMismatchSeen(true);
      toast.info(
        `Your script was written for a ${scriptWrittenForSec.current}s video but you selected ${selectedConfig.duration}s. Press AI Write again so the narration fills the new length (or accept the frozen extra seconds), then Generate.`,
        'Duration changed — re-write the script',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfig.duration]);

  // Where the script content should come from: the Listing details below
  // (auto-folded), a description handed over from the Description tab, or —
  // with neither — the uploaded photos via vision. Photos ALWAYS ride along
  // when present: what Grok sees in them refines the narration (finishes,
  // light, garden, views).
  const sharedDescription = sharedScript.trim();
  // Structured Step-1 facts as one compact block. Only non-empty fields are
  // included, so an untouched form adds nothing to the grounding. Price is
  // intentionally excluded — the video wizard no longer collects it.
  const listingSummary = (() => {
    const facts: string[] = [];
    if ((fields.address || '').trim()) facts.push(`Address: ${fields.address.trim()}`);
    if ((fields.propertyType || '').trim()) facts.push(`Property type: ${fields.propertyType}`);
    if ((fields.province || '').trim()) facts.push(`Province: ${fields.province}`);
    if ((fields.bedrooms || '').trim()) facts.push(`Bedrooms: ${fields.bedrooms}`);
    if ((fields.bathrooms || '').trim()) facts.push(`Bathrooms: ${fields.bathrooms}`);
    if ((fields.garages || '').trim()) facts.push(`Garages: ${fields.garages}`);
    if ((fields.erf || '').trim()) facts.push(`Erf size: ${fields.erf} m²`);
    if ((fields.floor || '').trim()) facts.push(`Floor size: ${fields.floor} m²`);
    if (selectedFeatures.length) facts.push(`Key features: ${selectedFeatures.join(', ')}`);
    if ((fields.extraFeatures || '').trim()) facts.push(`Extra features: ${fields.extraFeatures.trim()}`);
    return facts.join(' · ');
  })();
  const hasDescription = !!(sharedDescription || listingSummary);
  const primarySource: 'description' | 'photo_list' = hasDescription ? 'description' : 'photo_list';

  // Photo upload: presigned browser → S3, keeps the public URLs the render
  // worker rotates its A/B/C prompts against (fully server-side).
  // Backlog drain — see DescriptionTab. Photos uploaded while this panel
  // (or the whole route) was unmounted are collected here on return.
  useEffect(() => {
    const urls = drainBacklog('video');
    if (urls.length) setUploadedImages(prev => [...prev, ...urls].slice(0, selectedConfig.images));
  }, [uploadQueue, setUploadedImages, selectedConfig.images]);

  const handlePhotos = (list: FileList | null) => {
    if (!list || !list.length) return;
    const room = selectedConfig.images - uploadedImages.length - uploadQueue.pending;
    if (room <= 0) {
      toast.error(`This configuration takes ${selectedConfig.images} images — remove one first`, 'Photo limit reached');
      return;
    }
    // Type/size validation and the presign → PUT → verify round-trip move
    // into the background queue: a 429 parks the queue instead of this
    // handler, and each photo streams into the grid the moment S3 has it.
    setUploadingPhotos(true);
    enqueueImagesForAI(list, user?.id, room, {
      scope: 'video',
    }).finally(() => {
      setUploadingPhotos(false);
      if (photosInputRef.current) photosInputRef.current.value = '';
    });
  };

  // Reset config index when tier changes
  useEffect(() => {
    setConfigIndex(0);
  }, [tier]);

  // Load admin-managed music tracks for the picker
  useEffect(() => {
    fetch('/api/music')
      .then(r => r.json())
      .then(d => setMusicTracks(d.tracks || []))
      .catch(() => setMusicTracks([]));
  }, []);

  // Real AI script generation via fal-ai/any-llm, sized to the selected duration.
  // Source priority: (1) a Property Description the agent already wrote or
  // generated (shared with this tab), (2) Grok VISION over the uploaded
  // photos. The old call sent NEITHER — the script was invented with zero
  // grounding in the listing, so agents retyped it every time.
  //
  // Paid action: AI Writer costs 1 credit (script scope — priced server-side
  // by lib/renderPricing via job_token), confirmed by a popup BEFORE it runs,
  // and auto-refunded when generation fails. The returned script is trimmed
  // to the target word count for the selected duration so the narration can
  // never outlast the video (frozen-tail fix).
  const generateScript = async () => {
    if (!user) { toast.error('Sign in to use AI Write'); return; }
    if ((user.credits ?? 0) < scriptPrice) {
      toast.error(`Not enough credits — AI Write for a ${selectedConfig.duration}s script costs ${scriptPrice} credit${scriptPrice === 1 ? '' : 's'}. Top up in Credits.`, 'Insufficient credits');
      return;
    }
    const descriptionPart = sharedDescription;
    // The structured Step-1 Listing details ride along with whatever
    // description exists (or stand alone as the grounding when only the
    // form is filled — the normal case since the free-text slot is gone).
    const source = [descriptionPart, listingSummary].filter(Boolean).join('\n\n');
    if (primarySource === 'photo_list') {
      toast.info(
        'No listing details yet — the script will be written from your uploaded photos instead.',
        'Writing from photos'
      );
    }
    setGeneratingScript(true);
    setScriptError(null);
    try {
      // The charge: the mint prices the script server-side (1 credit),
      // deducts it, and returns a token the worker refuses to generate
      // without — so a modified client can't get free scripts.
      const authHeaders = await jobHeaders('script', {
        metadata: { kind: 'VIDEO_SCRIPT', duration: selectedConfig.duration },
      });
      void refresh(); // the balance display — the charge landed server-side
      const text = await PropReelAPI.generateText('video_script', {
        tier,
        duration_seconds: selectedConfig.duration,
        target_words: targetWords,
        language,
        language_label: SA_LANGUAGES.find(l => l.id === language)?.label ?? 'English',
        // Grounding: the Property Description (this tab's slot first, then
        // the Description tab's shared copy) when one exists, plus a
        // photos-are-alongside signal; vision images also ride along so the
        // model can see what it is narrating. With NO description at all,
        // the photos are the only source and the model must describe them.
        ...(source
          ? { property_description: source, photos_supplement: uploadedImages.length > 0 }
          : { describe_photos: true }),
      }, uploadedImages, authHeaders);
      // Enforce the target word count for the selected duration — always
      // slightly LESS than the video length is fine, never more. LLMs drift
      // past the requested count (~30s scripts landing at 100+ words made
      // the 30s video run 38s on a frozen last frame).
      // TRIM ON SENTENCE BOUNDARIES: the old mid-word slice cut the last
      // sentence in half ("this is the perfect") — narration then ended
      // mid-thought. Split on terminal punctuation and keep only whole
      // sentences that fit; facts are dropped, never a half-thought.
      const raw = text.replace(/\s+/g, ' ').trim();
      const sentences = raw.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g) || [raw];
      let count = 0, keptCount = 0;
      const kept: string[] = [];
      for (const s of sentences) {
        const n = s.trim().split(/\s+/).filter(Boolean).length;
        if (count + n > targetWords && keptCount >= 1) break;
        if (count + n > targetWords) break; // degenerate: first sentence already over
        kept.push(s.trim()); count += n; keptCount++;
      }
      const trimmed = kept.length ? kept.join(' ') : raw;
      setScript(trimmed);
      scriptWrittenForSec.current = selectedConfig.duration; // regenerated for THIS length
      if (count < sentences.filter(s => s.trim()).length) {
        toast.info(`The script ran long — trimmed to complete sentences within the ${targetWords}-word target for a ${selectedConfig.duration}s read.`, 'Script sized to duration');
      }
    } catch (e: any) {
      // A failed generation refunds the script charge (server-verified once).
      await refundCredits('script').catch(() => {});
      const msg = e?.message || `Script generation failed — your ${scriptPrice} credit${scriptPrice === 1 ? '' : 's'} were refunded`;
      setScriptError(msg);
      toast.error(msg);
    } finally {
      setGeneratingScript(false);
    }
  };

  // Cancel the in-flight render: flag the poll loop to stop, tell the worker
  // to abort the job (it checks before every clip / fal poll), then the catch
  // path in generateReel refunds the credits and fails the project record.
  const cancelRender = async () => {
    if (cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    setCancelling(true);
    // Avatar phase: useFlashHead owns that job — cancel there (it posts its
    // own worker cancel and refunds the 8 credits).
    if (renderPhase === 'avatar') {
      flashHead.cancel();
      return;
    }
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

  const generateReel = async () => {
    setGenerating(true);
    setRenderPhase('video');
    reelProgress.start();
    const recordId = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    recordIdRef.current = recordId;
    cancelRequestedRef.current = false; // the flag belongs to THIS render only
    setCancelling(false);
    // Hoisted out of the try: the catch path fails the project record so the
    // nightly reaper (PROCESSING rows only) can never refund it a second time.
    let projectId: string | null = null;
    let wasCancelled = false;
    // Refund below only if THIS deduction actually landed — the old
    // unconditional refund minted the full tier price for users who simply
    // didn't have enough credits to render.
    let charged = false;

    try {
      // 1) Create the project record first (real data in propreel-projects).
      // Titles feed the Social Pack captions, so never cut mid-word (legacy
      // rows showed "…three-bedroo") — and keep the full script as the
      // project description so captions can quote a complete sentence.
      const scriptClean = script.replace(/\s+/g, ' ').trim();
      const videoTitle = !scriptClean ? 'Property Video'
        : scriptClean.length > 60 ? `${scriptClean.slice(0, 57).replace(/\s+\S*$/, '')}…`
        : scriptClean;
      // projectId is hoisted above the try — the catch path fails the record
      if (user) {
        try {
          const project = await PropReelAPI.createProject({
            userId: user.id,
            title: videoTitle,
            description: scriptClean || undefined,
            status: 'PROCESSING',
            videoTier: tier,
            durationSeconds: selectedConfig.duration,
            jobId: recordId,
            creditsSpent: selectedConfig.credits,
          } as any);
          projectId = project.id;
        } catch { /* non-fatal — render can still proceed */ }
      }

      // 2) AI Avatar add-on (Step 6): render the lip-sync clip FIRST — the
      //    finished clip rides into the video render below, where the worker
      //    burns it into the top-left corner and uses its narration INSTEAD
      //    of the reel's own voiceover. FlashHead mints its own job token
      //    priced per 10s of narration (the render token below still covers
      //    the tier price only), and a clip already rendered this session is
      //    reused, so a retry never pays twice.
      let avatarUrl: string | null = avatarVideoUrl;
      if (aiTalkingProfile && !avatarUrl) {
        // Same pricing the server will apply — computed from THIS script.
        const avatarAddonCredits = flashheadCreditsForText(script);
        if (avatarAddonCredits == null) {
          throw new Error(`The voiceover script is too long for the AI Avatar — narration is capped at ${FLASHHEAD_MAX_SECONDS}s (~${Math.floor(FLASHHEAD_MAX_SECONDS * NARRATION_WORDS_PER_SEC)} words). Shorten it on Step 5, or switch the AI Avatar off on Step 6.`);
        }
        if ((user?.credits ?? 0) < avatarAddonCredits) {
          throw new Error(`Not enough credits — the AI Avatar add-on costs ${avatarAddonCredits} credits for this script (~${Math.round(narrationSecondsForText(script))}s of narration). Top up, or switch the AI Avatar off on Step 6.`);
        }
        setRenderPhase('avatar');
        const avatarOpts: Parameters<typeof flashHead.generate>[0] = {
          voiceoverText: script,
          voice,
          language,
        };
        if (profileImage?.startsWith('data:')) {
          try {
            avatarOpts.file = await dataUrlToFile(profileImage);
          } catch {
            throw new Error('Could not reuse your avatar photo — please pick it again on Step 6');
          }
        } else if (profileImage) {
          avatarOpts.imageUrl = profileImage;
        } else {
          throw new Error('Choose your avatar picture on Step 6 (or switch the AI Avatar off)');
        }
        const avatarRes = await flashHead.generate(avatarOpts);
        if (!avatarRes) {
          // useFlashHead refunded its actual charge already (or the agent
          // cancelled mid-avatar) — surface the right verdict here.
          if (cancelRequestedRef.current) {
            wasCancelled = true;
            throw new Error('Render cancelled');
          }
          throw new Error('AI Avatar render failed — its credits were refunded. Check the photo on Step 6 and the script on Step 5, then try again.');
        }
        avatarUrl = avatarRes.videoUrl;
        setAvatarVideoUrl(avatarUrl);
      }
      if (cancelRequestedRef.current) {
        wasCancelled = true;
        throw new Error('Render cancelled');
      }
      setRenderPhase('video');

      // 3) Pay for the job at mint time: ?action=job_token charges the credits
      //    server-side at the price in lib/renderPricing and returns a
      //    single-use token the worker will not render without (and will not
      //    accept twice). Same charge, same ledger reasons as the old
      //    client-side deduct — but the browser no longer decides the price
      //    or whether to pay at all. Minted AFTER the avatar step so a slow
      //    avatar render can never outlive the token's acceptance window.
      const usePool = (user?.agencyPoolCredits ?? 0) > 0;
      const jobToken = await jobHeaders('render', {
        tier,
        configIndex,
        voiceoverText: avatarUrl || noNarration ? '' : script,
        metadata: { tier, duration: selectedConfig.duration, recordId },
        pool: usePool ? 'agency' : 'personal',
      });
      charged = true;
      void refresh(); // the balance display — the charge landed server-side

      // Branding + avatar artwork for the worker's burn-in. The DEFAULT
      // profile's photo/logo/contact ride along only when Agent Profile
      // Branding is on; with the AI Avatar add-on on, its finished clip
      // (rendered in step 2 above) rides along as avatar_video_url — the
      // worker composites it top-left and uses its narration INSTEAD of the
      // reel's TTS. The static corner photo is skipped there (the avatar
      // owns that corner); with branding off, only avatar params travel.
      const brandProfile = user?.agentProfiles?.find(p => p.isDefault) || user?.agentProfiles?.[0];
      const contactLine = brandProfile
        ? [brandProfile.fullName, brandProfile.phone, brandProfile.email]
            .filter(Boolean).join(' · ')
        : '';
      const hostedPhoto = brandProfile?.photoUrl && !brandProfile.photoUrl.startsWith('data:') ? brandProfile.photoUrl : undefined;
      const brandingPayload = (branding || aiTalkingProfile) ? {
        ...(branding ? {
          photo_url: hostedPhoto,
          logo_url: brandProfile?.logoUrl || undefined,
          contact_line: contactLine || undefined,
        } : {}),
        use_avatar: !!aiTalkingProfile,
        use_avatar_url: aiTalkingProfile && profileImage && !profileImage.startsWith('data:') ? profileImage : undefined,
        avatar_video_url: avatarUrl || undefined,
      } : undefined;

      // 4) Start the async render job
      if (cancelRequestedRef.current) { wasCancelled = true; throw new Error('Render cancelled'); }
      // Bounded: a hung POST (Modal cold container, mobile drop) used to
      // leave the spinner dead-air for the whole 25-minute deadline. 45s is
      // far above the endpoint's real latency (claim + S3 write + spawn).
      const START_TIMEOUT_MS = 45_000;
      let response: Response;
      try {
        response = await fetch(`${RENDER_ENDPOINT}/render_video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...jobToken },
          body: JSON.stringify({
            record_id: recordId,
            tier,
            config_index: configIndex,
            orientation,
            images: uploadedImages,
            // 2026-10-21 ENGINE UNIFICATION: every AI tier renders on
            // MiniMax Hailuo-02 standard with the GENTLE Budget prompts —
            // the client's A/B verdict was that Wan's bold deck warped
            // geometry and invented rooms while the Budget reels came back
            // clean. The same buildBudgetCameraPayload the Budget tab sends
            // rides `image_prompts` (the worker's highest-precedence prompt
            // field), so the text is byte-identical across every tier. The
            // old `photo_meta` cinematic mapping is deliberately not sent.
            image_prompts: buildBudgetCameraPayload(uploadedImages, photoMeta),
            voiceover_text: avatarUrl ? '' : (noNarration ? '' : script),
            voice_id: voice,
            language,
            include_agent_branding: branding,
            audio: false,
            // PER-CLIP REVIEW (Option 2): AI tiers pause at `clips_ready`
            // before assembly so the agent watches and re-rolls each clip.
            // ESSENTIAL (local FFmpeg) has no clips and ignores the flag.
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
        throw new Error(err.detail || 'Failed to start video generation');
      }

      const result = await response.json();
      track('render_started', { tier, orientation });

      // 5) Poll /render_status until terminal (ESSENTIAL renders synchronously
      // and return video_url immediately). The loop itself lives in
      // lib/renderPoll — ONE state machine for every render, both tabs,
      // including the 2026-10-23 review gate (`clips_ready`).
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
          // PER-CLIP REVIEW GATE (Option 2): every clip exists, the reel is
          // NOT assembled. Park the wizard on Step 8 with the review panel —
          // the render charge stands (generation really happened), so return
          // BEFORE the catch path: no refund, no FAILED row.
          setClipReview({ recordId: result.record_id, clips: outcome.clips, projectId: projectId ?? undefined });
          track('render_review_entered', { tier });
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

      // 6) Finalize the project record
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
      toast.success('Video rendered successfully!', 'Render Complete');
    } catch (error: any) {
      console.error('Error generating video:', error);
      // Fail the record FIRST: the nightly reaper only refunds PROCESSING
      // rows, so once this lands the refund below is the only one that runs.
      if (user && projectId) {
        PropReelAPI.updateProject(user.id, projectId, { status: 'FAILED' }).catch(() => {});
      }
      // Refund only what was actually taken — a deduction that failed (not
      // enough credits) must not add credits to the balance. The SERVER
      // prices the reversal from the real ledger row (self-refund guard).
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

  // ── PER-CLIP REVIEW actions (Option 2) ────────────────────────────────
  // Re-roll price for THIS tier/config — the clip's share of the tier price
  // (server-priced by lib/renderPricing; the same number the mint charges).
  const rerollCredits = rerenderClipCredits(tier, configIndex);

  /** The reel exists: player, READY project row, fanfare. `pid` is the
   *  project row the review captured — generateReel's local is long gone. */
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
    toast.success('Video rendered successfully!', 'Render Complete');
  };

  /**
   * One verdict path for "the job left the review without us": finalize on
   * `completed`; on cancel/failure fail the row + refund the render charge
   * (server-idempotent — a deduction is never reversed twice); report
   * 'reviewing' when the job is still parked at `clips_ready` so callers
   * keep the panel open instead of failing a live review.
   */
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

  /**
   * Re-roll ONE clip: paid rerender mint → POST /rerender_clip → bounded
   * watch of the job's marker (lib/renderPoll). Every non-success verdict
   * refunds the re-roll charge, and the worker keeps the OLD clip on
   * failure — a failed re-roll can never break the review or cost twice.
   */
  const handleRerender = async (index: number, promptOverride?: string) => {
    if (!clipReview || rerollingIndex !== null || assemblingReview) return;
    const { recordId, clips, projectId: pid } = clipReview;
    const previous = clips[index]?.rerendered_at;
    setRerollingIndex(index);
    let charged = false;
    try {
      const mint = await jobHeaders('rerender', {
        tier,
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
        track('clip_rerolled', { tier, clip_index: index });
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

  /**
   * Finish the review: assemble the CURRENT clips (free — the original
   * render charge already paid for this exact reel) and poll to a verdict
   * through the SAME shared loop the first phase used. The existing Cancel
   * button works here too: it flips cancelRequestedRef and the loop returns
   * `cancelled` into the same refund path.
   */
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
      track('render_assembled', { tier });
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
        // Defensive: the resume path passes review=False so assembly can't
        // pause — but never lose a live review if the worker ever says so.
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

  /** Cancel from the review panel — same contract as cancel during
   *  generation: tell the worker (best-effort), fail the row, refund the
   *  render charge. Re-roll charges stand — those fal calls really ran. */
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

  // Avatar add-on is priced per 10s of narration from the CURRENT script —
  // null ⇒ over the 90s cap (the Render step blocks until it is shortened).
  const avatarAddonCredits = aiTalkingProfile ? flashheadCreditsForText(script) : null;
  // Narration add-on: +1 only for a voiceover without the avatar (the same rule
  // lib/renderPricing applies server-side at the job_token mint).
  const narrationAddonCredits = !aiTalkingProfile && !noNarration && script.trim() ? NARRATION_CREDITS : 0;
  const totalCredits = selectedConfig.credits + (avatarAddonCredits ?? 0) + narrationAddonCredits;

  // ── 8-step wizard (same numbered-step UX as New Listing) ─────────────
  // Steps 1–4 are the core setup; 5–8 are optional add-ons the agent can
  // skip past. All form state lives in this component, so stepping back and
  // forth never loses an edit. The voiceover is chosen ONLY on Step 5;
  // Step 6 picks the AI Avatar picture + toggle; Step 8 renders the avatar
  // FIRST, then the video with the avatar burned into the top-left corner.
  const WIZARD_STEPS = [
    { id: 'description', label: 'Listing details' },
    { id: 'tier', label: 'Tier & Config' },
    { id: 'orientation', label: 'Orientation' },
    { id: 'photos', label: 'Photos' },
    { id: 'voiceover', label: 'Voiceover' },
    { id: 'avatar', label: 'AI Avatar' },
    { id: 'extras', label: 'Music & Branding' },
    { id: 'render', label: 'Render' },
  ];
  const [step, setStep] = useState(0);
  // Per-photo camera metadata (interior/exterior + camera move) — the render
  // picks the exact per-photo prompt from it, and it gates leaving the Photos
  // step. Kept as {photoUrl: {roomType, move, dayToNight}} so a removed photo's entry is
  // simply ignored (the gate only ever reads entries for current photos).
  const [photoMeta, setPhotoMeta] = useStudioDraft<Record<string, PhotoMeta>>(studioDraftKey(user?.id, 'video:photoMeta'), {});
  const setPhotoMetaFor = (url: string, patch: Partial<PhotoMeta>) =>
    setPhotoMeta(prev => {
      const prior = prev[url];
      // Explicit precedence (patch > existing > default) — an object-spread
      // version of this either tripped TS2783 or let the defaults clobber
      // the existing tags when a button patches only ONE of the fields.
      const roomType = patch.roomType ?? prior?.roomType ?? 'interior';
      const move = patch.move ?? prior?.move ?? 'in';
      // 2026-10-29: day→night drift defaults ON — the deck's historic
      // behaviour — so a draft saved before the toggle renders unchanged.
      const dayToNight = patch.dayToNight ?? prior?.dayToNight ?? true;
      return { ...prev, [url]: { roomType, move, dayToNight } };
    });
  // Photos are the first hard gate — a reel without images can't render.
  // (2026-10-15: Photos moved after Orientation — agents pick the frame
  // FIRST, so the orientation tip shapes how they shoot/upload the set.)  // 2026-10-18: SECOND gate — every uploaded photo must carry BOTH a
  //   room-type (interior/exterior) and a camera move before the agent can
  //   advance. The move list depends on the room type: EXTERIOR unlocks the
  //   extra "Zoom out" move (a pull-back reveal) that INTERIOR does not get,
  //   because retreating out of an interior space exits the room. The render
  //   maps (roomType, move) to one of the eight authoritative camera prompts.
  // 2026-10-29: ESSENTIAL is exempt — it renders on the local Ken Burns path
  //   (the worker reads only A/B/C prompt_ids there, never roomType/move), so
  //   the two per-photo controls are hidden and the gate is skipped for it.
  //   The other 3 AI tiers (Social / Cinematic / Premium) keep both.
  const needsPhotoMeta = tier !== 'ESSENTIAL';
  const photosMissingMeta = step === 3 && needsPhotoMeta
    ? uploadedImages.filter(u => { const m = photoMeta[u]; return !m || !m.roomType || !m.move; }).length
    : 0;
  // "Next" stays locked while the script-language verdict is in flight —
  // advancing during "Checking the script language…" could push a mismatch
  // straight past the banner and into a paid render. The one-click
  // translation locks it too: the rewrite arrives as one big paste that
  // re-arms the check, so nothing may advance mid-rewrite.
  const langChecking = langCheck.status === 'checking';
  const langTranslating = langCheck.translating;
  const langBusy = langChecking || langTranslating;
  // 2026-10-27: THIRD gate — an unresolved script-vs-language mismatch
  // locks "Next" until the agent picks one of the banner's two options
  // ("Translate to X" / "Keep as is"). Unlike the busy/photo gates the
  // button stays PRESSABLE while this gate is shut (dimmed + aria-disabled),
  // so pressing it can explain the block in a warning dialog instead of
  // silently doing nothing: the narrator reads the script exactly as
  // written, so a mismatched Voiceover Language + Voiceover Script produces
  // mangled narration that destroys the video.
  const langMismatch = langCheck.status === 'mismatch';
  const photosBlocked = step === 3 && (uploadedImages.length === 0 || photosMissingMeta > 0);
  const canNext = !langBusy && !langMismatch && !photosBlocked;
  const nextStep = () => {
    if (step >= WIZARD_STEPS.length - 1 || langBusy || photosBlocked) return;
    if (langMismatch) {
      void confirm(
        `Your Voiceover Language (${langCheck.languageLabel}) and your voiceover script (${langCheck.detectedLabel ?? 'another language'}) don\u2019t match, so you can\u2019t move on to the next step yet.\n\n` +
        `The narrator reads the script exactly as written \u2014 there is no auto-translation \u2014 so a mismatched Voiceover Language and Voiceover Script produce a mangled voiceover that will destroy the video.\n\n` +
        `Choose "Translate to ${langCheck.languageLabel}" to rewrite the script, or "Keep as is" to accept the risk.`,
        { title: 'Voiceover Language does not match the script', confirmLabel: `Translate to ${langCheck.languageLabel} (${langCheck.translateCostLabel})`, cancelLabel: 'Keep as is' }
      ).then((choice) => {
        // Explicit choice only: the buttons resolve the gate directly —
        // Escape/backdrop closes without choosing (undefined) and leaves
        // the gate shut.
        if (choice === true) void langCheck.translate();
        else if (choice === false) langCheck.dismiss();
      });
      return;
    }
    setStep(step + 1);
  };
  const prevStep = () => setStep(s => Math.max(0, s - 1));
  // Listing details → Voiceover Script: arriving at the Voiceover step
  // pre-fills it from the Step-1 Listing details (listingSummary), so the
  // agent starts from the real facts (then edits or AI-Writes over it)
  // instead of a blank textarea. Fires on ARRIVAL only — a script the agent
  // clears while staying on the step is never resurrected.
  // 2026-10-29: also REFRESHES a box that still holds the previous
  // auto-prefill byte-for-byte (the agent went back and edited Step 1 — the
  // old details used to sit there unchanged, so the new ones never appeared).
  // Text the agent actually wrote (typed, AI-Written, or seeded by the
  // Create Reel hand-off) is never overwritten — only an untouched prefill is.
  const lastWizardStepRef = useRef(step);
  const prefilledScriptRef = useRef<string | null>(null);
  useEffect(() => {
    if (step === 4 && lastWizardStepRef.current !== 4 && listingSummary) {
      const untouchedPrefill = prefilledScriptRef.current !== null && script === prefilledScriptRef.current;
      if (!script.trim() || untouchedPrefill) {
        setScript(listingSummary);
        prefilledScriptRef.current = listingSummary;
      }
    }
    lastWizardStepRef.current = step;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  // Step 3 now latches as "Photos chosen at orientation time" — see the
  // ORIENTATION_PHOTO_TIP render in the orientation block for why.

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Video className="w-5 h-5 text-purple-400" /> AI Video Generator</h2>

      {/* Wizard steps — same numbered layout as the New Listing flow */}
      <div className="flex items-center">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.id} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
            {i > 0 && <div className={`h-0.5 flex-1 mx-2 ${i <= step ? 'bg-purple-600' : 'bg-white/10'}`} />}
            <div className="flex flex-col items-center gap-1" aria-current={i === step ? 'step' : undefined}>
              <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${
                i < step ? 'bg-purple-700 text-white' : i === step ? 'bg-purple-700/30 border border-purple-500 text-white' : 'bg-white/10 text-ink-400'
              }`}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </span>
              <span className={`text-[11px] hidden sm:block ${i === step ? 'text-white' : 'text-ink-500'}`}>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Step 1 — Listing details (auto-added to AI Write) */}
      {step === 0 && (
      <div>
        {/* Structured listing facts — auto-folded into the AI Write
            grounding (generateScript appends listingSummary), so the
            voiceover speaks the real price/beds/features. Same field set
            as the Property Description page. */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-purple-300">Listing details — auto-added to AI Write in the Voiceover Script step</p>
            <button
              type="button"
              onClick={() => {
                setFields({ address: '', price: '', propertyType: 'House', province: '', bedrooms: '', bathrooms: '', garages: '', erf: '', floor: '', extraFeatures: '' });
                setSelectedFeatures([]);
                toast.info('Listing details cleared', 'Step 1');
              }}
              className="text-xs text-ink-400 hover:text-red-400 shrink-0"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><label className="label">Address</label><input className="input" value={fields.address} onChange={setField('address')} placeholder="Street, suburb, city" aria-label="Address" /></div>
            <div>
              <label className="label">Property Type</label>
              <select className="input" value={fields.propertyType} onChange={setField('propertyType')} aria-label="Property Type">
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Province</label>
              <select className="input" value={fields.province} onChange={setField('province')} aria-label="Province">
                <option value="">Select province…</option>
                {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div><label className="label">Bedrooms</label><input className="input" type="number" value={fields.bedrooms} onChange={setField('bedrooms')} placeholder="5" /></div>
            <div><label className="label">Bathrooms</label><input className="input" type="number" value={fields.bathrooms} onChange={setField('bathrooms')} placeholder="4" /></div>
            <div><label className="label">Garages</label><input className="input" type="number" value={fields.garages} onChange={setField('garages')} placeholder="3" /></div>
            <div><label className="label">Erf Size (m²)</label><input className="input" type="number" value={fields.erf} onChange={setField('erf')} placeholder="600" /></div>
            <div><label className="label">Floor Size (m²)</label><input className="input" type="number" value={fields.floor} onChange={setField('floor')} placeholder="280" /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Key Features <span className="text-ink-500 font-normal">({selectedFeatures.length} selected)</span></label>
              {selectedFeatures.length > 0 && (
                <button onClick={() => setSelectedFeatures([])} className="text-xs text-ink-400 hover:text-red-400">Clear</button>
              )}
            </div>
            <FeatureChips selected={selectedFeatures} onToggle={toggleFeature} />
          </div>
          <div>
            <label className="label">Extra features (optional)</label>
            <input className="input" value={fields.extraFeatures} onChange={setField('extraFeatures')} placeholder="gas stove, walk-in pantry, skyline views" />
          </div>
        </div>
      </div>
      )}

      {/* Step 2 — Video Tier / Configuration */}
      {step === 1 && (<>
      <div>
        <div className="flex items-center justify-between">
          <label className="label">Video Tier</label>
          <button
            type="button"
            onClick={() => {
              tierTouchedRef.current = false;
              const social30 = VIDEO_TIERS.find(t => t.id === 'SOCIAL')?.configurations[0]?.credits ?? 34;
              setTier((user?.credits ?? 0) < social30 ? 'ESSENTIAL' : 'SOCIAL');
              setConfigIndex(0);
              toast.info('Tier reset', 'Step 2');
            }}
            className="text-xs text-ink-400 hover:text-red-400"
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* BUDGET renders from its own studio tab (gentle Hailuo-02 motion,
              no voiceover/avatar wizard) — it is priced from the same
              lib/videoTiers table like every tier, but does not belong in
              this picker. */}
          {TIERS.filter(t => t.id !== 'BUDGET').map(t => {
            const minCredits = Math.min(...t.configurations.map(c => c.credits));
            const maxCredits = Math.max(...t.configurations.map(c => c.credits));
            const creditRange = minCredits === maxCredits ? `${minCredits}` : `${minCredits}-${maxCredits}`;
            return (
              <button key={t.id} onClick={() => { tierTouchedRef.current = true; setTier(t.id); }} className={`p-4 rounded-xl text-left transition ${tier === t.id ? 'bg-purple-700/20 border border-purple-500/30' : 'bg-white/5 hover:bg-white/10'}`}>
                <p className={`font-bold ${tier === t.id ? 'text-purple-300' : 'text-white'}`}>{t.label}</p>
                <p className="text-xs text-ink-400 mt-1">{t.description}</p>
                <p className="text-xs text-ink-500 mt-1">
                  {t.resolution} • {t.configurations.length} options
                </p>
                <p className="text-sm font-semibold text-purple-400 mt-2">{creditRange} credits</p>
              </button>
            );
          })}
        </div>
        {/* Cross-link to the sibling studio (audit §2/§6): two video tools,
            one job — say plainly which to pick and link both ways. */}
        <p className="text-xs text-ink-400 mt-3">
          Watching the budget? <Link to="/dashboard/budget-video" className="text-purple-300 underline hover:text-purple-200">Budget AI Video</Link> renders a calm 30-second reel from 5 photos at 512p/768p — no voiceover, no avatar, fewer credits.
        </p>
      </div>

      <div>
        <label className="label">Configuration</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {tierConfig.configurations.map((config, idx) => (
            <button 
              key={idx} 
              onClick={() => setConfigIndex(idx)} 
              className={`p-4 rounded-xl text-left transition ${configIndex === idx ? 'bg-purple-700/20 border border-purple-500/30' : 'bg-white/5 hover:bg-white/10'}`}
            >
              <p className={`font-bold ${configIndex === idx ? 'text-purple-300' : 'text-white'}`}>
                {config.duration}s Video
              </p>
              <p className="text-xs text-ink-400 mt-1">{config.images} images</p>                  <p className="text-sm font-semibold text-purple-400 mt-2">{config.credits} credits ≈ {creditListZar(config.credits)}</p>
            </button>
          ))}
        </div>
      </div>

      </>)}

      {/* Step 4 — Property Photos (after Orientation — see Step 3 note) */}
      {step === 3 && (
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
          <p className="text-ink-500 text-xs mt-1">Up to {selectedConfig.images} images for {selectedConfig.duration}s video — JPEG/PNG/WEBP up to 25MB</p>
        </div>
        {/* 2026-10-15: bigger thumbnails (2-col mobile / 3-col desktop,
            4:3 instead of square) — agents couldn't see what was in each
            photo at the old 5-up grid when picking the reel order */}
        {uploadedImages.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            {uploadedImages.map((src, i) => (
              <div key={src} className={videoOrder.dragClass(i, 'relative group')} {...videoOrder.dragProps(i)}>
                <img src={userFacingPhoto(src)} alt={`Photo ${i + 1}`} className="w-full aspect-[4/3] object-cover rounded-lg border border-white/10 pointer-events-none" draggable={false} />
                <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">{i + 1}</span>
                <button
                  onClick={e => { e.stopPropagation(); setUploadedImages(prev => prev.filter((_, idx) => idx !== i)); }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 transition"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <X className="w-3 h-3" />
                </button>
                {/* Per-photo camera metadata — required before leaving this
                    step for the 3 AI tiers. Hidden on ESSENTIAL (local Ken
                    Burns render ignores it), where leaving the step needs no
                    tags at all. Room type drives the move list: EXTERIOR also
                    gets the pull-back (Zoom out); INTERIOR never does, because
                    retreating out of a room exits it. */}
                {needsPhotoMeta && (
                <div className="mt-2 space-y-2 rounded-lg bg-black/40 p-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wide text-ink-500">Photo is from a</span>
                    <div className="flex gap-1 mt-1">
                      {(['interior', 'exterior'] as const).map(rt => (
                        <button
                          key={rt}
                          type="button"
                          onClick={e => { e.stopPropagation(); setPhotoMetaFor(src, { roomType: rt, move: 'in' }); }}
                          className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition ${photoMeta[src]?.roomType === rt ? 'bg-purple-600 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}
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
                          className={`rounded px-2 py-1 text-[11px] font-medium transition ${photoMeta[src]?.move === mv ? 'bg-purple-600 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}
                        >
                          {CAMERA_MOVE_LABEL[mv]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 2026-10-29 DAY→NIGHT: third tag per photo — does this
                      clip's light drift from day into night? ON keeps the
                      deck's golden-hour / dusk drift (the historic
                      behaviour); OFF selects BUDGET_CAMERA_PROMPTS_STEADY,
                      the same prompt rewritten to hold steady daylight.
                      Rendered under the same needsPhotoMeta gate as the
                      two rows above, so ESSENTIAL never sees it. */}
                  <div>
                    <span className="text-[10px] uppercase tracking-wide text-ink-500">Dusk sweep</span>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      {([
                        { on: true, label: 'Day → Night' },
                        { on: false, label: 'Daylight only' },
                      ] as const).map(opt => {
                        const selected = (photoMeta[src]?.dayToNight ?? true) === opt.on;
                        return (
                          <button
                            key={String(opt.on)}
                            type="button"
                            onClick={e => { e.stopPropagation(); setPhotoMetaFor(src, { dayToNight: opt.on }); }}
                            aria-pressed={selected}
                            className={`rounded px-2 py-1 text-[11px] font-medium transition ${selected ? 'bg-purple-600 text-white' : 'bg-white/5 text-ink-300 hover:bg-white/10'}`}
                            title={opt.on
                              ? "This clip's light drifts from day into night — golden hour, then dusk lights in the windows"
                              : "Hold steady daylight for the whole clip — no golden hour, no dusk"}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      )}

      {/* Step 3 — Orientation (moved BEFORE Photos 2026-10-15: pick the
          frame first — the orientation tip then tells the agent what to
          watch for when they upload the set) */}
      {step === 2 && (
      <div>
        <div className="flex items-center justify-between">
          <label className="label">Orientation</label>
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

      {/* Step 5 — Voiceover Script / Language / Narrator Voice (optional) */}
      {step === 4 && (<>
      <div>
        <label className="label">Voiceover Language</label>
        <select
          className="input"
          value={language}
          onChange={e => onLanguageChange(e.target.value)}
          aria-label="Voiceover language"
        >
          {SA_LANGUAGES.map(l => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <div className="flex items-center justify-between mt-4">
          <label className="label">
            Voiceover Script 
            <span className="text-xs text-ink-400 ml-2">
              ({wordCount(script)} / {targetWords} words, ~{estimatedNarrationSec}s)
            </span>
          </label>
          <div className="flex items-center gap-3">
            {script && (
              <button
                type="button"
                onClick={() => { setScript(''); scriptWrittenForSec.current = null; if (scriptError) setScriptError(null); toast.info('Voiceover script cleared', 'Step 5'); }}
                disabled={generatingScript}
                className="text-xs text-ink-400 hover:text-red-400 disabled:opacity-40"
              >
                Clear
              </button>
            )}
          {/* Paid action: AI Write is priced by duration (ceil(duration/30)
              ⚡, server-priced at the mint) — say so BEFORE it runs. The
              shared confirm modal keeps the guarantee (nothing is charged
              unless the agent explicitly accepts) with zero render-path state. */}
          <button 
            onClick={() => {
              const price = scriptCreditsForDuration(selectedConfig.duration);
              confirm(`AI Write for a ${selectedConfig.duration}s script costs ${price} credit${price === 1 ? '' : 's'}.\n\nIt writes the voiceover from your Listing details and uploaded photos, sized to the ${selectedConfig.duration}s duration (${targetWords} words).\n\nGenerate now?`, { title: 'Generate AI script?', confirmLabel: 'Generate' }).then((ok) => {
                if (ok) generateScript();
              });
            }} 
            disabled={generatingScript} 
            title={`Costs ${scriptPrice} credit${scriptPrice === 1 ? '' : 's'} at ${selectedConfig.duration}s — confirmed before running`}
            className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
          >
            {generatingScript ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI Write {generatingScript ? '' : `· ${scriptPrice}⚡`}
          </button>
          </div>
        </div>
        {generatingScript && (
          <p className="text-xs text-ink-500 mt-1">
            {uploadedImages.length
              ? 'Writing from your listing details and photos — this can take up to a minute…'
              : 'Writing your script — a few seconds…'}
          </p>
        )}
        {scriptError && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/40 p-3" role="alert">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-300 mt-0.5" />
            <p className="text-xs text-red-300">{scriptError}</p>
          </div>
        )}
      {/* Live word budget: remaining words left in the duration target, updating
          as the agent types, with a warning the moment the script exceeds it —
          the frozen-tail problem, surfaced before any credits are spent. */}
      <div className="flex items-center gap-2 text-xs mb-1" aria-label="Word budget">
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full ${scriptWords > targetWords ? 'bg-red-500' : scriptWords > targetWords - 12 ? 'bg-amber-400' : 'bg-purple-500'}`}
            style={{ width: `${Math.min(100, (scriptWords / Math.max(1, targetWords)) * 100)}%` }}
          />
        </div>
        <span className={`shrink-0 ${scriptWords > targetWords ? 'text-red-400 font-semibold' : 'text-ink-500'}`}>
          {scriptWords > targetWords ? `${scriptWords - targetWords} over` : `${Math.max(0, targetWords - scriptWords)} left`} of {targetWords}
        </span>
      </div>
      <textarea 
        className={`input min-h-[120px] ${scriptWords > targetWords ? 'border-red-500/50' : ''}`} 
        value={script} 
        onChange={e => { setScript(e.target.value); if (scriptError) setScriptError(null); }} 
        placeholder={`Write your voiceover script or use AI to generate one...\n\nTarget: ${targetWords} words for ${selectedConfig.duration}s video`}
      />
        {/* Script-vs-language mismatch (restored — commit 0445013 dropped it
            while restructuring this step): the check re-arms on every language
            change or script edit; the LLM verdict takes a few seconds, so show
            the in-flight state instead of silence. */}
        {/* One status slot, highest priority first: mismatch > too long > checking. */}
        {langCheck.status === 'mismatch' ? (
          <LanguageMismatchBanner check={langCheck} />
        ) : narrationTooLong && !noNarration ? (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/40 p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300 mt-0.5" />
            <p className="text-xs text-amber-300">
              Your narration runs ~{estimatedNarrationSec}s but this tier renders {selectedConfig.duration}s.
              The final frame will hold for about {freezeOverrunSec}s so the voiceover can finish — or trim
              to about {targetWords} words for a clean ending.
            </p>
          </div>
        ) : langCheck.status === 'checking' ? (
          <p className="text-xs text-ink-500 mt-2 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" /> Checking the script language…
          </p>
        ) : null}
      </div>

      {/* Narrator Voice — one row: voice dropdown (only voices that natively
          speak the selected language) with a play button beside it. */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label">Narrator</label>
          <button
            type="button"
            role="switch"
            aria-checked={!noNarration}
            aria-label="Narration on or off"
            onClick={() => { if (!noNarration) { setNoNarration(true); voicePreview.stop(); } else { setNoNarration(false); } }}
            className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${!noNarration ? 'bg-purple-700/20 text-purple-300 border-purple-500/30' : 'bg-white/5 text-ink-300 border-transparent hover:bg-white/10'}`}
          >
            {noNarration ? <><VolumeX className="w-3 h-3 inline mr-1" />Narration off</> : <><Mic className="w-3 h-3 inline mr-1" />Narration on</>}
          </button>
        </div>
        {noNarration ? (
          <p className="text-xs text-ink-400 bg-white/5 rounded-lg p-3">
            No voiceover. Music only. Your script and language stay put for AI Write and the AI Avatar Video tab.
          </p>
        ) : (
          <div className="flex gap-2">
            <select
              className="input flex-1"
              value={voice}
              onChange={e => setVoice(e.target.value)}
              aria-label="Narrator voice"
            >
              {languageVoices.map(v => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => voicePreview.play(voice, language)}
              disabled={voicePreview.loading}
              aria-label={voicePreview.isCurrent(voice, language) ? 'Stop voice preview' : 'Preview voice'}
              title={voicePreview.isCurrent(voice, language) ? 'Stop' : 'Preview'}
              className="px-3 rounded-lg bg-white/5 hover:bg-white/10 text-purple-300 disabled:opacity-60"
            >
              {voicePreview.loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : voicePreview.isCurrent(voice, language) ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
        )}
        {!noNarration && voicePreview.error && <p className="text-xs text-red-400 mt-1">{voicePreview.error}</p>}
      </div>
      </>)}

      {/* Step 6 — AI Avatar add-on (optional, +8 credits): pick the picture
          (or the branding profile image) and flip the toggle — that's all.
          The clip itself renders FIRST, inside Generate Video on Step 8;
          the voiceover stays on Step 5, the only place it is chosen. */}
      <div className={step === 5 ? undefined : 'hidden'}>
        {/* Clear sits BESIDE the label on the left, never on the right:
            right-aligned here stacked directly above the enable toggle and
            read as "toggle to clear the form" instead of "toggle to include
            the avatar" (agent feedback 2026-10-15). The right edge of the
            avatar header belongs to the toggle alone. */}
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <label className="label mb-0">AI Avatar Video (optional add-on)</label>
          {(profileImage || aiTalkingProfile) && (
            <button
              type="button"
              onClick={() => { onProfileImageChange(null); setAiTalkingProfile(false); toast.info('AI Avatar cleared', 'Step 6'); }}
              className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-red-400"
              aria-label="Clear the AI Avatar photo and switch the add-on off"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
        <AITalkingProfile
          enabled={aiTalkingProfile}
          onToggle={setAiTalkingProfile}
          profileImage={profileImage}
          onProfileImageChange={setProfileImage}
          voiceoverScript={script}
          langCheck={langCheck}
        />
      </div>

      {/* Step 7 — Background Music / Agent Profile Branding (optional) */}
      {step === 6 && (<>
      <div>
        <label className="label flex items-center gap-2">
          <Music className="w-4 h-4 text-purple-400" />
          Background Music (Optional)
        </label>
        <div className="bg-ink-800/50 rounded-xl p-4">            {musicTracks.length === 0 ? (
            <p className="text-sm text-ink-400">No music tracks are available right now.</p>
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
                Preview — this is how the track will sound under your reel. Choose another track above to preview it instead.
              </p>
            </div>
          )}
          <p className="text-xs text-ink-500 mt-2">
            Background music plays under the narration. Preview any track before you render.
          </p>
        </div>
      </div>

      {/* Branding & Music — tap-to-include toggles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="label">Enhancements</label>
          {(branding || selectedMusic) && (
            <button
              type="button"
              onClick={() => { setBranding(false); setSelectedMusic(null); toast.info('Enhancements cleared — branding & music off', 'Step 7'); }}
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
            <p className="text-xs text-ink-500 mt-1">{musicTracks.length === 0 ? 'No tracks uploaded yet' : selectedMusic ? 'Tap to remove — choose specific track below' : 'Tap to include — pick the track below'}</p>
          </button>
        </div>

      </div>
      </>)}

      {step === 3 && (uploadedImages.length === 0 || photosMissingMeta > 0) && (
        <p className="text-xs text-amber-400/90 text-center">
          {uploadedImages.length === 0
            ? 'Add at least one property photo to continue — a reel needs images to render.'
            : `Tag every photo with a room type (Interior / Exterior) and a camera move before continuing — ${photosMissingMeta} photo${photosMissingMeta === 1 ? '' : 's'} still untagged.`}
        </p>
      )}

      {/* Step 8 — Render / Video Player */}
      {step === 7 && (
      <div className="space-y-3">
        {/* While clips await review the Generate button steps aside for the
            panel — a second render must not start over a live paused job. */}
        {/* What this render costs, assembled from the same numbers the mint
            charges — the tier picker, the AI Write step and the avatar step
            each showed a price, but never the total. */}
        <div className="rounded-xl border border-white/10 bg-ink-800/40 p-4 text-sm space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-300">{tierConfig.label} · {selectedConfig.duration}s · {selectedConfig.images} photos</span>
            <span className="text-white font-semibold tabular-nums">{selectedConfig.credits} ⚡</span>
          </div>
          {aiTalkingProfile && avatarAddonCredits != null && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-300">AI Avatar · ~{Math.round(narrationSecondsForText(script))}s narration</span>
              <span className="text-white font-semibold tabular-nums">{avatarAddonCredits} ⚡</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
            <span className="text-white font-semibold">Total for this render</span>
            <span className="text-purple-300 font-bold tabular-nums">{totalCredits} ⚡ ≈ {creditListZar(totalCredits)}</span>
          </div>
          <p className="text-xs text-ink-500">
            AI Write is charged separately ({scriptPrice} ⚡) when you use it. A failed render is refunded automatically.
          </p>
        </div>
        {!clipReview && (
        <>
        {/* Paid action: totalCredits is charged when the mint starts the job —
            disclose cost and remaining balance BEFORE spending, the same
            pattern as the AI Write confirmation. */}
        <button 
          onClick={() => {
            const balance = user?.credits ?? 0;
            const withAvatar = !!(aiTalkingProfile && avatarAddonCredits != null);
            confirm(
              `${tierConfig.label} · ${selectedConfig.duration}s${withAvatar ? ' with AI Avatar' : ''} costs ${totalCredits} credits${withAvatar ? ` (tier ${selectedConfig.credits} + avatar ${avatarAddonCredits})` : narrationAddonCredits ? ` (tier ${selectedConfig.credits} + narration ${narrationAddonCredits})` : ''}.\n\nYou have ${balance} credit${balance === 1 ? '' : 's'}. A failed render is refunded automatically.\n\nGenerate now?`,
              { title: 'Generate video?', confirmLabel: 'Generate' },
            ).then((ok) => {
              if (ok) void guardAIRender(generateReel);
            });
          }} 
          disabled={generating} 
          className="btn btn-primary w-full text-lg py-4"
        >
          {generating ? (
            <><RefreshCw className="w-5 h-5 animate-spin" /> Generating Video...</>
          ) : (
            <><Play className="w-5 h-5" /> Generate Video ({totalCredits} credits)</>
          )}
        </button>
        <p className="text-xs text-ink-500 text-center">
          Your balance: <span className="text-white font-semibold tabular-nums">{user?.credits ?? 0} ⚡</span> · {totalCredits} ⚡ is charged when the render starts.
        </p>
        </>
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
            stage={renderPhase === 'avatar'
              ? (flashHead.jobStatus === 'processing' ? 'processing' : 'queued')
              : (renderStatus === 'processing' ? 'processing' : renderStatus === 'queued' ? 'queued' : '')}
            label={renderPhase === 'avatar'
              ? 'Step 1 of 2 — rendering your AI avatar'
              : aiTalkingProfile
                ? 'Step 2 of 2 — rendering your video with the avatar'
                : 'Rendering your video reel'}
          />
        )}
        {/* Cancel — visible only while a render runs. cancelRender aborts the
            in-flight job with the worker (render or avatar phase), refunds the
            applicable charge, and unlocks the Generate button. disabled during
            the 5s window the click itself takes so double-taps don't double-
            send the worker cancel. */}
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
        {aiTalkingProfile && !generating && (avatarAddonCredits != null ? (
          <p className="text-xs text-ink-400 text-center">
            Includes the AI Avatar add-on (+{avatarAddonCredits} credits for ≈{Math.round(narrationSecondsForText(script))}s of narration): the avatar renders first, then the video with the avatar in the top-left corner — its voiceover replaces the reel's narration.
          </p>
        ) : (
          <p className="text-xs text-red-300 text-center">
            ⚠ The voiceover script is over the {FLASHHEAD_MAX_SECONDS}s AI Avatar cap (~{Math.floor(FLASHHEAD_MAX_SECONDS * NARRATION_WORDS_PER_SEC)} words) — shorten it on Step 5 or switch the avatar off on Step 6.
          </p>
        ))}
        {!generating && lastRenderUrl && (
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => { setLastRenderUrl(null); setShareOpen(false); toast.info('Finished video cleared from this page — it stays in Projects', 'Step 8'); }}
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
      {/* Wizard nav — Back / Next. The language check and the photos gate
          on step 3 hold Next back; the language check also holds Back (both
          buttons wait out the same in-flight verdict, so the step can't be
          left mid-check either). */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
        <button
          type="button"
          onClick={prevStep}
          disabled={step === 0 || langBusy}
          title={langBusy ? (langTranslating ? `Translating the script to ${langCheck.languageLabel}…` : 'Waiting for the script language check to finish…') : undefined}
          className="btn btn-ghost min-h-[44px] px-4 disabled:opacity-40"
        >
          ← Back
        </button>
        <span className="text-xs text-ink-500 text-center" aria-live="polite">
          {langTranslating
            ? `Translating the script to ${langCheck.languageLabel}…`
            : langChecking
              ? 'Checking the script language…'
              : `Step ${step + 1} of ${WIZARD_STEPS.length} — ${WIZARD_STEPS[step].label}`}
        </span>
        {step < WIZARD_STEPS.length - 1 ? (
          <button
            type="button"
            onClick={nextStep}
            disabled={langBusy || photosBlocked}
            aria-disabled={!canNext}
            className={`btn btn-primary min-h-[44px] px-6 disabled:opacity-40${langMismatch && !langBusy && !photosBlocked ? ' opacity-60' : ''}`}
            title={canNext ? undefined : langTranslating ? `Translating the script to ${langCheck.languageLabel}…` : langChecking ? 'Waiting for the script language check to finish…' : photosBlocked ? (uploadedImages.length === 0 ? 'Add at least one property photo to continue' : `Tag every photo with a room type and a camera move — ${photosMissingMeta} still untagged`) : `Choose "Translate to ${langCheck.languageLabel}" or "Keep as is" under the Voiceover Script to continue`}
          >
            Next →
          </button>
        ) : <div className="w-24" />}
      </div>
      {shareOpen && lastRenderUrl && (
        <ShareSheet
          videoUrl={lastRenderUrl}
          caption={script.slice(0, 120)}
          hashtags={['PropertyForSale', 'SouthAfrica', 'RealEstate']}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
