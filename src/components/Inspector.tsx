'use client';

import { Fragment, useState } from 'react';
import { ink } from '@/domain/theme';
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
  setUnitSections,
} from '@/domain/projectOps';
import { getDuctProduct, roughnessLabel, servicesFor, streamFor, systemsForProduct } from '@/domain/ductCatalog';
import { ductAreaM2, ductCrossings, ductFlows, ductSizeLabel, ductViewOf, DUCT_SERVICES, DUCT_SERVICE_LABEL, endRise, linkedPort, nodeRuns, polylineLength } from '@/domain/ducts';
import {
  COIL_MEDIUM_LABEL,
  COOLING_MEDIA,
  HEATING_MEDIA,
  newSection,
  OFF_AIRSTREAM_KINDS,
  placedPorts,
  portFlow,
  SECTION_KINDS,
  SECTION_LABEL,
  SECTION_TAG,
  unitSections,
} from '@/domain/airUnits';
import { fluidsFor, isLiquidLoop, isPiped, LOOP_FLUID_LABEL, newControlPoint, newPlantLoop, SENSOR_LABEL, SENSOR_SYMBOL, VALVE_LABEL } from '@/domain/controls';
import { createId } from '@/domain/ids';
import { packageFromSystem } from '@/domain/systemPackages';
import { saveUserPackage } from '@/domain/systemTemplates';
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
  type AirState,
  type LoopFluid,
  type PlantLoop,
  type SensorKind,
  type ValveKind,
  type CoilMedium,
  type DesignSeason,
  type DamperPosition,
  type PlacedEquipment,
  type UnitSection,
  type UnitSectionKind,
} from '@/domain/types';
import { formatArea, formatFlow, formatLength, formatNumber, formatPower, lengthToM, lengthUnit, mToLength, M3S_PER_CFM } from '@/domain/units';
import { basisLabel, getLoadProduct, LOAD_CATEGORY_LABEL, loadGroups } from '@/domain/loadCatalog';
import { blankOverride, gainUnit, hoodOver, LOAD_METHOD_NOTES, loadGains, loadLabel, removeLoad, roomAreaM2, roomLoads, sumLoads, updateLoad, type LoadTotals } from '@/domain/loads';
import { polygonArea } from '@/domain/wallDraw';
import {
  assemblyCategoriesForFace,
  assemblyCategoriesForOpening,
  findAssembly,
  findConstruction,
  groupAssemblies,
  formatResistance,
  formatThickness,
  resolveStack,
  stackResistance,
  type AssemblyCategory,
  type ConstructionAssembly,
  type ConstructionMaterial,
} from '@/domain/constructionLibrary';
import { acceptsFloorFinish, BUILDING_CONSTRUCTIONS, FLOOR_FINISHES, floorFinishOf, matchingFloorAssembly, projectConstruction, suggestForRoom, withFloorFinish, type Suggestion } from '@/domain/envelopeDefaults';
import { WALL_TYPES, isOutsideInterfaceKey, wallKindFor, wallName, edgePortions, facePortions, findInterface, interfaceTargets, northDegrees, wallPlaceLabel, type InterfaceTarget, type WallPortion } from '@/domain/walls';
import { StackEditor } from './StackEditor';
import { TextField, UnitField } from './Fields';
import { SiteClimateFields } from './SiteClimateFields';
import { PointsTable } from './PointsTable';
import { nodeName, nodeSectionId, UNIT_STREAM_LABEL, unitDuctFlow, unitNetwork } from '@/domain/unitNetwork';

