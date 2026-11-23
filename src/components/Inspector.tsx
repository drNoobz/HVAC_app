'use client';

import { CATEGORY_LABEL, getProduct, type CatalogProduct } from '@/domain/catalog';
import {
  addOpening,
  assignEquipmentRoom,
  duplicateEquipment,
  duplicateRoom,
  removeDuct,
  removeEquipment,
  removeRoom,
  removeSystem,
  removeWallRun,
  removeWallRunOpening,
  setEdgeAssembly,
  setInterfaceAssembly,
  setWallAssembly,
  updateInterfaceAssignment,
  UNASSIGNED_SURFACE,
  updateDuct,
  updateEquipment,
  updateRoom,
  updateSystem,
} from '@/domain/projectOps';
import { getDuctProduct, roughnessLabel, servicesFor, streamFor, systemsForProduct } from '@/domain/ductCatalog';
import { ductCrossings, ductSizeLabel, ductViewOf, DUCT_SERVICES, endRise, linkedPort, polylineLength } from '@/domain/ducts';
import { doorDirection, hingeEnds, setDoorDirection, type DoorHinge } from '@/domain/doorSwing';
import { placeBeside, resizeSpan, slideOpeningOffset } from '@/domain/spanFit';
import {
  BUILDING_TYPES,
  ROOM_USES,
  SURFACE_FACES,
  SYSTEM_KINDS,
  WALL_FACES,
  type DuctService,
  type LoadOverride,
  type OpeningKind,
  type Project,
  type Room,
  type Selection,
  type SurfaceFace,
  type WallFace,
} from '@/domain/types';
import { formatArea, formatFlow, formatLength, formatNumber, formatPower, lengthToM, lengthUnit, mToLength, M3S_PER_CFM } from '@/domain/units';
import { basisLabel, getLoadProduct, LOAD_CATEGORY_LABEL, loadGroups } from '@/domain/loadCatalog';
import { blankOverride, gainUnit, hoodOver, LOAD_METHOD_NOTES, loadGains, loadLabel, removeLoad, roomAreaM2, roomLoads, sumLoads, updateLoad, type LoadTotals } from '@/domain/loads';
import { polygonArea } from '@/domain/wallDraw';
import {
  assemblyCategoriesForFace,
  assemblyCategoriesForOpening,
  constructionCategoryLabel,
  findAssembly,
  findConstruction,
  formatResistance,
  formatThickness,
  resolveStack,
  stackResistance,
  type ConstructionAssembly,
  type ConstructionCategory,
  type ConstructionMaterial,
} from '@/domain/constructionLibrary';
import { PLAN_SIDES, WALL_TYPES, edgePortions, facePortions, findInterface, interfaceTargets, northDegrees, wallPlaceLabel, type InterfaceTarget, type WallPortion } from '@/domain/walls';
import { StackEditor } from './StackEditor';
import { TextField, UnitField } from './Fields';
import { SiteClimateFields } from './SiteClimateFields';

export function Inspector({
  project,
  selection,
  materials,
  assemblies,
  onChange,
  onSelect,
  onDeleteProject,
  nameFocus = 0,
}: {
  project: Project;
  selection: Selection;
  materials: ConstructionMaterial[];
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
  onDeleteProject: () => void;
  nameFocus?: number;
}) {
  return (
    <aside className="inspector">
      {selection.kind === 'project' && (
        <ProjectFields project={project} onChange={onChange} onDeleteProject={onDeleteProject} nameFocus={nameFocus} />
      )}
      {selection.kind === 'site' && (
        <SiteClimateFields project={project} materials={materials} assemblies={assemblies} onChange={onChange} />
      )}
      {selection.kind === 'room' && (
        <RoomFields project={project} roomId={selection.id} assemblies={assemblies} onChange={onChange} onSelect={onSelect} nameFocus={nameFocus} />
      )}
      {selection.kind === 'interface' && (
        <InterfaceFields project={project} interfaceKey={selection.key} materials={materials} assemblies={assemblies} onChange={onChange} />
      )}
      {selection.kind === 'surface' && (
        <SurfaceFields
          project={project}
          roomId={selection.roomId}
          face={selection.face}
          wallFace={selection.wallFace}
          edge={selection.edge}
          materials={materials}
          assemblies={assemblies}
          onChange={onChange}
          onSelect={onSelect}
        />
      )}
      {selection.kind === 'opening' && (
        <OpeningFields
          project={project}
          roomId={selection.roomId}
          openingId={selection.id}
          materials={materials}
          assemblies={assemblies}
          onChange={onChange}
          onSelect={onSelect}
        />
      )}
      {selection.kind === 'system' && (
        <SystemFields
          project={project}
          systemId={selection.id}
          onChange={onChange}
          onSelect={onSelect}
          nameFocus={nameFocus}
        />
      )}
      {selection.kind === 'equipment' && (
        <EquipmentFields project={project} equipmentId={selection.id} onChange={onChange} onSelect={onSelect} />
      )}
      {selection.kind === 'wallRun' && <WallRunFields project={project} wallId={selection.id} onChange={onChange} onSelect={onSelect} />}
      {selection.kind === 'duct' && <DuctFields project={project} ductId={selection.id} onChange={onChange} onSelect={onSelect} />}
      {selection.kind === 'wallOpening' && (
        <WallOpeningFields project={project} wallId={selection.wallId} openingId={selection.id} onChange={onChange} onSelect={onSelect} />
      )}
      {selection.kind === 'load' && <LoadFields project={project} loadId={selection.id} onChange={onChange} onSelect={onSelect} />}
    </aside>
  );
}

