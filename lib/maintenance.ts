/**
 * Site "Update Mode" (maintenance) — single source of truth.
 *
 * The Admin → Update Mode tab flips a `settings/maintenance_mode` row; the
 * browser boot gate and the server-side 503 gate both read through THIS
 * module so they can never disagree about what mode the site is in.
 *
 * Reads are hot-path: every API request consults this when the gate is
 * wired in, so the get is cached in-process for 10s — an admin flip takes
 * at most 10s to propagate within a warm lambda, and cold lambdas fetch
 * fresh state immediately. The absolute floor for propagation is Vercel's
 * ~30s, regardless.
 */
import { getItem, putItem, TABLES } from './db';

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  updatedAt: string | null;
}

export const DEFAULT_MAINTENANCE_MESSAGE =
  'The Studio is being upgraded with new features. This takes a few minutes — please refresh again shortly.';

let cache: { state: MaintenanceState; expiresAt: number } | null = null;
const CACHE_MS = 10_000;

/**
 * Read the current update-mode state. Fail-open: if the settings table is
 * unreachable the site stays UP — an update-mode row must never be able to
 * take the whole platform down by accident (a D1/SDK outage would then
 * look like a permanent maintenance window).
 */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  if (cache && cache.expiresAt > Date.now()) return cache.state;
  try {
    const row = await getItem<any>(TABLES.SETTINGS, { id: 'maintenance_mode' });
    const state: MaintenanceState = row
      ? {
          enabled: !!row.enabled,
          message: (row.message as string) || DEFAULT_MAINTENANCE_MESSAGE,
          updatedAt: (row.updatedAt as string) || null,
        }
      : { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE, updatedAt: null };
    cache = { state, expiresAt: Date.now() + CACHE_MS };
    return state;
  } catch {
    return { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE, updatedAt: null };
  }
}

/** Write the update-mode row (the Admin tab's POST handler). */
export async function setMaintenanceState(
  enabled: boolean,
  message: string | undefined,
): Promise<MaintenanceState> {
  const state: MaintenanceState = {
    enabled,
    message: (message && message.trim()) || DEFAULT_MAINTENANCE_MESSAGE,
    updatedAt: new Date().toISOString(),
  };
  await putItem(TABLES.SETTINGS, {
    id: 'maintenance_mode',
    type: 'maintenance_mode',
    enabled: state.enabled,
    message: state.message,
    updatedAt: state.updatedAt,
  });
  cache = { state, expiresAt: Date.now() + CACHE_MS };
  return state;
}

/** Clear the in-process cache (tests/ops). */
export function resetMaintenanceCache(): void {
  cache = null;
}
