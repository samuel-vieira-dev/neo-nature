import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import { orders, users, tickets, supportEmailConversations as conversations, supportEmailMessages as messages, supportEmailJobs as jobs } from "@/db/schema";
import { emailInboundSchema } from "./support-email-contract";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("./support-email-ai", async importOriginal => ({ ...await importOriginal<typeof import("./support-email-ai")>(), generateSupportEmail: generate }));
describe.skipIf(process.env.RUN_SUPPORT_EMAIL_DB_TESTS !== "1")("support email database integration", () => {
  let pg: EmbeddedPostgres;
  let directory: string;
  let database: typeof import("@/db");
  let service: typeof import("./support-email");
  const input = (messageId = "gmail-1", text = "Where is my order?") => emailInboundSchema.parse({ schemaVersion: 1, event: "email.received", eventId: `event-${messageId}`, mailboxId: "support@example.com", threadId: "thread-1", messageId, rfcMessageId: `<${messageId}@example.com>`, from: { email: "internal@example.com", name: "Internal tester" }, subject: "My order", text, receivedAt: new Date().toISOString() });
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "neo-email-"));
    pg = new EmbeddedPostgres({ databaseDir: directory, user: "postgres", password: "postgres", port: 55440, persistent: false });
    await pg.initialise(); await pg.start();
    const url = "postgresql://postgres:postgres@127.0.0.1:55440/postgres";
    vi.stubEnv("DATABASE_URL", url);
    execFileSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "push", "--force"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url, DRIZZLE_ENV: "test" }, stdio: "pipe" });
    // Verify the handoff migration is idempotent against the same isolated schema.
    execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/add-support-email.ts"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    database = await import("@/db"); service = await import("./support-email");
  }, 60000);
  afterAll(async () => {
    if (database) await database.rawSql.end();
    if (pg) await pg.stop();
    if (directory) await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
  });
  beforeEach(async () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "draft"); vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "internal@example.com");
    vi.stubEnv("SUPPORT_EMAIL_OUTBOUND_WEBHOOK_URL", "https://n8n.example.com/send"); vi.stubEnv("SUPPORT_EMAIL_OUTBOUND_API_KEY", "test-key");
    vi.stubEnv("FRESHDESK_DOMAIN", "test"); vi.stubEnv("FRESHDESK_API_KEY", "test-key"); vi.stubEnv("SUPPORT_EMAIL_FRESHDESK_GROUP_ID", "42");
    vi.unstubAllGlobals(); generate.mockReset();
    generate.mockResolvedValue({ tier: "T1", language: "en", intent: "tracking", needsHuman: false, reason: "", reply: "Thank you. Your order is confirmed." });
    await database.db.delete(jobs); await database.db.delete(messages); await database.db.delete(conversations); await database.db.delete(orders);
  });
  it("deduplicates simultaneous webhooks without provisioning app accounts", async () => {
    const event = input();
    const [a, b] = await Promise.all([service.receiveSupportEmail(event), service.receiveSupportEmail(event)]);
    expect(a.conversationId).toBe(b.conversationId);
    expect(await database.db.select().from(messages)).toHaveLength(1);
    expect(await database.db.select().from(jobs)).toHaveLength(1);
    await expect(service.receiveSupportEmail({ ...event, text: "Changed message" })).rejects.toHaveProperty("status", 409);
  });
  it("saves drafts without any email or Freshdesk side effects", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await service.receiveSupportEmail(input()); await service.runSupportEmailJobs();
    const [job] = await database.db.select().from(jobs);
    expect(job.status).toBe("review"); expect(job.stage).toBe("send");
    expect(job.sendAfter.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends once with concurrent workers, after the configured delay", async () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot");
    await service.receiveSupportEmail(input()); await service.runSupportEmailJobs();
    await database.db.update(jobs).set({ runAt: new Date(0), sendAfter: new Date(0) });
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => Response.json({ success: true, requestId: JSON.parse(String(init.body)).requestId, messageId: "gmail-reply-1" }));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([service.runSupportEmailJobs(), service.runSupportEmailJobs()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await database.db.select().from(jobs))[0].status).toBe("succeeded");
    expect((await database.db.select().from(messages)).filter(m => m.direction === "outgoing")).toHaveLength(1);
  });
  it("cancels pending replies when the customer sends another message", async () => {
    await service.receiveSupportEmail(input()); await service.runSupportEmailJobs();
    await service.receiveSupportEmail(input("gmail-2", "Please check another detail"));
    expect((await database.db.select().from(jobs)).filter(j => j.stage === "send")[0].status).toBe("cancelled");
  });
  it("blocks a second concurrent handoff when the first Freshdesk write is uncertain", async () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot");
    const accepted = await service.receiveSupportEmail(input("critical-1", "I need to report fraud"));
    await service.receiveSupportEmail(input("critical-2", "Please investigate this fraud"));
    let entered!: () => void;
    let release!: () => void;
    const enteredRequest = new Promise<void>(resolve => { entered = resolve; });
    const finishRequest = new Promise<void>(resolve => { release = resolve; });
    const fetchMock = vi.fn(async () => { entered(); await finishRequest; return Response.json({ error: "unconfirmed" }, { status: 503 }); });
    vi.stubGlobal("fetch", fetchMock);
    const first = service.runSupportEmailJobs(1);
    await enteredRequest;
    const second = service.runSupportEmailJobs(1);
    try {
      // The second worker has claimed its job while waiting for the conversation lock.
      for (let attempt = 0; attempt < 50; attempt++) {
        if ((await database.db.select().from(jobs)).filter(j => j.status === "processing").length === 2) break;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      expect((await database.db.select().from(jobs)).filter(j => j.status === "processing")).toHaveLength(2);
    } finally { release(); await Promise.all([first, second]); }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const queue = await database.db.select().from(jobs);
    const uncertain = queue.find(j => j.status === "unknown")!;
    expect(queue.some(j => j.status === "blocked" && j.error === "reconcile_unknown_delivery_first")).toBe(true);
    await service.supportEmailAction(accepted.conversationId!, "confirm_synced", uncertain.id, undefined, 123);
    expect((await database.db.select().from(conversations))[0].freshdeskId).toBe(123);
    expect((await database.db.select().from(jobs)).some(j => j.status === "unknown")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("records an out-of-order message without replacing the latest request", async () => {
    const first = input(); const accepted = await service.receiveSupportEmail(first);
    const older = { ...input("gmail-old"), receivedAt: new Date(Date.now() - 86400000).toISOString() };
    expect(await service.receiveSupportEmail(older)).toMatchObject({ ignored: true, reason: "older_message_saved" });
    expect((await database.db.select().from(conversations))[0].latestMessageId).toBe(accepted.messageId);
    expect(await database.db.select().from(jobs)).toHaveLength(1);
  });
  it("stops uncertain deliveries rather than resending automatically", async () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot");
    await service.receiveSupportEmail(input()); await service.runSupportEmailJobs();
    await database.db.update(jobs).set({ runAt: new Date(0), sendAfter: new Date(0) });
    const fetchMock = vi.fn().mockRejectedValue(new Error("timeout")); vi.stubGlobal("fetch", fetchMock);
    await service.runSupportEmailJobs(); await service.runSupportEmailJobs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await database.db.select().from(jobs))[0].status).toBe("unknown");
    await service.receiveSupportEmail(input("gmail-after-timeout", "Any update?"));
    await service.runSupportEmailJobs();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await database.db.select().from(jobs)).some(j => j.error === "reconcile_unknown_delivery_first")).toBe(true);
  });
  it("links only the sender's order to the standalone refund form and leaves finances untouched", async () => {
    await database.db.insert(orders).values([{ id: "bg-own", number: "OWN123", email: "internal@example.com", placedAt: new Date(), status: "confirmed", total: "100.00" }, { id: "bg-other", number: "OTHER123", email: "stranger@example.com", placedAt: new Date(), status: "confirmed", total: "200.00" }]);
    await service.receiveSupportEmail(input("gmail-refund", "Please refund OTHER123"));
    const [c] = await database.db.select().from(conversations); const [m] = await database.db.select().from(messages);
    const context = await service.supportEmailContext(c, m);
    expect(context.refundUrl).toBeNull();
    expect(context.orders).toHaveLength(1);
    expect((await service.supportEmailContext(c, { ...m, text: "Please refund OWN123" })).refundUrl).toBe("https://app.beneonature.com/refund?order_id=bg-own");
    expect((await database.db.select().from(orders)).every(o => o.refundAmount === null && o.status === "confirmed")).toBe(true);
  });
  it("escalates T3 immediately and stops AI after a human event", async () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot");
    const accepted = await service.receiveSupportEmail(input("gmail-critical", "I had an allergic reaction"));
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 12345 })); vi.stubGlobal("fetch", fetchMock);
    await service.runSupportEmailJobs();
    expect(generate).not.toHaveBeenCalled();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ group_id: 42, priority: 4 });
    expect((await database.db.select().from(conversations))[0].freshdeskId).toBe(12345);
    const event = { schemaVersion: 1 as const, eventId: "human-event-1", event: "human.replied" as const, conversationId: accepted.conversationId!, freshdeskId: 12345, messageId: "freshdesk-reply-1", text: "Human test reply", occurredAt: new Date().toISOString() };
    expect(await service.receiveFreshdeskEmailEvent(event)).toMatchObject({ deduped: false });
    expect(await service.receiveFreshdeskEmailEvent(event)).toMatchObject({ deduped: true });
    await service.receiveSupportEmail(input("gmail-followup", "Thank you"));
    expect((await database.db.select().from(jobs)).filter(j => j.stage === "human_note")).toHaveLength(1);
    expect((await database.db.select().from(conversations))[0].owner).toBe("human");
  });
  it("keeps outside recipients blocked during the internal pilot", async () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot"); vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "different@example.com");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await service.receiveSupportEmail(input("gmail-critical", "Fraud complaint")); await service.runSupportEmailJobs();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await database.db.select().from(jobs))[0].status).toBe("blocked");
    await service.receiveSupportEmail({ ...input("gmail-normal", "Where is my order?"), threadId: "another-thread" }); await service.runSupportEmailJobs();
    expect(generate).not.toHaveBeenCalled();
  });
  it("paginates and orders conversations in the database", async () => {
    await database.db.insert(conversations).values(Array.from({ length: 65 }, (_, i) => ({ id: crypto.randomUUID(), mailboxId: "support@example.com", threadId: `thread-${i}`, email: `test${i}@example.com`, subject: `Subject ${i}`, createdAt: new Date(1000 + i * 1000), updatedAt: new Date(1000 + i * 1000) })));
    const first = await service.listSupportEmails({ limit: 10 });
    const second = await service.listSupportEmails({ offset: 10, limit: 50 });
    expect(first.conversations).toHaveLength(10); expect(second.conversations).toHaveLength(50);
    expect(first.total).toBe(65); expect(first.hasMore).toBe(true);
    expect(new Set([...first.conversations, ...second.conversations].map(c => c.id)).size).toBe(60);
    expect((await service.listSupportEmails({ limit: 10, orderBy: "created", direction: "asc" })).conversations[0].subject).toBe("Subject 0");
    expect((await service.listSupportEmails({ offset: 60, limit: 100 })).hasMore).toBe(false);
  });
  it("keeps local ticket name searches paginated when Freshdesk is unavailable", async () => {
    vi.stubEnv("FRESHDESK_DOMAIN", ""); vi.stubEnv("FRESHDESK_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    await database.db.insert(users).values({ id: "name-search", email: "name-test@example.com", fullName: "Internal Customer" });
    await database.db.insert(tickets).values(Array.from({ length: 65 }, (_, i) => ({ id: crypto.randomUUID(), userId: "name-search", email: "name-test@example.com", subject: `Ticket ${i}`, kind: "support", status: "open", createdAt: new Date(1000 + i * 1000) })));
    const { getTicketQueue } = await import("./support-desk");
    const first = await getTicketQueue({ q: "Internal Customer", limit: 10, orderBy: "created", direction: "asc" });
    const second = await getTicketQueue({ q: "Internal Customer", offset: 10, limit: 50, orderBy: "created", direction: "asc" });
    expect(first.source).toBe("local"); expect(first.tickets).toHaveLength(10); expect(first.tickets[0].subject).toBe("Ticket 0");
    expect(second.tickets).toHaveLength(50); expect(second.tickets[0].subject).toBe("Ticket 10"); expect(second.hasMore).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
