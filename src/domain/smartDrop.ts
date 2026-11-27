import { getProduct, type CatalogProduct } from './catalog';
import { createId } from './ids';
import { getDuctProduct, servicesFor, streamFor } from './ductCatalog';
import { ductViewOf, projectOnPolyline } from './ducts';
import { roomAtPoint } from './projectOps';
import { type PackageMember, type SystemPackage } from './systemPackages';
import { SYSTEM_KINDS, type DuctRun, type DuctService, type HvacSystem, type Project, type Room, type SystemKind } from './types';

/**
 * What a catalogue item does when it is dropped on the plan:
 * - unit: an air handler that heads its own system (RTU, AHU, MAU, ERV, split). Asks for a pregenerated system.
 * - head: a fan or hood. Joins a nearby system of its kind, otherwise starts one like a unit.
 * - member: a terminal or air-path part. Joins the nearest system that carries its air.
 * - free: plant, condensing units, transfer grilles. No system needed.
 */
export type DropRole = 'unit' | 'head' | 'member' | 'free';

const UNIT_CATEGORIES = new Set(['air-handling', 'makeup-air', 'heating-cooling', 'energy-recovery']);
const HEAD_CATEGORIES = new Set(['kitchen-hood', 'exhaust-fan', 'bathroom-exhaust']);
/** A fan or hood joins an existing system only when that system has something this close (m). */
const HEAD_JOIN_M = 6;

export function dropRole(product: CatalogProduct): DropRole {
  if (product.unit || UNIT_CATEGORIES.has(product.category)) return 'unit';
  if (HEAD_CATEGORIES.has(product.category)) return 'head';
  if (product.category === 'plant' || (product.ports ?? []).length === 0) return 'free';
  return 'member';
}

/** Air a product's connections carry: main services first, then the ones it also accepts. */
function productServices(product: CatalogProduct): { main: DuctService[]; also: DuctService[] } {
  const ports = product.ports ?? [];
  const main = [...new Set(ports.map(port => port.service))];
  const also = [...new Set(ports.flatMap(port => port.accepts ?? []))].filter(service => !main.includes(service));
  return { main, also };
}

/** The system a pregenerated package puts this member in. */
function memberKind(pack: SystemPackage, member: PackageMember): SystemKind | null {
  if (member.system === null) return null;
  const system = member.system ? pack.systems.find(item => item.key === member.system) : undefined;
  return (system ?? pack.systems[0])?.kind ?? null;
}

/** Size suffixes removed: hood-wall-10 → hood-wall, rtu-12 → rtu, erv-small-100 → erv-small. */
function familyOf(id: string): string {
  return id.replace(/(-\d+[a-z]?)+$/, '');
}

/**
 * How well a package member stands in for the dropped product: 0 exact, 1 same family, 2 same kind of thing.
 * Null when it doesn't. Kitchen hoods need a family match: a Type II hood is not a grease hood.
 */
function memberMatch(product: CatalogProduct, member: PackageMember): number | null {
  if (member.catalogId === product.id) return 0;
  const other = getProduct(member.catalogId);
  if (!other || other.category !== product.category) return null;
  if (familyOf(member.catalogId) === familyOf(product.id)) return 1;
  if (product.category === 'kitchen-hood') return null;
  return member.catalogId.split('-')[0] === product.id.split('-')[0] ? 2 : null;
}

/** System kinds a product belongs to, the most likely first. */
export function systemKindsFor(product: CatalogProduct, packages: readonly SystemPackage[] = []): SystemKind[] {
  const kinds: SystemKind[] = [];
  const add = (kind: SystemKind | null | undefined) => {
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  };
  const ranked = packages
    .flatMap(pack => pack.members.map(member => ({ pack, member, rank: memberMatch(product, member) })))
    .filter(entry => entry.rank != null)
    .sort((a, b) => a.rank! - b.rank!);
  for (const entry of ranked) add(memberKind(entry.pack, entry.member));
  const role = dropRole(product);
  if (role === 'unit') {
    if (product.category === 'makeup-air') add('makeup-air');
    else if (product.unit?.sections.some(section => section.kind === 'heat-recovery') || product.category === 'energy-recovery') add('ventilation');
    else add('comfort');
  }
  if (product.category === 'kitchen-hood') add(/type2|type-2/i.test(product.id) ? 'ventilation' : 'kitchen-exhaust');
  if (product.category === 'bathroom-exhaust') add('restroom-exhaust');
  if (product.category === 'exhaust-fan') add('ventilation');
  const { main, also } = productServices(product);
  for (const services of [main, also]) {
    for (const kind of SYSTEM_KINDS.map(item => item.id)) if (services.some(service => streamFor(kind, service))) add(kind);
  }
  return kinds;
}

