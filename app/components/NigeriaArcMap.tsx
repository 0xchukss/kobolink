"use client";

/* SPDX-License-Identifier: GPL-3.0-or-later
 * 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
 */

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Coordinate = [number, number];
type PolygonCoordinates = Coordinate[][];
type MultiPolygonCoordinates = PolygonCoordinates[];

type GeoFeature = {
  type: "Feature";
  properties: {
    shapeName?: string;
    shapeISO?: string;
    shapeType?: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: PolygonCoordinates | MultiPolygonCoordinates;
  };
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

type Projector = (coordinate: Coordinate) => [number, number];

type StateRecord = {
  name: string;
  root: THREE.Group;
  meshes: THREE.Mesh[];
};

const mapTheme = {
  primary: "#050505",
  outline: "#050505",
  topFill: "#f7f7f7",
  sideTop: "#ffffff",
  sideBottom: "#cfcfcf",
  internalLine: "#111111",
  labelText: "#050505",
  chase: "#050505",
};

const cityMarks = [
  { name: "Abuja", role: "agent source", coordinate: [7.4951, 9.0579] as Coordinate },
  { name: "Lagos", role: "creator market", coordinate: [3.3792, 6.5244] as Coordinate },
  { name: "Kano", role: "creator market", coordinate: [8.5167, 12] as Coordinate },
  { name: "Port Harcourt", role: "creator market", coordinate: [7.0498, 4.8156] as Coordinate },
  { name: "Enugu", role: "creator market", coordinate: [7.4988, 6.5244] as Coordinate },
];

export function NigeriaArcMap() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState("Abuja");
  const [status, setStatus] = useState("loading map");

  useEffect(() => {
    if (!hostRef.current) return;

    let disposed = false;
    let frame = 0;
    let raf = 0;
    const host = hostRef.current;
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0xffffff, 0);
    host.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, -9.8, 7.2);
    camera.lookAt(0, 0, 0.15);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 5.2;
    controls.maxDistance = 13;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 0, 0.16);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(-3, -6, 8);
    scene.add(key);
    const rim = new THREE.PointLight(0xffffff, 12, 14);
    rim.position.set(4, -3, 3);
    scene.add(rim);

    const mapRoot = new THREE.Group();
    mapRoot.rotation.z = -0.05;
    scene.add(mapRoot);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(2, 2);
    const hover = { current: null as StateRecord | null };
    const states: StateRecord[] = [];
    const interactiveMeshes: THREE.Mesh[] = [];
    const startedAt = performance.now();

    const topMaterial = new THREE.MeshStandardMaterial({
      color: mapTheme.topFill,
      roughness: 0.88,
      metalness: 0.08,
      transparent: true,
      opacity: 0.98,
      emissive: "#ffffff",
      emissiveIntensity: 0.04,
    });
    const sideMaterial = new THREE.MeshStandardMaterial({
      color: mapTheme.sideBottom,
      roughness: 0.7,
      metalness: 0.1,
      emissive: mapTheme.sideTop,
      emissiveIntensity: 0.03,
    });
    const topHoverMaterial = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.72,
      metalness: 0.12,
      emissive: mapTheme.primary,
      emissiveIntensity: 0.08,
    });
    const sideHoverMaterial = new THREE.MeshStandardMaterial({
      color: mapTheme.primary,
      roughness: 0.58,
      metalness: 0.16,
      emissive: mapTheme.primary,
      emissiveIntensity: 0.04,
    });
    const lineMaterial = new THREE.LineBasicMaterial({ color: mapTheme.internalLine, transparent: true, opacity: 0.42 });
    const outerMaterial = new THREE.LineBasicMaterial({ color: mapTheme.outline, transparent: true, opacity: 0.95 });

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host);
    resize();

    Promise.all([
      fetch("/maps/nigeria-adm1.geojson").then((response) => response.json() as Promise<FeatureCollection>),
      fetch("/maps/nigeria-adm0.geojson").then((response) => response.json() as Promise<FeatureCollection>),
    ])
      .then(([adm1, adm0]) => {
        if (disposed) return;
        const projector = createProjector(adm0.features);
        buildStateMap(adm1, projector);
        addBaseRing();
        addCityLayer(projector);
        addFlyLines(projector);
        const chase = createChaseLight(adm0, projector);
        setStatus(`${adm1.features.length} state units`);
        animate(chase);
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "map failed");
      });

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("click", onClick);

    function resize() {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function buildStateMap(collection: FeatureCollection, projector: Projector) {
      for (const feature of collection.features) {
        const name = feature.properties.shapeName ?? "Nigeria state";
        const stateGroup = new THREE.Group();
        stateGroup.name = name;
        const meshes: THREE.Mesh[] = [];
        const polygons = polygonsFromFeature(feature);

        for (const polygon of polygons) {
          const shape = shapeFromPolygon(polygon, projector);
          const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: false, steps: 1 });
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(geometry, [topMaterial, sideMaterial]);
          mesh.userData.stateName = name;
          mesh.userData.stateGroup = stateGroup;
          meshes.push(mesh);
          interactiveMeshes.push(mesh);
          stateGroup.add(mesh);

          const outline = createOutline(polygon[0], projector, outerMaterial, 0.255);
          stateGroup.add(outline);
          for (const hole of polygon.slice(1, 3)) {
            stateGroup.add(createOutline(hole, projector, lineMaterial, 0.258));
          }
        }

        const record = { name, root: stateGroup, meshes };
        stateGroup.userData.record = record;
        states.push(record);
        mapRoot.add(stateGroup);
      }
    }

    function addBaseRing() {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(4.35, 4.72, 160),
        new THREE.MeshBasicMaterial({ color: mapTheme.primary, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
      );
      ring.position.z = -0.08;
      mapRoot.add(ring);
      gsap.to(ring.rotation, { z: Math.PI * 2, duration: 26, repeat: -1, ease: "none" });
    }

    function addCityLayer(projector: Projector) {
      cityMarks.forEach((city) => {
        const [x, y] = projector(city.coordinate);
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(city.name === "Abuja" ? 0.08 : 0.055, 18, 18),
          new THREE.MeshBasicMaterial({ color: city.name === "Abuja" ? mapTheme.primary : "#6b6b6b" }),
        );
        dot.position.set(x, y, 0.48);
        mapRoot.add(dot);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.12, 0.135, 40),
          new THREE.MeshBasicMaterial({ color: mapTheme.primary, transparent: true, opacity: city.name === "Abuja" ? 0.42 : 0.18, side: THREE.DoubleSide }),
        );
        ring.position.set(x, y, 0.47);
        mapRoot.add(ring);
        gsap.to(ring.scale, { x: 2.6, y: 2.6, duration: 1.8, repeat: -1, ease: "power1.out", delay: city.name.length * 0.04 });
        gsap.to((ring.material as THREE.MeshBasicMaterial), { opacity: 0.02, duration: 1.8, repeat: -1, ease: "power1.out", delay: city.name.length * 0.04 });

        const label = createLabel(city.name, city.role);
        label.position.set(x + 0.08, y + 0.08, 0.72);
        mapRoot.add(label);
      });
    }

    function addFlyLines(projector: Projector) {
      const source = cityMarks[0];
      const [sx, sy] = projector(source.coordinate);
      cityMarks.slice(1).forEach((target, index) => {
        const [tx, ty] = projector(target.coordinate);
        const mid = new THREE.Vector3((sx + tx) / 2, (sy + ty) / 2, 1.05 + index * 0.06);
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(sx, sy, 0.58), mid, new THREE.Vector3(tx, ty, 0.58));
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(56));
        const material = new THREE.LineDashedMaterial({
          color: mapTheme.primary,
          dashSize: 0.16,
          gapSize: 0.1,
          transparent: true,
          opacity: 0.58,
        });
        const line = new THREE.Line(geometry, material);
        line.computeLineDistances();
        line.userData.flyLine = true;
        mapRoot.add(line);
      });
    }

    function createChaseLight(collection: FeatureCollection, projector: Projector) {
      const rings = collection.features.flatMap((feature) => polygonsFromFeature(feature).map((polygon) => polygon[0]));
      const longest = rings.sort((a, b) => b.length - a.length)[0] ?? [];
      const points = simplifyRing(longest, 420).map((coordinate) => {
        const [x, y] = projector(coordinate);
        return new THREE.Vector3(x, y, 0.56);
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(points.slice(0, 22));
      const material = new THREE.LineBasicMaterial({ color: mapTheme.chase, transparent: true, opacity: 0.9 });
      const line = new THREE.Line(geometry, material);
      mapRoot.add(line);
      return { line, points };
    }

    function animate(chase?: { line: THREE.Line; points: THREE.Vector3[] }) {
      if (disposed) return;
      raf = requestAnimationFrame(() => animate(chase));
      const elapsed = (performance.now() - startedAt) / 1000;
      controls.update();
      mapRoot.rotation.z = -0.05 + Math.sin(elapsed * 0.25) * 0.018;

      for (const child of mapRoot.children) {
        if (child instanceof THREE.Line && child.userData.flyLine) {
          const material = child.material as THREE.LineDashedMaterial & { dashOffset: number };
          material.dashOffset = -elapsed * 0.42;
        }
      }

      if (chase && chase.points.length > 28) {
        frame = (frame + 1) % chase.points.length;
        const segment = [];
        for (let index = 0; index < 28; index += 1) {
          segment.push(chase.points[(frame + index) % chase.points.length]);
        }
        chase.line.geometry.dispose();
        chase.line.geometry = new THREE.BufferGeometry().setFromPoints(segment);
      }

      renderer.render(scene, camera);
    }

    function onPointerMove(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
      const stateGroup = hit?.object.userData.stateGroup as THREE.Group | undefined;
      const record = stateGroup?.userData.record as StateRecord | undefined;
      setHover(record ?? null);
    }

    function onPointerLeave() {
      setHover(null);
    }

    function onClick() {
      if (hover.current) setSelected(hover.current.name);
    }

    function setHover(next: StateRecord | null) {
      if (hover.current === next) return;
      if (hover.current) {
        const previous = hover.current;
        gsap.to(previous.root.position, { z: 0, duration: 0.22, ease: "power2.out", overwrite: true });
        previous.meshes.forEach((mesh) => {
          mesh.material = [topMaterial, sideMaterial];
        });
      }
      hover.current = next;
      if (next) {
        setSelected(next.name);
        gsap.to(next.root.position, { z: 0.25, duration: 0.24, ease: "power3.out", overwrite: true });
        next.meshes.forEach((mesh) => {
          mesh.material = [topHoverMaterial, sideHoverMaterial];
        });
      }
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("click", onClick);
      resizeObserver.disconnect();
      controls.dispose();
      gsap.killTweensOf(mapRoot.rotation);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
          object.geometry?.dispose?.();
          const material = object.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material?.dispose?.();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="map-shell" aria-label="Interactive 3D Nigeria creator payment map">
      <div ref={hostRef} className="map-host" />
      <div className="map-readout">
        <span>{status}</span>
        <strong>{selected}</strong>
      </div>
    </div>
  );
}

function createProjector(features: GeoFeature[]): Projector {
  const coordinates = features.flatMap((feature) => polygonsFromFeature(feature).flat(2));
  const lons = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const latScale = Math.cos((centerLat * Math.PI) / 180);
  const width = (maxLon - minLon) * latScale;
  const height = maxLat - minLat;
  const scale = 8 / Math.max(width, height);

  return ([lon, lat]) => [
    (lon - centerLon) * latScale * scale,
    (lat - centerLat) * scale,
  ];
}

function polygonsFromFeature(feature: GeoFeature): PolygonCoordinates[] {
  if (feature.geometry.type === "Polygon") return [feature.geometry.coordinates as PolygonCoordinates];
  return feature.geometry.coordinates as MultiPolygonCoordinates;
}

function shapeFromPolygon(polygon: PolygonCoordinates, projector: Projector): THREE.Shape {
  const outer = simplifyRing(polygon[0], 280).map(projector);
  const shape = new THREE.Shape();
  outer.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });

  polygon.slice(1, 4).forEach((ring) => {
    const path = new THREE.Path();
    simplifyRing(ring, 90).map(projector).forEach(([x, y], index) => {
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    shape.holes.push(path);
  });

  return shape;
}

function createOutline(ring: Coordinate[], projector: Projector, material: THREE.LineBasicMaterial, z: number): THREE.Line {
  const points = simplifyRing(ring, 220).map((coordinate) => {
    const [x, y] = projector(coordinate);
    return new THREE.Vector3(x, y, z);
  });
  if (points.length > 0) points.push(points[0].clone());
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function simplifyRing(ring: Coordinate[], maxPoints: number): Coordinate[] {
  if (ring.length <= maxPoints) return ring;
  const step = Math.ceil(ring.length / maxPoints);
  const sampled = ring.filter((_, index) => index % step === 0);
  const last = ring[ring.length - 1];
  const end = sampled[sampled.length - 1];
  if (last && end && (last[0] !== end[0] || last[1] !== end[1])) sampled.push(last);
  return sampled;
}

function createLabel(title: string, subtitle: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Sprite();

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  roundRect(context, 0, 10, 280, 76, 0);
  context.fill();
  context.strokeStyle = "rgba(5, 5, 5, 0.72)";
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = mapTheme.labelText;
  context.font = "900 24px Georgia";
  context.fillText(title, 24, 42);
  context.fillStyle = "rgba(5, 5, 5, 0.62)";
  context.font = "600 15px Arial";
  context.fillText(subtitle, 24, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.1, 0.38, 1);
  return sprite;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
}





