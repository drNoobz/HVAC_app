import { getProduct, type UnitPortRole } from './catalog';
import { isBranch, OFF_AIRSTREAM_KINDS, unitFlows, unitRoles, unitSections, SECTION_LABEL } from './airUnits';
import type { PlacedEquipment, UnitSection, UnitSectionKind } from './types';

/**
 * A unit broken down into equipment and the ducts between them, drawn as a control diagram inside the unit's plan
 * footprint. Sections are nodes; internal ducts are links that carry one air stream in the direction the air moves.
 * Casing connections are port nodes. Topology and airflow bookkeeping only, no physics: a solver walks this later.
 */

export type UnitStream = 'outdoor' | 'return' | 'mixed' | 'supply' | 'exhaust';

export const UNIT_STREAM_LABEL: Record<UnitStream, string> = {
  outdoor: 'Outdoor air',
  return: 'Return air',
  mixed: 'Mixed air',
  supply: 'Supply air',
  exhaust: 'Exhaust / relief air',
};

export const PORT_ROLE_TAG: Record<UnitPortRole, string> = { oa: 'OA', ra: 'RA', sa: 'SA', ea: 'EA' };
export const PORT_ROLE_LABEL: Record<UnitPortRole, string> = { oa: 'Outdoor air', ra: 'Return air', sa: 'Supply air', ea: 'Exhaust air' };

export type UnitNode =
  | { id: string; kind: 'port'; role: UnitPortRole; ducted: boolean }
  | { id: string; kind: 'section'; sectionId: string }
  /** Where the return air divides between relief and recirculation. */
  | { id: string; kind: 'split' };

export interface UnitLink {
  id: string;
  from: string;
  to: string;
  stream: UnitStream;
}

/** A section drawn in its duct, metres from the unit centre before rotation. +x runs along the length, +y across. */
export interface UnitComponent {
  section: UnitSection;
  x: number;
  y: number;
  /** Direction the air moves through it along x. */
  dir: 1 | -1;
  /** Side of the duct its tag and sensors sit on (+1 toward +y). */
  side: 1 | -1;
  /** Extent across the unit when it spans more than its own duct (mixing plenum, heat-recovery core, condenser). */
  y0: number;
  y1: number;
  /** A block off the airstream (condenser): its length along the unit and its fans, seen from above. */
  block?: { x0: number; x1: number; fans: { x: number; y: number; r: number }[] };
}

export interface UnitDuct extends UnitLink {
  /** Centreline in the direction of airflow, unit-local metres. */
  points: { x: number; y: number }[];
}

export interface UnitPortMark {
  role: UnitPortRole;
  /** False for a hood or louver on the casing, with no duct. */
  ducted: boolean;
  direction: 'in' | 'out';
  x: number;
  y: number;
  /** +1 when the casing face is at +x. */
  face: 1 | -1;
}

export interface UnitLayout {
  components: UnitComponent[];
  ducts: UnitDuct[];
  ports: UnitPortMark[];
  /** Inside height of every internal duct, metres. */
  ductM: number;
  /** Column pitch, metres: room each component has along the duct. */
  pitchM: number;
}

const EXHAUST_SIDE: UnitSectionKind[] = ['relief-fan', 'exhaust-damper'];
const CONDITIONING: UnitSectionKind[] = ['cooling-coil', 'heating-coil', 'supply-fan', 'heat-recovery', 'humidifier'];
/** Duct height as a share of a lane. */
const DUCT_SHARE = 0.58;

const sectionNode = (section: UnitSection) => `s:${section.id}`;
const portNode = (role: UnitPortRole) => `port:${role}`;

/** Grid coordinates: c along the length in columns, l across in lanes from the +y side. */
type Pt = [number, number];

interface GridComponent {
  section: UnitSection;
  c: number;
  l: number;
  dir: 1 | -1;
  l0: number;
  l1: number;
}

interface GridDuct {
  from: string;
  to: string;
  stream: UnitStream;
  points: Pt[];
}

interface Grid {
  /** Columns the main duct runs through, where a condenser can sit beside it. Null when there is none. */
  besideMain: [number, number] | null;
  cols: number;
  lanes: number;
  components: GridComponent[];
  ducts: GridDuct[];
  ports: { role: UnitPortRole; direction: 'in' | 'out'; c: number; l: number }[];
  mirror: boolean;
}

