/**
 * Magic-byte sniffer for media uploads.
 *
 * sharp only understands images, so bytes on the audio path are identified
 * here from their binary signatures. This is what rejects payloads that
 * merely *claim* `audio/mpeg`: HTML, an SVG with a script tag, a PNG, or a
 * video container renamed to `.mp3` never pass as audio. Only the first
 * 4KB of the object is needed for every signature below.
 */

export type MediaKind = 'image' | 'audio' | 'video' | 'unknown';

export interface SniffResult {
  kind: MediaKind;
  /**
   * Canonical format id: 'mp3' | 'wav' | 'ogg' | 'opus' | 'aac' | 'flac' |
   * 'm4a' (audio) or 'mp4' | 'mov' | 'webm' | 'mkv' | 'avi' (video) or
   * 'jpeg' | 'png' | 'webp' | 'gif' (image).
   */
  format: string | null;
}

const ascii = (b: Buffer, start: number, len: number): string =>
  b.subarray(start, start + len).toString('latin1');

/** ISO-BMFF brands that are audio-only — any other `ftyp` is video. */
const AUDIO_FTYP_BRANDS = ['M4A ', 'M4B ', 'F4A ', 'F4B ', 'M4P '];

const AUDIO_MIMES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/x-m4a',
};

/** Canonical content-type for a sniffed audio format. */
export function audioMime(format: string): string {
  return AUDIO_MIMES[format] || 'application/octet-stream';
}

export function sniffMedia(buf: Buffer): SniffResult {
  if (buf.length < 12) return { kind: 'unknown', format: null };

  // ── ID3v2 tag in front of an MP3 (tag can exceed any read window) ──
  if (ascii(buf, 0, 3) === 'ID3') return { kind: 'audio', format: 'mp3' };

  // ── images: sharp stays authoritative on the image path; knowing these
  //    here lets the audio verifier say "that's a picture, not audio" ──
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', format: 'jpeg' };
  if (buf[0] === 0x89 && ascii(buf, 1, 3) === 'PNG') return { kind: 'image', format: 'png' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') return { kind: 'image', format: 'webp' };
  if (ascii(buf, 0, 3) === 'GIF') return { kind: 'image', format: 'gif' };

  // ── RIFF containers: WAVE is audio, AVI is video ──
  if (ascii(buf, 0, 4) === 'RIFF') {
    const form = ascii(buf, 8, 4);
    if (form === 'WAVE') return { kind: 'audio', format: 'wav' };
    if (form === 'AVI ') return { kind: 'video', format: 'avi' };
    return { kind: 'unknown', format: null };
  }

  // ── Ogg (Vorbis / FLAC / Opus) — all audio ──
  if (ascii(buf, 0, 4) === 'OggS') {
    return { kind: 'audio', format: ascii(buf, 28, 8) === 'OpusHead' ? 'opus' : 'ogg' };
  }

  if (ascii(buf, 0, 4) === 'fLaC') return { kind: 'audio', format: 'flac' };

  // ── ISO-BMFF: M4A brands are audio; every other ftyp is video ──
  if (ascii(buf, 4, 4) === 'ftyp') {
    const brand = ascii(buf, 8, 4);
    if (AUDIO_FTYP_BRANDS.includes(brand)) return { kind: 'audio', format: 'm4a' };
    if (brand === 'qt  ') return { kind: 'video', format: 'mov' };
    return { kind: 'video', format: 'mp4' };
  }

  // ── EBML: Matroska / WebM — video ──
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { kind: 'video', format: buf.subarray(0, 64).toString('latin1').includes('webm') ? 'webm' : 'mkv' };
  }

  // ── MPEG frame sync: 11 set bits, then split ADTS AAC (layer bits 00,
  //    version != reserved) from MPEG audio (layer bits set) ──
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    const layer = (buf[1] & 0x06) >> 1;
    const version = (buf[1] & 0x18) >> 3;
    if (version !== 1) {
      if (layer === 0) return { kind: 'audio', format: 'aac' };
      return { kind: 'audio', format: 'mp3' };
    }
  }

  return { kind: 'unknown', format: null };
}
