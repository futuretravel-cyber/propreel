import crypto from 'crypto';

/**
 * Verify Paystack webhook signature
 */
export async function verifyPaystackSignature(body: any, signature: string): Promise<boolean> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  
  if (!secretKey || !signature) {
    return false;
  }

  const hash = crypto
    .createHmac('sha512', secretKey)
    .update(JSON.stringify(body))
    .digest('hex');

  return hash === signature;
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
 */
export async function createSubscription(email: string, planCode: string) {
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
