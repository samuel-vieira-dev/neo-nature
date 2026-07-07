import { z } from "zod";
import { withUser } from "@/server/session";
import { faqs } from "@/lib/data";

const schema = z.object({ question: z.string().min(3).max(300) });

/**
 * AI FAQ search. With ANTHROPIC_API_KEY set it asks Claude Haiku grounded in
 * the FAQ corpus; without it, falls back to local keyword scoring so the demo
 * always works.
 */
export const POST = withUser(async (user, request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const question = parsed.data.question.trim();

  const related = topMatches(question, 3);

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();
      const corpus = faqs.map((f, i) => `[${i + 1}] Q: ${f.q}\nA: ${f.a}`).join("\n\n");

      const msg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: `You are Neo Nature's support assistant. Answer the customer's question in 2-3 friendly sentences using ONLY the FAQ knowledge below. If the FAQ doesn't cover it, say so and suggest opening a ticket. Never give medical advice beyond what the FAQ says.\n\nFAQ:\n${corpus}`,
        messages: [{ role: "user", content: question }],
      });

      const answer = msg.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join(" ")
        .trim();

      return Response.json({ answer, source: "ai", related: related.map((f) => f.q) });
    } catch (e) {
      console.error("[faq-ai]", e);
      // fall through to local search
    }
  }

  const best = related[0];
  return Response.json({
    answer: best
      ? best.a
      : "I couldn't find that in our FAQ — open a ticket and a human will get back to you within 24 hours!",
    source: "search",
    related: related.map((f) => f.q),
  });
});

/** Cheap token-overlap scoring — good enough as an offline fallback */
function topMatches(question: string, n: number) {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

  return faqs
    .map((f) => {
      const hay = `${f.q} ${f.a}`.toLowerCase();
      const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { ...f, score };
    })
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}
