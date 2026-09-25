import type * as THREE_NS from 'three';

/**
 * Shared bootstrap for every WebGL scene on the marketing site.
 *
 * Each scene only describes *what* to draw and how it moves. Everything that
 * makes WebGL safe to put on a marketing page in the first place — context
 * fallbacks, DPR caps, resize handling, pausing offscreen, reduced motion and
 * full teardown — lives here once so no individual scene can forget it.
 */

export interface SceneContext {
  THREE: typeof THREE_NS;
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  /** Phones get smaller geometry and particle budgets. */
  isSmallScreen: boolean;
  prefersReducedMotion: boolean;
  /** Scales particle counts for smaller or secondary placements. */
  density: number;
  /**
   * Live 0..1 scroll progress for scroll-driven scenes. A mutable ref rather
   * than a prop so the driving component can update it every scroll event
   * without re-rendering React on each frame.
   */
  progress: { current: number };
}

export interface SceneHandle {
  /** Advance the scene. `pointer` is a damped -1..1 cursor position. */
  update(elapsed: number, delta: number, pointer: THREE_NS.Vector2): void;
  /** Reposition for a new container shape. */
  layout?(width: number, height: number, aspect: number): void;
  dispose(): void;
}

export type SceneBuilder = (ctx: SceneContext) => SceneHandle;

export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch {
    return false;
  }
}

function createRenderer(
  THREE: typeof THREE_NS,
  antialias: boolean
): THREE_NS.WebGLRenderer | null {
  const attempts: THREE_NS.WebGLRendererParameters[] = [
    { antialias, alpha: true, powerPreference: 'high-performance' },
    { antialias: false, alpha: true },
    { alpha: true },
  ];

  for (const options of attempts) {
    try {
      return new THREE.WebGLRenderer(options);
    } catch {
      // fall through to a cheaper context
    }
  }
  return null;
}

/**
 * A soft radial sprite, drawn once into a small canvas. Used by several scenes
 * for core bloom; cheaper and sharper than a blurred mesh.
 */
export function createGlowTexture(
  THREE: typeof THREE_NS,
  peak = 0.4
): THREE_NS.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, `rgba(255,255,255,${peak})`);
  gradient.addColorStop(0.28, `rgba(210,225,220,${peak * 0.38})`);
  gradient.addColorStop(0.62, `rgba(120,150,145,${peak * 0.11})`);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  return new THREE.CanvasTexture(canvas);
}

export interface MountOptions {
  density?: number;
  /** Camera distance; scenes may override in their own layout(). */
  cameraZ?: number;
  fov?: number;
  /** Live 0..1 scroll progress for scroll-driven scenes. */
  progress?: { current: number };
}

export function mountScene(
  THREE: typeof THREE_NS,
  mount: HTMLDivElement,
  build: SceneBuilder,
  onReady: () => void,
  options: MountOptions = {}
): () => void {
  const { density = 1, cameraZ = 9.2, fov = 48, progress = { current: 0 } } = options;

  const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;

  const renderer = createRenderer(THREE, !isSmallScreen);
  if (!renderer) return () => {};

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 80);
  camera.position.set(0, 0, cameraZ);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmallScreen ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  Object.assign(renderer.domElement.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
  });
  // Only establish a containing block if the mount lacks one. Forcing
  // `relative` would override absolute placements and collapse the mount.
  if (getComputedStyle(mount).position === 'static') {
    mount.style.position = 'relative';
  }
  mount.appendChild(renderer.domElement);

  const handle = build({
    THREE,
    scene,
    camera,
    isSmallScreen,
    prefersReducedMotion,
    density,
    progress,
  });

  const updateSize = () => {
    const rect = mount.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
    handle.layout?.(rect.width, rect.height, camera.aspect);
  };

  const resizeObserver = new ResizeObserver(updateSize);
  resizeObserver.observe(mount);
  updateSize();

  const pointerTarget = new THREE.Vector2(0, 0);
  const pointer = new THREE.Vector2(0, 0);
  const onPointerMove = (event: PointerEvent) => {
    const rect = mount.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerTarget.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    );
  };
  if (hasFinePointer && !prefersReducedMotion) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
  }

  let frameId = 0;
  let running = false;
  let elapsed = 0;
  let lastFrame = 0;

  const animate = () => {
    const now = performance.now();
    // Clamping absorbs the gap after a pause so scenes never jump forward.
    const delta = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    elapsed += delta;

    pointer.lerp(pointerTarget, 0.045);
    handle.update(elapsed, delta, pointer);
    renderer.render(scene, camera);

    frameId = window.requestAnimationFrame(animate);
  };

  const start = () => {
    if (running || prefersReducedMotion) return;
    running = true;
    lastFrame = performance.now(); // discard the gap accrued while paused
    frameId = window.requestAnimationFrame(animate);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    window.cancelAnimationFrame(frameId);
  };

  // With reduced motion the scene is composed and drawn exactly once: the
  // visitor still gets the image, the device never spins a render loop.
  if (prefersReducedMotion) {
    handle.update(6, 0, pointer);
    renderer.render(scene, camera);
  } else {
    handle.update(0, 0, pointer);
    renderer.render(scene, camera);
    start();
  }
  onReady();

  const visibilityObserver = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting ? start() : stop()),
    { threshold: 0 }
  );
  visibilityObserver.observe(mount);

  const onDocumentVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onDocumentVisibility);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    stop();
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  return () => {
    stop();
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onDocumentVisibility);
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
    visibilityObserver.disconnect();
    resizeObserver.disconnect();

    handle.dispose();

    if (renderer.domElement.parentNode === mount) {
      mount.removeChild(renderer.domElement);
    }
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
