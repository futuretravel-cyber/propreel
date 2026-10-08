import { useCallback, useEffect, useRef, useState } from 'react';
import { PropReelAPI } from './api';
import { SA_LANGUAGES } from './constants';

export type VoiceoverLanguageStatus = 'idle' | 'checking' | 'ok' | 'mismatch';

export interface VoiceoverLanguageCheck {
  status: VoiceoverLanguageStatus;
  /** Human label of the language the script appears to be written in */
  detectedLabel: string | null;
  /** Human label of the SELECTED voiceover language */
  languageLabel: string;
  /** True while the one-click translation is running */
  translating: boolean;
  /** Set when a translation attempt failed (cleared on retry/dismiss) */
  error: string | null;
  /** Auto-correct: rewrite the script in the selected language, then re-check */
  translate: () => Promise<string | null>;
  /** "Keep as is" — suppress the warning for THIS exact text + language */
  dismiss: () => void;
}

const labelOf = (code: string): string =>
  SA_LANGUAGES.find(l => l.id === code)?.label || code;

/**
 * Detects a mismatch between the voiceover script and the selected language.
 *
 * Narakeet reads scripts verbatim — an English script with an isiZulu voice
 * comes out mangled — and there is no auto-translation anywhere. The check
 * is a debounced, fail-open LLM verdict (worker `language_check` kind): a
 * parse failure or a network error never blocks anything, it just stays
 * silent. Dismissals are keyed to the exact text + language, so any edit
 * re-arms the warning.
 */
export function useVoiceoverLanguageCheck(
  script: string,
  language: string,
  onScriptChange: (s: string) => void
): VoiceoverLanguageCheck {
  const [status, setStatus] = useState<VoiceoverLanguageStatus>('idle');
  const [detectedLabel, setDetectedLabel] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const dismissedKeyRef = useRef<string | null>(null);

  const languageLabel = labelOf(language);
  const trimmed = script.trim();
  const checkKey = `${language}|${trimmed}`;

  useEffect(() => {
    if (trimmed.length < 12) {
      setStatus('idle');
      setDetectedLabel(null);
      return;
    }
    if (dismissedKeyRef.current === checkKey) {
      setStatus('ok');
      setDetectedLabel(null);
      return;
    }
    const seq = ++seqRef.current;
    setStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const raw = await PropReelAPI.generateText('language_check', {
          text: trimmed,
          target_language: language,
          language_label: languageLabel,
        });
        if (seq !== seqRef.current) return; // superseded by a newer edit
        // Fail open: the model is told to answer with bare JSON only.
        const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        const verdict = JSON.parse(cleaned) as { detected?: string; ok?: boolean };
        if (verdict.ok === false && verdict.detected && verdict.detected !== language) {
          setDetectedLabel(labelOf(verdict.detected));
          setStatus('mismatch');
        } else {
          setDetectedLabel(null);
          setStatus('ok');
        }
      } catch {
        if (seq !== seqRef.current) return;
        setDetectedLabel(null);
        setStatus('idle'); // undetermined — never nag on a guess
      }
    }, 1400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, language]);

  const translate = useCallback(async () => {
    if (translating || !trimmed) return null;
    setTranslating(true);
    setError(null);
    try {
      const out = await PropReelAPI.generateText('translate', {
        text: trimmed,
        target_language: language,
        language_label: languageLabel,
      });
      let text = (out || '').trim();
      // Belt and braces: strip wrapping quotes if the model added any.
      const q = text[0];
      if ((q === '"' || q === '\u201c' || q === "'") && text.endsWith(q)) {
        text = text.slice(1, -1).trim();
      }
      if (!text) throw new Error('empty translation');
      dismissedKeyRef.current = null;
      onScriptChange(text);
      return text;
    } catch (e: any) {
      setError(e?.message || 'Translation failed — try again');
      return null;
    } finally {
      setTranslating(false);
    }
  }, [translating, trimmed, language, languageLabel, onScriptChange]);

  const dismiss = useCallback(() => {
    dismissedKeyRef.current = `${language}|${script.trim()}`;
    setStatus('ok');
    setDetectedLabel(null);
    setError(null);
  }, [language, script]);

  return { status, detectedLabel, languageLabel, translating, error, translate, dismiss };
}

export default useVoiceoverLanguageCheck;
