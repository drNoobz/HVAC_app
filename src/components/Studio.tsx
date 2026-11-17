'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_LABEL, CATEGORY_ORDER, CATALOG, getProduct, type EquipmentCategory } from '@/domain/catalog';
import { downloadText, fileSlug } from '@/domain/download';
import {
  addSystem,
  buildDimensionedRoom,
  buildDrawnRoom,
  buildPlacement,
  removeEquipment,
  removeRoom,
  roomAtPoint,
  updateRoom,
} from '@/domain/projectOps';
import { buildBom, buildSchedule, projectSummary, scheduleCsv } from '@/domain/schedule';
import { DISCLAIMER, SURFACE_FACES, SYSTEM_KINDS, type EditorTool, type Project, type Selection, type StoredTemplate } from '@/domain/types';
import { formatLength } from '@/domain/units';
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
  const actions = useRef({ selection, onChange, setSelection, setTool });
  actions.current = { selection, onChange, setSelection, setTool };

  const materials = useMemo(() => mergeLibrary(addedMaterials), [addedMaterials]);
  const assemblies = useMemo(() => mergeAssemblies(addedAssemblies), [addedAssemblies]);
  const validation = useMemo(() => validateModel(projectToBuildingModel(project)), [project]);
  const errors = validation.issues.filter(issue => issue.severity === 'error').length;
  const warnings = validation.issues.filter(issue => issue.severity === 'warning').length;

  useEffect(() => {
    setSelection({ kind: 'project' });
    setTool({ kind: 'select' });
    setView('model');
    setFitToken(token => token + 1);
    setTemplateName(`${project.name} template`);
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
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      const current = actions.current;
      if (event.key === 'Escape') current.setTool({ kind: 'select' });
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
            onChange={event => onChange({ ...project, name: event.target.value })}
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
            <ProjectTree project={project} selection={selection} onSelect={setSelection} onChange={onChange} />
          ) : (
            <div className="catalog">
              <input placeholder="Search products" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search catalog" />
              <div className="chips">
                <button type="button" className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
                  All
                </button>
                {CATEGORY_ORDER.map(item => (
                  <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
                    {CATEGORY_LABEL[item]}
                  </button>
                ))}
              </div>
              <p className="muted">Demo catalog. Manufacturers and models are fictional. Specs are assumptions or explicitly not stated.</p>
              {filtered.map(product => (
                <article key={product.id} className={tool.kind === 'place' && tool.catalogId === product.id ? 'catalog-card armed' : 'catalog-card'}>
                  <header>
                    <strong>{product.name}</strong>
                    <span className="flag amber">Needs confirmation</span>
                  </header>
                  <p>
                    {product.manufacturer} · {product.model}
                  </p>
                  <p className="sub">{CATEGORY_LABEL[product.category]} · {product.supplier}</p>
                  <p className="sub">{product.dimensions?.stated ?? 'Dimensions not stated'} · {product.airflow?.stated ?? 'Airflow not stated'}</p>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      setTool({ kind: 'place', catalogId: product.id });
                      setView('model');
                    }}
                  >
                    Place in model
                  </button>
                </article>
              ))}
              {filtered.length === 0 && <p className="empty">No products match.</p>}
            </div>
          )}
        </aside>
        <section className="stage">
          {view === 'model' && (
            <>
              <div className="stage-bar">
                <button type="button" className={tool.kind === 'select' ? 'active' : ''} onClick={() => setTool({ kind: 'select' })}>
                  Select
                </button>
                <button type="button" className={tool.kind === 'draw' ? 'active' : ''} onClick={() => setTool({ kind: 'draw' })}>
                  Draw space
                </button>
                <button type="button" className={showDimensions ? 'active' : ''} onClick={() => setShowDimensions(value => !value)}>
                  Enter dimensions
                </button>
                <button type="button" className={hideRoof ? 'active' : ''} aria-pressed={hideRoof} onClick={() => setHideRoof(value => !value)}>
                  Hide roof
                </button>
                <button type="button" onClick={() => setFitToken(token => token + 1)}>
                  Fit
                </button>
                <span className="stage-hint">Hide roof to see inside · Click a wall, door, or window · Left-drag orbits</span>
              </div>
              {showDimensions && (
                <DimensionForm
                  units={project.units}
                  onCreate={(lengthM, widthM, heightM) => {
                    const originX = project.rooms.reduce((max, room) => Math.max(max, room.xM + room.lengthM), 0);
                    const room = buildDimensionedRoom(project.rooms.length);
                    onChange({
                      ...project,
                      rooms: [...project.rooms, { ...room, xM: project.rooms.length ? originX + 0.3 : 0, lengthM, widthM, heightM }],
                    });
                    setSelection({ kind: 'room', id: room.id });
                    setShowDimensions(false);
                    setFitToken(token => token + 1);
                  }}
                />
              )}
              {placeProduct && <p className="place-banner">Click the floor to place {placeProduct.manufacturer} {placeProduct.model}. Esc cancels. This does not size the unit.</p>}
              {tool.kind === 'draw' && <p className="place-banner">Drag on the floor to draw a space. Default height is 3.05 m until you edit it.</p>}
              <div className="viewport">
                <Viewport
                  rooms={project.rooms}
                  equipment={project.equipment}
                  selection={selection}
                  tool={tool}
                  fitToken={fitToken}
                  hideRoof={hideRoof}
                  onSelect={setSelection}
                  onDrawRoom={rect => {
                    const room = buildDrawnRoom(rect, project.rooms.length);
                    onChange({ ...project, rooms: [...project.rooms, room] });
                    setSelection({ kind: 'room', id: room.id });
                  }}
                  onPlace={point => {
                    if (tool.kind !== 'place') return;
                    const product = getProduct(tool.catalogId);
                    if (!product) return;
                    const room = roomAtPoint(project.rooms, point.xM, point.yM);
                    const item = buildPlacement(product, room, point);
                    onChange({ ...project, equipment: [...project.equipment, item] });
                    setSelection({ kind: 'equipment', id: item.id });
                    setTool({ kind: 'select' });
                  }}
                />
                {project.rooms.length === 0 && <div className="hud">Draw a space or enter dimensions. The grid is 1 m.</div>}
              </div>
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
          onChange={onChange}
          onSelect={setSelection}
          onDeleteProject={onDeleteProject}
        />
      </div>
      <footer className="statusbar">
        <span>{project.buildingType}{project.subtype ? ` · ${project.subtype}` : ''}</span>
        <span>{project.units === 'IP' ? 'IP display' : 'SI display'} · stored in m</span>
        <span>
          {project.rooms.length} rooms · {project.equipment.length} items · {project.systems.length} systems
        </span>
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
    </div>
  );
}

