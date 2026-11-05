/**
 * App-wide light/dark theme, shared by the root layout (server) and lib/theme.ts (client).
 * The preference lives in this device's localStorage ("system" follows the OS); the
 * resolved theme is written to <html data-theme>. THEME_SCRIPT runs inline in <head>
 * so the first paint already uses the right theme.
 */
export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";
export const THEME_KEY = "nn:theme";
export const THEME_COLORS: Record<Theme, string> = { light: "#ffffff", dark: "#0e1411" };

export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",d?"${THEME_COLORS.dark}":"${THEME_COLORS.light}");}catch(e){}})();`;

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
