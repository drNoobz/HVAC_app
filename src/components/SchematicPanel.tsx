'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { getProduct } from '@/domain/catalog';
import { COIL_MEDIUM_LABEL, designFlow, placedPorts, portFlow, unitFlows, unitSections } from '@/domain/airUnits';
import { isBranch, stateParts, unitStations, type Psy, type UnitStations } from '@/domain/airStates';
import { siteOf } from '@/domain/climate';
import { streamFor } from '@/domain/ductCatalog';
import { ductFlows, DUCT_SERVICE_LABEL, type SourcePortFlow } from '@/domain/ducts';
import type { DesignSeason, DuctService, HvacSystem, PlacedEquipment, Project, Selection, UnitSection } from '@/domain/types';
import { formatFlow, formatNumber } from '@/domain/units';

const INK = '#1c2430';
const MUTED = '#5c6b7a';
const DUCT_FILL = '#f6f9fb';
const SELECT = '#0f6e78';
const BAND = 56;
const SLOT = 150;
const FONT = 11;

const SOURCE_COLOR: Record<Psy['source'], string> = {
  entered: INK,
  site: '#8a5a00',
  calculated: '#0f6e78',
  carried: '#8a96a3',
};

const SOURCE_LABEL: Record<Psy['source'], string> = {
  entered: 'Entered',
  site: 'Site climate',
  calculated: 'Calculated',
  carried: 'Carried from upstream',
};

function flowText(value: number | null | undefined, units: Project['units']): string {
  return value == null ? 'flow not set' : formatFlow(value, units);
}

function powerText(watts: number | null | undefined, units: Project['units']): string | null {
  if (watts == null) return null;
  return units === 'IP' ? `${formatNumber(watts / 293.07107, 0)} kBtu/h` : `${formatNumber(watts / 1000, 1)} kW`;
}

