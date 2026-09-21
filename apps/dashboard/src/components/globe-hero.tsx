'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') ||
          canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function GlobeHeroFallback() {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center select-none overflow-hidden"
      aria-label="TraceIQ Network Visualization"
    >
      {/* Ambient background glow */}
      <div className="absolute h-72 w-72 rounded-full bg-white/[0.04] blur-3xl pointer-events-none" />

      {/* Outer orbital rings */}
      <div className="absolute h-80 w-80 rounded-full border border-zinc-800/80 animate-[spin_60s_linear_infinite] pointer-events-none" />
      <div className="absolute h-96 w-96 rounded-full border border-dashed border-zinc-800/40 animate-[spin_90s_linear_infinite_reverse] pointer-events-none" />

      {/* Central Globe sphere mockup */}
      <div className="relative flex h-64 w-64 items-center justify-center rounded-full bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-700/50 shadow-2xl shadow-black/80">
        {/* Lat/Long grid rings */}
        <div className="absolute inset-0 rounded-full border border-zinc-700/30" />
        <div className="absolute h-full w-[65%] rounded-full border border-zinc-700/20" />
        <div className="absolute h-full w-[35%] rounded-full border border-zinc-700/20" />
        <div className="absolute h-[65%] w-full rounded-full border border-zinc-700/20" />
        <div className="absolute h-[35%] w-full rounded-full border border-zinc-700/20" />

        {/* Glowing node dots */}
        <div className="absolute top-1/4 left-1/3 h-2 w-2 rounded-full bg-zinc-200 animate-ping opacity-75" />
        <div className="absolute top-1/4 left-1/3 h-2 w-2 rounded-full bg-zinc-100 shadow-[0_0_8px_rgba(255,255,255,0.8)]" />

        <div className="absolute bottom-1/3 right-1/4 h-2 w-2 rounded-full bg-teal-400 animate-ping opacity-60" />
        <div className="absolute bottom-1/3 right-1/4 h-2 w-2 rounded-full bg-teal-300 shadow-[0_0_8px_rgba(45,212,191,0.8)]" />

        <div className="absolute top-1/2 right-1/3 h-1.5 w-1.5 rounded-full bg-zinc-400 shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
        <div className="absolute bottom-1/4 left-1/2 h-1.5 w-1.5 rounded-full bg-zinc-400 shadow-[0_0_6px_rgba(255,255,255,0.6)]" />

        {/* Soft specular sheen */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/[0.03] to-white/[0.12] pointer-events-none" />
      </div>
    </div>
  );
}

