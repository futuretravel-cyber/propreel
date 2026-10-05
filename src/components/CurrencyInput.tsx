import { useRef } from 'react';

/**
 * Currency input with live comma thousands separators.
 *
 * The parent stores the raw value (digits only, e.g. `3500000`) while the
 * field renders it grouped (`3,500,000`) as the user types, so existing
 * `Number(value)` parses in the wizard, description and social tabs keep
 * working untouched. The caret is restored after re-formatting by walking to
 * the same digit the user's caret sat after.
 */

/** Keep digits only — optionally one decimal point for amounts like 1250.50. */
function sanitize(raw: string, allowDecimals: boolean): string {
  if (!allowDecimals) return raw.replace(/\D/g, '');
  const cleaned = raw.replace(/[^\d.]/g, '');
  const first = cleaned.indexOf('.');
  if (first === -1) return cleaned;
  return cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/\./g, '');
}

/** `1250000` → `1,250,000` (decimals left as typed). */
export function groupDigits(digits: string): string {
  const dot = digits.indexOf('.');
  const int = dot === -1 ? digits : digits.slice(0, dot);
  const rest = dot === -1 ? '' : digits.slice(dot);
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + rest;
}

interface CurrencyInputProps {
  /** Raw value held by the parent: digits (and one `.` when allowDecimals). */
  value: string;
  onChange: (raw: string) => void;
  allowDecimals?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export default function CurrencyInput({
  value,
  onChange,
  allowDecimals = false,
  className = '',
  placeholder,
  id,
  disabled,
  'aria-label': ariaLabel,
}: CurrencyInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const caret = el.selectionStart ?? el.value.length;
    const atEnd = caret === el.value.length;
    const digitsBefore = el.value.slice(0, caret).replace(/\D/g, '').length;
    const next = sanitize(el.value, allowDecimals);
    onChange(next);

    // Restore the caret after the value re-renders with separators inserted.
    requestAnimationFrame(() => {
      const input = ref.current;
      if (!input) return;
      const formatted = groupDigits(next);
      let pos = formatted.length;
      if (!atEnd) {
        if (digitsBefore === 0) pos = 0;
        else {
          let seen = 0;
          pos = formatted.length;
          for (let i = 0; i < formatted.length; i++) {
            if (/\d/.test(formatted[i])) seen++;
            if (seen === digitsBefore) { pos = i + 1; break; }
          }
        }
      }
      try { input.setSelectionRange(pos, pos); } catch { /* ignore */ }
    });
  };

  return (
    <input
      ref={ref}
      id={id}
      className={className}
      type="text"
      inputMode={allowDecimals ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={groupDigits(sanitize(value, allowDecimals))}
      onChange={handle}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
