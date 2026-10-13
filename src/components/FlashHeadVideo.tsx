import { useEffect, useRef, useState } from 'react';
import { Camera, Download, Loader2, RefreshCw, User, Video, Zap, AlertCircle, Sparkles, Play, Square } from 'lucide-react';
import { useFlashHead } from '../lib/useFlashHead';
import { flashheadCreditsForText, narrationSecondsForText, FLASHHEAD_MAX_SECONDS, NARRATION_WORDS_PER_SEC } from '../../lib/renderPricing';
import { useCredit } from '../context/AuthContext';
import { useRenderProgress, typicalFlashheadSeconds } from '../lib/useRenderProgress';
import { useStudioDraft, studioDraftKey, dataUrlToFile } from '../lib/studioDrafts';
import RenderProgressBar from './RenderProgressBar';
import { useUploadWait } from '../lib/api';
import { guardAIRender } from '../lib/aiDisclaimer';
import { useVoicePreview } from '../lib/useVoicePreview';
import { useAvatarPhotoIssue } from '../lib/useAvatarPhotoIssue';
import LanguageMismatchBanner from './LanguageMismatchBanner';
import type { VoiceoverLanguageCheck } from '../lib/useVoiceoverLanguageCheck';
import { SA_LANGUAGES, DEFAULT_VOICE_LANGUAGE, voicesForLanguage } from '../lib/constants';
import { downloadRemoteFile } from '../lib/utils';

interface FlashHeadVideoProps {
  /** Pre-fill from the Video tab's AI-generated script (shared Studio state) */
  initialScript?: string;
  /** Two-way sync: edits here update the shared script for the Video tab too */
  onScriptChange?: (script: string) => void;
  /** Notify parent (Video tab) when a talking-head video is ready */
  onVideoGenerated?: (videoUrl: string) => void;
  /** Avatar photo chosen in the Video tab's AI Avatar Video add-on —
   * applied here automatically, no button click needed */
  profileImage?: string | null;
  /** True once the Video tab's photo has been rehydrated from storage */
  profileImageReady?: boolean;
  /** Removing the carried photo here also removes it in the Video tab */
  onProfileImageChange?: (img: string | null) => void;
  /** Shared voiceover language (BCP-47) — synced with the Video tab */
  language?: string;
  onLanguageChange?: (language: string) => void;
  /** Shared script-vs-language mismatch check (banner under the script) */
  langCheck: VoiceoverLanguageCheck;
}

/**
 * FlashHead Studio tab: lip-synced talking-head video from the agent's
 * profile picture + the AI-generated voiceover script. Billed per 10 seconds
 * of narration (2 credits each); a script past the 90-second cap is refused
 * before any charge.
 */
