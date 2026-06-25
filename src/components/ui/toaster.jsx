import React, { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Toast, ToastTitle, ToastDescription } from "@/components/ui/toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const timers = useRef({});

  useEffect(() => {
    toasts.forEach((t) => {
      if (t.open && !timers.current[t.id]) {
        timers.current[t.id] = setTimeout(() => {
          dismiss(t.id);
          delete timers.current[t.id];
        }, 4000);
      }
    });
    // clean up timers for removed toasts
    Object.keys(timers.current).forEach((id) => {
      if (!toasts.find((t) => t.id === id)) {
        clearTimeout(timers.current[id]);
        delete timers.current[id];
      }
    });
  }, [toasts, dismiss]);

  const visible = toasts.filter((t) => t.open !== false);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]">
      {visible.map(({ id, title, description, action, variant }) => (
        <Toast key={id} variant={variant} onClose={() => dismiss(id)}>
          <div className="grid gap-0.5 flex-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
        </Toast>
      ))}
    </div>
  );
}