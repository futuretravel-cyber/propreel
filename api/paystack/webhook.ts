import { createHash } from 'crypto';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyPaystackSignature, jsonWithPythonSpaces, escapeNonAscii } from '../../lib/paystack';
import { addCredits, createSubscription, getUser, allocateMonthlyCredits, updateUser } from '../../lib/userService';
import { generateInvoicePdf } from '../../lib/invoice';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Accept-path self-test (ops only) ───────────────────────────────────
  // POST /api/paystack/webhook?action=selftest
  // Authorization: Bearer ${CRON_SECRET}
  //
  // Historically the only webhook proof was the reject path (forged
  // signature → 401). This signs synthetic payloads with the SAME
  // PAYSTACK_SECRET_KEY the verifier uses and delivers them over the public
  // endpoint, so a pass exercises the real wire: signature construction,
  // Vercel's body handling (raw bytes preserved?), routing, idempotency.
  //   P1/P2 — unknown event types: acknowledged 200 before any handler or
  //           marker logic → zero side effects.
  //   P3    — bit-flipped signature → must be 401.
  //   P4    — charge.success for a non-existent customer: the full HANDLED
  //           path (top-level idempotency claim + handler), credits nobody;
  //           second delivery must come back flagged duplicate, and the
  //           marker row this probe claims is deleted before we respond.
  if (req.query.action === 'selftest') {
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return res.status(500).json({ error: 'CRON_SECRET not configured' });
    if (authHeader !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });

    const { createHmac } = await import('crypto');
    const key = process.env.PAYSTACK_SECRET_KEY;
    const endpoint = `${process.env.APP_URL || 'https://www.propreel.co.za'}/api/paystack/webhook`;
    const sign = (bytes: string) => createHmac('sha512', key || '').update(bytes).digest('hex');
    const post = async (body: string, sig: string) => {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
        body,
      });
      return { status: r.status, body: (await r.text()).slice(0, 300) };
    };

    const raw: any = (req as any).rawBody;
    const introspect = {
      keyConfigured: !!key,
      keyPrefix: key ? String(key).slice(0, 8) : null,
      keyLength: key ? String(key).length : 0,
      rawBodyType: raw === undefined ? 'undefined' : raw === null ? 'null' : Buffer.isBuffer(raw) ? 'Buffer' : typeof raw,
      rawBodyBytes: typeof raw === 'string' ? raw.length : Buffer.isBuffer(raw) ? raw.length : 0,
      compactBodyBytes: JSON.stringify(req.body).length,
    };
    if (!key) return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY not configured', introspect });

    const synthetic = { event: 'test.webhook_accept_probe', data: { probe: 'selftest', ts: Date.now() } };
    const p1body = JSON.stringify(synthetic);        // compact bytes
    const p2body = jsonWithPythonSpaces(synthetic);  // Python default separators
    // Real payloads carry customer names/addresses; Python escapes non-ASCII
    // (ensure_ascii=True) while JSON.stringify does not — this byte form must
    // verify too or any event containing an accented name would 401.
    const p5body = escapeNonAscii(jsonWithPythonSpaces({ ...synthetic, data: { ...synthetic.data, name: 'Jos\u00e9 Garc\u00eda \ud83c\uddff\ud83c\udde6' } }));
    const p1sig = sign(p1body);

    const report: any = { endpoint, introspect };
    const [p1, p2, p3, p5] = await Promise.all([
      post(p1body, p1sig),
      post(p2body, sign(p2body)),
      post(p1body, p1sig.replace(/^./, (c) => (c === '0' ? '1' : '0'))),
      post(p5body, sign(p5body)),
    ]);
    report.accept_compact = p1;
    report.accept_python_spaced = p2;
    report.reject_forged = p3;
    report.accept_python_spaced_nonascii = p5;

    const p4 = {
      event: 'charge.success',
      data: { customer_email: 'whs-selftest@propreel.invalid', amount: 100, reference: `whs_${Date.now()}`, metadata: {} },
    };
    const p4body = JSON.stringify(p4);
    const p4sig = sign(p4body);
    report.handled_first = await post(p4body, p4sig);
    report.handled_duplicate = await post(p4body, p4sig);

    try {
      const { deleteItem, TABLES: T } = await import('../../lib/db');
      const markerId = `psevt_charge.success_${createHash('sha256').update(JSON.stringify(p4)).digest('hex').slice(0, 32)}`;
      await deleteItem(T.SETTINGS, { id: markerId });
      report.markerCleaned = markerId;
    } catch (cleanupErr) {
      report.markerCleaned = false; // harmless if it lingers: dedupes only this exact payload
    }

    report.verdict = {
      accept_compact: report.accept_compact.status === 200,
      accept_python_spaced: report.accept_python_spaced.status === 200,
      accept_python_spaced_nonascii: report.accept_python_spaced_nonascii.status === 200,
      reject_forged: report.reject_forged.status === 401,
      handled_then_deduped:
        report.handled_first.status === 200 &&
        report.handled_duplicate.status === 200 &&
        report.handled_duplicate.body.includes('"duplicate"'),
    };
    report.pass = Object.values(report.verdict).every(Boolean);
    return res.status(report.pass ? 200 : 500).json(report);
  }

  // Set when the idempotency claim below succeeds; released on a processing
  // error (see catch) so Paystack's retry can re-run the handler.
  let claimedEventKeyId: string | null = null;

  try {
    const payload = req.body;
    const signature = req.headers['x-paystack-signature'] as string;

    // Verify webhook signature. MUST be awaited: verifyPaystackSignature is
    // async, and an un-awaited Promise is always truthy — without await this
    // check never rejected anything, letting anyone forge a charge.success.
    // The raw body bytes (when the runtime exposes them) are passed through
    // so verification can match Paystack's exact signed bytes instead of a
    // re-serialisation of the parsed JSON.
    if (!signature || !(await verifyPaystackSignature(payload, signature, (req as any).rawBody))) {
      console.warn(`Paystack webhook: signature verification failed (event=${payload?.event ?? 'unknown'})`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = payload.event;

    // Acknowledge event types we don't act on without writing marker rows.
    const HANDLED_EVENTS = [
      'charge.success',
      'subscription.create',
      'subscription.renewal',
      'charge.failed',
      'invoice.payment_failed',
      'subscription.disable',
    ];
    if (!event || !HANDLED_EVENTS.includes(event)) {
      return res.status(200).json({ received: true });
    }

    // ── Top-level event idempotency (the Stripe event.id equivalent) ──────
    // There is no Stripe in this stack — Paystack is the payment provider —
    // but the risk auditors flag for Stripe applies verbatim: Paystack
    // redelivers webhook events, and a duplicated subscription.renewal would
    // allocate monthly credits twice, subscription.create would reset the
    // account's credits, and charge.failed would double-count dunning.
    //
    // Paystack payloads carry no stable top-level event.id, so the claim key
    // is the event name + a hash of the payload: a redelivery is
    // byte-identical (same key → deduped, 200 immediately), while a
    // legitimate future event of the same type always differs (new
    // transaction ids, next_payment_date, updatedAt, … → new key → processed).
    //
    // Claim BEFORE processing via an atomic put-if-absent on the settings
    // table. A full DynamoDB transaction cannot span the whole handler, so
    // claim-then-process (with release-on-error below) is the emulation.
    const eventKeyId = `psevt_${event}_${createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)}`;
    const { putItemIfNotExists, TABLES: TB } = await import('../../lib/db');
    const claimed = await putItemIfNotExists(TB.SETTINGS, {
      id: eventKeyId,
      type: 'webhook_event',
      event,
      createdAt: new Date().toISOString(),
    });
    if (!claimed) {
      console.log(`Webhook: duplicate ${event} delivery (${eventKeyId}) — already processed, acking 200`);
      return res.status(200).json({ received: true, duplicate: true, event });
    }
    claimedEventKeyId = eventKeyId;

    // Handle successful payment (credit purchase)
    if (event === 'charge.success') {
      const data = payload.data;
      const email = data.customer_email;
      const amount = Math.round(data.amount / 100); // Convert from kobo to Rand
      const reference = data.reference;

      console.log(`Processing charge.success for ${email}: ${amount} credits`);

      // Extract user_id from metadata if available, otherwise find by email
      let userId = payload.data.metadata?.user_id;
      if (!userId) {
        const user = await getUserByEmail(email);
        userId = user?.id;
      }

      if (!userId) {
        console.error(`No user found for email ${email}`);
        return res.status(200).json({ received: true }); // Acknowledge to prevent retries
      }

      // ── Prorated plan upgrades (saved-card + hosted-checkout) ──────────
      // Upgrade payments must NOT fall through to the generic credit-purchase
      // path below — that would top up credits with the plan-difference money.
      const upgradeKind = data.metadata?.type;
      if (upgradeKind === 'plan_upgrade' || upgradeKind === 'plan_upgrade_checkout') {
        const targetPlan = data.metadata.to_plan as string;
        const targetCycle = (data.metadata.cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY') as 'MONTHLY' | 'ANNUAL';

        // Atomic marker: duplicate webhook deliveries and the /verify endpoint
        // can never apply the same upgrade payment twice.
        const { markUpgradePaid, applyPendingUpgrade } = await import('../../lib/userService');
        const consumed = await markUpgradePaid(reference, userId);
        if (!consumed) {
          console.log(`Webhook: upgrade ${reference} already applied — skipping`);
          return res.status(200).json({ success: true, already_processed: true, reference });
        }

        const payer = await getUser(userId);
        if (payer?.subscription) {
          try {
            const result = await applyPendingUpgrade(payer, targetPlan, targetCycle);
            console.log(`Webhook: plan upgrade applied for ${payer.email} → ${targetPlan} (R${result.chargedZar} prorated, +${result.creditsAllocated} credits)`);
          } catch (upErr) {
            console.error('Upgrade application failed (payment captured):', upErr);
          }
        }

        // Capture the card authorization + clear dunning (recovered payment)
        const authCode = data.authorization?.authorization_code;
        if (authCode) {
          try {
            await updateUser(userId, {
              paystackAuthorizationCode: authCode,
              paymentFailure: undefined,
              pendingPlanUpgrade: undefined,
            } as any);
          } catch (authErr) {
            console.error('Auth code capture failed (non-fatal):', authErr);
          }
        }

        return res.status(200).json({ success: true, plan_upgrade_applied: true, reference });
      }

      // ── Plan activation from hosted checkout (subscription_start) ───────
      // Pay-before-activate: verify + the reference-gated action=create
      // share the pay_<reference> marker inside the helper, so whichever
      // runs first activates and the rest no-op.
      if (data.metadata?.type === 'subscription_start') {
        const { activateSubscriptionFromPayment } = await import('../../lib/planActivation');
        const outcome = await activateSubscriptionFromPayment({
          userId,
          reference,
          planId: String(data.metadata.plan_id || ''),
          cycle: (data.metadata.cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY') as 'MONTHLY' | 'ANNUAL',
          paidZar: amount,
        });
        if (outcome.status === 'invalid_plan') {
          console.error(`Webhook: subscription_start ${reference} has unknown plan ${data.metadata.plan_id}`);
          return res.status(200).json({ received: true });
        }
        if (outcome.status === 'amount_mismatch') {
          console.error(`Webhook: subscription_start ${reference} underpaid (R${outcome.paidZar} < R${outcome.expectedZar}) — manual review`);
          return res.status(200).json({ received: true });
        }
        const authCode = data.authorization?.authorization_code;
        if (authCode) {
          try {
            await updateUser(userId, { paystackAuthorizationCode: authCode, paymentFailure: undefined } as any);
          } catch (authErr) {
            console.error('Auth code capture failed (non-fatal):', authErr);
          }
        }
        return res.status(200).json({
          success: true,
          plan_activated: outcome.status === 'activated',
          already_processed: outcome.status === 'already',
          reference,
        });
      }

      // ── Recurring subscription invoice: plan allowance, never cash ──────
      // Paystack charges the saved card on the plan's billing day and this
      // event re-fires every cycle. allocateMonthlyCredits claims
      // renew_<user>_<YYYY-MM> atomically, so this, the paired
      // subscription.renewal event, and the monthly cron can't triple-credit.
      if (data.plan && !data.metadata?.type) {
        const recurringUser = await getUserByEmail(data.customer_email || data.customer?.email || '');
        if (recurringUser) {
          try {
            await allocateMonthlyCredits(recurringUser.id);
          } catch (allocErr) {
            console.error('Recurring invoice allocation failed (claim released for retry):', allocErr);
          }
        } else {
          console.error(`Webhook: recurring charge ${reference} has no user for ${data.customer_email}`);
        }
        return res.status(200).json({ success: true, recurring_invoice: true, reference });
      }

      // Idempotency: the client may also call /api/paystack/verify for this
      // reference — credit exactly once per Paystack reference.
      const { getItem, putItem, TABLES: T } = await import('../../lib/db');
      const markerId = `pay_${reference}`;
      const already = await getItem<{ id: string; userId: string }>(T.SETTINGS, { id: markerId });
      if (already) {
        console.log(`Webhook: reference ${reference} already credited (via ${already.userId === userId ? 'webhook' : 'verify'}) — skipping`);
        return res.status(200).json({ success: true, already_processed: true, reference });
      }
      await putItem(T.SETTINGS, { id: markerId, userId, type: 'payment_processed', createdAt: new Date().toISOString() });

      // Agency-pool purchases (type 'agency_pool_purchase') land in the
      // shared agency pool instead of the personal balance.
      const isPoolPurchase = data.metadata?.type === 'agency_pool_purchase';

      // GRANT THE CREDIT COUNT, not the paid Rands: initialize stamps
      // metadata.credits (since 2026-10-21 packs charge credits × 1.50). The
      // `amount` fallback keeps pre-ratelimit references (R1/credit) exact.
      const creditsGranted = Number(data.metadata?.credits) || amount;

      // Add credits — eventId (Paystack's unique data.id) makes the ledger
      // row itself idempotent, so duplicate/re-delivered webhooks (and
      // renewals sharing a reference pattern) can never double-credit.
      const eventId = data.id != null ? `ps_${data.id}` : undefined;
      let addResult: Awaited<ReturnType<typeof addCredits>>;
      if (isPoolPurchase) {
        const { addAgencyPoolCredits } = await import('../../lib/userService');
        const newPool = await addAgencyPoolCredits(
          userId,
          creditsGranted,
          `Agency pool top-up: R${amount} (${creditsGranted} credits)`,
          { paystackReference: reference, paystackEventId: data.id ?? null, channel: data.channel }
        );
        addResult = { success: true, newBalance: newPool };
      } else {
        addResult = await addCredits(
          userId,
          creditsGranted,
          'purchase',
          `Credit purchase: R${amount} (${creditsGranted} credits)`,
          { paystackReference: reference, paystackEventId: data.id ?? null, channel: data.channel },
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year expiry
          eventId
        );
      }
      if (addResult.duplicated) {
        console.log(`Webhook: eventId ${eventId} already credited — balance untouched`);
        return res.status(200).json({ success: true, already_processed: true, reference });
      }

      // Give 5, get 5: first purchase by a referred user pays their referrer +5.
      // Idempotent — referralPaid + an addCredits event lock make it once-only.
      const { grantReferralPayout } = await import('../../lib/referral');
      await grantReferralPayout(userId);

      // Capture the card authorization for auto-topup / dunning retries
      const authCode = data.authorization?.authorization_code;
      if (authCode) {
        try {
          const { updateUser } = await import('../../lib/userService');
          await updateUser(userId, {
            paystackAuthorizationCode: authCode,
            paymentFailure: undefined,
          } as any);
          console.log(`Webhook: saved card authorization for user ${userId}`);
        } catch (authErr) {
          console.error('Auth code capture failed (non-fatal):', authErr);
        }
      }

      // SA tax invoice PDF → S3 (never blocks crediting)
      try {
        const payer = await getUser(userId);
        await generateInvoicePdf({
          reference,
          userName: payer?.fullName || '',
          userEmail: payer?.email || '',
          amountZar: amount,
          credits: creditsGranted,
          description: `PropReel credit top-up (${creditsGranted} credits)`,
          paidAt: new Date().toISOString(),
          userId,
        });
      } catch (invErr) {
        console.error('Invoice generation failed (non-fatal):', invErr);
      }

      return res.status(200).json({
        success: true,
        credits_added: creditsGranted,
        reference,
      });
    }

    // Handle subscription creation
    if (event === 'subscription.create') {
      const data = payload.data;
      const email = data.customer.email;
      const planCode = data.plan.code;

      console.log(`Processing subscription.create for ${email}: ${planCode}`);

      // Map Paystack plan code to our plan ID. Real codes come from env
      // (PAYSTACK_PLAN_<PLAN>_<CYCLE>); legacy generated names kept as fallback.
      const planMapping: Record<string, { id: string; cycle: 'MONTHLY' | 'ANNUAL' }> = {};
      (['STARTER', 'PROFESSIONAL', 'PREMIUM', 'AGENCY'] as const).forEach(p => {
        (['MONTHLY', 'ANNUAL'] as const).forEach(c => {
          const code = process.env[`PAYSTACK_PLAN_${p}_${c}`];
          if (code) planMapping[code] = { id: p, cycle: c };
        });
      });
      planMapping['PLN_starter_monthly'] = { id: 'STARTER', cycle: 'MONTHLY' };
      planMapping['PLN_starter_annual'] = { id: 'STARTER', cycle: 'ANNUAL' };
      planMapping['PLN_professional_monthly'] = { id: 'PROFESSIONAL', cycle: 'MONTHLY' };
      planMapping['PLN_professional_annual'] = { id: 'PROFESSIONAL', cycle: 'ANNUAL' };
      planMapping['PLN_premium_monthly'] = { id: 'PREMIUM', cycle: 'MONTHLY' };
      planMapping['PLN_premium_annual'] = { id: 'PREMIUM', cycle: 'ANNUAL' };
      planMapping['PLN_agency_monthly'] = { id: 'AGENCY', cycle: 'MONTHLY' };
      planMapping['PLN_agency_annual'] = { id: 'AGENCY', cycle: 'ANNUAL' };

      const planInfo = planMapping[planCode];
      if (!planInfo) {
        console.error(`Unknown plan code: ${planCode}`);
        return res.status(200).json({ received: true });
      }

      // Find user by email in our users table
      let userId: string | undefined;

      const user = await getUserByEmail(email);
      userId = user?.id;

      if (!userId) {
        console.error(`No user found for email ${email}`);
        return res.status(200).json({ received: true });
      }

      // Create subscription in DynamoDB
      await createSubscription(
        userId,
        planInfo.id,
        planInfo.cycle,
        data.subscription_code,
        data.customer_code
      );

      return res.status(200).json({
        success: true,
        event: 'subscription.create',
        plan: planInfo.id,
      });
    }

    // Handle subscription renewal
    if (event === 'subscription.renewal') {
      const data = payload.data;
      const email = data.customer.email;

      // Find user by email in our users table
      let userId: string | undefined;

      const user = await getUserByEmail(email);
      userId = user?.id;

      if (!userId) {
        console.error(`No user found for email ${email}`);
        return res.status(200).json({ received: true });
      }

      // Allocate monthly credits (this also extends the period)
      const result = await allocateMonthlyCredits(userId);

      // SA tax invoice for the renewal charge — the amount the customer was
      // actually billed lives on the transaction Paystack references in the
      // payload; fall back to the plan's nextChargeAmount.
      try {
        let renewalZar: number | undefined;
        const renewalRef: string | undefined = data.transaction?.reference || data.reference;
        if (renewalRef) {
          const { getTransaction } = await import('../../lib/paystack');
          const tx = await getTransaction(renewalRef);
          if (tx?.data?.amount) renewalZar = Math.round(tx.data.amount / 100);
        }
        if (!renewalZar) renewalZar = user?.subscription?.nextChargeAmount;
        if (renewalZar) {
          const payer = await getUser(userId);
          await generateInvoicePdf({
            reference: renewalRef || `renewal_${data.subscription_code || userId}`,
            userName: payer?.fullName || '',
            userEmail: payer?.email || email,
            amountZar: renewalZar,
            description: `PropReel subscription renewal — ${user?.subscription?.planId || ''} (${user?.subscription?.cycle || 'MONTHLY'})`.trim(),
            paidAt: new Date().toISOString(),
            userId,
          });
        }
      } catch (invErr) {
        console.error('Renewal invoice generation failed (non-fatal):', invErr);
      }

      return res.status(200).json({
        success: true,
        event: 'subscription.renewal',
        credits_allocated: result?.allocated || 0,
      });
    }

    // Payment failed — start/advance the dunning sequence. A nightly sweep
    // (lib/dunning.ts) retries saved cards on day 1/3/7/14 and downgrades at
    // day 21; reminder "emails" are logged (no email infra yet).
    if (event === 'charge.failed' || event === 'invoice.payment_failed') {
      const data = payload.data;
      const email = data.customer?.email || data.customer_email;

      const user = await getUserByEmail(email || '');
      if (!user) {
        console.error(`No user found for email ${email} on ${event}`);
        return res.status(200).json({ received: true });
      }

      const now = new Date().toISOString();
      const existing = user.paymentFailure;
      await updateUser(user.id, {
        paymentFailure: {
          count: (existing?.count || 0) + 1,
          firstFailedAt: existing?.firstFailedAt || now,
          lastAttemptAt: now,
          lastReference: data.reference || undefined,
        },
      } as any);

      console.log(`[dunning-email] to=${user.email} subject="Your PropReel payment failed — please update your card" reference=${data.reference || 'n/a'}`);

      return res.status(200).json({ success: true, event, dunning_started: true });
    }

    // Handle subscription cancellation
    if (event === 'subscription.disable') {
      const data = payload.data;
      const email = data.customer.email;

      // Find user by email in our users table
      let userId: string | undefined;

      const user = await getUserByEmail(email);
      userId = user?.id;

      if (!userId) {
        console.error(`No user found for email ${email}`);
        return res.status(200).json({ received: true });
      }

      // Cancel subscription in DynamoDB
      await cancelSubscription(userId);

      return res.status(200).json({
        success: true,
        event: 'subscription.disable',
      });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    // Release the idempotency claim so Paystack's retry can process this
    // event again. Lower-layer guards (pay_<reference> marker, addCredits
    // event locks) still protect charge.success from double-crediting on
    // that retry even if the failure happened mid-processing.
    if (claimedEventKeyId) {
      try {
        const { deleteItem, TABLES } = await import('../../lib/db');
        await deleteItem(TABLES.SETTINGS, { id: claimedEventKeyId });
      } catch { /* best effort */ }
    }
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// Helper functions (users table has no GSIs on email/supabaseUserId,
// so non-key lookups scan with a filter)
async function getUserByEmail(email: string) {
  const { scanItems, TABLES } = await import('../../lib/db');
  const users = await scanItems<any>(TABLES.USERS, {
    filter: {
      expression: 'email = :email',
      values: { ':email': (email || '').toLowerCase() },
    },
    limit: 1,
  });
  return users[0] || null;
}

async function cancelSubscription(userId: string) {
  const { getUser, updateUser } = await import('../../lib/userService');
  const user = await getUser(userId);
  if (!user || !user.subscription) return;
  await updateUser(userId, {
    subscription: { ...user.subscription, status: 'CANCELLED' as const },
  });
}