export default function FlashHeadVideo({ initialScript = '', onScriptChange, onVideoGenerated, profileImage = null, profileImageReady = true, onProfileImageChange, language = DEFAULT_VOICE_LANGUAGE, onLanguageChange, langCheck }: FlashHeadVideoProps) {
  const { user } = useCredit() as any;
  const { generate, busy, stage, error, setError, jobStatus, cancel, cancelling } = useFlashHead();
  const [file, setFile] = useState<File | null>(null);
  // The picked headshot and its branding/hosted source survive full page
  // reloads; `file` is rebuilt from the restored data URL when rendering.
  const [preview, setPreview, previewReady] = useStudioDraft<string | null>(studioDraftKey(user?.id, 'flashhead:preview'), null);
  const [sourceUrl, setSourceUrl] = useStudioDraft<string | null>(studioDraftKey(user?.id, 'flashhead:source'), null);
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
  // Parent → panel: the shared script (AI Write, one-click translation,
  // listing prefill) must land here too. Edits from THIS textarea write the
  // parent with the same text, so the effect is a no-op mid-typing.
  useEffect(() => { setScript(initialScript); }, [initialScript]);
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
  const changeLanguage = (lang: string) => {
    onLanguageChange?.(lang);
    const first = voicesForLanguage(lang)[0];
    if (first) setVoice(first.id);
  };
  // The finished render URL stays session-only: it points at S3 and the
  // project record already keeps it for the library.
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Elapsed-vs-typical progress: typical scales with the script length
  const scriptWords = script.trim() ? script.trim().split(/\s+/).length : 0;
  const progress = useRenderProgress(typicalFlashheadSeconds(scriptWords));
  // Per-second pricing mirrors the server exactly (lib/renderPricing):
  // 2 credits per 10s of narration, hard-capped at 90s (≈216 words).
  const narrationSecs = narrationSecondsForText(script);
  const avatarCost = script.trim() ? flashheadCreditsForText(script) : null;
  const overCap = !!script.trim() && avatarCost == null;

  // Whichever photo is active (upload, branding, carried from the Video tab)
  // gets measured — landscape/low-res shots render a broken avatar.
  const photoIssue = useAvatarPhotoIssue(preview);

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

  // Carry the avatar photo chosen in the Video tab over automatically.
  // Data URLs (an upload) are converted to a File so they travel through the
  // presigned upload like any other pick; hosted URLs skip the upload.
  const appliedImageRef = useRef<string | null>(null);
  // Did THIS tab restore its own photo from storage on load? That pick must
  // win over the Video tab's restored copy (it was the last thing the user
  // chose here) — but only until the user picks a new Video-tab avatar.
  const restoredOwnRef = useRef(false);
  // Only the first restored-vs-restored collision is arbitrated; afterwards
  // an explicit new avatar choice in the Video tab carries over as usual.
  const settledOwnUsedRef = useRef(false);
  useEffect(() => {
    if (previewReady && preview) restoredOwnRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewReady]);
  // Both drafts must settle before carry-over logic runs, otherwise a slow
  // read clobbers whichever photo landed first.
  const settledRef = useRef(false);
  const initialProfileRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!previewReady || !profileImageReady) {
      settledRef.current = false; // key changed (sign-in) — re-settle
      return;
    }
    if (!settledRef.current) {
      settledRef.current = true;
      initialProfileRef.current = profileImage;
    }
    // Video tab photo deleted → clear the carried copy too, but only if this
    // tab still shows that exact photo (never a locally uploaded one)
    if (!profileImage) {
      if (appliedImageRef.current && preview === appliedImageRef.current) {
        setFile(null); setSourceUrl(null); setPreview(null); setResultUrl(null);
      }
      appliedImageRef.current = null;
      return;
    }
    if (profileImage === appliedImageRef.current) return;
    // Restored-from-storage scenario: this tab's own photo came back and the
    // Video tab's avatar is still the one that was there at load — keep the
    // local pick, but remember the avatar so a later change there still
    // carries over (and so deleting it here doesn't resurrect this photo).
    if (restoredOwnRef.current && !settledOwnUsedRef.current
      && preview && preview !== profileImage
      && profileImage === initialProfileRef.current) {
      settledOwnUsedRef.current = true;
      appliedImageRef.current = profileImage;
      return;
    }
    appliedImageRef.current = profileImage;
    setResultUrl(null);
    setError(null);
    if (profileImage.startsWith('data:'))
      fetch(profileImage)
        .then(r => r.blob())
        .then(blob => {
          const f = new File([blob], 'avatar', { type: blob.type || 'image/png' });
          setFile(f);
          setSourceUrl(null);
          setPreview(profileImage);
        })
        .catch(() => { setFile(null); setSourceUrl(profileImage); setPreview(profileImage); });
    else {
      setFile(null);
      setSourceUrl(profileImage);
      setPreview(profileImage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileImage, preview, previewReady, profileImageReady]);

  const run = async () => {
    if ((!file && !sourceUrl && !preview) || !script.trim()) return;
    // After a reload only the data URL survived — rebuild the File for the
    // presigned upload (hosted URLs skip this and go straight to the worker).
    let f = file;
    if (!f && !sourceUrl && preview?.startsWith('data:')) {
      try {
        f = await dataUrlToFile(preview);
        setFile(f);
      } catch { setError('Could not restore your uploaded photo — please upload it again'); return; }
    }
    progress.start();
    try {
      const res = await generate({ file: f ?? undefined, imageUrl: sourceUrl ?? undefined, voiceoverText: script, voice, language });
      if (res) {
        setResultUrl(res.videoUrl);
        onVideoGenerated?.(res.videoUrl);
      }
    } finally {
      progress.stop();
    }
  };

  const uploadWait = useUploadWait();
  const stageLabel = stage === 'uploading' ? (uploadWait != null ? `Upload limit reached — retrying in ${uploadWait}s…` : 'Uploading profile picture…')
    : stage === 'deducting' ? 'Reserving credits…'
    : stage === 'rendering' ? 'AI is generating your lip-sync video…'
    : '';

  const canRun = (!!file || !!sourceUrl || !!preview) && !!script.trim() && !overCap && !busy && (user?.credits ?? 0) >= (avatarCost ?? Infinity);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><Video className="w-5 h-5 text-purple-400" /> AI Avatar Video</h2>
      <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
        <p className="text-xs text-purple-200 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Billed by length: 2 credits per 10 seconds of narration (90s cap)
          {script.trim() && avatarCost != null && ` — this script ≈ ${Math.round(narrationSecs)}s ⇒ ${avatarCost} credits`}
        </p>
        {overCap && (
          <p className="text-xs text-red-300 mt-1">
            ⚠ This script is ≈{Math.round(narrationSecs)}s of narration — over the {FLASHHEAD_MAX_SECONDS}s cap (~{Math.floor(FLASHHEAD_MAX_SECONDS * NARRATION_WORDS_PER_SEC)} words). Shorten the script to render.
          </p>
        )}
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
                <p className="text-ink-500 text-xs mt-1">Perfect size: 1080 × 1080 square (1:1) — one face, centered, head &amp; shoulders, good lighting · JPEG/PNG up to 25MB</p>
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
                <button onClick={() => {
                  // Deleting the carried photo removes it in the Video tab too
                  if (profileImage && preview === profileImage) onProfileImageChange?.(null);
                  setFile(null); setSourceUrl(null); setPreview(null); setResultUrl(null);
                }} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80" aria-label="Remove image">✕</button>
              </div>
              {sourceUrl && (
                <p className="text-xs text-ink-500 mt-1">Using your branding profile image — remove it to upload a different photo.</p>
              )}
              {photoIssue && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/40 p-3">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-300 mt-0.5" />
                  <p className="text-xs text-amber-300">{photoIssue}</p>
                </div>
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
            <LanguageMismatchBanner check={langCheck} />
          </div>
          <div>
            <label className="label">Voiceover Language</label>
            <select className="input" value={language} onChange={e => changeLanguage(e.target.value)} aria-label="Voiceover language">
              {SA_LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Voice</label>
              <button
                type="button"
                onClick={() => voicePreview.play(voice, language)}
                disabled={voicePreview.loading}
                className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 disabled:opacity-60"
              >
                {voicePreview.loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : voicePreview.isCurrent(voice, language) ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {voicePreview.loading ? 'Loading…' : voicePreview.isCurrent(voice, language) ? 'Stop' : 'Preview'}
              </button>
            </div>
            <select className="input" value={voice} onChange={e => setVoice(e.target.value)}>
              {languageVoices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            {voicePreview.error && <p className="text-xs text-red-400 mt-1">{voicePreview.error}</p>}
          </div>
        </div>
      </div>

      {/* Generate */}
      <div className="space-y-3">
        <button onClick={() => guardAIRender(run)} disabled={!canRun} className="btn btn-primary w-full text-lg py-4">
          {busy ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> {stageLabel || 'Working…'}</>
          ) : resultUrl ? (
            <><RefreshCw className="w-5 h-5" /> Regenerate ({avatarCost ?? '—'} credits)</>
          ) : (
            <><Sparkles className="w-5 h-5" /> Generate AI Avatar Video ({avatarCost ?? '—'} credits)</>
          )}
        </button>
        <RenderProgressBar
          progress={progress}
          stage={stage === 'rendering' ? (jobStatus === 'processing' ? 'processing' : 'queued') : ''}
          label="Generating your AI Avatar Video"
        />
        {stage === 'rendering' && (
          <button
            type="button"
            onClick={cancel}
            disabled={cancelling}
            className="btn btn-secondary w-full min-h-[44px]"
            aria-label="Cancel the in-flight avatar render and refund credits"
          >
            {cancelling ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Cancelling — refunding credits…</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Cancel render — credits refunded</>
            )}
          </button>
        )}
        {!busy && !canRun && (
          <p className="text-xs text-ink-500 text-center">
            {!file && !sourceUrl && 'Upload your profile picture • '}
            {!script.trim() && 'Add a voiceover script • '}
            {overCap && `Script over the ${FLASHHEAD_MAX_SECONDS}s cap • `}
            {!overCap && (user?.credits ?? 0) < (avatarCost ?? 0) && `Need ${avatarCost} credits for this script (you have ${user?.credits ?? 0}) • `}
          </p>
        )}
        {error && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}
      </div>

      {/* Result — the project record (kind FLASHHEAD, status READY) is
          written by useFlashHead, so this clip surfaces in My Projects,
          Listings, search and the activity feed automatically. */}
      {resultUrl && (
        <div className="card-dark p-4">
          <div className="max-w-md mx-auto rounded-xl overflow-hidden bg-black">
            <video src={resultUrl} controls playsInline className="w-full aspect-square" />
          </div>
          <div className="flex gap-3 mt-3 justify-center">
            {/* Not an <a download>: the signed CDN URL is cross-origin, so
                browsers ignore the download attribute and just navigate to a
                new tab. Fetch → blob → same-origin object URL instead. */}
            <button
              type="button"
              onClick={async () => {
                try {
                  await downloadRemoteFile(resultUrl, 'propreel-ai-avatar-video.mp4');
                } catch {
                  window.open(resultUrl, '_blank', 'noopener');
                }
              }}
              className="btn btn-secondary text-sm"
            ><Download className="w-4 h-4" /> Download</button>
          </div>
        </div>
      )}

    </div>
  );
}
