'use client';

import dynamic from 'next/dynamic';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { catalogToken, setActiveCatalogDrag, type CatalogDrag } from '@/domain/catalogDrag';
import { createSystemAt, dropRole, ductStart, joinTarget, packageAround, packagesFor, runUnder, systemDistance, systemKindsFor } from '@/domain/smartDrop';
import { buildChecks, stepForSelection, type BuildStep, type CheckIssue } from '@/domain/checks';
import { siteMissing, siteOf } from '@/domain/climate';
import { LOOP_FLUID_LABEL, newPlantLoop, SENSOR_LABEL } from '@/domain/controls';
import { SECTION_LABEL, unitSections } from '@/domain/airUnits';
import { getLoadProduct, LOAD_CATEGORY_LABEL, LOAD_CATEGORY_ORDER, loadGroups, type LoadCategory } from '@/domain/loadCatalog';
import { addLoad, loadLabel, loadSpec, removeLoad, roomLoads, sumLoads, updateLoad } from '@/domain/loads';
import {
  CATALOG_MIME,
  CATEGORY_LABEL,
  CATALOG,
  FAMILY_CATEGORIES,
  FAMILY_LABEL,
  FAMILY_ORDER,
  getProduct,
  type CatalogProduct,
  type EquipmentCategory,
  type EquipmentFamily,
} from '@/domain/catalog';
import { applySystemPackage, PACKAGE_GROUPS, packageSummary, type SystemPackage } from '@/domain/systemPackages';
import { useSystemPackages } from './useSystemPackages';
import { downloadText, fileSlug } from '@/domain/download';
import {
  addDuct,
  addOpening,
  addSystem,
  addWallRun,
  addWallRunOpening,
  buildDimensionedRoom,
  buildDrawnRoom,
  buildOutlineRoom,
  buildPlacement,
  placeOpeningOnRoom,
  removeDuct,
  removeEquipment,
  removeRoom,
  removeSystem,
  removeWallRun,
  removeWallRunOpening,
  constrainEquipmentPosition,
  setEdgeAssembly,
  setInterfaceAssembly,
  setWallAssembly,
  syncDuctPorts,
  translateRoom,
  updateEquipment,
  updateRoom,
  updateSystem,
  placementZ,
  roomAtPoint,
} from '@/domain/projectOps';
import { buildBom, buildConstructionBom, buildConstructionSchedule, buildSchedule, projectSummary, scheduleCsv } from '@/domain/schedule';
import { DUCT_CATALOG, DUCT_STREAMS, ductPairAllowed, getDuctProduct, servicesFor, streamFor, systemsForProduct } from '@/domain/ductCatalog';
import { ductSizeLabel, DUCT_SERVICES, DUCT_SERVICE_LABEL, openPorts, type DuctDraftPoint } from '@/domain/ducts';
import { SURFACE_FACES, SYSTEM_KINDS, WALL_FACES, type DuctService, type EditorTool, type Project, type Selection, type StoredTemplate, type WallFace } from '@/domain/types';
import { NO_WALL_RUNS, polygonArea } from '@/domain/wallDraw';
import { INTERFACE_COLOR, WALL_TYPES, edgePortions, findInterface, interfaceForOpening, interfaceTargets, portionSummary, roomFill, wallColor, wallName, wallPlaceLabel, wallRoleLabel } from '@/domain/walls';
import { DEFAULT_LAYERS, PlanView, type DropHint, type PlanLayers } from './PlanView';
import { formatArea, formatLength, formatNumber, formatPower, lengthToM, lengthUnit, mToLength } from '@/domain/units';
import { projectToBuildingModel, validateModel } from '@/thermonode/localAdapter';
import { mergeAssemblies, mergeLibrary, type ConstructionAssembly, type ConstructionMaterial } from '@/domain/constructionLibrary';
import { BoundaryPanel } from './BoundaryPanel';
import { EquipmentIcon, categoryIcon, equipmentIconFor } from './EquipmentIcon';
import { LoadIcon } from './LoadIcon';
import { Inspector } from './Inspector';
import { LibraryPanel } from './LibraryPanel';
import { SchedulePanel } from './SchedulePanel';
import { SettingsButton } from './Settings';
import { ink, wash } from '@/domain/theme';

const Viewport = dynamic(() => import('./Viewport'), {
  ssr: false,
  loading: () => <div className="viewport-loading">Loading 3D workspace…</div>,
});

type CenterView = 'model' | 'schedule' | 'library' | 'boundary';

const CENTER_VIEWS: { id: CenterView; label: string }[] = [
  { id: 'model', label: 'Build' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'library', label: 'Library' },
  { id: 'boundary', label: 'Thermonode' },
];

const STEPS: { id: BuildStep; label: string }[] = [
  { id: 'spaces', label: 'Spaces' },
  { id: 'loads', label: 'Loads' },
  { id: 'systems', label: 'Systems' },
  { id: 'check', label: 'Check' },
];

type ToolKind = 'select' | 'wall' | 'draw' | 'door' | 'window' | 'load' | 'place' | 'duct';

const STEP_TOOLS: Record<BuildStep, ToolKind[]> = {
  spaces: ['select', 'wall', 'draw'],
  loads: ['select'],
  systems: ['select'],
  check: ['select'],
};

/** Layers inside the Systems phase, toggled from the options strip. */
const SYSTEM_LAYERS: { key: 'equipment' | 'ducts' | 'piping' | 'controls' | 'internals'; label: string; hint: string }[] = [
  { key: 'equipment', label: 'Equipment', hint: 'Units, fans, terminals, and plant' },
  { key: 'ducts', label: 'Ducts', hint: 'Duct runs and junctions' },
  { key: 'piping', label: 'Piping', hint: 'Plant loops from plant to coils' },
  { key: 'controls', label: 'Controls', hint: 'Room sensors' },
  { key: 'internals', label: 'Unit internals', hint: 'Sections, valves, and duct sensors inside every unit, at plan scale' },
];

const TOOL_LABEL: Record<ToolKind, string> = {
  select: 'Select',
  wall: 'Wall',
  draw: 'Room',
  door: 'Door',
  window: 'Window',
  load: 'Place load',
  place: 'Place',
  duct: 'Draw duct',
};

function toolStep(tool: EditorTool): BuildStep | null {
  if (tool.kind === 'wall' || tool.kind === 'draw' || tool.kind === 'door' || tool.kind === 'window') return 'spaces';
  if (tool.kind === 'load') return 'loads';
  if (tool.kind === 'place' || tool.kind === 'duct') return 'systems';
  return null;
}

type MenuEntry = { id: string; label: string; detail?: string; danger?: boolean; run: () => void };

function selectionForSubject(project: Project, subjectId: string | undefined): Selection | null {
  if (!subjectId) return null;
  if (project.rooms.some(room => room.id === subjectId)) return { kind: 'room', id: subjectId };
  for (const room of project.rooms) {
    if (room.openings.some(opening => opening.id === subjectId)) return { kind: 'opening', roomId: room.id, id: subjectId };
  }
  if (findInterface(project.rooms, subjectId)) return { kind: 'interface', key: subjectId };
  return null;
}

