import crypto from 'crypto';

/**
 * Verify the Paystack webhook signature (HMAC-SHA512, hex, x-paystack-signature).
 *
 * Paystack signs the RAW request body. On Vercel the handler normally only
 * has the parsed body, so a signature is accepted when it matches ANY of the
 * candidate serialisations of that body: the raw bytes when the runtime
 * exposes them, the compact JSON.stringify form, or Python's json.dumps
 * default (', ' / ': ') — Paystack's likely wire format. Every candidate is
 * one exact byte string that still has to be HMAC'd with the secret key, so
 * this does not weaken verification: without the key none of them can be
 * forged. Comparisons are constant-time.
 */
function hmacHex(input: string | Buffer, secret: string): string {
  return crypto.createHmac('sha512', secret).update(input).digest('hex');
}

function constantTimeHexEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Python json.dumps default separators: `", "` between items, `": "` after keys. */
export function jsonWithPythonSpaces(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jsonWithPythonSpaces).join(', ')}]`;
  const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${jsonWithPythonSpaces(v)}`);
  return `{${entries.join(', ')}}`;
}

/** Escape non-ASCII exactly like Python's json.dumps(ensure_ascii=True): `Jos\u00e9`. */
export function escapeNonAscii(s: string): string {
  return s.replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export async function verifyPaystackSignature(
  body: any,
  signature: string,
  rawBody?: string | Buffer | null
): Promise<boolean> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey || !signature) return false;

  const candidates: Array<string | Buffer> = [];
  if (rawBody && (typeof rawBody === 'string' ? rawBody.length > 0 : rawBody.length > 0)) {
    candidates.push(rawBody);
  }
  const compact = JSON.stringify(body);
  const spaced = jsonWithPythonSpaces(body);
  candidates.push(
    compact,
    spaced,
    escapeNonAscii(compact), // Python ensure_ascii=True, compact
    escapeNonAscii(spaced)    // Python ensure_ascii=True, default separators (most likely wire form)
  );

  const want = signature.trim().toLowerCase();
  return candidates.some(c => constantTimeHexEqual(hmacHex(c, secretKey), want));
}

/**
 * Initialize Paystack payment
 */
export async function initializePayment(email: string, amount: number, metadata?: any) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  
  if (!secretKey) {
    throw new Error('Paystack secret key not configured');
  }

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      amount: amount * 100, // Convert to kobo
      currency: 'ZAR',
      metadata: {
        ...metadata,
        custom_fields: [
          {
            display_name: 'Credits',
            variable_name: 'credits',
            value: amount
          }
        ]
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to initialize payment');
  }

  return response.json();
}

/**
 * Verify Paystack payment
 */
export async function verifyPayment(reference: string) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  
  if (!secretKey) {
    throw new Error('Paystack secret key not configured');
  }

  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: {
      'Authorization': `Bearer ${secretKey}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to verify payment');
  }

  return response.json();
}

/**
 * Create Paystack subscription
 * Ensures the customer exists first — POST /subscription needs a customer
 * record (code), which first-time subscribers won't have.
 *
 * startDate: ISO 8601 date for the customer's FIRST debit on this recurrence
 * (Paystack's `start_date`). Pass the *end of the period the customer already
 * paid for at checkout* — otherwise Paystack generates and charges the first
 * invoice immediately, double-billing month 1.
 */
export async function createSubscription(email: string, planCode: string, startDate?: string) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error('Paystack secret key not configured');
  }

  const headers = {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };

  // Find or create the customer, then use its customer_code
  let customerCode: string | undefined;
  const listRes = await fetch(`https://api.paystack.co/customer?email=${encodeURIComponent(email)}`, {
    headers,
  });
  if (listRes.ok) {
    const list = await listRes.json();
    customerCode = list?.data?.[0]?.customer_code;
  }
  if (!customerCode) {
    const createRes = await fetch('https://api.paystack.co/customer', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    });
    if (createRes.ok) {
      const created = await createRes.json();
      customerCode = created?.data?.customer_code;
    } else {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create Paystack customer');
    }
  }

  const response = await fetch('https://api.paystack.co/subscription', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customer: customerCode,
      plan: planCode,
      ...(startDate ? { start_date: startDate } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create subscription');
  }

  return response.json();
}

/**
 * Cancel Paystack subscription
 */
export async function cancelSubscription(subscriptionCode: string) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  
  if (!secretKey) {
    throw new Error('Paystack secret key not configured');
  }

  const response = await fetch(`https://api.paystack.co/subscription/disable`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code: subscriptionCode
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to cancel subscription');
  }

  return response.json();
}

/**
 * Get Paystack transaction
 */
export async function getTransaction(reference: string) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  
  if (!secretKey) {
    throw new Error('Paystack secret key not configured');
  }

  const response = await fetch(`https://api.paystack.co/transaction/${reference}`, {
    headers: {
      'Authorization': `Bearer ${secretKey}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get transaction');
  }

  return response.json();
}

/**
 * Charge a returning customer using a saved authorization (auto-top-up).
 * Returns { status: 'open_url' } with a hosted URL when no authorization is
 * on file — the caller should redirect the user there once.
 */
export async function chargeAuthorization(
  email: string,
  amount: number,
  authorizationCode: string,
  metadata?: any
): Promise<{ status: string; reference: string; paystackId?: number; authorization_url?: string }> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error('Paystack secret key not configured');

  const reference = `atopup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const response = await fetch('https://api.paystack.co/transaction/charge_authorization', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amount * 100, // kobo
      authorization_code: authorizationCode,
      reference,
      metadata,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Failed to charge authorization');
  }
  return {
    status: data.data?.status || 'unknown',
    reference,
    paystackId: typeof data.data?.id === 'number' ? data.data.id : undefined,
    authorization_url: data.data?.url || undefined,
  };
}
