import { describe, expect, it } from "vitest";
import { isResolvedTicketStatus, resolvedAtFor } from "./support-ticket-resolution";

describe("ticket resolution time", () => {
  it("treats resolved and closed as resolved", () => {
    expect(["resolved", "closed"].every(isResolvedTicketStatus)).toBe(true);
    expect(["new", "open", "pending", "on_hold"].some(isResolvedTicketStatus)).toBe(false);
  });

  it("stamps on resolution and clears on reopen", () => {
    expect(resolvedAtFor("closed")).not.toBeNull();
    expect(resolvedAtFor("pending")).toBeNull();
    expect(resolvedAtFor("open")).toBeNull();
  });
});
