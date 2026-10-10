import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const MAX_BACKING = 2048; // mask raster cap (longest side) — the worker re-fits to the source anyway
/** Brush footprint as a fraction of the displayed photo's width. */
export const BRUSH_SIZE_PCT = 5;

/**
 * Brush mask overlay for the staging workbench: paint over the furniture you
 * want removed/replaced before generating. Produces a white-on-black PNG
 * handed to the worker as mask_url; fal Fill Pro physically locks every
 * pixel you didn't paint.
 *
 * Coordinate story (fixes the "paint lands away from the pointer" bug): the
 * canvas backing store is sized to the photo's REAL pixel aspect — not a
 * fixed 640×480 — and every pointer event is mapped through the canvas's
 * live bounding rect, so a stroke always lands exactly under the pointer on
 * any aspect ratio and any layout. The export is therefore never
 * letterboxed either.
 */
export function useBrushMask(enabled: boolean) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  // Live brush position in % of the displayed photo, for the footprint ring
  const [cursor, setCursor] = useState<{ xPct: number; yPct: number } | null>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  // Size the backing store to the photo's real aspect (downscaled only, so a
  // 6000px panorama doesn't blow up raster memory) and reset the layer.
  const fit = useCallback(() => {
    const el = canvasRef.current;
    const img = imgRef.current;
    if (!el || !img || !img.naturalWidth || !img.naturalHeight) return;
    const ar = img.naturalWidth / img.naturalHeight;
    let w: number;
    let h: number;
    if (ar >= 1) { w = Math.min(img.naturalWidth, MAX_BACKING); h = Math.round(w / ar); }
    else { h = Math.min(img.naturalHeight, MAX_BACKING); w = Math.round(h * ar); }
    w = Math.max(2, w);
    h = Math.max(2, h);
    if (el.width !== w) el.width = w;
    if (el.height !== h) el.height = h;
    const ctx = el.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, w, h); // transparent = unpainted = locked
    setHasStrokes(false);
    setCursor(null);
    lastPt.current = null;
  }, []);

  // Bind the photo: the canvas needs its intrinsic size, which may still be
  // loading when refs attach (data URLs decode asynchronously).
  const drawImageRef = useCallback((el: HTMLImageElement | null) => {
    imgRef.current = el;
    if (!el) return;
    if (el.complete && el.naturalWidth) fit();
    else el.addEventListener('load', fit, { once: true });
  }, [fit]);

  const bindCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (el) fit();
  }, [fit]);

  /** Map a pointer event's client coords into canvas pixels + display %. */
  const mapPoint = useCallback((e: { clientX: number; clientY: number }) => {
    const el = canvasRef.current;
    if (!el || !enabled) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: (e.clientX - r.left) * (el.width / r.width),
      y: (e.clientY - r.top) * (el.height / r.height),
      xPct: ((e.clientX - r.left) / r.width) * 100,
      yPct: ((e.clientY - r.top) / r.height) * 100,
    };
  }, [enabled]);

  /** Paint at the pointer (call on pointerdown, and on move while held). */
  const stroke = useCallback((e: ReactPointerEvent) => {
    const el = canvasRef.current;
    const pt = mapPoint(e);
    if (!el || !pt) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const lineWidth = Math.max(12, el.width * (BRUSH_SIZE_PCT / 100));
    ctx.strokeStyle = 'rgba(255,255,255,1)'; // white = regenerable
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const prev = lastPt.current;
    if (prev && (prev.x !== pt.x || prev.y !== pt.y)) {
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    } else if (!prev) {
      // Single click → dot
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fill();
    }
    lastPt.current = { x: pt.x, y: pt.y };
    setHasStrokes(true);
    setCursor({ xPct: pt.xPct, yPct: pt.yPct });
  }, [mapPoint]);

  /** Follow the pointer without painting (hover). */
  const track = useCallback((e: ReactPointerEvent) => {
    const pt = mapPoint(e);
    if (pt) setCursor({ xPct: pt.xPct, yPct: pt.yPct });
  }, [mapPoint]);

  const hideCursor = useCallback(() => setCursor(null), []);

  const endStroke = useCallback(() => {
    lastPt.current = null;
  }, []);

  const clear = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, el.width, el.height);
    setHasStrokes(false);
    lastPt.current = null;
  }, []);

  /** Export strokes as a PNG File: solid white paint on solid black.
   *  (On screen strokes render translucent; the mask itself must be firm.) */
  const exportMaskFile = useCallback((): File | null => {
    const el = canvasRef.current;
    if (!el || !hasStrokes) return null;
    const out = document.createElement('canvas');
    out.width = el.width;
    out.height = el.height;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(el, 0, 0);
    const dataUrl = out.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr.buffer], 'mask.png', { type: 'image/png' });
  }, [hasStrokes]);

  return {
    drawImageRef, bindCanvas, stroke, track, hideCursor, endStroke, clear,
    hasStrokes, exportMaskFile, cursor, brushPct: BRUSH_SIZE_PCT,
  };
}
