'use client';

/**
 * The 3D view, on React Three Fiber. It draws the list `buildScene()` makes from the project (the same helpers as the
 * Plan view), with the Visibility and graphics settings: categories hidden or see-through, ghosted surfaces, and the
 * phase fade. It renders on demand: nothing is drawn while the view is still.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CATALOG_MIME } from '@/domain/catalog';
import { parseCatalogDrag } from '@/domain/catalogDrag';
import type { BuildStep } from '@/domain/checks';
import { SERVICE_COLOR } from '@/domain/ductCatalog';
import { buildScene, pieceSelected, type SceneCategory, type SceneLabel, type ScenePiece, type Vec3 } from '@/domain/scene3d';
import { sceneColor } from '@/domain/sceneColor';
import { ink, PLAN_COLOR, useTheme, wash, type Theme } from '@/domain/theme';
import type { DuctService, EditorTool, Project, Selection } from '@/domain/types';
import { categoryOpacity, type LayerSwitches, type View3DSettings } from '@/domain/view3d';
import { LABEL_ACTIVE } from '@/domain/viewRules';
import { MARK_COLOR, northDegrees, snapDrawnRect, snapPointToWalls } from '@/domain/walls';
import { AIR_KEY_LABEL, AIR_KEY_ORDER, AirKey, NorthGlyph, type AirKeyEntry } from './PlanView';

const SNAP_M = 0.05;
const MIN_DRAW_M = 0.4;
const DEFAULT_HEIGHT_M = 3.05;
const CLICK_PX = 10;
const OPENING_PICK_PX = 14;
const OPENING_BIAS_M = 0.45;
/** A click goes through anything fainter than this to what is behind it. */
const PICK_SOLID = 0.6;

export interface ViewportProps {
  project: Project;
  step: BuildStep;
  layers: LayerSwitches & { labels: boolean };
  view3d: View3DSettings;
  cameraPose?: 'orbit' | 'top';
  onCameraSettled?: (pose: 'orbit' | 'top') => void;
  selection: Selection;
  tool: EditorTool;
  fitToken: number;
  onSelect: (selection: Selection) => void;
  onDrawRoom: (rect: { xM: number; yM: number; lengthM: number; widthM: number }) => void;
  onPlace: (point: { xM: number; yM: number }, catalogId: string) => void;
  onPlaceLoad?: (point: { xM: number; yM: number }, loadId: string) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
}

/**
 * Sky, light, grid and edges for each theme. Data colours (rooms, walls, air, equipment, loads) are not here: they come
 * from the plan's colours through ink() / wash() and sceneColor(), so they match the plan in both themes.
 */
const SCENE_LOOK: Record<Theme, { background: number; sky: number; groundLight: number; light: number; sun: number; fill: number; gridMajor: number; gridMinor: number; edge: number; selectEdge: number }> = {
  light: { background: 0xd7e1e8, sky: 0xf7fafc, groundLight: 0xc5d0d6, light: 1.0, sun: 1.15, fill: 0.3, gridMajor: 0x8aa0ae, gridMinor: 0xbfcbd3, edge: 0x5c6d78, selectEdge: 0xd9843f },
  dark: { background: 0x0c1115, sky: 0xdde6ee, groundLight: 0x33404b, light: 0.95, sun: 1.05, fill: 0.25, gridMajor: 0x3b4a55, gridMinor: 0x222c34, edge: 0x8796a1, selectEdge: 0xd9843f },
};

const MOUSE_BUTTONS = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
const UP = new THREE.Vector3(0, 1, 0);
const noRaycast = () => undefined;

/** Unit shapes, shared by every piece and scaled into place. */
let shapes: { box: THREE.BoxGeometry; boxEdges: THREE.EdgesGeometry; cylinder: THREE.CylinderGeometry; sphere: THREE.SphereGeometry; cone: THREE.ConeGeometry; chevron: THREE.ShapeGeometry } | null = null;
function unitShapes() {
  if (!shapes) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    shapes = {
      box,
      boxEdges: new THREE.EdgesGeometry(box),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 20),
      sphere: new THREE.SphereGeometry(1, 18, 12),
      cone: new THREE.ConeGeometry(1, 1, 18),
      // The air key's Flow mark: a ">" one unit long and wide, pointing +x, lying flat.
      chevron: new THREE.ShapeGeometry(
        new THREE.Shape([new THREE.Vector2(0.5, 0), new THREE.Vector2(-0.15, 0.5), new THREE.Vector2(-0.5, 0.5), new THREE.Vector2(0.15, 0), new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(-0.15, -0.5)]),
      ),
    };
  }
  return shapes;
}

