import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean | undefined>;

interface PendingConfirm {
  message: string;
  options: ConfirmOptions;
  resolve: (value: boolean | undefined) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((message, options = {}) => {
    return new Promise<boolean | undefined>((resolve) => {
      const next = { message, options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  // true/false = an explicit button choice; undefined = the dialog was
  // dismissed (Escape/backdrop) without choosing.
  const close = (value: boolean | undefined) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => close(undefined)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close(undefined);
            }}
          >
            <h2 id="confirm-dialog-title" className="text-lg font-semibold text-white mb-2">
              {pending.options.title || 'Please confirm'}
            </h2>
            <p id="confirm-dialog-message" className="text-sm text-white/70 whitespace-pre-line mb-6">
              {pending.message}
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
                {pending.options.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                autoFocus
                className={pending.options.destructive ? 'btn bg-red-600 hover:bg-red-500 text-white' : 'btn btn-primary'}
                onClick={() => close(true)}
              >
                {pending.options.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
