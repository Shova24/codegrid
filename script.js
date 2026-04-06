import * as THREE from "three";

// ─── slide data ───────────────────────────────────────────────────────────────

const slidesLeft = [
  { name: "Contour",        img: "/img1.jpg"  },
  { name: "Velum Drift",    img: "/img2.jpg"  },
  { name: "Quiet Exchange", img: "/img3.jpg"  },
  { name: "Earth Routine",  img: "/img4.jpg"  },
  { name: "Metal Echo",     img: "/img5.jpg"  },
  { name: "Tanned Edge",    img: "/img6.jpg"  },
  { name: "Humidity",       img: "/img7.jpg"  },
  { name: "Limestone Air",  img: "/img8.jpg"  },
  { name: "Warm Surface",   img: "/img9.jpg"  },
  { name: "Dust & Craft",   img: "/img10.jpg" },
];

const slidesRight = [
  { name: "Fallow",         img: "/img6.jpg"  },
  { name: "Iron Thread",    img: "/img7.jpg"  },
  { name: "Pale System",    img: "/img8.jpg"  },
  { name: "Worn Mineral",   img: "/img9.jpg"  },
  { name: "Still Weight",   img: "/img10.jpg" },
  { name: "Contour",        img: "/img1.jpg"  },
  { name: "Velum Drift",    img: "/img2.jpg"  },
  { name: "Quiet Exchange", img: "/img3.jpg"  },
  { name: "Earth Routine",  img: "/img4.jpg"  },
  { name: "Metal Echo",     img: "/img5.jpg"  },
];

// ─── config ───────────────────────────────────────────────────────────────────

const config = {
  // gap between slides as a fraction of each slide's height
  gapRatio:           0.06,
  smoothing:          0.05,
  distortionStrength: 2.5,
  distortionSmoothing:0.1,
  momentumFriction:   0.95,
  momentumThreshold:  0.001,
  wheelSpeed:         0.005,
  wheelMax:           150,
  dragSpeed:          0.005,
  dragMomentum:       0.005,
  touchSpeed:         0.005,
  touchMomentum:      0.05,
  autoplaySpeed:      0.004,
  autoplayPause:      1200,
};

// ─── DOM ──────────────────────────────────────────────────────────────────────

const titleElement   = document.querySelector("p#slide-title");
const counterElement = document.querySelector("p#slide-count");

// ─── shared scroll state ──────────────────────────────────────────────────────

let scrollPosition    = 0;
let scrollTarget      = 0;
let scrollMomentum    = 0;
let isScrolling       = false;
let lastFrameTime     = 0;

let distortionAmount  = 0;
let distortionTarget  = 0;
let velocityPeak      = 0;
let scrollDirection   = 0;
let directionTarget   = 0;
const velocityHistory = [0, 0, 0, 0, 0];

let isDragging        = false;
let dragStartY        = 0;
let dragDelta         = 0;
let touchStartY       = 0;
let touchLastY        = 0;

let autoplayPausedUntil = 0;

const pauseAutoplay = () => {
  autoplayPausedUntil = performance.now() + config.autoplayPause;
};

const addDistortionBurst = (amount) => {
  distortionTarget = Math.min(1, distortionTarget + amount);
};

const wrap    = (value, range) => ((value % range) + range) % range;
const zeroPad = (n) => String(n).padStart(2, "0");

// ─── pixel → world-unit conversion ───────────────────────────────────────────
// Given a PerspectiveCamera at position.z, returns how many world units
// correspond to one pixel at the z=0 plane.

function pixelsToUnits(camera, pixelHeight, rendererHeight) {
  const vFovRad    = (camera.fov * Math.PI) / 180;
  const worldHeight = 2 * Math.tan(vFovRad / 2) * camera.position.z;
  return (pixelHeight / rendererHeight) * worldHeight;
}

// ─── build one column ─────────────────────────────────────────────────────────