function snap(value: number): number {
  return Math.round(value / SNAP_M) * SNAP_M;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

type Pose = { position: THREE.Vector3; target: THREE.Vector3 };

function viewPoses(bounds: { min: Vec3; max: Vec3 }): { top: Pose; orbit: Pose } {
  const min = new THREE.Vector3(...bounds.min);
  const max = new THREE.Vector3(...bounds.max);
  const center = min.clone().add(max).multiplyScalar(0.5);
  const size = max.clone().sub(min);
  const span = Math.max(size.x, size.y, size.z, 6);
  return {
    top: { position: new THREE.Vector3(center.x, center.y - span * 0.18, center.z + span * 1.45), target: center.clone() },
    orbit: { position: new THREE.Vector3(center.x + span * 0.85, center.y - span * 1.15, center.z + span * 0.85), target: center.clone() },
  };
}

/** Position, rotation and scale of a unit shape for a piece. */
function placement(piece: ScenePiece): { position: Vec3; quaternion: THREE.Quaternion; scale: Vec3 } {
  const turn = (yaw: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw);
  if (piece.shape === 'box') return { position: piece.center, quaternion: turn(piece.yaw), scale: piece.size };
  if (piece.shape === 'chevron') return { position: piece.at, quaternion: turn(piece.yaw), scale: [piece.length, piece.width, 1] };
  if (piece.shape === 'ball') return { position: piece.at, quaternion: new THREE.Quaternion(), scale: [piece.radius, piece.radius, piece.radius] };
  if (piece.shape === 'puck') {
    return { position: piece.at, quaternion: new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(0, 0, 1)), scale: [piece.radius, piece.height, piece.radius] };
  }
  if (piece.shape === 'cone') {
    const dir = new THREE.Vector3(...piece.toward).normalize();
    const center = new THREE.Vector3(...piece.at).addScaledVector(dir, -piece.length / 2);
    return { position: [center.x, center.y, center.z], quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir), scale: [piece.radius, piece.length, piece.radius] };
  }
  if (piece.shape === 'tube' || piece.shape === 'beam') {
    const from = new THREE.Vector3(...piece.from);
    const to = new THREE.Vector3(...piece.to);
    const length = from.distanceTo(to);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const position: Vec3 = [mid.x, mid.y, mid.z];
    const dir = to.clone().sub(from).normalize();
    if (piece.shape === 'tube') return { position, quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir), scale: [piece.radius, length, piece.radius] };
    // A rectangular duct: width across, height up; a riser stands its length up the z axis.
    if (Math.abs(dir.z) > 0.7) return { position, quaternion: new THREE.Quaternion(), scale: [piece.width, piece.height, length] };
    return { position, quaternion: turn(Math.atan2(dir.y, dir.x)), scale: [length, piece.width, piece.height] };
  }
  return { position: [0, 0, 0], quaternion: new THREE.Quaternion(), scale: [1, 1, 1] };
}

function pieceColor(piece: ScenePiece): number {
  return sceneColor(piece.fill ? wash(piece.color) : ink(piece.color));
}

