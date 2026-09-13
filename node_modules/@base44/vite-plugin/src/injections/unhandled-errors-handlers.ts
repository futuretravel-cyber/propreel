/// <reference types="vite/client" />

window.removeEventListener("unhandledrejection", handleUnhandledRejection);
window.removeEventListener("error", handleWindowError);

window.addEventListener("unhandledrejection", handleUnhandledRejection);
window.addEventListener("error", handleWindowError);

let shouldPropagateErrors = true;
let suppressionTimer: ReturnType<typeof setTimeout> | null = null;
let hadSuppressedErrors = false;

if (import.meta.hot) {
  import.meta.hot.on("vite:beforeUpdate", () => {
    shouldPropagateErrors = false;
    hadSuppressedErrors = false;

    if (suppressionTimer) {
      clearTimeout(suppressionTimer);
    }

    suppressionTimer = setTimeout(() => {
      shouldPropagateErrors = true;
      suppressionTimer = null;
      hadSuppressedErrors = false;
      // No vite:afterUpdate after timeout — treat the stuck update as an error
      window.parent?.postMessage({ type: "sandbox:hmrErrorsSuppressed" }, "*");
    }, import.meta.env.VITE_HMR_ERROR_SUPPRESSION_DELAY ?? 10000);
  });
  import.meta.hot.on("vite:afterUpdate", () => {
    shouldPropagateErrors = true;
    if (suppressionTimer) {
      clearTimeout(suppressionTimer);
      suppressionTimer = null;
    }
    if (hadSuppressedErrors) {
      window.parent?.postMessage({ type: "sandbox:hmrErrorsSuppressed" }, "*");
      hadSuppressedErrors = false;
    }
  });
  import.meta.hot.on("vite:beforeFullReload", () => {
    shouldPropagateErrors = false;
    hadSuppressedErrors = false;
    if (suppressionTimer) {
      clearTimeout(suppressionTimer);
      suppressionTimer = null;
    }
  });
}

function onAppError({
  title,
  details,
  componentName,
  originalError,
}: {
  title: string;
  details: string;
  componentName: string | undefined;
  originalError: any;
}) {
  if (originalError?.response?.status === 402) {
    return;
  }
  if (!shouldPropagateErrors) {
    hadSuppressedErrors = true;
    return;
  }
  window.parent?.postMessage(
    {
      type: "app_error",
      error: {
        title: title.toString(),
        details: details?.toString(),
        componentName: componentName?.toString(),
        stack: originalError?.stack?.toString(),
      },
    },
    "*"
  );
}

// extract function name from "at X (eval" where X is the function name
function extractFunctionName(stack: unknown): string | undefined {
  if (typeof stack !== "string") return undefined;
  return stack.match(/at\s+(\w+)\s+\(eval/)?.[1];
}

// A rejection reason or error can be any value — undefined, a string, a
// null-prototype object. Throwing here masks the real error entirely.
function describeErrorValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function handleUnhandledRejection(event: any) {
  const reason = event?.reason;
  const functionName = extractFunctionName(reason?.stack);
  const text = describeErrorValue(reason);
  const msg = functionName ? `Error in ${functionName}: ${text}` : text;
  onAppError({
    title: msg,
    details: text,
    componentName: functionName,
    originalError: reason,
  });
}

export function handleWindowError(event: any) {
  const error = event?.error;
  let functionName = extractFunctionName(error?.stack);
  if (functionName === "eval") {
    functionName = undefined;
  }

  // window.onerror fires with a null error for cross-origin script failures
  const text =
    error == null && typeof event?.message === "string"
      ? event.message
      : describeErrorValue(error);
  const msg = functionName ? `in ${functionName}: ${text}` : text;
  onAppError({
    title: msg,
    details: text,
    componentName: functionName,
    originalError: error,
  });
}