const EMPTY: Grid = { besideMain: null, cols: 0, lanes: 1, components: [], ducts: [], ports: [], mirror: false };

/**
 * Mixed-air units (rooftops, mixed-air AHUs, make-up air). Outdoor, return, and exhaust ducts enter at the intake
 * end, one lane each. Return air splits to the exhaust path, then passes the return damper; outdoor and return air
 * meet in a riser (the mixing box) that feeds the main duct, which runs through the main sections to supply.
 */
function mixedGrid(sections: UnitSection[], portV: (role: UnitPortRole) => number): Grid {
  const exhaust = sections.filter(section => EXHAUST_SIDE.includes(section.kind));
  const outdoorDamper = sections.find(section => section.kind === 'oa-damper');
  const returnDamper = sections.find(section => section.kind === 'ra-damper');
  const mixingBox = sections.find(section => section.kind === 'mixing-box');
  const main = sections.filter(section => !isBranch(section) && section !== mixingBox && !OFF_AIRSTREAM_KINDS.includes(section.kind));
  const hasReturn = !!returnDamper || !!mixingBox;
  const laneRoles: ('oa' | 'ra' | 'ea')[] = [];
  if (outdoorDamper) laneRoles.push('oa');
  if (hasReturn) laneRoles.push('ra');
  if (exhaust.length > 0 && hasReturn) laneRoles.push('ea');
  // Lanes follow the casing connections top to bottom; the stable sort keeps OA, RA, EA on ties.
  laneRoles.sort((a, b) => portV(b) - portV(a));
  const lanes = Math.max(1, laneRoles.length);
  const laneY = (role: 'oa' | 'ra' | 'ea') => laneRoles.indexOf(role) + 0.5;
  const mainY = lanes / 2;
  const exCols = laneRoles.includes('ea') ? exhaust.length : 0;
  const damperCol = outdoorDamper || returnDamper ? exCols : null;
  const afterDampers = exCols + (damperCol != null ? 1 : 0);
  const joining = laneRoles.filter(role => role !== 'ea');
  const riser = !!mixingBox || joining.length > 1 || (joining.length === 1 && laneY(joining[0]) !== mainY);
  const riserCol = riser ? afterDampers : null;
  const mainStart = afterDampers + (riser ? 1 : 0);
  const cols = mainStart + main.length;
  if (cols === 0) return EMPTY;
  const mid = (c: number) => c + 0.5;
  const riserX = riserCol != null ? mid(riserCol) : null;

  const components: GridComponent[] = [];
  const at = (section: UnitSection, c: number, l: number, dir: 1 | -1, l0 = l, l1 = l) => components.push({ section, c, l, dir, l0, l1 });
  if (outdoorDamper && damperCol != null) at(outdoorDamper, mid(damperCol), laneY('oa'), 1);
  if (returnDamper && damperCol != null) at(returnDamper, mid(damperCol), laneY('ra'), 1);
  if (exCols > 0) exhaust.forEach((section, index) => at(section, mid(exCols - 1 - index), laneY('ea'), -1));
  if (mixingBox && riserX != null) {
    const ys = [...joining.map(laneY), mainY];
    at(mixingBox, riserX, mainY, 1, Math.min(...ys), Math.max(...ys));
  }
  main.forEach((section, index) => at(section, mid(mainStart + index), mainY, 1));

  const ducts: GridDuct[] = [];
  const ports: Grid['ports'] = [];
  const add = (from: string, to: string, stream: UnitStream, points: Pt[]) => ducts.push({ from, to, stream, points });
  const firstMain = main[0] ? sectionNode(main[0]) : portNode('sa');
  const firstMainX = main[0] ? mid(mainStart) : cols;
  const mixTarget = mixingBox ? sectionNode(mixingBox) : firstMain;
  /** From a point on a joining lane into the main duct: up or down the riser, then along. */
  const intoMain = (x: number, y: number): Pt[] => {
    if (riserX == null) return [[x, y], [firstMainX, y]];
    const end: Pt[] = mixingBox ? [[riserX, mainY]] : [[riserX, mainY], [firstMainX, mainY]];
    return [[x, y], [riserX, y], ...end];
  };
  const inletStream: UnitStream = outdoorDamper && hasReturn ? 'mixed' : outdoorDamper ? 'outdoor' : hasReturn ? 'return' : 'supply';

  if (outdoorDamper && damperCol != null) {
    const y = laneY('oa');
    ports.push({ role: 'oa', direction: 'in', c: 0, l: y });
    add(portNode('oa'), sectionNode(outdoorDamper), 'outdoor', [[0, y], [mid(damperCol), y]]);
    add(sectionNode(outdoorDamper), mixTarget, 'outdoor', intoMain(mid(damperCol), y));
  }
  if (hasReturn) {
    const y = laneY('ra');
    ports.push({ role: 'ra', direction: 'in', c: 0, l: y });
    const recirculate = returnDamper ? sectionNode(returnDamper) : mixTarget;
    let from = portNode('ra');
    let fromX = 0;
    if (exCols > 0) {
      const splitX = exCols + 0.18;
      add(portNode('ra'), 'split:ra', 'return', [[0, y], [splitX, y]]);
      add('split:ra', sectionNode(exhaust[0]), 'return', [[splitX, y], [splitX, laneY('ea')], [mid(exCols - 1), laneY('ea')]]);
      from = 'split:ra';
      fromX = splitX;
    }
    if (returnDamper && damperCol != null) {
      add(from, recirculate, 'return', [[fromX, y], [mid(damperCol), y]]);
      add(sectionNode(returnDamper), mixTarget, 'return', intoMain(mid(damperCol), y));
    } else {
      add(from, recirculate, 'return', intoMain(fromX, y));
    }
  }
  if (exCols > 0) {
    const y = laneY('ea');
    exhaust.forEach((section, index) => {
      const x = mid(exCols - 1 - index);
      const next = exhaust[index + 1];
      if (next) add(sectionNode(section), sectionNode(next), 'exhaust', [[x, y], [x - 1, y]]);
      else add(sectionNode(section), portNode('ea'), 'exhaust', [[x, y], [0, y]]);
    });
    ports.push({ role: 'ea', direction: 'out', c: 0, l: y });
  }
  if (mixingBox && riserX != null) add(sectionNode(mixingBox), firstMain, inletStream, [[riserX, mainY], [firstMainX, mainY]]);
  if (main.length > 0) {
    const conditioned = main.findIndex(section => CONDITIONING.includes(section.kind));
    main.forEach((section, index) => {
      const x = mid(mainStart + index);
      const next = main[index + 1];
      const stream: UnitStream = conditioned >= 0 && index >= conditioned ? 'supply' : inletStream;
      if (next) add(sectionNode(section), sectionNode(next), stream, [[x, mainY], [x + 1, mainY]]);
      else add(sectionNode(section), portNode('sa'), 'supply', [[x, mainY], [cols, mainY]]);
    });
    ports.push({ role: 'sa', direction: 'out', c: cols, l: mainY });
  }
  return { besideMain: main.length > 0 ? [mainStart, cols] : null, cols, lanes, components, ducts, ports, mirror: false };
}