const Piece = memo(function Piece({ piece, opacity, selected, theme, shadows }: { piece: ScenePiece; opacity: number; selected: boolean; theme: Theme; shadows: boolean }) {
  const unit = unitShapes();
  const slab = useMemo(() => {
    if (piece.shape !== 'slab') return null;
    const shape = new THREE.Shape(piece.outline.map(point => new THREE.Vector2(point.x, point.y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: piece.depth, bevelEnabled: false });
    return { geometry, edges: new THREE.EdgesGeometry(geometry, 30) };
  }, [piece]);
  useEffect(
    () => () => {
      slab?.geometry.dispose();
      slab?.edges.dispose();
    },
    [slab],
  );
  const color = useMemo(() => pieceColor(piece), [piece, theme]);
  const select = useMemo(() => sceneColor(PLAN_COLOR.select), [theme]);
  const shown = Math.min(piece.maxOpacity ?? 1, selected ? Math.max(opacity, 0.5) : opacity);
  const transparent = shown < 0.999;
  const material = piece.unlit ? (
    <meshBasicMaterial key={transparent ? 'see-through' : 'solid'} color={color} transparent={transparent} opacity={shown} depthWrite={!transparent} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
  ) : (
    <meshStandardMaterial
      key={transparent ? 'see-through' : 'solid'}
      color={color}
      emissive={selected ? select : 0x000000}
      emissiveIntensity={selected ? 0.55 : 0}
      roughness={piece.category === 'ducts' ? 0.5 : piece.category === 'equipment' || piece.category === 'terminals' ? 0.6 : 0.9}
      metalness={piece.category === 'ducts' ? 0.25 : 0.04}
      transparent={transparent}
      opacity={shown}
      depthWrite={!transparent}
      side={piece.shape === 'slab' || piece.category === 'walls' ? THREE.DoubleSide : THREE.FrontSide}
      polygonOffset
      polygonOffsetFactor={1}
      polygonOffsetUnits={1}
    />
  );
  const edgeColor = selected ? SCENE_LOOK[theme].selectEdge : SCENE_LOOK[theme].edge;
  // See-through surfaces keep only a faint outline, so ghosted walls don't turn into a mesh of lines.
  const edgeOpacity = transparent ? Math.min(0.5, shown * 0.6) : 1;
  // Only solid things cast shadows; marks and floors never do.
  const casts = shadows && !transparent && !piece.unlit && piece.category !== 'floors';
  const receives = shadows && !piece.unlit;
  const edgeMaterial = <lineBasicMaterial key={edgeOpacity < 1 ? 'faint' : 'solid'} color={edgeColor} transparent={edgeOpacity < 1} opacity={edgeOpacity} depthWrite={false} />;
  const userData = { piece, opacity: shown };

  if (slab && piece.shape === 'slab') {
    return (
      <group position={[0, 0, piece.z]}>
        <mesh geometry={slab.geometry} userData={userData} renderOrder={transparent ? 2 : 0} castShadow={casts} receiveShadow={receives}>
          {material}
        </mesh>
        <lineSegments geometry={slab.edges} raycast={noRaycast} renderOrder={4}>
          {edgeMaterial}
        </lineSegments>
      </group>
    );
  }
  const { position, quaternion, scale } = placement(piece);
  const geometry =
    piece.shape === 'box' || piece.shape === 'beam' ? unit.box : piece.shape === 'ball' ? unit.sphere : piece.shape === 'cone' ? unit.cone : piece.shape === 'chevron' ? unit.chevron : unit.cylinder;
  return (
    <mesh geometry={geometry} position={position} quaternion={quaternion} scale={scale} userData={userData} renderOrder={transparent ? 2 : piece.unlit ? 1 : 0} castShadow={casts} receiveShadow={receives}>
      {material}
      {piece.edges && (
        <lineSegments geometry={unit.boxEdges} raycast={noRaycast} renderOrder={4}>
          {edgeMaterial}
        </lineSegments>
      )}
    </mesh>
  );
});

type Blend = { fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3; start: number; duration: number; pose: 'orbit' | 'top' };

function CameraRig({ pose, fitToken, bounds, onSettled }: { pose: 'orbit' | 'top'; fitToken: number; bounds: { min: Vec3; max: Vec3 }; onSettled?: (pose: 'orbit' | 'top') => void }) {
  const camera = useThree(state => state.camera);
  const controls = useThree(state => state.controls) as OrbitControlsImpl | null;
  const invalidate = useThree(state => state.invalidate);
  const blend = useRef<Blend | null>(null);
  const entered = useRef(false);
  const boundsRef = useRef(bounds);
  const settledRef = useRef(onSettled);
  boundsRef.current = bounds;
  settledRef.current = onSettled;

  useEffect(() => {
    if (!controls) return;
    const poses = viewPoses(boundsRef.current);
    const dest = pose === 'top' ? poses.top : poses.orbit;
    // The first orbit comes down from the plan's overhead view.
    const fromPlan = pose === 'orbit' && !entered.current;
    entered.current = true;
    const fromPos = (fromPlan ? poses.top.position : camera.position).clone();
    const fromTarget = (fromPlan ? poses.top.target : controls.target).clone();
    camera.position.copy(fromPos);
    controls.target.copy(fromTarget);
    blend.current = { fromPos, fromTarget, toPos: dest.position.clone(), toTarget: dest.target.clone(), start: performance.now(), duration: 720, pose };
    invalidate();
  }, [pose, fitToken, controls, camera, invalidate]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      blend.current = null;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame(() => {
    const current = blend.current;
    if (!current || !controls) return;
    const t = Math.min(1, (performance.now() - current.start) / current.duration);
    const eased = easeInOut(t);
    camera.position.lerpVectors(current.fromPos, current.toPos, eased);
    controls.target.lerpVectors(current.fromTarget, current.toTarget, eased);
    camera.lookAt(controls.target);
    if (t >= 1) {
      blend.current = null;
      controls.update();
      settledRef.current?.(current.pose);
    }
    invalidate();
  });
  return null;
}

type Api = { camera: THREE.Camera; controls: OrbitControlsImpl | null; invalidate: () => void; size: { width: number; height: number } };

/** Hands the camera and controls to the DOM handlers outside the canvas. */
function Bridge({ apiRef }: { apiRef: MutableRefObject<Api | null> }) {
  const camera = useThree(state => state.camera);
  const controls = useThree(state => state.controls) as OrbitControlsImpl | null;
  const invalidate = useThree(state => state.invalidate);
  const size = useThree(state => state.size);
  apiRef.current = { camera, controls, invalidate, size };
  return null;
}

/**
 * Labels are HTML on top of the canvas, so they stay crisp and use the app's type. Each frame they follow their
 * point; on overlap the lower priority hides, as on the plan.
 */
function LabelProjector({ labels, elements }: { labels: (SceneLabel & { rank: number })[]; elements: MutableRefObject<Map<string, HTMLDivElement>> }) {
  const camera = useThree(state => state.camera);
  const size = useThree(state => state.size);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => invalidate(), [labels, invalidate]);
  useFrame(() => {
    const point = new THREE.Vector3();
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const items = labels
      .map(label => ({ label, el: elements.current.get(label.key) }))
      .filter((item): item is { label: SceneLabel & { rank: number }; el: HTMLDivElement } => !!item.el)
      .map(item => ({ ...item, w: item.el.offsetWidth, h: item.el.offsetHeight }))
      .sort((a, b) => b.label.rank - a.label.rank);
    for (const item of items) {
      point.set(...item.label.at).project(camera);
      const x = ((point.x + 1) / 2) * size.width;
      const y = ((1 - point.y) / 2) * size.height;
      const box = { x0: x - item.w / 2 - 2, y0: y - item.h - 2, x1: x + item.w / 2 + 2, y1: y + 2 };
      const off = point.z > 1 || x < -item.w || x > size.width + item.w || y < 0 || y > size.height + item.h;
      const covered = placed.some(other => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0);
      const hide = off || (covered && item.label.rank < LABEL_ACTIVE);
      item.el.style.visibility = hide ? 'hidden' : 'visible';
      if (hide) continue;
      placed.push(box);
      item.el.style.transform = `translate(${Math.round(x - item.w / 2)}px, ${Math.round(y - item.h)}px)`;
    }
  });
  return null;
}

/**
 * The north arrow in the canvas corner, as on the plan. Each frame it turns to where north points on screen from the
 * point the camera orbits.
 */
function NorthProjector({ northDeg, glyph }: { northDeg: number; glyph: MutableRefObject<SVGGElement | null> }) {
  const camera = useThree(state => state.camera);
  const controls = useThree(state => state.controls) as OrbitControlsImpl | null;
  const size = useThree(state => state.size);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => invalidate(), [northDeg, invalidate]);
  useFrame(() => {
    const el = glyph.current;
    if (!el) return;
    const rad = (northDegrees(northDeg) * Math.PI) / 180;
    const origin = (controls?.target ?? new THREE.Vector3()).clone();
    const tip = origin.clone().add(new THREE.Vector3(Math.sin(rad), Math.cos(rad), 0));
    const a = origin.project(camera);
    const b = tip.project(camera);
    const dx = (b.x - a.x) * size.width;
    const dy = -(b.y - a.y) * size.height;
    if (Math.hypot(dx, dy) < 1e-6) return;
    el.setAttribute('transform', `rotate(${((Math.atan2(dx, -dy) * 180) / Math.PI).toFixed(1)} 40 40)`);
  });
  return null;
}

