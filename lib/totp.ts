/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30-second step) for the optional
 * two-step verification on sign-in. Implemented with node:crypto so the
 * Hobby project gains no new dependencies.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** New base32 secret (160 bits — Google Authenticator compatible). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Current 6-digit code for a secret. */
export function totpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.max(0, counter)));
  const digest = createHmac('sha1', key).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return (binary % 1_000_000).toString().padStart(6, '0');
}

/** Verify a typed code, allowing ±1 time step for clock drift. */
export function verifyTotp(secret: string, token: unknown, window = 1): boolean {
  const code = String(token ?? '').replace(/\D/g, '');
  if (code.length !== 6 || !secret) return false;
  const counter = Math.floor(Date.now() / 30_000);
  const typed = Buffer.from(code, 'utf8');
  for (let w = -window; w <= window; w++) {
    const expected = Buffer.from(totpCode(secret, counter + w), 'utf8');
    if (expected.length === typed.length && timingSafeEqual(expected, typed)) return true;
  }
  return false;
}

/** otpauth:// URI that authenticator apps scan as a QR code. */
export function otpauthUrl(email: string, secret: string, issuer = 'PropReel'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Opaque short-lived token (pending 2FA challenges). */
export function randomToken(): string {
  return randomBytes(24).toString('hex');
}
