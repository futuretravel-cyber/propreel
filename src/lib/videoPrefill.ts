/**
 * One-shot hand-off into the Studio Video Generator.
 * A listing card, a project card or the Property Description tab queues its
 * photos + voiceover script here, then navigates to /studio?tab=video — the
 * Studio consumes it once on mount.
 */
export interface VideoPrefill {
  images?: string[];
  script?: string;
  title?: string;
}

const KEY = 'propreel_video_prefill';

export function queueVideoRender(prefill: VideoPrefill): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(prefill));
  } catch {
    // sessionStorage unavailable (private mode quota) — render just starts empty
  }
}

export function takeVideoRender(): VideoPrefill | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as VideoPrefill;
  } catch {
    return null;
  }
}