function labelActive(label: SceneLabel, selection: Selection): boolean {
  if (!label.pick) return false;
  if (label.pick.kind === 'room') return selection.kind === 'room' && selection.id === label.pick.id;
  return pieceSelected({ pick: label.pick }, selection);
}

/** Sky light, a sun from the south-east that can cast shadows over the whole project, and a soft fill opposite it. */
function Lights({ theme, bounds, shadows }: { theme: Theme; bounds: { min: Vec3; max: Vec3 }; shadows: boolean }) {
  const look = SCENE_LOOK[theme];
  const sun = useRef<THREE.DirectionalLight>(null);
  const invalidate = useThree(state => state.invalidate);
  const center = new THREE.Vector3(...bounds.min).add(new THREE.Vector3(...bounds.max)).multiplyScalar(0.5);
  const span = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], 8);
  const from = new THREE.Vector3(18, -24, 28).normalize().multiplyScalar(span * 1.6).add(center);
  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.target.position.copy(center);
    light.target.updateMatrixWorld();
    const camera = light.shadow.camera;
    const reach = span * 0.85;
    camera.left = -reach;
    camera.right = reach;
    camera.top = reach;
    camera.bottom = -reach;
    camera.near = 0.5;
    camera.far = span * 4;
    camera.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
    invalidate();
  });
  return (
    <>
      <color attach="background" args={[look.background]} />
      <hemisphereLight color={look.sky} groundColor={look.groundLight} intensity={look.light} />
      <directionalLight
        ref={sun}
        position={[from.x, from.y, from.z]}
        intensity={look.sun}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={3}
      />
      <directionalLight position={[center.x - span, center.y + span, center.z + span * 0.6]} intensity={look.fill} />
    </>
  );
}