function buildColumn(canvasEl, slides) {
let colW = canvasEl.getBoundingClientRect().width;
  let colH = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(colW, colH);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(0x141414);

  const camera = new THREE.PerspectiveCamera(45, colW / colH, 0.1, 100);
  camera.position.z = 5;

  const textureLoader = new THREE.TextureLoader();

  // Each entry: { mesh, offset (world units), height (world units), name, index }
  const slideData = [];

  // We build the stack once all textures have loaded.
  // Until then, slides are invisible placeholders.
  let ready      = false;
  let loopLength = 1;
  let halfLoop   = 0.5;

  const pendingLoads = slides.map((slide, i) =>
    new Promise((resolve) => {
      textureLoader.load(slide.img, (texture) => {
        resolve({ texture, index: i });
      });
    })
  );

  Promise.all(pendingLoads).then((results) => {
    // Sort back to original order (Promise.all preserves order, but be explicit)
    results.sort((a, b) => a.index - b.index);

    let stackPosition = 0;

    results.forEach(({ texture, index }) => {
      texture.colorSpace = THREE.SRGBColorSpace;

      // Compute pixel height: full column width, aspect-ratio derived height,
      // clamped so it never exceeds the viewport height.
      const imageAspect  = texture.image.width / texture.image.height;
      let   pixH         = colW / imageAspect;
      if (pixH > colH) pixH = colH;               // scale down to fit

      // Convert pixel dimensions to world units
      const unitH = pixelsToUnits(camera, pixH,  colH);
      const unitW = pixelsToUnits(camera, colW,  colH) * (colW / colW); // full width
      // unitW is simply the full world-width of the frustum at z=0
      const vFovRad    = (camera.fov * Math.PI) / 180;
      const worldH     = 2 * Math.tan(vFovRad / 2) * camera.position.z;
      const worldW     = worldH * camera.aspect;
      const slideUnitW = worldW;  // slide fills full column width

      const geometry = new THREE.PlaneGeometry(slideUnitW, unitH, 32, 16);
      const material = new THREE.MeshBasicMaterial({
        map:  texture,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      const gap    = unitH * config.gapRatio;
      const offset = index === 0
        ? 0
        : stackPosition;

      if (index === 0) {
        stackPosition  = unitH / 2;
      }

      slideData[index] = {
        mesh,
        offset,
        height: unitH,
        originalVertices: [...geometry.attributes.position.array],
        name:   slides[index].name,
        index,
      };

      // Advance stack for next slide
      if (index > 0) {
        // offset was set above to stackPosition before this slide's half
      }
    });

    // Rebuild offsets in order now that all heights are known
    let sp = 0;
    slideData.forEach((s, i) => {
      if (i === 0) {
        s.offset  = 0;
        sp        = s.height / 2;
      } else {
        const gap = s.height * config.gapRatio;
        sp       += gap + s.height / 2;
        s.offset  = sp;
        sp       += s.height / 2;
      }
    });

    loopLength = sp + slideData[0].height * config.gapRatio + slideData[0].height / 2;
    halfLoop   = loopLength / 2;
    ready      = true;
  });

  // ── distortion ──────────────────────────────────────────────────────────────

  function applyDistortion(s, positionY, strength) {
    const positions = s.mesh.geometry.attributes.position;
    const original  = s.originalVertices;

    for (let i = 0; i < positions.count; i++) {
      const x        = original[i * 3];
      const y        = original[i * 3 + 1];
      const distance = Math.sqrt(x * x + (positionY + y) ** 2);
      const falloff  = Math.max(0, 1 - distance / 2);
      const bend     = Math.pow(Math.sin((falloff * Math.PI) / 2), 1.5);
      positions.setZ(i, bend * strength);
    }

    positions.needsUpdate = true;
    s.mesh.geometry.computeVertexNormals();
  }

  // ── per-frame tick ───────────────────────────────────────────────────────────

  function tick(signedDistortion) {
    if (!ready) {
      renderer.render(scene, camera);
      return -1;
    }

    let closestDistance = Infinity;
    let closestIndex    = 0;

    slideData.forEach((s) => {
      let y = -(s.offset - wrap(scrollPosition, loopLength));
      y     = wrap(y + halfLoop, loopLength) - halfLoop;

      s.mesh.position.y = y;

      if (Math.abs(y) < closestDistance) {
        closestDistance = Math.abs(y);
        closestIndex    = s.index;
      }

      // if (Math.abs(y) < halfLoop + s.height) {
      //   applyDistortion(s, y, config.distortionStrength * signedDistortion);
      // }
    });

    renderer.render(scene, camera);
    return closestIndex;
  }

  // ── resize ───────────────────────────────────────────────────────────────────

  function onResize() {
    colW = canvasEl.getBoundingClientRect().width;
    colH = window.innerHeight;
    camera.aspect = colW / colH;
    camera.updateProjectionMatrix();
    renderer.setSize(colW, colH);

    // Recompute world-space sizes for all slides
    if (!ready) return;

    const vFovRad = (camera.fov * Math.PI) / 180;
    const worldH  = 2 * Math.tan(vFovRad / 2) * camera.position.z;
    const worldW  = worldH * camera.aspect;

    let sp = 0;
    slideData.forEach((s, i) => {
      const texture     = s.mesh.material.map;
      const imageAspect = texture.image.width / texture.image.height;
      let   pixH        = colW / imageAspect;
      if (pixH > colH) pixH = colH;

      const unitH = (pixH / colH) * worldH;

      // Rebuild geometry
      s.mesh.geometry.dispose();
      s.mesh.geometry           = new THREE.PlaneGeometry(worldW, unitH, 32, 16);
      s.originalVertices        = [...s.mesh.geometry.attributes.position.array];
      s.height                  = unitH;

      if (i === 0) {
        s.offset = 0;
        sp       = unitH / 2;
      } else {
        const gap = unitH * config.gapRatio;
        sp       += gap + unitH / 2;
        s.offset  = sp;
        sp       += unitH / 2;
      }
    });

    loopLength = sp + slideData[0].height * config.gapRatio + slideData[0].height / 2;
    halfLoop   = loopLength / 2;
  }

  return { tick, onResize, slides };
}

// ─── create both columns ──────────────────────────────────────────────────────

const colLeft  = buildColumn(document.getElementById("canvas-left"),  slidesLeft);
const colRight = buildColumn(document.getElementById("canvas-right"), slidesRight);

// ─── input events ─────────────────────────────────────────────────────────────

window.addEventListener("wheel", (e) => {
  e.preventDefault();
  pauseAutoplay();
  const clamped = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), config.wheelMax);
  addDistortionBurst(Math.abs(clamped) * 0.001);
  scrollTarget += clamped * config.wheelSpeed;
  isScrolling   = true;
  clearTimeout(window._scrollTimeout);
  window._scrollTimeout = setTimeout(() => (isScrolling = false), 150);
}, { passive: false });

