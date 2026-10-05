import { useEffect, useRef, useState } from 'react';

/**
 * Local persistence for Studio uploads.
 *
 * Every Studio panel used to keep its picked images in React state only, so a
 * full page reload (F5, crash restore, laptop reopen) silently threw the
 * agent's work away — images survived tab switches but not navigation. This
 * module persists them per user, per slot.
 *
 * Storage is IndexedDB, not localStorage: a single 25MB photo becomes a ~33MB
 * data URL, well past localStorage's ~5MB quota. Writes are best-effort —
 * private modes that block IndexedDB simply degrade to the old in-memory
 * behaviour instead of throwing.
 *
 * Keys are namespaced by user id so a second account on the same browser
 * never sees another person's photos.
 */

const DB_NAME = 'propreel_studio_drafts';
const STORE = 'drafts';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // Allow a fresh attempt next time if opening failed (private mode, etc.)
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

async function getDraft<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function putDraft(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (e) {
    // Quota / blocked storage — persistence is a nicety, never fatal
    console.warn('[studioDrafts] save failed for', key, e);
  }
}

async function clearDraft(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

/** Nothing worth keeping — clears the slot instead of storing it. */
function isBlank(v: unknown): boolean {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v).every(isBlank);
  return false;
}

/** Namespaced draft key for a signed-in user; null while signed out. */
export function studioDraftKey(userId: string | undefined | null, slot: string): string | null {
  return userId ? `propreel:${userId}:${slot}` : null;
}

/** Rebuild an uploadable File from a stored data URL (restored previews). */
export async function dataUrlToFile(dataUrl: string, name = 'upload'): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const type = blob.type || 'image/png';
  const ext = (type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return new File([blob], `${name}.${ext}`, { type });
}

/**
 * useState with local persistence. Same API as useState (plus a `hydrated`
 * flag); the value survives full page reloads when `key` is non-null.
 *
 * The first read for a key is async: an edit made before it lands wins over
 * the stored draft (and is persisted in its place), so a fast user can never
 * have a fresh pick clobbered by stale state. `hydrated` flips true once that
 * read settles — components that must not react to `profileImage`-style
 * cross-panel changes mid-restore can wait for it.
 */
export function useStudioDraft<T>(key: string | null, initial: T): [T, (v: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValueState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const touchedRef = useRef(false);
  const initialRef = useRef(initial);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Hydrate once per key
  useEffect(() => {
    let alive = true;
    setHydrated(false);
    if (!key) {
      setHydrated(true);
      return () => { alive = false; };
    }
    getDraft<T>(key).then(stored => {
      if (!alive) return;
      if (touchedRef.current) {
        // The user edited while the read was in flight — their state wins
        if (isBlank(valueRef.current)) clearDraft(key);
        else putDraft(key, valueRef.current);
      } else if (!isBlank(stored)) {
        setValueState(stored as T);
      }
      setHydrated(true);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist every change once hydrated; blank values free the slot
  useEffect(() => {
    if (!key || !hydrated) {
      // A pre-hydration edit must beat whatever the pending read finds
      if (key && !hydrated && value !== initialRef.current) touchedRef.current = true;
      return;
    }
    if (isBlank(value)) clearDraft(key);
    else putDraft(key, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value, hydrated]);

  return [value, setValueState, hydrated];
}
