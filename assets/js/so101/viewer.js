/* Entry point for the "Now Building" 3D view. Keeps the SVG schematic unless WebGL works,
   the visitor doesn't prefer reduced motion, and the model actually loads. three.js and the
   meshes are only fetched once the card is about to scroll into view. */
const VERSION = "5"; // bump together with the ?v= on this script in index.html
const URDF_URL = "assets/so101/so101.urdf";

const host = document.querySelector(".now-visual");
const statusEl = document.getElementById("viz-status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) {
    return false;
  }
}

if (host && "IntersectionObserver" in window && "ResizeObserver" in window &&
    HTMLScriptElement.supports && HTMLScriptElement.supports("importmap") &&
    !reducedMotion.matches && webglAvailable()) {
  let viewer = null, loading = false, visible = false;

  function fallback(err) {
    if (err) console.warn("SO-101 viewer unavailable, showing the schematic instead:", err);
    nearObs.disconnect();
    visibleObs.disconnect();
    if (viewer) viewer.dispose();
    viewer = null;
    host.classList.remove("is-3d");
  }

  async function load() {
    loading = true;
    try {
      const [{ createScene }, { createIdleSource }] = await Promise.all([
        import(`./scene.js?v=${VERSION}`),
        import(`./sources.js?v=${VERSION}`)
      ]);
      viewer = await createScene(host, { urdf: URDF_URL, source: createIdleSource(), statusEl, onError: fallback });
      host.classList.add("is-3d");
      viewer.setRunning(visible);
    } catch (err) {
      fallback(err);
    }
  }

  // Start downloading a little before the card is on screen…
  const nearObs = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loading) {
      nearObs.disconnect();
      load();
    }
  }, { rootMargin: "300px 0px" });
  // …but only render while it's actually visible.
  const visibleObs = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (viewer) viewer.setRunning(visible);
  });
  nearObs.observe(host);
  visibleObs.observe(host);

  reducedMotion.addEventListener("change", (e) => { if (e.matches) fallback(); });
}
