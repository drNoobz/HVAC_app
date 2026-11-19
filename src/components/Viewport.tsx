'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getProduct } from '@/domain/catalog';
import type { EditorTool, PlacedEquipment, Project, Room, Selection, WallFace, WallRun } from '@/domain/types';
import { outlineCentroid, runGeom, solidSpans, WALL_THICK_M } from '@/domain/wallDraw';
import { doorArc, doorHinge, doorSwingSide } from '@/domain/doorSwing';
import { INTERFACE_COLOR, MARK_COLOR, colorNumber, edgePortions, facePortions, interfaceConstructionColor, portionFill, portionInterfaceKey, roomFill, snapDrawnRect, snapPointToWalls } from '@/domain/walls';

const SNAP_M = 0.05;
const MIN_DRAW_M = 0.4;
const DEFAULT_HEIGHT_M = 3.05;
const SHELL_M = 0.15;
const SLAB_M = 0.05;
const CLICK_PX = 10;
const OPENING_PICK_PX = 14;
const OPENING_BIAS_M = 0.45;
const SELECT_GLOW = 0xf6ad55;
const SELECT_EDGE = 0xd9843f;
const HIGHLIGHT_OPACITY = 0.28;
const EDGE_COLOR = 0x5c6d78;

export interface ViewportProps {
  rooms: Room[];
  equipment: PlacedEquipment[];
  wallRuns?: WallRun[];
  interfaceWalls?: Project['interfaceWalls'];
  cameraPose?: 'orbit' | 'top';
  onCameraSettled?: (pose: 'orbit' | 'top') => void;
  selection: Selection;
  tool: EditorTool;
  fitToken: number;
  hideRoof: boolean;
  onSelect: (selection: Selection) => void;
  onDrawRoom: (rect: { xM: number; yM: number; lengthM: number; widthM: number }) => void;
  onPlace: (point: { xM: number; yM: number }) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
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

type Panel = { u: number; v: number; du: number; dv: number };

function subtractPanel(panel: Panel, hole: Panel): Panel[] {
  const x0 = panel.u;
  const y0 = panel.v;
  const x1 = panel.u + panel.du;
  const y1 = panel.v + panel.dv;
  const ix0 = Math.max(x0, hole.u);
  const iy0 = Math.max(y0, hole.v);
  const ix1 = Math.min(x1, hole.u + hole.du);
  const iy1 = Math.min(y1, hole.v + hole.dv);
  if (ix1 <= ix0 + 1e-4 || iy1 <= iy0 + 1e-4) return [panel];
  const parts: Panel[] = [];
  if (iy0 > y0 + 0.01) parts.push({ u: x0, v: y0, du: x1 - x0, dv: iy0 - y0 });
  if (y1 > iy1 + 0.01) parts.push({ u: x0, v: iy1, du: x1 - x0, dv: y1 - iy1 });
  if (ix0 > x0 + 0.01) parts.push({ u: x0, v: iy0, du: ix0 - x0, dv: iy1 - iy0 });
  if (x1 > ix1 + 0.01) parts.push({ u: ix1, v: iy0, du: x1 - ix1, dv: iy1 - iy0 });
  return parts;
}

function wallPanels(span: number, height: number, openings: Room['openings']): Panel[] {
  let panels: Panel[] = [{ u: 0, v: 0, du: span, dv: height }];
  openings.forEach(opening => {
    const hole = { u: opening.offsetM, v: opening.sillM, du: opening.widthM, dv: opening.heightM };
    panels = panels.flatMap(panel => subtractPanel(panel, hole));
  });
  return panels;
}

type PickData = {
  kind?: string;
  id?: string;
  roomId?: string;
  face?: string;
  wallFace?: string;
  edge?: number;
  interfaceKey?: string;
  highlight?: THREE.Mesh;
  edgeRole?: number;
  baseEdge?: number;
  wallId?: string;
};

function shellMaterial(color: number, opacity = 1, bias = 1): THREE.MeshStandardMaterial {
  const transparent = opacity < 1;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
    transparent,
    opacity,
    depthWrite: !transparent,
    polygonOffset: true,
    polygonOffsetFactor: bias,
    polygonOffsetUnits: bias * 2,
  });
}

function depthBias(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash + id.charCodeAt(index) * (index + 1)) % 8;
  return 1 + hash;
}

