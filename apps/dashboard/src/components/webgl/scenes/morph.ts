import type * as THREE_NS from 'three';
import type { SceneBuilder, SceneHandle } from '@/components/webgl/runtime';

/**
 * Morph — the scroll-driven capabilities scene.
 *
 * One point cloud reshapes itself into six formations as the visitor scrolls,
 * one per capability: a globe of visitors, a funnel, a cohort grid, a spiking
 * waveform, a branching tree, and an outward spray of exports. The same points
 * persist across every formation, so each capability visibly *becomes* the next
 * rather than cutting to a new graphic.
 *
 * Every formation is baked into its own attribute buffer up front. The shader
 * then blends between the two neighbouring formations by a single uniform, so
 * scrolling costs one float write per frame rather than any CPU-side geometry
 * work.
 */

export const MORPH_FORMATIONS = 6;

const VERTEX_SHADER = /* glsl */ `
  precision mediump float;

  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec2 aSeed; // x: size jitter, y: drift phase

  uniform float uBlend;     // 0..1 between the two bound formations
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec2 uPointer;

  varying float vFade;

  void main() {
    // Ease the blend so formations settle rather than sliding linearly.
    float b = smoothstep(0.0, 1.0, uBlend);

    vec3 pos = mix(aFrom, aTo, b);

    // Points bow outward mid-transition, so the change reads as a swarm
    // reorganising itself instead of vertices sliding along straight lines.
    float arc = sin(b * 3.14159265) * 0.55;
    pos += normalize(pos + vec3(0.001)) * arc;

    // Perpetual low drift keeps a settled formation alive.
    float drift = sin(uTime * 0.6 + aSeed.y * 6.2831) * 0.055;
    pos.y += drift;
    pos.x += cos(uTime * 0.45 + aSeed.y * 6.2831) * 0.045;

    pos.xy += uPointer * 0.35;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Points dim slightly while in flight, which hides formation seams.
    vFade = 1.0 - sin(b * 3.14159265) * 0.35;

    gl_PointSize = uSize * uPixelRatio * (0.65 + aSeed.x * 0.7) * (11.0 / max(-mvPosition.z, 0.1));
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  uniform vec3 uColor;
  varying float vFade;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = dot(uv, uv);
    if (d > 0.25) discard;
    float falloff = 1.0 - smoothstep(0.02, 0.25, d);
    gl_FragColor = vec4(uColor, falloff * vFade);
  }
`;

/** Fills `out` at `i*3` with one point of formation `f`, given a 0..1 rank. */
function formationPoint(f: number, i: number, count: number, out: Float32Array) {
  const i3 = i * 3;
  const u = i / count;
  const rand = (n: number) => {
    // Deterministic per (formation, index, salt) so formations stay stable.
    const s = Math.sin(i * 12.9898 + f * 78.233 + n * 37.719) * 43758.5453;
    return s - Math.floor(s);
  };

  let x = 0;
  let y = 0;
  let z = 0;

  switch (f) {
    // 01 — Web analytics: a globe of visitors.
    case 0: {
      const theta = rand(1) * Math.PI * 2;
      const phi = Math.acos(2 * rand(2) - 1);
      const r = 2.5;
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.sin(phi) * Math.sin(theta);
      z = r * Math.cos(phi);
      break;
    }
    // 02 — Funnels: a cone narrowing downward.
    case 1: {
      const t = u;
      const r = 2.9 * (1 - t * 0.82);
      const a = rand(1) * Math.PI * 2;
      x = Math.cos(a) * r;
      y = 2.4 - t * 4.8;
      z = Math.sin(a) * r * 0.55;
      break;
    }
    // 03 — Users and cohorts: a stacked grid of retained rows.
    case 2: {
      const cols = 26;
      const col = i % cols;
      const row = Math.floor(i / cols) % 18;
      x = (col / (cols - 1) - 0.5) * 6.4;
      y = (row / 17 - 0.5) * 4.0;
      // Cohorts decay to the right, so the grid thins as it goes.
      z = (rand(3) - 0.5) * 0.7;
      if (rand(4) < col / cols) {
        x += 6.0;
        y += 6.0; // pushed out of frame: the cohort that churned
      }
      break;
    }
    // 04 — Errors and API health: a latency waveform with spikes.
    case 3: {
      const t = u * 2 - 1;
      x = t * 6.2;
      const base = Math.sin(t * 7.0) * 0.5 + Math.sin(t * 17.0) * 0.22;
      const spike = rand(1) > 0.965 ? 2.2 * (rand(2) - 0.2) : 0;
      y = base + spike;
      z = (rand(3) - 0.5) * 1.1;
      break;
    }
    // 05 — Flags and alerts: a branching rollout tree.
    case 4: {
      const depth = Math.floor(rand(1) * 4);
      const span = Math.pow(2, depth);
      const branch = Math.floor(rand(2) * span);
      x = -3.4 + depth * 2.2;
      y = ((branch + 0.5) / span - 0.5) * 5.2;
      z = (rand(3) - 0.5) * 0.9;
      break;
    }
    // 06 — Share and export: a spray leaving the system.
    default: {
      const a = rand(1) * Math.PI * 2;
      const rr = Math.pow(rand(2), 0.5);
      x = -2.2 + rr * 7.5;
      y = Math.sin(a) * rr * 2.6;
      z = Math.cos(a) * rr * 1.8;
      break;
    }
  }

  out[i3] = x;
  out[i3 + 1] = y;
  out[i3 + 2] = z;
}

