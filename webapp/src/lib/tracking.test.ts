import { describe, it, expect, vi, afterEach } from "vitest";
import { buildTrackingUrl } from "./tracking";

describe("buildTrackingUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("falls back to 17TRACK's public lookup when no branded page is configured", () => {
    expect(buildTrackingUrl("GM5453696800124591")).toBe("https://t.17track.net/en#nums=GM5453696800124591");
  });

  it("uses the brand's own tracking page once TRACKING_URL_TEMPLATE is set", () => {
    vi.stubEnv("TRACKING_URL_TEMPLATE", "https://neonature.17track.net/en?nums={code}");
    expect(buildTrackingUrl("GM5453696800124591")).toBe("https://neonature.17track.net/en?nums=GM5453696800124591");
  });

  it("ignores a template missing the {code} placeholder rather than linking to a blank lookup", () => {
    vi.stubEnv("TRACKING_URL_TEMPLATE", "https://neonature.17track.net/en");
    expect(buildTrackingUrl("ABC123")).toBe("https://t.17track.net/en#nums=ABC123");
  });

  it("escapes tracking numbers so they can't break out of the URL", () => {
    vi.stubEnv("TRACKING_URL_TEMPLATE", "https://neonature.17track.net/en?nums={code}");
    expect(buildTrackingUrl("A B&x=1")).toBe("https://neonature.17track.net/en?nums=A%20B%26x%3D1");
  });
});
