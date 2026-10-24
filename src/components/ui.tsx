/**
 * Small shared UI primitives lifted out of App.tsx so the lazy tool modules
 * (video wizard, budget wizard, tool tabs) can use them without importing the
 * app shell. Behaviour is unchanged.
 */
import { useState, useRef, lazy, Suspense, type ComponentProps } from 'react';
import { Check, Copy } from 'lucide-react';

// Tooltip component for icon-only buttons
export function Tooltip({ content, children, side = 'top', delay = 300 }: { content: string; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; delay?: number }) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShow(true), delay);
  };
  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    setShow(false);
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && (
        <div
          className={`absolute z-50 px-2 py-1 text-xs text-white bg-ink-800 rounded shadow-lg whitespace-nowrap transition-opacity ${side === 'top' ? 'bottom-full mb-1' : side === 'bottom' ? 'top-full mt-1' : side === 'left' ? 'right-full mr-1' : 'left-full ml-1'}`}
          role="tooltip"
        >
          {content}
          <div className={`absolute ${side === 'top' ? 'top-full left-1/2 -translate-x-1/2 border-4 border-ink-800 b-0' : side === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 border-4 border-ink-800 t-0' : ''}`} />
        </div>
      )}
    </div>
  );
}

// Copy-to-clipboard with visual feedback ("Copied!")
export function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied!', className = 'btn btn-secondary' }: { text: string; label?: string; copiedLabel?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (permissions/insecure context) — select+copy fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* nothing more we can do */ }
    }
  };

  return (
    <button onClick={handleCopy} className={className} aria-label={copied ? copiedLabel : label}>
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      {copied ? copiedLabel : label}
    </button>
  );
}

// ── Lazy tool-chunk components shared by the studios ──────────────────────
// Each wraps its own Suspense so a chunk load never blanks the surrounding
// panel. (They used to live in App.tsx; the tool modules need them too.)
const ShareSheetBase = lazy(() => import('./ShareSheet'));
const ImageWorkbenchBase = lazy(() => import('./ImageWorkbench'));
const AITalkingProfileBase = lazy(() => import('./AITalkingProfile'));

export function ShareSheet(props: ComponentProps<typeof ShareSheetBase>) {
  return <Suspense fallback={null}><ShareSheetBase {...props} /></Suspense>;
}
export function ImageWorkbench(props: ComponentProps<typeof ImageWorkbenchBase>) {
  return <Suspense fallback={null}><ImageWorkbenchBase {...props} /></Suspense>;
}
export function AITalkingProfile(props: ComponentProps<typeof AITalkingProfileBase>) {
  return <Suspense fallback={null}><AITalkingProfileBase {...props} /></Suspense>;
}