export function Studio({
  project,
  templates,
  addedMaterials,
  addedAssemblies,
  onChange,
  onLibraryChange,
  onAssembliesChange,
  onBack,
  onSaveTemplate,
  onUpdateTemplate,
  onDeleteProject,
}: {
  project: Project;
  templates: StoredTemplate[];
  addedMaterials: ConstructionMaterial[];
  addedAssemblies: ConstructionAssembly[];
  onChange: (next: Project) => void;
  onLibraryChange: (next: ConstructionMaterial[]) => void;
  onAssembliesChange: (next: ConstructionAssembly[]) => void;
  onBack: () => void;
  onSaveTemplate: (name: string) => void;
  onUpdateTemplate: () => void;
  onDeleteProject: () => void;
}) {
  const [selection, setSelection] = useState<Selection>({ kind: 'project' });
  const [tool, setTool] = useState<EditorTool>({ kind: 'select' });
  const [view, setView] = useState<CenterView>('model');
  const [step, setStep] = useState<BuildStep>('spaces');
  const [layers, setLayers] = useState<PlanLayers>(DEFAULT_LAYERS);
  const [layersOpen, setLayersOpen] = useState(false);
  // Lock positions: clicks only select; nothing on the plan can be dragged. Remembered between visits.
  const [positionsLocked, setPositionsLocked] = useState(false);
  useEffect(() => {
    setPositionsLocked(window.localStorage.getItem(LOCK_KEY) === '1');
  }, []);
  const toggleLock = () =>
    setPositionsLocked(locked => {
      window.localStorage.setItem(LOCK_KEY, locked ? '0' : '1');
      return !locked;
    });
  const [expandedUnits, setExpandedUnits] = useState<ReadonlySet<string>>(() => new Set());
  const toggleInternals = (id: string) =>
    setExpandedUnits(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [fitToken, setFitToken] = useState(0);
  const [query, setQuery] = useState('');
  const [catalogFamily, setCatalogFamily] = useState<EquipmentFamily | 'all'>('all');
  const [lastProductId, setLastProductId] = useState<string | null>(null);
  const packages = useSystemPackages();
  const [targetSystemId, setTargetSystemId] = useState('');
  const [loadQuery, setLoadQuery] = useState('');
  const [spaceQuery, setSpaceQuery] = useState('');
  const [loadCategory, setLoadCategory] = useState<LoadCategory | 'all'>('all');
  const [sidePanel, setSidePanel] = useState<'project' | 'catalog'>('project');
  const [checkFilter, setCheckFilter] = useState<Exclude<BuildStep, 'check'> | 'all'>('all');
  const [checkIndex, setCheckIndex] = useState(0);
  const [showDimensions, setShowDimensions] = useState(false);
  const [hideRoof, setHideRoof] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState(`${project.name} template`);
  const [wallTypeId, setWallTypeId] = useState<string | null>(null);
  const [scene, setScene] = useState<'plan' | '3d'>('plan');
  const [cameraPose, setCameraPose] = useState<'orbit' | 'top'>('top');
  const [menu, setMenu] = useState<{ x: number; y: number; title?: string; items: MenuEntry[] } | null>(null);
  const [nameFocus, setNameFocus] = useState(0);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const [historyTick, setHistoryTick] = useState({ undo: false, redo: false });
  const edit = (next: Project) => {
    past.current = [...past.current, project].slice(-40);
    future.current = [];
    setHistoryTick({ undo: true, redo: false });
    onChange(next);
  };
  /** A system made for a dropped duct. If the user leaves the duct tool before drawing anything, it goes again. */
  const pendingSystem = useRef<{ id: string; before: Project } | null>(null);
  const latestProject = useRef(project);
  latestProject.current = project;
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;
  useEffect(() => {
    const pending = pendingSystem.current;
    if (!pending || (tool.kind === 'duct' && tool.systemId === pending.id)) return;
    pendingSystem.current = null;
    // Leaving the duct tool commits the run being drawn in this same render, so look once that edit has landed.
    window.setTimeout(() => {
      const current = latestProject.current;
      if (!current.systems.some(system => system.id === pending.id)) return;
      const used =
        current.equipment.some(item => item.systemId === pending.id) ||
        (current.ducts ?? []).some(run => run.systemId === pending.id) ||
        (current.ductNodes ?? []).some(node => node.systemId === pending.id);
      if (used) return;
      if (past.current[past.current.length - 1] === pending.before) past.current.pop();
      setHistoryTick({ undo: past.current.length > 0, redo: future.current.length > 0 });
      latestOnChange.current(removeSystem(current, pending.id));
    }, 0);
  }, [tool]);
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(project);
    setHistoryTick({ undo: past.current.length > 0, redo: true });
    onChange(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(project);
    setHistoryTick({ undo: true, redo: future.current.length > 0 });
    onChange(next);
  };
  const actions = useRef({ selection, onChange: edit, setSelection, setTool, undo, redo });
  actions.current = { selection, onChange: edit, setSelection, setTool, undo, redo };

  const materials = useMemo(() => mergeLibrary(addedMaterials), [addedMaterials]);
  const assemblies = useMemo(() => mergeAssemblies(addedAssemblies), [addedAssemblies]);
  const changeStep = (next: BuildStep) => {
    setStep(next);
    setView('model');
    setLayersOpen(false);
    if (next !== 'spaces') {
      setWallTypeId(null);
      setShowDimensions(false);
    }
    setTool(current => {
      const owner = toolStep(current);
      return owner && owner !== next ? { kind: 'select' } : current;
    });
  };
  const select = (next: Selection) => {
    setSelection(next);
    const target = stepForSelection(next);
    // Selecting an item always moves to the phase that owns it (Check keeps its issue list open).
    if (target && step !== 'check' && target !== step) changeStep(target);
  };
  const soleInterface = (roomId: string, anchor: string) => {
    const matches = interfaceTargets(project.rooms).filter(target => target.sides.some(side => side.roomId === roomId && side.anchor === anchor));
    return matches.length === 1 ? matches[0] : null;
  };
  const paintWall = (next: Selection, typeId: string) => {
    const type = WALL_TYPES.find(item => item.id === typeId);
    if (!type) return false;
    if (next.kind === 'surface' && next.face === 'walls') {
      if (next.wallFace) {
        const sole = soleInterface(next.roomId, `f:${next.wallFace}`);
        edit(sole ? setInterfaceAssembly(project, sole.key, type.assemblyId, assemblies) : setWallAssembly(project, next.roomId, next.wallFace, type.assemblyId, assemblies));
      }
      if (next.edge != null) {
        const sole = soleInterface(next.roomId, `e:${next.edge}`);
        edit(sole ? setInterfaceAssembly(project, sole.key, type.assemblyId, assemblies) : setEdgeAssembly(project, next.roomId, next.edge, type.assemblyId, assemblies));
      }
      setSelection(next);
      return true;
    }
    if (next.kind === 'interface') {
      const hit = findInterface(project.rooms, next.key);
      const side = hit && hit.sides.length === 1 ? hit.sides[0] : undefined;
      edit(setInterfaceAssembly(project, next.key, type.assemblyId, assemblies));
      if (side?.anchor.startsWith('f:')) {
        const face = side.anchor.slice(2);
        if (face === 'px' || face === 'nx' || face === 'py' || face === 'ny') {
          setSelection({ kind: 'surface', roomId: side.roomId, face: 'walls', wallFace: face });
          return true;
        }
      }
      if (side?.anchor.startsWith('e:')) {
        const edge = Number(side.anchor.slice(2));
        if (Number.isInteger(edge) && edge >= 0) {
          setSelection({ kind: 'surface', roomId: side.roomId, face: 'walls', edge });
          return true;
        }
      }
      select(next);
      return true;
    }
    return false;
  };
  const chooseView = (next: Selection) => {
    if (wallTypeId && paintWall(next, wallTypeId)) return;
    select(next);
  };
  const validation = useMemo(() => validateModel(projectToBuildingModel(project)), [project]);
  const checks = useMemo(() => {
    const geometry = validation.issues.flatMap(issue =>
      issue.severity === 'error' || issue.severity === 'warning'
        ? [{
            id: `${issue.code}-${issue.subjectId ?? ''}-${issue.message}`,
            severity: issue.severity,
            message: issue.message,
            selection: selectionForSubject(project, issue.subjectId),
          }]
        : [],
    );
    return buildChecks(project, geometry);
  }, [project, validation]);
  const visibleChecks = checks.filter(issue => checkFilter === 'all' || issue.step === checkFilter);

  useEffect(() => {
    setSelection({ kind: 'project' });
    setTool({ kind: 'select' });
    setStep('spaces');
    setView('model');
    setFitToken(token => token + 1);
    setTemplateName(`${project.name} template`);
    setExpandedUnits(new Set());
    past.current = [];
    future.current = [];
    setHistoryTick({ undo: false, redo: false });
  }, [project.id]);

  useEffect(() => {
    if (selection.kind === 'room' && !project.rooms.some(room => room.id === selection.id)) setSelection({ kind: 'project' });
    if (selection.kind === 'equipment' && !project.equipment.some(item => item.id === selection.id)) setSelection({ kind: 'project' });
    if (selection.kind === 'system' && !project.systems.some(item => item.id === selection.id)) setSelection({ kind: 'project' });
    if (selection.kind === 'opening') {
      const room = project.rooms.find(item => item.id === selection.roomId);
      if (!room || !room.openings.some(item => item.id === selection.id)) setSelection({ kind: 'project' });
    }
    if (selection.kind === 'surface' && !project.rooms.some(room => room.id === selection.roomId)) {
      setSelection({ kind: 'project' });
    }
    if (selection.kind === 'interface' && !findInterface(project.rooms, selection.key)) setSelection({ kind: 'project' });
    if (selection.kind === 'wallRun' && !(project.wallRuns ?? []).some(run => run.id === selection.id)) setSelection({ kind: 'project' });
    if (selection.kind === 'wallOpening') {
      const run = (project.wallRuns ?? []).find(item => item.id === selection.wallId);
      if (!run || !run.openings.some(item => item.id === selection.id)) setSelection({ kind: 'project' });
    }
    if (selection.kind === 'duct' && !(project.ducts ?? []).some(run => run.id === selection.id)) setSelection({ kind: 'project' });
    if (selection.kind === 'load' && !(project.loads ?? []).some(item => item.id === selection.id)) setSelection({ kind: 'project' });
  }, [project, selection]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = actions.current;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) current.redo();
        else current.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        current.redo();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (event.key === 'Escape') {
        current.setTool({ kind: 'select' });
        setWallTypeId(null);
      }
      if (event.key !== 'Delete') return;
      if (current.selection.kind === 'room') {
        current.onChange(removeRoom(project, current.selection.id));
        current.setSelection({ kind: 'project' });
      } else if (current.selection.kind === 'equipment') {
        current.onChange(removeEquipment(project, current.selection.id));
        current.setSelection({ kind: 'project' });
      } else if (current.selection.kind === 'opening') {
        const opening = current.selection;
        const room = project.rooms.find(item => item.id === opening.roomId);
        if (!room) return;
        current.onChange(updateRoom(project, room.id, { openings: room.openings.filter(item => item.id !== opening.id) }));
        current.setSelection({ kind: 'room', id: room.id });
      } else if (current.selection.kind === 'wallRun') {
        current.onChange(removeWallRun(project, current.selection.id));
        current.setSelection({ kind: 'project' });
      } else if (current.selection.kind === 'wallOpening') {
        current.onChange(removeWallRunOpening(project, current.selection.wallId, current.selection.id));
        current.setSelection({ kind: 'wallRun', id: current.selection.wallId });
      } else if (current.selection.kind === 'duct') {
        current.onChange(removeDuct(project, current.selection.id));
        current.setSelection({ kind: 'project' });
      } else if (current.selection.kind === 'load') {
        current.onChange(removeLoad(project, current.selection.id));
        current.setSelection({ kind: 'project' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project]);

  const customTemplate = templates.find(item => item.id === project.createdFrom.templateId);

  const constructionExport = () => {
    const construction = buildConstructionSchedule(project, assemblies, materials);
    return { construction, constructionBom: buildConstructionBom(construction, project.units) };
  };
  const exportSchedule = () => {
    const lines = buildSchedule(project);
    const built = constructionExport();
    downloadText(`${fileSlug(project.name)}-schedule.csv`, scheduleCsv(project, lines, buildBom(lines), built.construction, built.constructionBom), 'text/csv');
    setExportOpen(false);
  };
  const exportSummary = () => {
    const lines = buildSchedule(project);
    const built = constructionExport();
    downloadText(
      `${fileSlug(project.name)}-summary.json`,
      JSON.stringify(projectSummary(project, lines, buildBom(lines), built.construction, built.constructionBom), null, 2),
      'application/json'
    );
    setExportOpen(false);
  };
  const placeOpening = (roomId: string, kind: 'door' | 'window', face?: WallFace) => {
    const room = project.rooms.find(item => item.id === roomId);
    if (!room) return;
    const next = addOpening(room, kind, face);
    const created = next.openings[next.openings.length - 1];
    edit(updateRoom(project, room.id, { openings: next.openings }));
    setSelection({ kind: 'opening', roomId: room.id, id: created.id });
  };
  const renameSelection = (next: Selection) => {
    setSelection(next);
    setNameFocus(token => token + 1);
  };
  const menuItems = (next: Selection) => {
    if (next.kind === 'project') {
      return [
        { id: 'rename', label: 'Rename', run: () => renameSelection(next) },
        { id: 'delete', label: 'Delete project', danger: true, run: onDeleteProject },
      ];
    }
    if (next.kind === 'room') {
      return [
        { id: 'rename', label: 'Rename', run: () => renameSelection(next) },
        { id: 'delete', label: 'Delete', danger: true, run: () => { edit(removeRoom(project, next.id)); setSelection({ kind: 'project' }); } },
      ];
    }
    if (next.kind === 'surface' && next.face === 'walls' && next.wallFace) {
      const face = next.wallFace;
      return [
        { id: 'door', label: 'Add door', run: () => placeOpening(next.roomId, 'door', face) },
        { id: 'window', label: 'Add window', run: () => placeOpening(next.roomId, 'window', face) },
      ];
    }
    if (next.kind === 'opening') {
      const opening = next;
      return [{
        id: 'delete',
        label: 'Delete',
        danger: true,
        run: () => {
          const room = project.rooms.find(item => item.id === opening.roomId);
          if (!room) return;
          edit(updateRoom(project, room.id, { openings: room.openings.filter(item => item.id !== opening.id) }));
          setSelection({ kind: 'room', id: room.id });
        },
      }];
    }
    if (next.kind === 'equipment') {
      return [{ id: 'delete', label: 'Delete', danger: true, run: () => { edit(removeEquipment(project, next.id)); setSelection({ kind: 'project' }); } }];
    }
    if (next.kind === 'wallRun') {
      return [{ id: 'delete', label: 'Delete', danger: true, run: () => { edit(removeWallRun(project, next.id)); setSelection({ kind: 'project' }); } }];
    }
    if (next.kind === 'wallOpening') {
      return [{ id: 'delete', label: 'Delete', danger: true, run: () => { edit(removeWallRunOpening(project, next.wallId, next.id)); setSelection({ kind: 'wallRun', id: next.wallId }); } }];
    }
    if (next.kind === 'duct') {
      return [
        { id: 'branch', label: 'Draw branch', detail: 'Click on this run where the branch starts', run: () => armBranch(next.id) },
        { id: 'delete', label: 'Delete', danger: true, run: () => { edit(removeDuct(project, next.id)); setSelection({ kind: 'project' }); } },
      ];
    }
    if (next.kind === 'load') {
      return [{ id: 'delete', label: 'Delete', danger: true, run: () => { edit(removeLoad(project, next.id)); setSelection({ kind: 'project' }); } }];
    }
    if (next.kind === 'system') {
      return [
        { id: 'rename', label: 'Rename', run: () => renameSelection(next) },
        { id: 'delete', label: 'Delete', danger: true, run: () => { edit(removeSystem(project, next.id)); setSelection({ kind: 'project' }); } },
      ];
    }
    return [];
  };
  const openMenu = (selection: Selection, x: number, y: number) => {
    if (selection.kind === 'surface' && selection.face !== 'walls') return;
    const items = menuItems(selection);
    if (items.length === 0) return;
    select(selection);
    setMenu({ x, y, items });
  };
  const addSystemOfKind = (kind: (typeof SYSTEM_KINDS)[number]['id']) => {
    const next = addSystem(project, kind);
    const created = next.systems[next.systems.length - 1];
    const name = SYSTEM_KINDS.find(item => item.id === kind)?.label ?? 'New system';
    edit(updateSystem(next, created.id, { name }));
    setSelection({ kind: 'system', id: created.id });
  };
  const openSystemMenu = (x: number, y: number) => {
    setMenu({
      x,
      y,
      items: SYSTEM_KINDS.map(kind => ({ id: kind.id, label: kind.label, run: () => addSystemOfKind(kind.id) })),
    });
  };
  const armDuct = (
    catalogId: string,
    preset?: { systemId: string; service: DuctService; widthM?: number; heightM?: number | null },
    systemList: Project['systems'] = project.systems,
  ) => {
    const product = getDuctProduct(catalogId) ?? DUCT_CATALOG[0];
    const systems = systemsForProduct(product, systemList);
    const currentId = preset?.systemId ?? (tool.kind === 'duct' ? tool.systemId : selection.kind === 'system' ? selection.id : '');
    const system = systems.find(item => item.id === currentId) ?? systems[0];
    const services = system ? servicesFor(product, system.kind) : [];
    const keep = tool.kind === 'duct' && tool.catalogId === product.id;
    const service = preset && services.includes(preset.service) ? preset.service : keep && services.includes(tool.service) ? tool.service : services[0] ?? 'supply';
    const presetSize = preset?.widthM != null ? product.sizes?.find(size => Math.abs(size.widthM - preset.widthM!) < 0.002) : undefined;
    const listed = presetSize ?? product.sizes?.find(size => keep && Math.abs(size.widthM - tool.widthM) < 0.002) ?? product.sizes?.[0];
    const widthM = presetSize?.widthM ?? (preset?.widthM != null && !product.sizes ? preset.widthM : listed?.widthM ?? (keep ? tool.widthM : product.defaultWidthIn * 0.0254));
    const heightM = product.shape === 'rect' ? (preset?.heightM ?? (keep && tool.heightM ? tool.heightM : (product.defaultHeightIn ?? 12) * 0.0254)) : null;
    const next = { kind: 'duct' as const, catalogId: product.id, systemId: system?.id ?? '', service, shape: product.shape, widthM, heightM };
    setTool(next);
    setView('model');
    if (step !== 'check') setStep('systems');
    return next;
  };
  /** Right-click "Draw branch": the duct tool set to the run's system, air, product and size. Click the run to tee off it. */
  const armBranch = (runId: string) => {
    const run = (project.ducts ?? []).find(item => item.id === runId);
    if (!run) return;
    armDuct(run.catalogId, { systemId: run.systemId, service: run.service, widthM: run.widthM, heightM: run.heightM });
  };
  /**
   * A duct dropped from the catalogue: on a run it starts a branch, by an open connection it starts there, and
   * otherwise it runs in the nearest system that can carry it, or a new one. Returns why when it can't start.
   */
  const beginDuctAt = (catalogId: string, point: { xM: number; yM: number }): { tool: Extract<EditorTool, { kind: 'duct' }>; start: DuctDraftPoint | null } | string => {
    const product = getDuctProduct(catalogId);
    if (!product) return 'Unknown duct type.';
    const branch = runUnder(project, point.xM, point.yM, 0.4);
    const branchSystem = branch ? project.systems.find(item => item.id === branch.run.systemId) : undefined;
    if (branch && branchSystem) {
      const own = ductPairAllowed(product, branchSystem.kind, branch.run.service);
      const tool = armDuct(own ? product.id : branch.run.catalogId, {
        systemId: branchSystem.id,
        service: branch.run.service,
        ...(own && product.id !== branch.run.catalogId ? {} : { widthM: branch.run.widthM, heightM: branch.run.heightM }),
      });
      return { tool, start: { x: Number(branch.x.toFixed(3)), y: Number(branch.y.toFixed(3)), splitDuctId: branch.run.id } };
    }
    const port = openPorts(project)
      .map(hit => ({ hit, distance: Math.hypot(hit.x - point.xM, hit.y - point.yM) }))
      .filter(entry => entry.distance <= 0.6)
      .sort((a, b) => a.distance - b.distance)[0]?.hit;
    if (port) {
      const item = project.equipment.find(entry => entry.id === port.equipmentId);
      const owner = item?.systemId ? project.systems.find(entry => entry.id === item.systemId) : undefined;
      let base = project;
      let system = owner;
      if (!system && item) {
        const itemProduct = getProduct(item.catalogId);
        const kind = (itemProduct ? systemKindsFor(itemProduct, packages) : []).find(entry => streamFor(entry, port.service)) ?? ductStart(catalogId)?.kind;
        if (kind) {
          const made = createSystemAt(project, kind, { xM: item.xM, yM: item.yM });
          base = updateEquipment(made.project, item.id, { systemId: made.system.id });
          system = made.system;
          edit(base);
        }
      }
      if (system) {
        const fit = ductPairAllowed(product, system.kind, port.service) ? product : DUCT_CATALOG.find(entry => ductPairAllowed(entry, system!.kind, port.service));
        if (fit) {
          const tool = armDuct(fit.id, { systemId: system.id, service: port.service }, base.systems);
          return { tool, start: { x: Number(port.x.toFixed(3)), y: Number(port.y.toFixed(3)), equipmentId: port.equipmentId, portId: port.portId } };
        }
      }
    }
    const fitting = systemsForProduct(product, project.systems);
    if (fitting.length > 0) {
      const current = tool.kind === 'duct' ? tool.systemId : selection.kind === 'system' ? selection.id : targetSystemId;
      const nearest = fitting.find(item => item.id === current) ?? [...fitting].sort((a, b) => systemDistance(project, a.id, point.xM, point.yM) - systemDistance(project, b.id, point.xM, point.yM))[0];
      return { tool: armDuct(product.id, { systemId: nearest.id, service: tool.kind === 'duct' && tool.systemId === nearest.id ? tool.service : servicesFor(product, nearest.kind)[0] }), start: null };
    }
    const fresh = ductStart(product.id);
    if (!fresh) return `${product.name} has no air type it can carry.`;
    const made = createSystemAt(project, fresh.kind, point);
    pendingSystem.current = { id: made.system.id, before: project };
    edit(made.project);
    return { tool: armDuct(product.id, { systemId: made.system.id, service: fresh.service }, made.project.systems), start: null };
  };
  const pickTool = (kind: ToolKind) => {
    if (kind === 'duct' || kind === 'load' || kind === 'place' || kind === 'door' || kind === 'window') return;
    setWallTypeId(null);
    setTool({ kind });
  };
  const runFix = (issue: CheckIssue) => {
    if (issue.selection) select(issue.selection);
  };
  /** Put one catalogue item on the plan in a system, or in none. */
  const putEquipment = (base: Project, product: CatalogProduct, point: { xM: number; yM: number }, systemId: string | null) => {
    const placed = constrainEquipmentPosition(base.rooms, { catalogId: product.id, yawDeg: 0, roomId: null }, point.xM, point.yM);
    const item = { ...buildPlacement(product, placed.room, { xM: placed.xM, yM: placed.yM }), systemId };
    edit({ ...base, equipment: [...base.equipment, item] });
    setLastProductId(product.id);
    select({ kind: 'equipment', id: item.id });
  };
  /** The unit (or fan) alone, heading a new system of its kind. */
  const placeAlone = (product: CatalogProduct, point: { xM: number; yM: number }) => {
    const made = createSystemAt(project, systemKindsFor(product, packages)[0] ?? 'other', point);
    putEquipment(made.project, product, point, made.system.id);
  };
  const chosenSystemId = () => (targetSystemId && project.systems.some(system => system.id === targetSystemId) ? targetSystemId : null);
  /**
   * Equipment dropped on the plan. Terminals join the nearest system that carries their air; fans and hoods join
   * a system of their kind nearby; units start their own system and offer a pregenerated one. Alt drops it alone.
   * Returns a note for the cursor when the item could not join anything.
   */
  const placeEquipment = (point: { xM: number; yM: number }, catalogId: string, at?: { clientX: number; clientY: number; alt?: boolean }): string | void => {
    const product = getProduct(catalogId);
    if (!product) return;
    const role = dropRole(product);
    const chosen = chosenSystemId();
    if (at?.alt || role === 'free') {
      putEquipment(project, product, point, at?.alt ? null : chosen);
      return;
    }
    if (chosen) {
      putEquipment(project, product, point, chosen);
      return;
    }
    if (role !== 'unit') {
      const target = joinTarget(project, product, point, packages);
      if (target) {
        putEquipment(project, product, point, target.id);
        return;
      }
      if (role === 'member') {
        putEquipment(project, product, point, null);
        return 'Placed without a system: none carries this air yet. Drop a unit or a system template first.';
      }
    }
    const offers = packagesFor(product, packages).slice(0, 4);
    if (offers.length === 0) {
      placeAlone(product, point);
      return;
    }
    setMenu({
      x: at?.clientX ?? window.innerWidth / 2,
      y: at?.clientY ?? window.innerHeight / 2,
      title: `Place ${product.model}`,
      items: [
        ...offers.map(({ pack, memberKey }) => ({
          id: `pack:${pack.id}`,
          label: `Pregenerated system: ${pack.name}`,
          detail: packageSummary(pack),
          run: () => {
            const laid = packageAround(pack, memberKey, product, point);
            placePackage(laid.drop, laid.pack);
          },
        })),
        { id: 'alone', label: `${product.model} only, in a new system`, detail: 'Add terminals and ducts yourself.', run: () => placeAlone(product, point) },
      ],
    });
  };
  const placePackage = (point: { xM: number; yM: number }, packageOrId: string | SystemPackage) => {
    const before = new Set(project.systems.map(system => system.id));
    const placed = applySystemPackage(project, packageOrId, point);
    if (placed === project) return;
    // A second copy of a template gets numbered system names, so the two stay apart in lists.
    const taken = new Set(project.systems.map(system => system.name));
    const next = {
      ...placed,
      systems: placed.systems.map(system => {
        if (before.has(system.id) || !taken.has(system.name)) return system;
        let n = 2;
        while (taken.has(`${system.name} ${n}`)) n += 1;
        taken.add(`${system.name} ${n}`);
        return { ...system, name: `${system.name} ${n}` };
      }),
    };
    edit(next);
    const created = next.systems.find(system => !before.has(system.id));
    setScene('plan');
    setView('model');
    if (step !== 'check') setStep('systems');
    if (created) select({ kind: 'system', id: created.id });
  };
  const placeLoad = (point: { xM: number; yM: number }, id: string): string | void => {
    if (project.rooms.length === 0) return 'Add a space first. Loads sit inside a space.';
    const next = addLoad(project, id, point);
    if (next === project) return 'Drop inside a space. Loads sit inside a space.';
    const created = (next.loads ?? [])[(next.loads ?? []).length - 1];
    edit(next);
    if (created) select({ kind: 'load', id: created.id });
  };
  /** What a catalogue drop at this point will do, for the hint at the cursor. Walls and openings are PlanView's. */
  const describeDrop = (drag: CatalogDrag, point: { xM: number; yM: number }, alt: boolean): DropHint | null => {
    const nameOf = (id: string | null | undefined) => project.systems.find(system => system.id === id)?.name ?? 'system';
    if (drag.kind === 'equipment') {
      const product = getProduct(drag.id);
      if (!product) return null;
      const role = dropRole(product);
      const chosen = chosenSystemId();
      if (role === 'free') return { text: chosen ? `${product.model} · into ${nameOf(chosen)}` : `${product.model} · no air system needed` };
      if (alt) return { text: `${product.model} · without a system` };
      if (chosen) return { text: `Into ${nameOf(chosen)}`, systemId: chosen };
      if (role !== 'unit') {
        const target = joinTarget(project, product, point, packages);
        if (target) return { text: `Joins ${target.name}`, systemId: target.id };
        if (role === 'member') return { text: 'No system carries this air yet', warn: true };
      }
      const kind = systemKindsFor(product, packages)[0] ?? 'other';
      const label = SYSTEM_KINDS.find(item => item.id === kind)?.label.toLowerCase() ?? 'system';
      return { text: packagesFor(product, packages).length > 0 ? `New ${label} system · pick a layout on drop` : `New ${label} system` };
    }
    if (drag.kind === 'package') {
      const pack = packages.find(item => item.id === drag.id);
      return { text: pack ? `Places ${pack.name}` : 'Places the system template' };
    }
    if (drag.kind === 'load') {
      const room = roomAtPoint(project.rooms, point.xM, point.yM);
      return room ? { text: `Into ${room.name}` } : { text: project.rooms.length === 0 ? 'Add a space first' : 'Drop inside a space', warn: true };
    }
    if (drag.kind === 'duct') {
      const product = getDuctProduct(drag.id);
      if (!product) return null;
      const branch = runUnder(project, point.xM, point.yM, 0.4);
      const branchSystem = branch ? project.systems.find(item => item.id === branch.run.systemId) : undefined;
      if (branch && branchSystem) return { text: `Branch off ${branchSystem.name} · ${DUCT_SERVICE_LABEL[branch.run.service].toLowerCase()}`, systemId: branchSystem.id };
      const port = openPorts(project).find(hit => Math.hypot(hit.x - point.xM, hit.y - point.yM) <= 0.6);
      if (port) {
        const item = project.equipment.find(entry => entry.id === port.equipmentId);
        const model = item ? getProduct(item.catalogId)?.model : undefined;
        return { text: `From ${model ?? 'the unit'} · ${DUCT_SERVICE_LABEL[port.service].toLowerCase()}`, systemId: item?.systemId ?? null };
      }
      const fitting = systemsForProduct(product, project.systems);
      if (fitting.length > 0) {
        const nearest = [...fitting].sort((a, b) => systemDistance(project, a.id, point.xM, point.yM) - systemDistance(project, b.id, point.xM, point.yM))[0];
        return { text: `New run in ${nearest.name}`, systemId: nearest.id };
      }
      const fresh = ductStart(product.id);
      return fresh ? { text: `New ${SYSTEM_KINDS.find(item => item.id === fresh.kind)?.label.toLowerCase()} system` } : { text: 'This duct carries no air type', warn: true };
    }
    return null;
  };
  const stepCount = (id: BuildStep): string => {
    if (id === 'spaces') return `${project.rooms.length}`;
    if (id === 'loads') return `${(project.loads ?? []).length}`;
    if (id === 'systems') return `${project.equipment.length}`;
    return checks.length === 0 ? 'OK' : `${checks.length}`;
  };
  const toolHint = (): string => {
    if (tool.kind === 'wall') return 'Click to add points. Click the first point to close.';
    if (tool.kind === 'draw') return 'Drag to draw a rectangular space.';
    if (tool.kind === 'duct') return 'Click to bend the run. Esc finishes.';
    if (step === 'spaces') return 'Drag a wall type, door, or window onto a wall.';
    if (step === 'loads') return 'Set climate, then drag loads into a space.';
    if (step === 'systems') return 'Drag equipment, a system template, or a duct onto the plan. Double-click a unit to open its internals.';
    return checks.length === 0 ? 'No issues found.' : 'Select an issue on the left to see it on the plan.';
  };

  const loadTotals = sumLoads(project, project.loads ?? []);
  const site = siteOf(project);
  const siteGapsList = siteMissing(site);
  const siteCoolLabel =
    site.coolingDbC == null
      ? null
      : project.units === 'IP'
        ? `${formatNumber((site.coolingDbC * 9) / 5 + 32, 0)} °F`
        : `${formatNumber(site.coolingDbC, 1)} °C`;
  const siteHeatLabel =
    site.heatingDbC == null
      ? null
      : project.units === 'IP'
        ? `${formatNumber((site.heatingDbC * 9) / 5 + 32, 0)} °F`
        : `${formatNumber(site.heatingDbC, 1)} °C`;
  const wallType = wallTypeId ? WALL_TYPES.find(item => item.id === wallTypeId) : undefined;
  const spaceNeedle = spaceQuery.trim().toLowerCase();
  const spaceWalls = WALL_TYPES.filter(type => `${type.label} ${type.detail}`.toLowerCase().includes(spaceNeedle));
  const spaceOpenings = (['door', 'window'] as const).filter(kind => kind.includes(spaceNeedle));
  const stepLabel = STEPS.find(item => item.id === step)?.label ?? '';
  const activeTool = (kind: ToolKind) => tool.kind === kind && !wallTypeId;
  const ductPorts = openPorts(project).map(hit => {
    const item = project.equipment.find(entry => entry.id === hit.equipmentId);
    const system = item?.systemId ? project.systems.find(entry => entry.id === item.systemId) : undefined;
    const stream = system ? streamFor(system.kind, hit.service) : null;
    const product = system && stream ? DUCT_CATALOG.find(entry => ductPairAllowed(entry, system.kind, hit.service)) : undefined;
    const equipment = item ? getProduct(item.catalogId) : undefined;
    return {
      hit,
      name: equipment?.model ?? 'Equipment',
      systemId: system?.id ?? '',
      systemName: system?.name ?? null,
      color: stream?.color ?? '#9aa6b0',
      service: stream?.label ?? DUCT_SERVICE_LABEL[hit.service],
      productId: product?.id ?? null,
    };
  });
  const nextIssue = () => {
    if (visibleChecks.length === 0) return;
    const issue = visibleChecks[checkIndex % visibleChecks.length];
    if (issue.selection) setSelection(issue.selection);
    setCheckIndex(index => (index + 1) % visibleChecks.length);
  };

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <button type="button" className="btn ghost" onClick={onBack}>
            ‹ Projects
          </button>
          <span className="mark">HP</span>
          <input className="name-input" aria-label="Project name" value={project.name} onChange={event => edit({ ...project, name: event.target.value })} />
        </div>
        <nav className="workspace-tabs" role="tablist" aria-label="Workspace">
          {CENTER_VIEWS.map(item => (
            <button key={item.id} type="button" role="tab" aria-selected={view === item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button type="button" className="btn ghost" onClick={undo} disabled={!historyTick.undo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button type="button" className="btn ghost" onClick={redo} disabled={!historyTick.redo} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <div className="menu">
            <button
              type="button"
              className="btn"
              aria-expanded={exportOpen}
              onClick={() => {
                setExportOpen(open => !open);
                setMoreOpen(false);
              }}
            >
              Export ▾
            </button>
            {exportOpen && (
              <div className="menu-panel">
                <button type="button" onClick={() => { exportSchedule(); setExportOpen(false); }}>
                  Schedule CSV
                </button>
                <button type="button" onClick={() => { exportSummary(); setExportOpen(false); }}>
                  Project summary JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView('schedule');
                    setExportOpen(false);
                    window.setTimeout(() => window.print(), 50);
                  }}
                >
                  Print schedule
                </button>
              </div>
            )}
          </div>
          <div className="menu">
            <button
              type="button"
              className="btn ghost icon"
              aria-label="More"
              aria-expanded={moreOpen}
              onClick={() => {
                setMoreOpen(open => !open);
                setExportOpen(false);
              }}
            >
              ⋯
            </button>
            {moreOpen && (
              <div className="menu-panel">
                <button
                  type="button"
                  onClick={() => {
                    setSelection({ kind: 'project' });
                    setView('model');
                    setMoreOpen(false);
                  }}
                >
                  Project settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTemplateName(`${project.name} template`);
                    setTemplateOpen(true);
                    setMoreOpen(false);
                  }}
                >
                  Save as template
                </button>
                {customTemplate && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateTemplate();
                      setMoreOpen(false);
                    }}
                  >
                    Update template
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      {view === 'model' && (
        <nav className="step-bar" role="tablist" aria-label="Build steps">
          {STEPS.map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 && <span className="step-sep" aria-hidden="true" />}
              <button type="button" role="tab" aria-selected={step === item.id} className={step === item.id ? 'active' : ''} onClick={() => changeStep(item.id)}>
                <span className="step-n">{index + 1}</span>
                <span className="step-label">{item.label}</span>
                <span className={`step-count${item.id === 'check' ? (checks.length > 0 ? ' warn' : ' ok') : ''}`}>{stepCount(item.id)}</span>
              </button>
            </Fragment>
          ))}
        </nav>
      )}
      <div className={`studio-body${view === 'model' ? '' : ' is-wide'}`}>
        {view === 'model' && (
          <aside className="side" aria-label={`${stepLabel} panel`}>
            <div className="side-tabs" role="tablist" aria-label="Project and catalogue">
              <button type="button" role="tab" aria-selected={sidePanel === 'project'} className={sidePanel === 'project' ? 'active' : ''} onClick={() => setSidePanel('project')}>
                Project
              </button>
              <button type="button" role="tab" aria-selected={sidePanel === 'catalog'} className={sidePanel === 'catalog' ? 'active' : ''} onClick={() => setSidePanel('catalog')}>
                Catalogue
              </button>
            </div>
            <div className="side-scroll">
              {sidePanel === 'project' && step === 'spaces' && (
                <section className="panel-section">
                  <header className="panel-head">
                    <h3>Spaces</h3>
                    <div className="panel-actions">
                      <button type="button" className="panel-btn" onClick={() => pickTool('draw')}>
                        + Draw
                      </button>
                      <button type="button" className={`panel-btn${showDimensions ? ' active' : ''}`} aria-pressed={showDimensions} onClick={() => setShowDimensions(value => !value)}>
                        + By size
                      </button>
                    </div>
                  </header>
                  {showDimensions && (
                    <DimensionForm
                      units={project.units}
                      onCreate={(lengthM, widthM, heightM) => {
                        const originX = project.rooms.reduce((max, room) => Math.max(max, room.xM + room.lengthM), 0);
                        const room = buildDimensionedRoom(project.rooms.length);
                        edit({ ...project, rooms: [...project.rooms, { ...room, xM: project.rooms.length ? originX + 0.3 : 0, lengthM, widthM, heightM }] });
                        setSelection({ kind: 'room', id: room.id });
                        setShowDimensions(false);
                        setFitToken(token => token + 1);
                      }}
                    />
                  )}
                  {project.rooms.length === 0 ? (
                    <p className="panel-empty">Draw walls or a room on the plan, or add a space by size.</p>
                  ) : (
                    <ProjectTree scope="spaces" project={project} selection={selection} onSelect={select} onContextMenu={openMenu} />
                  )}
                </section>
              )}
              {sidePanel === 'project' && step === 'loads' && (
                <>
                  <section className="panel-section">
                    <header className="panel-head">
                      <h3>Climate</h3>
                    </header>
                    <button type="button" className={`space-row${selection.kind === 'site' ? ' active' : ''}`} onClick={() => select({ kind: 'site' })}>
                      <span className="space-name">{site.station || 'Site climate'}</span>
                      <span className="panel-meta">
                        {siteCoolLabel && siteHeatLabel
                          ? `Cool ${siteCoolLabel} · Heat ${siteHeatLabel}`
                          : siteCoolLabel
                            ? `Cool ${siteCoolLabel}`
                            : 'Set exterior conditions'}
                      </span>
                    </button>
                    {siteGapsList.length > 0 ? (
                      <p className="panel-empty">Missing {siteGapsList.join(', ')}.</p>
                    ) : (
                      <p className="panel-empty">Exterior design day for envelope, solar, and infiltration.</p>
                    )}
                  </section>
                  <section className="panel-section">
                    <header className="panel-head">
                      <h3>Loads by space</h3>
                    </header>
                    {project.rooms.length === 0 ? (
                      <p className="panel-empty">Add spaces first. Each load sits inside a space.</p>
                    ) : (
                      <ul className="space-loads">
                        {project.rooms.map(room => {
                          const items = roomLoads(project, room.id);
                          const totals = sumLoads(project, items);
                          return (
                            <li key={room.id}>
                              <button type="button" className={`space-row${selection.kind === 'room' && selection.id === room.id ? ' active' : ''}`} onClick={() => select({ kind: 'room', id: room.id })}>
                                <span className="space-name">{room.name || 'Space'}</span>
                                <span className="panel-meta">{items.length ? `${formatPower(totals.sensibleW, project.units)} S · ${formatPower(totals.latentW, project.units)} L` : 'No loads'}</span>
                              </button>
                              {items.length > 0 && (
                                <ul className="load-rows">
                                  {items.map(item => {
                                    const product = getLoadProduct(item.loadId);
                                    return (
                                      <li key={item.id}>
                                        <button
                                          type="button"
                                          className={selection.kind === 'load' && selection.id === item.id ? 'active' : ''}
                                          onClick={() => select({ kind: 'load', id: item.id })}
                                          onContextMenu={event => {
                                            event.preventDefault();
                                            openMenu({ kind: 'load', id: item.id }, event.clientX, event.clientY);
                                          }}
                                        >
                                          {product ? <LoadIcon category={product.category} /> : <i className="load-dot" />}
                                          <span>{loadLabel(item, product)}</span>
                                          {item.override && <span className="pick-tag">{item.override.source === 'manufacturer' ? 'Mfr' : 'Manual'}</span>}
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </>
              )}
              {sidePanel === 'project' && step === 'systems' && (
                <>
                  <section className="panel-section">
                    <header className="panel-head">
                      <h3>Systems</h3>
                      <button
                        type="button"
                        className="panel-btn"
                        onClick={event => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          openSystemMenu(rect.left, rect.bottom + 4);
                        }}
                      >
                        + Add system
                      </button>
                    </header>
                    {project.systems.length === 0 && project.equipment.length === 0 ? (
                      <p className="panel-empty">Add a system, such as kitchen exhaust or make-up air, then place its equipment.</p>
                    ) : (
                      <ProjectTree scope="systems" project={project} selection={selection} onSelect={select} onContextMenu={openMenu} />
                    )}
                  </section>
                  <section className="panel-section">
                    <header className="panel-head">
                      <h3>Duct runs</h3>
                      <span className="panel-meta">{(project.ducts ?? []).length}</span>
                    </header>
                    {(project.ducts ?? []).length === 0 ? (
                      <p className="panel-empty">No ducts yet. Drag a product from Catalogue onto the plan.</p>
                    ) : (
                      <ProjectTree scope="ducts" project={project} selection={selection} onSelect={select} onContextMenu={openMenu} />
                    )}
                  </section>
                                  <section className="panel-section">
                    <header className="panel-head">
                      <h3>Open ports</h3>
                      <span className="panel-meta">{ductPorts.length}</span>
                    </header>
                    {ductPorts.length === 0 ? (
                      <p className="panel-empty">No open ports. Place ducted equipment, or every port already has a duct.</p>
                    ) : (
                      <ul className="pick-list">
                        {ductPorts.map(port => (
                          <li key={`${port.hit.equipmentId}:${port.hit.portId}`}>
                            <button
                              type="button"
                              title="Select this equipment"
                              onClick={() => select({ kind: 'equipment', id: port.hit.equipmentId })}
                            >
                              <i className="pick-swatch" style={{ background: ink(port.color) }} />
                              <span>
                                {port.name} · {port.service}
                              </span>
                              <span className="pick-meta">{port.systemName ?? 'No system'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section className="panel-section">
                    <header className="panel-head">
                      <h3>Piping</h3>
                      <button
                        type="button"
                        className="panel-btn"
                        onClick={() => {
                          const created = newPlantLoop('water', `Loop ${(project.plantLoops ?? []).length + 1}`);
                          edit({ ...project, plantLoops: [...(project.plantLoops ?? []), created] });
                          setSelection({ kind: 'loop', id: created.id });
                        }}
                      >
                        + Loop
                      </button>
                    </header>
                    {(project.plantLoops ?? []).length === 0 ? (
                      <p className="panel-empty">No plant loops. Pipe a coil from its unit, or add a loop.</p>
                    ) : (
                      <ul className="pick-list">
                        {(project.plantLoops ?? []).map(loop => (
                          <li key={loop.id}>
                            <button type="button" className={selection.kind === 'loop' && selection.id === loop.id ? 'active' : ''} onClick={() => select({ kind: 'loop', id: loop.id })}>
                              <i className="pick-swatch" style={{ background: ink(loopSwatch(loop)) }} />
                              <span>{loop.name}</span>
                              <span className="pick-meta">{LOOP_FLUID_LABEL[loop.fluid]}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section className="panel-section">
                    <header className="panel-head">
                      <h3>Controls</h3>
                      <span className="panel-meta">{(project.controlPoints ?? []).length}</span>
                    </header>
                    {(project.controlPoints ?? []).length === 0 ? (
                      <p className="panel-empty">No sensors. Add them on a unit's sections or room sensors.</p>
                    ) : (
                      <ul className="pick-list">
                        {(project.controlPoints ?? []).map(point => (
                          <li key={point.id}>
                            <button type="button" className={selection.kind === 'point' && selection.id === point.id ? 'active' : ''} onClick={() => select({ kind: 'point', id: point.id })}>
                              <span>{`${point.tag} · ${SENSOR_LABEL[point.sensor]}`}</span>
                              <span className="pick-meta">{pointPlace(project, point)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                                </>
              )}
              {sidePanel === 'project' && step === 'check' && (
                <>
                  <section className="panel-section">
                    <header className="panel-head">
                      <h3>Issues</h3>
                      <span className="panel-meta">{checks.length}</span>
                    </header>
                    <div className="chip-row" role="group" aria-label="Issue group">
                      {(['all', 'spaces', 'loads', 'systems'] as const).map(id => {
                        const count = id === 'all' ? checks.length : checks.filter(issue => issue.step === id).length;
                        return (
                          <button
                            key={id}
                            type="button"
                            className={checkFilter === id ? 'active' : ''}
                            aria-pressed={checkFilter === id}
                            onClick={() => {
                              setCheckFilter(id);
                              setCheckIndex(0);
                            }}
                          >
                            {id === 'all' ? 'All' : STEPS.find(item => item.id === id)?.label} {count}
                          </button>
                        );
                      })}
                    </div>
                    {visibleChecks.length === 0 ? (
                      <p className="panel-empty">{checks.length === 0 ? 'No issues found.' : 'No issues in this group.'}</p>
                    ) : (
                      <ul className="check-list">
                        {visibleChecks.map(issue => (
                          <li key={issue.id} className={`check-row ${issue.severity}`}>
                            <button type="button" className="check-msg" disabled={!issue.selection} onClick={() => issue.selection && setSelection(issue.selection)}>
                              <span className="check-sev">{issue.severity === 'planning' ? 'Planning' : issue.severity === 'error' ? 'Error' : 'Warning'}</span>
                              <span>{issue.message}</span>
                            </button>
                            {issue.fix.kind === 'duct' && (
                              <button type="button" className="panel-btn" onClick={() => runFix(issue)}>
                                {issue.fixLabel}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section className="panel-section">
                    <header className="panel-head">
                      <h3>Internal loads</h3>
                      <span className="panel-meta">{(project.loads ?? []).length} items</span>
                    </header>
                    <dl className="totals">
                      <div>
                        <dt>Sensible</dt>
                        <dd>{formatPower(loadTotals.sensibleW, project.units)}</dd>
                      </div>
                      <div>
                        <dt>Latent</dt>
                        <dd>{formatPower(loadTotals.latentW, project.units)}</dd>
                      </div>
                      <div>
                        <dt>Moisture</dt>
                        <dd>{formatNumber(loadTotals.moistureGh / 1000, 2)} kg/h</dd>
                      </div>
                      <div>
                        <dt>CO₂</dt>
                        <dd>{formatNumber(loadTotals.co2Ls, 3)} L/s</dd>
                      </div>
                      <div>
                        <dt>CO</dt>
                        <dd>{loadTotals.coMgS == null ? 'Not entered' : `${formatNumber(loadTotals.coMgS, 2)} mg/s`}</dd>
                      </div>
                    </dl>
                  </section>
                </>
              )}
              {sidePanel === 'catalog' && step === 'check' && (
                <section className="panel-section">
                  <p className="panel-empty">Nothing to place in Check. Use the Catalogue tab on Spaces, Loads, Equipment, or Ducts.</p>
                </section>
              )}
              {sidePanel === 'catalog' && step === 'spaces' && (
                <section className="panel-section">
                  <header className="panel-head">
                    <h3>Construction</h3>
                  </header>
                  <input className="panel-search" placeholder="Search construction" aria-label="Search construction" value={spaceQuery} onChange={event => setSpaceQuery(event.target.value)} />
                  {spaceWalls.length > 0 && (
                    <div className="load-group">
                      <p className="load-group-title">Walls</p>
                      <ul className="pick-list">
                        {spaceWalls.map(type => (
                          <li key={type.id}>
                            <CatalogDragRow token={catalogToken({ kind: 'wall', id: type.id })} title={type.detail}>
                              <i className="pick-swatch" style={{ background: ink(wallColor(type.assemblyId)) }} />
                              <span>{type.label}</span>
                            </CatalogDragRow>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {spaceOpenings.length > 0 && (
                    <div className="load-group">
                      <p className="load-group-title">Openings</p>
                      <ul className="pick-list">
                        {spaceOpenings.map(kind => (
                          <li key={kind}>
                            <CatalogDragRow token={catalogToken({ kind: 'opening', opening: kind })}>
                              <DrawIcon kind={kind} />
                              <span>{kind === 'door' ? 'Door' : 'Window'}</span>
                            </CatalogDragRow>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {spaceWalls.length === 0 && spaceOpenings.length === 0 && <p className="panel-empty">No construction matches.</p>}
                  <p className="panel-note">Drag a wall type, door, or window onto a wall.</p>
                </section>
              )}
              {sidePanel === 'catalog' && step === 'loads' && (
                <section className="panel-section">
                  <header className="panel-head">
                    <h3>Loads</h3>
                  </header>
                  <input className="panel-search" placeholder="Search loads" aria-label="Search loads" value={loadQuery} onChange={event => setLoadQuery(event.target.value)} />
                  <div className="chip-row" role="group" aria-label="Load category">
                    {(['all', ...LOAD_CATEGORY_ORDER] as const).map(id => (
                      <button key={id} type="button" className={loadCategory === id ? 'active' : ''} aria-pressed={loadCategory === id} onClick={() => setLoadCategory(id)}>
                        {id === 'all' ? 'All' : LOAD_CATEGORY_LABEL[id]}
                      </button>
                    ))}
                  </div>
                  <LoadCatalogList query={loadQuery} category={loadCategory} units={project.units} />
                  <p className="panel-note">Drag a load into a space. Defaults are from ASHRAE Handbook—Fundamentals 2025, Ch. 18.</p>
                </section>
              )}
              {sidePanel === 'catalog' && step === 'systems' && (
                <section className="panel-section">
                  <header className="panel-head">
                    <h3>Equipment and ducts</h3>
                  </header>
                  <input className="panel-search" placeholder="Search equipment, templates, ducts" aria-label="Search equipment and ducts" value={query} onChange={event => setQuery(event.target.value)} />
                  <div className="chip-row" role="group" aria-label="Equipment family">
                    {(['all', ...FAMILY_ORDER] as const).map(id => (
                      <button key={id} type="button" className={catalogFamily === id ? 'active' : ''} aria-pressed={catalogFamily === id} onClick={() => setCatalogFamily(id)}>
                        {id === 'all' ? 'All' : FAMILY_LABEL[id]}
                      </button>
                    ))}
                  </div>
                  <CatalogTree
                    query={query}
                    family={catalogFamily}
                    category="all"
                    armedId={null}
                    showDucts={catalogFamily === 'all'}
                    ductsOnly={false}
                    onArm={() => {}}
                    onArmDuct={() => {}}
                  />
                  <p className="panel-note">Drag equipment or a template onto the plan. Drag a duct to start a run, then click to bend.</p>
                </section>
              )}
            </div>
          </aside>
        )}
        <section className="stage">
          {view === 'model' && (
            <>
              <div className="stage-canvas">
                {scene === 'plan' ? (
                  <PlanView
                    project={project}
                    locked={positionsLocked}
                    selection={selection}
                    tool={tool}
                    fitToken={fitToken}
                    step={step}
                    layers={layers}
                    expandedUnits={expandedUnits}
                    onToggleInternals={toggleInternals}
                    onSelect={chooseView}
                    onDrawRoom={rect => {
                      const room = buildDrawnRoom(rect, project.rooms.length);
                      edit({ ...project, rooms: [...project.rooms, room] });
                      select({ kind: 'room', id: room.id });
                    }}
                    onDrawWalls={lines => {
                      let next = project;
                      for (const line of lines) next = addWallRun(next, line);
                      if (next === project) return;
                      const created = (next.wallRuns ?? [])[(next.wallRuns ?? []).length - 1];
                      edit(next);
                      if (created) select({ kind: 'wallRun', id: created.id });
                    }}
                    onDrawDuct={draft => {
                      const next = addDuct(project, { ...draft, view: 'plan' });
                      if (next === project) return;
                      const created = (next.ducts ?? [])[(next.ducts ?? []).length - 1];
                      edit(next);
                      if (created) select({ kind: 'duct', id: created.id });
                    }}
                    onCloseSpace={points => {
                      const room = buildOutlineRoom(points, project.rooms.length);
                      if (!room) return;
                      edit({ ...project, rooms: [...project.rooms, room] });
                      select({ kind: 'room', id: room.id });
                      setTool({ kind: 'select' });
                    }}
                    onPlaceOpening={(spot, kind) => {
                      if (spot.roomId && spot.face) {
                        const next = placeOpeningOnRoom(project, spot.roomId, kind, spot.face, spot.offsetM);
                        if (next === project) return;
                        const room = next.rooms.find(item => item.id === spot.roomId);
                        const created = room?.openings[room.openings.length - 1];
                        edit(next);
                        if (created) select({ kind: 'opening', roomId: spot.roomId, id: created.id });
                        return;
                      }
                      if (!spot.wallId) return;
                      const next = addWallRunOpening(project, spot.wallId, kind, spot.offsetM);
                      if (next === project) return;
                      const run = (next.wallRuns ?? []).find(item => item.id === spot.wallId);
                      const created = run?.openings[run.openings.length - 1];
                      edit(next);
                      if (created) select({ kind: 'wallOpening', wallId: spot.wallId, id: created.id });
                    }}
                    onPlace={placeEquipment}
                    onPlacePackage={placePackage}
                    onPlaceLoad={placeLoad}
                    onBeginDuct={beginDuctAt}
                    describeDrop={describeDrop}
                    onPaintWall={paintWall}
                    onMoveLoad={(id, xM, yM) => edit(updateLoad(project, id, { xM, yM }))}
                    onRotateLoad={(id, yawDeg) => edit(updateLoad(project, id, { yawDeg }))}
                    onContextMenu={openMenu}
                    onRoomsChange={rooms => edit({ ...project, rooms })}
                    onNorthChange={deg => edit({ ...project, northDeg: deg === 0 ? undefined : deg })}
                    onMoveSpace={(roomId, dx, dy) => {
                      const shift = <T extends { xM: number; yM: number }>(item: T): T => ({ ...item, xM: Number((item.xM + dx).toFixed(3)), yM: Number((item.yM + dy).toFixed(3)) });
                      edit(
                        syncDuctPorts({
                          ...project,
                          rooms: project.rooms.map(room => (room.id === roomId ? translateRoom(room, dx, dy) : room)),
                          equipment: project.equipment.map(item => (item.roomId === roomId ? shift(item) : item)),
                          loads: (project.loads ?? []).map(item => (item.roomId === roomId ? shift(item) : item)),
                        })
                      );
                    }}
                    onMoveEquipment={(id, xM, yM) => {
                      const item = project.equipment.find(entry => entry.id === id);
                      const product = item ? getProduct(item.catalogId) : undefined;
                      if (!item || !product) return;
                      const placed = constrainEquipmentPosition(project.rooms, item, xM, yM);
                      if (Math.abs(placed.xM - item.xM) < 1e-6 && Math.abs(placed.yM - item.yM) < 1e-6 && (placed.room?.id ?? null) === item.roomId) return;
                      edit(syncDuctPorts(updateEquipment(project, id, { xM: placed.xM, yM: placed.yM, roomId: placed.room?.id ?? null, zM: placementZ(placed.room, product) })));
                      select({ kind: 'equipment', id });
                    }}
                    onRotateEquipment={(id, yawDeg) => {
                      const item = project.equipment.find(entry => entry.id === id);
                      const product = item ? getProduct(item.catalogId) : undefined;
                      if (!item || !product) return;
                      const placed = constrainEquipmentPosition(project.rooms, { ...item, yawDeg }, item.xM, item.yM);
                      edit(
                        syncDuctPorts(
                          updateEquipment(project, id, {
                            yawDeg,
                            xM: placed.xM,
                            yM: placed.yM,
                            roomId: placed.room?.id ?? null,
                            zM: placementZ(placed.room, product),
                          })
                        )
                      );
                      select({ kind: 'equipment', id });
                    }}
                  />
                ) : (
                  <div className="viewport">
                    <Viewport
                      rooms={project.rooms}
                      equipment={project.equipment}
                      wallRuns={project.wallRuns ?? NO_WALL_RUNS}
                      interfaceWalls={project.interfaceWalls}
                      selection={selection}
                      tool={tool}
                      fitToken={fitToken}
                      hideRoof={hideRoof}
                      cameraPose={cameraPose}
                      onCameraSettled={pose => {
                        if (pose === 'top') setScene('plan');
                      }}
                      onSelect={chooseView}
                      onDrawRoom={rect => {
                        const room = buildDrawnRoom(rect, project.rooms.length);
                        edit({ ...project, rooms: [...project.rooms, room] });
                        select({ kind: 'room', id: room.id });
                      }}
                      onPlace={placeEquipment}
                      onPlaceLoad={placeLoad}
                      onContextMenu={openMenu}
                    />
                  </div>
                )}
                <div className="canvas-float canvas-tools" role="toolbar" aria-label={`${stepLabel} tools`}>
                  {STEP_TOOLS[step].map(kind => (
                    <button
                      key={kind}
                      type="button"
                      className={activeTool(kind) ? 'active' : ''}
                      aria-pressed={activeTool(kind)}
                      disabled={kind === 'place' && !lastProductId}
                      title={kind === 'place' && !lastProductId ? 'Pick equipment in the catalog first' : TOOL_LABEL[kind]}
                      onClick={() => pickTool(kind)}
                    >
                      <DrawIcon kind={kind} />
                      <span>{TOOL_LABEL[kind]}</span>
                    </button>
                  ))}
                  {scene === 'plan' && (
                    <button
                      type="button"
                      className={['lock-toggle', positionsLocked ? 'active' : ''].filter(Boolean).join(' ')}
                      aria-pressed={positionsLocked}
                      title={positionsLocked ? 'Positions locked: click to select only. Click to unlock moving.' : 'Lock positions: stop anything from being moved by dragging'}
                      onClick={toggleLock}
                    >
                      <LockIcon locked={positionsLocked} />
                      <span>{positionsLocked ? 'Locked' : 'Lock'}</span>
                    </button>
                  )}
                </div>
                <div className="canvas-float canvas-view">
                  <div className="seg" role="group" aria-label="View">
                    <button
                      type="button"
                      className={scene === 'plan' ? 'active' : ''}
                      onClick={() => {
                        setScene('plan');
                        if (scene === '3d') setCameraPose('top');
                      }}
                    >
                      Plan
                    </button>
                    <button
                      type="button"
                      className={scene === '3d' ? 'active' : ''}
                      onClick={() => {
                        setCameraPose('orbit');
                        setScene('3d');
                      }}
                    >
                      3D
                    </button>
                  </div>
                  <button type="button" data-layers-toggle className={layersOpen ? 'active' : ''} aria-expanded={layersOpen} onClick={() => setLayersOpen(open => !open)}>
                    Layers ▾
                  </button>
                  <button type="button" onClick={() => setFitToken(token => token + 1)}>
                    Fit
                  </button>
                </div>
                {layersOpen && <LayersMenu layers={layers} scene={scene} hideRoof={hideRoof} onChange={setLayers} onHideRoof={setHideRoof} onClose={() => setLayersOpen(false)} />}
              <div className="options-strip" aria-label={`${stepLabel} options`}>
                <div className="strip-scroll">
                {step === 'spaces' && (
                  <div className="plan-legend strip-legend">
                    <div><i className="swatch" style={{ background: ink(wallColor('asm-wall-dining')) }} />Framed</div>
                    <div><i className="swatch" style={{ background: ink(wallColor('asm-wall-kitchen')) }} />Masonry</div>
                    <div><i className="swatch" style={{ background: ink(wallColor('asm-wall-metal-building')) }} />Metal bldg</div>
                    <div><i className="swatch" style={{ background: ink(wallColor('asm-wall-partition')) }} />Partition</div>
                    <div><i className="swatch" style={{ background: ink(wallColor('asm-wall-walkin')) }} />Panel</div>
                    <div><i className="swatch" style={{ background: ink(wallColor('asm-wall-glass')) }} />Glass</div>
                    <div><i className="swatch" style={{ background: ink(INTERFACE_COLOR) }} />Interface</div>
                    <div><i className="swatch" style={{ background: ink(wallColor(null)) }} />Unassigned</div>
                  </div>
                )}
                {step === 'spaces' && wallType && (
                  <span className="opt-chip">
                    <i className="pick-swatch" style={{ background: ink(wallColor(wallType.assemblyId)) }} />
                    Painting {wallType.label}
                    <button type="button" aria-label="Stop painting walls" onClick={() => setWallTypeId(null)}>
                      ×
                    </button>
                  </span>
                )}
                {step === 'systems' &&
                  (tool.kind === 'duct' ? (
                    <DuctBar project={project} tool={tool} showSize={layers.ductWidth} onShowSize={show => setLayers(current => ({ ...current, ductWidth: show }))} onChange={setTool} />
                  ) : (
                    <>
                      <label className="opt">
                        <span>Place into</span>
                        <select value={targetSystemId} onChange={event => setTargetSystemId(event.target.value)}>
                          <option value="">No system</option>
                          {project.systems.map(system => (
                            <option key={system.id} value={system.id}>
                              {system.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="chip-row layer-chips" role="group" aria-label="Systems layers">
                        {SYSTEM_LAYERS.map(entry => (
                          <button
                            key={entry.key}
                            type="button"
                            className={layers[entry.key] ? 'active' : ''}
                            aria-pressed={layers[entry.key]}
                            title={entry.hint}
                            onClick={() => setLayers(current => ({ ...current, [entry.key]: !current[entry.key] }))}
                          >
                            {entry.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ))}
                {step === 'check' && (
                  <>
                    <button type="button" className="btn" onClick={nextIssue} disabled={visibleChecks.length === 0}>
                      Next issue
                    </button>
                    <DuctLegend />
                  </>
                )}
                {tool.kind !== 'duct' && (
                  <label className="opt opt-check">
                    <input type="checkbox" checked={layers.labels} onChange={event => setLayers(current => ({ ...current, labels: event.target.checked }))} />
                    <span>Details on all items</span>
                  </label>
                )}
                </div>
                <span className="opt-hint" title={toolHint()}>{toolHint()}</span>
              </div>
              </div>
            </>
          )}
          {view === 'schedule' && <SchedulePanel project={project} assemblies={assemblies} materials={materials} />}
          {view === 'library' && <LibraryPanel added={addedMaterials} onChange={onLibraryChange} addedAssemblies={addedAssemblies} onAssembliesChange={onAssembliesChange} />}
          {view === 'boundary' && <BoundaryPanel project={project} />}
        </section>
        {view === 'model' && (
          <Inspector project={project} selection={selection} materials={materials} assemblies={assemblies} onChange={edit} onSelect={select} onDeleteProject={onDeleteProject} nameFocus={nameFocus} expandedUnits={expandedUnits} internalsLayer={layers.internals} onToggleInternals={toggleInternals} />
        )}
      </div>
      <footer className="statusbar">
        <SettingsButton />
        <span>{project.buildingType}{project.subtype ? ` · ${project.subtype}` : ''}</span>
        <span>{project.units === 'IP' ? 'IP display' : 'SI display'}</span>
        <span>
          {project.rooms.length} spaces · {project.equipment.length} items · {project.systems.length} systems
        </span>
        <span>solver not connected</span>
      </footer>
      {templateOpen && (
        <form
          className="dialog"
          onSubmit={event => {
            event.preventDefault();
            onSaveTemplate(templateName.trim() || `${project.name} template`);
            setTemplateOpen(false);
          }}
        >
          <h2>Save as template</h2>
          <label className="field">
            <span>Template name</span>
            <input value={templateName} onChange={event => setTemplateName(event.target.value)} />
          </label>
          <div className="button-row">
            <button type="submit" className="btn primary">
              Save template
            </button>
            <button type="button" className="btn" onClick={() => setTemplateOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

const TREE_CATALOG_KEY = 'hvac-tree-catalog';

function readExpanded(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

function writeExpanded(storageKey: string, keys: Set<string>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...keys]));
  } catch {
    /* storage unavailable */
  }
}

function TreeNode({
  active = false,
  collapsed,
  title,
  toggleLabel,
  onToggle,
  onSelect,
  onMenu,
  dragId,
  content,
  children,
}: {
  active?: boolean;
  collapsed?: boolean;
  title?: string;
  toggleLabel?: string;
  onToggle?: () => void;
  onSelect: () => void;
  onMenu?: (event: ReactMouseEvent) => void;
  dragId?: string;
  content: ReactNode;
  children?: ReactNode;
}) {
  const dragged = useRef(false);
  return (
    <li>
      <div className={`tree-row${onToggle ? ' branch' : ''}${active ? ' active' : ''}`}>
        {onToggle ? (
          <button type="button" className="tree-exp" aria-expanded={!collapsed} aria-label={toggleLabel} onClick={event => { event.stopPropagation(); onToggle(); }}>
            {collapsed ? '+' : '−'}
          </button>
        ) : (
          <span className="tree-exp leaf" aria-hidden="true" />
        )}
        <div
          role="button"
          tabIndex={0}
          className={`tree-item${dragId ? ' draggable' : ''}`}
          title={title}
          draggable={dragId != null}
          onDragStart={event => {
            if (!dragId) return;
            dragged.current = true;
            event.dataTransfer.setData(CATALOG_MIME, dragId);
            event.dataTransfer.effectAllowed = 'copy';
            setActiveCatalogDrag(dragId);
          }}
          onDragEnd={() => {
            setActiveCatalogDrag(null);
            window.setTimeout(() => {
              dragged.current = false;
            }, 50);
          }}
          onClick={event => {
            if (dragged.current) return;
            if (event.button !== 0) return;
            onSelect();
          }}
          onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onSelect();
          }}
          onContextMenu={event => {
            event.preventDefault();
            event.stopPropagation();
            onMenu?.(event);
          }}
        >
          {content}
        </div>
      </div>
      {onToggle && !collapsed ? <ul>{children}</ul> : null}
    </li>
  );
}

function CatalogTree({
  query,
  family,
  category,
  armedId,
  showDucts,
  ductsOnly,
  onArm,
  onArmDuct,
}: {
  query: string;
  family: EquipmentFamily | 'ducts' | 'all';
  category: EquipmentCategory | 'all';
  armedId: string | null;
  showDucts: boolean;
  ductsOnly: boolean;
  onArm: (catalogId: string) => void;
  onArmDuct: (catalogId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => readExpanded(TREE_CATALOG_KEY));
  const closed = (key: string) => !expanded.has(key);
  const toggle = (key: string) =>
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeExpanded(TREE_CATALOG_KEY, next);
      return next;
    });
  const needle = query.trim().toLowerCase();
  const families = ductsOnly ? [] : FAMILY_ORDER.filter(item => family === 'all' || item === family);
  const ductNeedle = query.trim().toLowerCase();
  const ductProducts = DUCT_CATALOG.filter(product => `${product.name} ${product.manufacturer} ${product.model} ${product.supplier} ${product.group}`.toLowerCase().includes(ductNeedle));
  const allPackages = useSystemPackages();
  const packages = allPackages.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(needle));
  if (ductsOnly) {
    return (
      <ul className="tn-tree">
        {ductProducts.length === 0 && <li className="tree-empty">No ducts match.</li>}
        {ductProducts.map(product => (
          <TreeNode
            key={product.id}
            active={armedId === product.id}
            dragId={catalogToken({ kind: 'duct', id: product.id })}
            title={`${product.name} — ${product.manufacturer}`}
            onSelect={() => onArmDuct(product.id)}
            content={<><span className="tree-label">{product.name}</span><span className="tree-meta">{product.manufacturer}</span></>}
          />
        ))}
      </ul>
    );
  }
  return (
    <ul className="tn-tree">
      {!ductsOnly && (
        <TreeNode
          collapsed={closed('packages')}
          toggleLabel="System templates"
          onToggle={() => toggle('packages')}
          onSelect={() => toggle('packages')}
          content={<><span className="tree-label">System templates</span><span className="tree-meta">{packages.length}</span></>}
        >
          {packages.length === 0 && <li className="tree-empty">No system templates match.</li>}
          {PACKAGE_GROUPS.map(group => {
            const rows = packages.filter(item => item.group === group);
            if (rows.length === 0) return null;
            return (
              <TreeNode
                key={group}
                collapsed={closed(`packages:${group}`)}
                toggleLabel={group}
                onToggle={() => toggle(`packages:${group}`)}
                onSelect={() => toggle(`packages:${group}`)}
                content={<><span className="tree-label">{group}</span><span className="tree-meta">{rows.length}</span></>}
              >
                {rows.map(item => (
                  <TreeNode
                    key={item.id}
                    dragId={catalogToken({ kind: 'package', id: item.id })}
                    title={`${item.description}\n${packageSummary(item)}`}
                    onSelect={() => {}}
                    content={<><span className="tree-label">{item.name}</span><span className="tree-meta">Drag onto plan</span></>}
                  />
                ))}
              </TreeNode>
            );
          })}
        </TreeNode>
      )}
      {showDucts && (
        <TreeNode
          collapsed={closed('ducts')}
          toggleLabel="Ducts"
          onToggle={() => toggle('ducts')}
          onSelect={() => toggle('ducts')}
          content={<><span className="tree-label">Ducts</span><span className="tree-meta">{ductProducts.length}</span></>}
        >
          {ductProducts.length === 0 && <li className="tree-empty">No ducts match.</li>}
          {ductProducts.map(product => (
            <TreeNode
              key={product.id}
              active={armedId === product.id}
              dragId={catalogToken({ kind: 'duct', id: product.id })}
              title={product.model}
              onSelect={() => onArmDuct(product.id)}
              content={<><span className="tree-label">{product.name}</span><span className="tree-meta">{product.manufacturer}</span></>}
            />
          ))}
        </TreeNode>
      )}
      {families.map(familyId => {
        const groups = FAMILY_CATEGORIES[familyId]
          .filter(item => category === 'all' || item === category)
          .map(item => ({
            id: item,
            label: CATEGORY_LABEL[item],
            products: CATALOG.filter(
              product =>
                product.category === item &&
                `${product.name} ${product.manufacturer} ${product.model} ${product.supplier}`.toLowerCase().includes(needle)
            ),
          }))
          .filter(group => group.products.length > 0 || !needle);
        const total = groups.reduce((sum, group) => sum + group.products.length, 0);
        if (needle && total === 0) return null;
        return (
          <TreeNode
            key={familyId}
            collapsed={closed(familyId)}
            toggleLabel={FAMILY_LABEL[familyId]}
            onToggle={() => toggle(familyId)}
            onSelect={() => toggle(familyId)}
            content={
              <>
                <span className="tree-label">{FAMILY_LABEL[familyId]}</span>
                <span className="tree-meta">{total}</span>
              </>
            }
          >
            {groups.length === 0 && <li className="tree-empty">No products match.</li>}
            {groups.map(group => (
              <TreeNode
                key={group.id}
                collapsed={closed(group.id)}
                toggleLabel={group.label}
                onToggle={() => toggle(group.id)}
                onSelect={() => toggle(group.id)}
                content={
                  <>
                    <EquipmentIcon name={categoryIcon(group.id)} />
                    <span className="tree-label">{group.label}</span>
                    <span className="tree-meta">{group.products.length}</span>
                  </>
                }
              >
                {group.products.length === 0 && <li className="tree-empty">None yet — ready for new types.</li>}
                {group.products.map(product => {
                  const spec = [product.airflow?.stated, product.cooling?.stated, product.heating?.stated].filter(Boolean).join(' · ');
                  return (
                    <TreeNode
                      key={product.id}
                      active={armedId === product.id}
                      dragId={catalogToken({ kind: 'equipment', id: product.id })}
                      title={product.model}
                      onSelect={() => onArm(product.id)}
                      content={
                        <>
                          <EquipmentIcon name={equipmentIconFor(product)} />
                          <span className="tree-label">{product.name}</span>
                          {spec ? <span className="tree-meta">{spec}</span> : null}
                        </>
                      }
                    />
                  );
                })}
              </TreeNode>
            ))}
          </TreeNode>
        );
      })}
    </ul>
  );
}

function ProjectTree({
  project,
  selection,
  onSelect,
  onContextMenu,
  scope,
}: {
  project: Project;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
  scope: 'spaces' | 'systems' | 'ducts';
}) {
  const storageKey = `hvac-tree-project:${project.id}`;
  const [expanded, setExpanded] = useState<Set<string>>(() => readExpanded(storageKey));
  const [expandedFor, setExpandedFor] = useState(project.id);
  if (expandedFor !== project.id) {
    setExpandedFor(project.id);
    setExpanded(readExpanded(storageKey));
  }
  const closed = (key: string) => !expanded.has(key);
  const toggle = (key: string) =>
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeExpanded(storageKey, next);
      return next;
    });
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      return;
    }
    setExpanded(current => {
      const next = new Set(current);
      let changed = false;
      const open = (key: string) => {
        if (next.has(key)) return;
        next.add(key);
        changed = true;
      };
      if (selection.kind === 'room' || selection.kind === 'surface' || selection.kind === 'opening') {
        const roomId = selection.kind === 'room' ? selection.id : selection.roomId;
        open(`room:${roomId}`);
        if (selection.kind === 'surface' && selection.face === 'walls' && selection.wallFace) open(`wall:${roomId}:${selection.wallFace}`);
        if (selection.kind === 'opening') {
          const room = project.rooms.find(item => item.id === roomId);
          const opening = room?.openings.find(item => item.id === selection.id);
          if (opening) {
            open(`wall:${roomId}:${opening.face}`);
            const shared = room ? interfaceForOpening(room, opening, project.rooms) : null;
            if (shared) open(`interface:${shared.key}`);
          }
        }
      }
      if (selection.kind === 'interface') {
        findInterface(project.rooms, selection.key)?.sides.forEach(side => {
          open(`room:${side.roomId}`);
          if (side.anchor.startsWith('f:')) open(`wall:${side.roomId}:${side.anchor.slice(2)}`);
          if (side.anchor.startsWith('e:')) open(`edge:${side.roomId}:${side.anchor.slice(2)}`);
        });
      }
      if (selection.kind === 'system') open(`system:${selection.id}`);
      if (selection.kind === 'duct') {
        const run = (project.ducts ?? []).find(item => item.id === selection.id);
        if (run) {
          open('systems');
          open(`system:${run.systemId}`);
        }
      }
      if (selection.kind === 'equipment') {
        const item = project.equipment.find(entry => entry.id === selection.id);
        if (item?.systemId) {
          open('systems');
          open(`system:${item.systemId}`);
        } else if (item?.roomId) {
          open('unassigned');
          open(`room:${item.roomId}`);
        } else {
          open('unassigned');
        }
      }
      if (!changed) return current;
      writeExpanded(storageKey, next);
      return next;
    });
  }, [selection, project.rooms, project.equipment, project.ducts, storageKey]);
  const selected = (kind: Selection['kind'], id?: string) => selection.kind === kind && ('id' in selection ? selection.id === id : true);
  const unit = lengthUnit(project.units);
  const targets = interfaceTargets(project.rooms);
  const wallInterfaces = (roomId: string, anchor: string) =>
    targets
      .filter(target => target.sides.some(side => side.roomId === roomId && side.anchor === anchor))
      .sort((a, b) => {
        const startOf = (target: (typeof targets)[number]) => target.sides.find(side => side.roomId === roomId && side.anchor === anchor)?.startM ?? 0;
        return startOf(a) - startOf(b);
      });
  const unassigned = project.equipment.filter(item => !item.systemId);
  const roomNodes = project.rooms.map(room => {
        const roomKey = `room:${room.id}`;
        const roomClosed = closed(roomKey);
        const hosted = project.equipment.filter(item => item.roomId === room.id && !item.systemId);
        return (
          <TreeNode
            key={room.id}
            active={selected('room', room.id)}
            collapsed={roomClosed}
            toggleLabel={`${roomClosed ? 'Expand' : 'Collapse'} ${room.name}`}
            onToggle={() => toggle(roomKey)}
            onSelect={() => onSelect({ kind: 'room', id: room.id })}
            onMenu={event => onContextMenu({ kind: 'room', id: room.id }, event.clientX, event.clientY)}
            content={
              <>
                <strong>
                  <i className="room-dot" style={{ background: wash(roomFill(room.use)) }} />
                  <span>{room.name}</span>
                  {room.assumption && <i className="dot" title="Assumption" />}
                </strong>
                <span className="tree-meta">
                  {room.outline && room.outline.length >= 3
                    ? formatArea(polygonArea(room.outline), project.units)
                    : `${formatNumber(mToLength(room.lengthM, project.units), 1)} × ${formatNumber(mToLength(room.widthM, project.units), 1)} ${unit}`}
                  {hosted.length > 0 ? ` · ${hosted.length}` : ''}
                </span>
              </>
            }
          >
                {SURFACE_FACES.filter(face => face.id !== 'walls').map(face => (
                  <TreeNode
                    key={face.id}
                    active={selection.kind === 'surface' && selection.roomId === room.id && selection.face === face.id}
                    onSelect={() => onSelect({ kind: 'surface', roomId: room.id, face: face.id })}
                    content={face.label}
                  />
                ))}
                {room.outline && room.outline.length >= 3 && room.outline.map((point, index) => {
                  const next = room.outline![(index + 1) % room.outline!.length];
                  const length = Math.hypot(next.x - point.x, next.y - point.y);
                  const wallKey = `edge:${room.id}:${index}`;
                  const interfaces = wallInterfaces(room.id, `e:${index}`);
                  const shown = interfaces.length > 1 ? interfaces : [];
                  const wallClosed = closed(wallKey);
                  const soleKey = interfaces.length === 1 ? interfaces[0].key : null;
                  return (
                    <TreeNode
                      key={`edge-${index}`}
                      active={
                        (selection.kind === 'surface' && selection.roomId === room.id && selection.face === 'walls' && selection.edge === index) ||
                        (selection.kind === 'interface' && selection.key === soleKey)
                      }
                      title={portionSummary(edgePortions(room, index, project.rooms))}
                      collapsed={shown.length > 0 ? wallClosed : undefined}
                      toggleLabel={shown.length > 0 ? `${wallClosed ? 'Expand' : 'Collapse'} ${wallName(room, { edge: index }, project.rooms, project.northDeg)}` : undefined}
                      onToggle={shown.length > 0 ? () => toggle(wallKey) : undefined}
                      onSelect={() => onSelect({ kind: 'surface', roomId: room.id, face: 'walls', edge: index })}
                      content={<><span className="tree-label">{wallName(room, { edge: index }, project.rooms, project.northDeg)}</span><span className="tree-meta">{formatLength(length, project.units, 2)}</span></>}
                    >
                      {shown.map(target => {
                        const role = wallRoleLabel(project.interfaceWalls?.[target.key]?.constructionId);
                        const other = interfacePartyName(target.sides, room.id);
                        return (
                          <TreeNode key={target.key} active={selection.kind === 'interface' && selection.key === target.key} onSelect={() => onSelect({ kind: 'interface', key: target.key })} content={<><span className="tree-label">Interface · {other}</span><span className="tree-meta">{formatLength(target.lengthM, project.units, 2)}{role !== 'Unassigned' ? ` · ${role}` : ''}</span></>} />
                        );
                      })}
                    </TreeNode>
                  );
                })}
                {!(room.outline && room.outline.length >= 3) && WALL_FACES.map(face => {
                  const wallKey = `wall:${room.id}:${face.id}`;
                  const wallClosed = closed(wallKey);
                  const openings = room.openings.filter(opening => opening.face === face.id);
                  const interfaces = wallInterfaces(room.id, `f:${face.id}`);
                  const shown = interfaces.length > 1 ? interfaces : [];
                  const children = openings.length + shown.length;
                  const soleKey = interfaces.length === 1 ? interfaces[0].key : null;
                  const wallActive =
                    (selection.kind === 'surface' && selection.roomId === room.id && selection.face === 'walls' && selection.wallFace === face.id) ||
                    (selection.kind === 'interface' && selection.key === soleKey);
                  const role = wallRoleLabel(interfaces.length === 1 ? project.interfaceWalls?.[interfaces[0].key]?.constructionId : room.surfaces.walls[face.id].constructionId);
                  return (
                    <TreeNode
                      key={face.id}
                      active={wallActive}
                      title={`${wallPlaceLabel(room, face.id, project.rooms, project.northDeg)} · ${role}`}
                      collapsed={children > 0 ? wallClosed : undefined}
                      toggleLabel={children > 0 ? `${wallClosed ? 'Expand' : 'Collapse'} ${wallName(room, { face: face.id }, project.rooms, project.northDeg)}` : undefined}
                      onToggle={children > 0 ? () => toggle(wallKey) : undefined}
                      onSelect={() => onSelect({ kind: 'surface', roomId: room.id, face: 'walls', wallFace: face.id })}
                      onMenu={event => onContextMenu({ kind: 'surface', roomId: room.id, face: 'walls', wallFace: face.id }, event.clientX, event.clientY)}
                      content={<><span className="tree-label">{wallName(room, { face: face.id }, project.rooms, project.northDeg)}</span>{role !== 'Unassigned' && <span className="tree-meta">{role}</span>}</>}
                    >
                      {shown.map(target => {
                        const interfaceRole = wallRoleLabel(project.interfaceWalls?.[target.key]?.constructionId);
                        const other = interfacePartyName(target.sides, room.id);
                        const side = target.sides.find(item => item.roomId === room.id && item.anchor === `f:${face.id}`);
                        const nested = side ? openings.filter(opening => openingInside(opening, side.startM, side.endM)) : [];
                        const interfaceKey = `interface:${target.key}`;
                        const interfaceClosed = closed(interfaceKey);
                        return (
                          <TreeNode
                            key={target.key}
                            active={selection.kind === 'interface' && selection.key === target.key}
                            collapsed={nested.length > 0 ? interfaceClosed : undefined}
                            toggleLabel={nested.length > 0 ? `${interfaceClosed ? 'Expand' : 'Collapse'} Interface · ${other}` : undefined}
                            onToggle={nested.length > 0 ? () => toggle(interfaceKey) : undefined}
                            onSelect={() => onSelect({ kind: 'interface', key: target.key })}
                            content={<><span className="tree-label">Interface · {other}</span><span className="tree-meta">{formatLength(target.lengthM, project.units, 2)}{interfaceRole !== 'Unassigned' ? ` · ${interfaceRole}` : ''}</span></>}
                          >
                            {nested.map(opening => (
                              <TreeNode
                                key={opening.id}
                                active={selection.kind === 'opening' && selection.id === opening.id}
                                onSelect={() => onSelect({ kind: 'opening', roomId: room.id, id: opening.id })}
                                onMenu={event => onContextMenu({ kind: 'opening', roomId: room.id, id: opening.id }, event.clientX, event.clientY)}
                                content={<><span className="tree-label">{opening.kind === 'door' ? 'Door' : opening.kind === 'window' ? 'Window' : 'Opening'}</span><span className="tree-meta">{formatLength(opening.widthM, project.units, 2)}</span></>}
                              />
                            ))}
                          </TreeNode>
                        );
                      })}
                      {openings.filter(opening => !shown.some(target => {
                        const side = target.sides.find(item => item.roomId === room.id && item.anchor === `f:${face.id}`);
                        return side ? openingInside(opening, side.startM, side.endM) : false;
                      })).map(opening => (
                        <TreeNode
                          key={opening.id}
                          active={selection.kind === 'opening' && selection.id === opening.id}
                          onSelect={() => onSelect({ kind: 'opening', roomId: room.id, id: opening.id })}
                          onMenu={event => onContextMenu({ kind: 'opening', roomId: room.id, id: opening.id }, event.clientX, event.clientY)}
                          content={<><span className="tree-label">{opening.kind === 'door' ? 'Door' : opening.kind === 'window' ? 'Window' : 'Opening'}</span><span className="tree-meta">{formatLength(opening.widthM, project.units, 2)}</span></>}
                        />
                      ))}
                    </TreeNode>
                  );
                })}
                {hosted.map(item => {
                  const product = getProduct(item.catalogId);
                  return (
                    <TreeNode
                      key={item.id}
                      active={selected('equipment', item.id)}
                      onSelect={() => onSelect({ kind: 'equipment', id: item.id })}
                      onMenu={event => onContextMenu({ kind: 'equipment', id: item.id }, event.clientX, event.clientY)}
                      content={
                        <>
                          {product ? <EquipmentIcon name={equipmentIconFor(product)} /> : null}
                          <span className="tree-label">{product ? product.model : item.catalogId}</span>
                          {item.quantity > 1 && <span className="tree-meta">× {item.quantity}</span>}
                        </>
                      }
                    />
                  );
                })}
          </TreeNode>
        );
      });
  const systemNodes = project.systems.map(system => {
        const systemKey = `system:${system.id}`;
        const systemClosed = closed(systemKey);
        const members = scope === 'ducts' ? [] : project.equipment.filter(item => item.systemId === system.id);
        const ducts = (project.ducts ?? []).filter(run => run.systemId === system.id);
        if (scope === 'ducts' && ducts.length === 0) return null;
        const childCount = members.length + ducts.length;
        return (
          <TreeNode
            key={system.id}
            active={selected('system', system.id)}
            collapsed={childCount > 0 ? systemClosed : undefined}
            toggleLabel={childCount > 0 ? `${systemClosed ? 'Expand' : 'Collapse'} ${system.name}` : undefined}
            onToggle={childCount > 0 ? () => toggle(systemKey) : undefined}
            onSelect={() => onSelect({ kind: 'system', id: system.id })}
            onMenu={event => onContextMenu({ kind: 'system', id: system.id }, event.clientX, event.clientY)}
            content={<><strong><span>{system.name}</span></strong>{childCount > 0 && <span className="tree-meta">{childCount}</span>}</>}
          >
            {members.map(item => {
              const product = getProduct(item.catalogId);
              return (
                <TreeNode key={item.id} active={selected('equipment', item.id)} onSelect={() => onSelect({ kind: 'equipment', id: item.id })} onMenu={event => onContextMenu({ kind: 'equipment', id: item.id }, event.clientX, event.clientY)} content={<>{product ? <EquipmentIcon name={equipmentIconFor(product)} /> : null}<span className="tree-label">{product ? product.model : item.catalogId}</span>{item.quantity > 1 && <span className="tree-meta">× {item.quantity}</span>}</>} />
              );
            })}
            {ducts.map(run => (
              <TreeNode
                key={run.id}
                active={selected('duct', run.id)}
                onSelect={() => onSelect({ kind: 'duct', id: run.id })}
                onMenu={event => onContextMenu({ kind: 'duct', id: run.id }, event.clientX, event.clientY)}
                content={<><span className="tree-label">{DUCT_SERVICES.find(item => item.id === run.service)?.label ?? 'Duct'}</span><span className="tree-meta">{ductSizeLabel(run, project.units)}</span></>}
              />
            ))}
          </TreeNode>
        );
      });
  if (scope === 'spaces') return <ul className="tn-tree">{roomNodes}</ul>;
  if (scope === 'ducts') return <ul className="tn-tree">{systemNodes}</ul>;
  return (
    <ul className="tn-tree">
      {systemNodes}
      {unassigned.length > 0 && (
        <TreeNode
          collapsed={closed('unassigned')}
          toggleLabel="No system"
          onToggle={() => toggle('unassigned')}
          onSelect={() => toggle('unassigned')}
          content={<><span className="tree-label">No system</span><span className="tree-meta">{unassigned.length}</span></>}
        >
          {unassigned.map(item => {
            const product = getProduct(item.catalogId);
            return (
              <TreeNode key={item.id} active={selected('equipment', item.id)} onSelect={() => onSelect({ kind: 'equipment', id: item.id })} onMenu={event => onContextMenu({ kind: 'equipment', id: item.id }, event.clientX, event.clientY)} content={<>{product ? <EquipmentIcon name={equipmentIconFor(product)} /> : null}<span className="tree-label">{product ? product.model : item.catalogId}</span>{item.quantity > 1 && <span className="tree-meta">× {item.quantity}</span>}</>} />
            );
          })}
        </TreeNode>
      )}
    </ul>
  );
}
function interfacePartyName(sides: { roomId: string; name: string }[], roomId: string): string {
  const other = sides.find(side => side.roomId !== roomId);
  if (!other) return 'Outside';
  return other.name || 'Space';
}

function openingInside(opening: { offsetM: number; widthM: number }, startM: number, endM: number): boolean {
  const mid = opening.offsetM + opening.widthM / 2;
  return mid >= startM - 0.02 && mid <= endM + 0.02;
}

function DimensionForm({
  units,
  onCreate,
}: {
  units: Project['units'];
  onCreate: (lengthM: number, widthM: number, heightM: number) => void;
}) {
  const lengthUnit = units === 'IP' ? 'ft' : 'm';
  const toM = (value: number) => (units === 'IP' ? value * 0.3048 : value);
  const [length, setLength] = useState(units === 'IP' ? '20' : '6');
  const [width, setWidth] = useState(units === 'IP' ? '15' : '4.5');
  const [height, setHeight] = useState(units === 'IP' ? '10' : '3.05');
  return (
    <form
      className="dim-form"
      onSubmit={event => {
        event.preventDefault();
        const values = [Number(length), Number(width), Number(height)];
        if (values.some(value => !Number.isFinite(value) || value <= 0)) return;
        onCreate(toM(values[0]), toM(values[1]), toM(values[2]));
      }}
    >
      <label>
        Length X
        <input value={length} onChange={event => setLength(event.target.value)} />
        <em>{lengthUnit}</em>
      </label>
      <label>
        Width Y
        <input value={width} onChange={event => setWidth(event.target.value)} />
        <em>{lengthUnit}</em>
      </label>
      <label>
        Height Z
        <input value={height} onChange={event => setHeight(event.target.value)} />
        <em>{lengthUnit}</em>
      </label>
      <button type="submit" className="btn primary">
        Add space
      </button>
    </form>
  );
}

function ContextMenu({
  x,
  y,
  title,
  items,
  onClose,
}: {
  x: number;
  y: number;
  title?: string;
  items: MenuEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = Math.min(0, window.innerWidth - 8 - rect.right);
    const dy = Math.min(0, window.innerHeight - 8 - rect.bottom);
    if (dx || dy) setShift({ x: dx, y: dy });
  }, [x, y, items]);
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="context-menu" style={{ left: x + shift.x, top: y + shift.y }} role="menu" aria-label={title} onContextMenu={event => event.preventDefault()}>
      {title && <p className="context-menu-title">{title}</p>}
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={item.danger ? 'danger' : undefined}
          onClick={() => {
            item.run();
            onClose();
          }}
        >
          <span>{item.label}</span>
          {item.detail && <span className="context-menu-detail">{item.detail}</span>}
        </button>
      ))}
    </div>
  );
}

function loopSwatch(loop: { fluid: string; supplyC: number | null }): string {
  if (loop.fluid === 'co2' || loop.fluid === 'refrigerant') return '#7b4f9e';
  if (loop.fluid === 'steam' || (loop.supplyC != null && loop.supplyC >= 30)) return '#c0492f';
  return '#2f6fb0';
}

function pointPlace(project: Project, point: NonNullable<Project['controlPoints']>[number]): string {
  const location = point.location;
  if (location.kind === 'room') return project.rooms.find(room => room.id === location.roomId)?.name ?? 'Space';
  const item = project.equipment.find(entry => entry.id === location.equipmentId);
  const section = item ? unitSections(item).find(entry => entry.id === location.sectionId) : undefined;
  return `${item ? getProduct(item.catalogId)?.model ?? 'Unit' : 'Unit'}${section ? ` · ${SECTION_LABEL[section.kind]}` : ''}`;
}

const LOCK_KEY = 'hvac-plan-positions-locked';

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="10" width="12" height="8.5" rx="1.5" />
      <path d={locked ? 'M7.8 10V7.5a3.2 3.2 0 0 1 6.4 0V10' : 'M7.8 10V7.5a3.2 3.2 0 0 1 6.2-1.1'} />
    </svg>
  );
}

function DrawIcon({ kind }: { kind: ToolKind }) {
  const props = { width: 22, height: 22, viewBox: '0 0 22 22', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'select') return <svg {...props}><path d="M6 3.5 10.2 17.5 12.3 12.3 17.5 10.2Z" /></svg>;
  if (kind === 'wall') return <svg {...props}><path d="M3.5 8h15M3.5 14h15" /></svg>;
  if (kind === 'draw') return <svg {...props}><rect x="4" y="5" width="14" height="12" rx="1" /></svg>;
  if (kind === 'door') return <svg {...props}><path d="M7 18V5h8v13" /><path d="M7 18a8 8 0 0 0 8-8" /></svg>;
  if (kind === 'duct') return <svg {...props}><path d="M4 15h6l3-8h5" /><circle cx="4" cy="15" r="1.2" /><circle cx="18" cy="7" r="1.2" /></svg>;
  if (kind === 'load') return <svg {...props}><circle cx="11" cy="11" r="6.5" /><path d="M11 7.5v7M7.5 11h7" /></svg>;
  if (kind === 'place') return <svg {...props}><rect x="4.5" y="7" width="13" height="9" rx="1" /><path d="M8 7V5h6v2" /></svg>;
  return <svg {...props}><rect x="5" y="4" width="12" height="14" /><path d="M5 11h12M11 4v14" /></svg>;
}

function DuctLegend({ currentId }: { currentId?: string }) {
  return (
    <div className="duct-legend" aria-label="Duct colors">
      {DUCT_STREAMS.map(item => (
        <span key={item.id} className={currentId === item.id ? 'is-current' : ''}>
          <i style={{ background: ink(item.color) }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function LayersMenu({
  layers,
  scene,
  hideRoof,
  onChange,
  onHideRoof,
  onClose,
}: {
  layers: PlanLayers;
  scene: 'plan' | '3d';
  hideRoof: boolean;
  onChange: (layers: PlanLayers) => void;
  onHideRoof: (hide: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (ref.current?.contains(target) || target?.closest('[data-layers-toggle]')) return;
      close.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const row = (key: keyof PlanLayers, label: string) => (
    <label key={key}>
      <input type="checkbox" checked={layers[key]} onChange={event => onChange({ ...layers, [key]: event.target.checked })} />
      {label}
    </label>
  );
  return (
    <div ref={ref} className="layers-menu" role="dialog" aria-label="Layers">
      <p className="layers-title">Show on plan</p>
      {row('spaces', 'Spaces and walls')}
      {row('loads', 'Loads')}
      {row('equipment', 'Equipment')}
      {row('ducts', 'Ducts')}
      {row('piping', 'Piping')}
      {row('controls', 'Room sensors')}
      {row('internals', 'Unit internals')}
      <p className="layers-title">Detail</p>
      {row('ductWidth', 'Duct widths')}
      {row('clearances', 'Clearances')}
      {row('labels', 'Details on all items')}
      {scene === '3d' && (
        <>
          <p className="layers-title">3D</p>
          <label>
            <input type="checkbox" checked={hideRoof} onChange={event => onHideRoof(event.target.checked)} />
            Hide roof
          </label>
        </>
      )}
    </div>
  );
}

function CatalogDragRow({ token, title, children }: { token: string; title?: string; children: ReactNode }) {
  const dragged = useRef(false);
  return (
    <button
      type="button"
      draggable
      title={title ?? 'Drag onto the plan'}
      onDragStart={event => {
        dragged.current = true;
        event.dataTransfer.setData(CATALOG_MIME, token);
        event.dataTransfer.effectAllowed = 'copy';
        setActiveCatalogDrag(token);
      }}
      onDragEnd={() => {
        setActiveCatalogDrag(null);
        window.setTimeout(() => {
          dragged.current = false;
        }, 50);
      }}
      onClick={event => {
        if (dragged.current) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

function LoadCatalogList({
  query,
  category,
  units,
}: {
  query: string;
  category: LoadCategory | 'all';
  units: Project['units'];
}) {
  const needle = query.trim().toLowerCase();
  const categories = category === 'all' ? LOAD_CATEGORY_ORDER : [category];
  const sections = categories
    .map(id => ({
      id,
      groups: loadGroups(id)
        .map(group => ({ ...group, items: group.items.filter(item => !needle || `${item.name} ${item.group}`.toLowerCase().includes(needle)) }))
        .filter(group => group.items.length > 0),
    }))
    .filter(section => section.groups.length > 0);
  if (sections.length === 0) return <p className="panel-empty">No loads match.</p>;
  return (
    <div className="load-catalog">
      {sections.map(section => (
        <section key={section.id}>
          {category === 'all' && (
            <h4 className="load-cat">
              <LoadIcon category={section.id} />
              {LOAD_CATEGORY_LABEL[section.id]}
            </h4>
          )}
          {section.groups.map(group => (
            <div key={group.group} className="load-group">
              <p className="load-group-title">{group.group}</p>
              <ul className="pick-list">
                {group.items.map(item => (
                  <li key={item.id}>
                    <CatalogDragRow token={catalogToken({ kind: 'load', id: item.id })} title={`${item.name}. ${loadSpec(item, units)}. ${item.source}`}>
                      <LoadIcon category={item.category} />
                      <span>{item.name}</span>
                      <span className="pick-meta">{loadSpec(item, units)}</span>
                    </CatalogDragRow>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function DuctBar({
  project,
  tool,
  showSize,
  onShowSize,
  onChange,
}: {
  project: Project;
  tool: Extract<EditorTool, { kind: 'duct' }>;
  showSize: boolean;
  onShowSize: (show: boolean) => void;
  onChange: (tool: EditorTool) => void;
}) {
  const product = getDuctProduct(tool.catalogId) ?? DUCT_CATALOG[0];
  const systems = systemsForProduct(product, project.systems);
  const system = systems.find(item => item.id === tool.systemId);
  const services = system ? servicesFor(product, system.kind) : [];
  const stream = system ? DUCT_STREAMS.find(item => item.kind === system.kind && item.service === tool.service) : undefined;
  const unit = lengthUnit(project.units);
  const pickProduct = (catalogId: string) => {
    const next = getDuctProduct(catalogId);
    if (!next) return;
    const nextSystems = systemsForProduct(next, project.systems);
    const nextSystem = nextSystems.find(item => item.id === tool.systemId) ?? nextSystems[0];
    const nextServices = nextSystem ? servicesFor(next, nextSystem.kind) : [];
    const size = next.sizes?.[0];
    onChange({
      kind: 'duct',
      catalogId: next.id,
      systemId: nextSystem?.id ?? '',
      service: nextServices[0] ?? 'supply',
      shape: next.shape,
      widthM: size?.widthM ?? next.defaultWidthIn * 0.0254,
      heightM: next.shape === 'rect' ? (next.defaultHeightIn ?? 12) * 0.0254 : null,
    });
  };
  return (
    <div className="duct-toolbar">
      <div className="duct-toolbar-row">
        <label>
          Duct
          <select aria-label="Duct product" value={product.id} onChange={event => pickProduct(event.target.value)}>
            {DUCT_CATALOG.map(item => (
              <option key={item.id} value={item.id}>
                {item.manufacturer} {item.model}
              </option>
            ))}
          </select>
        </label>
        <label>
          System
          <select
            aria-label="Duct system"
            value={system?.id ?? ''}
            onChange={event => {
              const nextSystem = systems.find(item => item.id === event.target.value);
              const nextServices = nextSystem ? servicesFor(product, nextSystem.kind) : [];
              onChange({ ...tool, systemId: nextSystem?.id ?? '', service: nextServices[0] ?? tool.service });
            }}
          >
            {systems.length === 0 && <option value="">No matching system</option>}
            {systems.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stream
          <select
            aria-label="Duct stream"
            value={services.includes(tool.service) ? tool.service : services[0] ?? ''}
            onChange={event => onChange({ ...tool, service: event.target.value as DuctService })}
          >
            {services.map(service => {
              const item = system ? DUCT_STREAMS.find(entry => entry.kind === system.kind && entry.service === service) : undefined;
              return (
                <option key={service} value={service}>
                  {item?.label ?? DUCT_SERVICES.find(entry => entry.id === service)?.label ?? service}
                </option>
              );
            })}
          </select>
        </label>
        {product.sizes ? (
          <label>
            Diameter
            <select
              aria-label="Duct diameter"
              value={product.sizes.find(size => Math.abs(size.widthM - tool.widthM) < 0.002)?.id ?? product.sizes[0]?.id}
              onChange={event => {
                const size = product.sizes?.find(item => item.id === event.target.value);
                if (size) onChange({ ...tool, shape: 'round', widthM: size.widthM, heightM: null });
              }}
            >
              {product.sizes.map(size => (
                <option key={size.id} value={size.id}>
                  {size.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Width ({unit})
              <input
                key={`duct-w-${tool.widthM}`}
                aria-label="Duct width"
                defaultValue={formatNumber(mToLength(tool.widthM, project.units), 2)}
                inputMode="decimal"
                onBlur={event => {
                  const meters = lengthToM(Number(event.target.value), project.units);
                  if (meters > 0.05) onChange({ ...tool, widthM: meters });
                }}
              />
            </label>
            <label>
              Height ({unit})
              <input
                key={`duct-h-${tool.heightM}`}
                aria-label="Duct height"
                defaultValue={formatNumber(mToLength(tool.heightM ?? tool.widthM, project.units), 2)}
                inputMode="decimal"
                onBlur={event => {
                  const meters = lengthToM(Number(event.target.value), project.units);
                  if (meters > 0.05) onChange({ ...tool, heightM: meters });
                }}
              />
            </label>
          </>
        )}
        <label className="duct-check">
          <input type="checkbox" checked={showSize} onChange={event => onShowSize(event.target.checked)} />
          Show duct width
        </label>
        {stream && <span className="duct-swatch" style={{ background: ink(stream.color) }} title={stream.label} />}
      </div>
      <DuctLegend currentId={stream?.id} />
      {systems.length === 0 && <p className="muted">Add a {product.systemKinds.join(', ')} system before drawing this duct.</p>}
    </div>
  );
}