/**
 * Units with a heat-recovery core and no mixing (ERV, HRV): two ducts that cross the core in opposite directions.
 * Outdoor air runs through the core to supply; return air runs back through it to exhaust.
 */
function dualGrid(sections: UnitSection[], core: UnitSection, port: (role: UnitPortRole) => { u: number; v: number }): Grid {
  const exhaustKinds: UnitSectionKind[] = ['ra-damper', ...EXHAUST_SIDE, ...OFF_AIRSTREAM_KINDS];
  const train = sections.filter(section => !exhaustKinds.includes(section.kind));
  const coreIndex = train.indexOf(core);
  const supplyUp = train.slice(0, coreIndex);
  const supplyDown = train.slice(coreIndex + 1);
  const exhaustUp = sections.filter(section => section.kind === 'ra-damper');
  const exhaustDown = sections.filter(section => EXHAUST_SIDE.includes(section.kind));
  const left = Math.max(supplyUp.length, exhaustDown.length);
  const right = Math.max(supplyDown.length, exhaustUp.length);
  const cols = left + 1 + right;
  const supplyY = port('sa').v >= port('ra').v ? 0.5 : 1.5;
  const exhaustY = 2 - supplyY;
  const coreX = left + 0.5;
  const components: GridComponent[] = [{ section: core, c: coreX, l: 1, dir: 1, l0: Math.min(supplyY, exhaustY), l1: Math.max(supplyY, exhaustY) }];
  const where = new Map<UnitSection, number>();
  const place = (group: UnitSection[], from: number, span: number, y: number, reverse: boolean) => {
    const pitch = group.length > 0 ? span / group.length : 0;
    group.forEach((section, index) => {
      const c = reverse ? from + span - (index + 0.5) * pitch : from + (index + 0.5) * pitch;
      where.set(section, c);
      components.push({ section, c, l: y, dir: reverse ? -1 : 1, l0: y, l1: y });
    });
  };
  place(supplyUp, 0, left, supplyY, false);
  place(supplyDown, left + 1, right, supplyY, false);
  place(exhaustUp, left + 1, right, exhaustY, true);
  place(exhaustDown, 0, left, exhaustY, true);
  const ducts: GridDuct[] = [];
  const chain = (nodes: (UnitSection | UnitPortRole)[], y: number, forward: boolean, before: UnitStream, after: UnitStream) => {
    const x = (node: UnitSection | UnitPortRole, first: boolean) =>
      typeof node === 'string' ? ((first ? forward : !forward) ? 0 : cols) : node === core ? coreX : where.get(node)!;
    let passed = false;
    for (let index = 0; index + 1 < nodes.length; index += 1) {
      const a = nodes[index];
      const b = nodes[index + 1];
      if (a === core) passed = true;
      ducts.push({
        from: typeof a === 'string' ? portNode(a) : sectionNode(a),
        to: typeof b === 'string' ? portNode(b) : sectionNode(b),
        stream: passed ? after : before,
        points: [[x(a, index === 0), y], [x(b, false), y]],
      });
    }
  };
  chain(['oa', ...supplyUp, core, ...supplyDown, 'sa'], supplyY, true, 'outdoor', 'supply');
  chain(['ra', ...exhaustUp, core, ...exhaustDown, 'ea'], exhaustY, false, 'return', 'exhaust');
  const ports: Grid['ports'] = [
    { role: 'oa', direction: 'in', c: 0, l: supplyY },
    { role: 'sa', direction: 'out', c: cols, l: supplyY },
    { role: 'ra', direction: 'in', c: cols, l: exhaustY },
    { role: 'ea', direction: 'out', c: 0, l: exhaustY },
  ];
  return { besideMain: null, cols, lanes: 2, components, ducts, ports, mirror: port('oa').u > port('sa').u };
}

