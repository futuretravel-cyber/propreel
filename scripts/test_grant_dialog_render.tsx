/**
 * Render smoke test for the admin give-credits dialog — no session, no DB.
 *
 * Usage: npx tsx scripts/test_grant_dialog_render.tsx
 *
 * Server-renders <AdminGiveCredits> inside ToastProvider and asserts the
 * dialog's actual markup: title, target email + balance, amount input with
 * presets, the live preview line, the default button label, and the a11y
 * dialog roles. Catches render crashes and label regressions that typecheck
 * cannot see; the endpoint contract itself is proven by
 * scripts/test_admin_grants.ts.
 */
import { renderToString } from 'react-dom/server';
import { ToastProvider } from '../src/context/ToastContext';
import AdminGiveCredits from '../src/components/AdminGiveCredits';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`); }
}

// React 18 SSR separates adjacent text nodes with <!-- --> comments; they are
// presentation artifacts, not content, so strip them before asserting.
const html = renderToString(
  <ToastProvider>
    <AdminGiveCredits
      user={{ id: 'u_1', email: 'recipient@example.com', credits: 500 }}
      onClose={() => {}}
      onGranted={() => {}}
    />
  </ToastProvider>
).replace(/<!-- -->/g, '');

check('renders without throwing', html.length > 0, html.length);
check('dialog title + aria roles', html.includes('Give credits') && html.includes('role="dialog"') && html.includes('aria-modal="true"'));
check('target email + current balance', html.includes('recipient@example.com') && html.includes('current balance 500'));
check('amount input present with default 100', /<input[^>]*id="admin-grant-amount"[^>]*value="100"/.test(html));
check('preset chips 50 / 100 / 500 / 1000', ['>50<', '>100<', '>500<', '>1000<'].every(s => html.includes(s)));
check('note field with ledger hint', html.includes('recorded in the ledger') && html.includes('comp for the launch event'));
check('preview line: 500 → 600 for 100', html.includes('Balance 500') && html.includes('600</span>') && html.includes('after granting 100'));
check('submit label reflects default amount', html.includes('Give 100 credits'));
// The submit button must NOT carry a disabled attribute: default amount 100
// is valid, so only a saving/invalid state may disable it.
const labelIdx = html.lastIndexOf('Give 100 credits');
const before = html.slice(0, labelIdx);
const btnStart = before.lastIndexOf('<button');
const btnTag = before.slice(btnStart, before.indexOf('>', btnStart) + 1);
check('submit enabled (valid default amount)', btnStart !== -1 && !btnTag.includes('disabled'), btnTag);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
