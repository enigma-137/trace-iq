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

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5.6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    // KEY CHANGE: shift the whole globe group down in 3D so only its upper
    // cap is in frame — this replaces the div-clipping hack with the sphere's
    // own curved, anti-aliased silhouette. Tune: more negative reveals less
    // dome (e.g. -2.3), less negative reveals more (e.g. -1.5).
    globeGroup.position.y = -1.9;
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
    const wireGeo = new THREE.IcosahedronGeometry(2.28, 5);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x9a9aa5,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    globeGroup.add(new THREE.Mesh(wireGeo, wireMat));

    // Node dots
    const dotCount = 1300;
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
    glow.scale.set(8, 8, 1);
    glow.position.set(0, -1.9, -1);
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

    let frameId = 0;
    let t = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      t += clock.getDelta();

      if (!isDragging) {
        globeGroup.rotation.y += 0.0014 + velY;
        globeGroup.rotation.x += velX;
        velY *= 0.94;
        velX *= 0.94;
        velY += (0.0014 - velY) * 0.001;
      }

      const pulse = 0.04 + Math.sin(t * 2) * 0.012;
      activeMat.size = pulse;

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      width = mount.clientWidth;
      height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.cancelAnimationFrame(frameId);
      mount.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointerleave', endDrag);
      window.removeEventListener('resize', handleResize);
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

  return <div ref={mountRef} className="h-full w-full select-none" />;
}