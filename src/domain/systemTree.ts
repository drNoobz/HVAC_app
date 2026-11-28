/**
 * The Systems tree: each system's equipment and ducts, sorted by kind of air and then by room, with items named by
 * tag. Each duct is listed once, in its system under the air it carries; there is no separate duct list. Studio draws it; this module only decides the structure, so the grouping can be tested without React.
 *
 *   Dining & bar comfort                RTU-1 · 3,000 CFM
 *     RTU-1  Rooftop unit                  3,000 CFM
 *     ● Supply air                         11 diffusers · 3,000 CFM
 *       Dining                             6 · 1,650 CFM
 *         SD-1  Supply diffuser             275 CFM
 *       Supply ducts                       12 runs · 48 m
 *         Main · SD-1–6                     ø 18 in · 1,650 CFM
 *         Branch · SD-4                     ø 10 in · 275 CFM
 */
import { designFlow, unitFlows } from './airUnits';
import { getProduct } from './catalog';
import { DUCT_SERVICE_LABEL, ductFlows, ductSizeLabel, ductViewOf, polylineLength } from './ducts';
import { compactTags, equipmentTag, tagKind, terminalService } from './tags';
import type { DuctRun, DuctService, PlacedEquipment, Project, Selection } from './types';
import { formatFlow, formatLength } from './units';

export interface OutlineNode {
  /** Unique within the tree; also the key for its open or closed state. */
  key: string;
  label: string;
  /** Plain description after the label, e.g. "Supply diffuser". */
  kind?: string;
  /** Right-hand figures, e.g. "275 CFM". */
  meta?: string;
  /** What a click selects. Groups without one open and close on click. */
  selection?: Selection;
  /** Equipment rows: the catalogue product, for the icon. */
  productId?: string;
  /** Air groups: the air type, for the colour dot. */
  service?: DuctService;
  /** Marked with a red "!" (a duct in a clash, or a group holding one). */
  warn?: boolean;
  children?: OutlineNode[];
}

const SERVICE_ORDER: DuctService[] = ['supply', 'return', 'outdoor', 'mixed', 'exhaust', 'relief'];

