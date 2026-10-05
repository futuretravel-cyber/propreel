/**
 * The AI-generated-content notice that gates every render.
 *
 * The warning has to be unmissable and acknowledged once before any credit
 * can be spent on an AI render, so it lives here as a single verbatim string
 * (never paraphrased at a call site) with the acknowledgement kept in
 * localStorage — one acknowledgement per browser, no server round-trip.
 *
 * Flow: a render button calls `guardAIRender(run)`. If the user has already
 * acknowledged, `run` fires immediately. Otherwise the notice opens with `run`
 * parked as the pending render, and it fires the moment they acknowledge —
 * so acknowledging once unblocks the action they actually clicked, instead of
 * making them press Render twice.
 */

/** The warning, verbatim. Order matters — the modal shows it sentence by
 *  sentence and `AI_DISCLAIMER_TEXT` reassembles the exact required copy. */
export const AI_DISCLAIMER_SENTENCES: string[] = [
  'This platform uses artificial intelligence (AI) to generate content.',
  'AI can make mistakes, produce inaccurate results, or generate unexpected outputs.',
  'By using this service, you acknowledge that AI-generated content may not always meet your expectations.',
  'Credits spent on unsatisfactory results are non-refundable.',
];

export const AI_DISCLAIMER_TEXT = AI_DISCLAIMER_SENTENCES.join(' ');

const STORAGE_KEY = 'propreel:ai-disclaimer:v1';

type OpenListener = (hasPendingRender: boolean) => void;
const openListeners = new Set<OpenListener>();

/** The render waiting for the user to acknowledge (null when opened from a link). */
let pendingRender: (() => void) | null = null;

export function isAIDisclaimerAccepted(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true; // no storage → no lock-out
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true; // storage blocked (private mode) — never trap the user
  }
}

export function acceptAIDisclaimer(): void {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* best effort */ }
}

/** Subscribe to "the notice should open now". `hasPendingRender` tells the
 *  modal whether acknowledging will immediately start a render. */
export function subscribeAIDisclaimerOpen(listener: OpenListener): () => void {
  openListeners.add(listener);
  return () => { openListeners.delete(listener); };
}

function emitOpen(): void {
  const hasPending = !!pendingRender;
  openListeners.forEach(listener => listener(hasPending));
}

/**
 * Run `render` only behind an acknowledged notice. Returns true when it ran
 * straight away; false when the notice was opened instead (the render then
 * runs on acknowledgement).
 */
export function guardAIRender(render: () => void): boolean {
  if (isAIDisclaimerAccepted()) {
    render();
    return true;
  }
  pendingRender = render;
  emitOpen();
  return false;
}

/** Open the notice from a "read more" link — nothing queued behind it. */
export function openAIDisclaimer(): void {
  pendingRender = null;
  emitOpen();
}

/** Called by the gate on "I understand" — the parked render, if any. */
export function takePendingRender(): (() => void) | null {
  const render = pendingRender;
  pendingRender = null;
  return render;
}

/** Called by the gate when the user backs out — the render never happens. */
export function clearPendingRender(): void {
  pendingRender = null;
}
