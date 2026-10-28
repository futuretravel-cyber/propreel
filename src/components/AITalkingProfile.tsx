import { useState } from 'react';
import { User, Upload, Sparkles, Zap, Info, Video, AlertCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useCredit } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import type { VoiceoverLanguageCheck } from '../lib/useVoiceoverLanguageCheck';
import { useAvatarPhotoIssue } from '../lib/useAvatarPhotoIssue';
import { flashheadCreditsForText, narrationSecondsForText, FLASHHEAD_MAX_SECONDS, NARRATION_WORDS_PER_SEC } from '../../lib/renderPricing';

interface AITalkingProfileProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  profileImage: string | null;
  onProfileImageChange: (image: string | null) => void;
  voiceoverScript: string;
  /** Shared script-vs-language mismatch check (same gate as the wizard's Next) */
  langCheck: VoiceoverLanguageCheck;
}

export default function AITalkingProfile({ 
  enabled, 
  onToggle, 
  profileImage, 
  onProfileImageChange,
  voiceoverScript,
  langCheck,
}: AITalkingProfileProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useCredit();
  const [uploading, setUploading] = useState(false);
  // The +8-credit warning pops BEFORE the toggle flips on: selecting this
  // option adds 8 credits to the final render on Step 8 (Generate Video).
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Warn straight away when the photo is landscape / too small — this photo
  // feeds the AI Avatar Video tab, where a bad crop renders a broken avatar.
  const photoIssue = useAvatarPhotoIssue(profileImage);

  // Current profile image from Agent Branding (default profile first),
  // falling back to the account avatar
  const profiles: any[] = (user as any)?.agentProfiles || [];
  const brandingPhoto: string | null =
    profiles.find(p => p?.isDefault)?.photoUrl ||
    profiles.find(p => p?.photoUrl)?.photoUrl ||
    (user as any)?.avatarUrl ||
    null;

  // Per-second pricing, mirrored live from the Step 5 script (same formula
  // the server charges by — lib/renderPricing). A script past the 90s cap
  // cannot start an avatar render at all.
  const narrationSecs = narrationSecondsForText(voiceoverScript);
  const creditCost = flashheadCreditsForText(voiceoverScript);
  const scriptOverCap = !!voiceoverScript.trim() && creditCost == null;
  const CREDIT_COST = creditCost;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      onProfileImageChange(reader.result as string);
      setUploading(false);
      toast.success('Profile image uploaded successfully');
    };
    reader.onerror = () => {
      setUploading(false);
      toast.error('Failed to upload image');
    };
    reader.readAsDataURL(file);
  };

  const handleToggle = () => {
    if (enabled) {
      onToggle(false);
      toast.info('AI Avatar Video disabled');
      return;
    }

    // 2026-10-27: same mismatch gate as the wizard's Next — the avatar
    // speaks the script exactly as written, so an unresolved
    // script-vs-language mismatch refuses to enable the add-on. The dialog
    // resolves the gate directly ("Translate to X" / "Keep as is");
    // Escape/backdrop closes without choosing and leaves the gate shut.
    if (langCheck.status === 'mismatch') {
      void confirm(
        `Your Voiceover Language (${langCheck.languageLabel}) and your voiceover script (${langCheck.detectedLabel ?? 'another language'}) don\u2019t match, so the AI Avatar Video can\u2019t be added yet.\n\n` +
        `The AI Avatar speaks the script exactly as written \u2014 there is no auto-translation \u2014 so a mismatched Voiceover Language and Voiceover Script produce a mangled voiceover that will destroy the video.\n\n` +
        `Choose "Translate to ${langCheck.languageLabel}" to rewrite the script, or "Keep as is" to accept the risk.`,
        { title: 'Voiceover Language does not match the script', confirmLabel: `Translate to ${langCheck.languageLabel} (${langCheck.translateCostLabel})`, cancelLabel: 'Keep as is' }
      ).then((choice) => {
        if (choice === true) void langCheck.translate();
        else if (choice === false) langCheck.dismiss();
      });
      return;
    }

    if (!profileImage) {
      toast.error('Please upload a profile image first (or use your branding profile image)');
      return;
    }

    // The voiceover lives on Step 5 only — the avatar simply speaks it.
    if (!voiceoverScript) {
      toast.error('Please add your voiceover script on Step 5 first — the AI Avatar speaks it');
      return;
    }
    if (scriptOverCap) {
      toast.error(`Your voiceover is ≈${Math.round(narrationSecs)}s of narration — the avatar cap is ${FLASHHEAD_MAX_SECONDS}s (~${Math.floor(FLASHHEAD_MAX_SECONDS * NARRATION_WORDS_PER_SEC)} words). Shorten the script.`);
      return;
    }
    if (CREDIT_COST == null) return;

    // Warning first: opting in adds 8 credits to the final render.
    setConfirmOpen(true);
  };

  const confirmEnable = () => {
    setConfirmOpen(false);
    onToggle(true);
    toast.success(`AI Avatar Video enabled — ${CREDIT_COST} credits will be added to your final render`);
  };
  return (
    <div className="space-y-4">
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="avatar-credit-warning-title">
          <div className="bg-ink-900 border border-amber-500/40 rounded-2xl p-5 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <h3 id="avatar-credit-warning-title" className="text-lg font-bold text-white">AI Avatar adds {CREDIT_COST ?? '—'} credits</h3>
            </div>
            <p className="text-sm text-ink-300 mb-3">
              Billed by length: <strong className="text-amber-300">2 credits per 10 seconds of narration</strong> — this script is ≈{Math.round(narrationSecs)}s, so <strong className="text-amber-300">{CREDIT_COST ?? '—'} credits will be added to the final render</strong>. Step 8's Generate Video button shows the combined total before you pay.
            </p>
            <p className="text-xs text-ink-400 mb-4">
              When you press Generate Video, your avatar renders first, then the video with the avatar in the top-left corner. The avatar's voiceover replaces the reel's narration — pick the script and voice on Step 5.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} className="btn btn-secondary flex-1 min-h-[44px]">
                Cancel
              </button>
              <button type="button" onClick={confirmEnable} className="btn btn-primary flex-1 min-h-[44px]">
                Add AI Avatar (+{CREDIT_COST ?? '—'} credits)
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-purple-400" />
          <label className="label mb-0">AI Avatar Video</label>
          <span className="badge badge-brand text-xs">
            <Zap className="w-3 h-3" /> {CREDIT_COST != null ? `${CREDIT_COST} credits (≈${Math.round(narrationSecs)}s)` : 'script needed'}
          </span>
          {scriptOverCap && (
            <span className="text-xs text-red-300">⚠ script over the {FLASHHEAD_MAX_SECONDS}s cap — shorten it</span>
          )}
        </div>
        <button
          onClick={handleToggle}
          role="switch"
          aria-checked={enabled}
          aria-label={enabled
            ? 'AI Avatar Video included in this render — switch off to exclude it'
            : 'Include AI Avatar Video in this render'}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-purple-600' : 'bg-ink-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="bg-ink-800/50 rounded-xl p-4 space-y-4">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-ink-400">
            Generate an AI Avatar Video using your profile photo. The AI will animate your photo to speak the voiceover script naturally.
          </p>
        </div>

        {/* Profile Image Upload */}
        <div>
          <label className="label">Agent Profile Photo</label>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-xl bg-ink-900 border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden">
              {profileImage ? (
                <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-ink-500" />
              )}
            </div>
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="profile-upload"
                disabled={uploading}
              />
              <label
                htmlFor="profile-upload"
                className={`btn btn-secondary w-full cursor-pointer ${uploading ? 'opacity-50' : ''}`}
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    {profileImage ? 'Change Photo' : 'Upload Photo'}
                  </>
                )}
              </label>
              {brandingPhoto && (
                <button
                  type="button"
                  onClick={() => { onProfileImageChange(brandingPhoto); toast.success('Branding profile image applied'); }}
                  disabled={uploading}
                  className="btn btn-secondary w-full mt-2"
                >
                  <User className="w-4 h-4" /> Use my branding profile image
                </button>
              )}
              <p className="text-xs text-ink-500 mt-2">
                Perfect size: 1080 × 1080 square (1:1) — one face, centered, head &amp; shoulders, good lighting · max 5MB
              </p>
              {photoIssue && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/40 p-3">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-300 mt-0.5" />
                  <p className="text-xs text-amber-300">{photoIssue}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${profileImage ? 'bg-green-500' : 'bg-ink-600'}`} />
            <span className={profileImage ? 'text-green-400' : 'text-ink-500'}>
              Profile photo {profileImage ? 'uploaded' : 'required'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${voiceoverScript ? 'bg-green-500' : 'bg-ink-600'}`} />
            <span className={voiceoverScript ? 'text-green-400' : 'text-ink-500'}>
              Voiceover script {voiceoverScript ? 'ready' : 'required'}
            </span>
          </div>
        </div>

      {/* Info Box */}
      {enabled && (
        <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Video className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-purple-200">
              <p className="font-semibold mb-1">AI Avatar Video Active</p>
            </div>
          </div>
        </div>
      )}      </div>
    </div>
  );
}