export default function Viewport({ project, step, layers, view3d, selection, tool, fitToken, cameraPose = 'orbit', onCameraSettled, onSelect, onDrawRoom, onPlace, onPlaceLoad, onContextMenu }: ViewportProps) {
  const theme = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const piecesRef = useRef<THREE.Group>(null);
  const previewRef = useRef<THREE.Mesh>(null);
  const apiRef = useRef<Api | null>(null);
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const northRef = useRef<SVGGElement | null>(null);
  const handlersRef = useRef({ onSelect, onDrawRoom, onPlace, onPlaceLoad, onContextMenu });
  handlersRef.current = { onSelect, onDrawRoom, onPlace, onPlaceLoad, onContextMenu };
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const roomsRef = useRef(project.rooms);
  roomsRef.current = project.rooms;

  const scene = useMemo(() => buildScene(project), [project]);
  const opacityOf = useMemo(() => {
    const cache = new Map<SceneCategory, number>();
    return (category: SceneCategory) => {
      if (!cache.has(category)) cache.set(category, categoryOpacity(view3d, category, step, layers));
      return cache.get(category)!;
    };
  }, [view3d, step, layers]);

  const labels = useMemo(
    () =>
      scene.labels.flatMap(label => {
        const opacity = opacityOf(label.category);
        if (opacity <= 0) return [];
        const active = labelActive(label, selection);
        if (label.detailOnly && !layers.labels && !active) return [];
        return [{ ...label, rank: active ? LABEL_ACTIVE : label.priority, opacity }];
      }),
    [scene, opacityOf, selection, layers.labels],
  );

  const airKey = useMemo<AirKeyEntry[]>(() => {
    if (opacityOf('ducts') <= 0) return [];
    const groups = new Set<DuctService>(scene.services.map(service => (service === 'relief' ? 'exhaust' : service)));
    return [...groups]
      .sort((a, b) => AIR_KEY_ORDER.indexOf(a) - AIR_KEY_ORDER.indexOf(b))
      .map(service => ({ label: AIR_KEY_LABEL[service], color: SERVICE_COLOR[service], service, double: false }));
  }, [scene, opacityOf]);

  useEffect(() => {
    if (tool.kind !== 'draw' && previewRef.current) previewRef.current.visible = false;
    apiRef.current?.invalidate();
  }, [tool]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const raycaster = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    let drawing = false;
    let start: THREE.Vector2 | null = null;
    let downX = 0;
    let downY = 0;
    let rightX = 0;
    let rightY = 0;
    let sawRight = false;

    const aim = (clientX: number, clientY: number): boolean => {
      const api = apiRef.current;
      const rect = host.getBoundingClientRect();
      if (!api || rect.width < 1 || rect.height < 1) return false;
      raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), api.camera);
      return true;
    };
    const groundAt = (clientX: number, clientY: number): THREE.Vector3 | null => {
      if (!aim(clientX, clientY)) return null;
      return raycaster.ray.intersectPlane(ground, new THREE.Vector3());
    };
    /** The first solid piece under the ray; faint ones (other phases, see-through categories) let the click through. */
    const firstHit = (): { selection: Selection; distance: number } | null => {
      const group = piecesRef.current;
      if (!group) return null;
      const hits = raycaster.intersectObjects(group.children, true).filter(hit => hit.object.userData.piece);
      const solid = hits.find(hit => (hit.object.userData.opacity as number) >= PICK_SOLID) ?? hits[0];
      return solid ? { selection: (solid.object.userData.piece as ScenePiece).pick, distance: solid.distance } : null;
    };
    const pickAt = (clientX: number, clientY: number): Selection => {
      if (!aim(clientX, clientY)) return { kind: 'project' };
      const center = firstHit();
      // Doors and windows are thin: a click near one picks it rather than the wall around it.
      let opening = center?.selection.kind === 'opening' ? center : null;
      const limit = (center?.distance ?? Number.POSITIVE_INFINITY) + OPENING_BIAS_M;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (!aim(clientX + dx * OPENING_PICK_PX, clientY + dy * OPENING_PICK_PX)) continue;
        const found = firstHit();
        if (found?.selection.kind !== 'opening') continue;
        if (found.distance <= limit && (!opening || found.distance < opening.distance)) opening = found;
      }
      return opening?.selection ?? center?.selection ?? { kind: 'project' };
    };
    const showPreview = (end: THREE.Vector3) => {
      const preview = previewRef.current;
      if (!start || !preview) return;
      const rect = snapDrawnRect(start.x, start.y, snap(end.x), snap(end.y), roomsRef.current);
      const length = Math.max(rect.lengthM, SNAP_M);
      const width = Math.max(rect.widthM, SNAP_M);
      preview.visible = true;
      preview.scale.set(length, width, DEFAULT_HEIGHT_M);
      preview.position.set(rect.xM + length / 2, rect.yM + width / 2, DEFAULT_HEIGHT_M / 2);
      apiRef.current?.invalidate();
    };

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
      if (toolRef.current.kind !== 'draw') return;
      const point = groundAt(event.clientX, event.clientY);
      if (!point) return;
      const origin = snapPointToWalls(snap(point.x), snap(point.y), roomsRef.current);
      drawing = true;
      start = new THREE.Vector2(origin.x, origin.y);
      // Drawing, not orbiting: stop the controls from seeing this press.
      event.stopPropagation();
      if (apiRef.current?.controls) apiRef.current.controls.enabled = false;
      host.setPointerCapture(event.pointerId);
      showPreview(new THREE.Vector3(origin.x, origin.y, 0));
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drawing) return;
      const point = groundAt(event.clientX, event.clientY);
      if (point) showPreview(point);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (drawing) {
        const point = groundAt(event.clientX, event.clientY);
        if (start && point) {
          const rect = snapDrawnRect(start.x, start.y, snap(point.x), snap(point.y), roomsRef.current);
          if (rect.lengthM >= MIN_DRAW_M && rect.widthM >= MIN_DRAW_M) handlersRef.current.onDrawRoom(rect);
        }
        drawing = false;
        start = null;
        if (previewRef.current) previewRef.current.visible = false;
        if (apiRef.current?.controls) apiRef.current.controls.enabled = true;
        apiRef.current?.invalidate();
        return;
      }
      if (Math.hypot(event.clientX - downX, event.clientY - downY) < CLICK_PX && toolRef.current.kind !== 'draw') {
        handlersRef.current.onSelect(pickAt(event.clientX, event.clientY));
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const dragged = sawRight && Math.hypot(event.clientX - rightX, event.clientY - rightY) > CLICK_PX;
      sawRight = false;
      if (dragged) return;
      const picked = pickAt(event.clientX, event.clientY);
      if (picked.kind === 'project') return;
      handlersRef.current.onContextMenu(picked, event.clientX, event.clientY);
    };
    const onDragOver = (event: DragEvent) => {
      if (![...(event.dataTransfer?.types ?? [])].includes(CATALOG_MIME)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      host.dataset.drop = 'catalog';
    };
    const onDragLeave = () => {
      host.dataset.drop = '';
    };
    const onDrop = (event: DragEvent) => {
      host.dataset.drop = '';
      const drag = parseCatalogDrag(event.dataTransfer?.getData(CATALOG_MIME) ?? '');
      if (!drag || (drag.kind !== 'equipment' && drag.kind !== 'load')) return;
      event.preventDefault();
      const hit = groundAt(event.clientX, event.clientY);
      if (!hit) return;
      const point = { xM: snap(hit.x), yM: snap(hit.y) };
      if (drag.kind === 'load') handlersRef.current.onPlaceLoad?.(point, drag.id);
      else handlersRef.current.onPlace(point, drag.id);
    };
    host.addEventListener('pointerdown', onPointerDown, true);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', onPointerUp);
    host.addEventListener('contextmenu', onContextMenu);
    host.addEventListener('dragover', onDragOver);
    host.addEventListener('dragleave', onDragLeave);
    host.addEventListener('drop', onDrop);
    return () => {
      host.removeEventListener('pointerdown', onPointerDown, true);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', onPointerUp);
      host.removeEventListener('contextmenu', onContextMenu);
      host.removeEventListener('dragover', onDragOver);
      host.removeEventListener('dragleave', onDragLeave);
      host.removeEventListener('drop', onDrop);
    };
  }, []);

  const look = SCENE_LOOK[theme];
  const initial = useMemo(() => viewPoses(scene.bounds).top, []);
  const previewColor = useMemo(() => sceneColor(ink(MARK_COLOR.equipment)), [theme]);

  return (
    <>
      <div ref={hostRef} className="viewport-canvas" data-tool={tool.kind}>
        <Canvas
          frameloop="demand"
          flat
          shadows={{ type: THREE.PCFSoftShadowMap }}
          dpr={[1, 2]}
          gl={{ antialias: true, logarithmicDepthBuffer: true }}
          camera={{ fov: 45, near: 0.1, far: 500, up: [0, 0, 1], position: [initial.position.x, initial.position.y, initial.position.z] }}
        >
          <Lights theme={theme} bounds={scene.bounds} shadows={view3d.shadows} />
          <OrbitControls makeDefault enableDamping dampingFactor={0.08} zoomSpeed={1} zoomToCursor mouseButtons={MOUSE_BUTTONS} />
          <CameraRig pose={cameraPose} fitToken={fitToken} bounds={scene.bounds} onSettled={onCameraSettled} />
          <Bridge apiRef={apiRef} />
          <Grid
            args={[200, 200]}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, -0.002]}
            cellSize={1}
            sectionSize={5}
            cellColor={look.gridMinor}
            sectionColor={look.gridMajor}
            cellThickness={0.6}
            sectionThickness={1}
            fadeDistance={90}
            fadeStrength={1.4}
            infiniteGrid
            side={THREE.DoubleSide}
          />
          <group ref={piecesRef}>
            {scene.pieces.map(piece => {
              const opacity = opacityOf(piece.category);
              if (opacity <= 0) return null;
              return <Piece key={piece.key} piece={piece} opacity={opacity} selected={selection.kind !== 'project' && pieceSelected(piece, selection)} theme={theme} shadows={view3d.shadows} />;
            })}
          </group>
          <mesh ref={previewRef} visible={false} raycast={noRaycast}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={previewColor} transparent opacity={0.35} roughness={0.8} depthWrite={false} />
          </mesh>
          <LabelProjector labels={labels} elements={labelEls} />
          <NorthProjector northDeg={project.northDeg ?? 0} glyph={northRef} />
        </Canvas>
        <div className="viewport-labels" aria-hidden="true">
          {labels.map(label => (
            <div
              key={label.key}
              ref={el => {
                if (el) labelEls.current.set(label.key, el);
                else labelEls.current.delete(label.key);
              }}
              className={['viewport-label', label.rank >= LABEL_ACTIVE ? 'is-active' : '', label.color ? 'is-tag' : ''].filter(Boolean).join(' ')}
              style={{ opacity: Math.max(0.45, label.opacity), ...(label.color ? { color: ink(label.color), borderColor: ink(label.color) } : {}) }}
            >
              {label.text}
              {label.detail && <small>{label.detail}</small>}
            </div>
          ))}
        </div>
        <div className="viewport-north" role="img" aria-label="North">
          <NorthGlyph degrees={0} groupRef={northRef} />
        </div>
      </div>
      <AirKey entries={airKey} mixed={false} />
    </>
  );
}
