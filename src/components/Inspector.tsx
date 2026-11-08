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
  UNASSIGNED_SURFACE,
  updateEquipment,
  updateRoom,
  updateSystem,
} from '@/domain/projectOps';
import {
  BUILDING_TYPES,
  ROOM_USES,
  SURFACE_FACES,
  SYSTEM_KINDS,
  WALL_FACES,
  type OpeningKind,
  type Project,
  type Selection,
  type SurfaceFace,
} from '@/domain/types';
import { lengthToM, lengthUnit, mToLength } from '@/domain/units';
import { MATERIAL_SNAPSHOT } from '@/thermonode/materials';
import type { ModelIssueV1 } from '@/thermonode/contract';
import { TextField, UnitField } from './Fields';

const GROUPS: { id: 'insulation' | 'metal' | 'fluid'; label: string }[] = [
  { id: 'insulation', label: 'Insulation' },
  { id: 'metal', label: 'Metals' },
  { id: 'fluid', label: 'Fluids' },
];

export function Inspector({
  project,
  selection,
  issues,
  onChange,
  onSelect,
  onDeleteProject,
}: {
  project: Project;
  selection: Selection;
  issues: ModelIssueV1[];
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
  onDeleteProject: () => void;
}) {
  const subjectId = 'id' in selection ? selection.id : undefined;
  const relevant = issues.filter(issue => issue.severity !== 'info' && (!subjectId || issue.subjectId === subjectId));
  return (
    <aside className="inspector">
      <p className="kicker">Properties</p>
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
        <ProjectFields project={project} onChange={onChange} onDeleteProject={onDeleteProject} />
      )}
      {selection.kind === 'room' && (
        <RoomFields
          project={project}
          roomId={selection.id}
          onChange={onChange}
          onSelect={onSelect}
        />
      )}
      {selection.kind === 'opening' && (
        <OpeningFields project={project} roomId={selection.roomId} openingId={selection.id} onChange={onChange} onSelect={onSelect} />
      )}
      {selection.kind === 'system' && <SystemFields project={project} systemId={selection.id} onChange={onChange} onSelect={onSelect} />}
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
}: {
  project: Project;
  onChange: (project: Project) => void;
  onDeleteProject: () => void;
}) {
  return (
    <div className="stack">
      <h2>Project</h2>
      <p className="muted">Started from {project.createdFrom.label}. Stored lengths are meters. The display unit is {project.units === 'IP' ? 'feet' : 'meters'}.</p>
      <TextField label="Name" value={project.name} onCommit={name => onChange({ ...project, name })} />
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

function RoomFields({
  project,
  roomId,
  onChange,
  onSelect,
}: {
  project: Project;
  roomId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const room = project.rooms.find(item => item.id === roomId);
  if (!room) return <p>Room not found.</p>;
  const unit = lengthUnit(project.units);
  const setLength = (key: 'xM' | 'yM' | 'zM' | 'lengthM' | 'widthM' | 'heightM', display: number) => {
    onChange(updateRoom(project, room.id, { [key]: lengthToM(display, project.units), assumption: false }));
  };
  const setSurface = (face: SurfaceFace, materialKey: string | null) => {
    const note = materialKey
      ? `Assigned from the ThermoNode snapshot (${materialKey}). Confirm the assembly.`
      : UNASSIGNED_SURFACE;
    onChange(
      updateRoom(project, room.id, {
        assumption: false,
        surfaces: { ...room.surfaces, [face]: { materialKey, note } },
      })
    );
  };
  return (
    <div className="stack">
      <h2>{room.name}</h2>
      {room.assumption && <p className="flag amber">Template assumption. Edit to make it your value.</p>}
      <TextField label="Name" value={room.name} onCommit={name => onChange(updateRoom(project, room.id, { name, assumption: false }))} />
      <label className="field">
        <span>Use</span>
        <select value={room.use} onChange={event => onChange(updateRoom(project, room.id, { use: event.target.value, assumption: false }))}>
          {ROOM_USES.map(use => (
            <option key={use}>{use}</option>
          ))}
          {!ROOM_USES.includes(room.use as (typeof ROOM_USES)[number]) && <option>{room.use}</option>}
        </select>
      </label>
      <div className="field-grid">
        <UnitField label="Origin X" unit={unit} value={mToLength(room.xM, project.units)} onCommit={value => setLength('xM', value)} />
        <UnitField label="Origin Y" unit={unit} value={mToLength(room.yM, project.units)} onCommit={value => setLength('yM', value)} />
        <UnitField label="Floor Z" unit={unit} value={mToLength(room.zM, project.units)} onCommit={value => setLength('zM', value)} />
        <UnitField label="Length X" unit={unit} value={mToLength(room.lengthM, project.units)} onCommit={value => setLength('lengthM', value)} />
        <UnitField label="Width Y" unit={unit} value={mToLength(room.widthM, project.units)} onCommit={value => setLength('widthM', value)} />
        <UnitField label="Height Z" unit={unit} value={mToLength(room.heightM, project.units)} onCommit={value => setLength('heightM', value)} />
      </div>
      <h3>Surfaces</h3>
      <p className="muted">Materials are ThermoNode library ids. Emissivity is not in the snapshot. Unassigned means no matching library entry was chosen.</p>
      {SURFACE_FACES.map(face => {
        const assignment = room.surfaces[face.id];
        const material = assignment.materialKey ? MATERIAL_SNAPSHOT.find(item => item.key === assignment.materialKey) : undefined;
        return (
          <div key={face.id} className="surface-block">
            <label className="field">
              <span>{face.label}</span>
              <select value={assignment.materialKey ?? ''} onChange={event => setSurface(face.id, event.target.value || null)}>
                <option value="">Unassigned</option>
                {GROUPS.map(group => (
                  <optgroup key={group.id} label={group.label}>
                    {MATERIAL_SNAPSHOT.filter(item => item.plannerGroup === group.id).map(item => (
                      <option key={item.key} value={item.key}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {material && (
              <p className="spec">
                k {material.k} W/(m·K) · cp {material.cp} J/(kg·K) · ρ {material.rho} kg/m³ · reference constants
              </p>
            )}
            <TextField
              label={`${face.label} note`}
              value={assignment.note}
              onCommit={note =>
                onChange(updateRoom(project, room.id, { surfaces: { ...room.surfaces, [face.id]: { ...assignment, note } } }))
              }
            />
          </div>
        );
      })}
      <h3>Openings</h3>
      <div className="button-row">
        {(['door', 'window', 'opening'] as OpeningKind[]).map(kind => (
          <button key={kind} type="button" className="btn" onClick={() => onChange(updateRoom(project, room.id, addOpening(room, kind)))}>
            Add {kind}
          </button>
        ))}
      </div>
      <ul className="plain-list">
        {room.openings.map(opening => (
          <li key={opening.id}>
            <button type="button" className="linkish" onClick={() => onSelect({ kind: 'opening', roomId: room.id, id: opening.id })}>
              {opening.kind} · {opening.face} · {mToLength(opening.widthM, project.units).toFixed(2)} {unit}
            </button>
          </li>
        ))}
        {room.openings.length === 0 && <li className="muted">No doors, windows, or openings.</li>}
      </ul>
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
  onChange,
  onSelect,
}: {
  project: Project;
  roomId: string;
  openingId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const room = project.rooms.find(item => item.id === roomId);
  const opening = room?.openings.find(item => item.id === openingId);
  if (!room || !opening) return <p>Opening not found.</p>;
  const unit = lengthUnit(project.units);
  const patch = (partial: Partial<typeof opening>) => {
    onChange(
      updateRoom(project, room.id, {
        openings: room.openings.map(item => (item.id === opening.id ? { ...item, ...partial } : item)),
      })
    );
  };
  const asLength = (meters: number) => mToLength(meters, project.units);
  return (
    <div className="stack">
      <h2>{opening.kind}</h2>
      <p className="muted">Offset runs along the wall from the minimum corner. These openings are project data. GeometryDocument v1 has no door or window entity.</p>
      <label className="field">
        <span>Kind</span>
        <select value={opening.kind} onChange={event => patch({ kind: event.target.value as OpeningKind })}>
          <option value="door">Door</option>
          <option value="window">Window</option>
          <option value="opening">Opening</option>
        </select>
      </label>
      <label className="field">
        <span>Wall</span>
        <select value={opening.face} onChange={event => patch({ face: event.target.value as typeof opening.face })}>
          {WALL_FACES.map(face => (
            <option key={face.id} value={face.id}>
              {face.label}
            </option>
          ))}
        </select>
      </label>
      <UnitField label="Offset" unit={unit} value={asLength(opening.offsetM)} onCommit={value => patch({ offsetM: lengthToM(value, project.units) })} />
      <UnitField label="Width" unit={unit} value={asLength(opening.widthM)} onCommit={value => patch({ widthM: lengthToM(value, project.units) })} />
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
}: {
  project: Project;
  systemId: string;
  onChange: (project: Project) => void;
  onSelect: (selection: Selection) => void;
}) {
  const system = project.systems.find(item => item.id === systemId);
  if (!system) return <p>System not found.</p>;
  const members = project.equipment.filter(item => item.systemId === system.id);
  return (
    <div className="stack">
      <h2>{system.name}</h2>
      <p className="muted">A system groups equipment for the schedule. It does not size ducts or airflow.</p>
      <TextField label="Name" value={system.name} onCommit={name => onChange(updateSystem(project, system.id, { name }))} />
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
    <div className="stack">
      <h2>{product ? product.name : 'Missing product'}</h2>
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
