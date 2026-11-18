'use client';

import dynamic from 'next/dynamic';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { planningIssues } from '@/domain/issues';
import { CATEGORY_LABEL, CATEGORY_ORDER, CATALOG, getProduct, type EquipmentCategory } from '@/domain/catalog';
import { downloadText, fileSlug } from '@/domain/download';
import {
  addOpening,
  addSystem,
  buildDimensionedRoom,
  buildDrawnRoom,
  buildPlacement,
  removeEquipment,
  removeRoom,
  removeSystem,
  roomAtPoint,
  setWallAssembly,
  updateRoom,
} from '@/domain/projectOps';
import { buildBom, buildSchedule, projectSummary, scheduleCsv } from '@/domain/schedule';
import { DISCLAIMER, SURFACE_FACES, SYSTEM_KINDS, WALL_FACES, type EditorTool, type Project, type Selection, type StoredTemplate, type WallFace } from '@/domain/types';
import { PLAN_SIDES, WALL_TYPES, roomFill, wallPlaceLabel, wallRoleLabel } from '@/domain/walls';
import { PlanView } from './PlanView';
import { formatLength, formatNumber, lengthUnit, mToLength } from '@/domain/units';
import { projectToBuildingModel, validateModel } from '@/thermonode/localAdapter';
import { mergeAssemblies, mergeLibrary, type ConstructionAssembly, type ConstructionMaterial } from '@/domain/constructionLibrary';
import { BoundaryPanel } from './BoundaryPanel';
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
  const [category, setCategory] = useState<EquipmentCategory | 'all'>('all');
  const [showDimensions, setShowDimensions] = useState(false);
  const [hideRoof, setHideRoof] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState(`${project.name} template`);
  const [wallTypeId, setWallTypeId] = useState<string | null>(null);
  const [scene, setScene] = useState<'plan' | '3d'>('plan');
  const [cameraPose, setCameraPose] = useState<'orbit' | 'top'>('top');
  const [menu, setMenu] = useState<{ x: number; y: number; selection: Selection } | null>(null);
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
  const planning = useMemo(() => planningIssues(project), [project]);
  const validation = useMemo(() => validateModel(projectToBuildingModel(project)), [project]);
  const errors = validation.issues.filter(issue => issue.severity === 'error').length;
  const warnings = validation.issues.filter(issue => issue.severity === 'warning').length;

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project]);

  const filtered = CATALOG.filter(product => {
    const haystack = `${product.name} ${product.manufacturer} ${product.model} ${product.category} ${product.supplier}`.toLowerCase();
    return (category === 'all' || product.category === category) && haystack.includes(query.trim().toLowerCase());
  });
  const placeProduct = tool.kind === 'place' ? getProduct(tool.catalogId) : undefined;
  const customTemplate = templates.find(item => item.id === project.createdFrom.templateId);

  const exportSchedule = () => {
    const lines = buildSchedule(project);
    downloadText(`${fileSlug(project.name)}-schedule.csv`, scheduleCsv(project, lines, buildBom(lines)), 'text/csv');
    setExportOpen(false);
  };
  const exportSummary = () => {
    const lines = buildSchedule(project);
    downloadText(
      `${fileSlug(project.name)}-summary.json`,
      JSON.stringify(projectSummary(project, lines, buildBom(lines)), null, 2),
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
        { id: 'door', label: 'Add door', run: () => placeOpening(next.id, 'door') },
        { id: 'window', label: 'Add window', run: () => placeOpening(next.id, 'window') },
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
    if (next.kind === 'system') {
      return [
        { id: 'rename', label: 'Rename', run: () => renameSelection(next) },
        { id: 'delete', label: 'Delete', danger: true, run: () => { edit(removeSystem(project, next.id)); setSelection({ kind: 'project' }); } },
      ];
    }
    return [];
  };
  const openMenu = (selection: Selection, x: number, y: number) => {
    const subject: Selection = selection.kind === 'surface' && selection.face !== 'walls' ? { kind: 'room', id: selection.roomId } : selection;
    if (menuItems(subject).length === 0) return;
    setSelection(subject);
    setMenu({ x, y, selection: subject });
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
      <p className="disclaimer">{DISCLAIMER}</p>
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
          {side === 'project' ? (
            <ProjectTree project={project} selection={selection} onSelect={setSelection} onChange={edit} onContextMenu={openMenu} />
          ) : (
            <div className="catalog">
              <div className="catalog-tools">
                <input placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search catalog" />
                <select aria-label="Catalog category" value={category} onChange={event => setCategory(event.target.value as EquipmentCategory | 'all')}>
                  <option value="all">All</option>
                  {CATEGORY_ORDER.map(item => (
                    <option key={item} value={item}>
                      {CATEGORY_LABEL[item]}
                    </option>
                  ))}
                </select>
              </div>
              <p className="catalog-note">Fictional products. Confirm specs before use.</p>
              {filtered.map(product => {
                const spec = [product.dimensions?.stated, product.airflow?.stated ?? product.cooling?.stated ?? product.heating?.stated].filter(Boolean).join(' · ');
                return (
                  <article key={product.id} className={tool.kind === 'place' && tool.catalogId === product.id ? 'catalog-card armed' : 'catalog-card'}>
                    <header>
                      <strong>{product.name}</strong>
                      <span>{product.model}</span>
                    </header>
                    <p>{spec || CATEGORY_LABEL[product.category]}</p>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        setTool({ kind: 'place', catalogId: product.id });
                        setView('model');
                      }}
                    >
                      Place
                    </button>
                  </article>
                );
              })}
              {filtered.length === 0 && <p className="empty">No products match.</p>}
            </div>
          )}
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
                <button type="button" className={tool.kind === 'select' ? 'active' : ''} onClick={() => setTool({ kind: 'select' })}>
                  Select
                </button>
                <button type="button" className={tool.kind === 'draw' ? 'active' : ''} onClick={() => setTool({ kind: 'draw' })}>
                  Draw space
                </button>
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
                <span className="stage-hint">{scene === 'plan' ? 'Drag a wall to resize. Drag a door or window along its wall.' : 'Hide roof to see inside · Click a wall, door, or window'}</span>
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
              {placeProduct && <p className="place-banner">Click the {scene === 'plan' ? 'plan' : 'floor'} to place {placeProduct.manufacturer} {placeProduct.model}. Esc cancels. This does not size the unit.</p>}
              {tool.kind === 'draw' && <p className="place-banner">Drag to draw a space. Default height is 3.05 m until you edit it.</p>}
              {wallTypeId && <p className="place-banner">Click one wall. {WALL_TYPES.find(type => type.id === wallTypeId)?.label} is copied onto that face only. Set Paint wall to Off when you are done.</p>}
              {scene === 'plan' ? (
                <PlanView
                  project={project}
                  selection={selection}
                  tool={tool}
                  fitToken={fitToken}
                  onSelect={next => {
                    if (wallTypeId && next.kind === 'surface' && next.face === 'walls' && next.wallFace) {
                      const type = WALL_TYPES.find(item => item.id === wallTypeId);
                      if (type) edit(setWallAssembly(project, next.roomId, next.wallFace, type.assemblyId, assemblies));
                    }
                    setSelection(next);
                  }}
                  onDrawRoom={rect => {
                    const room = buildDrawnRoom(rect, project.rooms.length);
                    edit({ ...project, rooms: [...project.rooms, room] });
                    setSelection({ kind: 'room', id: room.id });
                  }}
                  onPlace={point => {
                    if (tool.kind !== 'place') return;
                    const product = getProduct(tool.catalogId);
                    if (!product) return;
                    const room = roomAtPoint(project.rooms, point.xM, point.yM);
                    const item = buildPlacement(product, room, point);
                    edit({ ...project, equipment: [...project.equipment, item] });
                    setSelection({ kind: 'equipment', id: item.id });
                    setTool({ kind: 'select' });
                  }}
                  onContextMenu={openMenu}
                  onRoomsChange={rooms => edit({ ...project, rooms })}
                />
              ) : (
                <div className="viewport">
                  <Viewport
                    rooms={project.rooms}
                    equipment={project.equipment}
                    selection={selection}
                    tool={tool}
                    fitToken={fitToken}
                    hideRoof={hideRoof}
                    cameraPose={cameraPose}
                    onCameraSettled={pose => {
                      if (pose === 'top') setScene('plan');
                    }}
                    onSelect={next => {
                      if (wallTypeId && next.kind === 'surface' && next.face === 'walls' && next.wallFace) {
                        const type = WALL_TYPES.find(item => item.id === wallTypeId);
                        if (type) edit(setWallAssembly(project, next.roomId, next.wallFace, type.assemblyId, assemblies));
                      }
                      setSelection(next);
                    }}
                    onDrawRoom={rect => {
                      const room = buildDrawnRoom(rect, project.rooms.length);
                      edit({ ...project, rooms: [...project.rooms, room] });
                      setSelection({ kind: 'room', id: room.id });
                    }}
                    onPlace={point => {
                      if (tool.kind !== 'place') return;
                      const product = getProduct(tool.catalogId);
                      if (!product) return;
                      const room = roomAtPoint(project.rooms, point.xM, point.yM);
                      const item = buildPlacement(product, room, point);
                      edit({ ...project, equipment: [...project.equipment, item] });
                      setSelection({ kind: 'equipment', id: item.id });
                    setTool({ kind: 'select' });
                  }}
                  onContextMenu={openMenu}
                />
                  {project.rooms.length === 0 && <div className="hud">Draw a space or enter dimensions. The grid is 1 m.</div>}
                </div>
              )}
            </>
          )}
          {view === 'schedule' && <SchedulePanel project={project} />}
          {view === 'library' && (
            <LibraryPanel added={addedMaterials} onChange={onLibraryChange} addedAssemblies={addedAssemblies} onAssembliesChange={onAssembliesChange} />
          )}
          {view === 'boundary' && <BoundaryPanel project={project} />}
        </section>
        <Inspector
          project={project}
          selection={selection}
          issues={validation.issues}
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
        <span>{project.units === 'IP' ? 'IP display' : 'SI display'} · stored in m</span>
        <span>
          {project.rooms.length} rooms · {project.equipment.length} items · {project.systems.length} systems
        </span>
        <span className={planning.length ? 'amber-text' : ''}>{planning.length} planning issues</span>
        <span className={errors || warnings ? 'amber-text' : ''}>
          {errors} geometry errors · {warnings} warnings · solver not connected
        </span>
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
          <p className="muted">The copy keeps current rooms, materials, systems, and equipment, including assumption labels.</p>
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
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.selection)} onClose={() => setMenu(null)} />}
    </div>
  );
}

