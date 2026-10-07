import { escapeEmailHtml } from "./support-email-contract";

export async function pushEmailToFreshdesk(input: { freshdeskId: number | null; email: string; name: string; subject: string; tier: string; conversationId: string; description: string }) {
  const domain = process.env.FRESHDESK_DOMAIN;
  const key = process.env.FRESHDESK_API_KEY;
  const groupId = Number(process.env.SUPPORT_EMAIL_FRESHDESK_GROUP_ID);
  if (!domain || !key || !/^[a-z0-9-]+$/i.test(domain) || !Number.isSafeInteger(groupId) || groupId <= 0) {
    return { status: "blocked" as const, error: "freshdesk_group_or_credentials_missing" };
  }
  const headers = { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${key}:X`).toString("base64")}` };
  const body = `<pre>${escapeEmailHtml(input.description)}</pre>`;
  try {
    const res = await fetch(`https://${domain}.freshdesk.com/api/v2/tickets${input.freshdeskId ? `/${input.freshdeskId}/notes` : ""}`, {
      method: "POST", headers,
      body: JSON.stringify(input.freshdeskId ? { body, private: true } : {
        email: input.email, ...(input.name ? { name: input.name } : {}), subject: input.subject,
        description: body, status: 2, priority: input.tier === "T3" ? 4 : 2, group_id: groupId,
        tags: ["neonature-email", input.tier.toLowerCase(), `neo-conversation-${input.conversationId}`],
      }),
      signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store",
    });
    if (res.status >= 400 && res.status < 500 && res.status !== 408) return { status: "failed" as const, error: `freshdesk_http_${res.status}` };
    const result = await res.json().catch(() => null);
    if (!res.ok || typeof result?.id !== "number") return { status: "unknown" as const, error: "freshdesk_confirmation_missing" };
    return { status: "synced" as const, freshdeskId: input.freshdeskId ?? result.id };
  } catch { return { status: "unknown" as const, error: "freshdesk_result_uncertain" }; }
}