export const createMorphScene: SceneBuilder = ({
  THREE,
  scene,
  camera,
  isSmallScreen,
  density,
  progress,
}): SceneHandle => {
  const count = Math.round((isSmallScreen ? 2600 : 7000) * density);

  // Bake every formation once. Two of them are bound as attributes at a time
  // and swapped as the visitor crosses a formation boundary.
  const formations: Float32Array[] = [];
  for (let f = 0; f < MORPH_FORMATIONS; f++) {
    const buf = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) formationPoint(f, i, count, buf);
    formations.push(buf);
  }

  const seeds = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    seeds[i * 2] = Math.random();
    seeds[i * 2 + 1] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  const fromAttr = new THREE.BufferAttribute(new Float32Array(formations[0]), 3);
  const toAttr = new THREE.BufferAttribute(new Float32Array(formations[1]), 3);
  geometry.setAttribute('position', fromAttr); // required by three; unused in the shader
  geometry.setAttribute('aFrom', fromAttr);
  geometry.setAttribute('aTo', toAttr);
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 2));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBlend: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: isSmallScreen ? 3.0 : 3.6 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, isSmallScreen ? 1.5 : 2) },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uColor: { value: new THREE.Color(0xdff1e8) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(points);
  scene.add(group);

  // Which pair of formations is currently bound.
  let boundFrom = 0;
  let boundTo = 1;

  const bind = (from: number, to: number) => {
    if (from === boundFrom && to === boundTo) return;
    (fromAttr.array as Float32Array).set(formations[from]);
    (toAttr.array as Float32Array).set(formations[to]);
    fromAttr.needsUpdate = true;
    toAttr.needsUpdate = true;
    boundFrom = from;
    boundTo = to;
  };

  let smoothed = 0;

  return {
    layout(_width, _height, aspect) {
      const portrait = aspect < 0.95;
      // The statement occupies the left half on wide viewports, so the cloud
      // sits to its right rather than directly behind the words.
      group.position.x = portrait ? 0 : aspect < 1.6 ? 1.6 : 3.2;
      group.position.y = portrait ? 2.6 : 0;
      group.scale.setScalar(portrait ? 0.66 : 0.92);
      camera.position.z = portrait ? 11.5 : aspect < 1.6 ? 10 : 8.8;
    },

    update(elapsed, delta, pointer) {
      // Damp the raw scroll value so flicks do not snap the cloud.
      const target = Math.max(0, Math.min(0.9999, progress.current));
      smoothed += (target - smoothed) * Math.min(1, delta * 6);

      const span = smoothed * (MORPH_FORMATIONS - 1);
      const index = Math.min(MORPH_FORMATIONS - 2, Math.floor(span));
      bind(index, index + 1);

      material.uniforms.uBlend.value = span - index;
      material.uniforms.uTime.value = elapsed;
      (material.uniforms.uPointer.value as THREE_NS.Vector2).copy(pointer);

      group.rotation.y = smoothed * Math.PI * 0.55 + Math.sin(elapsed * 0.12) * 0.05;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
};