function matchesSelection(data: PickData, selection: Selection): boolean {
  if (selection.kind === 'interface') return data.interfaceKey === selection.key;
  if (data.kind === 'surface' && data.roomId && data.face) {
    if (selection.kind === 'room' && selection.id === data.roomId) return true;
    if (selection.kind !== 'surface' || selection.roomId !== data.roomId || selection.face !== data.face) return false;
    if (data.face === 'walls' && (selection.edge != null || data.edge != null)) return selection.edge === data.edge;
    if (data.face !== 'walls' || !selection.wallFace || !data.wallFace) return true;
    return data.wallFace === selection.wallFace;
  }
  if (data.kind === 'opening' && data.roomId && data.id) {
    if (selection.kind === 'room' && selection.id === data.roomId) return true;
    return selection.kind === 'opening' && selection.roomId === data.roomId && selection.id === data.id;
  }
  if (data.kind === 'equipment' && data.id) return selection.kind === 'equipment' && selection.id === data.id;
  if (data.kind === 'wallRun' && data.id) return selection.kind === 'wallRun' && selection.id === data.id;
  if (data.kind === 'wallOpening' && data.id) return selection.kind === 'wallOpening' && selection.id === data.id;
  return false;
}

function paintSelection(group: THREE.Object3D, selection: Selection): void {
  group.traverse(object => {
    const data = object.userData as PickData;
    if (data.highlight) data.highlight.visible = matchesSelection(data, selection);
    if (data.edgeRole && (object as THREE.Line).isLine) {
      const material = (object as THREE.Line).material as THREE.LineBasicMaterial;
      material.color.setHex(matchesSelection(data, selection) ? SELECT_EDGE : (data.baseEdge ?? EDGE_COLOR));
    }
  });
}

function attachHighlight(mesh: THREE.Mesh, size: [number, number, number]): void {
  const pad = 0.012;
  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(size[0] + pad, size[1] + pad, size[2] + pad),
    new THREE.MeshBasicMaterial({
      color: SELECT_GLOW,
      transparent: true,
      opacity: HIGHLIGHT_OPACITY,
      depthWrite: false,
      side: THREE.FrontSide,
    })
  );
  highlight.visible = false;
  highlight.raycast = () => undefined;
  highlight.renderOrder = 3;
  mesh.add(highlight);
  mesh.userData.highlight = highlight;
}

function addOutline(parent: THREE.Object3D, corners: THREE.Vector3[], userData: PickData): void {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([...corners, corners[0]]),
    new THREE.LineBasicMaterial({ color: userData.baseEdge ?? EDGE_COLOR, depthWrite: false })
  );
  line.userData = userData;
  line.raycast = () => undefined;
  line.renderOrder = 4;
  parent.add(line);
}

function wallOutline(room: Room, face: WallFace): THREE.Vector3[] {
  const nudge = 0.008;
  const z0 = room.zM;
  const z1 = room.zM + room.heightM;
  const y0 = room.yM;
  const y1 = room.yM + room.widthM;
  const x0 = room.xM;
  const x1 = room.xM + room.lengthM;
  if (face === 'px') {
    const x = x1 + nudge;
    return [new THREE.Vector3(x, y0, z0), new THREE.Vector3(x, y1, z0), new THREE.Vector3(x, y1, z1), new THREE.Vector3(x, y0, z1)];
  }
  if (face === 'nx') {
    const x = x0 - nudge;
    return [new THREE.Vector3(x, y0, z0), new THREE.Vector3(x, y1, z0), new THREE.Vector3(x, y1, z1), new THREE.Vector3(x, y0, z1)];
  }
  if (face === 'py') {
    const y = y1 + nudge;
    return [new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y, z0), new THREE.Vector3(x1, y, z1), new THREE.Vector3(x0, y, z1)];
  }
  const y = y0 - nudge;
  return [new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y, z0), new THREE.Vector3(x1, y, z1), new THREE.Vector3(x0, y, z1)];
}

function openingOutline(room: Room, opening: Room['openings'][number]): THREE.Vector3[] {
  const nudge = 0.014;
  const z0 = room.zM + opening.sillM;
  const z1 = z0 + opening.heightM;
  if (opening.face === 'px' || opening.face === 'nx') {
    const x = (opening.face === 'px' ? room.xM + room.lengthM + nudge : room.xM - nudge);
    const y0 = room.yM + opening.offsetM;
    const y1 = y0 + opening.widthM;
    return [new THREE.Vector3(x, y0, z0), new THREE.Vector3(x, y1, z0), new THREE.Vector3(x, y1, z1), new THREE.Vector3(x, y0, z1)];
  }
  const y = opening.face === 'py' ? room.yM + room.widthM + nudge : room.yM - nudge;
  const x0 = room.xM + opening.offsetM;
  const x1 = x0 + opening.widthM;
  return [new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y, z0), new THREE.Vector3(x1, y, z1), new THREE.Vector3(x0, y, z1)];
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  userData: PickData,
  withEdges: boolean,
  yaw = 0,
): void {
  if (size.some(value => value <= 0.001)) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.z = yaw;
  mesh.userData = { ...userData };
  if ((material as THREE.Material).transparent) mesh.renderOrder = 2;
  attachHighlight(mesh, size);
  if (withEdges) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: EDGE_COLOR, depthWrite: false })
    );
    edges.raycast = () => undefined;
    edges.renderOrder = 4;
    edges.userData = { ...userData, edgeRole: 1, baseEdge: EDGE_COLOR };
    mesh.add(edges);
  }
  parent.add(mesh);
}

