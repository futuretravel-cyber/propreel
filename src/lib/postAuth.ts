/**
 * Post-auth redirect resolution, shared by the login and signup pages.
 *
 * `loginWithGoogle(redirectTo)` stores the intended destination here before
 * bouncing to Google; when OAuth returns, the pages read it once and clear
 * it. Unknown/absent values fall back to the dashboard. Only same-app paths
 * are ever honored — never an external URL.
 */
const KEY = 'propreel:postAuthRedirect';

export function setPostAuthRedirect(target: string | null | undefined): void {
  try {
    if (target && target.startsWith('/')) {
      sessionStorage.setItem(KEY, target);
    } else {
      sessionStorage.removeItem(KEY);
    }
  } catch { /* private mode — fall back to dashboard */ }
}

export function takePostAuthRedirect(): string {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (v && v.startsWith('/')) return v;
  } catch { /* ignore */ }
  return '/dashboard';
}
