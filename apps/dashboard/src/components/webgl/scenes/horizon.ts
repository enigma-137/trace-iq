import type * as THREE_NS from 'three';
import type { SceneBuilder, SceneHandle } from '@/components/webgl/runtime';

/**
 * Horizon — the full-bleed editorial break.
 *
 * A wireframe terrain whose height is event volume over time, rolling toward
 * the camera: the shape of traffic as a landscape. Replaces a 2MB stock photo
 * that said nothing about the product.
 *
 * Displacement happens in the vertex shader on a static plane, so the geometry
 * is uploaded once and never touched again.
 */

const VERTEX_SHADER = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform vec2 uPointer;

  varying float vHeight;
  varying float vDist;

  // Cheap value noise — two octaves is plenty at this scale and avoids the
  // texture fetch a gradient-noise implementation would need.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 pos = position;

    // The plane is built lying flat; scroll it along its length over time so
    // the terrain rolls toward the viewer.
    vec2 p = vec2(pos.x * 0.22, pos.y * 0.22 + uTime * 0.28);

    float h = noise(p) * 1.0 + noise(p * 2.7) * 0.36 + noise(p * 6.1) * 0.12;
    h = pow(h, 1.6);

    // Flatten toward the near and far edges so the band reads as a ridge
    // rather than a rectangle of noise cut off at the borders.
    float edge = 1.0 - smoothstep(0.35, 1.0, abs(pos.y) / 16.0);
    h *= edge;

    pos.z += h * 3.4;

    vHeight = h;
    vDist = length(pos.xy);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    mvPosition.xy += uPointer * 0.6;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  uniform vec3 uLow;
  uniform vec3 uHigh;

  varying float vHeight;
  varying float vDist;

  void main() {
    vec3 color = mix(uLow, uHigh, smoothstep(0.15, 0.85, vHeight));
    // Fade the far reaches into the page background instead of ending on a
    // hard rectangle edge.
    float fade = 1.0 - smoothstep(7.0, 17.0, vDist);
    float lift = 0.25 + vHeight * 0.95;
    gl_FragColor = vec4(color, fade * lift * 0.85);
  }
`;

export const createHorizonScene: SceneBuilder = ({
  THREE,
  scene,
  camera,
  isSmallScreen,
}): SceneHandle => {
  const segments = isSmallScreen ? 88 : 168;
  const geometry = new THREE.PlaneGeometry(38, 32, segments, segments);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uLow: { value: new THREE.Color(0x2b3138) },
      uHigh: { value: new THREE.Color(0xbfeeda) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    wireframe: true,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // Lay the plane down and tip it away, so the camera grazes along the ridge.
  mesh.rotation.x = -Math.PI / 2.32;
  mesh.position.y = -1.6;
  scene.add(mesh);

  return {
    layout(_width, _height, aspect) {
      const portrait = aspect < 0.95;
      camera.position.set(0, portrait ? 2.4 : 2.1, portrait ? 11.5 : 9.4);
      camera.lookAt(0, -0.4, -2);
    },

    update(elapsed, _delta, pointer) {
      material.uniforms.uTime.value = elapsed;
      (material.uniforms.uPointer.value as THREE_NS.Vector2).copy(pointer);
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
};