/** Packages that carry this product (or one of its family), with that member's key. Best match first. */
export function packagesFor(product: CatalogProduct, packages: readonly SystemPackage[]): { pack: SystemPackage; memberKey: string }[] {
  const role = dropRole(product);
  if (role !== 'unit' && role !== 'head') return [];
  const found: { pack: SystemPackage; memberKey: string; rank: number }[] = [];
  for (const pack of packages) {
    let best: { key: string; rank: number } | null = null;
    for (const member of pack.members) {
      const rank = memberMatch(product, member);
      if (rank != null && (!best || rank < best.rank)) best = { key: member.key, rank };
    }
    if (best) found.push({ pack, memberKey: best.key, rank: best.rank });
  }
  return found.sort((a, b) => a.rank - b.rank).map(({ pack, memberKey }) => ({ pack, memberKey }));
}

const CFM = 0.0004719474432;

function supplyOf(product: CatalogProduct | undefined, member?: PackageMember): number | null {
  const fromMember = member?.sections?.find(section => section.kind === 'supply-fan')?.flowM3s;
  if (fromMember) return fromMember;
  if (member?.designCfm) return member.designCfm * CFM;
  const fromUnit = product?.unit?.sections.find(section => section.kind === 'supply-fan')?.flowM3s;
  return fromUnit ?? product?.airflow?.valueM3s ?? null;
}

/**
 * The package with the dropped product in place of its matching member, laid out so that member lands on the
 * drop point. The swapped member takes its own catalogue defaults, and the terminals in its system scale to its
 * airflow, so the sums still close.
 */
export function packageAround(pack: SystemPackage, memberKey: string, product: CatalogProduct, drop: { xM: number; yM: number }): { pack: SystemPackage; drop: { xM: number; yM: number } } {
  const member = pack.members.find(item => item.key === memberKey);
  if (!member) return { pack, drop };
  const at = { xM: drop.xM - member.planOffset.xM, yM: drop.yM - member.planOffset.yM };
  if (member.catalogId === product.id) return { pack, drop: at };
  const before = supplyOf(getProduct(member.catalogId), member);
  const after = supplyOf(product);
  const ratio = before && after ? after / before : 1;
  const sameSystem = (other: PackageMember) => (other.system ?? pack.systems[0]?.key) === (member.system ?? pack.systems[0]?.key);
  const members = pack.members.map(item => {
    if (item.key === memberKey) {
      const { sections: _sections, designCfm: _cfm, ...rest } = item;
      return { ...rest, catalogId: product.id };
    }
    if (ratio !== 1 && item.designCfm != null && sameSystem(item)) return { ...item, designCfm: Math.round((item.designCfm * ratio) / 5) * 5 };
    return item;
  });
  // Round ducts in that system keep about the same velocity: diameter scales with the square root of the airflow,
  // snapped up to a listed size. Rectangular ducts keep their sizes.
  const systemKey = member.system ?? pack.systems[0]?.key;
  const ducts =
    ratio === 1
      ? pack.ducts
      : pack.ducts.map(duct => {
          if (duct.shape !== 'round' || (duct.system ?? pack.systems[0]?.key) !== systemKey) return duct;
          const target = duct.widthIn * Math.sqrt(ratio);
          const listed = (getDuctProduct(duct.catalogId)?.sizes ?? []).map(size => size.widthM / 0.0254).sort((a, b) => a - b);
          const fit = listed.find(size => size >= target - 0.05) ?? listed[listed.length - 1];
          return fit ? { ...duct, widthIn: Math.round(fit) } : duct;
        });
  // CFM figures in that system's notes follow the new unit ("Supply is 3,750 CFM" → "Supply is 1,600 CFM").
  const systems =
    ratio === 1
      ? pack.systems
      : pack.systems.map(system =>
          system.key !== systemKey
            ? system
            : {
                ...system,
                notes: system.notes.replace(/(\d{1,3}(?:,\d{3})+|\d+) CFM/g, (_match, figure: string) => {
                  const scaled = Math.round((Number(figure.replace(/,/g, '')) * ratio) / 5) * 5;
                  return `${scaled.toLocaleString('en-US')} CFM`;
                }),
              }
        );
  return { pack: { ...pack, systems, members, ducts }, drop: at };
}

