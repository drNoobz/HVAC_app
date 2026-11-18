'use client';

import { CATEGORY_LABEL, getProduct } from '@/domain/catalog';
import {
  addOpening,
  assignEquipmentRoom,
  duplicateEquipment,
  duplicateRoom,
  removeEquipment,
  removeRoom,
  removeSystem,
  setWallAssembly,
  UNASSIGNED_SURFACE,
  updateEquipment,
  updateRoom,
  updateSystem,
} from '@/domain/projectOps';
import { doorDirection, hingeEnds, setDoorDirection, type DoorHinge } from '@/domain/doorSwing';
import { placeBeside, resizeSpan, slideOpeningOffset } from '@/domain/spanFit';
import {
  BUILDING_TYPES,
  ROOM_USES,
  SURFACE_FACES,
  SYSTEM_KINDS,
  WALL_FACES,
  type OpeningKind,
  type Project,
  type Room,
  type Selection,
  type SurfaceFace,
  type WallFace,
} from '@/domain/types';
import { formatArea, formatLength, lengthToM, lengthUnit, mToLength } from '@/domain/units';
import {
  assemblyCategoriesForFace,
  assemblyCategoriesForOpening,
  constructionCategoryLabel,
  findAssembly,
  findConstruction,
  formatThickness,
  resolveStack,
  type ConstructionAssembly,
  type ConstructionCategory,
  type ConstructionMaterial,
} from '@/domain/constructionLibrary';
import { planningIssues } from '@/domain/issues';
import { PLAN_SIDES, WALL_TYPES, wallFullyShared, wallPlaceLabel, touchingRooms } from '@/domain/walls';
import { StackEditor } from './StackEditor';
import { materialByKey } from '@/thermonode/materials';
import type { ModelIssueV1 } from '@/thermonode/contract';
import { TextField, UnitField } from './Fields';

