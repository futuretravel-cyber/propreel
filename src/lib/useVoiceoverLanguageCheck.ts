import { useCallback, useEffect, useRef, useState } from 'react';
import { PropReelAPI } from './api';
import { BackendAPI } from './backendAPI';
import { useCredit } from '../context/AuthContext';
import { TRANSLATE_CREDITS } from '../../lib/renderPricing';

export type VoiceoverLanguageStatus = 'idle' | 'checking' | 'ok' | 'mismatch';

// ---------------------------------------------------------------------------
// Translate price quote
//
// The Translate button must show what the click costs BEFORE it happens —
// "1 credit", or "free — N left" while a trial's TRIAL_FREE_TRANSLATES
// allowance lasts (the server decides at the deduct, not this cache). One
// shared, TTL-cached GET feeds every hook instance (the studio mounts this
// hook several times at once); each attempt re-syncs from the server's
// response so the label flips the moment charging starts.
// ---------------------------------------------------------------------------

let quoteCache: { at: number; freeRemaining: number | null } | null = null;
let quoteInflight: Promise<number | null> | null = null;
const QUOTE_TTL_MS = 60_000;

function loadTranslateQuote(userId: string, force = false): Promise<number | null> {
  if (!force && quoteCache && Date.now() - quoteCache.at < QUOTE_TTL_MS) {
    return Promise.resolve(quoteCache.freeRemaining);
  }
  if (!quoteInflight) {
    quoteInflight = BackendAPI.translateQuote(userId)
      .then((q: any) => {
        const remaining = typeof q?.free_remaining === 'number' ? q.free_remaining : null;
        quoteCache = { at: Date.now(), freeRemaining: remaining };
        return remaining;
      })
      // Quote unavailable → keep the priced default (the server still decides
      // what is actually charged at the deduct) and retry on the next ask.
      .catch(() => quoteCache?.freeRemaining ?? null)
      .finally(() => { quoteInflight = null; });
  }
  return quoteInflight;
}

export interface VoiceoverLanguageCheck {
  status: VoiceoverLanguageStatus;
  /** Human label of the detected language when status === 'mismatch'. */
  detectedLabel: string | null;
  /** Human label of the selected voice language. */
  languageLabel: string;
  /** True while the mismatch banner is actively translating the script. */
  translating: boolean;
  /** What the next click costs, for the button label — "1 credit", or
   *  "free — N left" while the trial's free-translate allowance lasts —
   *  with the remaining credit balance shown next to it ("· you have N
   *  credits") so both are visible before confirming. */
  translateCostLabel: string;
  /** Last translate error, if any. */
  error: string | null;
  /** Translate the current script to the selected voice language. */
  translate: () => Promise<boolean>;
  /** Dismiss the mismatch warning for this exact (language, script) pair. */
  dismiss: () => void;
}

// ---------------------------------------------------------------------------
// Verdict cache
//
// The language verdict is a pure function of (language, script text): the same
// pair always yields the same verdict, so a repeat request must never spend
// another fal/LLM call. Hot entries live in a module Map; verdicts are also
// persisted to localStorage so a studio-draft reload doesn't re-buy a verdict
// it already bought. Keys are the exact (language, trimmed script) pair — the
// script is already persisted in studio drafts on this device, so storing the
// key here adds no new exposure class.
// ---------------------------------------------------------------------------

interface CachedVerdict {
  ok: boolean;
  detected: string | null;
}

const verdictCache = new Map<string, CachedVerdict>();
const CACHE_LIMIT = 200;
const CACHE_STORAGE_KEY = 'propreel.langcheck.verdicts.v1';

let cacheLoaded = false;
function loadVerdictCache(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as [string, CachedVerdict][];
    if (!Array.isArray(entries)) return;
    for (const entry of entries.slice(-CACHE_LIMIT)) {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[1]) {
        verdictCache.set(entry[0], entry[1]);
      }
    }
  } catch {
    // Corrupt or absent cache is fine — we just re-check.
  }
}

