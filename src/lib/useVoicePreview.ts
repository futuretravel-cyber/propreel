import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PropReelAPI } from './api';

/**
 * Plays a short narrator sample (server-synthesized, S3-cached per
 * language+voice pair) for the "Preview" button next to the voice pickers.
 *
 * The Video Generator and AI Avatar Video panels stay mounted at the same
 * time, so the currently-audible sample lives at module level: starting a
 * sample in one panel stops the other. URLs are cached module-wide too —
 * a pair plays back instantly after its first synthesis.
 */

let audio: HTMLAudioElement | null = null;
let currentKey: string | null = null;
let epoch = 0; // invalidates in-flight fetches when playback stops/switches
const listeners = new Set<() => void>();
const urlCache = new Map<string, string>();

function notify() {
  listeners.forEach((l) => l());
}

function halt() {
  epoch += 1;
  if (audio) {
    audio.pause();
    audio.onended = null;
    audio = null;
  }
  currentKey = null;
  notify();
}

export function useVoicePreview(watchKey?: string) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    listeners.add(tick);
    return () => {
      mounted.current = false;
      listeners.delete(tick);
    };
  }, [tick]);

  // Selection changed → the (still playing) sample no longer matches.
  useEffect(() => {
    halt();
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchKey]);

  const stop = useCallback(() => {
    halt();
  }, []);

  const play = useCallback(async (voice: string, language: string) => {
    const key = `${language}|${voice}`;
    if (currentKey === key) {
      halt(); // second click on the same sample → stop
      return;
    }
    halt();
    setError(null);
    setLoading(true);
    const at = epoch;
    try {
      let url = urlCache.get(key);
      if (!url) {
        url = await PropReelAPI.previewVoice(voice, language);
        urlCache.set(key, url);
      }
      if (at !== epoch || !mounted.current) return; // superseded while loading
      const a = new Audio(url);
      audio = a;
      currentKey = key;
      notify();
      a.onended = () => {
        if (audio === a) {
          audio = null;
          currentKey = null;
          notify();
        }
      };
      await a.play();
    } catch (e: any) {
      if (audio && currentKey === key) halt();
      if (mounted.current) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Tap again to hear the sample'
            : e?.message || 'Voice preview failed'
        );
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  return {
    play,
    stop,
    loading,
    error,
    playing: currentKey !== null,
    isCurrent: (voice: string, language: string) => currentKey === `${language}|${voice}`,
  };
}

export default useVoicePreview;
