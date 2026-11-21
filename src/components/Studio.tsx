'use client';

import dynamic from 'next/dynamic';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { planningIssues } from '@/domain/issues';
import {
  CATALOG_MIME,
  CATEGORY_LABEL,
  CATALOG,
  FAMILY_CATEGORIES,
  FAMILY_LABEL,
  FAMILY_ORDER,
  getProduct,
  type EquipmentCategory,
  type EquipmentFamily,
} from '@/domain/catalog';
import { downloadText, fileSlug } from '@/domain/download';
import {
  addOpening,
  addSystem,
  addWallRun,
  addWallRunOpening,
  buildDimensionedRoom,
  buildDrawnRoom,
  buildOutlineRoom,
  buildPlacement,
  placeOpeningOnRoom,
  removeEquipment,
  removeRoom,
  removeSystem,
  removeWallRun,
  removeWallRunOpening,
  constrainEquipmentPosition,
  setEdgeAssembly,
  setInterfaceAssembly,
  setWallAssembly,
  translateRoom,
  updateEquipment,
  updateRoom,
  updateSystem,
  placementZ,
} from '@/domain/projectOps';
import { buildBom, buildConstructionBom, buildConstructionSchedule, buildSchedule, projectSummary, scheduleCsv } from '@/domain/schedule';
import { SURFACE_FACES, SYSTEM_KINDS, WALL_FACES, type EditorTool, type Project, type Selection, type StoredTemplate, type WallFace } from '@/domain/types';
import { NO_WALL_RUNS, polygonArea } from '@/domain/wallDraw';
import { PLAN_SIDES, WALL_TYPES, edgePortions, findInterface, interfaceForOpening, interfaceTargets, portionSummary, roomFill, wallPlaceLabel, wallRoleLabel } from '@/domain/walls';
import { PlanView } from './PlanView';
import { formatArea, formatLength, formatNumber, lengthUnit, mToLength } from '@/domain/units';
import { projectToBuildingModel, validateModel } from '@/thermonode/localAdapter';
import { mergeAssemblies, mergeLibrary, type ConstructionAssembly, type ConstructionMaterial } from '@/domain/constructionLibrary';
import { BoundaryPanel } from './BoundaryPanel';
import { EquipmentIcon, categoryIcon, equipmentIconFor } from './EquipmentIcon';
import { Inspector } from './Inspector';
import { LibraryPanel } from './LibraryPanel';
import { SchedulePanel } from './SchedulePanel';

const Viewport = dynamic(() => import('./Viewport'), {
  ssr: false,
  loading: () => <div className="viewport-loading">Loading 3D workspace…</div>,
});

type CenterView = 'model' | 'schedule' | 'library' | 'boundary';

