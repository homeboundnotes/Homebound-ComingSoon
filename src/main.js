import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

// ---------------------------------------------------------------- constants

const BRAND = {
  green: 0x3a4f3c,
  cream: 0xebdbc5,
  maroon: 0x550c18,
  purple: 0x89608e,
  orange: 0xf96900,
  ink: 0x202b21,
};

// book dimensions (spine sits on -x edge, book lies flat in xz plane)
const BOOK = {
  w: 1.05, // spine → fore edge
  d: 1.45, // head → tail
  coverT: 0.024,
  pageH: 0.105,
  overhang: 0.05,
};
BOOK.h = BOOK.pageH + BOOK.coverT * 2;

const STACK = [
  // bottom → top
  { color: BRAND.purple, mark: "light" },
  { color: BRAND.orange, mark: "light" },
  { color: BRAND.maroon, mark: "light" },
  { color: BRAND.cream, mark: "dark" },
  { color: BRAND.green, mark: "light" },
];

// Fixed per-color landing nuances. These are deliberately tiny and blend in
// only near center, preserving a shared optical anchor without cloned poses.
const LANDING_POSES = [
  { x: -0.018, y: 0.006, pitch: 0.008, yaw: -0.26, roll: 0.012, phase: 0.6 },
  { x: 0.016, y: -0.008, pitch: -0.006, yaw: 0.18, roll: -0.01, phase: 1.4 },
  { x: -0.01, y: -0.004, pitch: 0.004, yaw: -0.12, roll: 0.008, phase: 2.2 },
  { x: 0.022, y: 0.008, pitch: -0.008, yaw: 0.24, roll: -0.012, phase: 3.1 },
  { x: 0.006, y: 0.002, pitch: 0.003, yaw: -0.2, roll: -0.005, phase: 0 },
];

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

// ---------------------------------------------------------------- textures

function paperEdgeTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 160;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f2e8d5";
  ctx.fillRect(0, 0, c.width, c.height);
  // stacked-page lines with slight waviness
  for (let y = 2; y < c.height; y += 5) {
    const tone = 148 + Math.floor(Math.random() * 52);
    ctx.strokeStyle = `rgba(${tone},${tone - 10},${tone - 32},0.85)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const yy = y + Math.random() * 2;
    ctx.moveTo(0, yy);
    for (let x = 0; x <= c.width; x += 8) {
      ctx.lineTo(x, yy + (Math.random() - 0.5) * 1.8);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function paperTopTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f7f0e3";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const tone = 225 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgba(${tone},${tone - 5},${tone - 20},0.35)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function coverBumpTexture() {
  // subtle woven/linen grain for the cloth covers
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 2) {
    ctx.fillStyle = `rgba(${100 + Math.random() * 56},${
      100 + Math.random() * 56
    },${100 + Math.random() * 56},0.5)`;
    ctx.fillRect(0, y, 512, 1);
  }
  for (let x = 0; x < 512; x += 2) {
    ctx.fillStyle = `rgba(${100 + Math.random() * 56},${
      100 + Math.random() * 56
    },${100 + Math.random() * 56},0.35)`;
    ctx.fillRect(x, 0, 1, 512);
  }
  for (let i = 0; i < 900; i++) {
    const g = 90 + Math.random() * 80;
    ctx.fillStyle = `rgba(${g},${g},${g},0.4)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 8;
  return tex;
}

function contactShadowTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
  gradient.addColorStop(0, "rgba(32,43,33,0.5)");
  gradient.addColorStop(0.48, "rgba(32,43,33,0.22)");
  gradient.addColorStop(1, "rgba(32,43,33,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const edgeTex = paperEdgeTexture();
const topTex = paperTopTexture();
const bumpTex = coverBumpTexture();
const shadowTex = contactShadowTexture();

const texLoader = new THREE.TextureLoader();
// note: the export names refer to the background they sit on —
// "Full Logo - Dark.png" is the cream logo, "Full Logo - Light.png" the green
const markTextures = {
  light: texLoader.load("/brand/full-logo-dark.png", (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  }),
  dark: texLoader.load("/brand/full-logo-light.png", (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  }),
};

// ---------------------------------------------------------------- book

function coverMaterial(color) {
  // pre-compensate the albedo so the lit, tone-mapped cover face renders at
  // the true brand hex rather than a lifted, desaturated version of it
  const c = new THREE.Color(color);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(hsl.s * 1.35, 1), hsl.l * 0.68);
  return new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.68,
    metalness: 0,
    bumpMap: bumpTex,
    bumpScale: 0.45,
    sheen: 0.1,
    sheenRoughness: 0.9,
    sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.25),
    specularIntensity: 0.22,
    vertexColors: true,
  });
}