function ProjectTree({
  project,
  selection,
  onSelect,
  onChange,
  onContextMenu,
}: {
  project: Project;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onChange: (project: Project) => void;
  onContextMenu: (selection: Selection, x: number, y: number) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const closed = (key: string) => collapsed.has(key);
  const toggle = (key: string) =>
    setCollapsed(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  useEffect(() => {
    setCollapsed(current => {
      const next = new Set(current);
      let changed = false;
      const open = (key: string) => {
        if (next.delete(key)) changed = true;
      };
      if (selection.kind === 'room' || selection.kind === 'surface' || selection.kind === 'opening') {
        open('rooms');
        const roomId = selection.kind === 'room' ? selection.id : selection.roomId;
        open(`room:${roomId}`);
        if (selection.kind === 'surface' && selection.face === 'walls' && selection.wallFace) open(`wall:${roomId}:${selection.wallFace}`);
        if (selection.kind === 'opening') {
          const opening = project.rooms.find(room => room.id === roomId)?.openings.find(item => item.id === selection.id);
          if (opening) open(`wall:${roomId}:${opening.face}`);
        }
      }
      if (selection.kind === 'system') {
        open('systems');
        open(`system:${selection.id}`);
      }
      if (selection.kind === 'equipment') {
        const item = project.equipment.find(entry => entry.id === selection.id);
        if (item?.systemId) {
          open('systems');
          open(`system:${item.systemId}`);
        } else open('unassigned');
      }
      return changed ? next : current;
    });
  }, [selection, project.rooms, project.equipment]);
  const selected = (kind: Selection['kind'], id?: string) => selection.kind === kind && ('id' in selection ? selection.id === id : true);
  const roomsClosed = closed('rooms');
  const systemsClosed = closed('systems');
  const unit = lengthUnit(project.units);
  return (
    <div className="tree">
      <button
        type="button"
        className={selected('project') ? 'tree-project active' : 'tree-project'}
        onClick={() => onSelect({ kind: 'project' })}
        onContextMenu={event => {
          event.preventDefault();
          onContextMenu({ kind: 'project' }, event.clientX, event.clientY);
        }}
      >
        <strong>{project.name || 'Untitled project'}</strong>
        {project.location ? <span>{project.location}</span> : null}
      </button>
      <div className="tree-head">
        {project.rooms.length > 0 ? (
          <button type="button" className="twist" aria-expanded={!roomsClosed} aria-label={roomsClosed ? 'Expand rooms' : 'Collapse rooms'} onClick={() => toggle('rooms')}>
            <Chevron open={!roomsClosed} />
          </button>
        ) : (
          <span className="twist spacer" aria-hidden="true" />
        )}
        <span>Rooms</span>
      </div>
      {!roomsClosed &&
        project.rooms.map(room => {
          const roomKey = `room:${room.id}`;
          const roomClosed = closed(roomKey);
          return (
            <div key={room.id}>
              <TreeRow
                depth="child"
                active={selected('room', room.id)}
                collapsed={roomClosed}
                toggleLabel={`${roomClosed ? 'Expand' : 'Collapse'} ${room.name}`}
                onToggle={() => toggle(roomKey)}
                onSelect={() => onSelect({ kind: 'room', id: room.id })}
                onMenu={event => onContextMenu({ kind: 'room', id: room.id }, event.clientX, event.clientY)}
              >
                <strong>
                  <i className="room-dot" style={{ background: roomFill(room.use) }} />
                  <span>{room.name}</span>
                  {room.assumption && <i className="dot" title="Assumption" />}
                </strong>
                <span className="tree-meta">
                  {formatNumber(mToLength(room.lengthM, project.units), 1)} × {formatNumber(mToLength(room.widthM, project.units), 1)} {unit}
                </span>
              </TreeRow>
              {!roomClosed && (
                <>
                  {SURFACE_FACES.filter(face => face.id !== 'walls').map(face => (
                    <TreeRow
                      key={face.id}
                      depth="deep"
                      active={selection.kind === 'surface' && selection.roomId === room.id && selection.face === face.id}
                      onSelect={() => onSelect({ kind: 'surface', roomId: room.id, face: face.id })}
                      onMenu={event => onContextMenu({ kind: 'surface', roomId: room.id, face: face.id }, event.clientX, event.clientY)}
                    >
                      {face.label}
                    </TreeRow>
                  ))}
                  {WALL_FACES.map(face => {
                    const wallKey = `wall:${room.id}:${face.id}`;
                    const wallClosed = closed(wallKey);
                    const openings = room.openings.filter(opening => opening.face === face.id);
                    const wallActive = selection.kind === 'surface' && selection.roomId === room.id && selection.face === 'walls' && selection.wallFace === face.id;
                    const role = wallRoleLabel(room.surfaces.walls[face.id].constructionId);
                    return (
                      <div key={face.id}>
                        <TreeRow
                          depth="deep"
                          active={wallActive}
                          title={`${wallPlaceLabel(room, face.id, project.rooms)} · ${role}`}
                          collapsed={openings.length > 0 ? wallClosed : undefined}
                          toggleLabel={openings.length > 0 ? `${wallClosed ? 'Expand' : 'Collapse'} ${face.label}` : undefined}
                          onToggle={openings.length > 0 ? () => toggle(wallKey) : undefined}
                          onSelect={() => onSelect({ kind: 'surface', roomId: room.id, face: 'walls', wallFace: face.id })}
                          onMenu={event => onContextMenu({ kind: 'surface', roomId: room.id, face: 'walls', wallFace: face.id }, event.clientX, event.clientY)}
                        >
                          <span className="tree-label">{PLAN_SIDES[face.id].title} wall</span>
                          {role !== 'Unassigned' && <span className="tree-meta">{role}</span>}
                        </TreeRow>
                        {openings.length > 0 &&
                          !wallClosed &&
                          openings.map(opening => (
                            <TreeRow
                              key={opening.id}
                              depth="nested"
                              active={selection.kind === 'opening' && selection.id === opening.id}
                              onSelect={() => onSelect({ kind: 'opening', roomId: room.id, id: opening.id })}
                              onMenu={event => onContextMenu({ kind: 'opening', roomId: room.id, id: opening.id }, event.clientX, event.clientY)}
                            >
                              <span className="tree-label">{opening.kind === 'door' ? 'Door' : opening.kind === 'window' ? 'Window' : 'Opening'}</span>
                              <span className="tree-meta">{formatLength(opening.widthM, project.units, 2)}</span>
                            </TreeRow>
                          ))}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      {!roomsClosed && project.rooms.length === 0 && <p className="muted pad">No rooms yet.</p>}
      <div className="tree-head">
        {project.systems.length > 0 ? (
          <button type="button" className="twist" aria-expanded={!systemsClosed} aria-label={systemsClosed ? 'Expand systems' : 'Collapse systems'} onClick={() => toggle('systems')}>
            <Chevron open={!systemsClosed} />
          </button>
        ) : (
          <span className="twist spacer" aria-hidden="true" />
        )}
        <span>Systems</span>
        <select
          aria-label="Add system"
          value=""
          onChange={event => {
            const kind = event.target.value as (typeof SYSTEM_KINDS)[number]['id'];
            if (!kind) return;
            const next = addSystem(project, kind);
            const created = next.systems[next.systems.length - 1];
            onChange({ ...next, systems: next.systems.map(system => (system.id === created.id ? { ...system, name: SYSTEM_KINDS.find(item => item.id === kind)?.label ?? 'New system' } : system)) });
            onSelect({ kind: 'system', id: created.id });
          }}
        >
          <option value="">Add</option>
          {SYSTEM_KINDS.map(kind => (
            <option key={kind.id} value={kind.id}>
              {kind.label}
            </option>
          ))}
        </select>
      </div>
      {!systemsClosed &&
        project.systems.map(system => {
          const systemKey = `system:${system.id}`;
          const systemClosed = closed(systemKey);
          const members = project.equipment.filter(item => item.systemId === system.id);
          return (
            <div key={system.id}>
              <TreeRow
                depth="child"
                active={selected('system', system.id)}
                collapsed={members.length > 0 ? systemClosed : undefined}
                toggleLabel={members.length > 0 ? `${systemClosed ? 'Expand' : 'Collapse'} ${system.name}` : undefined}
                onToggle={members.length > 0 ? () => toggle(systemKey) : undefined}
                onSelect={() => onSelect({ kind: 'system', id: system.id })}
                onMenu={event => onContextMenu({ kind: 'system', id: system.id }, event.clientX, event.clientY)}
              >
                <strong>
                  <span>{system.name}</span>
                </strong>
                <span className="tree-meta">{members.length === 1 ? '1 item' : `${members.length} items`}</span>
              </TreeRow>
              {members.length > 0 &&
                !systemClosed &&
                members.map(item => {
                  const product = getProduct(item.catalogId);
                  return (
                    <TreeRow key={item.id} depth="deep" active={selected('equipment', item.id)} onSelect={() => onSelect({ kind: 'equipment', id: item.id })} onMenu={event => onContextMenu({ kind: 'equipment', id: item.id }, event.clientX, event.clientY)}>
                      <span className="tree-label">{product ? product.model : item.catalogId}</span>
                      {item.quantity > 1 && <span className="tree-meta">× {item.quantity}</span>}
                    </TreeRow>
                  );
                })}
            </div>
          );
        })}
      {project.equipment.some(item => !item.systemId) && (
        <>
          <div className="tree-head">
            <button type="button" className="twist" aria-expanded={!closed('unassigned')} aria-label={closed('unassigned') ? 'Expand unassigned equipment' : 'Collapse unassigned equipment'} onClick={() => toggle('unassigned')}>
              <Chevron open={!closed('unassigned')} />
            </button>
            <span>Unassigned equipment</span>
          </div>
          {!closed('unassigned') &&
            project.equipment
              .filter(item => !item.systemId)
              .map(item => {
                const product = getProduct(item.catalogId);
                return (
                  <TreeRow key={item.id} depth="child" active={selected('equipment', item.id)} onSelect={() => onSelect({ kind: 'equipment', id: item.id })} onMenu={event => onContextMenu({ kind: 'equipment', id: item.id }, event.clientX, event.clientY)}>
                    <span className="tree-label">{product ? product.model : item.catalogId}</span>
                    {item.quantity > 1 && <span className="tree-meta">× {item.quantity}</span>}
                  </TreeRow>
                );
              })}
        </>
      )}
    </div>
  );
}

function TreeRow({
  active,
  depth,
  collapsed,
  title,
  toggleLabel,
  onToggle,
  onSelect,
  onMenu,
  children,
}: {
  active: boolean;
  depth?: 'child' | 'deep' | 'nested';
  collapsed?: boolean;
  title?: string;
  toggleLabel?: string;
  onToggle?: () => void;
  onSelect: () => void;
  onMenu?: (event: ReactMouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <div className={`tree-row${depth ? ` ${depth}` : ''}${active ? ' active' : ''}`}>
      {onToggle ? (
        <button type="button" className="twist" aria-expanded={!collapsed} aria-label={toggleLabel} onClick={onToggle}>
          <Chevron open={!collapsed} />
        </button>
      ) : (
        <span className="twist spacer" aria-hidden="true" />
      )}
      <button
        type="button"
        className="tree-item"
        title={title}
        onClick={onSelect}
        onContextMenu={event => {
          if (!onMenu) return;
          event.preventDefault();
          event.stopPropagation();
          onMenu(event);
        }}
      >
        {children}
      </button>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={open ? 'M3 6 L8 11 L13 6' : 'M6 3 L11 8 L6 13'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
