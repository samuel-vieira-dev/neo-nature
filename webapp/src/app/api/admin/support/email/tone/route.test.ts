import { afterEach, expect, it, vi } from "vitest";
const { session, staff, save, read } = vi.hoisted(() => ({ session: vi.fn(), staff: vi.fn(), save: vi.fn(), read: vi.fn() }));
vi.mock("@/server/session", () => ({ adminSessionUserId: session, destroyAdminSession: vi.fn() }));
vi.mock("@/db", () => ({ db: { query: { adminUsers: { findFirst: staff } } } }));
vi.mock("@/server/support-email-tone", async original => ({ ...await original<typeof import("@/server/support-email-tone")>(), readSupportEmailTone: read, saveSupportEmailTone: save }));
import { GET, PUT } from "./route";
afterEach(() => vi.resetAllMocks());
const request = (instructions = "Use we", version = 0) => new Request("https://example.com/api/admin/support/email/tone", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructions, version }) });
it("rejects anonymous and inactive staff without saving", async () => {
  session.mockResolvedValue(null);
  expect((await PUT(request())).status).toBe(403);
  session.mockResolvedValue("staff"); staff.mockResolvedValue({ id: "staff", role: "cs", active: false });
  expect((await PUT(request())).status).toBe(403);
  expect(save).not.toHaveBeenCalled();
});
it.each(["admin", "cs"])("allows %s to edit voice", async role => {
  session.mockResolvedValue("staff"); staff.mockResolvedValue({ id: "staff", role, active: true });
  save.mockResolvedValue({ instructions: "Use we", version: 1 });
  expect((await PUT(request())).status).toBe(200);
  expect(save).toHaveBeenCalledWith({ instructions: "Use we", version: 0 }, expect.objectContaining({ role }));
});
it("allows read-only support to view but not save", async () => {
  session.mockResolvedValue("staff"); staff.mockResolvedValue({ id: "staff", role: "tauk", active: true });
  read.mockResolvedValue({ instructions: "", version: 0 });
  expect((await GET()).status).toBe(200);
  expect((await PUT(request())).status).toBe(403);
  expect(save).not.toHaveBeenCalled();
});
it("rejects oversized instructions before saving", async () => {
  session.mockResolvedValue("staff"); staff.mockResolvedValue({ id: "staff", role: "cs", active: true });
  expect((await PUT(request("x".repeat(4001)))).status).toBe(400);
  expect(save).not.toHaveBeenCalled();
});
