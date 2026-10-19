import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import { adminUsers, adminActionLogs, supportEmailTone, supportKnowledgeArticles, supportKnowledgeRevisions, supportTicketAttachments, orders, users, tickets, supportEmailConversations as conversations, supportEmailMessages as messages, supportEmailJobs as jobs } from "@/db/schema";
import { EmailReplyRejected } from "./support-email-ai";
import { eq } from "drizzle-orm";
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
    execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/add-support-email-tone.ts"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/add-internal-support.ts"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    database = await import("@/db"); service = await import("./support-email");
  }, 60000);
  afterAll(async () => {
    if (database) await database.rawSql.end();
    if (pg) await pg.stop();
    if (directory) await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
  });
  beforeEach(async () => {
    vi.stubEnv("SUPPORT_TICKETING_BACKEND", "freshdesk");
    vi.stubEnv("SUPPORT_EMAIL_LEGACY_FRESHDESK_HANDOFF", "true");
    vi.stubEnv("SUPPORT_EMAIL_MODE", "draft"); vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "internal@example.com");
    vi.stubEnv("SUPPORT_EMAIL_OUTBOUND_WEBHOOK_URL", "https://n8n.example.com/send"); vi.stubEnv("SUPPORT_EMAIL_OUTBOUND_API_KEY", "test-key");
    vi.stubEnv("FRESHDESK_DOMAIN", "test"); vi.stubEnv("FRESHDESK_API_KEY", "test-key"); vi.stubEnv("SUPPORT_EMAIL_FRESHDESK_GROUP_ID", "42");
    vi.unstubAllGlobals(); generate.mockReset();
    generate.mockResolvedValue({ tier: "T1", language: "en", intent: "tracking", needsHuman: false, reason: "", reply: "Thank you. Your order is confirmed." });
    await database.db.delete(supportTicketAttachments); await database.db.delete(supportKnowledgeRevisions); await database.db.delete(supportKnowledgeArticles);
    await database.db.delete(supportEmailTone); await database.db.delete(adminActionLogs); await database.db.delete(adminUsers);
    await database.db.delete(jobs); await database.db.delete(messages); await database.db.delete(conversations); await database.db.delete(orders);
  });
  it("persists voice edits with audit and rejects concurrent overwrites", async () => {
    const tone = await import("./support-email-tone");
    const [staff] = await database.db.insert(adminUsers).values({ id: "tone-editor", email: "cs@example.com", name: "CS tester", role: "cs", passwordHash: "unused" }).returning();
    const admin = { ...staff, role: "cs" as const, permissions: [] };
    expect(await tone.readSupportEmailTone()).toMatchObject({ instructions: "", version: 0 });
    await tone.saveSupportEmailTone({ instructions: 'Use “we” instead of “I”.', version: 0 }, admin);
    await expect(tone.saveSupportEmailTone({ instructions: "Overwrite", version: 0 }, admin)).rejects.toHaveProperty("status", 409);
    await service.receiveSupportEmail(input()); await service.runSupportEmailJobs();
    expect(generate.mock.calls[0][1]).toBe('Use “we” instead of “I”.');
    await tone.saveSupportEmailTone({ instructions: "", version: 1 }, admin);
    expect(await tone.readSupportEmailTone()).toMatchObject({ instructions: "", version: 2, updatedBy: "CS tester" });
    expect(await database.db.select().from(adminActionLogs)).toHaveLength(2);
    await expect(tone.saveSupportEmailTone({ instructions: "Stale edit", version: 1 }, admin)).rejects.toHaveProperty("status", 409);
    expect(await database.db.select().from(adminActionLogs)).toHaveLength(2);
  });
  it("ignores model needsHuman for T1/T2 and keeps its reply", async () => {
    vi.stubEnv("SUPPORT_TICKETING_BACKEND", "internal"); vi.stubGlobal("fetch", vi.fn());
    generate.mockResolvedValue({ tier: "T2", language: "en", intent: "other", needsHuman: true, reason: "Staff action", reply: "This action has not been performed.", acknowledgement: "We understand your concern." });
    await service.receiveSupportEmail(input("tone-handoff", "Need help with the order")); await service.runSupportEmailJobs(); await service.runSupportEmailJobs();
    expect((await database.db.select().from(conversations))[0]).toMatchObject({ requiresHuman: false, owner: "agent" });
    expect((await database.db.select().from(jobs))[0]).toMatchObject({ stage: "send", status: "review", draft: { needsHuman: false, reply: "This action has not been performed." } });
    expect((await database.db.select().from(messages)).filter(m=>m.direction==="outgoing")).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
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
  it("flags T3 locally by default even while legacy ticket migration is pending", async () => {
    vi.stubEnv("SUPPORT_EMAIL_LEGACY_FRESHDESK_HANDOFF", "false"); vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot"); vi.stubGlobal("fetch", vi.fn());
    const receipt = await service.receiveSupportEmail(input("gmail-commercial", "Tracking says delivered. Are you a scam?"));
    expect(receipt.tier).toBe("T3"); await service.runSupportEmailJobs();
    expect((await database.db.select().from(conversations))[0]).toMatchObject({ tier: "T3", owner: "human", requiresHuman: true, ticketStatus: "open" });
    expect((await database.db.select().from(jobs))[0]).toMatchObject({ stage: "escalate", status: "succeeded" });
    expect(generate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks a model-classified T3 even if it proposes an automatic response", async () => {
    vi.stubEnv("SUPPORT_TICKETING_BACKEND", "internal"); vi.stubGlobal("fetch", vi.fn());
    generate.mockResolvedValue({tier:"T3",language:"en",intent:"other",needsHuman:false,reason:"Complex issue",reply:"This must not be sent"});
    await service.receiveSupportEmail(input("gmail-staff", "Please help with this issue"));await service.runSupportEmailJobs();await service.runSupportEmailJobs();
    expect((await database.db.select().from(conversations))[0]).toMatchObject({tier:"T3",requiresHuman:true});
    const [suggestion] = await database.db.select().from(jobs);
    expect(suggestion).toMatchObject({ stage: "escalate", draft: { needsHuman: true, reply: "This must not be sent" } });
    await database.db.update(jobs).set({ status: "review" }).where(eq(jobs.id, suggestion.id));
    const [c] = await database.db.select().from(conversations);
    await expect(service.supportEmailAction(c.id, "approve", suggestion.id)).rejects.toHaveProperty("status", 409);
    // Even a corrupted queued send cannot deliver a T3 suggestion.
    await database.db.update(jobs).set({ stage: "send", status: "queued", runAt: new Date(0) }).where(eq(jobs.id, suggestion.id));
    await service.runSupportEmailJobs();
    expect((await database.db.select().from(jobs))[0]).toMatchObject({ status: "cancelled", error: "human_response_required" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cancels pending replies when the customer sends another message", async () => {
    await service.receiveSupportEmail(input()); await service.runSupportEmailJobs();
    await service.receiveSupportEmail(input("gmail-2", "Please check another detail"));
    expect((await database.db.select().from(jobs)).filter(j => j.stage === "send")[0].status).toBe("cancelled");
  });
  it("blocks a second concurrent handoff when the first Freshdesk write is uncertain", async () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot");
    const accepted = await service.receiveSupportEmail(input("critical-1", "I had an allergic reaction"));
    await service.receiveSupportEmail(input("critical-2", "I still have side effects"));
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
  it("drafts replies for outside recipients during the pilot but never sends them", async () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot"); vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "different@example.com");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await service.receiveSupportEmail(input("gmail-critical", "Fraud complaint")); await service.runSupportEmailJobs();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await database.db.select().from(jobs))[0].status).toBe("blocked");
    const receipt = await service.receiveSupportEmail({ ...input("gmail-normal", "Where is my order?"), threadId: "another-thread" }); await service.runSupportEmailJobs();
    expect(generate).toHaveBeenCalledTimes(1);
    const [draft] = (await database.db.select().from(jobs)).filter(j => j.conversationId === receipt.conversationId);
    expect(draft).toMatchObject({ stage: "send", status: "review" }); expect(draft.draft?.reply).toBe("Thank you. Your order is confirmed.");
    await service.runSupportEmailJobs();
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(service.supportEmailAction(receipt.conversationId!, "approve", draft.id)).rejects.toHaveProperty("status", 409);
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
  async function createStaff() {
    const [row]=await database.db.insert(adminUsers).values({id:crypto.randomUUID(),email:`${crypto.randomUUID()}@example.com`,name:"CS tester",role:"cs",passwordHash:"unused"}).returning();
    return {...row,role:"cs" as const,permissions:[]};
  }
  it("sends human replies once, preserves notes internally and reopens on new mail", async()=>{
    vi.stubEnv("SUPPORT_TICKETING_BACKEND","internal");vi.stubEnv("SUPPORT_EMAIL_MODE","pilot");
    const {ticketAction}=await import("./support-ticket-actions");const staff=await createStaff();
    const receipt=await service.receiveSupportEmail(input("human-t3","This is a scam"));await service.runSupportEmailJobs();
    const c=(await database.db.select().from(conversations))[0];const requestId=crypto.randomUUID();
    await ticketAction(c.id,{action:"note",text:"Private staff instruction",requestId:crypto.randomUUID()},staff);
    const refreshed=await service.supportEmailDetails(c.id);
    const command={action:"reply" as const,text:"We can help. Please confirm the missing item.",requestId,expectedMessageId:receipt.messageId!,expectedUpdatedAt:refreshed.conversation.updatedAt.toISOString(),status:"pending" as const};
    await ticketAction(c.id,command,staff);expect(await ticketAction(c.id,command,staff)).toMatchObject({deduped:true});
    const send=vi.fn().mockResolvedValue(Response.json({success:true,requestId,messageId:"human-reply-1"}));vi.stubGlobal("fetch",send);
    await Promise.all([service.runSupportEmailJobs(),service.runSupportEmailJobs()]);expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][1].body).text).not.toContain("Private staff instruction");
    expect((await database.db.select().from(conversations))[0]).toMatchObject({owner:"human",ticketStatus:"pending",requiresHuman:false});
    expect((await database.db.select().from(messages)).filter(m=>m.direction==="outgoing")).toHaveLength(1);
    const context=await service.supportEmailContext(c,(await database.db.select().from(messages)).find(m=>m.id===receipt.messageId)!);
    expect(JSON.stringify(context.history)).not.toContain("Private staff instruction");
    await service.receiveSupportEmail(input("human-followup","The issue remains"));
    expect((await database.db.select().from(conversations))[0]).toMatchObject({ticketStatus:"open",owner:"human",requiresHuman:true});
  });
  it("rejects staff sends outside the pilot and stale composer versions",async()=>{
    vi.stubEnv("SUPPORT_EMAIL_MODE","pilot");const {ticketAction}=await import("./support-ticket-actions");const staff=await createStaff();
    const receipt=await service.receiveSupportEmail(input());const c=(await database.db.select().from(conversations))[0];
    const command={action:"reply" as const,text:"Test reply",requestId:crypto.randomUUID(),expectedMessageId:receipt.messageId!,expectedUpdatedAt:c.updatedAt.toISOString(),status:"pending" as const};
    vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS","someone-else@example.com");await expect(ticketAction(c.id,command,staff)).rejects.toHaveProperty("status",403);
    vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS","internal@example.com");await ticketAction(c.id,{action:"note",text:"Changed",requestId:crypto.randomUUID()},staff);
    await expect(ticketAction(c.id,command,staff)).rejects.toHaveProperty("status",409);
    expect((await database.db.select().from(jobs)).some(j=>j.stage==="manual_send")).toBe(false);
  });
  it("applies persisted delay only before the first response",async()=>{
    const {saveSupportEmailTone}=await import("./support-email-tone");const staff=await createStaff();
    await saveSupportEmailTone({instructions:"Use we",avoidInstructions:"No filler",minDelayMinutes:7,maxDelayMinutes:7,version:0},staff);
    const now=Date.now();await service.receiveSupportEmail(input());await service.runSupportEmailJobs();
    let [job]=await database.db.select().from(jobs);expect(job.sendAfter.getTime()-now).toBeGreaterThanOrEqual(7*60000);expect(job.sendAfter.getTime()-now).toBeLessThan(7*60000+5000);
    expect(generate.mock.calls[0][1]).toContain("No filler");
    await database.rawSql`update support_email_conversations set first_replied_at=now()`;
    const second=await service.receiveSupportEmail(input("second-response"));
    [job]=await database.db.select().from(jobs).where((await import("drizzle-orm")).eq(jobs.messageId,second.messageId!));expect(job.sendAfter.getTime()).toBeLessThanOrEqual(Date.now());
  });
  it("publishes one shared knowledge source with draft isolation and conflict protection",async()=>{
    const {saveKnowledge,publishedKnowledge}=await import("./support-knowledge");const staff=await createStaff();
    const first=await saveKnowledge({title:"Shipping policy",content:"Approved shipping policy",category:"Shipping",channels:["email","webapp"],version:0,action:"publish"},staff);
    const next=await saveKnowledge({id:first.id,title:first.title,content:"Unpublished draft",category:first.category,channels:["email"],version:first.version,action:"save"},staff);
    expect((await publishedKnowledge("email"))[0].content).toBe("Approved shipping policy");expect((await publishedKnowledge("webapp"))[0].content).toBe("Approved shipping policy");
    await expect(saveKnowledge({id:first.id,title:first.title,content:"Conflict",category:first.category,channels:["email"],version:first.version,action:"publish"},staff)).rejects.toHaveProperty("status",409);
    await saveKnowledge({id:first.id,title:first.title,content:next.content,category:first.category,channels:["email"],version:next.version,action:"publish"},staff);
    expect(await publishedKnowledge("webapp")).toHaveLength(0);expect((await publishedKnowledge("email"))[0].content).toBe("Unpublished draft");
  });
  it("imports complete legacy conversations and stores attachments independently",async()=>{
    const {importFreshdeskTicket}=await import("./support-freshdesk-import");const download=vi.fn().mockResolvedValue(Buffer.from("attachment"));
    const ticket={id:555,subject:"Legacy case",description_text:"Original message",status:2,created_at:new Date(1000).toISOString(),updated_at:new Date(4000).toISOString(),requester:{email:"legacy@example.com",name:"Legacy"}};
    const history=[{id:77,body_text:"Private note",incoming:false,private:true,created_at:new Date(2000).toISOString(),attachments:[{id:11,name:"evidence.txt",content_type:"text/plain",size:10,attachment_url:"https://example.freshdesk.com/attachment"}]},{id:78,body_text:"Human response",incoming:false,private:false,created_at:new Date(3000).toISOString()}];
    await importFreshdeskTicket(ticket,history,download);await importFreshdeskTicket(ticket,history,download);
    expect(await database.db.select().from(conversations)).toHaveLength(1);expect(await database.db.select().from(messages)).toHaveLength(3);expect(await database.db.select().from(supportTicketAttachments)).toHaveLength(1);expect(download).toHaveBeenCalledTimes(1);
  });
  it("creates internal app tickets numbered above 10000 without calling Freshdesk",async()=>{
    vi.stubEnv("SUPPORT_TICKETING_BACKEND","internal");vi.stubGlobal("fetch",vi.fn());
    await database.db.insert(users).values({id:"internal-ticket-customer",email:"portal@example.com",name:"Portal"});
    const {createTicketForUser}=await import("./tickets");
    const result=await createTicketForUser({userId:"internal-ticket-customer",email:"portal@example.com",phone:null,name:"Portal",subject:"Please help",description:"Original customer text",kind:"support",clientRequestId:crypto.randomUUID()});
    expect(result.ok).toBe(true);const [c]=await database.db.select().from(conversations);expect(c.ticketNumber).toBeGreaterThanOrEqual(10000);expect(c.legacyTicketId).toBe(result.ok ? result.ticket.id : "");expect(c.source).toBe("webapp");expect(fetch).not.toHaveBeenCalled();
    const {getTicketQueue,getSupportStats}=await import("./support-desk");expect((await getTicketQueue()).tickets).toHaveLength(1);expect((await getSupportStats()).openTickets).toBe(1);expect(fetch).not.toHaveBeenCalled();
  });

  it("prioritizes the pilot recipient over blocked production mail",async()=>{
    vi.stubEnv("SUPPORT_EMAIL_MODE","pilot");
    for(let i=0;i<8;i++) await service.receiveSupportEmail({...input(`outside-${i}`),threadId:`outside-${i}`,from:{email:`customer${i}@example.com`,name:"Customer"}});
    await service.receiveSupportEmail({...input("pilot-last"),threadId:"pilot-last"});await service.runSupportEmailJobs();
    expect(generate).toHaveBeenCalledTimes(3);expect(generate.mock.calls[0][0].customerEmail).toBe("internal@example.com");
    const all=await database.db.select().from(jobs);expect(all.filter(j=>j.error==="pilot_recipient_not_allowed")).toHaveLength(0);
    expect(all.filter(j=>j.stage==="send"&&j.status==="queued")).toHaveLength(1);expect(all.filter(j=>j.stage==="send"&&j.status==="review")).toHaveLength(2);
  });
  it("rebinds a unique imported conversation to the provider thread without losing history",async()=>{
    const {importFreshdeskTicket}=await import("./support-freshdesk-import");
    const imported=await importFreshdeskTicket({id:888,subject:"Order question",description_text:"Old customer message",status:2,created_at:new Date(1000).toISOString(),updated_at:new Date(2000).toISOString(),requester:{email:"internal@example.com"}},[],vi.fn());
    const receipt=await service.receiveSupportEmail({...input("real-reply"),subject:"Re: Order question"});
    expect(receipt.conversationId).toBe(imported.id);expect(await database.db.select().from(conversations)).toHaveLength(1);expect(await database.db.select().from(messages)).toHaveLength(2);
  });
  it("blocks human and queued replies without an incoming email thread",async()=>{
    vi.stubEnv("SUPPORT_TICKETING_BACKEND","internal");vi.stubEnv("SUPPORT_EMAIL_MODE","pilot");
    const {importFreshdeskTicket}=await import("./support-freshdesk-import");
    const imported=await importFreshdeskTicket({id:999,subject:"Legacy support case",description_text:"Historical customer message",status:2,created_at:new Date(1000).toISOString(),updated_at:new Date(2000).toISOString(),requester:{email:"internal@example.com"}},[],vi.fn());
    const {ticketAction}=await import("./support-ticket-actions");const staff=await createStaff();
    const c=(await service.supportEmailDetails(imported.id)).conversation;const requestId=crypto.randomUUID();
    expect((await service.supportEmailDetails(c.id)).canDeliver).toBe(false);
    await expect(ticketAction(c.id,{action:"reply",text:"Cannot start a new thread",requestId,expectedMessageId:c.latestMessageId!,expectedUpdatedAt:c.updatedAt.toISOString(),status:"pending"},staff)).rejects.toHaveProperty("status",409);
    await database.db.insert(jobs).values({id:requestId,conversationId:c.id,messageId:c.latestMessageId!,stage:"manual_send",actorAdminId:staff.id,sendAfter:new Date(),draft:{tier:"T1",language:"en",intent:"other",needsHuman:true,reason:"Previously queued reply",reply:"Cannot start a new thread"}});
    vi.stubGlobal("fetch",vi.fn());await service.runSupportEmailJobs();
    expect(fetch).not.toHaveBeenCalled();expect((await database.db.select().from(jobs))[0]).toMatchObject({status:"blocked",error:"email_thread_required"});
    expect((await database.db.select().from(messages)).filter(m=>m.direction==="outgoing")).toHaveLength(0);
  });
  it("keeps incoming mail intact while a human reply sends in the same thread",async()=>{
    vi.stubEnv("SUPPORT_TICKETING_BACKEND","internal");vi.stubEnv("SUPPORT_EMAIL_MODE","pilot");
    const {ticketAction}=await import("./support-ticket-actions");const staff=await createStaff();
    const first=await service.receiveSupportEmail({...input("before-delivery"),subject:"Concurrent support case"});
    const c=(await service.supportEmailDetails(first.conversationId!)).conversation;const requestId=crypto.randomUUID();
    await ticketAction(c.id,{action:"reply",text:"How can we help?",requestId,expectedMessageId:c.latestMessageId!,expectedUpdatedAt:c.updatedAt.toISOString(),status:"pending"},staff);
    let started!:()=>void;const fetchStarted=new Promise<void>(resolve=>{started=resolve;});
    let release!:(response:Response)=>void;const acknowledgement=new Promise<Response>(resolve=>{release=resolve;});
    const send=vi.fn<typeof fetch>(()=>{started();return acknowledgement;});vi.stubGlobal("fetch",send);
    const delivery=service.runSupportEmailJobs();await fetchStarted;
    let intakeFinished=false;
    const intake=service.receiveSupportEmail({...input("during-delivery","I need more help"),subject:"Re: Concurrent support case"}).then(receipt=>{intakeFinished=true;return receipt;});
    await new Promise(resolve=>setTimeout(resolve,30));const serialized=!intakeFinished;
    release(Response.json({success:true,requestId,messageId:"sent-before-intake"}));
    const [,receipt]=await Promise.all([delivery,intake]);
    expect(serialized).toBe(true);expect(receipt.conversationId).toBe(c.id);
    const final=await service.supportEmailDetails(c.id);
    expect(final.conversation).toMatchObject({latestMessageId:receipt.messageId,threadId:"thread-1",ticketStatus:"open",requiresHuman:true});
    expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toMatchObject({event:"email.reply",threadId:"thread-1",inboundMessageId:"before-delivery"});
    expect(await database.db.select().from(conversations)).toHaveLength(1);
  });
  it("paginates older conversation history without dropping messages",async()=>{
    const receipt=await service.receiveSupportEmail(input());
    await database.db.insert(messages).values(Array.from({length:120},(_,i)=>({id:crypto.randomUUID(),conversationId:receipt.conversationId!,dedupeKey:`history-${i}`,providerMessageId:`history-${i}`,direction:"note",subject:"History",text:`Message ${i}`,createdAt:new Date(1000+i),receivedAt:new Date(1000+i)})));
    const first=await service.supportEmailDetails(receipt.conversationId!);const second=await service.supportEmailDetails(receipt.conversationId!,first.messages[0].id);
    expect(first.messages).toHaveLength(100);expect(first.hasMoreMessages).toBe(true);expect(second.messages).toHaveLength(21);expect(second.hasMoreMessages).toBe(false);expect(new Set([...first.messages,...second.messages].map(m=>m.id)).size).toBe(121);
  });

  const rejected = () => new EmailReplyRejected("Reply contains an unverified link", { tier: "T2", language: "en", intent: "cancel", needsHuman: false, reason: "", reply: "Use https://unverified.example" });
  const retryDue = () => database.db.update(jobs).set({ runAt: new Date(0) });
  it("regenerates after rejection with feedback on the second attempt", async () => {
    vi.stubGlobal("fetch", vi.fn());
    generate.mockRejectedValueOnce(rejected());
    await service.receiveSupportEmail(input("retry-feedback", "Please cancel my order"));
    await service.runSupportEmailJobs();
    expect((await database.db.select().from(jobs))[0]).toMatchObject({ stage: "prepare", status: "queued", attempts: 1, error: "reply_rejected: Reply contains an unverified link", draft: rejected().draft });
    await retryDue(); await service.runSupportEmailJobs();
    expect(generate.mock.calls[1][0].previousRejection).toEqual({ reason: rejected().reason, reply: rejected().draft.reply });
    expect((await database.db.select().from(jobs))[0]).toMatchObject({ stage: "send", status: "review", error: null });
    expect((await database.db.select().from(conversations))[0]).toMatchObject({ owner: "agent", requiresHuman: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["draft", "pilot", "live"])("keeps three rejections in review without sending in %s", async mode => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", mode); vi.stubGlobal("fetch", vi.fn());
    generate.mockRejectedValue(rejected());
    const receipt = await service.receiveSupportEmail(input());
    for (let attempt = 0; attempt < 3; attempt++) { await retryDue(); await service.runSupportEmailJobs(); }
    const [job] = await database.db.select().from(jobs);
    expect(job).toMatchObject({ stage: "send", status: "review", attempts: 3, error: "reply_rejected: Reply contains an unverified link", draft: rejected().draft });
    expect((await database.db.select().from(conversations))[0]).toMatchObject({ owner: "agent", requiresHuman: false, status: "draft_needs_review", escalationReason: rejected().reason });
    expect(generate.mock.calls[2][0].previousRejection).toEqual({ reason: rejected().reason, reply: rejected().draft.reply });
    await retryDue(); await service.runSupportEmailJobs();
    expect((await database.db.select().from(messages)).filter(m => m.direction === "outgoing")).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    if (mode === "draft") await expect(service.supportEmailAction(receipt.conversationId!, "approve", job.id)).rejects.toHaveProperty("status", 409);
    else {
      await service.supportEmailAction(receipt.conversationId!, "approve", job.id);
      expect((await database.db.select().from(jobs))[0]).toMatchObject({ stage: "send", status: "queued" });
    }
  });
  it("leaves exhausted generation errors retryable without human handoff", async () => {
    generate.mockRejectedValue(new Error("llm_http_503")); vi.stubGlobal("fetch", vi.fn());
    const receipt = await service.receiveSupportEmail(input());
    for (let attempt = 0; attempt < 3; attempt++) { await retryDue(); await service.runSupportEmailJobs(); }
    const [job] = await database.db.select().from(jobs);
    expect(job).toMatchObject({ stage: "prepare", status: "failed", attempts: 3, error: "generation_failed" });
    expect((await database.db.select().from(conversations))[0]).toMatchObject({ owner: "agent", requiresHuman: false, status: "generation_failed" });
    await service.supportEmailAction(receipt.conversationId!, "retry", job.id);
    generate.mockResolvedValue({ tier: "T1", language: "en", intent: "faq", needsHuman: false, reason: "", reply: "Thanks for your question." });
    await service.runSupportEmailJobs();
    expect((await database.db.select().from(jobs))[0]).toMatchObject({ stage: "send", status: "review", attempts: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the final attempt failure type after mixed rejection and transport failures", async () => {
    vi.stubGlobal("fetch", vi.fn());
    generate.mockRejectedValueOnce(rejected()).mockRejectedValue(new Error("llm_http_503"));
    await service.receiveSupportEmail(input());
    for (let attempt = 0; attempt < 3; attempt++) { await retryDue(); await service.runSupportEmailJobs(); }
    expect((await database.db.select().from(jobs))[0]).toMatchObject({ stage: "prepare", status: "failed", error: "generation_failed", draft: rejected().draft });
    expect((await database.db.select().from(conversations))[0]).toMatchObject({ owner: "agent", requiresHuman: false, status: "generation_failed" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps configuration errors blocked after three attempts", async () => {
    generate.mockRejectedValue(new Error("openai_not_configured"));
    await service.receiveSupportEmail(input());
    for (let attempt = 0; attempt < 3; attempt++) { await retryDue(); await service.runSupportEmailJobs(); }
    expect((await database.db.select().from(jobs))[0]).toMatchObject({ stage: "prepare", status: "blocked", error: "llm_configuration_missing" });
    expect((await database.db.select().from(conversations))[0]).toMatchObject({ owner: "agent", requiresHuman: false });
  });
  it("preserves takeover ownership on subsequent T1/T2 staff requests", async () => {
    const receipt = await service.receiveSupportEmail(input());
    await service.supportEmailAction(receipt.conversationId!, "takeover");
    await service.receiveSupportEmail(input("after-takeover", "Please update my shipping address"));
    expect((await database.db.select().from(conversations))[0]).toMatchObject({ owner: "human", requiresHuman: true, escalationReason: "Staff took over" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("bridges T1/T2 staff keywords as agent-owned but preserves refund, history and missing email flows", async () => {
    const { bridgeAppTicket } = await import("./support-ticket-bridge");
    const userId = crypto.randomUUID();
    await database.db.insert(users).values({ id: userId, email: "", name: "Bridge test" });
    for (const sample of [
      { subject: "Please update my shipping address", kind: "support", human: false },
      { subject: "Are there supplement interactions?", kind: "support", human: false },
      { subject: "Refund request", kind: "refund", human: true },
      { subject: "Historical address change", kind: "support", historical: true, human: true },
      { subject: "Help", kind: "support", email: "", human: true },
    ]) {
      const [ticket] = await database.db.insert(tickets).values({ id: crypto.randomUUID(), userId, subject: sample.subject, kind: sample.kind, email: sample.email ?? "bridge@example.com" }).returning();
      const c = await bridgeAppTicket(ticket, sample.subject, sample.historical);
      expect(c).toMatchObject({ owner: sample.human ? "human" : "agent", requiresHuman: sample.human });
    }
  });
  it("dry-runs maintenance selection and applies/reset jobs only to eligible handoffs", async () => {
    const { reprocessT1T2Handoffs } = await import("../../scripts/reprocess-t1-t2-handoffs");
    const userId = crypto.randomUUID();
    await database.db.insert(users).values({ id: userId, email: "maintenance@example.com", name: "Maintenance" });
    const [bridgeTicket] = await database.db.insert(tickets).values({ id: crypto.randomUUID(), userId, email: "maintenance@example.com", subject: "Support" }).returning();
    const [refundTicket] = await database.db.insert(tickets).values({ id: crypto.randomUUID(), userId, email: "maintenance@example.com", subject: "Refund", kind: "refund" }).returning();
    const [noEmailTicket] = await database.db.insert(tickets).values({ id: crypto.randomUUID(), userId, email: "", subject: "Support" }).returning();
    const eligibleIds: string[] = [];
    for (const sample of [
      { label: "native", tier: "T1", eligible: true },
      { label: "bridge", source: "webapp", legacyTicketId: bridgeTicket.id, local: true, eligible: true },
      { label: "T3", tier: "T3" },
      { label: "resolved", ticketStatus: "resolved" },
      { label: "closed", ticketStatus: "closed" },
      { label: "freshdesk", source: "freshdesk" },
      { label: "import-message", dedupe: "freshdesk-import:123" },
      { label: "import-metadata", freshdeskImportUpdatedAt: new Date() },
      { label: "takeover", escalationReason: "Staff took over" },
      { label: "local", local: true },
      { label: "legacy", legacyTicketId: "historical-legacy" },
      { label: "refund", source: "webapp", legacyTicketId: refundTicket.id, kind: "refund", local: true },
      { label: "no-email", source: "webapp", legacyTicketId: noEmailTicket.id, email: "", local: true },
      { label: "processing", processing: true },
      { label: "already-agent", requiresHuman: false },
      { label: "unknown", unknown: true },
      { label: "historical", direction: "note" },
    ]) {
      const id = crypto.randomUUID(), messageId = crypto.randomUUID();
      await database.db.insert(conversations).values({ id, mailboxId: "test", threadId: sample.local ? `local:${id}` : id, email: sample.email ?? "maintenance@example.com", subject: "Support", tier: sample.tier ?? "T2", source: sample.source ?? "email", legacyTicketId: sample.legacyTicketId, kind: sample.kind ?? "support", ticketStatus: sample.ticketStatus ?? "open", owner: "human", requiresHuman: sample.requiresHuman ?? true, escalationReason: sample.escalationReason ?? "Old handoff", latestMessageId: messageId, freshdeskImportUpdatedAt: sample.freshdeskImportUpdatedAt });
      await database.db.insert(messages).values({ id: messageId, conversationId: id, dedupeKey: sample.dedupe ?? id, providerMessageId: id, direction: sample.direction ?? "incoming", subject: "Support", text: "Help", receivedAt: new Date() });
      await database.db.insert(jobs).values({ id: crypto.randomUUID(), conversationId: id, messageId, stage: "escalate", status: sample.unknown ? "unknown" : sample.processing ? "processing" : "queued", sendAfter: new Date() });
      if (sample.eligible) eligibleIds.push(id);
      if (sample.label === "bridge") await database.db.insert(jobs).values({ id: crypto.randomUUID(), conversationId: id, messageId, stage: "prepare", status: "failed", attempts: 3, error: "old", sendAfter: new Date() });
    }
    const beforeConversations = await database.db.select().from(conversations);
    const beforeJobs = await database.db.select().from(jobs);
    const dryRun = await reprocessT1T2Handoffs(database.db);
    const expectedNumbers = beforeConversations.filter(c => eligibleIds.includes(c.id)).map(c => c.ticketNumber).sort((a, b) => a - b);
    expect(dryRun).toMatchObject({ apply: false, selected: 2, cancelledJobs: 0, insertedPrepareJobs: 0, resetPrepareJobs: 0, ticketNumbers: expectedNumbers });
    expect(await database.db.select().from(conversations)).toEqual(beforeConversations);
    expect(await database.db.select().from(jobs)).toEqual(beforeJobs);
    expect(await reprocessT1T2Handoffs(database.db, true)).toMatchObject({ apply: true, selected: 2, cancelledJobs: 2, insertedPrepareJobs: 1, resetPrepareJobs: 1, ticketNumbers: expectedNumbers });
    for (const c of await database.db.select().from(conversations)) {
      if (eligibleIds.includes(c.id)) expect(c).toMatchObject({ owner: "agent", requiresHuman: false, status: "queued", escalationReason: null });
      else expect(c).toEqual(beforeConversations.find(previous => previous.id === c.id));
    }
    const afterJobs = await database.db.select().from(jobs);
    for (const id of eligibleIds) {
      expect(afterJobs.find(j => j.conversationId === id && j.stage === "escalate")).toMatchObject({ status: "cancelled", error: "reprocess_t1_t2" });
      expect(afterJobs.find(j => j.conversationId === id && j.stage === "prepare")).toMatchObject({ status: "queued", attempts: 0, error: null });
    }
    expect((await reprocessT1T2Handoffs(database.db, true)).selected).toBe(0);
  });

});
