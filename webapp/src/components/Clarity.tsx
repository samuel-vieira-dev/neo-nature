import Script from "next/script";

/** Microsoft Clarity project id (public — it ships in the page source). */
const CLARITY_PROJECT_ID = "y4d30a9nbt";

export default function Clarity() {
  // Skip on dev/preview so local browsing doesn't show up as real sessions.
  if (process.env.NODE_ENV !== "production") return null;

  // Official inline bootstrap: defines the window.clarity queue stub, then
  // loads the tag. The tag script requires the stub to exist — loading it
  // via a plain src throws before Clarity starts.
  return (
    <Script
      id="ms-clarity"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`,
      }}
    />
  );
}
