import type { VercelRequest, VercelResponse } from '@vercel/node';
import INDEX from './chatIndex.json';

/**
 * PropReel support assistant — retrieval over the site's own FAQ/docs, then a
 * single completion call, so answers stay inside what the product actually
 * does. Server-side only: the provider key never reaches the browser, and the
 * knowledge base is not shipped in the client bundle.
 *
 * Reached through the /api/chat rewrite in vercel.json so the deployment
 * stays at the account's serverless-function count.
 */

interface Chunk {
  source: string;
  href: string;
  title: string;
  text: string;
}

const CHUNKS: Chunk[] = (INDEX as { chunks: Chunk[] }).chunks ?? [];

// ── Retrieval ─────────────────────────────────────────────────────────
// BM25-lite: no embeddings, no vector database, no per-query cost. The corpus
// is a couple of hundred chunks, so lexical scoring retrieves as well as a
// vector store would for the questions this widget gets.

const STOP = new Set(
  ('a an and are as at be but by can could do does for from get got has have how i if in into is it its ' +
    'just like me my no not of on or our so that the their them then there these they this to too was we ' +
    'were what when where which who why will with you your')
    .split(' ')
    .filter(Boolean)
);

/** Crude plural folding: "cost" must match "costs", "photo" → "photos". */
function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

const DOC_TERMS = CHUNKS.map((c) => tokenize(`${c.title} ${c.text}`));
const DF = new Map<string, number>();
for (const terms of DOC_TERMS) {
  for (const t of new Set(terms)) DF.set(t, (DF.get(t) ?? 0) + 1);
}
const N = Math.max(CHUNKS.length, 1);
const idf = (t: string) => Math.log(1 + (N - (DF.get(t) ?? 0) + 0.5) / ((DF.get(t) ?? 0) + 0.5));

function retrieve(query: string, k = 6): Chunk[] {
  const qTerms = tokenize(query);
  if (!qTerms.length || !CHUNKS.length) return [];

  const scored = DOC_TERMS.map((terms, i) => {
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const q of qTerms) {
      const f = tf.get(q);
      if (!f) continue;
      // Saturating term frequency, plus a title hit as a strong signal.
      score += idf(q) * (f / (f + 1.2));
      if (CHUNKS[i].title.toLowerCase().includes(q)) score += idf(q) * 0.9;
    }
    return { i, score };
  });

  const picked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => CHUNKS[s.i]);

  // Money questions need the whole price list, not whichever tier chunk a
  // keyword happened to rank: "what can I make with R50?" was answered from a
  // blog post because the tier prices never made the cut. Any rand amount or
  // budget wording pulls every Pricing section in alongside the lexical hits.
  if (MONEY_RE.test(query)) {
    for (const chunk of CHUNKS) {
      if (picked.length >= k + 4) break;
      if (chunk.source.startsWith('Pricing ·') && !picked.includes(chunk)) picked.push(chunk);
    }
  }

  return picked;
}

/** Rand amounts, budget/affordability wording, and "how many … can I make". */
const MONEY_RE = /\br\s?\d|\brand\b|\bbudget\b|\bafford|\bcheapest\b|how many .{0,24}(video|reel|make|generate|create)/i;

// ── Rate limits ───────────────────────────────────────────────────────
// Per-instance guards only: they stop one visitor hammering the endpoint, and
// the provider's own free-tier limits cap the account-wide ceiling.
const WINDOW_MS = 10 * 60 * 1000;
const PER_IP_MAX = 12;
const PER_DAY_MAX = 600;

const hits = new Map<string, number[]>();
let dayCount = 0;
let dayStart = Date.now();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (now - dayStart > 24 * 60 * 60 * 1000) {
    dayStart = now;
    dayCount = 0;
  }
  if (++dayCount > PER_DAY_MAX) return true;

  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key);
  }
  return recent.length > PER_IP_MAX;
}

// ── Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the PropReel support assistant, embedded on propreel.co.za.

PropReel turns South African estate agents' property photos into cinematic, narrated listing reels. It also offers AI photo editing, virtual staging, furniture removal, day-to-twilight conversion, property descriptions, social posts and AI avatar videos. Prices, credits and tiers are in South African rand (ZAR).

