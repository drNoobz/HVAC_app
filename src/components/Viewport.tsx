'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getProduct } from '@/domain/catalog';
import type { EditorTool, PlacedEquipment, Room, Selection } from '@/domain/types';

const USE_COLOR: Record<string, number> = {
  Kitchen: 0xc5ddd6,
  'Hot line': 0xc5ddd6,
  Prep: 0xd5e4d8,
  Dish: 0xd7e3ea,
  'Walk-in': 0xd4e1ea,
  Dining: 0xd9e3f0,
  Bar: 0xe4ddd6,
  Restroom: 0xe7e2d4,
  Storage: 0xe6e1d2,
  'Dry storage': 0xe6e1d2,
  Corridor: 0xe1e6ea,
  Office: 0xdce6ea,
  Service: 0xddd9e6,
};

const SNAP_M = 0.05;
const MIN_DRAW_M = 0.4;
const DEFAULT_HEIGHT_M = 3.05;

export interface ViewportProps {
  rooms: Room[];
  equipment: PlacedEquipment[];
  selection: Selection;
  tool: EditorTool;
  fitToken: number;
  onSelect: (selection: Selection) => void;
  onDrawRoom: (rect: { xM: number; yM: number; lengthM: number; widthM: number }) => void;
  onPlace: (point: { xM: number; yM: number }) => void;
}

function snap(value: number): number {
  return Math.round(value / SNAP_M) * SNAP_M;
}

function disposeNode(node: THREE.Object3D): void {
  node.traverse(child => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    materials.forEach(item => {
      const textured = item as THREE.MeshStandardMaterial;
      textured.map?.dispose();
      item.dispose();
    });
  });
}