function ProjectFields({
  project,
  onChange,
  onDeleteProject,
  nameFocus,
}: {
  project: Project;
  onChange: (project: Project) => void;
  onDeleteProject: () => void;
  nameFocus: number;
}) {
  const loads = project.loads ?? [];
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Project</p>
        <h2>{project.name || 'Untitled project'}</h2>
      </header>
      <div className="stat-row">
        <span>{project.rooms.length} spaces</span>
        <span>{loads.length} loads</span>
        <span>{project.equipment.length} equipment</span>
        <span>{(project.ducts ?? []).length} ducts</span>
      </div>
      <section className="prop-block">
      <p className="prop-section">General</p>
      <TextField label="Name" value={project.name} focusToken={nameFocus} onCommit={name => onChange({ ...project, name })} />
      <TextField label="Location" value={project.location} onCommit={location => onChange({ ...project, location })} />
      <label className="field">
        <span>Building type</span>
        <select value={project.buildingType} onChange={event => onChange({ ...project, buildingType: event.target.value as Project['buildingType'] })}>
          {BUILDING_TYPES.map(item => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <TextField label="Subtype" value={project.subtype} onCommit={subtype => onChange({ ...project, subtype })} />
      </section>
      <section className="prop-block">
      <p className="prop-section">Settings</p>
      <label className="field">
        <span>Display units</span>
        <select value={project.units} onChange={event => onChange({ ...project, units: event.target.value as Project['units'] })}>
          <option value="IP">IP (ft, CFM, Btu/h)</option>
          <option value="SI">SI (m, L/s, kW)</option>
        </select>
      </label>
      <TextField
        label="North, degrees clockwise from up"
        value={String(Math.round(northDegrees(project.northDeg)))}
        onCommit={text => {
          const deg = Number(text);
          if (!Number.isFinite(deg)) return;
          const next = Math.round(northDegrees(deg));
          onChange({ ...project, northDeg: next === 0 ? undefined : next });
        }}
      />
      </section>
      {loads.length > 0 && (
        <section className="prop-block">
          <p className="prop-section">Internal loads</p>
          <LoadTotalsList totals={sumLoads(project, loads)} units={project.units} />
        </section>
      )}
      <TextField label="Details" value={project.details} multiline onCommit={details => onChange({ ...project, details })} />
      <div className="button-row">
        <button type="button" className="btn danger" onClick={onDeleteProject}>
          Delete project
        </button>
      </div>
    </div>
  );
}

function ComponentSelect({
  label,
  assemblies,
  categories,
  value,
  onChange,
}: {
  label: string;
  assemblies: ConstructionAssembly[];
  categories: readonly string[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const options = assemblies.filter(item => categories.includes(item.category));
  const current = findAssembly(assemblies, value);
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
        <option value="">Unassigned</option>
        {value && !current && <option value={value}>{value}</option>}
        {categories.map(category => {
          const items = options.filter(item => item.category === category);
          if (items.length === 0) return null;
          return (
            <optgroup key={category} label={constructionCategoryLabel[category as ConstructionCategory]}>
              {items.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}

function assignSurface(project: Project, room: Room, face: 'floor' | 'ceiling', constructionId: string | null, assemblies: ConstructionAssembly[]): Project {
  const assembly = findAssembly(assemblies, constructionId);
  const note = assembly ? `${assembly.name}. ${assembly.notes}` : UNASSIGNED_SURFACE;
  return updateRoom(project, room.id, {
    assumption: false,
    surfaces: {
      ...room.surfaces,
      [face]: { materialKey: null, constructionId, layers: assembly ? assembly.layers.map(layer => ({ ...layer })) : [], note },
    },
  });
}

function formatUFactor(rIp: number | null, units: Project['units']): string {
  if (rIp == null || rIp <= 0) return 'Not stated';
  if (units === 'IP') return `${(1 / rIp).toFixed(3)} Btu/(h·ft²·°F)`;
  return `${((1 / rIp) * 5.678263337).toFixed(3)} W/(m²·K)`;
}

function ConstructionSpecSummary({
  layers,
  materials,
  series,
  units,
  thicknessMm,
}: {
  layers: { materialId: string; thicknessMm: number | null }[];
  materials: ConstructionMaterial[];
  series: boolean;
  units: Project['units'];
  thicknessMm: number | null;
}) {
  const rIp = stackResistance(layers, materials, series);
  return (
    <dl className="spec-list">
      <div>
        <dt>Thickness</dt>
        <dd>{thicknessMm == null ? 'Not stated' : formatThickness(thicknessMm, units)}</dd>
      </div>
      <div>
        <dt>R-value</dt>
        <dd>{formatResistance(rIp, units)}</dd>
      </div>
      <div>
        <dt>U-factor</dt>
        <dd>{formatUFactor(rIp, units)}</dd>
      </div>
      <div>
        <dt>Layers</dt>
        <dd>{layers.length}</dd>
      </div>
    </dl>
  );
}

function stackThicknessMm(layers: { materialId: string; thicknessMm: number | null }[], materials: ConstructionMaterial[]): number | null {
  if (layers.length === 0) return null;
  let sum = 0;
  for (const layer of layers) {
    const thickness = layer.thicknessMm ?? findConstruction(materials, layer.materialId)?.thicknessMm ?? null;
    if (thickness == null) return null;
    sum += thickness;
  }
  return sum;
}

function interfacesOn(room: Room, anchor: string, rooms: readonly Room[]): InterfaceTarget[] {
  return interfaceTargets(rooms)
    .filter(target => target.sides.some(side => side.roomId === room.id && side.anchor === anchor))
    .sort((a, b) => {
      const start = (target: InterfaceTarget) => target.sides.find(side => side.roomId === room.id && side.anchor === anchor)?.startM ?? 0;
      return start(a) - start(b);
    });
}

function openingOnSide(opening: { offsetM: number; widthM: number }, startM: number, endM: number): boolean {
  const mid = opening.offsetM + opening.widthM / 2;
  return mid >= startM - 0.02 && mid <= endM + 0.02;
}

type WallPart = { kind: 'interface'; key: string; at: number } | { kind: 'opening'; id: string; at: number };

function wallParts(room: Room, anchor: string, rooms: readonly Room[], openings: readonly { id: string; offsetM: number; widthM: number }[]): WallPart[] {
  const interfaces = interfacesOn(room, anchor, rooms);
  if (interfaces.length < 2) {
    return openings
      .map(opening => ({ kind: 'opening' as const, id: opening.id, at: opening.offsetM }))
      .sort((a, b) => a.at - b.at);
  }
  const taken = new Set<string>();
  const rows: Array<WallPart & { tie: number }> = [];
  for (const target of interfaces) {
    const side = target.sides.find(item => item.roomId === room.id && item.anchor === anchor);
    const startM = side?.startM ?? 0;
    const endM = side?.endM ?? startM;
    rows.push({ kind: 'interface', key: target.key, at: startM, tie: 0 });
    if (!side) continue;
    for (const opening of openings) {
      if (taken.has(opening.id) || !openingOnSide(opening, startM, endM)) continue;
      taken.add(opening.id);
      rows.push({ kind: 'opening', id: opening.id, at: opening.offsetM, tie: 1 });
    }
  }
  rows.sort((a, b) => a.at - b.at || a.tie - b.tie);
  for (const opening of [...openings].sort((a, b) => a.offsetM - b.offsetM)) {
    if (!taken.has(opening.id)) rows.push({ kind: 'opening', id: opening.id, at: opening.offsetM, tie: 1 });
  }
  return rows;
}

function PortionLines({ portions, units }: { portions: readonly WallPortion[]; units: Project['units'] }) {
  if (portions.length === 0) return null;
  return (
    <>
      {portions.map((portion, index) => (
        <p key={`${portion.kind}-${portion.startM}-${index}`} className="muted">
          {portion.kind === 'interface' ? `Interface with ${portion.names.join(', ')}` : 'Interface with outside air'} · {formatLength(portion.endM - portion.startM, units, 2)}
        </p>
      ))}
    </>
  );
}

function EdgeWallFields({
  project,
  room,
  edge,
  materials,
  assemblies,
  onChange,
}: {
  project: Project;
  room: Room;
  edge: number;
  materials: ConstructionMaterial[];
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
}) {
  const loop = room.outline ?? [];
  const start = loop[edge];
  const end = loop[(edge + 1) % loop.length];
  const lengthM = Math.hypot(end.x - start.x, end.y - start.y);
  const children = interfacesOn(room, `e:${edge}`, project.rooms);
  if (children.length > 1) {
    return <InterfaceStack project={project} children={children} materials={materials} assemblies={assemblies} onChange={onChange} />;
  }
  const sole = children.length === 1 ? children[0] : null;
  const assignment = sole
    ? (project.interfaceWalls?.[sole.key] ?? { materialKey: null, constructionId: null, layers: [], note: UNASSIGNED_SURFACE })
    : (room.edgeWalls?.[edge] ?? { materialKey: null, constructionId: null, layers: [], note: UNASSIGNED_SURFACE });
  const layers = resolveStack(assignment, assemblies, materials);
  const kind = WALL_TYPES.find(type => type.assemblyId === assignment.constructionId)?.id ?? '';
  const write = (next: typeof assignment) => {
    if (sole) {
      onChange(updateInterfaceAssignment(project, sole.key, next));
      return;
    }
    const edgeWalls = loop.map((_, index) => (index === edge ? next : room.edgeWalls?.[index] ?? { materialKey: null, constructionId: null, layers: [], note: UNASSIGNED_SURFACE }));
    onChange(updateRoom(project, room.id, { assumption: false, edgeWalls }));
  };
  const setAssembly = (constructionId: string | null) => {
    if (sole) onChange(setInterfaceAssembly(project, sole.key, constructionId, assemblies));
    else onChange(setEdgeAssembly(project, room.id, edge, constructionId, assemblies));
  };
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">{room.name}</p>
        <h2>Wall {edge + 1}</h2>
      </header>
      <div className="stat-row">
        <span>{formatLength(lengthM, project.units, 2)}</span>
      </div>
      <PortionLines portions={edgePortions(room, edge, project.rooms)} units={project.units} />
      <section className="prop-block">
        <p className="prop-section">Size</p>
        <label className="field">
          <span>Kind</span>
          <select
            value={kind || 'custom'}
            onChange={event => {
              const type = WALL_TYPES.find(item => item.id === event.target.value);
              if (type) setAssembly(type.assemblyId);
            }}
          >
            {!kind && <option value="custom">Custom</option>}
            {WALL_TYPES.map(type => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <ComponentSelect
          label="Component"
          assemblies={assemblies}
          categories={assemblyCategoriesForFace('walls')}
          value={assignment.constructionId ?? null}
          onChange={setAssembly}
        />
      </section>
      <section className="prop-block">
        <p className="prop-section">Layers</p>
        <StackEditor
          layers={layers}
          materials={materials}
          series={findAssembly(assemblies, assignment.constructionId)?.series ?? true}
          units={project.units}
          onChange={next => write({ ...assignment, materialKey: null, layers: next })}
        />
        <TextField label="Note" value={assignment.note} onCommit={note => write({ ...assignment, note })} />
      </section>
    </div>
  );
}

function WallFaceFields({
  project,
  room,
  face,
  assignment,
  materials,
  assemblies,
  onChange,
  onSelect,
}: {
  project: Project;
  room: Room;
  face: WallFace;
  assignment: Room['surfaces']['walls'][WallFace];
  materials: ConstructionMaterial[];
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const unit = lengthUnit(project.units);
  const alongY = face === 'px' || face === 'nx';
  const lengthM = alongY ? room.widthM : room.lengthM;
  const openings = room.openings.filter(opening => opening.face === face);
  const children = interfacesOn(room, `f:${face}`, project.rooms);
  const sole = children.length === 1 ? children[0] : null;
  const stack = sole ? (project.interfaceWalls?.[sole.key] ?? { materialKey: null, constructionId: null, layers: [], note: UNASSIGNED_SURFACE }) : assignment;
  const layers = resolveStack(stack, assemblies, materials);
  const thickness = stackThicknessMm(layers, materials);
  const kind = WALL_TYPES.find(type => type.assemblyId === stack.constructionId)?.id ?? '';
  const parts = wallParts(room, `f:${face}`, project.rooms, openings);
  const openingPanel = (id: string) => (
    <OpeningFields key={id} project={project} roomId={room.id} openingId={id} materials={materials} assemblies={assemblies} onChange={onChange} onSelect={onSelect} />
  );
  if (children.length > 1) {
    return (
      <div className="interface-stack">
        {parts.map(part =>
          part.kind === 'interface' ? (
            <InterfaceFields key={part.key} project={project} interfaceKey={part.key} materials={materials} assemblies={assemblies} onChange={onChange} />
          ) : (
            openingPanel(part.id)
          ),
        )}
      </div>
    );
  }
  const setRoomLength = (display: number) => {
    const next = resizeSpan(room, alongY ? 'y' : 'x', lengthToM(display, project.units));
    onChange(updateRoom(project, room.id, { lengthM: next.lengthM, widthM: next.widthM, openings: next.openings, assumption: false }));
  };
  const writeStack = (next: typeof stack) => {
    if (sole) {
      onChange(updateInterfaceAssignment(project, sole.key, next));
      return;
    }
    onChange(
      updateRoom(project, room.id, {
        assumption: false,
        surfaces: { ...room.surfaces, walls: { ...room.surfaces.walls, [face]: next } },
      }),
    );
  };
  const setAssembly = (constructionId: string | null) => {
    if (sole) onChange(setInterfaceAssembly(project, sole.key, constructionId, assemblies));
    else onChange(setWallAssembly(project, room.id, face, constructionId, assemblies));
  };
  const wallPanel = (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Wall</p>
        <h2>{PLAN_SIDES[face].title} wall</h2>
      </header>
      <PortionLines portions={facePortions(room, face, project.rooms)} units={project.units} />
      <section className="prop-block">
        <p className="prop-section">Specs</p>
        <ConstructionSpecSummary
          layers={layers}
          materials={materials}
          series={findAssembly(assemblies, stack.constructionId)?.series ?? true}
          units={project.units}
          thicknessMm={thickness}
        />
      </section>
      <section className="prop-block">
        <p className="prop-section">Size</p>
        <UnitField label="Length" unit={unit} value={mToLength(lengthM, project.units)} onCommit={setRoomLength} />
        <UnitField label="Height" unit={unit} value={mToLength(room.heightM, project.units)} onCommit={value => onChange(updateRoom(project, room.id, { heightM: lengthToM(value, project.units), assumption: false }))} />
        <label className="field">
          <span>Kind</span>
          <select
            value={kind || 'custom'}
            onChange={event => {
              const type = WALL_TYPES.find(item => item.id === event.target.value);
              if (type) setAssembly(type.assemblyId);
            }}
          >
            {!kind && <option value="custom">Custom</option>}
            {WALL_TYPES.map(type => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <ComponentSelect
          label="Component"
          assemblies={assemblies}
          categories={assemblyCategoriesForFace('walls')}
          value={stack.constructionId ?? null}
          onChange={setAssembly}
        />
      </section>
      <section className="prop-block">
      <p className="prop-section">Layers</p>
      <StackEditor
        layers={layers}
        materials={materials}
        series={findAssembly(assemblies, assignment.constructionId)?.series ?? true}
        units={project.units}
        onChange={next => writeStack({ ...stack, materialKey: null, layers: next })}
      />
      <TextField label="Note" value={stack.note} onCommit={note => writeStack({ ...stack, note })} />
      </section>
      <section className="prop-block">
      <p className="prop-section">Openings{openings.length > 0 ? ` · ${openings.length}` : ''}</p>
      <div className="button-row">
        <button type="button" className="btn" onClick={() => onChange(updateRoom(project, room.id, addOpening(room, 'door', face)))}>
          Add door
        </button>
        <button type="button" className="btn" onClick={() => onChange(updateRoom(project, room.id, addOpening(room, 'window', face)))}>
          Add window
        </button>
      </div>
      </section>
    </div>
  );
  if (openings.length === 0) return wallPanel;
  return (
    <div className="interface-stack">
      {wallPanel}
      {parts.map(part => (part.kind === 'opening' ? openingPanel(part.id) : null))}
    </div>
  );
}

function InterfaceFields({
  project,
  interfaceKey,
  materials,
  assemblies,
  onChange,
}: {
  project: Project;
  interfaceKey: string;
  materials: ConstructionMaterial[];
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
}) {
  const hit = findInterface(project.rooms, interfaceKey);
  if (!hit) return <p>Interface not found.</p>;
  const assignment = project.interfaceWalls?.[hit.key] ?? { materialKey: null, constructionId: null, layers: [], note: UNASSIGNED_SURFACE };
  const layers = resolveStack(assignment, assemblies, materials);
  const thickness = stackThicknessMm(layers, materials);
  const kind = WALL_TYPES.find(type => type.assemblyId === assignment.constructionId)?.id ?? '';
  const write = (next: typeof assignment) => onChange(updateInterfaceAssignment(project, hit.key, next));
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">{hit.names.join(' · ')}</p>
        <h2>Interface</h2>
      </header>
      <div className="stat-row">
        <span>{formatLength(hit.lengthM, project.units, 2)}</span>
      </div>
      <section className="prop-block">
        <p className="prop-section">Specs</p>
        <ConstructionSpecSummary
          layers={layers}
          materials={materials}
          series={findAssembly(assemblies, assignment.constructionId)?.series ?? true}
          units={project.units}
          thicknessMm={thickness}
        />
      </section>
      <section className="prop-block">
        <p className="prop-section">Construction</p>
        <label className="field">
          <span>Kind</span>
          <select
            value={kind || 'custom'}
            onChange={event => {
              const type = WALL_TYPES.find(item => item.id === event.target.value);
              if (type) onChange(setInterfaceAssembly(project, hit.key, type.assemblyId, assemblies));
            }}
          >
            {!kind && <option value="custom">Custom</option>}
            {WALL_TYPES.map(type => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <ComponentSelect
          label="Component"
          assemblies={assemblies}
          categories={assemblyCategoriesForFace('walls')}
          value={assignment.constructionId ?? null}
          onChange={constructionId => onChange(setInterfaceAssembly(project, hit.key, constructionId, assemblies))}
        />
      </section>
      <section className="prop-block">
        <p className="prop-section">Layers</p>
        <StackEditor
          layers={layers}
          materials={materials}
          series={findAssembly(assemblies, assignment.constructionId)?.series ?? true}
          units={project.units}
          onChange={next => write({ ...assignment, materialKey: null, layers: next })}
        />
        <TextField label="Note" value={assignment.note} onCommit={note => write({ ...assignment, note })} />
      </section>
    </div>
  );
}

function InterfaceStack({
  project,
  children,
  materials,
  assemblies,
  onChange,
}: {
  project: Project;
  children: readonly InterfaceTarget[];
  materials: ConstructionMaterial[];
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
}) {
  return (
    <div className="interface-stack">
      {children.map(target => (
        <InterfaceFields key={target.key} project={project} interfaceKey={target.key} materials={materials} assemblies={assemblies} onChange={onChange} />
      ))}
    </div>
  );
}

function SurfaceFields({
  project,
  roomId,
  face,
  wallFace,
  edge,
  materials,
  assemblies,
  onChange,
  onSelect,
}: {
  project: Project;
  roomId: string;
  face: SurfaceFace;
  wallFace?: WallFace;
  edge?: number;
  materials: ConstructionMaterial[];
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const room = project.rooms.find(item => item.id === roomId);
  if (!room) return <p>Surface not found.</p>;
  const assignment = face === 'walls' ? (wallFace ? room.surfaces.walls[wallFace] : null) : room.surfaces[face];
  const faceLabel = SURFACE_FACES.find(item => item.id === face)?.label ?? face;
  const writeSurface = (next: typeof assignment) => {
    if (!next) return project;
    if (face === 'walls') {
      if (!wallFace) return project;
      return updateRoom(project, room.id, {
        assumption: false,
        surfaces: { ...room.surfaces, walls: { ...room.surfaces.walls, [wallFace]: next } },
      });
    }
    return updateRoom(project, room.id, {
      assumption: false,
      surfaces: { ...room.surfaces, [face]: next },
    });
  };
  if (face === 'walls' && edge != null && room.outline && edge >= 0 && edge < room.outline.length) {
    return (
      <EdgeWallFields
        project={project}
        room={room}
        edge={edge}
        materials={materials}
        assemblies={assemblies}
        onChange={onChange}
      />
    );
  }
  if (face === 'walls' && wallFace && assignment) {
    return (
      <WallFaceFields
        project={project}
        room={room}
        face={wallFace}
        assignment={assignment}
        materials={materials}
        assemblies={assemblies}
        onChange={onChange}
        onSelect={onSelect}
      />
    );
  }
  const surfaceLayers = assignment ? resolveStack(assignment, assemblies, materials) : [];
  const surfaceSeries = assignment ? findAssembly(assemblies, assignment.constructionId)?.series ?? true : true;
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">{room.name}</p>
        <h2>{faceLabel}</h2>
      </header>
      {assignment && (
        <section className="prop-block">
          <p className="prop-section">Specs</p>
          <ConstructionSpecSummary
            layers={surfaceLayers}
            materials={materials}
            series={surfaceSeries}
            units={project.units}
            thicknessMm={stackThicknessMm(surfaceLayers, materials)}
          />
        </section>
      )}
      {assignment && (
      <ComponentSelect
        label={face === 'walls' ? 'Library component' : 'Component'}
        assemblies={assemblies}
        categories={assemblyCategoriesForFace(face)}
        value={assignment.constructionId ?? null}
        onChange={constructionId =>
          onChange(
            face === 'walls' && wallFace
              ? setWallAssembly(project, room.id, wallFace, constructionId, assemblies)
              : assignSurface(project, room, face === 'ceiling' ? 'ceiling' : 'floor', constructionId, assemblies)
          )
        }
      />
      )}
      {assignment && (
      <StackEditor
        layers={surfaceLayers}
        materials={materials}
        series={surfaceSeries}
        units={project.units}
        onChange={layers => onChange(writeSurface({ ...assignment, materialKey: null, layers }))}
      />
      )}
      {assignment && (
      <TextField
        label="Note"
        value={assignment.note}
        onCommit={note => onChange(writeSurface({ ...assignment, note }))}
      />
      )}
    </div>
  );
}

function RoomFields({
  project,
  roomId,
  assemblies,
  onChange,
  onSelect,
  nameFocus,
}: {
  project: Project;
  roomId: string;
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
  nameFocus: number;
}) {
  const room = project.rooms.find(item => item.id === roomId);
  if (!room) return <p>Space not found.</p>;
  const unit = lengthUnit(project.units);
  const shaped = (room.outline?.length ?? 0) >= 3;
  const setLength = (key: 'xM' | 'yM' | 'zM' | 'lengthM' | 'widthM' | 'heightM', display: number) => {
    const meters = lengthToM(display, project.units);
    if (key === 'lengthM' || key === 'widthM') {
      const next = resizeSpan(room, key === 'lengthM' ? 'x' : 'y', meters);
      onChange(updateRoom(project, room.id, { lengthM: next.lengthM, widthM: next.widthM, openings: next.openings, assumption: false }));
      return;
    }
    onChange(updateRoom(project, room.id, { [key]: meters, assumption: false }));
  };
  const setSurface = (face: 'floor' | 'ceiling', constructionId: string | null) => {
    onChange(assignSurface(project, room, face, constructionId, assemblies));
  };
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Space</p>
        <h2>{room.name}</h2>
      </header>
      <div className="stat-row">
        <span>{formatArea(shaped ? polygonArea(room.outline ?? []) : room.lengthM * room.widthM, project.units)}</span>
        <span>
          {shaped ? `${room.outline?.length ?? 0} corners` : `${formatLength(room.lengthM, project.units, 2)} × ${formatLength(room.widthM, project.units, 2)}`}
        </span>
        <span>
          {room.openings.length} opening{room.openings.length === 1 ? '' : 's'}
        </span>
      </div>
      <TextField label="Name" value={room.name} focusToken={nameFocus} onCommit={name => onChange(updateRoom(project, room.id, { name, assumption: false }))} />
      <label className="field">
        <span>Use</span>
        <select value={room.use} onChange={event => onChange(updateRoom(project, room.id, { use: event.target.value, assumption: false }))}>
          {ROOM_USES.map(use => (
            <option key={use}>{use}</option>
          ))}
          {!ROOM_USES.includes(room.use as (typeof ROOM_USES)[number]) && <option>{room.use}</option>}
        </select>
      </label>
      <section className="prop-block">
      <p className="prop-section">Size</p>
      {shaped ? (
        <div className="field-grid">
          <UnitField label="Height" unit={unit} value={mToLength(room.heightM, project.units)} onCommit={value => setLength('heightM', value)} />
          <UnitField label="Floor Z" unit={unit} value={mToLength(room.zM, project.units)} onCommit={value => setLength('zM', value)} />
        </div>
      ) : (
        <div className="field-grid">
          <UnitField label="Length" unit={unit} value={mToLength(room.lengthM, project.units)} onCommit={value => setLength('lengthM', value)} />
          <UnitField label="Width" unit={unit} value={mToLength(room.widthM, project.units)} onCommit={value => setLength('widthM', value)} />
          <UnitField label="Height" unit={unit} value={mToLength(room.heightM, project.units)} onCommit={value => setLength('heightM', value)} />
          <UnitField label="Origin X" unit={unit} value={mToLength(room.xM, project.units)} onCommit={value => setLength('xM', value)} />
          <UnitField label="Origin Y" unit={unit} value={mToLength(room.yM, project.units)} onCommit={value => setLength('yM', value)} />
          <UnitField label="Floor Z" unit={unit} value={mToLength(room.zM, project.units)} onCommit={value => setLength('zM', value)} />
        </div>
      )}
      </section>
      <section className="prop-block">
      <p className="prop-section">Finishes</p>
      {(['floor', 'ceiling'] as const).map(face => {
        const assignment = room.surfaces[face];
        const label = face === 'floor' ? 'Floor' : 'Ceiling';
        return (
          <ComponentSelect
            key={face}
            label={label}
            assemblies={assemblies}
            categories={assemblyCategoriesForFace(face)}
            value={assignment.constructionId ?? null}
            onChange={constructionId => setSurface(face, constructionId)}
          />
        );
      })}
      </section>
      <RoomLoadsBlock project={project} roomId={room.id} onSelect={onSelect} />
      <div className="button-row">
        <button type="button" className="btn" onClick={() => onChange(duplicateRoom(project, room.id))}>
          Duplicate
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            onChange(removeRoom(project, room.id));
            onSelect({ kind: 'project' });
          }}
        >
          Remove space
        </button>
      </div>
    </div>
  );
}

function OpeningFields({
  project,
  roomId,
  openingId,
  materials,
  assemblies,
  onChange,
  onSelect,
}: {
  project: Project;
  roomId: string;
  openingId: string;
  materials: ConstructionMaterial[];
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const room = project.rooms.find(item => item.id === roomId);
  const opening = room?.openings.find(item => item.id === openingId);
  if (!room || !opening) return <p>Opening not found.</p>;
  const unit = lengthUnit(project.units);
  const direction = opening.kind === 'door' ? doorDirection(project.rooms, room, opening) : null;
  const hingeNames = direction ? hingeEnds(direction.face) : null;
  const patch = (partial: Partial<typeof opening>) => {
    onChange(
      updateRoom(project, room.id, {
        openings: room.openings.map(item => (item.id === opening.id ? { ...item, ...partial } : item)),
      })
    );
  };
  const asLength = (meters: number) => mToLength(meters, project.units);
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">{room.name} · {PLAN_SIDES[opening.face].title}</p>
        <h2>{opening.kind}</h2>
      </header>
      {opening.kind !== 'opening' && (
        <>
          <ComponentSelect
            label="Component"
            assemblies={assemblies}
            categories={assemblyCategoriesForOpening(opening.kind)}
            value={opening.constructionId ?? null}
            onChange={constructionId => {
              const assembly = findAssembly(assemblies, constructionId);
              patch({ constructionId, layers: assembly ? assembly.layers.map(layer => ({ ...layer })) : [] });
            }}
          />
          <StackEditor
            layers={resolveStack(opening, assemblies, materials)}
            materials={materials}
            series={findAssembly(assemblies, opening.constructionId)?.series ?? true}
            units={project.units}
            onChange={layers => patch({ layers })}
          />
        </>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => onSelect({ kind: 'surface', roomId: room.id, face: 'walls', wallFace: opening.face })}
      >
        Edit this wall
      </button>
      <label className="field">
        <span>Kind</span>
        <select value={opening.kind} onChange={event => patch({ kind: event.target.value as OpeningKind })}>
          <option value="door">Door</option>
          <option value="window">Window</option>
          <option value="opening">Opening</option>
        </select>
      </label>
      {direction && hingeNames && (
        <>
          <label className="field">
            <span>Opens into</span>
            <select
              value={direction.into}
              onChange={event => onChange(setDoorDirection(project, room.id, opening.id, { into: event.target.value, hinge: direction.hinge }))}
            >
              {direction.choices.map(choice => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Hinge</span>
            <select
              value={direction.hinge}
              onChange={event => onChange(setDoorDirection(project, room.id, opening.id, { into: direction.into, hinge: event.target.value as DoorHinge }))}
            >
              <option value="start">{hingeNames.start}</option>
              <option value="end">{hingeNames.end}</option>
            </select>
          </label>
        </>
      )}
      <label className="field">
        <span>Wall</span>
        <select
          value={opening.face}
          onChange={event => {
            const face = event.target.value as typeof opening.face;
            const span = face === 'px' || face === 'nx' ? room.widthM : room.lengthM;
            const obstacles = room.openings.filter(item => item.id !== opening.id && item.face === face);
            const offsetM = placeBeside(opening.offsetM, opening.widthM, span, obstacles);
            if (offsetM === null) return;
            patch({ face, offsetM });
          }}
        >
          {WALL_FACES.map(face => (
            <option key={face.id} value={face.id}>
              {wallPlaceLabel(room, face.id, project.rooms)}
            </option>
          ))}
        </select>
      </label>
      <UnitField
        label="Offset"
        unit={unit}
        value={asLength(opening.offsetM)}
        onCommit={value => patch({ offsetM: slideOpeningOffset(room, opening.id, lengthToM(value, project.units)) })}
      />
      <UnitField
        label="Width"
        unit={unit}
        value={asLength(opening.widthM)}
        onCommit={value => {
          const widthM = Math.max(0, lengthToM(value, project.units));
          const span = opening.face === 'px' || opening.face === 'nx' ? room.widthM : room.lengthM;
          const obstacles = room.openings.filter(item => item.id !== opening.id && item.face === opening.face);
          const offsetM = placeBeside(opening.offsetM, widthM, span, obstacles);
          if (offsetM === null) return;
          patch({ widthM, offsetM });
        }}
      />
      <UnitField label="Height" unit={unit} value={asLength(opening.heightM)} onCommit={value => patch({ heightM: lengthToM(value, project.units) })} />
      <UnitField label="Sill" unit={unit} value={asLength(opening.sillM)} onCommit={value => patch({ sillM: lengthToM(value, project.units) })} />
      <button
        type="button"
        className="btn danger"
        onClick={() => {
          onChange(updateRoom(project, room.id, { openings: room.openings.filter(item => item.id !== opening.id) }));
          onSelect({ kind: 'room', id: room.id });
        }}
      >
        Remove opening
      </button>
    </div>
  );
}

function SystemFields({
  project,
  systemId,
  onChange,
  onSelect,
  nameFocus,
}: {
  project: Project;
  systemId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
  nameFocus: number;
}) {
  const system = project.systems.find(item => item.id === systemId);
  if (!system) return <p>System not found.</p>;
  const members = project.equipment.filter(item => item.systemId === system.id);
  let airflowM3s = 0;
  let coolingW = 0;
  let heatingW = 0;
  let hasAirflow = false;
  let hasCooling = false;
  let hasHeating = false;
  for (const item of members) {
    const product = getProduct(item.catalogId);
    if (!product) continue;
    if (product.airflow) {
      airflowM3s += product.airflow.valueM3s * item.quantity;
      hasAirflow = true;
    }
    if (product.cooling) {
      coolingW += product.cooling.valueW * item.quantity;
      hasCooling = true;
    }
    if (product.heating) {
      heatingW += product.heating.valueW * item.quantity;
      hasHeating = true;
    }
  }
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">System</p>
        <h2>{system.name}</h2>
      </header>
      <TextField label="Name" value={system.name} focusToken={nameFocus} onCommit={name => onChange(updateSystem(project, system.id, { name }))} />
      <label className="field">
        <span>Kind</span>
        <select
          value={system.kind}
          onChange={event => onChange(updateSystem(project, system.id, { kind: event.target.value as typeof system.kind }))}
        >
          {SYSTEM_KINDS.map(kind => (
            <option key={kind.id} value={kind.id}>
              {kind.label}
            </option>
          ))}
        </select>
      </label>
      <dl className="spec-list">
        <div>
          <dt>Equipment</dt>
          <dd>{members.length}</dd>
        </div>
        <div>
          <dt>Airflow</dt>
          <dd>{hasAirflow ? formatFlow(airflowM3s, project.units) : 'Not stated'}</dd>
        </div>
        <div>
          <dt>Cooling</dt>
          <dd>{hasCooling ? formatPower(coolingW, project.units) : 'Not stated'}</dd>
        </div>
        <div>
          <dt>Heating</dt>
          <dd>{hasHeating ? formatPower(heatingW, project.units) : 'Not stated'}</dd>
        </div>
      </dl>
      <TextField label="Notes" value={system.notes} multiline onCommit={notes => onChange(updateSystem(project, system.id, { notes }))} />
      <ul className="plain-list">
        {members.map(item => {
          const product = getProduct(item.catalogId);
          const bits = [
            product?.airflow?.stated,
            product?.cooling ? `${product.cooling.stated} cool` : null,
            product?.heating ? `${product.heating.stated} heat` : null,
          ].filter(Boolean);
          return (
            <li key={item.id}>
              <button type="button" className="linkish" onClick={() => onSelect({ kind: 'equipment', id: item.id })}>
                {product ? `${product.manufacturer} ${product.model}` : item.catalogId} × {item.quantity}
                {bits.length > 0 ? ` · ${bits.join(' · ')}` : ''}
              </button>
            </li>
          );
        })}
        {members.length === 0 && <li className="muted">No equipment assigned.</li>}
      </ul>
      <button
        type="button"
        className="btn danger"
        onClick={() => {
          onChange(removeSystem(project, system.id));
          onSelect({ kind: 'project' });
        }}
      >
        Remove system
      </button>
    </div>
  );
}

function productSpecRows(product: CatalogProduct, units: Project['units']): { label: string; value: string }[] {
  const cooling = product.cooling
    ? `${product.cooling.stated} · ${formatPower(product.cooling.valueW, units)}`
    : 'Not stated';
  const heating = product.heating
    ? `${product.heating.stated} · ${formatPower(product.heating.valueW, units)}`
    : 'Not stated';
  return [
    { label: 'Manufacturer', value: product.manufacturer },
    { label: 'Model', value: product.model },
    { label: 'Category', value: CATEGORY_LABEL[product.category] },
    { label: 'Supplier', value: product.supplier },
    { label: 'Mount', value: product.mount },
    { label: 'Airflow', value: product.airflow ? `${product.airflow.stated} · ${formatFlow(product.airflow.valueM3s, units)}` : 'Not stated' },
    { label: 'Cooling', value: cooling },
    { label: 'Heating', value: heating },
    {
      label: 'Dimensions',
      value: product.dimensions
        ? `${product.dimensions.stated} · ${formatLength(product.dimensions.lengthM, units, 2)} × ${formatLength(product.dimensions.widthM, units, 2)} × ${formatLength(product.dimensions.heightM, units, 2)}`
        : 'Not stated (0.6 m marker)',
    },
    { label: 'Electrical', value: product.electrical ?? 'Not stated' },
    { label: 'Connections', value: product.connections ?? 'Not stated' },
    { label: 'Document', value: product.documentUrl ?? 'None' },
  ];
}

function EquipmentFields({
  project,
  equipmentId,
  onChange,
  onSelect,
}: {
  project: Project;
  equipmentId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const item = project.equipment.find(entry => entry.id === equipmentId);
  if (!item) return <p>Equipment not found.</p>;
  const product = getProduct(item.catalogId);
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Equipment</p>
        <h2>{product ? product.name : 'Missing product'}</h2>
      </header>
      {product && (
        <dl className="spec-list">
          {productSpecRows(product, project.units).map(row => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
          {product.gaps.length > 0 && (
            <div>
              <dt>Gaps</dt>
              <dd>{product.gaps.join(' ')}</dd>
            </div>
          )}
        </dl>
      )}
      <label className="field">
        <span>Space</span>
        <select value={item.roomId ?? ''} onChange={event => onChange(assignEquipmentRoom(project, item.id, event.target.value || null))}>
          <option value="">Unassigned</option>
          {project.rooms.map(room => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>System</span>
        <select
          value={item.systemId ?? ''}
          onChange={event => onChange(updateEquipment(project, item.id, { systemId: event.target.value || null }))}
        >
          <option value="">Unassigned</option>
          {project.systems.map(system => (
            <option key={system.id} value={system.id}>
              {system.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Quantity</span>
        <input
          key={`${item.id}-${item.quantity}`}
          inputMode="numeric"
          defaultValue={item.quantity}
          onBlur={event => {
            const quantity = Number(event.target.value);
            if (Number.isInteger(quantity) && quantity >= 1) onChange(updateEquipment(project, item.id, { quantity }));
            else event.target.value = String(item.quantity);
          }}
        />
      </label>
      <TextField label="Notes" value={item.notes} multiline onCommit={notes => onChange(updateEquipment(project, item.id, { notes }))} />
      <p className="muted">Move and rotate on the plan. Drag the rotate handle on a selected unit.</p>
      <div className="button-row">
        <button type="button" className="btn" onClick={() => onChange(duplicateEquipment(project, item.id))}>
          Duplicate
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            onChange(removeEquipment(project, item.id));
            onSelect({ kind: 'project' });
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function DuctFields({
  project,
  ductId,
  onChange,
  onSelect,
}: {
  project: Project;
  ductId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const run = (project.ducts ?? []).find(item => item.id === ductId);
  if (!run) return <p className="muted">Duct not found.</p>;
  const ductProduct = getDuctProduct(run.catalogId);
  const allowedSystems = ductProduct ? systemsForProduct(ductProduct, project.systems) : project.systems;
  const systems = allowedSystems.some(item => item.id === run.systemId) ? allowedSystems : project.systems.filter(item => item.id === run.systemId || allowedSystems.includes(item));
  const system = project.systems.find(item => item.id === run.systemId);
  const services = ductProduct && system ? servicesFor(ductProduct, system.kind) : DUCT_SERVICES.map(item => item.id);
  const stream = system ? streamFor(system.kind, run.service) : null;
  const unit = lengthUnit(project.units);
  const view = ductViewOf(run);
  const start = linkedPort(project, run.start, view);
  const end = linkedPort(project, run.end, view);
  const crossings = view === 'plan' ? ductCrossings(run.points, project.rooms, project.wallRuns ?? []).length : 0;
  const design = run.streamDesign ?? { flowM3s: null, dbC: null, wbC: null, rh: null };
  const setDesign = (patch: Partial<typeof design>) => {
    const next = { ...design, ...patch };
    const empty = next.flowM3s == null && next.dbC == null && next.wbC == null && next.rh == null;
    onChange(updateDuct(project, run.id, { streamDesign: empty ? undefined : next }));
  };
  const endLabel = (which: 'start' | 'end') => {
    const link = which === 'start' ? start : end;
    if (!link) return 'Open end';
    const item = project.equipment.find(entry => entry.id === link.equipmentId);
    const product = item ? getProduct(item.catalogId) : undefined;
    const rise = endRise(project, run, which);
    const riser = Math.abs(rise) > 0.05 ? ` · riser ${formatLength(Math.abs(rise), project.units, 2)}` : '';
    return `${product?.model ?? 'Equipment'} ${link.portId}${riser}`;
  };
  const setWidth = (text: string) => {
    const meters = lengthToM(Number(text), project.units);
    if (meters > 0.05) onChange(updateDuct(project, run.id, { widthM: meters }));
  };
  const setHeight = (text: string) => {
    const meters = lengthToM(Number(text), project.units);
    if (meters > 0.05) onChange(updateDuct(project, run.id, { heightM: meters }));
  };
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">
          {stream && <span className="duct-swatch" style={{ background: stream.color }} />}
          {stream?.label ?? 'Duct'}
        </p>
        <h2>{ductProduct ? `${ductProduct.manufacturer} ${ductProduct.model}` : 'Uncatalogued duct'}</h2>
      </header>
      <div className="stat-row">
        <span>{formatLength(polylineLength(run.points), project.units, 2)}</span>
        <span>{ductSizeLabel(run, project.units)}</span>
        <span>
          {crossings} wall crossing{crossings === 1 ? '' : 's'}
        </span>
      </div>
      <section className="prop-block">
      <p className="prop-section">Routing</p>
      <label className="field">
        <span>System</span>
        <select
          value={run.systemId}
          onChange={event => {
            const next = project.systems.find(item => item.id === event.target.value);
            const nextService = ductProduct && next ? servicesFor(ductProduct, next.kind)[0] : undefined;
            onChange(updateDuct(project, run.id, { systemId: event.target.value, ...(nextService ? { service: nextService } : {}) }));
          }}
        >
          {systems.map(item => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Stream</span>
        <select value={run.service} onChange={event => onChange(updateDuct(project, run.id, { service: event.target.value as DuctService }))}>
          {services.map(service => (
            <option key={service} value={service}>{system ? streamFor(system.kind, service)?.label ?? service : service}</option>
          ))}
        </select>
      </label>
      </section>
      <section className="prop-block">
      <p className="prop-section">Size and elevation</p>
      {ductProduct?.sizes ? (
        <label className="field">
          <span>Diameter</span>
          <select
            value={ductProduct.sizes.find(size => Math.abs(size.widthM - run.widthM) < 0.002)?.id ?? ductProduct.sizes[0]?.id}
            onChange={event => {
              const size = ductProduct.sizes?.find(item => item.id === event.target.value);
              if (size) onChange(updateDuct(project, run.id, { shape: 'round', widthM: size.widthM, heightM: null }));
            }}
          >
            {ductProduct.sizes.map(size => (
              <option key={size.id} value={size.id}>{size.label}</option>
            ))}
          </select>
        </label>
      ) : (
      <label className="field">
        <span>{run.shape === 'round' ? 'Diameter' : 'Width'} ({unit})</span>
        <input key={`w-${run.widthM}`} defaultValue={formatNumber(mToLength(run.widthM, project.units), 2)} inputMode="decimal" onBlur={event => setWidth(event.target.value)} />
      </label>
      )}
      {run.shape === 'rect' && !ductProduct?.sizes && (
        <label className="field">
          <span>Height ({unit})</span>
          <input key={`h-${run.heightM}`} defaultValue={formatNumber(mToLength(run.heightM ?? run.widthM, project.units), 2)} inputMode="decimal" onBlur={event => setHeight(event.target.value)} />
        </label>
      )}
      <label className="field">
        <span>Elevation ({unit})</span>
        <input
          key={`z-${run.zM}`}
          defaultValue={formatNumber(mToLength(run.zM, project.units), 2)}
          inputMode="decimal"
          onBlur={event => {
            const meters = lengthToM(Number(event.target.value), project.units);
            if (Number.isFinite(meters)) onChange(updateDuct(project, run.id, { zM: meters }));
          }}
        />
      </label>
      </section>
      <section className="prop-block">
        <p className="prop-section">Stream design</p>
        <p className="muted">Labels only. ThermoNode solve is not wired yet.</p>
        <label className="field">
          <span>{project.units === 'IP' ? 'Flow (CFM)' : 'Flow (L/s)'}</span>
          <input
            key={`flow-${run.id}-${design.flowM3s}`}
            defaultValue={design.flowM3s == null ? '' : formatNumber(project.units === 'IP' ? design.flowM3s / M3S_PER_CFM : design.flowM3s * 1000, 0)}
            inputMode="decimal"
            onBlur={event => {
              const raw = event.target.value.trim();
              if (!raw) {
                setDesign({ flowM3s: null });
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              setDesign({ flowM3s: project.units === 'IP' ? n * M3S_PER_CFM : n / 1000 });
            }}
          />
        </label>
        <label className="field">
          <span>Dry bulb (°C)</span>
          <input
            key={`db-${run.id}-${design.dbC}`}
            defaultValue={design.dbC == null ? '' : formatNumber(design.dbC, 1)}
            inputMode="decimal"
            onBlur={event => {
              const raw = event.target.value.trim();
              setDesign({ dbC: raw ? Number(raw) : null });
            }}
          />
        </label>
        <label className="field">
          <span>Wet bulb (°C)</span>
          <input
            key={`wb-${run.id}-${design.wbC}`}
            defaultValue={design.wbC == null ? '' : formatNumber(design.wbC, 1)}
            inputMode="decimal"
            onBlur={event => {
              const raw = event.target.value.trim();
              setDesign({ wbC: raw ? Number(raw) : null });
            }}
          />
        </label>
        <label className="field">
          <span>RH (%)</span>
          <input
            key={`rh-${run.id}-${design.rh}`}
            defaultValue={design.rh == null ? '' : formatNumber(design.rh * 100, 0)}
            inputMode="decimal"
            onBlur={event => {
              const raw = event.target.value.trim();
              if (!raw) {
                setDesign({ rh: null });
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              setDesign({ rh: n / 100 });
            }}
          />
        </label>
        <p className="muted">View: {view === 'schematic' ? 'Schematic' : 'Plan'}</p>
      </section>
      <section className="prop-block">
        <p className="prop-section">Connections</p>
        <dl className="spec-list">
          <div>
            <dt>Start</dt>
            <dd>{endLabel('start')}</dd>
          </div>
          <div>
            <dt>End</dt>
            <dd>{endLabel('end')}</dd>
          </div>
          {ductProduct && (
            <div>
              <dt>Roughness</dt>
              <dd>
                {roughnessLabel(ductProduct)}. {ductProduct.roughnessNote}
              </dd>
            </div>
          )}
        </dl>
      </section>
      <div className="button-row">
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            onChange(removeDuct(project, run.id));
            onSelect({ kind: 'project' });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function WallRunFields({
  project,
  wallId,
  onChange,
  onSelect,
}: {
  project: Project;
  wallId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const run = (project.wallRuns ?? []).find(item => item.id === wallId);
  if (!run) return <p className="muted">Wall not found.</p>;
  const length = Math.hypot(run.x1 - run.x0, run.y1 - run.y0);
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Wall</p>
        <h2>Wall run</h2>
      </header>
      <div className="stat-row">
        <span>{formatLength(length, project.units, 2)}</span>
        <span>
          {run.openings.length} opening{run.openings.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="muted">To make a space, draw walls with the Wall tool and click the first point to close the loop.</p>
      <div className="button-row">
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            onChange(removeWallRun(project, run.id));
            onSelect({ kind: 'project' });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function WallOpeningFields({
  project,
  wallId,
  openingId,
  onChange,
  onSelect,
}: {
  project: Project;
  wallId: string;
  openingId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const run = (project.wallRuns ?? []).find(item => item.id === wallId);
  const opening = run?.openings.find(item => item.id === openingId);
  if (!run || !opening) return <p className="muted">Opening not found.</p>;
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Wall opening</p>
        <h2>{opening.kind === 'door' ? 'Door' : 'Window'}</h2>
      </header>
      <div className="stat-row">
        <span>{formatLength(opening.widthM, project.units, 2)} wide</span>
        <span>{formatLength(opening.offsetM, project.units, 2)} from start</span>
      </div>
      <div className="button-row">
        <button type="button" className="btn" onClick={() => onSelect({ kind: 'wallRun', id: run.id })}>
          Select wall
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            onChange(removeWallRunOpening(project, run.id, opening.id));
            onSelect({ kind: 'wallRun', id: run.id });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

const LOAD_SOURCE_LABEL: Record<'ashrae' | LoadOverride['source'], string> = {
  ashrae: 'ASHRAE default',
  manufacturer: 'Manufacturer',
  manual: 'Manual',
};

function OverrideField({
  label,
  unit,
  value,
  fallback,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number | null;
  fallback: string;
  onCommit: (value: number | null) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="unit-input">
        <input
          key={`${label}-${value}`}
          inputMode="decimal"
          defaultValue={value == null ? '' : formatNumber(value, 4)}
          placeholder={fallback}
          onBlur={event => {
            const text = event.currentTarget.value.trim();
            if (text === '') {
              if (value != null) onCommit(null);
              return;
            }
            const next = Number(text);
            if (Number.isFinite(next) && next >= 0) onCommit(next);
            else event.currentTarget.value = value == null ? '' : formatNumber(value, 4);
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <em>{unit}</em>
      </span>
    </label>
  );
}

function LoadTotalsList({ totals, units }: { totals: Omit<LoadTotals, 'count'>; units: Project['units'] }) {
  return (
    <dl className="spec-list">
      <div>
        <dt>Sensible</dt>
        <dd>{formatPower(totals.sensibleW, units)}</dd>
      </div>
      <div>
        <dt>Latent</dt>
        <dd>{formatPower(totals.latentW, units)}</dd>
      </div>
      <div>
        <dt>Moisture</dt>
        <dd>{formatNumber(totals.moistureGh / 1000, 3)} kg/h</dd>
      </div>
      <div>
        <dt>CO₂</dt>
        <dd>{formatNumber(totals.co2Ls, 4)} L/s</dd>
      </div>
      <div>
        <dt>CO</dt>
        <dd>{totals.coMgS == null ? 'Not entered' : `${formatNumber(totals.coMgS, 3)} mg/s`}</dd>
      </div>
    </dl>
  );
}

function RoomLoadsBlock({ project, roomId, onSelect }: { project: Project; roomId: string; onSelect: (selection: Selection) => void }) {
  const items = roomLoads(project, roomId);
  return (
    <section className="prop-block">
      <p className="prop-section">Internal loads</p>
      {items.length === 0 ? (
        <p className="muted">No loads yet. Add people, appliances, lighting, and plug loads in the Loads step.</p>
      ) : (
        <>
          <LoadTotalsList totals={sumLoads(project, items)} units={project.units} />
          <ul className="prop-links">
            {items.map(item => {
              const gains = loadGains(project, item);
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => onSelect({ kind: 'load', id: item.id })}>
                    <span>{loadLabel(item, getLoadProduct(item.loadId))}</span>
                    <span className="muted">{gains ? formatPower(gains.sensibleW + gains.latentW, project.units) : 'Missing'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function SizeField({
  label,
  meters,
  units,
  onCommit,
}: {
  label: string;
  meters: number | null;
  units: Project['units'];
  onCommit: (meters: number | null) => void;
}) {
  const shown = meters == null ? '' : formatNumber(mToLength(meters, units), 2);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="unit-input">
        <input
          key={`${label}-${shown}`}
          inputMode="decimal"
          defaultValue={shown}
          placeholder="Not stated"
          onBlur={event => {
            const text = event.currentTarget.value.trim();
            if (text === '') {
              if (meters != null) onCommit(null);
              return;
            }
            const next = lengthToM(Number(text), units);
            if (Number.isFinite(next) && next >= 0.05) onCommit(next);
            else event.currentTarget.value = shown;
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <em>{lengthUnit(units)}</em>
      </span>
    </label>
  );
}

function LoadFields({
  project,
  loadId,
  onChange,
  onSelect,
}: {
  project: Project;
  loadId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const item = (project.loads ?? []).find(entry => entry.id === loadId);
  if (!item) return <p className="muted">Load not found.</p>;
  const product = getLoadProduct(item.loadId);
  const gains = loadGains(project, item);
  const room = project.rooms.find(entry => entry.id === item.roomId);
  const remove = () => {
    onChange(removeLoad(project, item.id));
    onSelect(room ? { kind: 'room', id: room.id } : { kind: 'project' });
  };
  if (!product || !gains) {
    return (
      <div className="stack props">
        <header className="prop-head">
          <p className="prop-kicker">Load</p>
          <h2>Missing catalog item</h2>
        </header>
        <p className="muted">{item.loadId} is no longer in the load catalog.</p>
        <div className="button-row">
          <button type="button" className="btn danger" onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    );
  }
  const units = project.units;
  const gain = gainUnit(product.basis, units);
  const show = (watts: number) => formatNumber(watts * gain.factor, 1);
  const override = item.override;
  const patchOverride = (patch: Partial<LoadOverride>) =>
    onChange(updateLoad(project, item.id, { override: { ...(override ?? blankOverride('manual')), ...patch } }));
  const setSource = (source: 'ashrae' | LoadOverride['source']) => {
    if (source === 'ashrae') onChange(updateLoad(project, item.id, { override: null }));
    else patchOverride({ source });
  };
  const hood = product.category === 'cooking' && product.hooded ? hoodOver(project, item) : null;
  const hoodProduct = hood ? getProduct(hood.catalogId) : undefined;
  const defaultCo2 = gains.multiplier > 0 && override?.co2Ls == null ? gains.co2Ls / gains.multiplier : null;
  const per = basisLabel(product.basis);
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">{LOAD_CATEGORY_LABEL[product.category]} load</p>
        <h2>{loadLabel(item, product)}</h2>
      </header>
      <div className="stat-row">
        <span>{formatPower(gains.sensibleW, units)} sensible</span>
        <span>{formatPower(gains.latentW, units)} latent</span>
        <span>{LOAD_SOURCE_LABEL[gains.source]}</span>
      </div>
      <section className="prop-block">
        <p className="prop-section">Item</p>
        <label className="field">
          <span>Type</span>
          <select
            value={product.id}
            onChange={event => {
              const next = getLoadProduct(event.target.value);
              onChange(updateLoad(project, item.id, {
                loadId: event.target.value,
                override: null,
                yawDeg: 0,
                lengthM: next?.size?.lengthM ?? null,
                widthM: next?.size?.widthM ?? null,
                heightM: next?.size?.heightM ?? null,
              }));
            }}
          >
            {loadGroups(product.category).map(group => (
              <optgroup key={group.group} label={group.group}>
                {group.items.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {product.basis === 'area' ? (
          <p className="muted">Applies to the whole space{room ? `: ${formatArea(roomAreaM2(room), units)}` : ''}.</p>
        ) : (
          <label className="field">
            <span>{product.basis === 'person' ? 'People' : 'Quantity'}</span>
            <input
              key={`${item.id}-${item.quantity}`}
              inputMode="numeric"
              defaultValue={item.quantity}
              onBlur={event => {
                const quantity = Number(event.target.value);
                if (Number.isInteger(quantity) && quantity >= 1) onChange(updateLoad(project, item.id, { quantity }));
                else event.target.value = String(item.quantity);
              }}
            />
          </label>
        )}
        {product.basis === 'unit' && (
          <>
            <div className="field-grid">
              <SizeField label="Length" meters={item.lengthM} units={units} onCommit={lengthM => onChange(updateLoad(project, item.id, { lengthM }))} />
              <SizeField label="Depth" meters={item.widthM} units={units} onCommit={widthM => onChange(updateLoad(project, item.id, { widthM }))} />
              <SizeField label="Height" meters={item.heightM} units={units} onCommit={heightM => onChange(updateLoad(project, item.id, { heightM }))} />
            </div>
            {product.size?.note && <p className="muted">{product.size.note}</p>}
            <p className="muted">
              {item.lengthM != null && item.widthM != null
                ? 'Drawn on the plan at this size. Drag the appliance to move it, and drag the handle to rotate it.'
                : 'Enter length and depth to draw this appliance on the plan. Height is kept for reference.'}
            </p>
          </>
        )}
        <p className="muted">
          {room ? (
            <>
              In{' '}
              <button type="button" className="link-btn" onClick={() => onSelect({ kind: 'room', id: room.id })}>
                {room.name || 'Space'}
              </button>
              . Drag it on the plan to move it.
            </>
          ) : (
            'Outside every space. Drag it into a space.'
          )}
        </p>
      </section>
      <section className="prop-block">
        <p className="prop-section">Values {per}</p>
        <div className="seg-row" role="radiogroup" aria-label="Value source">
          {(['ashrae', 'manufacturer', 'manual'] as const).map(source => {
            const on = (override?.source ?? 'ashrae') === source;
            return (
              <button key={source} type="button" role="radio" aria-checked={on} className={on ? 'active' : ''} onClick={() => setSource(source)}>
                {LOAD_SOURCE_LABEL[source]}
              </button>
            );
          })}
        </div>
        {override ? (
          <>
            <div className="field-grid">
              <OverrideField label="Sensible" unit={gain.label} value={override.sensibleW == null ? null : override.sensibleW * gain.factor} fallback={show(product.sensibleW)} onCommit={value => patchOverride({ sensibleW: value == null ? null : value / gain.factor })} />
              <OverrideField label="Latent" unit={gain.label} value={override.latentW == null ? null : override.latentW * gain.factor} fallback={show(product.latentW)} onCommit={value => patchOverride({ latentW: value == null ? null : value / gain.factor })} />
              <OverrideField label="CO₂" unit="L/s" value={override.co2Ls} fallback={defaultCo2 == null ? '' : formatNumber(defaultCo2, 4)} onCommit={value => patchOverride({ co2Ls: value })} />
              <OverrideField label="CO" unit="mg/s" value={override.coMgS} fallback="none" onCommit={value => patchOverride({ coMgS: value })} />
            </div>
            <TextField
              label={override.source === 'manufacturer' ? 'Manufacturer, model, and data sheet' : 'Basis for these values'}
              value={override.note}
              onCommit={note => patchOverride({ note })}
            />
            <p className="muted">Empty fields use the ASHRAE default shown in grey.</p>
          </>
        ) : (
          <dl className="spec-list">
            <div>
              <dt>Sensible</dt>
              <dd>
                {show(product.sensibleW)} {gain.label}
                {product.radiantW != null ? ` (radiant ${show(product.radiantW)})` : ''}
              </dd>
            </div>
            <div>
              <dt>Latent</dt>
              <dd>
                {show(product.latentW)} {gain.label}
              </dd>
            </div>
            {product.ratedW != null && (
              <div>
                <dt>Rated input</dt>
                <dd>{formatPower(product.ratedW, units)}</dd>
              </div>
            )}
            {product.standbyW != null && (
              <div>
                <dt>Idle input</dt>
                <dd>{formatPower(product.standbyW, units)}</dd>
              </div>
            )}
            <div>
              <dt>Source</dt>
              <dd>{product.source}</dd>
            </div>
            {product.note && (
              <div>
                <dt>Note</dt>
                <dd>{product.note}</dd>
              </div>
            )}
          </dl>
        )}
      </section>
      {product.category === 'cooking' && product.hooded != null && (
        <section className="prop-block">
          <p className="prop-section">Hood</p>
          {product.hooded ? (
            hood ? (
              <p className="muted">
                Under{' '}
                <button type="button" className="link-btn" onClick={() => onSelect({ kind: 'equipment', id: hood.id })}>
                  {hoodProduct?.model ?? 'hood'}
                </button>
                . Convective heat and combustion products go to the exhaust.
              </p>
            ) : (
              <p className="callout warn">Not under a hood. These values assume a hood captures the plume. Place a hood over it, or pick the unhooded type.</p>
            )
          ) : (
            <p className="muted">Unhooded values. All heat and moisture go to the space.</p>
          )}
        </section>
      )}
      {gains.combustion && (
        <section className="prop-block">
          <p className="prop-section">Combustion products at idle</p>
          <dl className="spec-list">
            <div>
              <dt>CO₂</dt>
              <dd>{formatNumber(gains.combustion.co2Ls, 4)} L/s</dd>
            </div>
            <div>
              <dt>Water vapor</dt>
              <dd>{formatNumber(gains.combustion.waterGh / 1000, 3)} kg/h</dd>
            </div>
            <div>
              <dt>Goes to</dt>
              <dd>{gains.combustion.captured ? 'Hood exhaust' : 'The space'}</dd>
            </div>
          </dl>
        </section>
      )}
      <section className="prop-block">
        <p className="prop-section">Total for this item</p>
        <LoadTotalsList totals={gains} units={units} />
        <details className="prop-details">
          <summary>Method</summary>
          <ul>
            {LOAD_METHOD_NOTES.map(note => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      </section>
      <TextField label="Notes" value={item.notes} multiline onCommit={notes => onChange(updateLoad(project, item.id, { notes }))} />
      <div className="button-row">
        <button type="button" className="btn danger" onClick={remove}>
          Delete
        </button>
      </div>
    </div>
  );
}
