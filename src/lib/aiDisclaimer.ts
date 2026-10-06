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
 *
 * The acknowledgement lives in localStorage first (the gate is synchronous and
 * must never wait on the network), but for a signed-in account it is also
 * mirrored server-side as { version, timestamp } on the user record — so it
 * follows the account to another device. The server never decides: it only
 * hands back the version it stored, and the local gate accepts it solely when
 * that hash matches the live notice.
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

/** FNV-1a content hash — shared by every content-versioned acknowledgement
 *  (the AI notice, the Terms consent). Any edit to the hashed text yields a
 *  new version and stale acknowledgements stop counting. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Content-versioned key: propreel:ai-disclaimer:<hash of the notice>. */
const ACK_HASH = fnv1a(AI_DISCLAIMER_TEXT);
const STORAGE_KEY = `propreel:ai-disclaimer:${ACK_HASH}`;

/** The pre-versioning fixed key. Its acknowledgement only still counts while
 *  the live notice hashes to LEGACY_V1_TEXT_HASH — i.e. exactly the text it
 *  was given under. The first wording edit re-prompts those holders too. */
const LEGACY_STORAGE_KEY = 'propreel:ai-disclaimer:v1';
/** Frozen: hash of the notice that shipped alongside the legacy key. */
const LEGACY_V1_TEXT_HASH = '84db15f7';

type OpenListener = (hasPendingRender: boolean) => void;
const openListeners = new Set<OpenListener>();

/** The render waiting for the user to acknowledge (null when opened from a link). */
let pendingRender: (() => void) | null = null;

export function isAIDisclaimerAccepted(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true; // no storage → no lock-out
    if (localStorage.getItem(STORAGE_KEY) === '1') return true;
    // Legacy v1 acknowledgement — honoured only for the text it was given under
    return ACK_HASH === LEGACY_V1_TEXT_HASH
      && localStorage.getItem(LEGACY_STORAGE_KEY) === '1';
  } catch {
    return true; // storage blocked (private mode) — never trap the user
  }
}

export function acceptAIDisclaimer(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
    localStorage.removeItem(LEGACY_STORAGE_KEY); // migrated to the versioned key
  } catch { /* best effort */ }
}

/** The acknowledgement version that goes to the server: the notice's own
 *  content hash. Editing any sentence above changes it, which re-prompts every
 *  device the moment they next hydrate. */
export const AI_NOTICE_ACK_VERSION = ACK_HASH;

// `?.` keeps this callable outside Vite's runtime (harnesses/tests) — in the
// built app Vite always defines import.meta.env.
const apiBase = (): string => (import.meta as any).env?.VITE_API_URL || '';

/**
 * Pull the signed-in account's server-side acknowledgement and seed the local
 * gate from it. Returns true when the account already acknowledged THIS exact
 * notice (locally or on the server). Signed out, offline, or an older notice
 * → false, and the local gate decides as before. Never throws, never blocks
 * acceptance — localStorage is written, never read-and-waited on here.
 */
export async function hydrateServerAIDisclaimer(): Promise<boolean> {
  if (isAIDisclaimerAccepted()) return true;
  try {
    const res = await fetch(`${apiBase()}/api/users?action=ai_notice`, { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.version === ACK_HASH && data?.acknowledgedAt) {
      acceptAIDisclaimer(); // account already covers the live notice
      return true;
    }
  } catch { /* offline / signed out — local state stands */ }
  return false;
}

/** Fire-and-forget write-through after a local accept: records the version +
 *  timestamp on the account so other devices inherit it. Local acceptance
 *  never waits on this, and a signed-out / offline call is a no-op. */
export async function postAIDisclaimerAck(): Promise<void> {
  try {
    await fetch(`${apiBase()}/api/users?action=ai_notice`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: ACK_HASH }),
    });
  } catch { /* best effort */ }
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
