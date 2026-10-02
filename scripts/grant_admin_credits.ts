/**
 * Grant the platform admins their testing credits and ensure ADMIN role.
 * Usage: set -a; source .env; set +a; npx tsx scripts/grant_admin_credits.ts
 */
import { getUserByEmail, updateUser, addCredits } from '../lib/userService';
import { TABLES, queryItems } from '../lib/db';

const ADMINS = ['futuretravel@gmail.com', 'ulric@propreel.co.za'];
const GRANT = 1000;
const today = new Date().toISOString().slice(0, 10);

async function main() {
  for (const email of ADMINS) {
    let user = await getUserByEmail(email);
    if (!user) {
      // Provision the account via the Supabase admin API + DynamoDB row
      // (mirrors POST /api/users) so the admin exists before first sign-in.
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        console.log(`✗ ${email} — no user row and no Supabase service key to create one`);
        continue;
      }
      const { createClient } = await import('@supabase/supabase-js');
      const admin = createClient(supabaseUrl, serviceKey);
      let { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: 'Ulric (PropReel Admin)' },
      });
      if (error && /already.*registered/i.test(error.message)) {
        // Auth identity already exists (e.g. signed up earlier) — reuse it.
        // (This supabase-js version has no admin.getUserByEmail; list + filter.)
        const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
        const match = listed.data?.users?.find(u => (u.email || '').toLowerCase() === email);
        if (match) {
          data = { user: match } as any;
          error = null;
          console.log(`• ${email} — Supabase auth identity already existed, reusing`);
        }
      }
      if (error || !data?.user) {
        console.log(`✗ ${email} — Supabase account creation failed: ${error?.message}`);
        continue;
      }
      // Create the app-database row directly (mirrors POST /api/users)
      const { putItem } = await import('../lib/db');
      const now = new Date().toISOString();
      await putItem(TABLES.USERS, {
        id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        email,
        fullName: 'Ulric (PropReel Admin)',
        role: 'ADMIN',
        credits: 0,
        creditExpiries: [],
        subscription: null,
        autoTopup: { enabled: false, threshold: 50, amount: 200 },
        agencyId: null,
        agencyName: null,
        avatarUrl: null,
        emailVerified: true,
        lastLowCreditWarnedAt: null,
        supabaseUserId: data.user.id,
        notificationPreferences: {
          emailNotifications: true, pushNotifications: true, renderComplete: true,
          lowCredits: true, newFeatures: true, billingAlerts: true, marketingEmails: false,
        },
        createdAt: now,
        updatedAt: now,
      });
      user = await getUserByEmail(email);
      if (!user) {
        console.log(`✗ ${email} — could not create app-database row`);
        continue;
      }
      console.log(`• ${email} — app-database row created (${user.id})`);
      console.log(`• ${email} — account provisioned (supabase ${data.user.id})`);
    }
    if (user.role !== 'ADMIN') {
      await updateUser(user.id, { role: 'ADMIN' });
      console.log(`• ${email} — role set to ADMIN`);
    }
    // Idempotent: one grant per calendar day per admin
    const prior = await queryItems<{ metadata?: { via?: string }; createdAt: string }>(TABLES.CREDIT_TRANSACTIONS, {
      expression: 'userId = :u', values: { ':u': user.id },
    }, { limit: 100 });
    if (prior.some(t => t.metadata?.via === 'admin_grant_script' && String(t.createdAt).startsWith(today))) {
      console.log(`= ${email} — already granted today (balance ${user.credits})`);
      continue;
    }
    const res = await addCredits(user.id, GRANT, 'bonus', 'Admin testing grant', { via: 'admin_grant_script' });
    console.log(`✓ ${email} — +${GRANT} credits (new balance: ${res.newBalance})`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