function makeLabel(text: string, accent: string): THREE.Sprite | null {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = 'rgba(255,255,255,0.92)';
  context.fillRect(8, 28, 496, 72);
  context.strokeStyle = accent;
  context.lineWidth = 6;
  context.strokeRect(8, 28, 496, 72);
  context.fillStyle = '#1c2430';
  context.font = '600 44px Segoe UI, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const clipped = text.length > 24 ? `${text.slice(0, 23)}…` : text;
  context.fillText(clipped, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(3.4, 0.85, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function openingFrame(room: Room, opening: Room['openings'][number]): { position: THREE.Vector3; size: THREE.Vector3 } {
  const thickness = 0.08;
  const z = room.zM + opening.sillM + opening.heightM / 2;
  if (opening.face === 'px' || opening.face === 'nx') {
    const x = opening.face === 'px' ? room.xM + room.lengthM : room.xM;
    const y = room.yM + opening.offsetM + opening.widthM / 2;
    return { position: new THREE.Vector3(x, y, z), size: new THREE.Vector3(thickness, opening.widthM, opening.heightM) };
  }
  const y = opening.face === 'py' ? room.yM + room.widthM : room.yM;
  const x = room.xM + opening.offsetM + opening.widthM / 2;
  return { position: new THREE.Vector3(x, y, z), size: new THREE.Vector3(opening.widthM, thickness, opening.heightM) };
}

export default function Viewport({ rooms, equipment, selection, tool, fitToken, onSelect, onDrawRoom, onPlace }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef(tool);
  const handlersRef = useRef({ onSelect, onDrawRoom, onPlace });
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const previewRef = useRef<THREE.Mesh | null>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const lastFit = useRef(-1);
  toolRef.current = tool;
  handlersRef.current = { onSelect, onDrawRoom, onPlace };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd7e1e8);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    camera.up.set(0, 0, 1);
    camera.position.set(14, -16, 12);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(8, 6, 1);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.update();

    scene.add(new THREE.HemisphereLight(0xf7fafc, 0xc5d0d6, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(18, -24, 28);
    scene.add(sun);
    const grid = new THREE.GridHelper(80, 80, 0x8aa0ae, 0xc9d3db);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    scene.add(new THREE.AxesHelper(2));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    scene.add(ground);
    const preview = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x0f6e78, transparent: true, opacity: 0.35, roughness: 0.8 })
    );
    preview.visible = false;
    scene.add(preview);

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    groundRef.current = ground;
    previewRef.current = preview;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let drawing = false;
    let start: THREE.Vector3 | null = null;
    let downX = 0;
    let downY = 0;

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width < 1 || height < 1) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const pointOnGround = (event: PointerEvent): THREE.Vector3 | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(ground)[0];
      return hit ? hit.point : null;
    };

    const updatePreview = (end: THREE.Vector3) => {
      if (!start) return;
      const x = snap(Math.min(start.x, end.x));
      const y = snap(Math.min(start.y, end.y));
      const length = Math.max(snap(Math.abs(end.x - start.x)), SNAP_M);
      const width = Math.max(snap(Math.abs(end.y - start.y)), SNAP_M);
      preview.visible = true;
      preview.scale.set(length, width, DEFAULT_HEIGHT_M);
      preview.position.set(x + length / 2, y + width / 2, DEFAULT_HEIGHT_M / 2);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      downX = event.clientX;
      downY = event.clientY;
      const point = pointOnGround(event);
      if (toolRef.current.kind === 'draw' && point) {
        drawing = true;
        start = point.clone();
        controls.enabled = false;
        renderer.domElement.setPointerCapture(event.pointerId);
        updatePreview(point);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drawing) return;
      const point = pointOnGround(event);
      if (point) updatePreview(point);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
      const point = pointOnGround(event);
      if (drawing && start && point) {
        const xM = snap(Math.min(start.x, point.x));
        const yM = snap(Math.min(start.y, point.y));
        const lengthM = snap(Math.abs(point.x - start.x));
        const widthM = snap(Math.abs(point.y - start.y));
        if (lengthM >= MIN_DRAW_M && widthM >= MIN_DRAW_M) handlersRef.current.onDrawRoom({ xM, yM, lengthM, widthM });
        drawing = false;
        start = null;
        preview.visible = false;
        controls.enabled = true;
        return;
      }
      if (moved < 5 && toolRef.current.kind === 'place' && point) {
        handlersRef.current.onPlace({ xM: snap(point.x), yM: snap(point.y) });
        return;
      }
      if (moved < 5 && toolRef.current.kind === 'select') {
        raycaster.setFromCamera(pointer, camera);
        const group = contentRef.current;
        const hits = group ? raycaster.intersectObjects(group.children, true) : [];
        let picked: Selection | null = null;
        for (const hit of hits) {
          let object: THREE.Object3D | null = hit.object;
          while (object) {
            if (object.userData.kind === 'room' || object.userData.kind === 'equipment') {
              picked = { kind: object.userData.kind, id: object.userData.id as string };
              break;
            }
            object = object.parent;
          }
          if (picked) break;
        }
        handlersRef.current.onSelect(picked ?? { kind: 'project' });
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown, true);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      preview.geometry.dispose();
      (preview.material as THREE.Material).dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      contentRef.current = null;
      lastFit.current = -1;
    };
  }, []);

  useEffect(() => {
    if (tool.kind !== 'draw' && previewRef.current) previewRef.current.visible = false;
    if (hostRef.current) hostRef.current.dataset.tool = tool.kind;
  }, [tool]);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) return;
    const group = new THREE.Group();
    scene.add(group);
    contentRef.current = group;

    rooms.forEach(room => {
      if (room.lengthM <= 0 || room.widthM <= 0 || room.heightM <= 0) return;
      const selected = selection.kind === 'room' && selection.id === room.id;
      const wrap = new THREE.Group();
      wrap.userData = { kind: 'room', id: room.id };
      const geometry = new THREE.BoxGeometry(room.lengthM, room.widthM, room.heightM);
      const material = new THREE.MeshStandardMaterial({
        color: USE_COLOR[room.use] ?? 0xd5dee6,
        roughness: 0.88,
        metalness: 0.02,
        emissive: selected ? 0x0f6e78 : 0x000000,
        emissiveIntensity: selected ? 0.22 : 0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(room.xM + room.lengthM / 2, room.yM + room.widthM / 2, room.zM + room.heightM / 2);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: selected ? 0x0c6c74 : 0x5c6d78 })
      );
      edges.position.copy(mesh.position);
      wrap.add(mesh, edges);
      room.openings.forEach(opening => {
        const frame = openingFrame(room, opening);
        const openingMesh = new THREE.Mesh(
          new THREE.BoxGeometry(frame.size.x, frame.size.y, frame.size.z),
          new THREE.MeshStandardMaterial({ color: opening.kind === 'window' ? 0x6f93a8 : 0x6b5344, roughness: 0.7 })
        );
        openingMesh.position.copy(frame.position);
        wrap.add(openingMesh);
      });
      const label = makeLabel(room.name, selected ? '#0f6e78' : '#5c6d78');
      if (label) {
        label.position.set(room.xM + room.lengthM / 2, room.yM + room.widthM / 2, room.zM + room.heightM + 0.45);
        wrap.add(label);
      }
      group.add(wrap);
    });

    equipment.forEach(item => {
      const product = getProduct(item.catalogId);
      const size = product?.dimensions ?? { lengthM: 0.6, widthM: 0.6, heightM: 0.6 };
      const missingSize = !product?.dimensions;
      const selected = selection.kind === 'equipment' && selection.id === item.id;
      const wrap = new THREE.Group();
      wrap.userData = { kind: 'equipment', id: item.id };
      const geometry = new THREE.BoxGeometry(size.lengthM, size.widthM, size.heightM);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: missingSize ? 0xc4a574 : 0x1f4e5f,
          roughness: 0.55,
          metalness: 0.08,
          emissive: selected ? 0x0f6e78 : 0x000000,
          emissiveIntensity: selected ? 0.2 : 0,
        })
      );
      mesh.position.set(item.xM, item.yM, item.zM + size.heightM / 2);
      mesh.rotation.z = (item.yawDeg * Math.PI) / 180;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: selected ? 0x0c6c74 : 0xb86e00 })
      );
      edges.position.copy(mesh.position);
      edges.rotation.z = mesh.rotation.z;
      wrap.add(mesh, edges);
      if (item.quantity > 1) {
        const label = makeLabel(`×${item.quantity}`, '#b86e00');
        if (label) {
          label.scale.set(1.2, 0.32, 1);
          label.position.set(item.xM, item.yM, item.zM + size.heightM + 0.35);
          wrap.add(label);
        }
      }
      group.add(wrap);
    });

    if (lastFit.current !== fitToken) {
      lastFit.current = fitToken;
      const box = new THREE.Box3().setFromObject(group);
      if (rooms.length && !box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const span = Math.max(size.x, size.y, size.z, 6);
        camera.position.set(center.x + span * 0.85, center.y - span * 1.15, center.z + span * 0.85);
        controls.target.copy(center);
      } else {
        camera.position.set(10, -12, 8);
        controls.target.set(2, 2, 0);
      }
      controls.update();
    }

    return () => {
      scene.remove(group);
      disposeNode(group);
      if (contentRef.current === group) contentRef.current = null;
    };
  }, [rooms, equipment, selection, fitToken]);

  return <div ref={hostRef} className="viewport-canvas" />;
}