const AIR_LABEL: Record<DuctService, string> = {
  supply: 'Supply air',
  return: 'Return air',
  outdoor: 'Outdoor air',
  exhaust: 'Exhaust air',
  relief: 'Relief air',
  mixed: 'Mixed air',
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What to call a group's terminals: "diffusers", "grilles", or "terminals" when mixed. */
function terminalWord(items: PlacedEquipment[]): [string, string] {
  const kinds = new Set(items.map(item => tagKind(getProduct(item.catalogId)).kind));
  if (kinds.size === 1) {
    const kind = [...kinds][0].toLowerCase();
    const word = kind.split(' ').pop() ?? 'terminal';
    return [word, word.endsWith('s') ? word : `${word}s`];
  }
  return ['terminal', 'terminals'];
}

function itemFlow(item: PlacedEquipment): number | null {
  const product = getProduct(item.catalogId);
  if (product?.unit) return unitFlows(item).supply ?? designFlow(item);
  return designFlow(item);
}

function sumFlow(items: PlacedEquipment[], linked: Map<string, Connected>): number | null {
  let total = 0;
  let any = false;
  for (const item of items) {
    const flow = terminalFlow(item, linked);
    if (flow == null) continue;
    total += flow * Math.max(1, item.quantity);
    any = true;
  }
  return any ? total : null;
}

/** Natural order of tags: SD-2 before SD-10. */
function byTag(a: PlacedEquipment, b: PlacedEquipment): number {
  return equipmentTag(a).localeCompare(equipmentTag(b), undefined, { numeric: true });
}

/**
 * The ducts touching each item, and the air they carry. A pass-through terminal (a roof hood or louver with no design
 * airflow of its own) shows the air its duct carries, not its catalogue maximum, and joins that duct's air group.
 */
interface Connected {
  service: DuctService;
  flowM3s: number | null;
}

function connections(project: Project): Map<string, Connected> {
  const flows = ductFlows(project);
  const result = new Map<string, Connected>();
  for (const run of project.ducts ?? []) {
    if (ductViewOf(run) !== 'plan') continue;
    for (const end of [run.start, run.end]) {
      if (!end.equipmentId || result.has(end.equipmentId)) continue;
      result.set(end.equipmentId, { service: run.service, flowM3s: flows.runs.get(run.id)?.flowM3s ?? null });
    }
  }
  return result;
}

function terminalFlow(item: PlacedEquipment, linked: Map<string, Connected>): number | null {
  if (item.designFlowM3s == null) {
    const flow = linked.get(item.id)?.flowM3s;
    if (flow != null && flow > 0) return flow;
  }
  return designFlow(item);
}

function equipmentNode(project: Project, item: PlacedEquipment, linked?: Map<string, Connected>): OutlineNode {
  const product = getProduct(item.catalogId);
  const flow = terminalService(product) != null && linked ? terminalFlow(item, linked) : itemFlow(item);
  const bits = [flow != null ? formatFlow(flow, project.units) : null, item.quantity > 1 ? `× ${item.quantity}` : null].filter(Boolean);
  return {
    key: `equipment:${item.id}`,
    label: equipmentTag(item),
    kind: tagKind(product).kind,
    meta: bits.join(' · ') || undefined,
    selection: { kind: 'equipment', id: item.id },
    productId: product?.id,
  };
}

/**
 * For each run, the equipment on its far side from the system's head (the unit or fan): what the run serves. For a
 * supply run that is the diffusers downstream; for a return run, the grilles it collects from.
 */
function servedBy(project: Project, runs: DuctRun[], heads: Set<string>): Map<string, string[]> {
  const endKey = (run: DuctRun, which: 'start' | 'end') => {
    const end = run[which];
    if (end.nodeId) return `n:${end.nodeId}`;
    if (end.equipmentId) return `e:${end.equipmentId}`;
    return `o:${run.id}:${which}`;
  };
  const touching = new Map<string, DuctRun[]>();
  for (const run of runs) {
    for (const which of ['start', 'end'] as const) {
      const key = endKey(run, which);
      if (!touching.has(key)) touching.set(key, []);
      touching.get(key)!.push(run);
    }
  }
  /** Equipment reached from one end of a run without crossing back through it. */
  const reach = (run: DuctRun, which: 'start' | 'end') => {
    const found = new Set<string>();
    const seen = new Set<string>([run.id]);
    const queue = [endKey(run, which)];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);
      if (key.startsWith('e:')) {
        found.add(key.slice(2));
        continue;
      }
      for (const next of touching.get(key) ?? []) {
        if (seen.has(next.id)) continue;
        seen.add(next.id);
        queue.push(endKey(next, 'start') === key ? endKey(next, 'end') : endKey(next, 'start'));
      }
    }
    return found;
  };
  const result = new Map<string, string[]>();
  for (const run of runs) {
    const atStart = reach(run, 'start');
    const atEnd = reach(run, 'end');
    const headAtStart = [...atStart].some(id => heads.has(id));
    const headAtEnd = [...atEnd].some(id => heads.has(id));
    const far = headAtStart && !headAtEnd ? atEnd : headAtEnd && !headAtStart ? atStart : atEnd;
    result.set(run.id, [...far].filter(id => !heads.has(id)));
  }
  return result;
}

/** The duct group's name in each air group. */
const DUCTS_LABEL: Record<DuctService, string> = {
  supply: 'Supply ducts',
  return: 'Return ducts',
  outdoor: 'Outdoor-air ducts',
  exhaust: 'Exhaust ducts',
  relief: 'Relief ducts',
  mixed: 'Mixed-air ducts',
};

function ductTotals(project: Project, runs: DuctRun[]): string {
  const length = runs.reduce((sum, run) => sum + polylineLength(run.points), 0);
  return `${plural(runs.length, 'run')} · ${formatLength(length, project.units, 0)}`;
}

/** One row per duct run, named by what it serves, largest mains first. */
function ductRows(project: Project, runs: DuctRun[], heads: Set<string>, clashRuns: ReadonlySet<string>): OutlineNode[] {
  const flows = ductFlows(project);
  const served = servedBy(project, runs, heads);
  const tagOf = new Map(project.equipment.map(item => [item.id, equipmentTag(item)]));
  const rows = runs.map(run => {
    const ids = served.get(run.id) ?? [];
    const tags = ids.map(id => tagOf.get(id) ?? '?');
    const flow = flows.runs.get(run.id)?.flowM3s;
    const endName = (which: 'start' | 'end') => {
      const end = run[which];
      if (end.equipmentId) return tagOf.get(end.equipmentId) ?? '?';
      return end.nodeId ? 'junction' : 'open end';
    };
    // A duct between two pieces of equipment (hood to fan, fan to roof hood) is named by its two ends; others by
    // the terminals they serve: a main serves several, a branch one.
    const label = (run.start.equipmentId && run.end.equipmentId) || tags.length === 0
      ? `${endName('start')} → ${endName('end')}`
      : `${ids.length > 1 ? 'Main' : 'Branch'} · ${compactTags(tags)}`;
    return {
      count: ids.length,
      node: {
        key: `duct:${run.id}`,
        label,
        meta: [ductSizeLabel(run, project.units), flow != null && flow > 0 ? formatFlow(flow, project.units) : null].filter(Boolean).join(' · '),
        selection: { kind: 'duct', id: run.id },
        warn: clashRuns.has(run.id),
      } satisfies OutlineNode,
    };
  });
  rows.sort((a, b) => b.count - a.count || a.node.label.localeCompare(b.node.label));
  return rows.map(row => row.node);
}

