import { describe, expect, it } from "vitest";
import { THEME_COLORS, THEME_KEY, THEME_SCRIPT, resolveTheme } from "./theme-script";

function runScript(stored: string | null, systemDark: boolean) {
  const attrs: Record<string, string> = {};
  const metas = [{ content: "", setAttribute(_: string, v: string) { this.content = v; } }];
  const env = {
    localStorage: { getItem: (k: string) => (k === THEME_KEY ? stored : null) },
    matchMedia: () => ({ matches: systemDark }),
    document: { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } }, querySelectorAll: () => metas },
  };
  new Function("localStorage", "matchMedia", "document", THEME_SCRIPT)(env.localStorage, env.matchMedia, env.document);
  return { theme: attrs["data-theme"], meta: metas[0].content };
}

describe("theme", () => {
  it("resolves the preference against the system setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("applies the stored theme before paint", () => {
    expect(runScript(null, true)).toEqual({ theme: "dark", meta: THEME_COLORS.dark });
    expect(runScript("light", true)).toEqual({ theme: "light", meta: THEME_COLORS.light });
    expect(runScript("dark", false)).toEqual({ theme: "dark", meta: THEME_COLORS.dark });
    expect(runScript("bogus", false)).toEqual({ theme: "light", meta: THEME_COLORS.light });
  });
});
