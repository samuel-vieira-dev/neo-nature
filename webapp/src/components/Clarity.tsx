import Script from "next/script";

/** Microsoft Clarity project id (public — it ships in the page source). */
const CLARITY_PROJECT_ID = "y4d30a9nbt";

export default function Clarity() {
  // Skip on dev/preview so local browsing doesn't show up as real sessions.
  if (process.env.NODE_ENV !== "production") return null;

  return (
    <Script
      id="ms-clarity"
      strategy="afterInteractive"
      src={`https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`}
    />
  );
}
