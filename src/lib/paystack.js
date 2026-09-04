import { base44 } from "@/api/base44Client";

let paystackKeyCache = null;

export async function getPaystackPublicKey() {
  if (paystackKeyCache) return paystackKeyCache;
  try {
    const rows = await base44.entities.AppSetting.list();
    const key = rows?.[0]?.paystack_public_key;
    if (key) {
      paystackKeyCache = key;
      return key;
    }
  } catch {}
  return null;
}

let scriptLoaded = null;

export function loadPaystackScript() {
  if (scriptLoaded) return scriptLoaded;
  scriptLoaded = new Promise((resolve, reject) => {
    if (window.PaystackPop) return resolve(window.PaystackPop);
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => resolve(window.PaystackPop);
    s.onerror = () => reject(new Error("Failed to load Paystack script"));
    document.head.appendChild(s);
  });
  return scriptLoaded;
}

// Initialize a Paystack inline checkout.
// opts: { email, amountCents, currency, reference, onSuccess, onClose }
export async function payWithPaystack(opts) {
  const publicKey = await getPaystackPublicKey();
  if (!publicKey) {
    throw new Error("Paystack is not configured. Ask an admin to add the Paystack public key in Admin settings.");
  }
  const PaystackPop = await loadPaystackScript();
  const handler = PaystackPop.setup({
    key: publicKey,
    email: opts.email,
    amount: opts.amountCents,
    currency: opts.currency || "ZAR",
    ref: opts.reference,
    callback: (response) => opts.onSuccess?.(response),
    onClose: () => opts.onClose?.(),
  });
  handler.openIframe();
}