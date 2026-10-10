import { useCallback, useRef, useState } from 'react';

/**
 * Brush mask overlay for the staging workbench: the user paints over the
 * furniture they want removed/replaced before hitting generate. Produces a
 * white-on-black PNG (white = regenerable area) uploaded to the same S3
 * prefix scheme as the source photo, then handed to the worker as mask_url.
 * Everything outside the white strokes is physically locked by fal Fill Pro
 * — not prompt language, an actual pixel constraint.
 */
export function useBrushMask(imageSrc: string | null) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  // Bind a canvas sized to the displayed image (CSS pixels). The mask is
  // rasterized at native image resolution on export via naturalWidth scale.
  const bindCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (el && imageSrc) {
      const ctx = el.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, el.width, el.height);
        ctx.fillStyle = 'rgba(0,0,0,1)'; // black = locked background
        ctx.fillRect(0, 0, el.width, el.height);
      }
      setHasStrokes(false);
    }
  }, [imageSrc]);

  const stroke = useCallback((x: number, y: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = 'rgba(255,255,255,1)'; // white = regenerable
    ctx.lineWidth = Math.max(18, el.width * 0.05); // scales with display size
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const prev = lastPt.current;
    if (prev) {
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      // dot for a single click
      ctx.beginPath();
      ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fill();
    }
    lastPt.current = { x, y };
    setHasStrokes(true);
  }, []);

  const endStroke = useCallback(() => {
    drawing.current = false;
    lastPt.current = null;
  }, []);

  const clear = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, el.width, el.height);
    setHasStrokes(false);
  }, []);

  /** Export the mask as a PNG File (white strokes on black), sized to fit the
   *  displayed canvas pixel space (worker re-fits to the image anyway). */
  const exportMaskFile = useCallback((): File | null => {
    const el = canvasRef.current;
    if (!el || !hasStrokes) return null;
    const dataUrl = el.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr.buffer], 'mask.png', { type: 'image/png' });
  }, [hasStrokes]);

  return { bindCanvas, stroke, endStroke, clear, hasStrokes, exportMaskFile };
}