// gentle dome so cover normals vary and pick up the light gradient —
// board covers are never dead flat
function domeCover(geo, w, d, amount) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const nx = THREE.MathUtils.clamp(pos.getX(i) / (w / 2), -1, 1);
    const nz = THREE.MathUtils.clamp(pos.getZ(i) / (d / 2), -1, 1);
    pos.setY(i, pos.getY(i) + amount * (1 - nx * nx) * (1 - nz * nz));
  }
  geo.computeVertexNormals();
  return geo;
}

// vertex-color edge wear: cloth lightens where hands and shelves rub it —
// along cover edges and corners
function applyEdgeWear(geo, w, d) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(pos.getX(i)) / (w / 2);
    const nz = Math.abs(pos.getZ(i)) / (d / 2);
    const edge = THREE.MathUtils.smoothstep(Math.max(nx, nz), 0.9, 1);
    const v = 0.965 + edge * 0.05 + (Math.random() - 0.5) * 0.006;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = v;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function makeBook(spec) {
  const g = new THREE.Group();
  const { w, d, coverT, pageH } = BOOK;
  const covMat = coverMaterial(spec.color);
  const h = pageH + coverT * 2;

  // board covers, flush with the page block (stab binding) — front bows
  // slightly outward, back presses gently the other way
  const frontGeo = domeCover(
    applyEdgeWear(new RoundedBoxGeometry(w, coverT, d, 2, 0.007), w, d),
    w,
    d,
    0.004
  );
  const backGeo = domeCover(
    applyEdgeWear(new RoundedBoxGeometry(w, coverT, d, 2, 0.007), w, d),
    w,
    d,
    -0.003
  );
  const front = new THREE.Mesh(frontGeo, covMat);
  front.position.set(0, pageH / 2 + coverT / 2, 0);
  const back = new THREE.Mesh(backGeo, covMat);
  back.position.set(0, -pageH / 2 - coverT / 2, 0);

  // page block — spine edge left exposed, as in stab binding
  const sideMat = new THREE.MeshStandardMaterial({
    map: edgeTex,
    roughness: 0.92,
  });
  const flatMat = new THREE.MeshStandardMaterial({
    map: topTex,
    roughness: 0.95,
  });
  // page block bows slightly outward at mid-height — stacks of paper
  // are never perfect rectangles
  const pagesGeo = new THREE.BoxGeometry(w - 0.008, pageH, d - 0.008, 1, 6, 1);
  {
    const pos = pagesGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / (pageH / 2);
      const f = 1 - t * t;
      pos.setX(i, pos.getX(i) * (1 + 0.018 * f));
      pos.setZ(i, pos.getZ(i) * (1 + 0.012 * f));
    }
    pagesGeo.computeVertexNormals();
  }
  const pages = new THREE.Mesh(pagesGeo, [
    sideMat, // +x fore edge
    sideMat, // -x spine edge
    flatMat, // +y
    flatMat, // -y
    sideMat, // +z head
    sideMat, // -z tail
  ]);

  // a couple of loose top sheets peeking past the block under the cover
  const sheetGeo = new THREE.BoxGeometry(w - 0.002, 0.0014, d - 0.002);
  for (let i = 0; i < 2; i++) {
    const sheet = new THREE.Mesh(sheetGeo, flatMat);
    sheet.position.set(
      0.004 + i * 0.003,
      pageH / 2 - 0.0025 - i * 0.002,
      (Math.random() - 0.5) * 0.006
    );
    sheet.rotation.y = (Math.random() - 0.5) * 0.02;
    g.add(sheet);
  }

  // japanese stab stitching along the spine edge — thread stays tone-on-tone
  // with the cover: a couple of shades lighter on dark covers, darker on light
  const threadColor = new THREE.Color(spec.color);
  const hsl = {};
  threadColor.getHSL(hsl);
  threadColor.offsetHSL(0, -0.08, hsl.l > 0.6 ? -0.16 : 0.17);
  const threadMat = new THREE.MeshStandardMaterial({
    color: threadColor,
    roughness: 0.7,
  });
  const stitches = new THREE.Group();
  const m = 0.1; // hole distance from the spine edge
  const holeX = -w / 2 + m;
  const holes = 5;
  const endM = 0.14;
  const zs = [];
  for (let i = 0; i < holes; i++) {
    zs.push(THREE.MathUtils.lerp(-d / 2 + endM, d / 2 - endM, i / (holes - 1)));
  }
  const tR = 0.0055; // thread radius — round profile, like real linen thread
  const surfY = h / 2 + tR - 0.0015;
  const jig = () => (Math.random() - 0.5) * 0.006; // hand-sewn imperfection

  const threadAlong = (len, axis) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(tR, tR, len, 10),
      threadMat
    );
    if (axis === "x") mesh.rotation.z = Math.PI / 2;
    if (axis === "z") mesh.rotation.x = Math.PI / 2;
    return mesh;
  };

  zs.forEach((z) => {
    // wrap over the spine edge at each hole: top run, spine face, bottom run
    const zz = z + jig();
    const runTop = threadAlong(m + tR * 2, "x");
    runTop.position.set(-w / 2 + m / 2, surfY, zz);
    runTop.rotation.y = jig() * 4;
    const runBottom = threadAlong(m + tR * 2, "x");
    runBottom.position.set(-w / 2 + m / 2, -surfY, zz + jig());
    const spineFace = threadAlong(h + tR * 2, "y");
    spineFace.position.set(-w / 2 - tR + 0.0015, 0, zz);
    stitches.add(runTop, runBottom, spineFace);
  });

  // running thread connecting the holes, top and bottom
  const span = zs[zs.length - 1] - zs[0];
  const lineTop = threadAlong(span, "z");
  lineTop.position.set(holeX + jig(), surfY, 0);
  const lineBottom = threadAlong(span, "z");
  lineBottom.position.set(holeX + jig(), -surfY, 0);
  stitches.add(lineTop, lineBottom);

  // corner wraps around the head and tail edges at the end holes
  [zs[0], zs[zs.length - 1]].forEach((z, i) => {
    const sign = i === 0 ? -1 : 1;
    const edgeZ = (sign * d) / 2;
    const len = Math.abs(edgeZ - z);
    const cornerTop = threadAlong(len + tR, "z");
    cornerTop.position.set(holeX + jig(), surfY, z + (sign * len) / 2);
    const cornerBottom = threadAlong(len + tR, "z");
    cornerBottom.position.set(holeX + jig(), -surfY, z + (sign * len) / 2);
    const endFace = threadAlong(h + tR * 2, "y");
    endFace.position.set(holeX, 0, edgeZ + sign * (tR - 0.0015));
    stitches.add(cornerTop, cornerBottom, endFace);
  });

  // the binder's knot — tied off at the second hole
  const knotZ = zs[1] + jig();
  const knot = new THREE.Mesh(
    new THREE.SphereGeometry(0.0085, 10, 8),
    threadMat
  );
  knot.position.set(holeX, surfY + 0.001, knotZ);
  knot.scale.y = 0.7;
  stitches.add(knot);

  // full logo printed near the bottom-right corner of the front cover
  const markW = 0.42;
  const markH = markW * (162 / 1200);
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(markW, markH),
    new THREE.MeshStandardMaterial({
      map: markTextures[spec.mark],
      transparent: true,
      roughness: 0.85,
      opacity: 0.88,
      // pressed into the cloth like a blind deboss rather than printed on
      bumpMap: markTextures[spec.mark],
      bumpScale: -0.6,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(
    w / 2 - markW / 2 - 0.09,
    pageH / 2 + coverT + 0.002,
    d / 2 - markH / 2 - 0.1
  );

  g.add(front, back, pages, stitches, mark);
  g.traverse((mm) => {
    if (mm.isMesh) {
      mm.castShadow = true;
      mm.receiveShadow = true;
    }
  });

  return g;
}

// ---------------------------------------------------------------- scene

const canvas = document.getElementById("scene");
const stage = canvas.parentElement;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
// synthetic room lighting immediately, upgraded to a studio HDRI once loaded
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
new HDRLoader().load(
  "/env/studio.hdr",
  (t) => {
    scene.environment = pmrem.fromEquirectangular(t).texture;
    scene.environmentIntensity = 0.5;
    t.dispose();
  },
  undefined,
  () => {} // keep the RoomEnvironment fallback on failure
);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);