function ProjectTree({
  project,
  selection,
  onSelect,
  onChange,
}: {
  project: Project;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onChange: (project: Project) => void;
}) {
  const selected = (kind: Selection['kind'], id?: string) => selection.kind === kind && ('id' in selection ? selection.id === id : true);
  return (
    <div className="tree">
      <button type="button" className={selected('project') ? 'tree-item active' : 'tree-item'} onClick={() => onSelect({ kind: 'project' })}>
        <strong>{project.name || 'Untitled project'}</strong>
        <span>{project.location || 'Location not stated'}</span>
      </button>
      <div className="tree-head">
        <span>Rooms</span>
      </div>
      {project.rooms.map(room => (
        <div key={room.id}>
          <button
            type="button"
            className={selected('room', room.id) ? 'tree-item active' : 'tree-item'}
            onClick={() => onSelect({ kind: 'room', id: room.id })}
          >
            <strong>
              {room.name}
              {room.assumption && <i className="dot" title="Assumption" />}
            </strong>
            <span>
              {formatLength(room.lengthM, project.units, 2)} × {formatLength(room.widthM, project.units, 2)} × {formatLength(room.heightM, project.units, 2)}
            </span>
          </button>
          {SURFACE_FACES.map(face => (
            <button
              key={face.id}
              type="button"
              className={
                selection.kind === 'surface' && selection.roomId === room.id && selection.face === face.id
                  ? 'tree-item child active'
                  : 'tree-item child'
              }
              onClick={() => onSelect({ kind: 'surface', roomId: room.id, face: face.id })}
            >
              {face.label}
            </button>
          ))}
          {room.openings.map(opening => (
            <button
              key={opening.id}
              type="button"
              className={selection.kind === 'opening' && selection.id === opening.id ? 'tree-item child active' : 'tree-item child'}
              onClick={() => onSelect({ kind: 'opening', roomId: room.id, id: opening.id })}
            >
              {opening.kind} · {opening.face}
            </button>
          ))}
        </div>
      ))}
      {project.rooms.length === 0 && <p className="muted pad">No rooms yet.</p>}
      <div className="tree-head">
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
      {project.systems.map(system => (
        <div key={system.id}>
          <button
            type="button"
            className={selected('system', system.id) ? 'tree-item active' : 'tree-item'}
            onClick={() => onSelect({ kind: 'system', id: system.id })}
          >
            <strong>{system.name}</strong>
            <span>{project.equipment.filter(item => item.systemId === system.id).length} items</span>
          </button>
          {project.equipment
            .filter(item => item.systemId === system.id)
            .map(item => {
              const product = getProduct(item.catalogId);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={selected('equipment', item.id) ? 'tree-item child active' : 'tree-item child'}
                  onClick={() => onSelect({ kind: 'equipment', id: item.id })}
                >
                  {product ? product.model : item.catalogId} × {item.quantity}
                </button>
              );
            })}
        </div>
      ))}
      {project.equipment.some(item => !item.systemId) && (
        <>
          <div className="tree-head">
            <span>Unassigned equipment</span>
          </div>
          {project.equipment
            .filter(item => !item.systemId)
            .map(item => {
              const product = getProduct(item.catalogId);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={selected('equipment', item.id) ? 'tree-item active' : 'tree-item'}
                  onClick={() => onSelect({ kind: 'equipment', id: item.id })}
                >
                  {product ? `${product.model}` : item.catalogId}
                </button>
              );
            })}
        </>
      )}
    </div>
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