function unitGrid(item: Pick<PlacedEquipment, 'catalogId' | 'sections'>): Grid {
  const sections = unitSections(item);
  const spec = getProduct(item.catalogId)?.unit;
  const port = (role: UnitPortRole) => spec?.portAt[role] ?? { u: role === 'sa' ? 1 : -1, v: 0 };
  const core = sections.find(section => section.kind === 'heat-recovery');
  const mixing = sections.some(section => section.kind === 'mixing-box');
  return core && !mixing ? dualGrid(sections, core, port) : mixedGrid(sections, role => port(role).v);
}

/** The unit's components and internal ducts laid out in its plan footprint (length along x, width across y). */
export function unitLayout(item: Pick<PlacedEquipment, 'catalogId' | 'sections'>, length: number, width: number): UnitLayout {
  const grid = unitGrid(item);
  if (grid.cols === 0) return { components: [], ducts: [], ports: [], ductM: 0, pitchM: 0 };
  const colM = length / grid.cols;
  const laneM = width / grid.lanes;
  const flip = grid.mirror ? -1 : 1;
  const X = (c: number) => flip * (-length / 2 + c * colM);
  const Y = (l: number) => width / 2 - l * laneM;
  const ductM = Math.min(laneM * DUCT_SHARE, colM * 0.9);
  const ducted = new Set(unitRoles(unitSections(item)));
  const components: UnitComponent[] = grid.components.map(component => {
    const y = Y(component.l);
    const ya = Y(component.l0);
    const yb = Y(component.l1);
    return {
      section: component.section,
      x: X(component.c),
      y,
      dir: (component.dir * flip) as 1 | -1,
      side: (y < -1e-9 ? -1 : 1) as 1 | -1,
      y0: Math.min(ya, yb) - ductM / 2,
      y1: Math.max(ya, yb) + ductM / 2,
    };
  });
  const ducts = grid.ducts.map(duct => ({
    id: `${duct.from}>${duct.to}`,
    from: duct.from,
    to: duct.to,
    stream: duct.stream,
    points: duct.points
      .map(([c, l]) => ({ x: X(c), y: Y(l) }))
      .filter((point, index, all) => index === 0 || Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) > 1e-9),
  }));
  // Condenser: beside the main duct on the −y side, its fans in a row along the unit.
  const condenser = unitSections(item).find(section => section.kind === 'condenser');
  if (condenser && grid.besideMain) {
    const gap = ductM * 0.35;
    const xa = X(grid.besideMain[0]);
    const xb = X(grid.besideMain[1]);
    const x0 = Math.min(xa, xb) + gap;
    const x1 = Math.max(xa, xb) - gap;
    const y1 = -ductM / 2 - gap;
    const y0 = -width / 2 + gap * 0.6;
    if (x1 > x0 && y1 > y0) {
      const count = Math.max(1, Math.min(6, Math.round(condenser.fanCount ?? 1)));
      const coilM = Math.min((y1 - y0) * 0.14, ductM * 0.3);
      const pitch = (x1 - x0) / count;
      const r = Math.min(pitch * 0.42, (y1 - y0 - coilM) * 0.44);
      const fanY = (y0 + coilM + y1) / 2;
      components.push({
        section: condenser,
        x: (x0 + x1) / 2,
        y: (y0 + y1) / 2,
        dir: 1,
        side: -1,
        y0,
        y1,
        block: { x0, x1, fans: Array.from({ length: count }, (_, index) => ({ x: x0 + pitch * (index + 0.5), y: fanY, r })) },
      });
    }
  }
  const ports = grid.ports.map(port => {
    const x = X(port.c);
    return { role: port.role, direction: port.direction, ducted: ducted.has(port.role), x, y: Y(port.l), face: (x >= 0 ? 1 : -1) as 1 | -1 };
  });
  return { components, ducts, ports, ductM, pitchM: colM };
}

