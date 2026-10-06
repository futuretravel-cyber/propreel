/**
 * Media-origin audit — the daily selftest's two media invariants
 * (docs/uploads-origin-isolation.md §5, §12.9).
 *
 *   responses: no bucket hostname ever reaches the client. Every URL for one
 *              of our objects comes back on the media origin (`uploads.` /
 *              `cdn.propreel.co.za`) and carries a live presign.
 *   rows:      stored media keeps the canonical BUCKET form with NO query. A
 *              signed URL in a row is a link with a fuse — reads return those
 *              exact bytes, so nothing can ever renew it (the Phase-3
 *              "frozen presign" defect), and an edge host in a row breaks
 *              server-side consumers that resolve buckets directly.
 *
 * Everything worth asserting is a PURE function (checkResponseBody,
 * rowViolations) so the probe can feed it a poisoned body/row and prove the
 * check fails when it should; the two `audit*` runners wire those pure checks
 * to real HTTP responses and a real DynamoDB scan.
 */
import { TABLES, scanItems } from './db';

export interface MediaCheck {
  name: string;
  /** false = regression. undefined + skipped = not evaluated (never a failure). */
  ok?: boolean;
  skipped?: string;
  detail: string;
}

const REGION = process.env.AWS_REGION || 'af-south-1';
const RAW_BUCKET = process.env.AWS_S3_RAW_BUCKET || 'propreel-raw-assets';
const OUTPUT_BUCKET = process.env.AWS_S3_OUTPUT_BUCKET || 'propreel-video-outputs-sa';
const BUCKET_HOSTS = [
  `${RAW_BUCKET}.s3.${REGION}.amazonaws.com`,
  `${OUTPUT_BUCKET}.s3.${REGION}.amazonaws.com`,
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normHost(value: string | undefined): string | null {
  const host = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return host && !/[^a-z0-9.\-]/i.test(host) ? host.toLowerCase() : null;
}

/**
 * Hostnames the browser may see for our objects, or null when the edge is
 * rolled back (EDGE_* unset → responses are legitimately bucket-hosted and
 * only the row invariant still applies).
 */
export function allowedMediaHosts(): string[] | null {
  const raw = normHost(process.env.EDGE_RAW_HOST);
  const cdn = normHost(process.env.EDGE_CDN_HOST);
  return raw && cdn ? [raw, cdn] : null;
}

/** Every `https://<our bucket>/…` URL inside a payload. */
export function findBucketHosts(text: string): string[] {
  const found = new Set<string>();
  for (const host of BUCKET_HOSTS) {
    const re = new RegExp(`https?://${esc(host)}[^"'\\s)\\\\]*`, 'gi');
    for (const m of text.match(re) || []) found.add(m);
  }
  return [...found];
}

/** Pure: does this response payload leak a bucket hostname? */
export function checkResponseBody(name: string, body: string): MediaCheck {
  if (!allowedMediaHosts()) {
    return { name, skipped: 'EDGE host unset', detail: 'edge rolled back — bucket hosts are expected here' };
  }
  const leaks = findBucketHosts(body);
  if (leaks.length) {
    return { name, ok: false, detail: `bucket hostname handed to the client: ${leaks[0].split('?')[0]}` };
  }
  return { name, ok: true, detail: 'no bucket hostname' };
}

/**
 * Pure: the probe project the selftest planted must come back SIGNED and on
 * the media origin (bucket host only when the edge is rolled back).
 */
export function checkProbeProject(name: string, body: string, probeProjectId: string): MediaCheck {
  let project: any;
  try {
    project = (JSON.parse(body)?.projects || []).find((p: any) => p?.id === probeProjectId);
  } catch {
    return { name, ok: false, detail: 'projects response is not JSON' };
  }
  if (!project) return { name, ok: false, detail: 'probe project missing from the response' };

  const allowed = allowedMediaHosts();
  const fields: Array<[string, unknown]> = [
    ['photos[0]', project.photos?.[0]],
    ['videoUrl', project.videoUrl],
    ['thumbnailUrl', project.thumbnailUrl],
  ];
  const problems: string[] = [];
  for (const [field, value] of fields) {
    if (typeof value !== 'string' || !value) {
      problems.push(`${field} missing`);
      continue;
    }
    let host = '';
    try {
      host = new URL(value).hostname.toLowerCase();
    } catch {
      problems.push(`${field} unparseable`);
      continue;
    }
    if (!/X-Amz-/.test(value)) problems.push(`${field} not signed`);
    const expected = allowed || BUCKET_HOSTS.map(h => h.toLowerCase());
    if (!expected.includes(host)) problems.push(`${field} on ${host}`);
  }
  return problems.length
    ? { name, ok: false, detail: problems.join('; ') }
    : { name, ok: true, detail: `signed on ${allowed ? allowed[0] : 'bucket host (edge off)'}` };
}

/**
 * Pure: violations for one stored row. Returns human-readable findings —
 * "keeps a signed URL" or "stored on the media origin" — for our own objects
 * only; external listing photos and vendor URLs are ignored.
 */
export function rowViolations(label: string, row: any): string[] {
  const out: string[] = [];
  const allowed = allowedMediaHosts();

  const visit = (field: string, value: unknown) => {
    if (typeof value !== 'string' || !value) return;
    let host = '';
    try {
      host = new URL(value).hostname.toLowerCase();
    } catch {
      return;
    }
    const isOurs =
      BUCKET_HOSTS.map(h => h.toLowerCase()).includes(host) ||
      (allowed !== null && allowed.includes(host));
    if (!isOurs) return; // external listing photo / vendor URL — not ours to rule on
    if (/X-Amz-/.test(value)) out.push(`${label}.${field}: keeps a signed URL (host ${host})`);
    else if (allowed && allowed.includes(host)) out.push(`${label}.${field}: stored on the media origin (rows keep the bucket form)`);
  };

  visit('videoUrl', row?.videoUrl);
  visit('thumbnailUrl', row?.thumbnailUrl);
  visit('avatarUrl', row?.avatarUrl);
  visit('url', row?.url);
  (Array.isArray(row?.photos) ? row.photos : []).forEach((p: unknown, i: number) => visit(`photos[${i}]`, p));
  (Array.isArray(row?.agentProfiles) ? row.agentProfiles : []).forEach((p: any, i: number) => {
    if (!p || typeof p !== 'object') return;
    visit(`agentProfiles[${i}].photoUrl`, p.photoUrl);
    visit(`agentProfiles[${i}].logoUrl`, p.logoUrl);
  });
  return out;
}

/** One check per table: every stored media field is canonical and unsigned. */
export async function auditStoredRows(): Promise<MediaCheck[]> {
  const checks: MediaCheck[] = [];

  const scan = async (
    name: string,
    tableName: string,
    opts: { limit?: number; filter?: any } = {},
    label: (row: any, index: number) => string = (_r, i) => `row${i}`
  ) => {
    try {
      const rows = await scanItems<any>(tableName, opts);
      const problems: string[] = [];
      rows.forEach((row, i) => problems.push(...rowViolations(label(row, i), row)));
      checks.push(
        problems.length
          ? { name, ok: false, detail: `${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}` }
          : { name, ok: true, detail: `${rows.length} rows clean` }
      );
    } catch (e: any) {
      checks.push({ name, ok: false, detail: `scan failed: ${e?.message || e}` });
    }
  };

  await scan('rows:projects', TABLES.PROJECTS, { limit: 1000 }, row => row?.id || 'row?');
  await scan('rows:users', TABLES.USERS, { limit: 1000 }, row => row?.id || 'row?');
  await scan('rows:music', TABLES.SETTINGS, {
    limit: 500,
    filter: { expression: '#t = :mt', names: { '#t': 'type' }, values: { ':mt': 'music_track' } },
  }, row => row?.id || 'row?');

  return checks;
}

/**
 * Fetch the media-carrying API responses with the caller's session and assert
 * the response invariants. The projects response is the load-bearing one: it
 * is `signProjectUrls`' output for a row the selftest planted in canonical
 * bucket form, so it proves the whole row → response → media-origin chain.
 */
export async function auditApiResponses(
  origin: string,
  cookie: string,
  opts: { userId: string; probeProjectId: string }
): Promise<MediaCheck[]> {
  const checks: MediaCheck[] = [];

  const get = async (label: string, path: string, onBody?: (body: string) => MediaCheck) => {
    try {
      const r = await fetch(`${origin}${path}`, {
        headers: { cookie },
        signal: AbortSignal.timeout(15_000),
      });
      const body = await r.text();
      if (r.status !== 200) {
        checks.push({ name: label, ok: false, detail: `HTTP ${r.status} ${body.slice(0, 120)}` });
        return;
      }
      // The body check skips when EDGE is off; the probe check does not —
      // it accepts signed bucket hosts as the rollback form, so the
      // row → response → sign invariant is asserted either way.
      checks.push(checkResponseBody(label, body));
      if (onBody) checks.push(onBody(body));
    } catch (e: any) {
      checks.push({ name: label, ok: false, detail: `unreachable: ${e?.message || e}` });
    }
  };

  await Promise.all([
    get('api:projects', `/api/projects?user_id=${encodeURIComponent(opts.userId)}`, body =>
      checkProbeProject('api:projects/probe', body, opts.probeProjectId)
    ),
    get('api:user', `/api/users?id=${encodeURIComponent(opts.userId)}`),
    get('api:music', '/api/music'),
  ]);

  // Parallel fetches push in completion order — sort so the report is stable.
  checks.sort((a, b) => a.name.localeCompare(b.name));
  return checks;
}
