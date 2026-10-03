/**
 * Grant the platform admins their testing credits and ensure ADMIN role.
 * Usage: set -a; source .env; set +a; npx tsx scripts/grant_admin_credits.ts
 *
 * Auth is first-party now (DynamoDB row + password) — when an admin row is
 * missing this script creates it; the admin sets a password once via the
 * /forgot-password email flow.
 */
import { getUserByEmail, updateUser, addCredits } from '../lib/userService';
import { TABLES, queryItems, putItem } from '../lib/db';

const ADMINS = ['futuretravel@gmail.com', 'ulric@propreel.co.za'];
const GRANT = 1000;
const today = new Date().toISOString().slice(0, 10);

async function main() {
  for (const email of ADMINS) {
    let user = await getUserByEmail(email);
    if (!user) {
      // Provision the app-database row directly (mirrors POST /api/users)
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