/** The unit as nodes and links, for a solver or a points list. */
export function unitNetwork(item: Pick<PlacedEquipment, 'catalogId' | 'sections'>): { nodes: UnitNode[]; links: UnitLink[] } {
  const layout = unitLayout(item, 1, 1);
  const nodes: UnitNode[] = [
    ...layout.ports.map(port => ({ id: portNode(port.role), kind: 'port' as const, role: port.role, ducted: port.ducted })),
    ...layout.components.map(component => ({ id: sectionNode(component.section), kind: 'section' as const, sectionId: component.section.id })),
  ];
  if (layout.ducts.some(duct => duct.from === 'split:ra')) nodes.push({ id: 'split:ra', kind: 'split' });
  return { nodes, links: layout.ducts.map(({ id, from, to, stream }) => ({ id, from, to, stream })) };
}

/** Section id behind a node id, or null for ports and the split. */
export function nodeSectionId(nodeId: string): string | null {
  return nodeId.startsWith('s:') ? nodeId.slice(2) : null;
}

/** Plain name of a node for the inspector. */
export function nodeName(item: Pick<PlacedEquipment, 'catalogId' | 'sections'>, nodeId: string): string {
  if (nodeId === 'split:ra') return 'Return split';
  if (nodeId.startsWith('port:')) return `${PORT_ROLE_LABEL[nodeId.slice(5) as UnitPortRole]} connection`;
  const section = unitSections(item).find(entry => entry.id === nodeSectionId(nodeId));
  return section ? SECTION_LABEL[section.kind] : 'Section';
}

/** Design airflow in one internal duct, from the unit's fan and damper inputs. Bookkeeping, not a solve. */
export function unitDuctFlow(item: Pick<PlacedEquipment, 'catalogId' | 'sections'>, link: UnitLink): number | null {
  const flows = unitFlows(item);
  switch (link.stream) {
    case 'outdoor':
      return flows.outdoor;
    case 'exhaust':
      return flows.exhaust;
    case 'mixed':
    case 'supply':
      return flows.supply;
    case 'return':
      if (link.to.startsWith('s:')) {
        const section = unitSections(item).find(entry => entry.id === nodeSectionId(link.to));
        if (section && EXHAUST_SIDE.includes(section.kind)) return flows.exhaust;
      }
      if (link.from === 'split:ra' || (link.from.startsWith('s:') && unitSections(item).find(entry => entry.id === nodeSectionId(link.from))?.kind === 'ra-damper')) {
        return flows.return != null ? Math.max(0, flows.return - (flows.exhaust ?? 0)) : null;
      }
      return flows.return;
  }
}
