/**
 * Inline <head> script that runs before first paint. Rendered as text/plain on the client so
 * React does not warn about (or re-run) it when it re-renders the document.
 */
export default function InlineScript({ html }: { html: string }) {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