const CENTER_VIEWS: { id: CenterView; label: string }[] = [
  { id: 'model', label: 'Model' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'library', label: 'Library' },
  { id: 'boundary', label: 'Thermonode' },
];
type SideTab = 'project' | 'catalog';
type MenuEntry = { id: string; label: string; danger?: boolean; run: () => void };

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
  const [side, setSide] = useState<SideTab>('project');
  const [fitToken, setFitToken] = useState(0);
  const [query, setQuery] = useState('');
  const [catalogFamily, setCatalogFamily] = useState<EquipmentFamily | 'all'>('all');
  const [category, setCategory] = useState<EquipmentCategory | 'all'>('all');
  const [showDimensions, setShowDimensions] = useState(false);
  const [hideRoof, setHideRoof] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState(`${project.name} template`);
  const [wallTypeId, setWallTypeId] = useState<string | null>(null);
  const [scene, setScene] = useState<'plan' | '3d'>('plan');
  const [sheet, setSheet] = useState<'all' | 'spaces' | 'systems'>('spaces');
  const [cameraPose, setCameraPose] = useState<'orbit' | 'top'>('top');
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
  const [nameFocus, setNameFocus] = useState(0);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const [historyTick, setHistoryTick] = useState({ undo: false, redo: false });
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsFilter, setDiagnosticsFilter] = useState<'all' | 'errors' | 'warnings' | 'planning'>('all');
  const [diagnosticsHeight, setDiagnosticsHeight] = useState(220);
  const edit = (next: Project) => {
    past.current = [...past.current, project].slice(-40);
    future.current = [];
    setHistoryTick({ undo: true, redo: false });
    onChange(next);
  };
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
  const soleInterface = (roomId: string, anchor: string) => {
    const matches = interfaceTargets(project.rooms).filter(target => target.sides.some(side => side.roomId === roomId && side.anchor === anchor));
    return matches.length === 1 ? matches[0] : null;
  };
  const chooseView = (next: Selection) => {
    const type = wallTypeId ? WALL_TYPES.find(item => item.id === wallTypeId) : undefined;
    if (type && next.kind === 'surface' && next.face === 'walls') {
      if (next.wallFace) {
        const sole = soleInterface(next.roomId, `f:${next.wallFace}`);
        edit(sole ? setInterfaceAssembly(project, sole.key, type.assemblyId, assemblies) : setWallAssembly(project, next.roomId, next.wallFace, type.assemblyId, assemblies));
      }
      if (next.edge != null) {
        const sole = soleInterface(next.roomId, `e:${next.edge}`);
        edit(sole ? setInterfaceAssembly(project, sole.key, type.assemblyId, assemblies) : setEdgeAssembly(project, next.roomId, next.edge, type.assemblyId, assemblies));
      }
      setSelection(next);
      return;
    }
    if (type && next.kind === 'interface') {
      const hit = findInterface(project.rooms, next.key);
      const side = hit && hit.sides.length === 1 ? hit.sides[0] : undefined;
      edit(setInterfaceAssembly(project, next.key, type.assemblyId, assemblies));
      if (side?.anchor.startsWith('f:')) {
        const face = side.anchor.slice(2);
        if (face === 'px' || face === 'nx' || face === 'py' || face === 'ny') {
          setSelection({ kind: 'surface', roomId: side.roomId, face: 'walls', wallFace: face });
          return;
        }
      }
      if (side?.anchor.startsWith('e:')) {
        const edge = Number(side.anchor.slice(2));
        if (Number.isInteger(edge) && edge >= 0) {
          setSelection({ kind: 'surface', roomId: side.roomId, face: 'walls', edge });
          return;
        }
      }
      setSelection(next);
      return;
    }
    setSelection(next);
  };
  const planning = useMemo(() => planningIssues(project), [project]);
  const validation = useMemo(() => validateModel(projectToBuildingModel(project)), [project]);
  const errors = validation.issues.filter(issue => issue.severity === 'error').length;
  const warnings = validation.issues.filter(issue => issue.severity === 'warning').length;
  const issueCount = planning.length + errors + warnings;
  const diagnosticRows = useMemo(() => {
    const planningRows = planning.map(issue => ({ id: issue.id, severity: 'planning' as const, message: issue.message, selection: issue.selection }));
    const geometryRows = validation.issues
      .filter(issue => issue.severity === 'error' || issue.severity === 'warning')
      .map(issue => ({
        id: `${issue.code}-${issue.subjectId ?? ''}-${issue.message}`,
        severity: issue.severity,
        message: issue.message,
        selection: selectionForSubject(project, issue.subjectId),
      }));
    return [...planningRows, ...geometryRows];
  }, [planning, project, validation]);
  const visibleDiagnostics = diagnosticRows.filter(row => {
    if (diagnosticsFilter === 'errors') return row.severity === 'error';
    if (diagnosticsFilter === 'warnings') return row.severity === 'warning';
    if (diagnosticsFilter === 'planning') return row.severity === 'planning';
    return true;
  });
  useEffect(() => {
    const saved = Number(window.localStorage.getItem('hvac-diagnostics-height'));
    if (saved >= 120 && saved <= 600) setDiagnosticsHeight(saved);
  }, []);

  useEffect(() => {
    setSelection({ kind: 'project' });
    setTool({ kind: 'select' });
    setView('model');
    setFitToken(token => token + 1);
    setTemplateName(`${project.name} template`);
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
    setSelection(selection);
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

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <button type="button" className="btn" onClick={onBack}>
            Projects
          </button>
          <span className="mark">HP</span>
          <input
            className="name-input"
            aria-label="Project name"
            value={project.name}
            onChange={event => edit({ ...project, name: event.target.value })}
          />
        </div>
        <div className="view-tabs" role="tablist">
          {CENTER_VIEWS.map(item => (
            <button key={item.id} type="button" role="tab" aria-selected={view === item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="top-actions">
          <div className="menu">
            <button type="button" className="btn" onClick={() => setExportOpen(open => !open)}>
              Export
            </button>
            {exportOpen && (
              <div className="menu-panel">
                <button type="button" onClick={exportSchedule}>
                  Schedule CSV
                </button>
                <button type="button" onClick={exportSummary}>
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
          <button type="button" className="btn" onClick={undo} disabled={!historyTick.undo}>
            Undo
          </button>
          <button type="button" className="btn" onClick={redo} disabled={!historyTick.redo}>
            Redo
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setTemplateName(`${project.name} template`);
              setTemplateOpen(true);
            }}
          >
            Save as template
          </button>
          {customTemplate && (
            <button type="button" className="btn" onClick={onUpdateTemplate}>
              Update template
            </button>
          )}
        </div>
      </header>
      <div className="studio-body">
        <aside className="side">
          <div className="side-tabs">
            <button type="button" className={side === 'project' ? 'active' : ''} onClick={() => setSide('project')}>
              Project
            </button>
            <button type="button" className={side === 'catalog' ? 'active' : ''} onClick={() => setSide('catalog')}>
              Catalog
            </button>
          </div>
          <div className="side-scroll">
          {side === 'project' ? (
            <ProjectTree project={project} selection={selection} onSelect={setSelection} onContextMenu={openMenu} onAddSystem={openSystemMenu} />
          ) : (
            <div className="catalog">
              <div className="catalog-tools catalog-tools-stack">
                <input placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search catalog" />
                <div className="catalog-filters">
                  <select
                    aria-label="Catalog family"
                    value={catalogFamily}
                    onChange={event => {
                      const next = event.target.value as EquipmentFamily | 'all';
                      setCatalogFamily(next);
                      setCategory('all');
                    }}
                  >
                    <option value="all">All families</option>
                    {FAMILY_ORDER.map(item => (
                      <option key={item} value={item}>
                        {FAMILY_LABEL[item]}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Catalog category" value={category} onChange={event => setCategory(event.target.value as EquipmentCategory | 'all')}>
                    <option value="all">All types</option>
                    {(catalogFamily === 'all' ? FAMILY_ORDER.flatMap(item => FAMILY_CATEGORIES[item]) : FAMILY_CATEGORIES[catalogFamily]).map(item => (
                      <option key={item} value={item}>
                        {CATEGORY_LABEL[item]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <CatalogTree
                query={query}
                family={catalogFamily}
                category={category}
                armedId={tool.kind === 'place' ? tool.catalogId : null}
                onArm={catalogId => {
                  setTool({ kind: 'place', catalogId });
                  setView('model');
                }}
              />
            </div>
          )}
          </div>
        </aside>
        <section className="stage">
          {view === 'model' && (
            <>
              <div className="stage-bar">
                <button
                  type="button"
                  className={scene === 'plan' ? 'active' : ''}
                  onClick={() => {
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
                <div className="sheet-switch" role="group" aria-label="What the plan shows">
                  {(['all', 'spaces', 'systems'] as const).map(id => (
                    <button
                      key={id}
                      type="button"
                      className={sheet === id ? 'active' : ''}
                      onClick={() => {
                        setSheet(id);
                        if (scene === '3d') setCameraPose('top');
                      }}
                    >
                      {id === 'all' ? 'All' : id === 'spaces' ? 'Spaces' : 'Systems'}
                    </button>
                  ))}
                </div>
                <button type="button" className={showDimensions ? 'active' : ''} onClick={() => setShowDimensions(value => !value)}>
                  Enter dimensions
                </button>
                {scene === '3d' && (
                  <button type="button" className={hideRoof ? 'active' : ''} aria-pressed={hideRoof} onClick={() => setHideRoof(value => !value)}>
                    Hide roof
                  </button>
                )}
                <button type="button" onClick={() => setFitToken(token => token + 1)}>
                  Fit
                </button>
                <label className="paint-wall">
                  <span>Paint wall</span>
                  <select
                    aria-label="Paint wall"
                    value={wallTypeId ?? ''}
                    onChange={event => {
                      setTool({ kind: 'select' });
                      setWallTypeId(event.target.value || null);
                    }}
                  >
                    <option value="">Off</option>
                    {WALL_TYPES.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={`diag-toggle${diagnosticsOpen ? ' active' : ''}`}
                  aria-expanded={diagnosticsOpen}
                  aria-label="Diagnostics"
                  title="Diagnostics"
                  onClick={() => setDiagnosticsOpen(open => !open)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 4.5 V9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="11.25" r="0.8" fill="currentColor" />
                  </svg>
                  {issueCount > 0 && <span className="diag-badge">{issueCount > 99 ? '99+' : issueCount}</span>}
                </button>
              </div>
              <div className="draw-bar" role="toolbar" aria-label="Drawing tools">
                {DRAW_TOOLS.map(item => (
                  <button
                    key={item.kind}
                    type="button"
                    className={tool.kind === item.kind ? 'active' : ''}
                    aria-pressed={tool.kind === item.kind}
                    title={item.label}
                    onClick={() => setTool({ kind: item.kind })}
                  >
                    <DrawIcon kind={item.kind} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              {showDimensions && (
                <DimensionForm
                  units={project.units}
                  onCreate={(lengthM, widthM, heightM) => {
                    const originX = project.rooms.reduce((max, room) => Math.max(max, room.xM + room.lengthM), 0);
                    const room = buildDimensionedRoom(project.rooms.length);
                    edit({
                      ...project,
                      rooms: [...project.rooms, { ...room, xM: project.rooms.length ? originX + 0.3 : 0, lengthM, widthM, heightM }],
                    });
                    setSelection({ kind: 'room', id: room.id });
                    setShowDimensions(false);
                    setFitToken(token => token + 1);
                  }}
                />
              )}
              <div className="stage-canvas">
              {scene === 'plan' ? (
                <PlanView
                  project={project}
                  selection={selection}
                  tool={tool}
                  fitToken={fitToken}
                  onSelect={chooseView}
                  onDrawRoom={rect => {
                    const room = buildDrawnRoom(rect, project.rooms.length);
                    edit({ ...project, rooms: [...project.rooms, room] });
                    setSelection({ kind: 'room', id: room.id });
                  }}
                  onDrawWalls={lines => {
                    let next = project;
                    for (const line of lines) next = addWallRun(next, line);
                    if (next === project) return;
                    const created = (next.wallRuns ?? [])[(next.wallRuns ?? []).length - 1];
                    edit(next);
                    if (created) setSelection({ kind: 'wallRun', id: created.id });
                  }}
                  onCloseSpace={points => {
                    const room = buildOutlineRoom(points, project.rooms.length);
                    if (!room) return;
                    edit({ ...project, rooms: [...project.rooms, room] });
                    setSelection({ kind: 'room', id: room.id });
                    setTool({ kind: 'select' });
                  }}
                  onPlaceOpening={(spot, kind) => {
                    if (spot.roomId && spot.face) {
                      const next = placeOpeningOnRoom(project, spot.roomId, kind, spot.face, spot.offsetM);
                      if (next === project) return;
                      const room = next.rooms.find(item => item.id === spot.roomId);
                      const created = room?.openings[room.openings.length - 1];
                      edit(next);
                      if (created) setSelection({ kind: 'opening', roomId: spot.roomId, id: created.id });
                      return;
                    }
                    if (!spot.wallId) return;
                    const next = addWallRunOpening(project, spot.wallId, kind, spot.offsetM);
                    if (next === project) return;
                    const run = (next.wallRuns ?? []).find(item => item.id === spot.wallId);
                    const created = run?.openings[run.openings.length - 1];
                    edit(next);
                    if (created) setSelection({ kind: 'wallOpening', wallId: spot.wallId, id: created.id });
                  }}
                  onPlace={(point, catalogId) => {
                    const product = getProduct(catalogId);
                    if (!product) return;
                    const placed = constrainEquipmentPosition(
                      project.rooms,
                      { catalogId: product.id, yawDeg: 0, roomId: null },
                      point.xM,
                      point.yM
                    );
                    const item = buildPlacement(product, placed.room, { xM: placed.xM, yM: placed.yM });
                    edit({ ...project, equipment: [...project.equipment, item] });
                    setSelection({ kind: 'equipment', id: item.id });
                    setTool({ kind: 'select' });
                  }}
                  sheet={sheet}
                  onContextMenu={openMenu}
                  onRoomsChange={rooms => edit({ ...project, rooms })}
                  onNorthChange={deg => edit({ ...project, northDeg: deg === 0 ? undefined : deg })}
                  onMoveSpace={(roomId, dx, dy) => {
                    edit({
                      ...project,
                      rooms: project.rooms.map(room => (room.id === roomId ? translateRoom(room, dx, dy) : room)),
                      equipment: project.equipment.map(item => (item.roomId === roomId ? { ...item, xM: Number((item.xM + dx).toFixed(3)), yM: Number((item.yM + dy).toFixed(3)) } : item)),
                    });
                  }}
                  onMoveEquipment={(id, xM, yM) => {
                    const item = project.equipment.find(entry => entry.id === id);
                    const product = item ? getProduct(item.catalogId) : undefined;
                    if (!item || !product) return;
                    const placed = constrainEquipmentPosition(project.rooms, item, xM, yM);
                    if (Math.abs(placed.xM - item.xM) < 1e-6 && Math.abs(placed.yM - item.yM) < 1e-6 && (placed.room?.id ?? null) === item.roomId) return;
                    edit(updateEquipment(project, id, { xM: placed.xM, yM: placed.yM, roomId: placed.room?.id ?? null, zM: placementZ(placed.room, product) }));
                    setSelection({ kind: 'equipment', id });
                  }}
                  onRotateEquipment={(id, yawDeg) => {
                    const item = project.equipment.find(entry => entry.id === id);
                    const product = item ? getProduct(item.catalogId) : undefined;
                    if (!item || !product) return;
                    const placed = constrainEquipmentPosition(project.rooms, { ...item, yawDeg }, item.xM, item.yM);
                    edit(
                      updateEquipment(project, id, {
                        yawDeg,
                        xM: placed.xM,
                        yM: placed.yM,
                        roomId: placed.room?.id ?? null,
                        zM: placementZ(placed.room, product),
                      })
                    );
                    setSelection({ kind: 'equipment', id });
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
                      setSelection({ kind: 'room', id: room.id });
                    }}
                    onPlace={(point, catalogId) => {
                      const product = getProduct(catalogId);
                      if (!product) return;
                      const placed = constrainEquipmentPosition(
                        project.rooms,
                        { catalogId: product.id, yawDeg: 0, roomId: null },
                        point.xM,
                        point.yM
                      );
                      const item = buildPlacement(product, placed.room, { xM: placed.xM, yM: placed.yM });
                      edit({ ...project, equipment: [...project.equipment, item] });
                      setSelection({ kind: 'equipment', id: item.id });
                      setTool({ kind: 'select' });
                    }}
                  onContextMenu={openMenu}
                />
                </div>
              )}
              {diagnosticsOpen && (
                <section className="diagnostics" style={{ height: diagnosticsHeight }} aria-label="Diagnostics">
                  <div
                    className="diagnostics-resize"
                    onMouseDown={event => {
                      event.preventDefault();
                      const startY = event.clientY;
                      const startHeight = diagnosticsHeight;
                      let height = startHeight;
                      const onMove = (ev: MouseEvent) => {
                        height = Math.max(120, Math.min(600, startHeight + (startY - ev.clientY)));
                        setDiagnosticsHeight(height);
                      };
                      const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                        window.localStorage.setItem('hvac-diagnostics-height', String(height));
                      };
                      document.addEventListener('mousemove', onMove);
                      document.addEventListener('mouseup', onUp);
                      document.body.style.cursor = 'ns-resize';
                      document.body.style.userSelect = 'none';
                    }}
                  />
                  <header className="diagnostics-head">
                    <strong>Diagnostics</strong>
                    {issueCount > 0 && <span className="diag-count">{issueCount}</span>}
                    <div className="diagnostics-filters">
                      {([
                        ['all', 'All', issueCount],
                        ['errors', 'Errors', errors],
                        ['warnings', 'Warnings', warnings],
                        ['planning', 'Planning', planning.length],
                      ] as const).map(([id, label, count]) => (
                        <button key={id} type="button" className={diagnosticsFilter === id ? 'active' : ''} onClick={() => setDiagnosticsFilter(id)}>
                          {label} {count}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="diagnostics-close" aria-label="Close diagnostics" onClick={() => setDiagnosticsOpen(false)}>
                      ×
                    </button>
                  </header>
                  <div className="diagnostics-list">
                    {visibleDiagnostics.length === 0 ? (
                      <p className="muted">No issues found</p>
                    ) : (
                      visibleDiagnostics.map(row => (
                        <button
                          key={row.id}
                          type="button"
                          className={`diagnostics-row ${row.severity}`}
                          disabled={!row.selection}
                          onClick={() => row.selection && setSelection(row.selection)}
                        >
                          <span>{row.message}</span>
                          <span className="diagnostics-source">{row.severity === 'planning' ? 'Planning' : 'Geometry'}</span>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              )}
              </div>
            </>
          )}
          {view === 'schedule' && <SchedulePanel project={project} assemblies={assemblies} materials={materials} />}
          {view === 'library' && (
            <LibraryPanel
              added={addedMaterials}
              onChange={onLibraryChange}
              addedAssemblies={addedAssemblies}
              onAssembliesChange={onAssembliesChange}
            />
          )}
          {view === 'boundary' && <BoundaryPanel project={project} />}
        </section>
        <Inspector
          project={project}
          selection={selection}
          materials={materials}
          assemblies={assemblies}
          onChange={edit}
          onSelect={setSelection}
          onDeleteProject={onDeleteProject}
          nameFocus={nameFocus}
        />
      </div>
      <footer className="statusbar">
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
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
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
          }}
          onDragEnd={() => {
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
  onArm,
}: {
  query: string;
  family: EquipmentFamily | 'all';
  category: EquipmentCategory | 'all';
  armedId: string | null;
  onArm: (catalogId: string) => void;
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
  const families = FAMILY_ORDER.filter(item => family === 'all' || item === family);
  return (
    <ul className="tn-tree">
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
                      dragId={product.id}
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
  onAddSystem,
}: {
  project: Project;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
  onAddSystem: (x: number, y: number) => void;
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
      if (selection.kind === 'equipment') {
        const item = project.equipment.find(entry => entry.id === selection.id);
        if (item?.systemId) {
          open('systems');
          open(`system:${item.systemId}`);
        } else if (item?.roomId) {
          open('spaces');
          open(`room:${item.roomId}`);
        } else {
          open('unassigned');
        }
      }
      if (!changed) return current;
      writeExpanded(storageKey, next);
      return next;
    });
  }, [selection, project.rooms, project.equipment, storageKey]);
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
  const unassigned = project.equipment.filter(item => !item.systemId && !item.roomId);
  return (
    <ul className="tn-tree">
      <TreeNode
        active={selected('project')}
        collapsed={closed('project')}
        toggleLabel={project.name || 'Project'}
        onToggle={() => toggle('project')}
        onSelect={() => onSelect({ kind: 'project' })}
        onMenu={event => onContextMenu({ kind: 'project' }, event.clientX, event.clientY)}
        content={<><strong>{project.name || 'Untitled project'}</strong>{project.location ? <span className="tree-meta">{project.location}</span> : null}</>}
      >
      <TreeNode
        collapsed={closed('spaces')}
        toggleLabel="Spaces"
        onToggle={() => toggle('spaces')}
        onSelect={() => toggle('spaces')}
        content={<><span className="tree-label">Spaces</span><span className="tree-meta">{project.rooms.length}</span></>}
      >
      {project.rooms.map(room => {
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
                  <i className="room-dot" style={{ background: roomFill(room.use) }} />
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
                      toggleLabel={shown.length > 0 ? `${wallClosed ? 'Expand' : 'Collapse'} Wall ${index + 1}` : undefined}
                      onToggle={shown.length > 0 ? () => toggle(wallKey) : undefined}
                      onSelect={() => onSelect({ kind: 'surface', roomId: room.id, face: 'walls', edge: index })}
                      content={<><span className="tree-label">Wall {index + 1}</span><span className="tree-meta">{formatLength(length, project.units, 2)}</span></>}
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
                      title={`${wallPlaceLabel(room, face.id, project.rooms)} · ${role}`}
                      collapsed={children > 0 ? wallClosed : undefined}
                      toggleLabel={children > 0 ? `${wallClosed ? 'Expand' : 'Collapse'} ${face.label}` : undefined}
                      onToggle={children > 0 ? () => toggle(wallKey) : undefined}
                      onSelect={() => onSelect({ kind: 'surface', roomId: room.id, face: 'walls', wallFace: face.id })}
                      onMenu={event => onContextMenu({ kind: 'surface', roomId: room.id, face: 'walls', wallFace: face.id }, event.clientX, event.clientY)}
                      content={<><span className="tree-label">{PLAN_SIDES[face.id].title} wall</span>{role !== 'Unassigned' && <span className="tree-meta">{role}</span>}</>}
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
      })}
      </TreeNode>
      <TreeNode
        collapsed={closed('systems')}
        toggleLabel="Systems"
        onToggle={() => toggle('systems')}
        onSelect={() => toggle('systems')}
        onMenu={event => onAddSystem(event.clientX, event.clientY)}
        content={<><span className="tree-label">Systems</span><span className="tree-meta">{project.systems.length}</span></>}
      >
      {project.systems.map(system => {
        const systemKey = `system:${system.id}`;
        const systemClosed = closed(systemKey);
        const members = project.equipment.filter(item => item.systemId === system.id);
        return (
          <TreeNode
            key={system.id}
            active={selected('system', system.id)}
            collapsed={members.length > 0 ? systemClosed : undefined}
            toggleLabel={members.length > 0 ? `${systemClosed ? 'Expand' : 'Collapse'} ${system.name}` : undefined}
            onToggle={members.length > 0 ? () => toggle(systemKey) : undefined}
            onSelect={() => onSelect({ kind: 'system', id: system.id })}
            onMenu={event => onContextMenu({ kind: 'system', id: system.id }, event.clientX, event.clientY)}
            content={<><strong><span>{system.name}</span></strong>{members.length > 0 && <span className="tree-meta">{members.length}</span>}</>}
          >
            {members.map(item => {
              const product = getProduct(item.catalogId);
              return (
                <TreeNode key={item.id} active={selected('equipment', item.id)} onSelect={() => onSelect({ kind: 'equipment', id: item.id })} onMenu={event => onContextMenu({ kind: 'equipment', id: item.id }, event.clientX, event.clientY)} content={<>{product ? <EquipmentIcon name={equipmentIconFor(product)} /> : null}<span className="tree-label">{product ? product.model : item.catalogId}</span>{item.quantity > 1 && <span className="tree-meta">× {item.quantity}</span>}</>} />
              );
            })}
          </TreeNode>
        );
      })}
      </TreeNode>
      {unassigned.length > 0 && (
        <TreeNode
          collapsed={closed('unassigned')}
          toggleLabel="Unassigned"
          onToggle={() => toggle('unassigned')}
          onSelect={() => toggle('unassigned')}
          content={<><span className="tree-label">Unassigned</span><span className="tree-meta">{unassigned.length}</span></>}
        >
          {unassigned.map(item => {
            const product = getProduct(item.catalogId);
            return (
              <TreeNode key={item.id} active={selected('equipment', item.id)} onSelect={() => onSelect({ kind: 'equipment', id: item.id })} onMenu={event => onContextMenu({ kind: 'equipment', id: item.id }, event.clientX, event.clientY)} content={<>{product ? <EquipmentIcon name={equipmentIconFor(product)} /> : null}<span className="tree-label">{product ? product.model : item.catalogId}</span>{item.quantity > 1 && <span className="tree-meta">× {item.quantity}</span>}</>} />
            );
          })}
        </TreeNode>
      )}
      </TreeNode>
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
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: { id: string; label: string; danger?: boolean; run: () => void }[];
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
    <div ref={ref} className="context-menu" style={{ left: x + shift.x, top: y + shift.y }} role="menu" onContextMenu={event => event.preventDefault()}>
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
          {item.label}
        </button>
      ))}
    </div>
  );
}

const DRAW_TOOLS: { kind: 'select' | 'wall' | 'draw' | 'door' | 'window'; label: string }[] = [
  { kind: 'select', label: 'Select' },
  { kind: 'wall', label: 'Wall' },
  { kind: 'draw', label: 'Room' },
  { kind: 'door', label: 'Door' },
  { kind: 'window', label: 'Window' },
];

function DrawIcon({ kind }: { kind: (typeof DRAW_TOOLS)[number]['kind'] }) {
  const props = { width: 22, height: 22, viewBox: '0 0 22 22', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'select') return <svg {...props}><path d="M6 3.5 10.2 17.5 12.3 12.3 17.5 10.2Z" /></svg>;
  if (kind === 'wall') return <svg {...props}><path d="M3.5 8h15M3.5 14h15" /></svg>;
  if (kind === 'draw') return <svg {...props}><rect x="4" y="5" width="14" height="12" rx="1" /></svg>;
  if (kind === 'door') return <svg {...props}><path d="M7 18V5h8v13" /><path d="M7 18a8 8 0 0 0 8-8" /></svg>;
  return <svg {...props}><rect x="5" y="4" width="12" height="14" /><path d="M5 11h12M11 4v14" /></svg>;
}
