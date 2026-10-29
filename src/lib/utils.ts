import { clsx, type ClassValue } from 'clsx';
import { CREDIT_LIST_RAND } from './constants';

export function cn(...inputs: ClassValue[]) {
  return inputs.filter(Boolean).join(' ');
}

// ZAR with the decimal system (cents): R 129,00 / R 12 500 000,00
export const formatZar = (n: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

/**
 * Rand LIST value of a credit balance (1 credit = R1.50 list —
 * CREDIT_LIST_RAND in lib/constants). Pricing UI shows these so customers
 * see the Rand worth of credits; it is the valuation anchor, not the
 * cash price of a top-up pack.
 */
export const creditListZar = (credits: number) => formatZar((credits || 0) * CREDIT_LIST_RAND);

/**
 * Compact rand value of credits ("R165") — for copy that reads
 * "110 credits/month = R165" next to a credit count. Whole rands by
 * default; cents only when a product of the ladder produces them.
 */
export const creditValueZar = (credits: number) =>
  `R${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 }).format((credits || 0) * CREDIT_LIST_RAND)}`;

export const formatDate = (d: string | Date) => {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

export const formatRelative = (d: string | Date) => {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
};

export const formatDuration = (s: number) => {
  const total = Math.max(0, Math.round(s || 0));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export const wordCount = (text: string) =>
  String(text || '').trim().split(/\s+/).filter(Boolean).length;

export const truncate = (text: string, max = 80) => {
  const s = String(text || '');
  return s.length <= max ? s : `${s.slice(0, max - 1).trim()}…`;
};

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Download a remote file reliably. Browsers IGNORE the `download` attribute
 * when the href is cross-origin (cdn.propreel.co.za), so a plain
 * `<a href={signedUrl} download>` just navigates to a new tab instead of
 * saving. Fetch the bytes as a blob first — the CDN sends CORS headers for
 * our origins — then click a same-origin object URL, which every browser
 * saves as a file. Throws so the caller can fall back to open-in-tab.
 */
export async function downloadRemoteFile(fileUrl: string, fallbackName?: string): Promise<void> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const blob = await res.blob();
  const base = decodeURIComponent(fileUrl.split('?')[0].split('/').pop() || '');
  const name = fallbackName || (/\.[a-z0-9]{1,5}$/i.test(base) ? base : `download-${Date.now()}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

// SA decimal comma for the marketing rate copy ("R1,50/credit") — the
// Intl en-ZA currency style renders a dot in some browsers.
export const zarComma = (n: number) => n.toFixed(2).replace('.', ',');
// Same style, but compact whole rands ("R75"), cents only when they exist.
export const zarCommaCompact = (n: number) => n.toFixed(2).replace(/\.00$/, '').replace('.', ',');

/**
 * Serialise rows to RFC-4180 CSV and download it. Cell values are quoted
 * when needed; formula-injection characters (=+-@) are prefixed with a
 * quote so Excel treats them as text. Used by the admin CSV exports.
 */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  const cols = columns && columns.length ? columns : Object.keys(rows[0] || {});
  const cell = (v: unknown) => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(cell).join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>, columns?: string[]): void {
  downloadText(filename, toCsv(rows, columns));
}

// Raw upload filenames leak into project titles as the segment after the
// last " — " ("Coastal Relaxed — Gemini_…_150quu…"). Display those cards
// without the file-noise; the stored title is untouched. Deliberately NO
// vendor/product names here (stealth guard) — the long single-token rule
// below already covers AI-generated filename stems like
// "<Vendor>_Generated_Image_<hash>".
const RAW_FILE_NAME =
  /^(IMG[-_ ]?\d|IMG-\d{8}|DSC[-_]?\d|PXL[-_]?\d|WhatsApp Image|[Ss]creenshot\d*|screen[-_]?shot\d*)/;

export function displayProjectTitle(title: string): string {
  const parts = String(title || '').split(/\s+—\s+/);
  if (parts.length < 2) return title;
  const last = parts[parts.length - 1].replace(/\.[a-z0-9]{1,5}$/i, '');
  const looksRaw =
    RAW_FILE_NAME.test(last) ||
    // hash-y single-token file stems (no spaces, long, one alphabet) —
    // never a plausible hand-written title.
    (last.length >= 16 && !/\s/.test(last) && /^[A-Za-z0-9_-]+$/.test(last));
  if (!looksRaw) return title;
  const kept = parts.slice(0, -1).join(' — ').trim();
  return kept || title;
}