Rules:
- Answer only from the reference notes below. If they do not cover it, say you don't have that detail and point to /faq, the in-app Help, or support@propreel.co.za. Never guess a price, credit cost, turnaround time or policy.
- Exact field rules — pixel sizes, file-size caps, character limits, allowed languages, voices, formats and photo counts — must come from the notes. If a specific figure is not there, say you don't have that number and point to the hint under that field in the app, instead of estimating it.
- Be brief and practical: 2–5 short sentences, or a compact list when someone is following setup steps. No preamble, no restating the question.
- Use the customer's words for features; never mention hosting providers, model vendors or internal infrastructure.
- Credits: photo edits, staging, removal and twilight cost 2 credits; descriptions 1; social posts 2; video tiers vary by duration and resolution. If the notes give an exact cost, quote it; otherwise say it depends on the tier and link to /pricing.
- Step numbers are per tool and they differ: the Video Generator and the Budget Video wizard number their steps differently. Always name the tool a step belongs to. If the question says "step 3" without naming the tool, cover both wizards briefly rather than picking one.
- Budget questions ("how many videos can I make with R100?"): credits cost R1.50 each, so convert the rand to credits first (R100 ÷ R1.50 ≈ 66 credits), then divide by each tier's credit price from the notes and show the arithmetic and the counts. Never answer that you cannot calculate this when the tier prices are in the notes — name the tiers that fit, how many reels each gives, and the cheapest way to make more.
- Subscriptions are optional, not a requirement: free accounts buy credits as they go. Say that plainly when asked whether they need a plan, and mention the legacy 7-day trial caveat only for accounts that still carry one.
- Never promise a refund, a credit grant, a deadline or an account change. Those go to support@propreel.co.za.
- Refuse anything unrelated to PropReel and steer back to property marketing.`;

function contextBlock(chunks: Chunk[]): string {
  if (!chunks.length) return 'Reference notes: (no matching entries)';
  return (
    'Reference notes:\n\n' +
    chunks
      .map((c, i) => `[${i + 1}] ${c.title} (${c.source})\n${c.text}`)
      .join('\n\n')
  );
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

// ── Handler ───────────────────────────────────────────────────────────
export async function handleChat(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.CHAT_API_KEY;
  if (!apiKey) {
    console.error('[chat] GROQ_API_KEY is not set');
    return res.status(503).json({
      ok: false,
      error: 'The assistant is not configured yet. Email support@propreel.co.za and we will help.',
    });
  }

  const body = (req.body ?? {}) as { messages?: unknown };
  const history: Msg[] = Array.isArray(body.messages)
    ? body.messages
        .filter((m): m is Msg => !!m && typeof m === 'object' && typeof (m as Msg).content === 'string')
        .map(
          (m): Msg => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content).slice(0, 1200),
          })
        )
        .filter((m) => m.content.trim().length > 0)
        .slice(-8)
    : [];

  const question = [...history].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
  if (question.length < 2) {
    return res.status(400).json({ ok: false, error: 'Ask a question to get started.' });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string | undefined) ||
    'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({
      ok: false,
      error: "You've asked a lot in a short time. Give it a few minutes, or email support@propreel.co.za.",
    });
  }

  const chunks = retrieve(question, 6);
  const sources = [...new Set(chunks.map((c) => c.href))]
    .slice(0, 3)
    .map((href) => {
      const match = chunks.find((c) => c.href === href)!;
      return { href, label: match.source };
    });

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Free-tier model on the provider account; override with CHAT_MODEL.
        model: process.env.CHAT_MODEL || 'openai/gpt-oss-120b',
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextBlock(chunks)}` },
          ...history,
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error(`[chat] upstream ${upstream.status}: ${detail.slice(0, 300)}`);
      const busy = upstream.status === 429 || upstream.status === 503;
      return res.status(busy ? 429 : 502).json({
        ok: false,
        error: busy
          ? "I'm handling a lot of questions right now — try again in a minute, or email support@propreel.co.za."
          : 'Something went wrong on our side. Please try again, or email support@propreel.co.za.',
      });
    }

    const data: any = await upstream.json();
    const answer = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!answer) {
      return res.status(502).json({
        ok: false,
        error: 'I could not put an answer together. Try rephrasing, or email support@propreel.co.za.',
      });
    }

    return res.status(200).json({ ok: true, answer, sources });
  } catch (e: any) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    console.error('[chat] request failed:', e?.message || e);
    return res.status(timedOut ? 504 : 502).json({
      ok: false,
      error: timedOut
        ? 'That took too long. Try again, or email support@propreel.co.za.'
        : 'I could not reach the assistant just now. Please try again.',
    });
  }
}