window.addEventListener("touchstart", (e) => {
  touchStartY   = touchLastY = e.touches[0].clientY;
  isScrolling   = false;
  scrollMomentum = 0;
}, { passive: false });

window.addEventListener("touchmove", (e) => {
  e.preventDefault();
  pauseAutoplay();
  const deltaY = e.touches[0].clientY - touchLastY;
  touchLastY   = e.touches[0].clientY;
  addDistortionBurst(Math.abs(deltaY) * 0.02);
  scrollTarget -= deltaY * config.touchSpeed;
  isScrolling   = true;
}, { passive: false });

window.addEventListener("touchend", () => {
  const swipeVelocity = (touchLastY - touchStartY) * 0.005;
  if (Math.abs(swipeVelocity) > 0.5) {
    scrollMomentum = -swipeVelocity * config.touchMomentum;
    addDistortionBurst(Math.abs(swipeVelocity) * 0.45);
    isScrolling = true;
    setTimeout(() => (isScrolling = false), 800);
  }
});

document.querySelectorAll("canvas").forEach((c) => (c.style.cursor = "grab"));

window.addEventListener("mousedown", (e) => {
  isDragging     = true;
  dragStartY     = e.clientY;
  dragDelta      = 0;
  scrollMomentum = 0;
  document.querySelectorAll("canvas").forEach((c) => (c.style.cursor = "grabbing"));
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  pauseAutoplay();
  const deltaY = e.clientY - dragStartY;
  dragStartY   = e.clientY;
  dragDelta    = deltaY;
  addDistortionBurst(Math.abs(deltaY) * 0.02);
  scrollTarget -= deltaY * config.dragSpeed;
  isScrolling   = true;
});

window.addEventListener("mouseup", () => {
  if (!isDragging) return;
  isDragging = false;
  document.querySelectorAll("canvas").forEach((c) => (c.style.cursor = "grab"));
  if (Math.abs(dragDelta) > 2) {
    scrollMomentum = -dragDelta * config.dragMomentum;
    addDistortionBurst(Math.abs(dragDelta) * 0.005);
    isScrolling = true;
    setTimeout(() => (isScrolling = false), 800);
  }
});

window.addEventListener("resize", () => {
  colLeft.onResize();
  colRight.onResize();
});

// ─── animation loop ───────────────────────────────────────────────────────────

let activeSlideIndex = -1;

function animate(time) {
  requestAnimationFrame(animate);

  const deltaTime      = lastFrameTime ? (time - lastFrameTime) / 1000 : 0.016;
  lastFrameTime        = time;
  const previousScroll = scrollPosition;

  if (performance.now() > autoplayPausedUntil) {
    scrollTarget += config.autoplaySpeed;
  }

  if (isScrolling) {
    scrollTarget   += scrollMomentum;
    scrollMomentum *= config.momentumFriction;
    if (Math.abs(scrollMomentum) < config.momentumThreshold) scrollMomentum = 0;
  }

  scrollPosition += (scrollTarget - scrollPosition) * config.smoothing;

  const frameDelta = scrollPosition - previousScroll;

  if (Math.abs(frameDelta) > 0.00001) {
    directionTarget = frameDelta > 0 ? 1 : -1;
  }
  scrollDirection += (directionTarget - scrollDirection) * 0.08;

  const velocity = Math.abs(frameDelta) / deltaTime;
  velocityHistory.push(velocity);
  velocityHistory.shift();
  const averageVelocity = velocityHistory.reduce((a, b) => a + b) / velocityHistory.length;

  if (averageVelocity > velocityPeak) velocityPeak = averageVelocity;

  const isDecelerating =
    averageVelocity / (velocityPeak + 0.001) < 0.7 && velocityPeak > 0.5;
  velocityPeak *= 0.99;

  if (velocity > 0.05)
    distortionTarget = Math.max(distortionTarget, Math.min(1, velocity * 0.1));
  if (isDecelerating || averageVelocity < 0.2)
    distortionTarget *= isDecelerating ? 0.95 : 0.855;

  distortionAmount +=
    (distortionTarget - distortionAmount) * config.distortionSmoothing;

  const signedDistortion = distortionAmount * scrollDirection;

  const leftActive = colLeft.tick(signedDistortion);
  colRight.tick(signedDistortion);

  if (leftActive !== -1 && leftActive !== activeSlideIndex) {
    activeSlideIndex           = leftActive;
    titleElement.textContent   = colLeft.slides[activeSlideIndex].name;
    counterElement.textContent = zeroPad(activeSlideIndex + 1);
  }
}

animate();