// lights — aimed at an upright, camera-facing cover
const key = new THREE.DirectionalLight(0xfff3e2, 2.6);
key.position.set(2.2, 3.0, 4.2);
scene.add(key);

const fill = new THREE.HemisphereLight(0xf9f4ed, 0x8a7a5e, 0.55);
scene.add(fill);

// cool rim from behind-left to lift the book edges off the background
const rim = new THREE.DirectionalLight(0xdfe8df, 0.6);
rim.position.set(-3, 1.6, -2.6);
scene.add(rim);

// book carousel — an infinite vertical scroll of notebooks: each rises from
// lying flat below, stands upright at center (Stripe Press pose), then tips
// over and lies back down as it leaves through the top
const UPRIGHT_X = Math.PI / 2 - 0.34;
const REST_YAW = -0.3; // resting attitude: turned so the fore edge recedes
const TRAVEL = 1.9; // world-units of travel per scroll step

const books = STACK.map((spec) => makeBook(spec));
const bookMaterialColors = books.map((book) => {
  const seen = new Set();
  const colors = [];
  book.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];
    materials.forEach((material) => {
      if (!material?.color || seen.has(material)) return;
      seen.add(material);
      colors.push({ material, base: material.color.clone() });
    });
  });
  return colors;
});
const shadows = [];
const wrappers = books.map((book) => {
  const w = new THREE.Group();
  w.rotation.order = "YXZ"; // yaw around world-Y, then the stand-up tilt
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(BOOK.w * 1.3, BOOK.d * 1.22),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      toneMapped: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -BOOK.h / 2 - 0.035;
  shadow.renderOrder = -1;
  shadow.raycast = () => {};
  shadows.push(shadow);
  w.add(shadow, book);
  scene.add(w);
  return w;
});

