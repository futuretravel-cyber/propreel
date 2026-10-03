# Google Sign-In Setup (first-party OAuth)

Supabase's hosted Google login was removed when Supabase was retired. Google
sign-in now runs through PropReel's own `/api/users` OAuth routes — it only
needs two environment variables.

Until they are set, the **Continue with Google** button shows a friendly
"not configured" page; email + password sign-in is unaffected.

## 1. Create the OAuth client (Google Cloud Console)

1. Open https://console.cloud.google.com/apis/credentials
2. Configure the **OAuth consent screen** (External, add `propreel.co.za` as
   an authorized domain; add your admin accounts as test users while in
   Testing mode).
3. **Create credentials → OAuth client ID → Web application**.
4. Add these **Authorized redirect URIs** (exact match, including the query):

   ```
   https://www.propreel.co.za/api/users?action=auth_google_callback
   http://localhost:3000/api/users?action=auth_google_callback
   ```

   Optional (bare-domain fallback if you also test on the vercel.app host):

   ```
   https://propreel-xi.vercel.app/api/users?action=auth_google_callback
   ```

5. Copy the **Client ID** and **Client Secret**.

## 2. Add the secrets to Vercel

```bash
npx vercel env add GOOGLE_CLIENT_ID production
npx vercel env add GOOGLE_CLIENT_SECRET production
```

(or add them in the Vercel dashboard → PropReel → Settings → Environment
Variables → Production, then **redeploy**.)

## 3. Verify

1. Visit https://www.propreel.co.za/login
2. Click **Continue with Google** → Google's account chooser →
   back on PropReel signed in and routed to the dashboard (or the `?next=`
   destination the visitor originally wanted).
3. New Google accounts get the standard 5-credit signup bonus; the account
   row is created with `emailVerified: true` (Google asserts verification).

## Flow reference

- `GET /api/users?action=auth_google_start&redirect=/path` → 302 to Google
  (`state` carries the safe same-site redirect path).
- `GET /api/users?action=auth_google_callback&code=…&state=…` → server-side
  code exchange → `openidconnect.googleapis.com/v1/userinfo` → find-or-create
  user → first-party HttpOnly session cookie → 302 to the destination.
- The client secret never leaves the Vercel function.
