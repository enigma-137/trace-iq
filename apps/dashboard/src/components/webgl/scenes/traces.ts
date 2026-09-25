import type * as THREE_NS from 'three';
import type { SceneBuilder, SceneHandle } from '@/components/webgl/runtime';
import { createGlowTexture } from '@/components/webgl/runtime';

/**
 * Traces — the hero and CTA field.
 *
 * Thousands of individual events stream in from the edges of a system, spiral
 * inward along discrete filaments, and collapse into one bright nucleus: the
 * product as a single image.
 *
 * All motion is computed in the vertex shader from `uTime` plus one vec4 per
 * particle, so the CPU never touches a particle after setup and the whole field
 * is one draw call.
 */

const VERTEX_SHADER = /* glsl */ `
  precision mediump float;

  // The built-in "position" attribute carries this particle's jitter offset,
  // not a location. The path is derived entirely from aTrace, so we reuse the
  // mandatory attribute rather than uploading a second buffer for it.
  attribute vec4 aTrace; // x: phase, y: stream, z: speed, w: brightness

  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec2 uPointer;

  varying float vDepth;
  varying float vGlow;

  const float PI = 3.141592653589793;

  void main() {
    float phase = aTrace.x;
    float stream = aTrace.y;
    float speed = aTrace.z;
    float bright = aTrace.w;

    // Lifecycle position, 0 at the outer shell and 1 at the core.
    float t = fract(phase + uTime * speed);

    // Convergence completes exactly when the death fade begins. Letting the
    // lifecycle outrun it leaves particles fading at a non-zero radius, which
    // reads as a hole punched where the nucleus should be.
    float converge = clamp(t / 0.93, 0.0, 1.0);

    // A mild bias concentrates a little extra density near the core without
    // emptying out the long approach, which is where the filaments read.
    float e = pow(converge, 1.65);

    // stream is quantised on the CPU, so many particles share one path and the
    // field resolves into distinct filaments instead of undifferentiated haze.
    float baseAngle = stream * PI * 2.0;
    float tilt = sin(stream * 127.1) * 0.95;
    float lift = cos(stream * 311.7) * 0.75;

    float angle = baseAngle + e * 4.3 + uTime * 0.07;
    float radius = mix(6.4, 0.05, e);

    vec3 pos;
    pos.x = cos(angle) * radius;
    pos.y = sin(angle) * radius * (0.52 + 0.48 * cos(tilt)) + lift * radius * 0.2;
    pos.z = mix(-4.6, 0.8, e) + sin(angle * 1.3 + tilt) * radius * 0.17;

    // Jitter gives each filament thickness at the edges and tightens to a thread
    // at the core: chaos resolving into one signal.
    pos += position * mix(1.0, 0.06, e);

    // The field leans toward the cursor, and leans less the closer it gets to
    // the core so the nucleus stays anchored under the headline.
    pos.xy += uPointer * mix(0.62, 0.1, e);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Fading both ends of the lifecycle hides the wrap from t=1 back to t=0.
    float birth = smoothstep(0.0, 0.12, t);
    float death = 1.0 - smoothstep(0.93, 1.0, t);

    vGlow = birth * death * bright;
    vDepth = e;

    gl_PointSize = uSize * uPixelRatio * mix(0.7, 2.4, e) * bright * (12.0 / max(-mvPosition.z, 0.1));
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  uniform vec3 uColorCool;
  uniform vec3 uColorHot;

  varying float vDepth;
  varying float vGlow;

  void main() {
    // Squared distance keeps the round sprite mask free of a sqrt.
    vec2 uv = gl_PointCoord - 0.5;
    float d = dot(uv, uv);
    if (d > 0.25) discard;

    float falloff = 1.0 - smoothstep(0.0, 0.25, d);
    falloff *= falloff;

    vec3 color = mix(uColorCool, uColorHot, smoothstep(0.3, 1.0, vDepth));
    gl_FragColor = vec4(color, falloff * vGlow);
  }
`;