function addDrawnWalls(group: THREE.Group, runs: readonly WallRun[]): void {
  const height = DEFAULT_HEIGHT_M;
  for (const run of runs) {
    const geom = runGeom(run);
    if (geom.length < 0.05) continue;
    const yaw = Math.atan2(geom.dy, geom.dx);
    for (const [start, end] of solidSpans(geom.length, run.openings)) {
      const len = end - start;
      if (len < 0.02) continue;
      const mid = (start + end) / 2;
      addBox(
        group,
        [len, WALL_THICK_M, height],
        [geom.x0 + geom.dx * mid, geom.y0 + geom.dy * mid, height / 2],
        shellMaterial(0x60707a, 1, 2),
        { kind: 'wallRun', id: run.id },
        true,
        yaw,
      );
    }
    for (const opening of run.openings) {
      const mid = opening.offsetM + opening.widthM / 2;
      const door = opening.kind === 'door';
      const slabH = door ? 2.13 : 1.2;
      const slabZ = door ? slabH / 2 : 0.9 + slabH / 2;
      addBox(
        group,
        [opening.widthM, 0.04, slabH],
        [geom.x0 + geom.dx * mid, geom.y0 + geom.dy * mid, slabZ],
        shellMaterial(colorNumber(door ? MARK_COLOR.door : MARK_COLOR.window), 1, 3),
        { kind: 'wallOpening', id: opening.id, wallId: run.id },
        true,
        yaw,
      );
    }
  }
}