export function Inspector({
  project,
  selection,
  issues,
  materials,
  assemblies,
  onChange,
  onSelect,
  onDeleteProject,
  nameFocus = 0,
}: {
  project: Project;
  selection: Selection;
  issues: ModelIssueV1[];
  materials: ConstructionMaterial[];
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
  onDeleteProject: () => void;
  nameFocus?: number;
}) {
  const subjectId = selection.kind === 'surface' ? selection.roomId : 'id' in selection ? selection.id : undefined;
  const relevant = issues.filter(issue => issue.severity !== 'info' && (!subjectId || issue.subjectId === subjectId));
  const planning = planningIssues(project);
  return (
    <aside className="inspector">
      {planning.length > 0 && (
        <section className="planning-issues">
          <h2>Issues · {planning.length}</h2>
          <ul>
            {planning.map(issue => (
              <li key={issue.id}>
                <button type="button" onClick={() => onSelect(issue.selection)}>
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {relevant.length > 0 && (
        <ul className="issue-list">
          {relevant.map(issue => (
            <li key={`${issue.code}-${issue.message}`} className={issue.severity}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {selection.kind === 'project' && (
        <ProjectFields project={project} onChange={onChange} onDeleteProject={onDeleteProject} nameFocus={nameFocus} />
      )}
      {selection.kind === 'room' && (
        <RoomFields project={project} roomId={selection.id} assemblies={assemblies} onChange={onChange} onSelect={onSelect} nameFocus={nameFocus} />
      )}
      {selection.kind === 'surface' && (
        <SurfaceFields
          project={project}
          roomId={selection.roomId}
          face={selection.face}
          wallFace={selection.wallFace}
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
      {selection.kind === 'system' && <SystemFields project={project} systemId={selection.id} onChange={onChange} onSelect={onSelect} nameFocus={nameFocus} />}
      {selection.kind === 'equipment' && (
        <EquipmentFields project={project} equipmentId={selection.id} onChange={onChange} onSelect={onSelect} />
      )}
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
  return (
    <div className="stack">
      <h2>Project</h2>
      <p className="muted">Started from {project.createdFrom.label}. Stored lengths are meters. The display unit is {project.units === 'IP' ? 'feet' : 'meters'}.</p>
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
      <label className="field">
        <span>Display units</span>
        <select value={project.units} onChange={event => onChange({ ...project, units: event.target.value as Project['units'] })}>
          <option value="IP">IP (ft, CFM, Btu/h)</option>
          <option value="SI">SI (m, L/s, kW)</option>
        </select>
      </label>
      <TextField label="Details" value={project.details} multiline onCommit={details => onChange({ ...project, details })} />
      <p className="flag amber">Preliminary. This project is not a solver-sized design.</p>
      <button type="button" className="btn danger" onClick={onDeleteProject}>
        Delete project
      </button>
    </div>
  );
}

function ThermoNodeNote({ materialKey }: { materialKey?: string | null }) {
  if (!materialKey) return null;
  const thermonode = materialByKey(materialKey);
  return (
    <p className="muted">
      ThermoNode id still stored for the adapter: {thermonode?.name ?? materialKey}. Choosing a component clears it.
    </p>
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
  const layers = resolveStack(assignment, assemblies, materials);
  const thickness = stackThicknessMm(layers, materials);
  const kind = WALL_TYPES.find(type => type.assemblyId === assignment.constructionId)?.id ?? '';
  const openings = room.openings.filter(opening => opening.face === face);
  const partial = touchingRooms(room, face, project.rooms).length > 0 && !wallFullyShared(room, face, project.rooms);
  const setRoomLength = (display: number) => {
    const next = resizeSpan(room, alongY ? 'y' : 'x', lengthToM(display, project.units));
    onChange(updateRoom(project, room.id, { lengthM: next.lengthM, widthM: next.widthM, openings: next.openings, assumption: false }));
  };
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Wall</p>
        <h2>{PLAN_SIDES[face].title} wall</h2>
      </header>
      {partial && <p className="muted">Only part of this wall touches another room. The whole face uses one stack.</p>}
      <section className="prop-block">
        <p className="prop-section">Size</p>
        <UnitField label="Length" unit={unit} value={mToLength(lengthM, project.units)} onCommit={setRoomLength} />
        <label className="field">
          <span>Thickness</span>
          <span className="prop-value" title="Sum of the layer thicknesses">
            {thickness == null ? 'Not stated' : formatThickness(thickness, project.units)}
          </span>
        </label>
        <UnitField label="Height" unit={unit} value={mToLength(room.heightM, project.units)} onCommit={value => onChange(updateRoom(project, room.id, { heightM: lengthToM(value, project.units), assumption: false }))} />
        <label className="field">
          <span>Kind</span>
          <select
            value={kind || 'custom'}
            onChange={event => {
              const type = WALL_TYPES.find(item => item.id === event.target.value);
              if (type) onChange(setWallAssembly(project, room.id, face, type.assemblyId, assemblies));
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
          onChange={constructionId => onChange(setWallAssembly(project, room.id, face, constructionId, assemblies))}
        />
      </section>
      <section className="prop-block">
      <p className="prop-section">Layers</p>
      <StackEditor
        layers={layers}
        materials={materials}
        series={findAssembly(assemblies, assignment.constructionId)?.series ?? true}
        units={project.units}
        onChange={next =>
          onChange(
            updateRoom(project, room.id, {
              assumption: false,
              surfaces: { ...room.surfaces, walls: { ...room.surfaces.walls, [face]: { ...assignment, materialKey: null, layers: next } } },
            })
          )
        }
      />
      <ThermoNodeNote materialKey={assignment.materialKey} />
      <TextField
        label="Note"
        value={assignment.note}
        onCommit={note =>
          onChange(
            updateRoom(project, room.id, {
              surfaces: { ...room.surfaces, walls: { ...room.surfaces.walls, [face]: { ...assignment, note } } },
            })
          )
        }
      />
      </section>
      <section className="prop-block">
      <p className="prop-section">Openings{openings.length > 0 ? ` · ${openings.length}` : ''}</p>
      {openings.length > 0 && (
        <ul className="plain-list">
          {openings.map(opening => (
            <li key={opening.id}>
              <button type="button" className="linkish" onClick={() => onSelect({ kind: 'opening', roomId: room.id, id: opening.id })}>
                {opening.kind} · {formatLength(opening.widthM, project.units, 2)}
              </button>
            </li>
          ))}
        </ul>
      )}
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
}

function SurfaceFields({
  project,
  roomId,
  face,
  wallFace,
  materials,
  assemblies,
  onChange,
  onSelect,
}: {
  project: Project;
  roomId: string;
  face: SurfaceFace;
  wallFace?: WallFace;
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
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">{room.name}</p>
        <h2>{faceLabel}</h2>
      </header>
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
        layers={resolveStack(assignment, assemblies, materials)}
        materials={materials}
        series={findAssembly(assemblies, assignment.constructionId)?.series ?? true}
        units={project.units}
        onChange={layers => onChange(writeSurface({ ...assignment, materialKey: null, layers }))}
      />
      )}
      {assignment && <ThermoNodeNote materialKey={assignment.materialKey} />}
      {assignment && (
      <TextField
        label="Note"
        value={assignment.note}
        onCommit={note => onChange(writeSurface({ ...assignment, note }))}
      />
      )}
      {face === 'walls' && !wallFace && <p className="muted">Choose one face. Each wall keeps its own stack.</p>}
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
  if (!room) return <p>Room not found.</p>;
  const unit = lengthUnit(project.units);
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
        <p className="prop-kicker">Room</p>
        <h2>{room.name}</h2>
      </header>
      <div className="stat-row">
        <span>{formatArea(room.lengthM * room.widthM, project.units)}</span>
        <span>
          {formatLength(room.lengthM, project.units, 2)} × {formatLength(room.widthM, project.units, 2)}
        </span>
        <span>
          {room.openings.length} opening{room.openings.length === 1 ? '' : 's'}
        </span>
      </div>
      {room.assumption && <p className="flag amber">Template assumption. Edit to make it your value.</p>}
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
      <div className="field-grid">
        <UnitField label="Length" unit={unit} value={mToLength(room.lengthM, project.units)} onCommit={value => setLength('lengthM', value)} />
        <UnitField label="Width" unit={unit} value={mToLength(room.widthM, project.units)} onCommit={value => setLength('widthM', value)} />
        <UnitField label="Height" unit={unit} value={mToLength(room.heightM, project.units)} onCommit={value => setLength('heightM', value)} />
        <UnitField label="Origin X" unit={unit} value={mToLength(room.xM, project.units)} onCommit={value => setLength('xM', value)} />
        <UnitField label="Origin Y" unit={unit} value={mToLength(room.yM, project.units)} onCommit={value => setLength('yM', value)} />
        <UnitField label="Floor Z" unit={unit} value={mToLength(room.zM, project.units)} onCommit={value => setLength('zM', value)} />
      </div>
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
          Remove room
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
      {opening.kind === 'opening' ? (
        <p className="muted">A plain opening has no door or window assembly.</p>
      ) : (
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
      <TextField label="Notes" value={system.notes} multiline onCommit={notes => onChange(updateSystem(project, system.id, { notes }))} />
      <ul className="plain-list">
        {members.map(item => {
          const product = getProduct(item.catalogId);
          return (
            <li key={item.id}>
              <button type="button" className="linkish" onClick={() => onSelect({ kind: 'equipment', id: item.id })}>
                {product ? `${product.manufacturer} ${product.model}` : item.catalogId} × {item.quantity}
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
  const unit = lengthUnit(project.units);
  const setLength = (key: 'xM' | 'yM' | 'zM', display: number) => {
    onChange(updateEquipment(project, item.id, { [key]: lengthToM(display, project.units) }));
  };
  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Equipment</p>
        <h2>{product ? product.name : 'Missing product'}</h2>
      </header>
      <p className="flag amber">Planning placement. Not sized or validated by a solver.</p>
      {product && (
        <dl className="spec-list">
          <div>
            <dt>Manufacturer</dt>
            <dd>{product.manufacturer}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{product.model}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{CATEGORY_LABEL[product.category]}</dd>
          </div>
          <div>
            <dt>Supplier</dt>
            <dd>{product.supplier}</dd>
          </div>
          <div>
            <dt>Document</dt>
            <dd>{product.documentUrl ?? 'None'}</dd>
          </div>
          <div>
            <dt>Image</dt>
            <dd>None supplied</dd>
          </div>
          <div>
            <dt>Mount</dt>
            <dd>{product.mount}</dd>
          </div>
        </dl>
      )}
      {product && product.gaps.length > 0 && (
        <ul className="issue-list">
          {product.gaps.map(gap => (
            <li key={gap} className="warning">
              {gap}
            </li>
          ))}
        </ul>
      )}
      <div className="field-grid">
        <UnitField label="Center X" unit={unit} value={mToLength(item.xM, project.units)} onCommit={value => setLength('xM', value)} />
        <UnitField label="Center Y" unit={unit} value={mToLength(item.yM, project.units)} onCommit={value => setLength('yM', value)} />
        <UnitField label="Bottom Z" unit={unit} value={mToLength(item.zM, project.units)} onCommit={value => setLength('zM', value)} />
        <UnitField label="Yaw" unit="deg" value={item.yawDeg} onCommit={yawDeg => onChange(updateEquipment(project, item.id, { yawDeg }))} />
      </div>
      <label className="field">
        <span>Room</span>
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
      <p className="muted">Quantity is a schedule count. The model shows one footprint.</p>
      <TextField label="Notes" value={item.notes} multiline onCommit={notes => onChange(updateEquipment(project, item.id, { notes }))} />
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