// camera framing — frontal and centered; the view is nudged so the shelf
// floats in the open space above the brand lockup
function frame() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  // Mobile screens gain little from a 2x WebGL buffer here; 1.5x keeps the
  // cloth and stitching crisp while materially reducing GPU work.
  const pixelRatioCap = w <= 860 ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const zoomOut = camera.aspect < 1 ? 1.5 : camera.aspect < 1.35 ? 1.2 : 1.05;
  camera.position.set(0, 0.85, 3.9).multiplyScalar(zoomOut);
  camera.lookAt(0, 0.22, 0);
  camera.setViewOffset(w, h, 0, h * 0.16, w, h);
  camera.updateProjectionMatrix();
}
frame();
new ResizeObserver(frame).observe(stage);

// -------------------------------------------- scroll, spin and snap

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function hitsBook(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    -((e.clientY - r.top) / r.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  return (
    raycaster.intersectObjects(
      wrappers.filter((w) => w.visible),
      true
    ).length > 0
  );
}

const mobileMQ = window.matchMedia("(max-width: 860px)");

// start with the brand green notebook (last in STACK) holding center stage
let sPos = books.length - 1; // continuous shelf position, 1.0 per notebook
let sTarget = books.length - 1;
let lastScrollT = -1e9;
// autoplay: the shelf walks forward on its own, pausing whenever the
// visitor takes over and resuming after a quiet spell
const AUTO_DWELL = 4200; // ms a notebook holds center stage
const AUTO_RESUME = 6500; // ms of quiet before autoplay resumes
let lastInteractionT = performance.now();
let lastAdvanceT = performance.now();

function markInteraction() {
  lastInteractionT = performance.now();
}
let dragging = false;
let lastX = 0;
let lastY = 0;
let lastMoveT = 0;
let dragVelocity = 0;
let shelfVelocity = 0;
let tapFeedbackT = -1e9;
let tapFeedbackBook = -1;
let downAt = null;

stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    sTarget += e.deltaY * 0.0028;
    lastScrollT = performance.now();
    markInteraction();
  },
  { passive: false }
);

