import { useEffect, useState } from 'react';

/**
 * Live sizing check for AI Avatar Video reference photos.
 *
 * fal's flashhead animates a PORTRAIT face reference (the output is a
 * 512×512 clip), so a landscape photo gets center-cropped — often straight
 * through the face — and a low-resolution one leaves too few pixels for a
 * clean lip-sync, which comes out warped or fails outright. Returns a
 * human-readable warning naming the real dimensions, or null when the photo
 * is fine (measurement is best-effort: undecodable formats like HEIC in
 * some browsers simply report nothing).
 */
export function useAvatarPhotoIssue(src: string | null | undefined): string | null {
  const [issue, setIssue] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setIssue(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      let msg: string | null = null;
      if (w > h * 1.1) {
        msg = `${w}×${h} is landscape — the avatar needs a portrait photo. ` +
          'It gets cropped to fit, which can cut off your face, and the video may not generate properly.';
      } else if (Math.min(w, h) < 700) {
        msg = `${w}×${h} is too small — use at least 720 × 900 px (ideal: 1024 × 1280 portrait). ` +
          'A small face makes the finished avatar look distorted.';
      }
      setIssue(msg);
    };
    img.onerror = () => {
      if (!cancelled) setIssue(null);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return issue;
}

export default useAvatarPhotoIssue;