export function createTracesScene(variant: 'hero' | 'ambient'): SceneBuilder {
  return ({ THREE, scene, camera, isSmallScreen, density }): SceneHandle => {
    const field = new THREE.Group();
    scene.add(field);

    // --------------------------------------------------------- trace streams
    const traceCount = Math.round((isSmallScreen ? 5200 : 16000) * density);
    // Quantising the stream id is what turns the cloud into readable filaments:
    // every particle sharing a value rides the same path at a different phase.
    const streamCount = isSmallScreen ? 54 : 96;

    const jitter = new Float32Array(traceCount * 3);
    const trace = new Float32Array(traceCount * 4);

    for (let i = 0; i < traceCount; i++) {
      const i3 = i * 3;
      const i4 = i * 4;

      jitter[i3] = (Math.random() - 0.5) * 0.9;
      jitter[i3 + 1] = (Math.random() - 0.5) * 0.9;
      jitter[i3 + 2] = (Math.random() - 0.5) * 0.9;

      trace[i4] = Math.random(); // phase
      trace[i4 + 1] = Math.floor(Math.random() * streamCount) / streamCount;
      trace[i4 + 2] = 0.018 + Math.random() * 0.028; // speed
      // A small minority burn brighter, so the streams carry visible individual
      // events rather than a uniform wash.
      trace[i4 + 3] = Math.random() < 0.06 ? 1.6 + Math.random() * 0.9 : 0.55 + Math.random() * 0.5;
    }

    const traceGeometry = new THREE.BufferGeometry();
    traceGeometry.setAttribute('position', new THREE.BufferAttribute(jitter, 3));
    traceGeometry.setAttribute('aTrace', new THREE.BufferAttribute(trace, 4));

    const traceMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: isSmallScreen ? 2.4 : 3.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, isSmallScreen ? 1.5 : 2) },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uColorCool: { value: new THREE.Color(0x63737f) },
        uColorHot: { value: new THREE.Color(0xe8fff4) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const tracePoints = new THREE.Points(traceGeometry, traceMaterial);
    // Positions live in the shader, so the CPU-side bounding sphere is a point
    // at the origin and would cull the whole field the moment the camera moved.
    tracePoints.frustumCulled = false;
    field.add(tracePoints);

    // ---------------------------------------------------------- ambient dust
    const dustCount = Math.round((isSmallScreen ? 260 : 700) * density);
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const i3 = i * 3;
      dustPositions[i3] = (Math.random() - 0.5) * 22;
      dustPositions[i3 + 1] = (Math.random() - 0.5) * 14;
      dustPositions[i3 + 2] = (Math.random() - 0.5) * 12 - 3;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
      color: 0x8b9aa3,
      size: 0.026,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    field.add(dust);

    // ------------------------------------------------------------ lens rings
    const ringSegments = 128;
    const ringPositions = new Float32Array(ringSegments * 3);
    for (let i = 0; i < ringSegments; i++) {
      const a = (i / ringSegments) * Math.PI * 2;
      ringPositions[i * 3] = Math.cos(a);
      ringPositions[i * 3 + 1] = Math.sin(a);
      ringPositions[i * 3 + 2] = 0;
    }
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3));

    const ringMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
    });

    const ringA = new THREE.LineLoop(ringGeometry, ringMaterial);
    ringA.scale.setScalar(2.45);
    ringA.rotation.set(1.18, 0.32, 0);
    field.add(ringA);

    const ringB = new THREE.LineLoop(ringGeometry, ringMaterial);
    ringB.scale.setScalar(3.85);
    ringB.rotation.set(-0.94, -0.46, 0.4);
    field.add(ringB);

    // ------------------------------------------------------------ core bloom
    const glowTexture = createGlowTexture(THREE, 0.4);
    let glowMaterial: THREE_NS.SpriteMaterial | null = null;
    let glow: THREE_NS.Sprite | null = null;
    if (glowTexture) {
      glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        // The gradient canvas is straight (non-premultiplied) RGBA, so the
        // matching blend equation is the correct one to add it with.
        premultipliedAlpha: false,
      });
      glow = new THREE.Sprite(glowMaterial);
      glow.scale.set(6, 6, 1);
      field.add(glow);
    }

    return {
      layout(_width, _height, aspect) {
        // The ambient placement sits under centred copy, so it stays centred
        // horizontally and drops below the midline like a horizon.
        if (variant === 'ambient') {
          const portrait = aspect < 0.95;
          field.position.set(0, portrait ? -3.4 : -4.3, 0);
          field.scale.setScalar(portrait ? 0.6 : 0.78);
          camera.position.z = portrait ? 11.4 : 10;
          return;
        }

        if (aspect < 0.95) {
          // Portrait: lift the field into the upper third so the copy below it
          // sits on near-solid background rather than competing with particles.
          field.position.set(0, 2.9, 0);
          field.scale.setScalar(0.62);
          camera.position.z = 11.4;
        } else if (aspect < 1.6) {
          field.position.set(2.4, 0.6, 0);
          field.scale.setScalar(0.78);
          camera.position.z = 10.2;
        } else {
          // The caption is capped at a 62% column on wide viewports, so the
          // nucleus sits in the free zone to its right.
          field.position.set(3.4, 0.2, 0);
          field.scale.setScalar(0.9);
          camera.position.z = 9.2;
        }
      },

      update(elapsed, delta, pointer) {
        traceMaterial.uniforms.uTime.value = elapsed;
        (traceMaterial.uniforms.uPointer.value as THREE_NS.Vector2).copy(pointer);

        dust.rotation.y += delta * 0.012;
        ringA.rotation.z += delta * 0.05;
        ringB.rotation.z -= delta * 0.035;

        if (glow) {
          const pulse = 5.8 + Math.sin(elapsed * 0.9) * 0.45;
          glow.scale.set(pulse, pulse, 1);
        }
      },

      dispose() {
        traceGeometry.dispose();
        traceMaterial.dispose();
        dustGeometry.dispose();
        dustMaterial.dispose();
        ringGeometry.dispose();
        ringMaterial.dispose();
        glowMaterial?.dispose();
        glowTexture?.dispose();
      },
    };
  };
}