canvas.addEventListener("pointerdown", (e) => {
  const now = performance.now();
  downAt = { x: e.clientX, y: e.clientY, t: now };
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  lastMoveT = now;
  dragVelocity = 0;
  canvas.style.cursor = "grabbing";
  if (hitsBook(e)) {
    tapFeedbackT = now;
    tapFeedbackBook =
      ((Math.round(sPos) % books.length) + books.length) % books.length;
  }
  markInteraction();
});

window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const now = performance.now();
  const dx = e.clientX - lastX;
  const moveDt = Math.max(now - lastMoveT, 8);
  lastX = e.clientX;
  lastY = e.clientY;
  lastMoveT = now;
  markInteraction();
  // sideways drags walk the shelf
  const shelfDelta = -dx * (mobileMQ.matches ? 0.0055 : 0.003);
  sTarget += shelfDelta;
  dragVelocity = THREE.MathUtils.lerp(
    dragVelocity,
    shelfDelta / moveDt,
    0.35
  );
  if (Math.abs(dx) > 2) {
    lastScrollT = now;
  }
});

window.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false;
  canvas.style.cursor = "grab";
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  if (moved < 6 && performance.now() - downAt.t < 500 && hitsBook(e)) {
    // a click walks the shelf forward one notebook
    sTarget = Math.round(sTarget) + 1;
    shelfVelocity = 0;
    lastScrollT = -1e9;
  } else {
    // Project a short, capped continuation from the release velocity. Slow
    // drags remain precise; a deliberate flick can carry into the next book.
    const momentum = THREE.MathUtils.clamp(dragVelocity * 175, -0.85, 0.85);
    if (Math.abs(momentum) > 0.025) {
      sTarget += momentum;
      lastScrollT = performance.now();
    }
  }
  dragVelocity = 0;
  downAt = null;
});

// ---------------------------------------------------------------- loop

const timer = new THREE.Timer();
timer.connect(document);
let frameRequest = 0;

