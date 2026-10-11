/**
 * Catalog of the third-party services the site runs on and where each API
 * key must live. SINGLE SOURCE for the Admin → API Keys tab and the
 * /api/adminApiKeys handler: the browser never invents env or secret names,
 * it only submits values for names listed here.
 *
 * Propagation targets per field:
 *   vercelEnv   → upserted into the Vercel project env (production, preview
 *                 and development) and applied by a redeploy.
 *   modalSecret → upserted into the named Modal secret via the render
 *                 worker's POST /admin/secret (bearer-gated).
 *
 * Keep this module dependency-free (pure data) — it is imported by both the
 * Vite bundle and the Vercel functions.
 */

export interface ServiceKeyField {
  name: string;
  label: string;
  /** Modal secret that carries this key (worker-mounted). */
  modalSecret?: string;
  /** Also written to the Vercel project env. */
  vercelEnv?: boolean;
}

export interface ServiceKeySpec {
  id: string;
  label: string;
  blurb: string;
  fields: ServiceKeyField[];
}

export const SERVICE_KEYS: ServiceKeySpec[] = [
  {
    id: 'fal',
    label: 'fal.ai',
    blurb: 'Image, video and LLM renders — mounted into the Modal worker as the fal-credentials secret.',
    fields: [{ name: 'FAL_KEY', label: 'FAL API key', modalSecret: 'fal-credentials' }],
  },
  {
    id: 'aws',
    label: 'AWS — DynamoDB & S3',
    blurb: 'Shared: the Vercel functions use these for DynamoDB/S3, and the Modal worker mounts them as aws-credentials.',
    fields: [
      { name: 'AWS_ACCESS_KEY_ID', label: 'Access key ID', modalSecret: 'aws-credentials', vercelEnv: true },
      { name: 'AWS_SECRET_ACCESS_KEY', label: 'Secret access key', modalSecret: 'aws-credentials', vercelEnv: true },
    ],
  },
  {
    id: 'narakeet',
    label: 'Narakeet — voiceover TTS',
    blurb: 'Narration synthesis for video renders — mounted into the Modal worker as the narakeet secret.',
    fields: [{ name: 'NARAKEET_API_KEY', label: 'Narakeet API key', modalSecret: 'narakeet' }],
  },
  {
    id: 'paystack',
    label: 'Paystack — payments',
    blurb: 'Checkout, plan upgrades and webhooks — Vercel env only.',
    fields: [{ name: 'PAYSTACK_SECRET_KEY', label: 'Secret key', vercelEnv: true }],
  },
  {
    id: 'supabase',
    label: 'Supabase — auth backend',
    blurb: 'Server-side service role key — Vercel env only; never leaves the server.',
    fields: [{ name: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Service role key', vercelEnv: true }],
  },
  {
    id: 'cron',
    label: 'Cron protection',
    blurb: 'Guards the scheduled endpoints — Vercel env only.',
    fields: [{ name: 'CRON_SECRET', label: 'CRON secret', vercelEnv: true }],
  },
];

/** Every env var name the catalog may write (the server's allow-list). */
export const ALL_FIELD_NAMES: string[] = SERVICE_KEYS.flatMap(s => s.fields.map(f => f.name));