function ductsNode(project: Project, systemId: string, service: DuctService, runs: DuctRun[], heads: Set<string>, clashRuns: ReadonlySet<string>): OutlineNode {
  const children = ductRows(project, runs, heads, clashRuns);
  return {
    key: `ductwork:${systemId}:${service}`,
    label: DUCTS_LABEL[service],
    meta: ductTotals(project, runs),
    warn: children.some(row => row.warn),
    children,
  };
}

/** What the Systems tree shows: everything, only equipment, or only ducts. */
export type OutlineShow = 'all' | 'equipment' | 'ducts';

/**
 * The Systems tree: one row per system, then "Not in a system" for equipment and ducts that belong to none. Each
 * duct is listed once, in its system under the air it carries. `show` narrows the tree to equipment or to ducts.
 */
export function systemOutline(project: Project, options: { show?: OutlineShow; clashRuns?: ReadonlySet<string> } = {}): OutlineNode[] {
  const show = options.show ?? 'all';
  const withEquipment = show !== 'ducts';
  const withDucts = show !== 'equipment';
  const clashRuns = options.clashRuns ?? new Set<string>();
  const roomOrder = new Map(project.rooms.map((room, index) => [room.id, index]));
  const linked = connections(project);
  const systems: OutlineNode[] = project.systems.flatMap(system => {
    const members = project.equipment.filter(item => item.systemId === system.id);
    const ducts = (project.ducts ?? []).filter(run => run.systemId === system.id && ductViewOf(run) === 'plan');
    const schematic = (project.ducts ?? []).filter(run => run.systemId === system.id && ductViewOf(run) !== 'plan');
    if (!withEquipment && ducts.length + schematic.length === 0) return [];
    // Air terminals (diffusers, grilles, louvers, roof hoods) go under their air; everything else heads the system.
    const terminals = members.filter(item => getProduct(item.catalogId)?.category === 'air-terminal');
    const airOf = (item: PlacedEquipment) => linked.get(item.id)?.service ?? terminalService(getProduct(item.catalogId));
    const heads = members.filter(item => !terminals.includes(item));
    const headIds = new Set(heads.map(item => item.id));
    const children: OutlineNode[] = withEquipment ? [...heads].sort(byTag).map(item => equipmentNode(project, item)) : [];
    for (const service of SERVICE_ORDER) {
      const own = withEquipment ? terminals.filter(item => airOf(item) === service) : [];
      const runs = withDucts ? ducts.filter(run => run.service === service) : [];
      if (own.length === 0 && runs.length === 0) continue;
      if (!withEquipment) {
        // Ducts only: the runs sit straight under their air.
        const rows = ductRows(project, runs, headIds, clashRuns);
        children.push({
          key: `air:${system.id}:${service}`,
          label: AIR_LABEL[service],
          service,
          meta: ductTotals(project, runs),
          warn: rows.some(row => row.warn),
          children: rows,
        });
        continue;
      }
      const group: OutlineNode[] = [];
      const rooms = new Map<string, PlacedEquipment[]>();
      for (const item of own) {
        const key = item.roomId ?? '';
        if (!rooms.has(key)) rooms.set(key, []);
        rooms.get(key)!.push(item);
      }
      const roomIds = [...rooms.keys()].sort((a, b) => (roomOrder.get(a) ?? 1e6) - (roomOrder.get(b) ?? 1e6));
      for (const roomId of roomIds) {
        const items = [...rooms.get(roomId)!].sort(byTag);
        const flow = sumFlow(items, linked);
        const name = project.rooms.find(room => room.id === roomId)?.name ?? 'Outside or on the roof';
        group.push({
          key: `airroom:${system.id}:${service}:${roomId}`,
          label: name,
          meta: [String(items.length), flow != null ? formatFlow(flow, project.units) : null].filter(Boolean).join(' · '),
          children: items.map(item => equipmentNode(project, item, linked)),
        });
      }
      const ductGroup = runs.length > 0 ? ductsNode(project, system.id, service, runs, headIds, clashRuns) : null;
      if (ductGroup) group.push(ductGroup);
      const flow = sumFlow(own, linked);
      const [one, many] = terminalWord(own);
      const meta = [own.length > 0 ? plural(own.length, one, many) : null, flow != null ? formatFlow(flow, project.units) : null].filter(Boolean).join(' · ')
        || ductTotals(project, runs);
      children.push({
        key: `air:${system.id}:${service}`,
        label: AIR_LABEL[service],
        service,
        meta,
        warn: ductGroup?.warn,
        children: group,
      });
    }
    if (withDucts && schematic.length > 0) {
      children.push({
        key: `schematic:${system.id}`,
        label: 'Schematic ducts',
        meta: plural(schematic.length, 'run'),
        warn: schematic.some(run => clashRuns.has(run.id)),
        children: schematic.map(run => ({
          key: `duct:${run.id}`,
          label: DUCT_SERVICE_LABEL[run.service],
          meta: ductSizeLabel(run, project.units),
          selection: { kind: 'duct', id: run.id } as Selection,
          warn: clashRuns.has(run.id),
        })),
      });
    }
    const others = terminals.filter(item => !SERVICE_ORDER.includes(airOf(item)!));
    if (withEquipment) children.push(...others.sort(byTag).map(item => equipmentNode(project, item, linked)));
    const headFlow = heads.length === 1 ? itemFlow(heads[0]) : null;
    const meta = !withEquipment
      ? ductTotals(project, [...ducts, ...schematic])
      : heads.length > 0
        ? [compactTags(heads.map(item => equipmentTag(item)), 2), headFlow != null ? formatFlow(headFlow, project.units) : null].filter(Boolean).join(' · ')
        : plural(members.length, 'item');
    return [{
      key: `system:${system.id}`,
      label: system.name,
      meta,
      selection: { kind: 'system', id: system.id } as Selection,
      warn: children.some(child => child.warn),
      children,
    }];
  });
  const loose = notInASystem(project, { withEquipment, withDucts, clashRuns, linked });
  return loose ? [...systems, loose] : systems;
}

