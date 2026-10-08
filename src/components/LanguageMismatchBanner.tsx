import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import type { VoiceoverLanguageCheck } from '../lib/useVoiceoverLanguageCheck';

/**
 * Amber warning shown under a voiceover script when the script is written
 * in a different language than the selected narrator voice — Narakeet reads
 * scripts verbatim, so the voiceover would come out in the wrong language.
 * Offers a one-click AI translation (auto-correct) or an explicit opt-out.
 */
export default function LanguageMismatchBanner({ check }: { check: VoiceoverLanguageCheck }) {
  if (check.status !== 'mismatch') return null;
  return (
    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/40 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-amber-300">
            This script looks like <span className="font-semibold">{check.detectedLabel}</span>, but the narrator
            speaks <span className="font-semibold">{check.languageLabel}</span>. The voice reads your words exactly
            as written — there is no auto-translation — so the voiceover would come out in the wrong language.
          </p>
          {check.error && <p className="text-xs text-red-400 mt-1">{check.error}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => void check.translate()}
              disabled={check.translating}
              className="text-xs font-semibold text-purple-300 hover:text-purple-200 flex items-center gap-1 disabled:opacity-60"
            >
              {check.translating
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <Sparkles className="w-3 h-3" />}
              {check.translating ? 'Translating…' : `Translate to ${check.languageLabel}`}
            </button>
            <button
              type="button"
              onClick={check.dismiss}
              disabled={check.translating}
              className="text-xs text-amber-400/70 hover:text-amber-300 disabled:opacity-60"
            >
              Keep as is
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