function addPolygonRoom(group: THREE.Group, room: Room, rooms: readonly Room[], interfaceWalls: Project['interfaceWalls'], hideRoof: boolean): void {
  const loop = room.outline;
  if (!loop || loop.length < 3 || room.heightM <= 0) return;
  const floorColor = colorNumber(roomFill(room.use));
  const bias = depthBias(room.id);
  const wrap = new THREE.Group();
  wrap.userData = { kind: 'room', id: room.id };
  const shape = new THREE.Shape();
  shape.moveTo(loop[0].x, loop[0].y);
  for (let i = 1; i < loop.length; i += 1) shape.lineTo(loop[i].x, loop[i].y);
  shape.closePath();
  const slab = new THREE.ExtrudeGeometry(shape, { depth: SLAB_M, bevelEnabled: false });
  const addSlab = (z: number, face: 'floor' | 'ceiling') => {
    const mesh = new THREE.Mesh(slab.clone(), shellMaterial(floorColor, 1, bias));
    mesh.position.z = z;
    mesh.userData = { kind: 'surface', roomId: room.id, face };
    const highlight = new THREE.Mesh(
      slab.clone(),
      new THREE.MeshBasicMaterial({ color: SELECT_GLOW, transparent: true, opacity: HIGHLIGHT_OPACITY, depthWrite: false, side: THREE.FrontSide }),
    );
    highlight.position.z = 0.01;
    highlight.visible = false;
    highlight.raycast = () => undefined;
    mesh.add(highlight);
    mesh.userData.highlight = highlight;
    wrap.add(mesh);
  };
  addSlab(room.zM + 0.012, 'floor');
  if (!hideRoof) addSlab(room.zM + room.heightM - SLAB_M, 'ceiling');
  slab.dispose();
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const geom = runGeom({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    if (geom.length < 0.05) continue;
    const constructionId = room.edgeWalls?.[i]?.constructionId;
    const spans = edgePortions(room, i, rooms);
    (spans.length > 0 ? spans : [{ startM: 0, endM: geom.length, kind: 'outside' as const, names: [], roomIds: [], anchors: [] }]).forEach(portion => {
      const length = portion.endM - portion.startM;
      if (length < 0.05) return;
      const mid = (portion.startM + portion.endM) / 2;
      const interfaceKey = portionInterfaceKey(room, portion, { edge: i }, spans);
      const own = interfaceKey ? interfaceConstructionColor(interfaceWalls?.[interfaceKey]) : null;
      const color = own ?? (portion.kind === 'interface' ? INTERFACE_COLOR : portionFill(constructionId, 'outside'));
      addBox(
        wrap,
        [length, SHELL_M, room.heightM],
        [a.x + geom.dx * mid, a.y + geom.dy * mid, room.zM + room.heightM / 2],
        shellMaterial(colorNumber(color), 1, bias),
        {
          kind: 'surface',
          roomId: room.id,
          face: 'walls',
          edge: i,
          ...(interfaceKey ? { interfaceKey } : {}),
        },
        false,
        Math.atan2(geom.dy, geom.dx),
      );
    });
  }
  const center = outlineCentroid(loop);
  const label = makeLabel(room.name, '#5c6d78');
  if (label) {
    label.raycast = () => undefined;
    label.position.set(center.x, center.y, room.zM + room.heightM + 0.45);
    wrap.add(label);
  }
  group.add(wrap);
}

function isLine(object: THREE.Object3D): boolean {
  return (object as THREE.Line).isLine === true;
}

function selectionFromObject(object: THREE.Object3D): Selection | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const data = current.userData as { kind?: string; id?: string; roomId?: string; face?: string; wallFace?: string; wallId?: string; edge?: number; interfaceKey?: string };
    if (data.interfaceKey) return { kind: 'interface', key: data.interfaceKey };
    if (data.kind === 'wallOpening' && data.wallId && data.id) return { kind: 'wallOpening', wallId: data.wallId, id: data.id };
    if (data.kind === 'wallRun' && data.id) return { kind: 'wallRun', id: data.id };
    if (data.kind === 'opening' && data.roomId && data.id) return { kind: 'opening', roomId: data.roomId, id: data.id };
    if (data.kind === 'surface' && data.roomId && (data.face === 'floor' || data.face === 'ceiling' || data.face === 'walls')) {
      const wallFace = data.wallFace;
      return {
        kind: 'surface',
        roomId: data.roomId,
        face: data.face,
        ...(data.face === 'walls' && (wallFace === 'px' || wallFace === 'nx' || wallFace === 'py' || wallFace === 'ny') ? { wallFace } : {}),
        ...(data.face === 'walls' && typeof data.edge === 'number' ? { edge: data.edge } : {}),
      };
    }
    if (data.kind === 'equipment' && data.id) return { kind: 'equipment', id: data.id };
    if (data.kind === 'room' && data.id) return { kind: 'room', id: data.id };
    current = current.parent;
  }
  return null;
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

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function viewPoses(rooms: readonly Room[]): {
  top: { position: THREE.Vector3; target: THREE.Vector3 };
  orbit: { position: THREE.Vector3; target: THREE.Vector3 };
} {
  const box = new THREE.Box3();
  rooms.forEach(room => {
    box.expandByPoint(new THREE.Vector3(room.xM, room.yM, room.zM));
    box.expandByPoint(new THREE.Vector3(room.xM + room.lengthM, room.yM + room.widthM, room.zM + room.heightM));
  });
  const center = rooms.length && !box.isEmpty() ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(2, 2, 1);
  const size = rooms.length && !box.isEmpty() ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(8, 8, 3);
  const span = Math.max(size.x, size.y, size.z, 6);
  return {
    top: {
      position: new THREE.Vector3(center.x, center.y - span * 0.18, center.z + span * 1.45),
      target: center.clone(),
    },
    orbit: {
      position: new THREE.Vector3(center.x + span * 0.85, center.y - span * 1.15, center.z + span * 0.85),
      target: center.clone(),
    },
  };
}