/** Equipment and ducts that belong to no system (or to one that was deleted). Null when there are none. */
function notInASystem(
  project: Project,
  { withEquipment, withDucts, clashRuns, linked }: { withEquipment: boolean; withDucts: boolean; clashRuns: ReadonlySet<string>; linked: Map<string, Connected> },
): OutlineNode | null {
  const known = new Set(project.systems.map(system => system.id));
  const items = withEquipment ? project.equipment.filter(item => !item.systemId || !known.has(item.systemId)).sort(byTag) : [];
  const runs = withDucts ? (project.ducts ?? []).filter(run => !known.has(run.systemId)) : [];
  if (items.length === 0 && runs.length === 0) return null;
  const tagOf = new Map(project.equipment.map(item => [item.id, equipmentTag(item)]));
  const endName = (run: DuctRun, which: 'start' | 'end') => {
    const end = run[which];
    if (end.equipmentId) return tagOf.get(end.equipmentId) ?? '?';
    return end.nodeId ? 'junction' : 'open end';
  };
  const ductNodes: OutlineNode[] = runs.map(run => ({
    key: `duct:${run.id}`,
    label: `${endName(run, 'start')} → ${endName(run, 'end')}`,
    kind: DUCT_SERVICE_LABEL[run.service],
    meta: ductSizeLabel(run, project.units),
    selection: { kind: 'duct', id: run.id },
    warn: clashRuns.has(run.id),
  }));
  return {
    key: 'unassigned',
    label: 'Not in a system',
    meta: [items.length > 0 ? plural(items.length, 'item') : null, runs.length > 0 ? plural(runs.length, 'duct') : null].filter(Boolean).join(' · '),
    warn: ductNodes.some(node => node.warn),
    children: [...items.map(item => equipmentNode(project, item, linked)), ...ductNodes],
  };
}

/** The keys to open so the selected item's row shows. */
export function outlinePath(nodes: readonly OutlineNode[], selection: Selection): string[] {
  const want = selection.kind === 'equipment' ? `equipment:${selection.id}` : selection.kind === 'duct' ? `duct:${selection.id}` : selection.kind === 'system' ? `system:${selection.id}` : null;
  if (!want) return [];
  const walk = (list: readonly OutlineNode[], trail: string[]): string[] | null => {
    for (const node of list) {
      if (node.key === want) return trail;
      if (node.children) {
        const found = walk(node.children, [...trail, node.key]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(nodes, []) ?? [];
}