function segmentDistance(points: readonly { x: number; y: number }[], x: number, y: number): number {
  return projectOnPolyline(points, x, y)?.distance ?? Infinity;
}

/** Distance from a point to the nearest piece of a system: a placed item or a plan duct. */
export function systemDistance(project: Project, systemId: string, x: number, y: number): number {
  let best = Infinity;
  for (const item of project.equipment) if (item.systemId === systemId) best = Math.min(best, Math.hypot(item.xM - x, item.yM - y));
  for (const run of project.ducts ?? []) if (run.systemId === systemId && ductViewOf(run) === 'plan') best = Math.min(best, segmentDistance(run.points, x, y));
  return best;
}

/** Nearest system that can take this product. */
export function joinTarget(project: Project, product: CatalogProduct, point: { xM: number; yM: number }, packages: readonly SystemPackage[]): HvacSystem | null {
  const role = dropRole(product);
  if (role === 'free') return null;
  // Terminals join by the air they mainly carry: an exhaust grille never becomes a rooftop unit's relief.
  const { main } = productServices(product);
  const kinds = systemKindsFor(product, packages);
  const fits = (system: HvacSystem) => (role === 'member' ? main.some(service => streamFor(system.kind, service)) : kinds.includes(system.kind));
  let best: { system: HvacSystem; distance: number } | null = null;
  for (const system of project.systems) {
    if (!fits(system)) continue;
    const distance = systemDistance(project, system.id, point.xM, point.yM);
    if (!Number.isFinite(distance)) continue;
    if (role === 'head' && distance > HEAD_JOIN_M) continue;
    if (!best || distance < best.distance) best = { system, distance };
  }
  return best?.system ?? null;
}

/** A name for a new system: the room it serves and its kind, numbered when taken. */
export function newSystemName(project: Project, kind: SystemKind, room: Room | null): string {
  const label = SYSTEM_KINDS.find(item => item.id === kind)?.label ?? 'System';
  const base = room ? `${room.name} ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label;
  const taken = new Set(project.systems.map(system => system.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** Add a system of a kind, named for the room at the point. */
export function createSystemAt(project: Project, kind: SystemKind, point: { xM: number; yM: number }): { project: Project; system: HvacSystem } {
  const room = roomAtPoint(project.rooms, point.xM, point.yM);
  const system: HvacSystem = { id: createId('sys'), name: newSystemName(project, kind, room), kind, notes: '' };
  return { project: { ...project, systems: [...project.systems, system] }, system };
}

/** The plan duct under a point, any system: where a dropped duct starts a branch. */
export function runUnder(project: Project, x: number, y: number, maxM: number): { run: DuctRun; x: number; y: number } | null {
  let best: { run: DuctRun; x: number; y: number; distance: number } | null = null;
  for (const run of project.ducts ?? []) {
    if (ductViewOf(run) !== 'plan') continue;
    const hit = projectOnPolyline(run.points, x, y);
    const reach = Math.max(maxM, run.widthM / 2 + 0.1);
    if (!hit || hit.distance > reach || (best && hit.distance >= best.distance)) continue;
    best = { run, x: hit.x, y: hit.y, distance: hit.distance };
  }
  return best;
}

/** A system kind and air type a duct product can start a new system with. Comfort supply when it can. */
export function ductStart(catalogId: string): { kind: SystemKind; service: DuctService } | null {
  const product = getDuctProduct(catalogId);
  if (!product) return null;
  const order: SystemKind[] = ['comfort', ...product.systemKinds.filter(kind => kind !== 'comfort')];
  for (const kind of order) {
    const services = servicesFor(product, kind);
    if (services.length > 0) return { kind, service: services.includes('supply') ? 'supply' : services[0] };
  }
  return null;
}
