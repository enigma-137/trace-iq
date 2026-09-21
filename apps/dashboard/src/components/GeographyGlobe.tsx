'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as topojson from 'topojson-client';
import earcut from 'earcut';
import worldTopology from 'world-atlas/countries-110m.json';
import { numericToAlpha2, alpha2ToName } from '@/lib/country-codes';

interface CountryItem {
  name: string;
  total: number;
}

interface GeographyGlobeProps {
  data: CountryItem[];
  metric?: string;
  onCountryClick?: (code: string) => void;
  className?: string;
}

interface HoverState {
  code: string;
  name: string;
  value: number;
  x: number;
  y: number;
}

const GLOBE_RADIUS = 2;
const CAMERA_Z = 4.5;
const MIN_ZOOM = 3;
const MAX_ZOOM = 7.5;
const AUTO_ROTATE_SPEED = 0.0012;
const DRAG_SENSITIVITY = 0.005;
const INERTIA_DECAY = 0.94;
const COUNTRY_ELEVATION = 0.012;
const HOVER_ELEVATION = 0.025;

type LatLon = [number, number];
type PolygonCoords = LatLon[][];

function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function polygonToGeometry(
  coords: PolygonCoords,
  radius: number,
  elevation: number
): THREE.BufferGeometry {
  const outer = coords[0];
  const holes = coords.slice(1);

  const points2D: number[][] = [];
  const holeIndices: number[] = [];

  for (const coord of outer) {
    points2D.push([coord[0], coord[1]]);
  }

  for (const hole of holes) {
    holeIndices.push(points2D.length);
    for (const coord of hole) {
      points2D.push([coord[0], coord[1]]);
    }
  }

  const flat = points2D.flat();
  const triangles = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined);

  const positions = new Float32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    const idx = triangles[i];
    const lon = points2D[idx][0];
    const lat = points2D[idx][1];
    const v = latLonToVec3(lat, lon, radius + elevation);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function multiPolygonToGeometry(
  coords: PolygonCoords[],
  radius: number,
  elevation: number
): THREE.BufferGeometry {
  const geometries = coords.map((polygon) =>
    polygonToGeometry(polygon, radius, elevation)
  );
  return mergeGeometries(geometries);
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geometries.map((g) => {
    if (g.index) {
      return g.toNonIndexed();
    }
    return g;
  });
  let totalVertices = 0;
  for (const geo of nonIndexed) {
    totalVertices += geo.attributes.position.count;
  }

  const positions = new Float32Array(totalVertices * 3);
  let offset = 0;
  for (const geo of nonIndexed) {
    const attr = geo.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      positions[offset++] = attr.getX(i);
      positions[offset++] = attr.getY(i);
      positions[offset++] = attr.getZ(i);
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

function intensityToColor(intensity: number): number {
  const r = Math.floor(10 + intensity * (45 - 10));
  const g = Math.floor(118 + intensity * (212 - 118));
  const b = Math.floor(110 + intensity * (191 - 110));
  return (r << 16) | (g << 8) | b;
}

function createGridLines(radius: number): THREE.Line[] {
  const lines: THREE.Line[] = [];
  const material = new THREE.LineBasicMaterial({
    color: 0x1e1e2e,
    transparent: true,
    opacity: 0.35,
  });

  for (let lat = -60; lat <= 60; lat += 30) {
    const points: THREE.Vector3[] = [];
    for (let lon = 0; lon <= 360; lon += 4) {
      points.push(latLonToVec3(lat, lon - 180, radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    lines.push(new THREE.Line(geo, material));
  }

  for (let lon = -180; lon < 180; lon += 30) {
    const points: THREE.Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 4) {
      points.push(latLonToVec3(lat, lon, radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    lines.push(new THREE.Line(geo, material));
  }

  return lines;
}

function computeCentroid(
  geometry: GeoJSON.Geometry
): [number, number] | null {
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;

  const processCoords = (
    coords:
      | GeoJSON.Position[]
      | GeoJSON.Position[][]
      | GeoJSON.Position[][][]
  ) => {
    const flatten = (
      c:
        | GeoJSON.Position[]
        | GeoJSON.Position[][]
        | GeoJSON.Position[][][]
    ): GeoJSON.Position[] => {
      if (!Array.isArray(c) || c.length === 0) return [];
      const first = c[0];
      if (Array.isArray(first) && typeof first[0] === 'number') {
        return c as GeoJSON.Position[];
      }
      if (Array.isArray(first) && Array.isArray(first[0])) {
        return (c as GeoJSON.Position[][]).flat();
      }
      return (c as GeoJSON.Position[][][]).flat(2);
    };
    for (const [lon, lat] of flatten(coords)) {
      sumLon += lon;
      sumLat += lat;
      count++;
    }
  };

  if (geometry.type === 'Polygon') {
    processCoords(geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      processCoords(polygon);
    }
  }

  if (count === 0) return null;
  return [sumLon / count, sumLat / count];
}

function createSafeRenderer(isSmallScreen: boolean): THREE.WebGLRenderer | null {
  const attempts = [
    { antialias: !isSmallScreen, alpha: true, powerPreference: 'default' as const },
    { antialias: false, alpha: true, powerPreference: 'default' as const },
    { antialias: false, alpha: true, precision: 'mediump' as const },
    { antialias: false, alpha: true },
    {},
  ];

  for (const opts of attempts) {
    try {
      return new THREE.WebGLRenderer(opts);
    } catch {
      // try next fallback option
    }
  }
  return null;
}

export function GeographyGlobe({
  data,
  metric = 'visitors',
  onCountryClick,
  className,
}: GeographyGlobeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState<HoverState | null>(null);
  const [debug, setDebug] = useState<string>('init');

  const dataMapRef = useRef<Map<string, { value: number; intensity: number }>>(
    new Map()
  );
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameIdRef = useRef(0);
  const isDraggingRef = useRef(false);
  const prevPointerRef = useRef({ x: 0, y: 0 });
  const velRef = useRef({ x: 0, y: AUTO_ROTATE_SPEED });
  const pointerDownPosRef = useRef({ x: 0, y: 0 });
  const runningRef = useRef(false);
  const prefersReducedMotion = useRef(false);
  const isSmallScreen = useRef(false);
  const topoRef = useRef<any>(null);

  const buildDataMap = useCallback(() => {
    const map = new Map<string, { value: number; intensity: number }>();
    const maxValue = Math.max(1, ...data.map((d) => d.total));
    for (const item of data) {
      const code = item.name.toUpperCase();
      const intensity = Math.sqrt(item.total / maxValue);
      map.set(code, { value: item.total, intensity });
    }
    dataMapRef.current = map;
  }, [data]);

  const updateCountryMeshes = useCallback(
    (featureCollection: GeoJSON.FeatureCollection) => {
      const globeGroup = globeGroupRef.current;
      if (!globeGroup) return;

      const existing = globeGroup.children.filter(
        (child) => child.userData.countryCode
      );
      for (const child of existing) {
        globeGroup.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
      meshMapRef.current.clear();

      const dataMap = dataMapRef.current;
      let rendered = 0;

      for (const feature of featureCollection.features) {
        if (!feature.id) continue;
        const alpha2 = numericToAlpha2(String(feature.id));
        if (!alpha2) continue;

        const entry = dataMap.get(alpha2);
        const intensity = entry?.intensity ?? 0;
        const hasTraffic = intensity > 0;
        const isHovered = hovered?.code === alpha2;

        let geometry: THREE.BufferGeometry;
        try {
          const elevation = hasTraffic
            ? COUNTRY_ELEVATION +
              (isHovered ? HOVER_ELEVATION : intensity * 0.015)
            : 0.005;

          if (feature.geometry.type === 'Polygon') {
            const coords = feature.geometry.coordinates as PolygonCoords;
            geometry = polygonToGeometry(coords, GLOBE_RADIUS, elevation);
          } else if (feature.geometry.type === 'MultiPolygon') {
            const coords = feature.geometry.coordinates as PolygonCoords[];
            geometry = multiPolygonToGeometry(coords, GLOBE_RADIUS, elevation);
          } else {
            continue;
          }
        } catch {
          continue;
        }

        const color = hasTraffic
          ? intensityToColor(isHovered ? 1 : intensity)
          : 0x0c0d12;
        const opacity = hasTraffic ? (isHovered ? 1 : 0.92) : 0.55;

        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          side: THREE.DoubleSide,
          depthWrite: hasTraffic,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.countryCode = alpha2;
        globeGroup.add(mesh);
        meshMapRef.current.set(alpha2, mesh);
        rendered++;
      }

      console.log('Globe: rendered', rendered, 'countries');
    },
    [hovered]
  );

  useEffect(() => {
    buildDataMap();
  }, [buildDataMap]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 400;
    const height = mount.clientHeight || 400;
    isSmallScreen.current = window.matchMedia('(max-width: 640px)').matches;
    prefersReducedMotion.current = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, CAMERA_Z);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = createSafeRenderer(isSmallScreen.current);
    if (!renderer) {
      console.warn('WebGL context creation failed for GeographyGlobe');
      setError(true);
      setLoading(false);
      return;
    }

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, isSmallScreen.current ? 1.5 : 2)
    );
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.style.position = 'relative';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      stop();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    const globeGroup = new THREE.Group();
    globeGroup.rotation.x = 0.35;
    globeGroupRef.current = globeGroup;
    scene.add(globeGroup);

    const coreGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x08090b,
      emissive: 0x0a0a0c,
      emissiveIntensity: 0.2,
      roughness: 0.5,
      metalness: 0.1,
    });
    globeGroup.add(new THREE.Mesh(coreGeo, coreMat));

    // Debug wireframe to verify rendering
    const debugWireGeo = new THREE.IcosahedronGeometry(GLOBE_RADIUS + 0.01, 2);
    const debugWireMat = new THREE.MeshBasicMaterial({
      color: 0x14b8a6,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });
    globeGroup.add(new THREE.Mesh(debugWireGeo, debugWireMat));

    const gridLines = createGridLines(GLOBE_RADIUS + 0.003);
    for (const line of gridLines) {
      globeGroup.add(line);
    }

    const atmosphereGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.12, 64, 64);
    const atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
          gl_FragColor = vec4(0.02, 0.55, 0.5, 1.0) * intensity * 0.9;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(atmosphereGeo, atmosphereMat));

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const ctx = glowCanvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, 'rgba(20,184,166,0.12)');
      grad.addColorStop(1, 'rgba(20,184,166,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      const glowTexture = new THREE.CanvasTexture(glowCanvas);
      const glowMat = new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(8.5, 8.5, 1);
      glow.position.set(0, 0, -0.5);
      scene.add(glow);
    }

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const keyLight = new THREE.PointLight(0xffffff, 0.8, 20);
    keyLight.position.set(4, 3, 6);
    scene.add(keyLight);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const getIntersections = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(
        globeGroup.children.filter((c) => c instanceof THREE.Mesh),
        false
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      isDraggingRef.current = true;
      prevPointerRef.current = { x: event.clientX, y: event.clientY };
      pointerDownPosRef.current = { x: event.clientX, y: event.clientY };
      mount.style.cursor = 'grabbing';
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) {
        const intersects = getIntersections(event);
        const hit = intersects[0];
        if (hit && hit.object.userData.countryCode) {
          const code = hit.object.userData.countryCode;
          const entry = dataMapRef.current.get(code);
          const name =
            (entry && alpha2ToName(code)) ||
            hit.object.userData.countryCode;
          setHovered({
            code,
            name: name ?? code,
            value: entry?.value ?? 0,
            x: event.clientX,
            y: event.clientY,
          });
          mount.style.cursor = 'pointer';
        } else {
          setHovered(null);
          mount.style.cursor = 'grab';
        }
        return;
      }

      const dx = event.clientX - prevPointerRef.current.x;
      const dy = event.clientY - prevPointerRef.current.y;
      globeGroup.rotation.y += dx * DRAG_SENSITIVITY;
      globeGroup.rotation.x += dy * DRAG_SENSITIVITY;
      velRef.current.y = dx * DRAG_SENSITIVITY * 0.4;
      velRef.current.x = dy * DRAG_SENSITIVITY * 0.4;
      prevPointerRef.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      mount.style.cursor = 'grab';
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.position.z += event.deltaY * 0.005;
      camera.position.z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.position.z));
    };

    const onClick = (event: PointerEvent) => {
      const dx = event.clientX - pointerDownPosRef.current.x;
      const dy = event.clientY - pointerDownPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 4) return;

      const intersects = getIntersections(event);
      const hit = intersects[0];
      if (hit && hit.object.userData.countryCode && onCountryClick) {
        onCountryClick(hit.object.userData.countryCode);
      }
    };

    mount.addEventListener('pointerdown', onPointerDown);
    mount.addEventListener('pointermove', onPointerMove);
    mount.addEventListener('pointerup', onPointerUp);
    mount.addEventListener('pointerleave', onPointerUp);
    mount.addEventListener('pointercancel', onPointerUp);
    mount.addEventListener('wheel', onWheel, { passive: false });
    mount.addEventListener('click', onClick);
    mount.style.touchAction = 'pan-y';

    const updateSize = () => {
      const rect = mount.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(mount);
    updateSize();
    console.log('Globe: size updated', width, height);

    const start = () => {
      if (runningRef.current) return;
      runningRef.current = true;
      animate();
    };

    const stop = () => {
      if (!runningRef.current) return;
      runningRef.current = false;
      window.cancelAnimationFrame(frameIdRef.current);
    };

    const animate = () => {
      frameIdRef.current = window.requestAnimationFrame(animate);

      if (!isDraggingRef.current && !prefersReducedMotion.current) {
        globeGroup.rotation.y += AUTO_ROTATE_SPEED + velRef.current.y;
        globeGroup.rotation.x += velRef.current.x;
        velRef.current.y *= INERTIA_DECAY;
        velRef.current.x *= INERTIA_DECAY;
        velRef.current.y += (AUTO_ROTATE_SPEED - velRef.current.y) * 0.001;
      }

      renderer.render(scene, camera);
    };

    console.log('Globe: starting render loop');

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0 }
    );
    visibilityObserver.observe(mount);

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    function loadTopo() {
      try {
        topoRef.current = worldTopology;
        setLoading(false);
        const featureCollection = topojson.feature(
          worldTopology as any,
          worldTopology.objects.countries as any
        ) as unknown as GeoJSON.FeatureCollection;
        updateCountryMeshes(featureCollection);
        setDebug('countries rendered');
      } catch (err) {
        console.error('Globe load error:', err);
        setError(true);
        setLoading(false);
        setDebug('error: ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    loadTopo();

    start();
    console.log('Globe: animation started');

    return () => {
      stop();
      window.cancelAnimationFrame(frameIdRef.current);
      mount.removeEventListener('pointerdown', onPointerDown);
      mount.removeEventListener('pointermove', onPointerMove);
      mount.removeEventListener('pointerup', onPointerUp);
      mount.removeEventListener('pointerleave', onPointerUp);
      mount.removeEventListener('pointercancel', onPointerUp);
      mount.removeEventListener('wheel', onWheel);
      mount.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      visibilityObserver.disconnect();
      resizeObserver.disconnect();

      while (globeGroup.children.length > 0) {
        const child = globeGroup.children[0];
        globeGroup.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      }
      meshMapRef.current.clear();

      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.dispose();
      renderer.forceContextLoss();
      coreGeo.dispose();
      coreMat.dispose();
      debugWireGeo.dispose();
      debugWireMat.dispose();
      atmosphereMat.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (topoRef.current && !loading && !error) {
      const featureCollection = topojson.feature(
        topoRef.current,
        topoRef.current.objects.countries
      ) as unknown as GeoJSON.FeatureCollection;
      updateCountryMeshes(featureCollection);
    }
  }, [loading, error, updateCountryMeshes]);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'pan-y' }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-teal-500" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-neutral-500">Failed to load globe data.</p>
        </div>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-neutral-700 bg-neutral-900/90 px-3 py-2 text-xs shadow-xl"
          style={{
            left: hovered.x + 12,
            top: hovered.y - 12,
            transform: 'translate(0, -100%)',
          }}
        >
          <p className="font-semibold text-neutral-100">{hovered.name}</p>
          <p className="mt-0.5 text-neutral-400">
            {hovered.value.toLocaleString()} {metric}
          </p>
        </div>
      )}
    </div>
  );
}