function rememberVerdict(key: string, verdict: CachedVerdict): void {
  // Re-insert so Map iteration order approximates LRU.
  verdictCache.delete(key);
  verdictCache.set(key, verdict);
  while (verdictCache.size > CACHE_LIMIT) {
    const oldest = verdictCache.keys().next();
    if (oldest.done) break;
    verdictCache.delete(oldest.value);
  }
  try {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify([...verdictCache.entries()]));
  } catch {
    // Quota — the in-memory cache still holds.
  }
}

// ---------------------------------------------------------------------------
// Drift rule
//
// The checker's own contract passes code-switched property names, numbers and
// short phrases in the target language and only fails text "written wholesale
// in another language". So an edit that stays within 2 words of a verified-OK
// script cannot flip the verdict by construction — inherit OK without a call.
// Any larger change re-arms a real check (settle-debounced below).
// ---------------------------------------------------------------------------

const DRIFT_OK_WORDS = 2;

/** Word-level symmetric difference, capped at DRIFT_OK_WORDS + 1. */
function wordDistance(a: string, b: string): number {
  const wa = a.split(/\s+/).filter(Boolean);
  const wb = b.split(/\s+/).filter(Boolean);
  if (Math.abs(wa.length - wb.length) > DRIFT_OK_WORDS) return DRIFT_OK_WORDS + 1;
  const counts = new Map<string, number>();
  for (const w of wa) counts.set(w, (counts.get(w) || 0) + 1);
  let dist = 0;
  for (const w of wb) {
    const n = counts.get(w) || 0;
    if (n > 0) counts.set(w, n - 1);
    else dist += 1;
    if (dist > DRIFT_OK_WORDS) return DRIFT_OK_WORDS + 1;
  }
  for (const n of counts.values()) {
    dist += n;
    if (dist > DRIFT_OK_WORDS) return DRIFT_OK_WORDS + 1;
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Check-on-settle
//
// One call per settled burst of typing, not one per pause: the window resets
// on every edit and only a genuine quiet period spends a call. 1.4s caught
// every think-pause mid-sentence; 2.5s rides through them. While the window
// is open the status is 'checking', so the Next/Generate gates stay locked —
// the gate safety is unchanged, only the call count drops.
// ---------------------------------------------------------------------------

const SETTLE_MS = 2500;

function labelOf(lang: string): string {
  const code = lang.split('-')[0].toLowerCase();
  const table: Record<string, string> = {
    en: 'English', af: 'Afrikaans', zu: 'isiZulu', xh: 'isiXhosa',
    st: 'Sesotho', tn: 'Setswana', ts: 'Xitsonga', ss: 'siSwati',
    nr: 'isiNdebele', ve: 'Tshivenda', nso: 'Sepedi', pt: 'Portuguese',
    fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', nl: 'Dutch',
    ja: 'Japanese', ko: 'Korean', zh: 'Mandarin Chinese', ar: 'Arabic',
    hi: 'Hindi', tr: 'Turkish', ru: 'Russian', pl: 'Polish', sv: 'Swedish',
    da: 'Danish', fi: 'Finnish', nb: 'Norwegian', id: 'Indonesian',
    th: 'Thai', vi: 'Vietnamese', he: 'Hebrew', el: 'Greek', cs: 'Czech',
    ro: 'Romanian', hu: 'Hungarian', uk: 'Ukrainian', tl: 'Filipino',
  };
  return table[code] || code.toUpperCase();
}

/**
 * Watches the voiceover script and warns when it doesn't match the selected
 * voice language. Fail-open: any API failure leaves status 'idle' (no gate).
 *
 * Every resolved verdict is cached on (language, text) — session Map plus
 * localStorage — and near-identical edits inherit a fresh verdict, so repeat
 * checks cost nothing and only real changes reach the fal/LLM path.
 */
export function useVoiceoverLanguageCheck(
  script: string,
  language: string,
  onScriptChange: (text: string) => void,
  opts?: { enabled?: boolean }
): VoiceoverLanguageCheck {
  const [status, setStatus] = useState<VoiceoverLanguageStatus>('idle');
  const [detectedLabel, setDetectedLabel] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [freeRemaining, setFreeRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user, refresh } = useCredit();
  // Narration switched off (Step 5's "No narration"): the check exists only
  // to protect a voiceover that will actually be spoken, so with `enabled`
  // false the verdict effect below cancels whatever is in flight and stays
  // idle instead of arming a check the agent would have to wait out.
  const enabled = opts?.enabled !== false;
  const seqRef = useRef(0);
  const dismissedKeyRef = useRef<string | null>(null);
  // Last text this (language, verdict) was actually verified against — the
  // anchor the drift rule compares against. `ok: false` never inherits.
  const verifiedRef = useRef<{ text: string; language: string; ok: boolean } | null>(null);

  const languageLabel = labelOf(language);
  const trimmed = script.trim();
  const checkKey = `${language}|${trimmed}`;

  // Prefetch the translate price (deduped + cached module-wide) so the button
  // can label the click honestly before it happens.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    loadTranslateQuote(userId).then((r) => { if (alive) setFreeRemaining(r); });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    loadVerdictCache();
    if (!enabled) {
      // Cancel and stay idle: this effect's cleanup drops the pending
      // settle timer on the dep change, and the seq bump voids a verdict
      // whose API call is already in flight — so nothing can flip the
      // status back to 'checking' behind the wizard's back. Idle is the
      // wizard's "no verdict, no gate", which is exactly what lets
      // "No narration" click Next immediately. Flipping narration back on
      // re-runs this effect and re-arms the real check: cached verdicts
      // re-land instantly, so a cached mismatch re-locks Next as it should.
      seqRef.current += 1;
      setStatus('idle');
      setDetectedLabel(null);
      return;
    }
    if (trimmed.length < 12) {
      // Too short to judge — void any in-flight verdict too.
      seqRef.current += 1;
      setStatus('idle');
      setDetectedLabel(null);
      return;
    }
    if (dismissedKeyRef.current === checkKey) {
      seqRef.current += 1;
      setStatus('ok');
      setDetectedLabel(null);
      return;
    }
    const cached = verdictCache.get(checkKey);
    if (cached) {
      // Same pair, same verdict — serve from cache, spend nothing.
      seqRef.current += 1;
      if (!cached.ok && cached.detected) {
        setDetectedLabel(labelOf(cached.detected));
        setStatus('mismatch');
      } else {
        setDetectedLabel(null);
        setStatus('ok');
      }
      return;
    }
    const verified = verifiedRef.current;
    if (
      verified &&
      verified.ok &&
      verified.language === language &&
      wordDistance(verified.text, trimmed) <= DRIFT_OK_WORDS
    ) {
      // Tiny edit over a verified-OK script: by the checker's own contract the
      // verdict cannot have flipped, so inherit it without a call.
      seqRef.current += 1;
      rememberVerdict(checkKey, { ok: true, detected: null });
      setStatus('ok');
      setDetectedLabel(null);
      return;
    }

    const seq = ++seqRef.current;
    setStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const raw = await PropReelAPI.generateText('language_check', {
          language,
          language_label: languageLabel,
          script: trimmed,
        });
        if (seq !== seqRef.current) return;
        let verdict: { ok?: boolean; detected?: string } = {};
        try {
          verdict = JSON.parse(raw);
        } catch {
          // Plain text response — treat as unknown (fail open).
        }
        if (verdict && verdict.ok === false && typeof verdict.detected === 'string' && verdict.detected) {
          verifiedRef.current = { text: trimmed, language, ok: false };
          rememberVerdict(checkKey, { ok: false, detected: verdict.detected });
          setDetectedLabel(labelOf(verdict.detected));
          setStatus('mismatch');
        } else if (verdict && verdict.ok === true) {
          verifiedRef.current = { text: trimmed, language, ok: true };
          rememberVerdict(checkKey, { ok: true, detected: null });
          setDetectedLabel(null);
          setStatus('ok');
        } else {
          setDetectedLabel(null);
          setStatus('idle');
        }
      } catch {
        if (seq !== seqRef.current) return;
        // Fail open — never block the wizard on a flaky check.
        setDetectedLabel(null);
        setStatus('idle');
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, language, languageLabel, checkKey, enabled]);

  const translate = useCallback(async (): Promise<boolean> => {
    const source = script.trim();
    if (!source) return true;
    if (!user) {
      setError('Sign in to translate the script.');
      return false;
    }
    setTranslating(true);
    setError(null);

    // 1) Pay first — server-priced (the trial's first 3 are free; the
    //    response says which happened). An insufficient balance stops HERE,
    //    before the LLM call is ever bought.
    let charge: any;
    try {
      charge = await BackendAPI.deductCredits({
        user_id: user.id,
        amount: TRANSLATE_CREDITS,
        reason: 'Translate voiceover script',
        metadata: { kind: 'TRANSLATE' },
      });
    } catch (e: any) {
      setTranslating(false);
      if (e?.code === 'INSUFFICIENT_CREDITS' || e?.code === 'MONTHLY_LIMIT_REACHED' || e?.status === 402) {
        setError(`You need ${TRANSLATE_CREDITS} credit to translate — top up your balance in Billing to continue.`);
      } else {
        setError(e?.message || 'Could not start the translation — please try again.');
      }
      return false;
    }
    // Freebie responses carry the new remaining count; a paid one means the
    // allowance is spent (the server only charges once it is).
    setFreeRemaining(typeof charge?.free_remaining === 'number' ? charge.free_remaining : 0);
    void refresh();

    try {
      // generateText resolves to the generated text itself (the worker's
      // `text` field) — not an envelope object.
      const text = (await PropReelAPI.generateText('translate', {
        language,
        language_label: languageLabel,
        script: source,
      })).trim();
      if (!text) {
        setError('The translator returned an empty script — please try again.');
        throw new Error('empty');
      }
      // The translation is produced *in* the target language by the same
      // model that would verify it: seed the verdict so the post-translate
      // re-check is free instead of buying a second call for the same pair.
      verifiedRef.current = { text, language, ok: true };
      rememberVerdict(`${language}|${text}`, { ok: true, detected: null });
      onScriptChange(text);
      setTranslating(false);
      return true;
    } catch (e: any) {
      // 2) Nothing delivered → reverse the attempt: the refund matcher takes
      //    back the 1-credit charge, or — when a trial freebie paid — marks
      //    that 0-amount row reversed, which gives the free try BACK instead
      //    of burning it on a call that produced nothing.
      BackendAPI.refundCredits({ user_id: user.id, scope: 'translate' })
        .then(() => { void refresh(); return loadTranslateQuote(user.id, true); })
        .then((r) => setFreeRemaining(r))
        .catch(() => {});
      if (e?.message !== 'empty') setError(e?.message || 'Translation failed — please try again.');
      setTranslating(false);
      return false;
    }
  }, [script, language, languageLabel, onScriptChange, user, refresh]);

  const dismiss = useCallback(() => {
    dismissedKeyRef.current = checkKey;
    setDetectedLabel(null);
    setStatus('ok');
  }, [checkKey]);

  // Cost + remaining balance, side by side, for the mismatch dialog/banner:
  // "free — 2 left · you have 23 credits" / "1 credit · you have 23 credits".
  // The balance is the personal one (translate is personal-balance only) and
  // re-derives from the context user on every render, so it ticks down right
  // after a paid translate's refresh().
  const costPart =
    freeRemaining != null && freeRemaining > 0 ? `free — ${freeRemaining} left` : `${TRANSLATE_CREDITS} credit`;
  const balance = typeof user?.credits === 'number' ? user.credits : null;
  const translateCostLabel =
    balance == null ? costPart : `${costPart} · you have ${balance} credit${balance === 1 ? '' : 's'}`;

  return { status, detectedLabel, languageLabel, translating, translateCostLabel, error, translate, dismiss };
}