export function Inspector({
  project,
  selection,
  materials,
  assemblies,
  onChange,
  onSelect,
  onDeleteProject,
  nameFocus = 0,
  expandedUnits,
  internalsLayer = false,
  onToggleInternals,
}: {
  project: Project;
  selection: Selection;
  materials: ConstructionMaterial[];
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
  onDeleteProject: () => void;
  nameFocus?: number;
  expandedUnits?: ReadonlySet<string>;
  internalsLayer?: boolean;
  onToggleInternals?: (equipmentId: string) => void;
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
        <RoomFields project={project} roomId={selection.id} materials={materials} assemblies={assemblies} onChange={onChange} onSelect={onSelect} nameFocus={nameFocus} />
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
        <EquipmentFields
          project={project}
          equipmentId={selection.id}
          onChange={onChange}
          onSelect={onSelect}
          internals={internalsLayer ? 'layer' : expandedUnits?.has(selection.id) ? 'open' : 'closed'}
          onToggleInternals={onToggleInternals}
        />
      )}
      {selection.kind === 'wallRun' && <WallRunFields project={project} wallId={selection.id} onChange={onChange} onSelect={onSelect} />}
      {selection.kind === 'duct' && <DuctFields project={project} ductId={selection.id} onChange={onChange} onSelect={onSelect} />}
      {selection.kind === 'wallOpening' && (
        <WallOpeningFields project={project} wallId={selection.wallId} openingId={selection.id} onChange={onChange} onSelect={onSelect} />
      )}
      {selection.kind === 'load' && <LoadFields project={project} loadId={selection.id} onChange={onChange} onSelect={onSelect} />}
      {selection.kind === 'loop' && <PlantLoopFields project={project} loopId={selection.id} onChange={onChange} onSelect={onSelect} />}
      {selection.kind === 'unit-duct' && <UnitDuctFields project={project} equipmentId={selection.equipmentId} linkId={selection.id} onSelect={onSelect} />}
      {selection.kind === 'section' && <SectionFields project={project} equipmentId={selection.equipmentId} sectionId={selection.id} onChange={onChange} onSelect={onSelect} />}
      {selection.kind === 'point' && <ControlPointFields project={project} pointId={selection.id} onChange={onChange} onSelect={onSelect} />}
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
      <label className="field" title="How the shell is built. Floors, walls and ceilings that fit it are suggested first.">
        <span>Construction</span>
        <select
          value={projectConstruction(project) ?? ''}
          onChange={event => {
            const next = BUILDING_CONSTRUCTIONS.find(item => item.id === event.target.value)?.id;
            const { construction: _old, ...rest } = project;
            onChange(next ? { ...rest, construction: next } : rest);
          }}
        >
          <option value="">Not set</option>
          {BUILDING_CONSTRUCTIONS.map(item => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
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
  suggested = null,
  onChange,
}: {
  label: string;
  assemblies: ConstructionAssembly[];
  categories: readonly AssemblyCategory[];
  value: string | null;
  /** Components listed first, from where the surface sits and how the building is built. */
  suggested?: Suggestion | null;
  onChange: (id: string | null) => void;
}) {
  const current = findAssembly(assemblies, value);
  return (
    <label className="field" title={suggested ? `Suggested: ${suggested.reason}` : undefined}>
      <span>{label}</span>
      <select value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
        <option value="">Unassigned</option>
        {value && !current && <option value={value}>{value}</option>}
        {groupAssemblies(assemblies, categories, suggested).map(group => (
          <optgroup key={group.key} label={group.label}>
            {group.items.map(item => (
              <option key={`${group.key}-${item.id}`} value={item.id}>
                {item.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** Floor finish on top of the floor's structure. Hidden for floors that take none (insulated panels). */
function FloorFinishSelect({
  project,
  room,
  assemblies,
  materials,
  onChange,
}: {
  project: Project;
  room: Room;
  assemblies: ConstructionAssembly[];
  materials: ConstructionMaterial[];
  onChange: (project: Project) => void;
}) {
  const floor = room.surfaces.floor;
  if (!floor.constructionId || !acceptsFloorFinish(floor.constructionId)) return null;
  const layers = resolveStack(floor, assemblies, materials);
  return (
    <label className="field">
      <span>Floor finish</span>
      <select
        value={floorFinishOf(layers)}
        onChange={event => {
          const next = withFloorFinish(layers, event.target.value);
          const matched = matchingFloorAssembly(next, assemblies);
          const constructionId = matched ?? floor.constructionId;
          const assembly = findAssembly(assemblies, constructionId);
          const note = matched && assembly ? `${assembly.name}. ${assembly.notes}` : floor.note;
          onChange(
            updateRoom(project, room.id, {
              assumption: false,
              surfaces: { ...room.surfaces, floor: { ...floor, materialKey: null, constructionId, layers: next, note } },
            })
          );
        }}
      >
        {FLOOR_FINISHES.map(finish => (
          <option key={finish.id} value={finish.id}>
            {finish.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function suggestForInterface(project: Project, roomId: string | undefined, shared: boolean): Suggestion | null {
  const room = project.rooms.find(item => item.id === roomId);
  return room ? suggestForRoom(project, room, 'wall', shared) : null;
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
  const kind = wallKindFor(assignment.constructionId);
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
        <h2>{wallName(room, { edge }, project.rooms, project.northDeg)}</h2>
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
          suggested={suggestForRoom(project, room, 'wall', !!sole && !isOutsideInterfaceKey(sole.key))}
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
  const kind = wallKindFor(stack.constructionId);
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
        <h2>{wallName(room, { face }, project.rooms, project.northDeg)}</h2>
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
          suggested={suggestForRoom(project, room, 'wall', !!sole && !isOutsideInterfaceKey(sole.key))}
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
  const kind = wallKindFor(assignment.constructionId);
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
          suggested={suggestForInterface(project, hit.sides[0]?.roomId, !isOutsideInterfaceKey(hit.key))}
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
        suggested={face === 'walls' ? null : suggestForRoom(project, room, face)}
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
  materials,
  assemblies,
  onChange,
  onSelect,
  nameFocus,
}: {
  project: Project;
  roomId: string;
  materials: ConstructionMaterial[];
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
            suggested={suggestForRoom(project, room, face)}
            onChange={constructionId => setSurface(face, constructionId)}
          />
        );
      }).flatMap((select, index) =>
        index === 0 ? [select, <FloorFinishSelect key="finish" project={project} room={room} assemblies={assemblies} materials={materials} onChange={onChange} />] : [select]
      )}
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
        <p className="prop-kicker">{room.name} · {wallName(room, { face: opening.face }, project.rooms, project.northDeg)}</p>
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
              {wallPlaceLabel(room, face.id, project.rooms, project.northDeg)}
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

/** Keep a system as a reusable template in this browser's catalogue. */
function SaveSystemTemplate({ project, systemId, defaultName }: { project: Project; systemId: string; defaultName: string }) {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const empty = !project.equipment.some(item => item.systemId === systemId);
  return (
    <section className="prop-block">
      <p className="prop-section">System template</p>
      <div className="mini-row">
        <input className="grow-input" aria-label="Template name" placeholder={defaultName} value={name} onChange={event => setName(event.target.value)} />
        <button
          type="button"
          className="btn small"
          disabled={empty}
          onClick={() => {
            const label = name.trim() || defaultName;
            const pack = packageFromSystem(project, systemId, label);
            if (!pack) return;
            saveUserPackage(pack);
            setSaved(label);
            setName('');
          }}
        >
          Save as template
        </button>
      </div>
      <p className="muted">
        {saved
          ? `Saved “${saved}” under System templates › My templates. Drag it onto any project's plan.`
          : empty
            ? 'Add equipment to this system to save it as a template.'
            : 'Saves the units, terminals, ducts, loops, and sensors, placed relative to each other.'}
      </p>
    </section>
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
    // Terminals pass the unit's air on; counting them too would double the system's airflow.
    if (product.airflow && !product.terminal) {
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
      <PointsTable project={project} systemId={system.id} />
      <SaveSystemTemplate project={project} systemId={system.id} defaultName={system.name} />
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
  internals = 'closed',
  onToggleInternals,
}: {
  project: Project;
  equipmentId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
  internals?: 'layer' | 'open' | 'closed';
  onToggleInternals?: (equipmentId: string) => void;
}) {
  const item = project.equipment.find(entry => entry.id === equipmentId);
  if (!item) return <p>Equipment not found.</p>;
  const product = getProduct(item.catalogId);
  if (product?.unit) return <UnitFields project={project} item={item} onChange={onChange} onSelect={onSelect} internals={internals} onToggleInternals={onToggleInternals} />;
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
      {product && !product.unit && placedPorts(item).length > 0 && (
        <section className="prop-block">
          <p className="prop-section">Design airflow</p>
          <FlowInput
            label={product.terminal ? 'Terminal airflow' : 'Airflow'}
            units={project.units}
            value={item.designFlowM3s ?? null}
            placeholder={product.airflow ? formatNumber(project.units === 'IP' ? product.airflow.valueM3s / M3S_PER_CFM : product.airflow.valueM3s * 1000, 0) : ''}
            onCommit={value => onChange(updateEquipment(project, item.id, { designFlowM3s: value }))}
          />
          <p className="muted">Blank uses the catalog airflow. Duct flows add up from these values.</p>
        </section>
      )}
      <PortFlows project={project} item={item} />
      {product?.category === 'plant' && (
        <section className="prop-block">
          <p className="prop-section">Loops</p>
          {(project.plantLoops ?? []).filter(loop => loop.plantEquipmentId === item.id).length === 0 ? (
            <p className="muted">No loop names this plant. Pick it on a loop.</p>
          ) : (
            <ul className="link-list">
              {(project.plantLoops ?? []).filter(loop => loop.plantEquipmentId === item.id).map(loop => (
                <li key={loop.id}>
                  <button type="button" className="link-btn" onClick={() => onSelect({ kind: 'loop', id: loop.id })}>{loop.name}</button>
                  <span className="muted">{LOOP_FLUID_LABEL[loop.fluid]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
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

function flowToText(value: number | null, units: Project['units']): string {
  if (value == null) return '';
  return formatNumber(units === 'IP' ? value / M3S_PER_CFM : value * 1000, 0);
}

function FlowInput({
  label,
  units,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  units: Project['units'];
  value: number | null;
  placeholder?: string;
  onCommit: (value: number | null) => void;
}) {
  return (
    <label className="field">
      <span>{label} ({units === 'IP' ? 'CFM' : 'L/s'})</span>
      <input
        key={`${label}-${value}`}
        defaultValue={flowToText(value, units)}
        placeholder={placeholder}
        inputMode="decimal"
        onBlur={event => {
          const raw = event.target.value.trim().replace(/,/g, '');
          if (!raw) {
            if (value != null) onCommit(null);
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n) || n <= 0) {
            event.target.value = flowToText(value, units);
            return;
          }
          const next = units === 'IP' ? n * M3S_PER_CFM : n / 1000;
          if (value == null || Math.abs(next - value) > 1e-9) onCommit(next);
        }}
      />
    </label>
  );
}

/** Port list with the design flow at each port and what the connected terminals add up to. */
function PortFlows({ project, item }: { project: Project; item: PlacedEquipment }) {
  const ports = placedPorts(item);
  if (ports.length === 0) return null;
  const flows = ductFlows(project);
  const linked = new Set<string>();
  for (const run of project.ducts ?? []) {
    for (const end of [run.start, run.end]) if (end.equipmentId === item.id && end.portId) linked.add(end.portId);
  }
  return (
    <section className="prop-block">
      <p className="prop-section">Connections</p>
      <dl className="spec-list">
        {ports.map(entry => {
          const design = portFlow(item, entry.id);
          const source = flows.sources.find(row => row.equipmentId === item.id && row.portId === entry.id);
          const parts = [`${DUCT_SERVICE_LABEL[entry.service]} ${entry.direction === 'in' ? 'in' : 'out'}`];
          if (design != null) parts.push(formatFlow(design, project.units));
          if (!linked.has(entry.id)) parts.push('no duct');
          else if (source && source.terminals > 0) parts.push(`terminals ${formatFlow(source.terminalsM3s, project.units)}${source.partial ? ' + open ends' : ''}`);
          return (
            <div key={entry.id}>
              <dt>{entry.id}</dt>
              <dd>{parts.join(' · ')}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

const GPM_M3S = 0.0000630902;

function tempText(c: number | null | undefined, units: Project['units']): string {
  return c == null ? '' : formatNumber(units === 'IP' ? c * 1.8 + 32 : c, 1);
}

function readTemp(text: string, units: Project['units']): number | null | undefined {
  const raw = text.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return units === 'IP' ? (n - 32) / 1.8 : n;
}

/** Loop, fluid flow, and valves for a piped coil. A loop is shared project-wide and edited here. */
function CoilPipingFields({
  project,
  section,
  onSection,
  onProject,
}: {
  project: Project;
  section: UnitSection;
  onSection: (change: Partial<UnitSection>) => void;
  onProject: (project: Project) => void;
}) {
  const fluids = fluidsFor(section.medium);
  const loops = (project.plantLoops ?? []).filter(loop => fluids.includes(loop.fluid));
  const loop = (project.plantLoops ?? []).find(entry => entry.id === section.loopId);
  const units = project.units;
  const ip = units === 'IP';
  const valves = section.valves ?? [];
  return (
    <div className="coil-piping">
      <label className="field">
        <span>Plant loop</span>
        <select
          value={loop?.id ?? ''}
          onChange={event => {
            const value = event.target.value;
            if (value === '__new') {
              const created = newPlantLoop(fluids[0], `${section.kind === 'cooling-coil' ? 'Cooling' : 'Heating'} loop ${(project.plantLoops ?? []).length + 1}`);
              onProject(updateSectionInProject({ ...project, plantLoops: [...(project.plantLoops ?? []), created] }, section.id, { loopId: created.id }));
              return;
            }
            onSection({ loopId: value || null });
          }}
        >
          <option value="">Not piped</option>
          {loops.map(entry => (
            <option key={entry.id} value={entry.id}>{entry.name}</option>
          ))}
          <option value="__new">New loop…</option>
        </select>
      </label>
      {loop && <LoopFields project={project} loop={loop} fluids={fluids} onChange={onProject} />}
      {loop && isLiquidLoop(loop) && (
        <label className="field">
          <span>Coil fluid flow ({ip ? 'GPM' : 'L/s'})</span>
          <input
            key={`ff-${section.id}-${section.fluidFlowM3s}`}
            defaultValue={section.fluidFlowM3s == null ? '' : formatNumber(ip ? section.fluidFlowM3s / GPM_M3S : section.fluidFlowM3s * 1000, ip ? 1 : 2)}
            inputMode="decimal"
            onBlur={event => {
              const raw = event.target.value.trim();
              const n = Number(raw);
              if (!raw) onSection({ fluidFlowM3s: null });
              else if (Number.isFinite(n) && n > 0) onSection({ fluidFlowM3s: ip ? n * GPM_M3S : n / 1000 });
            }}
          />
        </label>
      )}
      <div className="mini-list">
        <span className="mini-title">Valves</span>
        {valves.map(valve => (
          <div key={valve.id} className="mini-row">
            <input
              key={`tag-${valve.id}-${valve.tag}`}
              className="mini-tag"
              aria-label="Valve tag"
              defaultValue={valve.tag}
              onBlur={event => {
                const tag = event.target.value.trim();
                if (tag !== valve.tag) onSection({ valves: valves.map(entry => (entry.id === valve.id ? { ...entry, tag } : entry)) });
              }}
            />
            <select
              aria-label="Valve type"
              value={valve.kind}
              onChange={event => onSection({ valves: valves.map(entry => (entry.id === valve.id ? { ...entry, kind: event.target.value as ValveKind } : entry)) })}
            >
              {(Object.keys(VALVE_LABEL) as ValveKind[]).map(kind => (
                <option key={kind} value={kind}>{VALVE_LABEL[kind]}</option>
              ))}
            </select>
            <button type="button" className="btn ghost small" aria-label="Remove valve" onClick={() => onSection({ valves: valves.filter(entry => entry.id !== valve.id) })}>✕</button>
          </div>
        ))}
        <button
          type="button"
          className="btn small"
          onClick={() => onSection({ valves: [...valves, { id: createId('valve'), kind: section.medium === 'co2-dx' || section.medium === 'dx' ? 'solenoid' : section.kind === 'heating-coil' ? 'three-way' : 'two-way', tag: `V-${countValves(project) + 1}` }] })}
        >
          + Valve
        </button>
      </div>
    </div>
  );
}

/** Shared plant loop fields. A loop is project-wide, so edits here change every coil on it. */
function LoopFields({ project, loop, fluids, onChange }: { project: Project; loop: PlantLoop; fluids: LoopFluid[]; onChange: (project: Project) => void }) {
  const units = project.units;
  const tempLabel = units === 'IP' ? '°F' : '°C';
  const plant = project.equipment.filter(entry => getProduct(entry.catalogId)?.category === 'plant');
  const setLoop = (patch: Partial<PlantLoop>) => {
    onChange({ ...project, plantLoops: (project.plantLoops ?? []).map(entry => (entry.id === loop.id ? { ...entry, ...patch } : entry)) });
  };
  return (
    <div className="loop-fields">
      <TextField label="Loop name" value={loop.name} onCommit={name => setLoop({ name })} />
      <label className="field">
        <span>Fluid</span>
        <select value={loop.fluid} onChange={event => setLoop({ fluid: event.target.value as LoopFluid })}>
          {fluids.map(fluid => (
            <option key={fluid} value={fluid}>{LOOP_FLUID_LABEL[fluid]}</option>
          ))}
        </select>
      </label>
      {(loop.fluid === 'propylene-glycol' || loop.fluid === 'ethylene-glycol') && (
        <label className="field">
          <span>Glycol (% by volume)</span>
          <input
            key={`gly-${loop.id}-${loop.glycolFraction}`}
            defaultValue={loop.glycolFraction == null ? '' : formatNumber(loop.glycolFraction * 100, 0)}
            inputMode="decimal"
            onBlur={event => {
              const n = Number(event.target.value);
              if (Number.isFinite(n) && n >= 0 && n <= 60) setLoop({ glycolFraction: n / 100 });
            }}
          />
        </label>
      )}
      <label className="field">
        <span>{isLiquidLoop(loop) || loop.fluid === 'steam' ? `Supply (${tempLabel})` : `Saturated suction (${tempLabel})`}</span>
        <input
          key={`sup-${loop.id}-${loop.supplyC}`}
          defaultValue={tempText(loop.supplyC, units)}
          inputMode="decimal"
          onBlur={event => {
            const value = readTemp(event.target.value, units);
            if (value !== undefined) setLoop({ supplyC: value });
          }}
        />
      </label>
      {isLiquidLoop(loop) && (
        <label className="field">
          <span>Return ({tempLabel})</span>
          <input
            key={`ret-${loop.id}-${loop.returnC}`}
            defaultValue={tempText(loop.returnC, units)}
            inputMode="decimal"
            onBlur={event => {
              const value = readTemp(event.target.value, units);
              if (value !== undefined) setLoop({ returnC: value });
            }}
          />
        </label>
      )}
      <label className="field">
        <span>Plant equipment</span>
        <select value={loop.plantEquipmentId ?? ''} onChange={event => setLoop({ plantEquipmentId: event.target.value || null })}>
          <option value="">Not placed</option>
          {plant.map(entry => (
            <option key={entry.id} value={entry.id}>{getProduct(entry.catalogId)?.name ?? 'Plant'}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Coils on a loop, with the unit that holds them. */
function loopCoils(project: Project, loopId: string): { item: PlacedEquipment; section: UnitSection }[] {
  return project.equipment.flatMap(item => (item.sections ?? []).filter(section => section.loopId === loopId).map(section => ({ item, section })));
}

function PlantLoopFields({ project, loopId, onChange, onSelect }: { project: Project; loopId: string; onChange: (project: Project) => void; onSelect: (selection: Selection) => void }) {
  const loop = (project.plantLoops ?? []).find(entry => entry.id === loopId);
  if (!loop) return <p>Loop not found.</p>;
  const coils = loopCoils(project, loop.id);
  const ip = project.units === 'IP';
  const totalFlow = coils.reduce((sum, coil) => sum + (coil.section.fluidFlowM3s ?? 0), 0);
  const plant = loop.plantEquipmentId ? project.equipment.find(entry => entry.id === loop.plantEquipmentId) : undefined;
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Plant loop</p>
        <h2>{loop.name}</h2>
      </header>
      <LoopFields project={project} loop={loop} fluids={Object.keys(LOOP_FLUID_LABEL) as LoopFluid[]} onChange={onChange} />
      <section className="prop-block">
        <p className="prop-section">Coils on this loop</p>
        {coils.length === 0 ? (
          <p className="muted">No coil is piped to this loop. Pick it on a coil in a unit's sections.</p>
        ) : (
          <ul className="link-list">
            {coils.map(({ item, section }) => (
              <li key={section.id}>
                <button type="button" className="link-btn" onClick={() => onSelect({ kind: 'equipment', id: item.id })}>
                  {getProduct(item.catalogId)?.model ?? 'Unit'} · {SECTION_LABEL[section.kind]}
                </button>
                <span className="muted">{section.fluidFlowM3s == null ? '' : ip ? `${formatNumber(section.fluidFlowM3s / GPM_M3S, 1)} GPM` : `${formatNumber(section.fluidFlowM3s * 1000, 2)} L/s`}</span>
              </li>
            ))}
          </ul>
        )}
        {isLiquidLoop(loop) && totalFlow > 0 && (
          <p className="muted">Total coil flow {ip ? `${formatNumber(totalFlow / GPM_M3S, 1)} GPM` : `${formatNumber(totalFlow * 1000, 2)} L/s`}.</p>
        )}
      </section>
      {plant && (
        <button type="button" className="btn" onClick={() => onSelect({ kind: 'equipment', id: plant.id })}>
          Show {getProduct(plant.catalogId)?.model ?? 'plant'}
        </button>
      )}
      <TextField label="Notes" value={loop.notes} multiline onCommit={notes => onChange({ ...project, plantLoops: (project.plantLoops ?? []).map(entry => (entry.id === loop.id ? { ...entry, notes } : entry)) })} />
      <div className="button-row">
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            onChange({
              ...project,
              plantLoops: (project.plantLoops ?? []).filter(entry => entry.id !== loop.id),
              equipment: project.equipment.map(item =>
                item.sections?.some(section => section.loopId === loop.id)
                  ? { ...item, sections: item.sections.map(section => (section.loopId === loop.id ? { ...section, loopId: null } : section)) }
                  : item,
              ),
            });
            onSelect({ kind: 'project' });
          }}
        >
          Remove loop
        </button>
      </div>
    </div>
  );
}

function ControlPointFields({ project, pointId, onChange, onSelect }: { project: Project; pointId: string; onChange: (project: Project) => void; onSelect: (selection: Selection) => void }) {
  const point = (project.controlPoints ?? []).find(entry => entry.id === pointId);
  if (!point) return <p>Sensor not found.</p>;
  const location = point.location;
  const set = (patch: Partial<typeof point>) => onChange({ ...project, controlPoints: (project.controlPoints ?? []).map(entry => (entry.id === point.id ? { ...entry, ...patch } : entry)) });
  const unitId = location.kind === 'station' ? location.equipmentId : location.equipmentId;
  const unit = unitId ? project.equipment.find(entry => entry.id === unitId) : undefined;
  const section = location.kind === 'station' && unit ? unitSections(unit).find(entry => entry.id === location.sectionId) : undefined;
  const room = location.kind === 'room' ? project.rooms.find(entry => entry.id === location.roomId) : undefined;
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Sensor</p>
        <h2>{point.tag}</h2>
      </header>
      <TextField label="Tag" value={point.tag} onCommit={tag => set({ tag: tag.trim() || point.tag })} />
      <label className="field">
        <span>Type</span>
        <select value={point.sensor} onChange={event => set({ sensor: event.target.value as SensorKind })}>
          {(Object.keys(SENSOR_LABEL) as SensorKind[]).map(kind => (
            <option key={kind} value={kind}>{SENSOR_LABEL[kind]}</option>
          ))}
        </select>
      </label>
      {location.kind === 'room' && (
        <label className="field">
          <span>Space</span>
          <select value={location.roomId} onChange={event => set({ location: { ...location, roomId: event.target.value } })}>
            {project.rooms.map(entry => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        </label>
      )}
      <dl className="spec-list">
        <div>
          <dt>Location</dt>
          <dd>{location.kind === 'room' ? `In ${room?.name ?? 'space'}` : `In the airstream after the ${section ? SECTION_LABEL[section.kind].toLowerCase() : 'section'}`}</dd>
        </div>
        <div>
          <dt>Point</dt>
          <dd>AI</dd>
        </div>
      </dl>
      {unit && (
        <button type="button" className="btn" onClick={() => onSelect({ kind: 'equipment', id: unit.id })}>
          Show {getProduct(unit.catalogId)?.model ?? 'unit'}
        </button>
      )}
      <div className="button-row">
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            onChange({ ...project, controlPoints: (project.controlPoints ?? []).filter(entry => entry.id !== point.id) });
            onSelect({ kind: 'project' });
          }}
        >
          Remove sensor
        </button>
      </div>
    </div>
  );
}

function countValves(project: Project): number {
  return project.equipment.reduce((sum, item) => sum + (item.sections ?? []).reduce((inner, section) => inner + (section.valves?.length ?? 0), 0), 0);
}

function updateSectionInProject(project: Project, sectionId: string, change: Partial<UnitSection>): Project {
  return {
    ...project,
    equipment: project.equipment.map(item =>
      item.sections?.some(section => section.id === sectionId)
        ? { ...item, sections: item.sections.map(section => (section.id === sectionId ? { ...section, ...change } : section)) }
        : item,
    ),
  };
}

const SENSOR_KINDS = Object.keys(SENSOR_LABEL) as SensorKind[];

/** Tagged sensors in the airstream after a section. */
function StationSensors({ project, item, section, onChange }: { project: Project; item: PlacedEquipment; section: UnitSection; onChange: (project: Project) => void }) {
  const points = (project.controlPoints ?? []).filter(point => point.location.kind === 'station' && point.location.equipmentId === item.id && point.location.sectionId === section.id);
  const [tag, setTag] = useState('');
  const [sensor, setSensor] = useState<SensorKind>('temperature');
  return (
    <div className="mini-list">
      <span className="mini-title">Sensors after this section</span>
      {points.map(point => (
        <div key={point.id} className="mini-row">
          <span className="mini-chip">{point.tag}</span>
          <span className="muted">{SENSOR_LABEL[point.sensor]}</span>
          <button type="button" className="btn ghost small" aria-label={`Remove ${point.tag}`} onClick={() => onChange({ ...project, controlPoints: (project.controlPoints ?? []).filter(entry => entry.id !== point.id) })}>✕</button>
        </div>
      ))}
      {(
        <div className="mini-row">
          <input className="mini-tag" aria-label="Sensor tag" placeholder="Tag" value={tag} onChange={event => setTag(event.target.value)} />
          <select aria-label="Sensor type" value={sensor} onChange={event => setSensor(event.target.value as SensorKind)}>
            {SENSOR_KINDS.filter(kind => kind !== 'co2' || section.kind === 'ra-damper').map(kind => (
              <option key={kind} value={kind}>{SENSOR_LABEL[kind]}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const label = tag.trim() || `${SENSOR_SYMBOL[sensor].replace('%', '')}-${(project.controlPoints ?? []).length + 1}`;
              const base = item.sections ? project : updateEquipment(project, item.id, { sections: unitSections(item) });
              onChange({ ...base, controlPoints: [...(base.controlPoints ?? []), newControlPoint(label, sensor, { kind: 'station', equipmentId: item.id, sectionId: section.id })] });
              setTag('');
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

/** Room thermostats and sensors that this unit is controlled from. */
function RoomSensorsEditor({ project, item, onChange }: { project: Project; item: PlacedEquipment; onChange: (project: Project) => void }) {
  const points = (project.controlPoints ?? []).filter(point => point.location.kind === 'room' && point.location.equipmentId === item.id);
  const [roomId, setRoomId] = useState(item.roomId ?? project.rooms[0]?.id ?? '');
  const [sensor, setSensor] = useState<SensorKind>('temperature');
  const [tag, setTag] = useState('');
  return (
    <div className="mini-list room-sensors">
      <span className="mini-title">Room sensors</span>
      {points.map(point => {
        const location = point.location;
        const room = location.kind === 'room' ? project.rooms.find(entry => entry.id === location.roomId) : undefined;
        return (
          <div key={point.id} className="mini-row">
            <span className="mini-chip">{point.tag}</span>
            <span className="muted">{`${SENSOR_LABEL[point.sensor]} · ${room?.name ?? 'Room'}`}</span>
            <button type="button" className="btn ghost small" aria-label={`Remove ${point.tag}`} onClick={() => onChange({ ...project, controlPoints: (project.controlPoints ?? []).filter(entry => entry.id !== point.id) })}>✕</button>
          </div>
        );
      })}
      {project.rooms.length === 0 ? (
        <span className="muted">Add a space to place room sensors.</span>
      ) : (
        <div className="mini-row">
          <input className="mini-tag" aria-label="Room sensor tag" placeholder="Tag" value={tag} onChange={event => setTag(event.target.value)} />
          <select aria-label="Room" value={roomId} onChange={event => setRoomId(event.target.value)}>
            {project.rooms.map(room => (
              <option key={room.id} value={room.id}>{room.name}</option>
            ))}
          </select>
          <select aria-label="Room sensor type" value={sensor} onChange={event => setSensor(event.target.value as SensorKind)}>
            {(['temperature', 'humidity', 'co2'] as SensorKind[]).map(kind => (
              <option key={kind} value={kind}>{SENSOR_LABEL[kind]}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn small"
            disabled={!roomId}
            onClick={() => {
              const label = tag.trim() || SENSOR_SYMBOL[sensor];
              onChange({ ...project, controlPoints: [...(project.controlPoints ?? []), newControlPoint(label, sensor, { kind: 'room', roomId, equipmentId: item.id })] });
              setTag('');
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

const STATE_LABEL: Partial<Record<UnitSectionKind, string>> = {
  'oa-damper': 'Outdoor air design condition',
  'ra-damper': 'Return air design condition',
  'mixing-box': 'Mixed air design condition',
  'cooling-coil': 'Leaving air design condition',
  'heating-coil': 'Leaving air design condition',
  'heat-recovery': 'Leaving air design condition',
  humidifier: 'Leaving air design condition',
};

/** Design dry bulb, wet bulb, and RH for each season, as on the drawings. Inputs for the solver; nothing is derived here. */
function StateFields({
  label,
  units,
  states,
  onChange,
}: {
  label: string;
  units: Project['units'];
  states: UnitSection['states'];
  onChange: (states: UnitSection['states']) => void;
}) {
  const ip = units === 'IP';
  const show = (c: number | null | undefined) => (c == null ? '' : formatNumber(ip ? c * 1.8 + 32 : c, 1));
  const read = (text: string) => {
    const raw = text.trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return undefined;
    return ip ? (n - 32) / 1.8 : n;
  };
  const set = (season: DesignSeason, patch: Partial<AirState>) => {
    const current: AirState = { dbC: null, wbC: null, rh: null, ...(states?.[season] ?? {}) };
    const next = { ...current, ...patch };
    const empty = next.dbC == null && next.wbC == null && next.rh == null;
    const merged = { ...(states ?? {}) };
    if (empty) delete merged[season];
    else merged[season] = next;
    onChange(Object.keys(merged).length > 0 ? merged : undefined);
  };
  const deg = ip ? '°F' : '°C';
  return (
    <div className="state-grid">
      <span className="state-title">{label}</span>
      <span />
      <span>DB {deg}</span>
      <span>WB {deg}</span>
      <span>RH %</span>
      {(['cooling', 'heating'] as const).map(season => {
        const state = states?.[season];
        return (
          <Fragment key={season}>
            <span className="state-season">{season === 'cooling' ? 'Cooling' : 'Heating'}</span>
            <input
              key={`db-${season}-${state?.dbC}`}
              aria-label={`${season} dry bulb`}
              defaultValue={show(state?.dbC)}
              inputMode="decimal"
              onBlur={event => {
                const value = read(event.target.value);
                if (value !== undefined && value !== (state?.dbC ?? null)) set(season, { dbC: value });
              }}
            />
            <input
              key={`wb-${season}-${state?.wbC}`}
              aria-label={`${season} wet bulb`}
              defaultValue={show(state?.wbC)}
              inputMode="decimal"
              onBlur={event => {
                const value = read(event.target.value);
                if (value !== undefined && value !== (state?.wbC ?? null)) set(season, { wbC: value });
              }}
            />
            <input
              key={`rh-${season}-${state?.rh}`}
              aria-label={`${season} relative humidity`}
              defaultValue={state?.rh == null ? '' : formatNumber(state.rh * 100, 0)}
              inputMode="decimal"
              onBlur={event => {
                const raw = event.target.value.trim();
                const n = Number(raw);
                const value = !raw ? null : Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : undefined;
                if (value !== undefined && value !== (state?.rh ?? null)) set(season, { rh: value });
              }}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

/** Supply airflow on the supply fan and minimum outdoor air on the outdoor damper: the two unit inputs changed most. */
function setSectionFlow(project: Project, item: PlacedEquipment, kind: UnitSectionKind, flowM3s: number | null): Project {
  const sections = unitSections(item);
  if (!sections.some(section => section.kind === kind)) return project;
  return setUnitSections(project, item.id, sections.map(section => (section.kind === kind ? { ...section, flowM3s } : section)));
}

/**
 * A unit with its own internal network (RTU, AHU, MAU, ERV): only the inputs changed most, and its sections as a list.
 * Each section opens on its own, here or on the plan, so the inspector never shows every section at once.
 */
function UnitFields({
  project,
  item,
  onChange,
  onSelect,
  internals,
  onToggleInternals,
}: {
  project: Project;
  item: PlacedEquipment;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
  internals: 'layer' | 'open' | 'closed';
  onToggleInternals?: (equipmentId: string) => void;
}) {
  const product = getProduct(item.catalogId)!;
  const sections = unitSections(item);
  const supply = sections.find(section => section.kind === 'supply-fan');
  const outdoor = sections.find(section => section.kind === 'oa-damper');
  const roomPoints = (project.controlPoints ?? []).filter(point => point.location.kind === 'room' && point.location.equipmentId === item.id);
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">{CATEGORY_LABEL[product.category] ?? 'Unit'}</p>
        <h2>{product.model}</h2>
        <p className="muted">{product.name}</p>
      </header>
      <label className="field">
        <span>System</span>
        <select value={item.systemId ?? ''} onChange={event => onChange(updateEquipment(project, item.id, { systemId: event.target.value || null }))}>
          <option value="">Unassigned</option>
          {project.systems.map(system => (
            <option key={system.id} value={system.id}>{system.name}</option>
          ))}
        </select>
      </label>
      {supply && (
        <FlowInput label="Supply airflow" units={project.units} value={supply.flowM3s ?? null} onCommit={value => onChange(setSectionFlow(project, item, 'supply-fan', value))} />
      )}
      {outdoor && (
        <FlowInput label="Minimum outdoor air" units={project.units} value={outdoor.flowM3s ?? null} onCommit={value => onChange(setSectionFlow(project, item, 'oa-damper', value))} />
      )}
      <section className="prop-block">
        <div className="prop-row">
          <p className="prop-section">Sections</p>
          {internals === 'layer' ? (
            <span className="muted">Shown on the plan</span>
          ) : (
            <button type="button" className="btn small" onClick={() => onToggleInternals?.(item.id)}>
              {internals === 'open' ? 'Close on plan' : 'Open on plan'}
            </button>
          )}
        </div>
        <ol className="section-rows">
          {sections.map(section => (
            <li key={section.id}>
              <button type="button" onClick={() => onSelect({ kind: 'section', equipmentId: item.id, id: section.id })}>
                <span className="mini-chip">{SECTION_TAG[section.kind]}</span>
                <span className="section-row-name">{SECTION_LABEL[section.kind]}</span>
                <span className="muted">{sectionBrief(project, section)}</span>
              </button>
            </li>
          ))}
        </ol>
        <label className="field">
          <span>Add section</span>
          <select
            value=""
            onChange={event => {
              const kind = event.target.value as UnitSectionKind;
              if (!kind) return;
              const created = newSection(kind);
              onChange(setUnitSections(project, item.id, [...sections, created]));
              onSelect({ kind: 'section', equipmentId: item.id, id: created.id });
            }}
          >
            <option value="">Choose…</option>
            {SECTION_KINDS.map(kind => (
              <option key={kind} value={kind}>{SECTION_LABEL[kind]}</option>
            ))}
          </select>
        </label>
      </section>
      <details className="prop-more">
        <summary>Room sensors{roomPoints.length > 0 ? ` · ${roomPoints.length}` : ''}</summary>
        <RoomSensorsEditor project={project} item={item} onChange={onChange} />
      </details>
      <details className="prop-more">
        <summary>Placement and notes</summary>
        <label className="field">
          <span>Space</span>
          <select value={item.roomId ?? ''} onChange={event => onChange(assignEquipmentRoom(project, item.id, event.target.value || null))}>
            <option value="">Unassigned</option>
            {project.rooms.map(room => (
              <option key={room.id} value={room.id}>{room.name}</option>
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
      </details>
      <details className="prop-more">
        <summary>Product data</summary>
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
        <PortFlows project={project} item={item} />
      </details>
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

/** One line per section in the unit list: the inputs that tell sections apart. */
function sectionBrief(project: Project, section: UnitSection): string {
  const bits: string[] = [];
  if (section.position) bits.push(section.position);
  if (section.medium) bits.push(COIL_MEDIUM_LABEL[section.medium]);
  if (section.flowM3s != null) bits.push(formatFlow(section.flowM3s, project.units));
  const loop = section.loopId ? (project.plantLoops ?? []).find(entry => entry.id === section.loopId) : undefined;
  if (loop) bits.push(loop.name);
  if ((section.valves ?? []).length > 0) bits.push((section.valves ?? []).map(valve => valve.tag).join(' '));
  return bits.join(' · ');
}

/** One duct inside a unit: which stream it carries, between what, and its design airflow. Nothing to enter. */
function UnitDuctFields({ project, equipmentId, linkId, onSelect }: { project: Project; equipmentId: string; linkId: string; onSelect: (selection: Selection) => void }) {
  const item = project.equipment.find(entry => entry.id === equipmentId);
  if (!item) return <p>Unit not found.</p>;
  const link = unitNetwork(item).links.find(entry => entry.id === linkId);
  if (!link) return <p>Duct not found.</p>;
  const product = getProduct(item.catalogId);
  const flow = unitDuctFlow(item, link);
  const end = (nodeId: string) => {
    const sectionId = nodeSectionId(nodeId);
    return sectionId ? (
      <button type="button" className="link-btn" onClick={() => onSelect({ kind: 'section', equipmentId: item.id, id: sectionId })}>
        {nodeName(item, nodeId)}
      </button>
    ) : (
      nodeName(item, nodeId)
    );
  };
  return (
    <div className="stack props">
      <header className="prop-head">
        <button type="button" className="link-btn prop-back" onClick={() => onSelect({ kind: 'equipment', id: item.id })}>
          ‹ {product?.model ?? 'Unit'}
        </button>
        <p className="prop-kicker">Duct inside the unit</p>
        <h2>{UNIT_STREAM_LABEL[link.stream]}</h2>
      </header>
      <dl className="spec-list">
        <div>
          <dt>From</dt>
          <dd>{end(link.from)}</dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>{end(link.to)}</dd>
        </div>
        <div>
          <dt>Design airflow</dt>
          <dd>{flow != null ? formatFlow(flow, project.units) : 'Set the fan and damper airflows'}</dd>
        </div>
      </dl>
      <p className="muted">Airflow follows from the supply fan, outdoor-air, and relief inputs on the unit.</p>
    </div>
  );
}

/** One unit section: its inputs only. Opened from the unit's section list or by clicking it on the plan. */
function SectionFields({
  project,
  equipmentId,
  sectionId,
  onChange,
  onSelect,
}: {
  project: Project;
  equipmentId: string;
  sectionId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const item = project.equipment.find(entry => entry.id === equipmentId);
  if (!item) return <p>Unit not found.</p>;
  const sections = unitSections(item);
  const index = sections.findIndex(entry => entry.id === sectionId);
  const section = sections[index];
  if (!section) return <p>Section not found.</p>;
  const product = getProduct(item.catalogId);
  const save = (next: UnitSection[]) => onChange(setUnitSections(project, item.id, next));
  const patch = (change: Partial<UnitSection>) => save(sections.map(entry => (entry.id === section.id ? { ...entry, ...change } : entry)));
  const move = (delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  };
  const damper = section.kind === 'oa-damper' || section.kind === 'ra-damper' || section.kind === 'exhaust-damper';
  const coil = section.kind === 'cooling-coil' || section.kind === 'heating-coil';
  const offAirstream = OFF_AIRSTREAM_KINDS.includes(section.kind);
  const flowed = section.kind === 'supply-fan' || section.kind === 'relief-fan' || section.kind === 'oa-damper' || section.kind === 'exhaust-damper';
  const powerLabel = project.units === 'IP' ? 'kBtu/h' : 'kW';
  const toPower = (watts: number | null | undefined) => (watts == null ? '' : formatNumber(project.units === 'IP' ? watts / 293.07107 : watts / 1000, 1));
  return (
    <div className="stack props">
      <header className="prop-head">
        <button type="button" className="link-btn prop-back" onClick={() => onSelect({ kind: 'equipment', id: item.id })}>
          ‹ {product?.model ?? 'Unit'}
        </button>
        <p className="prop-kicker">Section {index + 1} of {sections.length}</p>
        <h2>{SECTION_LABEL[section.kind]}</h2>
      </header>
      {damper && (
        <label className="field">
          <span>Fail position</span>
          <select value={section.position ?? 'NC'} onChange={event => patch({ position: event.target.value as DamperPosition })}>
            <option value="NC">Normally closed (NC)</option>
            <option value="NO">Normally open (NO)</option>
          </select>
        </label>
      )}
      {(section.kind === 'oa-damper' || section.kind === 'exhaust-damper') && (
        <label className="field check">
          <input type="checkbox" checked={section.ducted !== false} onChange={event => patch({ ducted: event.target.checked })} />
          <span>Ducted connection (off: hood on the casing)</span>
        </label>
      )}
      {coil && (
        <label className="field">
          <span>Medium</span>
          <select value={section.medium ?? ''} onChange={event => patch({ medium: event.target.value as CoilMedium })}>
            {(section.kind === 'cooling-coil' ? COOLING_MEDIA : HEATING_MEDIA).map(medium => (
              <option key={medium} value={medium}>{COIL_MEDIUM_LABEL[medium]}</option>
            ))}
          </select>
        </label>
      )}
      {coil && (
        <label className="field">
          <span>Selected capacity ({powerLabel})</span>
          <input
            key={`cap-${section.id}-${section.capacityW}`}
            defaultValue={toPower(section.capacityW)}
            placeholder="Not selected"
            inputMode="decimal"
            onBlur={event => {
              const raw = event.target.value.trim();
              const n = Number(raw);
              if (!raw) patch({ capacityW: null });
              else if (Number.isFinite(n) && n > 0) patch({ capacityW: project.units === 'IP' ? n * 293.07107 : n * 1000 });
            }}
          />
        </label>
      )}
      {section.kind === 'condenser' && (
        <label className="field">
          <span>Condenser fans</span>
          <input
            key={`fans-${section.id}-${section.fanCount ?? 1}`}
            inputMode="numeric"
            defaultValue={section.fanCount ?? 1}
            onBlur={event => {
              const count = Number(event.target.value);
              if (Number.isInteger(count) && count >= 1 && count <= 6) patch({ fanCount: count });
              else event.target.value = String(section.fanCount ?? 1);
            }}
          />
        </label>
      )}
      {flowed && (
        <FlowInput
          label={section.kind === 'oa-damper' ? 'Minimum outdoor air' : 'Airflow'}
          units={project.units}
          value={section.flowM3s ?? null}
          onCommit={value => patch({ flowM3s: value })}
        />
      )}
      {coil && isPiped(section.medium) && (
        <CoilPipingFields project={project} section={section} onSection={change => patch(change)} onProject={onChange} />
      )}
      {STATE_LABEL[section.kind] && (
        <StateFields label={STATE_LABEL[section.kind]!} units={project.units} states={section.states} onChange={states => patch({ states })} />
      )}
      {!offAirstream && <StationSensors project={project} item={item} section={section} onChange={onChange} />}
      {section.note && <p className="muted">{section.note}</p>}
      {!offAirstream && <div className="button-row">
        <button type="button" className="btn" disabled={index === 0} onClick={() => move(-1)}>
          Move toward intake
        </button>
        <button type="button" className="btn" disabled={index === sections.length - 1} onClick={() => move(1)}>
          Move toward supply
        </button>
      </div>}
      <button
        type="button"
        className="btn danger"
        onClick={() => {
          save(sections.filter(entry => entry.id !== section.id));
          onSelect({ kind: 'equipment', id: item.id });
        }}
      >
        Remove section
      </button>
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
  const carried = ductFlows(project).runs.get(run.id);
  const velocity = carried?.flowM3s != null && carried.flowM3s > 0 ? carried.flowM3s / ductAreaM2(run) : null;
  const endLabel = (which: 'start' | 'end') => {
    const link = which === 'start' ? start : end;
    const nodeId = (which === 'start' ? run.start : run.end).nodeId;
    if (!link && nodeId) return `Junction · ${nodeRuns(project, nodeId).length} runs`;
    if (!link) return 'Open end — finish at a terminal or another run';
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
          {stream && <span className="duct-swatch" style={{ background: ink(stream.color) }} />}
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
      <div className="stat-row">
        <span>{carried?.flowM3s != null ? `${formatFlow(carried.flowM3s, project.units)}${carried.partial ? ' + open ends' : ''}` : 'Flow not traced'}</span>
        <span>{velocity != null ? (project.units === 'IP' ? `${formatNumber(velocity / 0.00508, 0)} fpm` : `${formatNumber(velocity, 1)} m/s`) : '—'}</span>
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
