/**
 * Self-heals the "page rendered with no CSS" failure.
 *
 * Every build names its CSS chunk by content hash, and the prerendered HTML
 * points at that exact file. During a Railway rollout the old and new
 * containers can briefly answer requests for the same visitor, so the HTML
 * from one build asks for a stylesheet only the other build has — a plain
 * 404, and the visitor sees unstyled markup (seen on /admin-login and by
 * customers). railway.json now avoids the overlap; this is the belt to that
 * suspenders: if any stylesheet fails to load, reload the page once so the
 * second request lands on a single consistent build.
 *
 * Two detection paths, because timing varies: a capture-phase `error`
 * listener catches failures that happen after this script runs, and the
 * `load` check catches ones that already failed before it (a failed <link>
 * has `sheet === null` once the page has finished loading). Loop-guarded via
 * sessionStorage so a genuinely missing stylesheet reloads at most once a
 * minute instead of forever.
 *
 * Inline and dependency-free on purpose: it has to work precisely when the
 * rest of the bundle may be the thing that's broken.
 */
const GUARD = `(function(){
var KEY="nn:css-reload";
function reloadOnce(){
  try{
    var last=Number(sessionStorage.getItem(KEY)||0);
    if(Date.now()-last<60000)return;
    sessionStorage.setItem(KEY,String(Date.now()));
  }catch(e){}
  location.reload();
}
function isStylesheet(el){return !!el&&el.tagName==="LINK"&&el.rel==="stylesheet"&&!el.disabled;}
window.addEventListener("error",function(e){if(isStylesheet(e.target))reloadOnce();},true);
window.addEventListener("load",function(){
  var links=document.querySelectorAll('link[rel="stylesheet"]');
  for(var i=0;i<links.length;i++){if(isStylesheet(links[i])&&!links[i].sheet){reloadOnce();return;}}
});
})();`;

export default function StylesheetGuard() {
  return <script id="nn-stylesheet-guard" dangerouslySetInnerHTML={{ __html: GUARD }} />;
}