/** Two or three short lines describing a station condition. */
function StateText({ state, x, y, pKpa, units, anchor = 'start' }: { state: Psy | null | undefined; x: number; y: number; pKpa: number; units: Project['units']; anchor?: 'start' | 'middle' | 'end' }) {
  if (!state) return null;
  const parts = stateParts(state, pKpa, units);
  const lines = [parts.db, parts.wb, parts.rh].filter((line): line is string => !!line);
  return (
    <text x={x} y={y} fontSize={FONT - 1} textAnchor={anchor} fill={SOURCE_COLOR[state.source]} fontStyle={state.source === 'carried' ? 'italic' : undefined}>
      <title>{SOURCE_LABEL[state.source]}</title>
      {lines.map((line, index) => (
        <tspan key={line} x={x} dy={index === 0 ? 0 : FONT + 1}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function Damper({ x, y, h, position, vertical = false }: { x: number; y: number; h: number; position?: string; vertical?: boolean }) {
  if (vertical) {
    return (
      <g>
        <rect x={x - h / 2} y={y - 7} width={h} height={14} fill="white" stroke={INK} />
        {[-0.3, 0, 0.3].map(f => (
          <line key={f} x1={x + f * h - 5} y1={y + 5} x2={x + f * h + 5} y2={y - 5} stroke={INK} />
        ))}
        {position && <text x={x - h / 2 - 6} y={y + 4} fontSize={FONT} fontWeight={600} textAnchor="end" fill={INK}>{position}</text>}
      </g>
    );
  }
  return (
    <g>
      <rect x={x - 7} y={y} width={14} height={h} fill="white" stroke={INK} />
      {[0.2, 0.5, 0.8].map(f => (
        <line key={f} x1={x - 5} y1={y + f * h + 5} x2={x + 5} y2={y + f * h - 5} stroke={INK} />
      ))}
      {position && <text x={x + 10} y={y - 6} fontSize={FONT} fontWeight={600} fill={INK}>{position}</text>}
    </g>
  );
}

function Fan({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M ${x + 18} ${y - 18} L ${x + 26} ${y - 18} L ${x + 26} ${y - 6}`} fill="none" stroke={INK} />
      <circle cx={x} cy={y} r={18} fill="white" stroke={INK} />
      <circle cx={x} cy={y} r={2.5} fill={INK} />
      <path d={`M ${x - 11} ${y - 6} A 12 12 0 0 1 ${x + 6} ${y - 11}`} fill="none" stroke={INK} />
    </g>
  );
}

function Coil({ x, y, h }: { x: number; y: number; h: number }) {
  return (
    <g>
      <rect x={x - 9} y={y} width={18} height={h} fill="white" stroke={INK} />
      <line x1={x - 9} y1={y + h} x2={x + 9} y2={y} stroke={INK} />
    </g>
  );
}

function SectionSymbol({ section, x, y, units }: { section: UnitSection; x: number; y: number; units: Project['units'] }): ReactNode {
  const h = BAND;
  const mid = y + h / 2;
  const title = (text: string) => (
    <text x={x} y={y - 8} fontSize={FONT} fontWeight={600} textAnchor="middle" fill={INK}>{text}</text>
  );
  switch (section.kind) {
    case 'supply-fan':
    case 'relief-fan':
      return (
        <g>
          <Fan x={x} y={mid} />
          {title(section.flowM3s != null ? `FAN ${formatFlow(section.flowM3s, units)}` : 'FAN')}
        </g>
      );
    case 'filter':
      return (
        <g>
          <polyline
            points={[0, 1, 2, 3, 4, 5, 6].map(i => `${x + (i % 2 === 0 ? -6 : 6)},${y + (i * h) / 6}`).join(' ')}
            fill="none"
            stroke={INK}
          />
          {title('FILTER')}
        </g>
      );
    case 'cooling-coil':
    case 'heating-coil': {
      const capacity = powerText(section.capacityW, units);
      return (
        <g>
          <Coil x={x} y={y} h={h} />
          {title(section.kind === 'cooling-coil' ? 'COOLING COIL' : 'HEATING COIL')}
          {section.medium === 'gas' ? (
            <line x1={x} y1={y + h} x2={x} y2={y + h + 26} stroke={INK} strokeDasharray="6 2 1 2" />
          ) : section.medium === 'electric' ? null : (
            <>
              <line x1={x - 5} y1={y + h} x2={x - 5} y2={y + h + 26} stroke={INK} />
              <line x1={x + 5} y1={y + h} x2={x + 5} y2={y + h + 26} stroke={INK} strokeDasharray="3 2" />
              <text x={x - 8} y={y + h + 14} fontSize={FONT - 2} textAnchor="end" fill={MUTED}>S</text>
              <text x={x + 8} y={y + h + 14} fontSize={FONT - 2} fill={MUTED}>R</text>
            </>
          )}
          <text x={x} y={y + h + 40} fontSize={FONT - 1} textAnchor="middle" fill={MUTED}>
            {section.medium ? COIL_MEDIUM_LABEL[section.medium] : 'Medium not set'}
          </text>
          {capacity && <text x={x} y={y + h + 53} fontSize={FONT - 1} textAnchor="middle" fill={MUTED}>{capacity}</text>}
        </g>
      );
    }
    case 'heat-recovery':
      return (
        <g>
          <rect x={x - 18} y={y + 6} width={36} height={h - 12} fill="white" stroke={INK} />
          <line x1={x - 18} y1={y + 6} x2={x + 18} y2={y + h - 6} stroke={INK} />
          <line x1={x - 18} y1={y + h - 6} x2={x + 18} y2={y + 6} stroke={INK} />
          {title('HEAT RECOVERY')}
        </g>
      );
    case 'humidifier':
      return (
        <g>
          <line x1={x} y1={y + 6} x2={x} y2={y + h - 6} stroke={INK} />
          {[0.25, 0.5, 0.75].map(f => <circle key={f} cx={x + 6} cy={y + f * h} r={2} fill={INK} />)}
          {title('HUMIDIFIER')}
        </g>
      );
    case 'mixing-box':
      return (
        <g>
          <line x1={x} y1={y + 4} x2={x} y2={y + h - 4} stroke={MUTED} strokeDasharray="3 3" />
          {title('MIXING')}
        </g>
      );
    default:
      return null;
  }
}

interface Group {
  label: string;
  /** Null when only outdoor terminals without their own airflow are in the group. */
  flow: number | null;
  rooms: string[];
}

/** Terminals reached from a port, grouped by product. */
function terminalGroups(project: Project, source: SourcePortFlow | undefined): Group[] {
  if (!source) return [];
  const groups = new Map<string, Group & { count: number }>();
  for (const id of source.terminalIds) {
    const item = project.equipment.find(entry => entry.id === id);
    const product = item ? getProduct(item.catalogId) : undefined;
    if (!item || !product) continue;
    const key = product.id;
    const room = project.rooms.find(entry => entry.id === item.roomId)?.name;
    const group = groups.get(key) ?? { label: `${product.manufacturer} ${product.model}`, flow: null, rooms: [], count: 0 };
    group.count += item.quantity;
    const flow = product.terminal === 'outdoor' ? item.designFlowM3s ?? null : designFlow(item);
    if (flow != null) group.flow = (group.flow ?? 0) + flow * item.quantity;
    if (room && !group.rooms.includes(room)) group.rooms.push(room);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ ...group, label: `${group.count} × ${group.label}` }));
}

function GroupText({ groups, x, y, units, anchor = 'start', empty }: { groups: Group[]; x: number; y: number; units: Project['units']; anchor?: 'start' | 'end'; empty: string }) {
  if (groups.length === 0) return <text x={x} y={y} fontSize={FONT - 1} textAnchor={anchor} fill="#8d2f2f">{empty}</text>;
  return (
    <text x={x} y={y} fontSize={FONT - 1} textAnchor={anchor} fill={MUTED}>
      {groups.map((group, index) => (
        <tspan key={group.label} x={x} dy={index === 0 ? 0 : FONT + 2}>
          {`${group.label}${group.flow != null ? ` · ${formatFlow(group.flow, units)}` : ''}${group.rooms.length > 0 ? ` · ${group.rooms.join(', ')}` : ''}`}
        </tspan>
      ))}
    </text>
  );
}

function Arrow({ x, y, dir }: { x: number; y: number; dir: 1 | -1 }) {
  return <path d={`M ${x} ${y - 6} L ${x + dir * 10} ${y} L ${x} ${y + 6}`} fill="none" stroke={INK} strokeWidth={1.4} />;
}

/** Process diagram of one air-handling unit, in the style of a mechanical flow schematic. */
function UnitDiagram({
  project,
  item,
  season,
  selected,
  sources,
  onSelect,
}: {
  project: Project;
  item: PlacedEquipment;
  season: DesignSeason;
  selected: boolean;
  sources: SourcePortFlow[];
  onSelect: (selection: Selection) => void;
}) {
  const product = getProduct(item.catalogId)!;
  const units = project.units;
  const sections = unitSections(item);
  const ports = placedPorts(item);
  const flows = unitFlows(item);
  const stations: UnitStations = unitStations(item, siteOf(project), season);
  const branch = sections.filter(isBranch);
  const main = sections.filter(section => !isBranch(section));
  const oa = branch.find(section => section.kind === 'oa-damper');
  const ra = branch.find(section => section.kind === 'ra-damper');
  const eaSections = branch.filter(section => section.kind === 'exhaust-damper' || section.kind === 'relief-fan');
  const hasReturn = !!ra || main.some(section => section.kind === 'mixing-box');
  const hasExhaust = eaSections.length > 0;
  const portFor = (service: DuctService) => ports.find(entry => entry.service === service);
  const sourceFor = (service: DuctService) => {
    const found = portFor(service);
    return found ? sources.find(row => row.equipmentId === item.id && row.portId === found.id) : undefined;
  };

  const LX = 260;
  const MIX = LX + 250;
  const mainY = 70;
  const eaY = mainY + BAND + 70;
  const raY = (hasExhaust ? eaY : mainY) + BAND + 70;
  const startX = MIX + BAND + 40;
  const endX = startX + main.length * SLOT + 20;
  const riserBottom = hasReturn ? raY + BAND : mainY + BAND;
  const height = riserBottom + 90;
  const width = endX + 330;

  const rows: { x: number; y: number; w: number; h: number }[] = [
    { x: oa ? LX : MIX, y: mainY, w: endX - (oa ? LX : MIX), h: BAND },
  ];
  const recirc = stations.recirculates;
  if (hasReturn) {
    const riserTop = recirc ? mainY + BAND / 2 : eaY + BAND / 2;
    if (recirc || hasExhaust) rows.push({ x: MIX, y: riserTop, w: BAND, h: riserBottom - riserTop });
    rows.push({ x: LX, y: raY, w: MIX + BAND - LX, h: BAND });
  }
  if (hasExhaust && hasReturn) rows.push({ x: LX, y: eaY, w: MIX + BAND / 2 - LX, h: BAND });

  const color = (service: DuctService) => {
    const system = project.systems.find(entry => entry.id === item.systemId);
    return (system && streamFor(system.kind, service)?.color) || MUTED;
  };
  const supplyGroups = terminalGroups(project, sourceFor('supply'));
  const returnGroups = terminalGroups(project, sourceFor('return'));
  const oaPort = portFor('outdoor');
  const eaPort = portFor('exhaust');
  const oaSource = sourceFor('outdoor');
  const eaSource = sourceFor('exhaust');
  const ra_y_label = raY + BAND / 2;

  return (
    <svg
      className={`schematic-svg${selected ? ' is-selected' : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${product.name} schematic`}
      onClick={() => onSelect({ kind: 'equipment', id: item.id })}
    >
      <text x={8} y={18} fontSize={FONT + 2} fontWeight={700} fill={selected ? SELECT : INK}>
        {`${product.model} · ${product.name}`}
      </text>
      <text x={8} y={34} fontSize={FONT} fill={MUTED}>
        {`Supply ${flowText(flows.supply, units)} · outdoor ${flowText(flows.outdoor, units)}${hasReturn ? ` · return ${flowText(flows.return, units)}` : ''}${hasExhaust ? ` · exhaust ${flowText(flows.exhaust, units)}` : ''}`}
      </text>
      {rows.map((row, index) => (
        <rect key={`s${index}`} x={row.x} y={row.y} width={row.w} height={row.h} fill="none" stroke={selected ? SELECT : INK} strokeWidth={1.3} />
      ))}
      {rows.map((row, index) => (
        <rect key={`f${index}`} x={row.x + 1} y={row.y + 1} width={row.w - 2} height={row.h - 2} fill={DUCT_FILL} />
      ))}
      {/* Supply outlet */}
      <path d={`M ${endX} ${mainY} L ${endX + 24} ${mainY + BAND / 2} L ${endX} ${mainY + BAND}`} fill={DUCT_FILL} stroke={selected ? SELECT : INK} strokeWidth={1.3} />
      <line x1={endX} y1={mainY + 1} x2={endX} y2={mainY + BAND - 1} stroke={DUCT_FILL} strokeWidth={2} />
      <text x={endX + 34} y={mainY + 16} fontSize={FONT} fontWeight={700} fill={color('supply')}>SUPPLY AIR</text>
      <text x={endX + 34} y={mainY + 30} fontSize={FONT} fill={INK}>{flowText(portFlow(item, portFor('supply')?.id ?? ''), units)}</text>
      <StateText state={stations.supply} x={endX + 34} y={mainY + 44} pKpa={stations.pKpa} units={units} />
      <GroupText groups={supplyGroups} x={endX + 34} y={mainY + BAND + 40} units={units} empty={portFor('supply') ? 'No supply terminals connected' : 'No supply fan section'} />

      {/* Outdoor air inlet */}
      {oa && (
        <g>
          <Arrow x={LX - 30} y={mainY + BAND / 2} dir={1} />
          <text x={LX - 36} y={mainY + 14} fontSize={FONT} fontWeight={700} textAnchor="end" fill={color('outdoor')}>FRESH AIR</text>
          <text x={LX - 36} y={mainY + 28} fontSize={FONT} textAnchor="end" fill={INK}>
            {`${flowText(oa.flowM3s, units)}${oaPort ? '' : ' · hood on casing'}`}
          </text>
          <StateText state={stations.outdoor} x={LX - 36} y={mainY + 42} pKpa={stations.pKpa} units={units} anchor="end" />
          <Damper x={LX + 110} y={mainY} h={BAND} position={oa.position} />
          {oaPort && oaSource && oaSource.terminals > 0 && (
            <GroupText groups={terminalGroups(project, oaSource)} x={LX - 36} y={mainY + 84} units={units} anchor="end" empty="" />
          )}
        </g>
      )}

      {/* Return air inlet and recirculation riser */}
      {hasReturn && (
        <g>
          <Arrow x={LX - 30} y={ra_y_label} dir={1} />
          <text x={LX - 36} y={raY + 14} fontSize={FONT} fontWeight={700} textAnchor="end" fill={color('return')}>RETURN AIR</text>
          <text x={LX - 36} y={raY + 28} fontSize={FONT} textAnchor="end" fill={INK}>{flowText(flows.return, units)}</text>
          <StateText state={stations.ret} x={LX - 36} y={raY + 42} pKpa={stations.pKpa} units={units} anchor="end" />
          <GroupText groups={returnGroups} x={LX} y={raY + BAND + 18} units={units} empty={portFor('return') ? 'No return terminals connected' : ''} />
          {ra && (
            <Damper
              x={MIX + BAND / 2}
              y={!recirc ? (eaY + BAND + raY) / 2 : hasExhaust ? (mainY + BAND + eaY) / 2 : (mainY + BAND + raY) / 2}
              h={BAND}
              position={ra.position}
              vertical
            />
          )}
        </g>
      )}

      {/* Exhaust branch */}
      {hasExhaust && hasReturn && (
        <g>
          <Arrow x={LX - 20} y={eaY + BAND / 2} dir={-1} />
          <text x={LX - 36} y={eaY + 14} fontSize={FONT} fontWeight={700} textAnchor="end" fill={color('exhaust')}>EXHAUST</text>
          <text x={LX - 36} y={eaY + 28} fontSize={FONT} textAnchor="end" fill={INK}>
            {`${flowText(flows.exhaust, units)}${eaPort ? '' : ' · on casing'}`}
          </text>
          {eaPort && eaSource && eaSource.terminals > 0 && (
            <GroupText groups={terminalGroups(project, eaSource)} x={LX - 36} y={eaY + 42} units={units} anchor="end" empty="" />
          )}
          {eaSections.map((section, index) => {
            const x = LX + 80 + index * 110;
            if (section.kind === 'relief-fan') {
              return (
                <g key={section.id}>
                  <Fan x={x} y={eaY + BAND / 2} />
                  <text x={x} y={eaY - 8} fontSize={FONT} fontWeight={600} textAnchor="middle" fill={INK}>
                    {section.flowM3s != null ? `FAN ${formatFlow(section.flowM3s, units)}` : 'EXHAUST FAN'}
                  </text>
                </g>
              );
            }
            return <Damper key={section.id} x={x} y={eaY} h={BAND} position={section.position} />;
          })}
        </g>
      )}


      {/* Supply path sections */}
      {main.map((section, index) => {
        const x0 = startX + index * SLOT;
        const cx = x0 + 34;
        return (
          <Fragment key={section.id}>
            <SectionSymbol section={section} x={cx} y={mainY} units={units} />
            {stations.leaving.get(section.id)?.source !== 'carried' && (
              <StateText state={stations.leaving.get(section.id)} x={cx + 28} y={mainY + 20} pKpa={stations.pKpa} units={units} />
            )}
          </Fragment>
        );
      })}
    </svg>
  );
}

/** Fan, hood, or other non-unit source: inlet terminals → equipment → outlet terminals or discharge. */
function SourceRow({ project, item, sources, selected, onSelect }: { project: Project; item: PlacedEquipment; sources: SourcePortFlow[]; selected: boolean; onSelect: (selection: Selection) => void }) {
  const product = getProduct(item.catalogId)!;
  const units = project.units;
  const ports = placedPorts(item);
  const inlet = ports.find(entry => entry.direction === 'in');
  const outlet = ports.find(entry => entry.direction === 'out');
  const groupsFor = (portId: string | undefined) => terminalGroups(project, sources.find(row => row.equipmentId === item.id && row.portId === portId));
  const width = 860;
  const cx = 430;
  const y = 54;
  const flow = designFlow(item);
  const inletText = inlet ? groupsFor(inlet.id) : [];
  const outletText = outlet ? groupsFor(outlet.id) : [];
  return (
    <svg className={`schematic-svg${selected ? ' is-selected' : ''}`} viewBox={`0 0 ${width} 110`} width={width} height={110} role="img" aria-label={`${product.name} schematic`} onClick={() => onSelect({ kind: 'equipment', id: item.id })}>
      <text x={8} y={18} fontSize={FONT + 2} fontWeight={700} fill={selected ? SELECT : INK}>{`${product.model} · ${product.name}`}</text>
      <line x1={250} y1={y} x2={cx - 20} y2={y} stroke={INK} strokeWidth={1.3} />
      <line x1={cx + 20} y1={y} x2={610} y2={y} stroke={INK} strokeWidth={1.3} />
      <Arrow x={cx - 34} y={y} dir={1} />
      <Arrow x={600} y={y} dir={1} />
      <Fan x={cx} y={y} />
      <text x={cx} y={y + 34} fontSize={FONT} textAnchor="middle" fill={INK}>{flow != null ? formatFlow(flow, units) : 'flow not set'}</text>
      {inlet ? (
        <GroupText groups={inletText} x={244} y={y + 4} units={units} anchor="end" empty={`No ${DUCT_SERVICE_LABEL[inlet.service].toLowerCase()} inlet terminals`} />
      ) : (
        <text x={244} y={y + 4} fontSize={FONT - 1} textAnchor="end" fill={MUTED}>Grille on the fan face</text>
      )}
      {outlet ? (
        <GroupText groups={outletText} x={616} y={y + 4} units={units} empty="No discharge connected" />
      ) : (
        <text x={616} y={y + 4} fontSize={FONT - 1} fill={MUTED}>Discharges to outdoors</text>
      )}
    </svg>
  );
}

export function SchematicPanel({ project, selection, onSelect }: { project: Project; selection: Selection; onSelect: (selection: Selection) => void }) {
  const systems = project.systems;
  const firstWithUnit = systems.find(system => project.equipment.some(item => item.systemId === system.id && getProduct(item.catalogId)?.unit));
  const [systemId, setSystemId] = useState<string | null>(null);
  const [season, setSeason] = useState<DesignSeason>('cooling');
  const active: HvacSystem | undefined = systems.find(system => system.id === systemId) ?? firstWithUnit ?? systems[0];
  const sources = useMemo(() => ductFlows(project).sources, [project]);
  if (!active) {
    return (
      <div className="schematic">
        <p className="muted">No systems yet. Add a system and its equipment on the Build tab, or drop a system package from the catalogue.</p>
      </div>
    );
  }
  const members = project.equipment.filter(item => item.systemId === active.id);
  const units = members.filter(item => getProduct(item.catalogId)?.unit);
  const others = members.filter(item => {
    const product = getProduct(item.catalogId);
    return product && !product.unit && !product.terminal && product.category !== 'kitchen-hood' && placedPorts(item).length > 0;
  });
  const selectedId = selection.kind === 'equipment' ? selection.id : null;
  return (
    <div className="schematic">
      <header className="schematic-head">
        <div className="chip-row" role="tablist" aria-label="System">
          {systems.map(system => (
            <button key={system.id} type="button" role="tab" aria-selected={system.id === active.id} className={system.id === active.id ? 'active' : ''} onClick={() => setSystemId(system.id)}>
              {system.name}
            </button>
          ))}
        </div>
        <div className="seg-row schematic-season" role="tablist" aria-label="Design season">
          {(['cooling', 'heating'] as const).map(entry => (
            <button key={entry} type="button" role="tab" aria-selected={season === entry} className={season === entry ? 'active' : ''} onClick={() => setSeason(entry)}>
              {entry === 'cooling' ? 'Cooling design' : 'Heating design'}
            </button>
          ))}
        </div>
      </header>
      {active.notes && <p className="muted schematic-notes">{active.notes}</p>}
      <div className="schematic-legend">
        {(['entered', 'site', 'calculated', 'carried'] as const).map(source => (
          <span key={source}>
            <i style={{ background: SOURCE_COLOR[source] }} />
            {SOURCE_LABEL[source]}
          </span>
        ))}
      </div>
      {units.length === 0 && others.length === 0 && (
        <p className="muted">This system has no unit or fan yet. Place one on the Build tab.</p>
      )}
      <div className="schematic-sheets">
        {units.map(item => (
          <UnitDiagram key={item.id} project={project} item={item} season={season} selected={selectedId === item.id} sources={sources} onSelect={onSelect} />
        ))}
        {others.map(item => (
          <SourceRow key={item.id} project={project} item={item} sources={sources} selected={selectedId === item.id} onSelect={onSelect} />
        ))}
      </div>
      <p className="muted schematic-foot">
        Drawn from the unit sections and the duct network. Click a unit to edit its sections and conditions. Mixed air is a volume-weighted planning mix, not a ThermoNode solve.
      </p>
    </div>
  );
}
