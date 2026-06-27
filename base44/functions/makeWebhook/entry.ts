import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/2136mj2guw97mxagplgd29akmxm4lea4";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await req.json();

    const res = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    return Response.json({ ok: res.ok, status: res.status, body: text });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});