export default function GlobeHero() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    if (!isWebGLAvailable()) {
      setWebglSupported(false);
      return;
    }

    const mount = mountRef.current;
    if (!mount) return;

    let width = mount.clientWidth || 300;
    let height = mount.clientHeight || 300;

    // Phones pay for every pixel and every point. Trim the detail budget there
    // rather than shipping a desktop-weight scene to a mid-range handset.
    const isSmallScreen = window.matchMedia('(max-width: 640px)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 6.0);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSmallScreen,
        alpha: true,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      console.warn('WebGL context creation failed for GlobeHero, falling back to 2D view:', err);
      setWebglSupported(false);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmallScreen ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.style.position = 'relative';
    mount.appendChild(renderer.domElement);

    // Neutral, brand-matching lighting (no color tint)
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const keyLight = new THREE.PointLight(0xffffff, 1.1, 20);
    keyLight.position.set(4, 3, 6);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0xffffff, 0.4, 20);
    fillLight.position.set(-4, -2, 6);
    scene.add(fillLight);

    const globeGroup = new THREE.Group();
    globeGroup.rotation.x = 0.15;
    // Full round globe — centered in the container so the whole sphere is
    // visible (its own anti-aliased silhouette, no container clipping).
    globeGroup.position.y = 0;
    scene.add(globeGroup);

    const updateSize = () => {
      const rect = mount.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      width = rect.width;
      height = rect.height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(mount);
    updateSize();

    // Solid core — neutral zinc, not blue
    const coreGeo = new THREE.SphereGeometry(2.2, 48, 48);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x050505,
      emissive: 0x0a0a0c,
      emissiveIntensity: 0.25,
      roughness: 0.35,
      metalness: 0.1,
    });
    globeGroup.add(new THREE.Mesh(coreGeo, coreMat));

    // Wireframe shell
    const wireGeo = new THREE.IcosahedronGeometry(2.28, isSmallScreen ? 3 : 5);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x9a9aa5,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    globeGroup.add(new THREE.Mesh(wireGeo, wireMat));

    // Node dots
    const dotCount = isSmallScreen ? 550 : 1300;
    const positions = new Float32Array(dotCount * 3);
    for (let i = 0; i < dotCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 2.27;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dotMat = new THREE.PointsMaterial({
      color: 0xf4f4f5,
      size: 0.026,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });
    globeGroup.add(new THREE.Points(dotGeo, dotMat));

    // Brighter "active" nodes
    const activeCount = 10;
    const activeIdx = Array.from({ length: activeCount }, () =>
      Math.floor(Math.random() * dotCount)
    );
    const activeGeo = new THREE.BufferGeometry();
    const activePositions = new Float32Array(activeCount * 3);
    activeIdx.forEach((idx, i) => {
      activePositions[i * 3] = positions[idx * 3];
      activePositions[i * 3 + 1] = positions[idx * 3 + 1];
      activePositions[i * 3 + 2] = positions[idx * 3 + 2];
    });
    activeGeo.setAttribute('position', new THREE.BufferAttribute(activePositions, 3));
    const activeMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.09,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
    });
    const activePoints = new THREE.Points(activeGeo, activeMat);
    globeGroup.add(activePoints);

    // Soft glow behind
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const ctx = glowCanvas.getContext('2d');
    let glowTexture: THREE.CanvasTexture | null = null;
    let glowMat: THREE.SpriteMaterial | null = null;
    if (ctx) {
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, 'rgba(255,255,255,0.18)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      glowTexture = new THREE.CanvasTexture(glowCanvas);
      glowMat = new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(9, 9, 1);
      glow.position.set(0, 0, -1);
      scene.add(glow);
    }

    // Drag rotation
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let velX = 0;
    let velY = 0.0014;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      mount.style.cursor = 'grabbing';
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      globeGroup.rotation.y += dx * 0.006;
      globeGroup.rotation.x += dy * 0.006;
      velY = dx * 0.0006;
      velX = dy * 0.0006;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const endDrag = () => {
      isDragging = false;
      mount.style.cursor = 'grab';
    };

    mount.style.cursor = 'grab';
    mount.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointerleave', endDrag);
    // On touch the browser claims vertical drags for scrolling and fires
    // pointercancel; without this the globe would keep spinning after the
    // gesture was handed off.
    window.addEventListener('pointercancel', endDrag);

    let frameId = 0;
    let t = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      t += clock.getDelta();

      // With reduced motion the globe holds still, but drag still works so the
      // scene stays explorable rather than inert.
      if (!isDragging && !prefersReducedMotion) {
        globeGroup.rotation.y += 0.0014 + velY;
        globeGroup.rotation.x += velX;
        velY *= 0.94;
        velX *= 0.94;
        velY += (0.0014 - velY) * 0.001;
      }

      const pulse = prefersReducedMotion ? 0.04 : 0.04 + Math.sin(t * 2) * 0.012;
      activeMat.size = pulse;

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    // Only burn frames while the hero is actually on screen. Scrolling down to
    // the features grid on a phone should not keep a WebGL loop running.
    let running = false;
    const start = () => {
      if (running) return;
      running = true;
      clock.getDelta(); // discard the gap accumulated while paused
      frameId = window.requestAnimationFrame(animate);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      window.cancelAnimationFrame(frameId);
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      stop();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0 }
    );
    visibilityObserver.observe(mount);

    const onDocumentVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onDocumentVisibility);

    start();

    return () => {
      stop();
      mount.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointerleave', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      document.removeEventListener('visibilitychange', onDocumentVisibility);
      visibilityObserver.disconnect();
      resizeObserver.disconnect();
      
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);

      coreGeo.dispose();
      coreMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      dotGeo.dispose();
      dotMat.dispose();
      activeGeo.dispose();
      activeMat.dispose();
      if (glowMat) glowMat.dispose();
      if (glowTexture) glowTexture.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, []);

  if (!webglSupported) {
    return <GlobeHeroFallback />;
  }

  // `touch-pan-y` keeps vertical scrolling with the page on phones — without it
  // a swipe over the hero only spins the globe and the visitor feels stuck.
  return <div ref={mountRef} className="h-full w-full touch-pan-y select-none" />;
}