import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Simple self-contained toast - no Radix dependency
const Toast = React.forwardRef(({ className, variant, onClose, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "pointer-events-auto relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-xl border p-4 pr-10 shadow-lg bg-white text-foreground",
      variant === "destructive" && "border-red-200 bg-red-50 text-red-900",
      className
    )}
    {...props}
  >
    {children}
    <button
      onClick={onClose}
      className="absolute right-2 top-2 rounded-md p-1 text-foreground/50 hover:text-foreground transition-opacity"
    >
      <X className="h-4 w-4" />
    </button>
  </div>
));
Toast.displayName = "Toast";

const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm font-semibold", className)} {...props} />
));
ToastTitle.displayName = "ToastTitle";

const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm opacity-80", className)} {...props} />
));
ToastDescription.displayName = "ToastDescription";

const ToastClose = React.forwardRef(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn("absolute right-2 top-2 rounded-md p-1 text-foreground/50 hover:text-foreground", className)}
    {...props}
  >
    <X className="h-4 w-4" />
  </button>
));
ToastClose.displayName = "ToastClose";

const ToastAction = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("shrink-0", className)} {...props} />
));
ToastAction.displayName = "ToastAction";

// These are no-ops kept for API compatibility with toaster.jsx
const ToastProvider = ({ children }) => <>{children}</>;
const ToastViewport = () => null;

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};