function loop(timestamp) {
  frameRequest = requestAnimationFrame(loop);
  timer.update(timestamp);
  const now = performance.now();
  const dt = Math.min(timer.getDelta(), 1 / 30);
  const t = timer.getElapsed();

  // After a quiet spell, move one notebook at a time and let it hold center.
  if (
    !reducedMotion &&
    !dragging &&
    now - lastInteractionT > AUTO_RESUME &&
    now - lastAdvanceT > AUTO_DWELL
  ) {
    sTarget = Math.round(sTarget) + 1;
    lastAdvanceT = now;
  }

  // ease toward the target, then snap the nearest notebook upright
  if (now - lastScrollT > 260 && !dragging) {
    sTarget = THREE.MathUtils.damp(sTarget, Math.round(sTarget), 4.35, dt);
    if (Math.abs(Math.round(sTarget) - sTarget) < 0.0001) {
      sTarget = Math.round(sTarget);
    }
  }
  if (reducedMotion) {
    sPos = sTarget;
    shelfVelocity = 0;
  } else {
    // Desktop keeps the paper-like follow-through. Mobile uses a critically
    // damped curve so each notebook accelerates and settles without bouncing.
    const stiffness = mobileMQ.matches ? 220 : 170;
    const damping = mobileMQ.matches ? 31 : 18;
    const acceleration = (sTarget - sPos) * stiffness - shelfVelocity * damping;
    shelfVelocity += acceleration * dt;
    shelfVelocity = THREE.MathUtils.clamp(shelfVelocity, -8, 8);
    sPos += shelfVelocity * dt;
    if (
      mobileMQ.matches &&
      !dragging &&
      Math.abs(sTarget - sPos) < 0.0005 &&
      Math.abs(shelfVelocity) < 0.01
    ) {
      sPos = sTarget;
      shelfVelocity = 0;
    }
  }

  // Premium idle choreography: a long, quiet movement followed by a genuine
  // still interval instead of perpetual mechanical swaying.
  const idleCycle = t % 11;
  const idleEnvelope =
    reducedMotion || idleCycle >= 6.5
      ? 0
      : Math.sin((idleCycle / 6.5) * Math.PI) ** 2;
  const n = books.length;

  books.forEach((book, i) => {
    const w = wrappers[i];
    const shadow = shadows[i];
    const pose = LANDING_POSES[i];
    // nearest slot congruent to i (mod count) — this is what makes it infinite
    const k = Math.round((sPos - i) / n) * n + i;
    const phi = k - sPos;
    if (Math.abs(phi) > 1.55) {
      w.visible = false;
      return;
    }
    w.visible = true;
    // how close this book is to holding center stage
    const focus = THREE.MathUtils.clamp(1 - Math.abs(phi), 0, 1);
    const poseT = t + pose.phase;
    const sway = reducedMotion
      ? 0
      : (Math.sin(poseT * 0.32) * 0.1 +
          Math.sin(poseT * 0.64) * 0.025) *
        idleEnvelope;
    const bob = reducedMotion
      ? 0
      : Math.sin(poseT * 0.52) * 0.014 * idleEnvelope;
    const breathe = reducedMotion
      ? 0
      : Math.sin(poseT * 0.42) * 0.01 * idleEnvelope;
    // horizontal shelf: books roll in from the side, stand at center
    const isMobile = mobileMQ.matches;
    const mobileSpacing = phi > 0 ? 0.55 : 0.61;
    const spacing = TRAVEL * (isMobile ? mobileSpacing : 1);
    const depth = isMobile ? 1.05 : 0.9;
    const separation = isMobile
      ? Math.sin(Math.min(Math.abs(phi), 1) * Math.PI) * 0.22
      : 0;
    w.position.set(
      phi * spacing + Math.sign(phi) * separation + pose.x * focus,
      0.3 + (bob + pose.y) * focus,
      -depth * phi * phi
    );
    w.rotation.set(
      UPRIGHT_X + pose.pitch * focus,
      THREE.MathUtils.lerp(REST_YAW, pose.yaw, focus) + sway * focus,
      0.06 +
        phi * (Math.PI / 2) * (isMobile ? 0.76 : 1) +
        (breathe + pose.roll) * focus
    );
    const tapElapsed = (now - tapFeedbackT) / 1000;
    const tapScale =
      i === tapFeedbackBook && tapElapsed >= 0 && tapElapsed < 0.18
        ? 1 - Math.sin((tapElapsed / 0.18) * Math.PI) * 0.022
        : 1;
    const restingScale = isMobile ? 0.66 : 0.82;
    const focusedScale = isMobile ? 0.92 : 1;
    w.scale.setScalar(
      (restingScale + (focusedScale - restingScale) * focus) * tapScale
    );

    // Side books recede tonally while the centered cover keeps its true brand
    // color. This avoids transparent-material sorting artifacts.
    const restingBrightness = isMobile ? 0.68 : 0.78;
    const brightness = restingBrightness + focus * (1 - restingBrightness);
    bookMaterialColors[i].forEach(({ material, base }) => {
      material.color.copy(base).multiplyScalar(brightness);
    });

    shadow.material.opacity = 0.035 + focus * 0.135;
    shadow.scale.setScalar(0.92 + focus * 0.12);
  });

  renderer.render(scene, camera);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
  } else if (!frameRequest) {
    timer.reset();
    frameRequest = requestAnimationFrame(loop);
  }
});

frameRequest = requestAnimationFrame(loop);
