import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const MAX_BACKING = 2048; // mask raster cap (longest side) — the worker re-fits to the source anyway
/** Brush footprint as a fraction of the displayed photo's width. */
export const BRUSH_SIZE_PCT = 5;
/** Brand purple for the on-screen paint (PropReel theme). The EXPORTED mask
 *  stays white — fal Fill Pro thresholds on grayscale brightness and purple's
 *  luminance sits right at the 127 cut, so strokes are mirrored to a hidden
 *  white-on-black canvas for the file the worker receives. */
export const BRUSH_COLOR = 'rgba(168,85,247,1)'; // purple-500

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
  // Hidden twin canvas: same strokes in white-on-black, exactly what the
  // worker must receive (visibility canvas shows the brand-purple paint).
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  // Live brush position in % of the displayed photo, for the footprint ring
  const [cursor, setCursor] = useState<{ xPct: number; yPct: number } | null>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  // Size both backing stores to the photo's real aspect (downscaled only, so
  // a 6000px panorama doesn't blow up raster memory) and reset the layers.
  const fit = useCallback(() => {
    const el = canvasRef.current;
    const ex = exportCanvasRef.current;
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const ar = img.naturalWidth / img.naturalHeight;
    let w: number;
    let h: number;
    if (ar >= 1) { w = Math.min(img.naturalWidth, MAX_BACKING); h = Math.round(w / ar); }
    else { h = Math.min(img.naturalHeight, MAX_BACKING); w = Math.round(h * ar); }
    w = Math.max(2, w);
    h = Math.max(2, h);
    if (el) {
      if (el.width !== w) el.width = w;
      if (el.height !== h) el.height = h;
      const ctx = el.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, w, h); // transparent = unpainted = locked
    }
    if (ex) {
      if (ex.width !== w) ex.width = w;
      if (ex.height !== h) ex.height = h;
      const ectx = ex.getContext('2d');
      if (ectx) { ectx.fillStyle = '#000'; ectx.fillRect(0, 0, w, h); } // black = locked
    }
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

  // Hidden canvas lives off-screen; it only exists so export PNG stays
  // white-on-black regardless of how the visible layer is styled.
  const bindExportCanvas = useCallback((el: HTMLCanvasElement | null) => {
    exportCanvasRef.current = el;
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
    ctx.strokeStyle = BRUSH_COLOR; // purple on screen
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
      ctx.fillStyle = BRUSH_COLOR;
      ctx.fill();
    }
    // Mirror the same stroke, white-on-black, onto the export twin.
    const ex = exportCanvasRef.current;
    const ectx = ex?.getContext('2d');
    if (ex && ectx) {
      ectx.strokeStyle = 'rgba(255,255,255,1)'; // white = regenerable
      ectx.lineWidth = lineWidth;
      ectx.lineCap = 'round';
      ectx.lineJoin = 'round';
      if (prev && (prev.x !== pt.x || prev.y !== pt.y)) {
        ectx.beginPath();
        ectx.moveTo(prev.x, prev.y);
        ectx.lineTo(pt.x, pt.y);
        ectx.stroke();
      } else if (!prev) {
        ectx.beginPath();
        ectx.arc(pt.x, pt.y, lineWidth / 2, 0, Math.PI * 2);
        ectx.fillStyle = 'rgba(255,255,255,1)';
        ectx.fill();
      }
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
    if (el) {
      const ctx = el.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, el.width, el.height);
    }
    const ex = exportCanvasRef.current;
    if (ex) {
      const ectx = ex.getContext('2d');
      if (ectx) { ectx.fillStyle = '#000'; ectx.fillRect(0, 0, ex.width, ex.height); }
    }
    setHasStrokes(false);
    lastPt.current = null;
  }, []);

  /** Export the hidden twin: solid white paint on solid black. */
  const exportMaskFile = useCallback((): File | null => {
    const ex = exportCanvasRef.current;
    if (!ex || !hasStrokes) return null;
    const dataUrl = ex.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr.buffer], 'mask.png', { type: 'image/png' });
  }, [hasStrokes]);

  return {
    drawImageRef, bindCanvas, bindExportCanvas, stroke, track, hideCursor, endStroke, clear,
    hasStrokes, exportMaskFile, cursor, brushPct: BRUSH_SIZE_PCT,
  };
}