export default function Viewport({ rooms, equipment, wallRuns = [], interfaceWalls, selection, tool, fitToken, hideRoof, cameraPose = 'orbit', onCameraSettled, onSelect, onDrawRoom, onPlace, onContextMenu }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef(tool);
  const handlersRef = useRef({ onSelect, onDrawRoom, onPlace, onContextMenu });
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const previewRef = useRef<THREE.Mesh | null>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const paintRef = useRef<(next: Selection) => void>(() => undefined);
  const selectionRef = useRef(selection);
  const roomsRef = useRef(rooms);
  const poseListenerRef = useRef(onCameraSettled);
  const enteredRef = useRef(false);
  const blendRef = useRef<{
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPos: THREE.Vector3;
    toTarget: THREE.Vector3;
    start: number;
    duration: number;
    pose: 'orbit' | 'top';
  } | null>(null);
  selectionRef.current = selection;
  toolRef.current = tool;
  roomsRef.current = rooms;
  poseListenerRef.current = onCameraSettled;
  handlersRef.current = { onSelect, onDrawRoom, onPlace, onContextMenu };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd7e1e8);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    camera.up.set(0, 0, 1);
    const overhead = viewPoses(roomsRef.current).top;
    camera.position.copy(overhead.position);
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(overhead.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomSpeed = 0.45;
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
      new THREE.MeshStandardMaterial({ color: colorNumber(MARK_COLOR.equipment), transparent: true, opacity: 0.35, roughness: 0.8 })
    );
    preview.visible = false;
    scene.add(preview);

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    groundRef.current = ground;
    previewRef.current = preview;

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.001;
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

    const setPointer = (clientX: number, clientY: number): boolean => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      return true;
    };

    const pointOnGround = (event: PointerEvent): THREE.Vector3 | null => {
      if (!setPointer(event.clientX, event.clientY)) return null;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(ground)[0];
      return hit ? hit.point : null;
    };

    const closestHit = (): { selection: Selection; distance: number } | null => {
      const group = contentRef.current;
      if (!group) return null;
      const hits = raycaster.intersectObjects(group.children, true);
      for (const hit of hits) {
        if (isLine(hit.object)) continue;
        const selection = selectionFromObject(hit.object);
        if (selection) return { selection, distance: hit.distance };
      }
      return null;
    };

    const pickSelection = (event: { clientX: number; clientY: number }): Selection => {
      if (!setPointer(event.clientX, event.clientY)) return { kind: 'project' };
      raycaster.setFromCamera(pointer, camera);
      const center = closestHit();
      let opening = center?.selection.kind === 'opening' ? center : null;
      const samples = [
        [OPENING_PICK_PX, 0],
        [-OPENING_PICK_PX, 0],
        [0, OPENING_PICK_PX],
        [0, -OPENING_PICK_PX],
        [OPENING_PICK_PX, OPENING_PICK_PX],
        [OPENING_PICK_PX, -OPENING_PICK_PX],
        [-OPENING_PICK_PX, OPENING_PICK_PX],
        [-OPENING_PICK_PX, -OPENING_PICK_PX],
      ];
      const limit = (center?.distance ?? Number.POSITIVE_INFINITY) + OPENING_BIAS_M;
      for (const [dx, dy] of samples) {
        if (!setPointer(event.clientX + dx, event.clientY + dy)) continue;
        raycaster.setFromCamera(pointer, camera);
        const found = closestHit();
        if (found?.selection.kind !== 'opening') continue;
        if (found.distance <= limit && (!opening || found.distance < opening.distance)) opening = found;
      }
      return opening?.selection ?? center?.selection ?? { kind: 'project' };
    };

    const updatePreview = (end: THREE.Vector3) => {
      if (!start) return;
      const rect = snapDrawnRect(start.x, start.y, snap(end.x), snap(end.y), roomsRef.current);
      const length = Math.max(rect.lengthM, SNAP_M);
      const width = Math.max(rect.widthM, SNAP_M);
      preview.visible = true;
      preview.scale.set(length, width, DEFAULT_HEIGHT_M);
      preview.position.set(rect.xM + length / 2, rect.yM + width / 2, DEFAULT_HEIGHT_M / 2);
    };

    let rightX = 0;
    let rightY = 0;
    let sawRight = false;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 2) {
        sawRight = true;
        rightX = event.clientX;
        rightY = event.clientY;
        return;
      }
      if (event.button !== 0) return;
      downX = event.clientX;
      downY = event.clientY;
      const point = pointOnGround(event);
      if (toolRef.current.kind === 'draw' && point) {
        const origin = snapPointToWalls(snap(point.x), snap(point.y), roomsRef.current);
        drawing = true;
        start = new THREE.Vector3(origin.x, origin.y, point.z);
        controls.enabled = false;
        renderer.domElement.setPointerCapture(event.pointerId);
        updatePreview(start);
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
        const rect = snapDrawnRect(start.x, start.y, snap(point.x), snap(point.y), roomsRef.current);
        if (rect.lengthM >= MIN_DRAW_M && rect.widthM >= MIN_DRAW_M) handlersRef.current.onDrawRoom(rect);
        drawing = false;
        start = null;
        preview.visible = false;
        controls.enabled = true;
        return;
      }
      if (moved < CLICK_PX && toolRef.current.kind === 'place' && point) {
        handlersRef.current.onPlace({ xM: snap(point.x), yM: snap(point.y) });
        return;
      }
      if (moved < CLICK_PX && toolRef.current.kind === 'select') {
        const picked = pickSelection(event);
        if (contentRef.current) paintSelection(contentRef.current, picked);
        renderer.render(scene, camera);
        handlersRef.current.onSelect(picked);
      }
    };

    const onContextMenuEvent = (event: MouseEvent) => {
      event.preventDefault();
      const dragged = sawRight && Math.hypot(event.clientX - rightX, event.clientY - rightY) > CLICK_PX;
      sawRight = false;
      if (dragged) return;
      const picked = pickSelection(event);
      if (picked.kind === 'project') return;
      handlersRef.current.onContextMenu(picked, event.clientX, event.clientY);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('contextmenu', onContextMenuEvent);

    const onControlStart = () => {
      blendRef.current = null;
    };
    controls.addEventListener('start', onControlStart);

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const blend = blendRef.current;
      if (blend) {
        const t = Math.min(1, (performance.now() - blend.start) / blend.duration);
        const eased = easeInOut(t);
        camera.position.lerpVectors(blend.fromPos, blend.toPos, eased);
        controls.target.lerpVectors(blend.fromTarget, blend.toTarget, eased);
        if (t >= 1) {
          blendRef.current = null;
          poseListenerRef.current?.(blend.pose);
        }
      }
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
      renderer.domElement.removeEventListener('contextmenu', onContextMenuEvent);
      controls.removeEventListener('start', onControlStart);
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
    };
  }, []);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const poses = viewPoses(roomsRef.current);
    const dest = cameraPose === 'top' ? poses.top : poses.orbit;
    const fromPlan = cameraPose === 'orbit' && !enteredRef.current;
    enteredRef.current = true;
    const fromPos = (fromPlan ? poses.top.position : camera.position).clone();
    const fromTarget = (fromPlan ? poses.top.target : controls.target).clone();
    camera.position.copy(fromPos);
    controls.target.copy(fromTarget);
    blendRef.current = {
      fromPos,
      fromTarget,
      toPos: dest.position.clone(),
      toTarget: dest.target.clone(),
      start: performance.now(),
      duration: 720,
      pose: cameraPose,
    };
  }, [cameraPose, fitToken]);

  useEffect(() => {
    if (tool.kind !== 'draw' && previewRef.current) previewRef.current.visible = false;
    if (hostRef.current) hostRef.current.dataset.tool = tool.kind;
  }, [tool]);

  useEffect(() => {
    paintRef.current(selection);
  }, [selection]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const group = new THREE.Group();
    scene.add(group);
    contentRef.current = group;

    rooms.forEach(room => {
      if (room.outline && room.outline.length >= 3) {
        addPolygonRoom(group, room, rooms, interfaceWalls, hideRoof);
        return;
      }
      if (room.lengthM <= 0 || room.widthM <= 0 || room.heightM <= 0) return;
      const floorColor = colorNumber(roomFill(room.use));
      const bias = depthBias(room.id);
      const wrap = new THREE.Group();
      wrap.userData = { kind: 'room', id: room.id };
      const gap = 0.015;
      const insetX = Math.min(SHELL_M + gap, room.lengthM * 0.45);
      const insetY = Math.min(SHELL_M + gap, room.widthM * 0.45);
      const floorData: PickData = { kind: 'surface', roomId: room.id, face: 'floor' };
      const x0 = room.xM + insetX;
      const x1 = room.xM + room.lengthM - insetX;
      const y0 = room.yM + insetY;
      const y1 = room.yM + room.widthM - insetY;
      addBox(
        wrap,
        [Math.max(room.lengthM - insetX * 2, 0.05), Math.max(room.widthM - insetY * 2, 0.05), SLAB_M],
        [room.xM + room.lengthM / 2, room.yM + room.widthM / 2, room.zM + 0.012 + SLAB_M / 2],
        shellMaterial(floorColor, 1, bias),
        floorData,
        false
      );
      addOutline(wrap, [
        new THREE.Vector3(x0, y0, room.zM + 0.012 + SLAB_M + 0.006),
        new THREE.Vector3(x1, y0, room.zM + 0.012 + SLAB_M + 0.006),
        new THREE.Vector3(x1, y1, room.zM + 0.012 + SLAB_M + 0.006),
        new THREE.Vector3(x0, y1, room.zM + 0.012 + SLAB_M + 0.006),
      ], { ...floorData, edgeRole: 1, baseEdge: EDGE_COLOR });
      if (!hideRoof) {
        const ceilingData: PickData = { kind: 'surface', roomId: room.id, face: 'ceiling' };
        addBox(
          wrap,
          [Math.max(room.lengthM - insetX * 2, 0.05), Math.max(room.widthM - insetY * 2, 0.05), SLAB_M],
          [room.xM + room.lengthM / 2, room.yM + room.widthM / 2, room.zM + room.heightM - SLAB_M / 2],
          shellMaterial(floorColor, 1, bias),
          ceilingData,
          false
        );
        const ceilingZ = room.zM + room.heightM + 0.006;
        addOutline(wrap, [
          new THREE.Vector3(x0, y0, ceilingZ),
          new THREE.Vector3(x1, y0, ceilingZ),
          new THREE.Vector3(x1, y1, ceilingZ),
          new THREE.Vector3(x0, y1, ceilingZ),
        ], { ...ceilingData, edgeRole: 1, baseEdge: EDGE_COLOR });
      }
      (['px', 'nx', 'py', 'ny'] as const).forEach(face => {
        const alongX = face === 'py' || face === 'ny';
        const span = alongX ? room.lengthM : room.widthM;
        const trim = alongX ? Math.min(SHELL_M + 0.004, Math.max(0, span / 2 - 0.02)) : 0;
        const constructionId = room.surfaces.walls[face].constructionId;
        const portions = facePortions(room, face, rooms);
        const panels = wallPanels(
          span,
          room.heightM,
          room.openings.filter(opening => opening.face === face)
        );
        panels.forEach(panel => {
          let u = panel.u;
          let du = panel.du;
          if (trim > 0) {
            const u0 = Math.max(panel.u, trim);
            const u1 = Math.min(panel.u + panel.du, span - trim);
            if (u1 - u0 <= 0.01) return;
            u = u0;
            du = u1 - u0;
          }
          const slices = portions.flatMap(portion => {
            const a = Math.max(u, portion.startM);
            const b = Math.min(u + du, portion.endM);
            if (b - a <= 0.01) return [];
            return [{ u: a, du: b - a, kind: portion.kind, portion }];
          });
          (slices.length > 0 ? slices : [{ u, du, kind: 'outside' as const, portion: undefined }]).forEach(slice => {
            const x = alongX
              ? room.xM + slice.u + slice.du / 2
              : face === 'px'
                ? room.xM + room.lengthM - SHELL_M / 2
                : room.xM + SHELL_M / 2;
            const y = alongX
              ? face === 'py'
                ? room.yM + room.widthM - SHELL_M / 2
                : room.yM + SHELL_M / 2
              : room.yM + slice.u + slice.du / 2;
            const interfaceKey = slice.portion ? portionInterfaceKey(room, slice.portion, { wallFace: face }, portions) ?? undefined : undefined;
            const own = interfaceKey ? interfaceConstructionColor(interfaceWalls?.[interfaceKey]) : null;
            const color = own ?? (slice.kind === 'interface' ? INTERFACE_COLOR : portionFill(constructionId, 'outside'));
            addBox(
              wrap,
              alongX ? [slice.du, SHELL_M, panel.dv] : [SHELL_M, slice.du, panel.dv],
              [x, y, room.zM + panel.v + panel.dv / 2],
              shellMaterial(colorNumber(color), 1, bias),
              {
                kind: 'surface',
                roomId: room.id,
                face: 'walls',
                wallFace: face,
                ...(interfaceKey ? { interfaceKey } : {}),
              },
              false
            );
          });
        });
        addOutline(wrap, wallOutline(room, face), {
          kind: 'surface',
          roomId: room.id,
          face: 'walls',
          wallFace: face,
          edgeRole: 1,
          baseEdge: EDGE_COLOR,
        });
      });
      room.openings.forEach(opening => {
        const frame = openingFrame(room, opening);
        const position = frame.position.clone();
        if (opening.kind === 'door') {
          const arc = doorArc(opening.face, doorHinge(opening), doorSwingSide(opening));
          position.x += arc.nx * (SHELL_M / 2);
          position.y += arc.ny * (SHELL_M / 2);
        } else {
          if (opening.face === 'px') position.x -= SHELL_M / 2;
          if (opening.face === 'nx') position.x += SHELL_M / 2;
          if (opening.face === 'py') position.y -= SHELL_M / 2;
          if (opening.face === 'ny') position.y += SHELL_M / 2;
        }
        const across = opening.face === 'px' || opening.face === 'nx';
        const width = Math.max(opening.widthM, 0.05);
        const height = Math.max(opening.heightM, 0.05);
        const openingData: PickData = { kind: 'opening', roomId: room.id, id: opening.id };
        const openingGroup = new THREE.Group();
        openingGroup.position.copy(position);
        openingGroup.userData = openingData;
        const pick = new THREE.Mesh(
          new THREE.BoxGeometry(across ? SHELL_M + 0.12 : width, across ? width : SHELL_M + 0.12, height),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: false,
            colorWrite: false,
            side: THREE.DoubleSide,
          })
        );
        pick.userData = openingData;
        const leafScale = opening.kind === 'door' ? 0.94 : 0.9;
        const leafDepth = opening.kind === 'door' ? SHELL_M * 0.5 : SHELL_M * 0.22;
        const leafSize: [number, number, number] = [
          across ? leafDepth : width * leafScale,
          across ? width * leafScale : leafDepth,
          height * (opening.kind === 'door' ? 0.97 : leafScale),
        ];
        const leaf = new THREE.Mesh(
          new THREE.BoxGeometry(leafSize[0], leafSize[1], leafSize[2]),
          shellMaterial(colorNumber(opening.kind === 'window' ? MARK_COLOR.window : opening.kind === 'door' ? MARK_COLOR.door : MARK_COLOR.opening), opening.kind === 'door' ? 1 : 0.42, bias)
        );
        leaf.userData = { ...openingData };
        if (leaf.material instanceof THREE.Material && leaf.material.transparent) leaf.renderOrder = 2;
        attachHighlight(leaf, leafSize);
        openingGroup.add(pick, leaf);
        addOutline(wrap, openingOutline(room, opening), { ...openingData, edgeRole: 1, baseEdge: EDGE_COLOR });
        wrap.add(openingGroup);
      });
      const label = makeLabel(room.name, '#5c6d78');
      if (label) {
        label.raycast = () => undefined;
        label.position.set(room.xM + room.lengthM / 2, room.yM + room.widthM / 2, room.zM + room.heightM + 0.45);
        wrap.add(label);
      }
      group.add(wrap);
    });

    equipment.forEach(item => {
      const product = getProduct(item.catalogId);
      const size = product?.dimensions ?? { lengthM: 0.6, widthM: 0.6, heightM: 0.6 };
      const missingSize = !product?.dimensions;
      const equipmentData: PickData = { kind: 'equipment', id: item.id };
      const wrap = new THREE.Group();
      wrap.userData = equipmentData;
      const dims: [number, number, number] = [size.lengthM, size.widthM, size.heightM];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(dims[0], dims[1], dims[2]),
        new THREE.MeshStandardMaterial({
          color: colorNumber(missingSize ? '#c4a574' : MARK_COLOR.equipment),
          roughness: 0.55,
          metalness: 0.08,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        })
      );
      const room = rooms.find(entry => entry.id === item.roomId);
      let centerZ = item.zM + size.heightM / 2;
      if (product?.mount === 'ceiling') {
        const underside = (room ? room.zM + room.heightM : item.zM + size.heightM) - SLAB_M - 0.02;
        const top = item.zM + size.heightM;
        if (top > underside) centerZ -= top - underside;
      } else if (product?.mount === 'roof') {
        const roof = (room ? room.zM + room.heightM : item.zM) + 0.03;
        if (item.zM < roof) centerZ += roof - item.zM;
      }
      mesh.position.set(item.xM, item.yM, centerZ);
      mesh.rotation.z = (item.yawDeg * Math.PI) / 180;
      mesh.userData = { ...equipmentData };
      attachHighlight(mesh, dims);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: colorNumber(MARK_COLOR.equipment), depthWrite: false })
      );
      edges.raycast = () => undefined;
      edges.renderOrder = 4;
      edges.userData = { ...equipmentData, edgeRole: 1, baseEdge: colorNumber(MARK_COLOR.equipment) };
      mesh.add(edges);
      wrap.add(mesh);
      if (item.quantity > 1) {
        const label = makeLabel(`×${item.quantity}`, MARK_COLOR.equipment);
        if (label) {
          label.scale.set(1.2, 0.32, 1);
          label.position.set(item.xM, item.yM, centerZ + size.heightM / 2 + 0.35);
          wrap.add(label);
        }
      }
      group.add(wrap);
    });

    addDrawnWalls(group, wallRuns);

    const paint = (next: Selection) => paintSelection(group, next);
    paintRef.current = paint;
    paint(selectionRef.current);

    return () => {
      scene.remove(group);
      disposeNode(group);
      if (contentRef.current === group) contentRef.current = null;
      paintRef.current = () => undefined;
    };
  }, [rooms, equipment, wallRuns, interfaceWalls, fitToken, hideRoof]);

  return <div ref={hostRef} className="viewport-canvas" />;
}
