/* SO-101 blueprint viewer: the real URDF drawn as hidden-line edges, with joint rings
   and labels on an SVG overlay. Joint angles come from a source (see sources.js). */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import URDFLoader from "urdf-loader";

const DRACO_PATH = "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/";
const LABELLED = [ // URDF joint, label, label offset from the ring (px)
  ["shoulder_pan", "J1", [-26, 4]],
  ["shoulder_lift", "J2", [11, -9]],
  ["elbow_flex", "J3", [11, -9]],
  ["wrist_flex", "J4", [11, -9]],
  ["wrist_roll", "J5", [11, -9]]
];
const EDGE_ANGLE = 28;      // degrees between faces before an edge is drawn
const OUTLINE_PX = 1;       // silhouette width in CSS pixels
const MAX_PIXEL_RATIO = 1.5;
const HOVER_RADIUS = 18;    // px around a ring that counts as "on the joint"
const AUTO_ROTATE_SPEED = 0.5; // ~2 min per turn
const AUTO_ROTATE_RESUME_MS = 4000;
const SVG_NS = "http://www.w3.org/2000/svg";

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export async function createScene(host, { urdf, source, statusEl, onError }) {
  /* ---------- DOM ---------- */
  const wrap = document.createElement("div");
  wrap.className = "viz";
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Interactive 3D model of the SO-101 follower arm");
  const overlay = document.createElementNS(SVG_NS, "svg");
  overlay.setAttribute("class", "viz-overlay");
  overlay.setAttribute("aria-hidden", "true");
  const tip = document.createElement("div");
  tip.className = "viz-tip";
  tip.hidden = true;
  wrap.append(canvas, overlay, tip);

  /* ---------- Scene ---------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  // Hidden-line look: faces in the background colour hide what's behind them, feature edges
  // are drawn as lines, and an inverted hull (back faces pushed out along their normals by a
  // fixed number of pixels) supplies the silhouette that feature edges miss on curved parts.
  const fillMat = new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const lineMat = new THREE.LineBasicMaterial();
  const outlineMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { color: { value: new THREE.Color() }, width: { value: 1 }, resolution: { value: new THREE.Vector2(1, 1) } },
    vertexShader: `
      uniform float width;
      uniform vec2 resolution;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec2 dir = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
        if (dot(dir, dir) > 0.0) clip.xy += normalize(dir) * width * 2.0 / resolution * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`
  });
  function applyTheme() {
    fillMat.color.setStyle(cssVar("--panel-2"));
    lineMat.color.setStyle(cssVar("--cyan"));
    outlineMat.uniforms.color.value.setStyle(cssVar("--cyan"));
  }
  applyTheme();

  /* ---------- Robot ---------- */
  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  const gltf = new GLTFLoader().setDRACOLoader(draco);
  const geometries = new Map(); // one decode per file; the servo mesh is used 6×
  const pending = [];
  const loader = new URDFLoader();
  loader.loadMeshCb = (path, manager, material, done) => {
    if (!geometries.has(path)) {
      geometries.set(path, gltf.loadAsync(path).then((g) => {
        let geometry = null;
        g.scene.traverse((o) => { if (o.isMesh && !geometry) geometry = o.geometry; });
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        return { geometry, edges: new THREE.EdgesGeometry(geometry, EDGE_ANGLE) };
      }));
    }
    pending.push(geometries.get(path).then(({ geometry, edges }) => {
      const mesh = new THREE.Mesh(geometry, fillMat);
      mesh.add(new THREE.Mesh(geometry, outlineMat), new THREE.LineSegments(edges, lineMat));
      done(mesh);
    }));
  };
  let robot;
  try {
    robot = await loader.loadAsync(urdf);
    await Promise.all(pending);
  } catch (err) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw err;
  } finally {
    draco.dispose();
  }
  robot.rotation.x = -Math.PI / 2; // URDF is Z-up
  scene.add(robot);

  /* ---------- Joint rings & labels ---------- */
  const rings = LABELLED.map(([name, label, [dx, dy]]) => {
    const g = document.createElementNS(SVG_NS, "g");
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("r", "7");
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", dx);
    t.setAttribute("y", dy);
    t.textContent = label;
    g.append(c, t);
    overlay.appendChild(g);
    return { name, label, joint: robot.joints[name], el: g, x: 0, y: 0 };
  });

  /* ---------- Camera & controls ---------- */
  function applyAngles(angles) {
    if (!angles) return;
    for (const name in angles) if (robot.joints[name]) robot.setJointValue(name, angles[name]);
  }
  await source.start();
  applyAngles(source.read(0));
  robot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(robot);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const fitDistance = 0.95 * sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  const target = sphere.center.clone();
  camera.position.copy(target).add(new THREE.Vector3(0.75, 0.45, 0.9).normalize().multiplyScalar(fitDistance));
  camera.lookAt(target);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enablePan = false;
  controls.enableZoom = false; // turned on once the visitor grabs the model, so page scrolling isn't hijacked
  controls.enableDamping = true;
  controls.minDistance = fitDistance * 0.55;
  controls.maxDistance = fitDistance * 1.5;
  controls.minPolarAngle = 0.12 * Math.PI;
  controls.maxPolarAngle = 0.55 * Math.PI;
  controls.autoRotate = true;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  canvas.style.touchAction = "pan-y"; // one-finger vertical swipes still scroll the page
  let resumeTimer = 0;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
  });
  controls.addEventListener("end", () => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { controls.autoRotate = true; }, AUTO_ROTATE_RESUME_MS);
  });
  canvas.addEventListener("pointerdown", () => { controls.enableZoom = true; });
  canvas.addEventListener("pointerleave", () => { controls.enableZoom = false; });

  /* ---------- Hover ---------- */
  let hovered = null, tipTimer = 0, downAt = null;
  function nearestRing(x, y) {
    let best = null, bestD = HOVER_RADIUS;
    for (const r of rings) {
      const d = Math.hypot(r.x - x, r.y - y);
      if (d < bestD) { best = r; bestD = d; }
    }
    return best;
  }
  function setHovered(r) {
    if (hovered === r) return;
    if (hovered) hovered.el.classList.remove("hot");
    hovered = r;
    if (r) r.el.classList.add("hot");
    tip.hidden = !r;
    canvas.style.cursor = r ? "help" : "";
  }
  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || e.buttons) return;
    setHovered(nearestRing(...localPoint(e)));
  });
  canvas.addEventListener("pointerleave", () => { if (!tipTimer) setHovered(null); });
  // Touch: a tap (not a drag) on a joint shows its readout for a moment
  canvas.addEventListener("pointerdown", (e) => { downAt = localPoint(e); });
  canvas.addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse" || !downAt) return;
    const [x, y] = localPoint(e);
    if (Math.hypot(x - downAt[0], y - downAt[1]) > 8) return;
    const r = nearestRing(x, y);
    clearTimeout(tipTimer);
    setHovered(r);
    tipTimer = r ? setTimeout(() => { tipTimer = 0; setHovered(null); }, 2500) : 0;
  });

  /* ---------- Layout ---------- */
  let width = 0, height = 0;
  function resize() {
    width = wrap.clientWidth;
    height = wrap.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    renderer.getDrawingBufferSize(outlineMat.uniforms.resolution.value);
    outlineMat.uniforms.width.value = OUTLINE_PX * renderer.getPixelRatio();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  const resizeObs = new ResizeObserver(resize);
  resizeObs.observe(wrap);

  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- Loop ---------- */
  const v = new THREE.Vector3();
  function drawOverlay() {
    for (const r of rings) {
      r.joint.getWorldPosition(v).project(camera);
      r.x = (v.x + 1) / 2 * width;
      r.y = (1 - v.y) / 2 * height;
      r.el.setAttribute("transform", `translate(${r.x.toFixed(1)} ${r.y.toFixed(1)})`);
    }
    if (hovered) {
      const deg = THREE.MathUtils.radToDeg(hovered.joint.angle);
      tip.textContent = `${hovered.label} · ${hovered.name}  ${deg >= 0 ? "+" : "−"}${Math.abs(deg).toFixed(1)}°`;
      tip.style.transform = `translate(${hovered.x}px, ${hovered.y}px)`;
    }
  }

  const clock = new THREE.Clock(false);
  let elapsed = 0, raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    applyAngles(source.read(elapsed));
    controls.update(dt);
    renderer.render(scene, camera);
    drawOverlay();
  }

  function setSource(next) {
    source.stop();
    source = next;
    elapsed = 0;
    if (statusEl) statusEl.textContent = source.label || "";
    return Promise.resolve(source.start());
  }
  if (statusEl) statusEl.textContent = source.label || "";

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    if (onError) onError(new Error("WebGL context lost"));
  });

  host.appendChild(wrap);
  resize();

  return {
    setRunning(on) {
      if (on && !raf) {
        clock.start();
        raf = requestAnimationFrame(frame);
      } else if (!on && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        clock.stop();
      }
    },
    setSource,
    dispose() {
      this.setRunning(false);
      source.stop();
      clearTimeout(resumeTimer);
      clearTimeout(tipTimer);
      resizeObs.disconnect();
      themeObs.disconnect();
      controls.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      fillMat.dispose();
      lineMat.dispose();
      outlineMat.dispose();
      renderer.dispose();
      wrap.remove();
      if (statusEl) statusEl.textContent = "";
    }
  };
}
