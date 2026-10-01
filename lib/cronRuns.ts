import { putItem, TABLES } from './db';

export interface CronRunRecord {
  id: string; // `cron_run_<name>`
  type: 'cron_run';
  name: string;
  status: 'success' | 'error';
  finishedAt: string;
  durationMs: number;
  detail?: string;
}

/**
 * Every cron handler records its last run into the settings table so the
 * public status page can show real freshness instead of guesses.
 * Recording failures are logged, never fatal — a cron must not fail because
 * status bookkeeping failed.
 */
export async function recordCronRun(
  name: string,
  status: 'success' | 'error',
  durationMs: number,
  detail?: string
): Promise<void> {
  try {
    const record: CronRunRecord = {
      id: `cron_run_${name}`,
      type: 'cron_run',
      name,
      status,
      finishedAt: new Date().toISOString(),
      durationMs,
      detail: detail ? String(detail).slice(0, 300) : undefined,
    };
    await putItem(TABLES.SETTINGS, record);
  } catch (e) {
    console.error(`recordCronRun(${name}) failed (non-fatal):`, e);
  }
}
