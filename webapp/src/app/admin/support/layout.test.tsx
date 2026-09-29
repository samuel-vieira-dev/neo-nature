import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAdminUser: vi.fn() }));
vi.mock("@/server/admin", () => ({ getAdminUser: mocks.getAdminUser }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import AreaLayout from "./layout";

beforeEach(() => vi.resetAllMocks());

describe("Support layout", () => {
  it("renders for Tauk without Customer 360 permission", async () => {
    mocks.getAdminUser.mockResolvedValue({ role: "tauk" });
    const children = "Support content";
    expect(await AreaLayout({ children })).toBe(children);
  });

  it("redirects unauthenticated visitors", async () => {
    mocks.getAdminUser.mockResolvedValue(null);
    await expect(AreaLayout({ children: "Support content" })).rejects.toThrow("redirect:/api/auth/admin-logout");
  });
});
