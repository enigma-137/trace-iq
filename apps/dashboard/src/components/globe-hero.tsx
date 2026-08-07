'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function GlobeHero() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let width = mount.clientWidth;
    let height = mount.clientHeight;

    // Phones pay for every pixel and every point. Trim the detail budget there
    // rather than shipping a desktop-weight scene to a mid-range handset.
    const isSmallScreen = window.matchMedia('(max-width: 640px)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 6.0);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSmallScreen,
      alpha: true,
      powerPreference: 'low-power'
    });
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
    if (!ctx) return undefined;
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(9, 9, 1);
    glow.position.set(0, 0, -1);
    scene.add(glow);

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
      renderer.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      dotGeo.dispose();
      dotMat.dispose();
      activeGeo.dispose();
      activeMat.dispose();
      glowMat.dispose();
      glowTexture.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // `touch-pan-y` keeps vertical scrolling with the page on phones — without it
  // a swipe over the hero only spins the globe and the visitor feels stuck.
  return <div ref={mountRef} className="h-full w-full touch-pan-y select-none" />;
}