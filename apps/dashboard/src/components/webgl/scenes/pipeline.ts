import type * as THREE_NS from 'three';
import type { SceneBuilder, SceneHandle } from '@/components/webgl/runtime';

/**
 * Pipeline — the API performance backdrop.
 *
 * Requests enter from the left and travel through four processing stages —
 * SDK, ingest, process, store — as discrete packets. Most arrive; a small
 * fraction turn red and fall away mid-flight, which is the failure rate the
 * section's copy is about.
 *
 * Packet motion is entirely shader-side: each packet carries its lane, phase
 * and a failure roll, and the vertex shader derives the rest.
 */

const STAGES = 4;

const VERTEX_SHADER = /* glsl */ `
  precision mediump float;

  attribute vec4 aPacket; // x: phase, y: lane, z: speed, w: failRoll

  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uSpan;

  varying float vFail;
  varying float vAlpha;

  void main() {
    float t = fract(aPacket.x + uTime * aPacket.z);
    float lane = aPacket.y;

    // Packets that fail do so at a deterministic point along the route, so the
    // drop-outs cluster around stage boundaries rather than scattering.
    float failAt = 0.28 + fract(aPacket.w * 7.31) * 0.55;
    float failed = step(aPacket.w, 0.07);
    float dead = failed * step(failAt, t);

    float x = (t - 0.5) * uSpan;
    float y = (lane - 0.5) * 3.4;
    float z = sin(lane * 23.1) * 0.8;

    // A failed packet peels off and sinks instead of continuing down the lane.
    float sinceFail = max(0.0, t - failAt);
    y -= dead * sinceFail * sinceFail * 26.0;
    z += dead * sinceFail * 3.0;

    // Gentle vertical settle so lanes are not perfectly rigid rails.
    y += sin(uTime * 0.8 + lane * 11.0) * 0.07;

    vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    vFail = dead;
    // Fade in on entry, out on exit, and out quickly once a packet has failed.
    vAlpha = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.93, 1.0, t)) * (1.0 - dead * min(1.0, sinceFail * 6.0));

    gl_PointSize = uSize * uPixelRatio * (1.0 + dead * 0.4) * (11.0 / max(-mvPosition.z, 0.1));
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  uniform vec3 uOk;
  uniform vec3 uErr;

  varying float vFail;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = dot(uv, uv);
    if (d > 0.25) discard;
    float falloff = 1.0 - smoothstep(0.0, 0.25, d);
    falloff *= falloff;
    gl_FragColor = vec4(mix(uOk, uErr, vFail), falloff * vAlpha);
  }
`;

export const createPipelineScene: SceneBuilder = ({
  THREE,
  scene,
  camera,
  isSmallScreen,
  density,
}): SceneHandle => {
  const group = new THREE.Group();
  scene.add(group);

  const SPAN = 15;

  // ------------------------------------------------------------- stage gates
  // Thin vertical frames the packets pass through, marking each stage.
  const gateGeometry = new THREE.BufferGeometry();
  const gatePositions: number[] = [];
  for (let s = 0; s < STAGES; s++) {
    const x = (-0.5 + (s + 0.5) / STAGES) * SPAN;
    const h = 2.1;
    const d = 1.1;
    // A rectangle standing in the yz plane, as a line loop flattened into pairs.
    const corners: Array<[number, number]> = [
      [-h, -d],
      [h, -d],
      [h, d],
      [-h, d],
    ];
    for (let c = 0; c < corners.length; c++) {
      const a = corners[c];
      const b = corners[(c + 1) % corners.length];
      gatePositions.push(x, a[0], a[1], x, b[0], b[1]);
    }
  }
  gateGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(gatePositions), 3)
  );
  const gateMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });
  const gates = new THREE.LineSegments(gateGeometry, gateMaterial);
  group.add(gates);

  // ----------------------------------------------------------------- packets
  // Fewer, larger packets: at small sizes the lanes read as dust rather than
  // as discrete requests moving through stages.
  const count = Math.round((isSmallScreen ? 420 : 1100) * density);
  const packets = new Float32Array(count * 4);
  const origin = new Float32Array(count * 3); // required `position`, unused
  const laneCount = isSmallScreen ? 7 : 12;

  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    packets[i4] = Math.random(); // phase
    packets[i4 + 1] = Math.floor(Math.random() * laneCount) / (laneCount - 1);
    packets[i4 + 2] = 0.05 + Math.random() * 0.07; // speed
    packets[i4 + 3] = Math.random(); // failure roll
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(origin, 3));
  geometry.setAttribute('aPacket', new THREE.BufferAttribute(packets, 4));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: isSmallScreen ? 4.4 : 5.6 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, isSmallScreen ? 1.5 : 2) },
      uSpan: { value: SPAN },
      uOk: { value: new THREE.Color(0xd8f5e8) },
      uErr: { value: new THREE.Color(0xff6b7f) },
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
  group.add(points);

  return {
    layout(_width, _height, aspect) {
      const portrait = aspect < 0.95;
      group.scale.setScalar(portrait ? 0.62 : aspect < 1.6 ? 0.82 : 1);
      camera.position.set(0, 0.4, portrait ? 11.5 : 9.6);
      camera.lookAt(0, 0, 0);
    },

    update(elapsed, _delta, pointer) {
      material.uniforms.uTime.value = elapsed;
      // A slight yaw toward the cursor gives the lanes depth without letting
      // the visitor spin the scene into an unreadable angle.
      group.rotation.y = -0.34 + pointer.x * 0.1;
      group.rotation.x = 0.06 + pointer.y * 0.05;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      gateGeometry.dispose();
      gateMaterial.dispose();
    },
  };
};
