/**
 * Equipment tags, as on a drawing: RTU-1, SD-3, RG-2, EF-1. Each placed item stores its tag. Items without one (new
 * drops, older projects, template items) are numbered by `assignTags`, which never changes a tag already set, so
 * users can rename freely. The tag names the item in the Systems tree, on the plan and in 3D; the product model is in
 * the inspector.
 */
import { getProduct, type CatalogProduct } from './catalog';
import { isTransferGrille } from './airColors';
import type { DuctService, PlacedEquipment, Project } from './types';

interface TagKind {
  prefix: string;
  /** Plain name of the kind of item, for lists. */
  kind: string;
}

/** The tag prefix and plain name for a product. */
export function tagKind(product: CatalogProduct | undefined): TagKind {
  if (!product) return { prefix: 'EQ', kind: 'Equipment' };
  const { id, name, category } = product;
  if (category === 'kitchen-hood') return { prefix: 'H', kind: 'Kitchen hood' };
  if (category === 'air-handling') return { prefix: 'AHU', kind: 'Air handler' };
  if (category === 'plant') {
    if (/boiler/i.test(name)) return { prefix: 'B', kind: 'Boiler' };
    if (/chiller/i.test(name)) return { prefix: 'CH', kind: 'Chiller' };
    return { prefix: 'CR', kind: 'Refrigeration rack' };
  }
  if (category === 'air-terminal') {
    if (isTransferGrille(id)) return { prefix: 'TG', kind: 'Transfer grille' };
    if (id.startsWith('diff')) return { prefix: 'SD', kind: 'Supply diffuser' };
    if (id.startsWith('grille-ret')) return { prefix: 'RG', kind: 'Return grille' };
    if (id.startsWith('grille')) return { prefix: 'EG', kind: 'Exhaust grille' };
    if (id.startsWith('louver')) return { prefix: 'L', kind: id.endsWith('oa') ? 'Outdoor-air louver' : 'Exhaust louver' };
    return id.includes('intake') ? { prefix: 'IH', kind: 'Intake hood' } : { prefix: 'RH', kind: 'Relief hood' };
  }
  if (category === 'makeup-air') return { prefix: 'MAU', kind: 'Make-up air unit' };
  if (category === 'energy-recovery' || /ERV|recovery/i.test(name)) return { prefix: 'ERV', kind: 'Energy recovery ventilator' };
  if (category === 'heating-cooling' || category === 'system-equipment') {
    if (/condens/i.test(name)) return { prefix: 'CU', kind: 'Condensing unit' };
    if (/mini-split|ductless/i.test(name)) return { prefix: 'HP', kind: 'Mini-split heat pump' };
    if (/rooftop|WeatherMaker|RTU/i.test(name) || product.mount === 'roof') return { prefix: 'RTU', kind: 'Rooftop unit' };
    return { prefix: 'AC', kind: 'Unit' };
  }
  if (category === 'exhaust-fan') return { prefix: 'EF', kind: 'Exhaust fan' };
  if (category === 'bathroom-exhaust') return { prefix: 'EF', kind: 'Restroom exhaust fan' };
  if (category === 'air-path') {
    if (/mix/i.test(name)) return { prefix: 'MB', kind: 'Mixing box' };
    if (/damper/i.test(name)) return { prefix: 'D', kind: 'Damper' };
    if (/filter/i.test(name)) return { prefix: 'F', kind: 'Filter' };
    if (/coil/i.test(name)) return { prefix: 'C', kind: 'Coil' };
    if (/sensor/i.test(name)) return { prefix: 'S', kind: 'Sensor' };
    if (/fan/i.test(name)) return { prefix: 'SF', kind: 'Fan section' };
    return { prefix: 'AP', kind: 'Air-path section' };
  }
  return { prefix: 'EQ', kind: 'Equipment' };
}

/** The item's tag: its own, or its kind's prefix while it has none yet. */
export function equipmentTag(item: Pick<PlacedEquipment, 'catalogId' | 'tag'>): string {
  const own = item.tag?.trim();
  return own ? own : tagKind(getProduct(item.catalogId)).prefix;
}

/** The air a terminal moves (from its duct port), or null for units, fans, hoods and transfer grilles. */
export function terminalService(product: CatalogProduct | undefined): DuctService | null {
  if (product?.category !== 'air-terminal') return null;
  return product.ports?.[0]?.service ?? null;
}

function tagNumber(tag: string, prefix: string): number | null {
  const match = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`).exec(tag.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Give every item without a tag the next free number for its prefix. New items are numbered in reading order: by
 * room (the project's room order), then from the top of the plan down, then left to right. Returns the same project
 * when nothing needed a tag.
 */
export function assignTags(project: Project): Project {
  const missing = project.equipment.filter(item => !item.tag?.trim());
  if (missing.length === 0) return project;
  const used = new Map<string, Set<number>>();
  const prefixOf = (item: PlacedEquipment) => tagKind(getProduct(item.catalogId)).prefix;
  for (const item of project.equipment) {
    if (!item.tag?.trim()) continue;
    const prefix = prefixOf(item);
    const n = tagNumber(item.tag, prefix);
    if (n == null) continue;
    if (!used.has(prefix)) used.set(prefix, new Set());
    used.get(prefix)!.add(n);
  }
  const roomOrder = new Map(project.rooms.map((room, index) => [room.id, index]));
  const order = [...missing].sort((a, b) => {
    const ra = a.roomId != null ? roomOrder.get(a.roomId) ?? 1e6 : 1e6;
    const rb = b.roomId != null ? roomOrder.get(b.roomId) ?? 1e6 : 1e6;
    if (ra !== rb) return ra - rb;
    if (Math.abs(a.yM - b.yM) > 0.05) return b.yM - a.yM;
    return a.xM - b.xM;
  });
  const given = new Map<string, string>();
  for (const item of order) {
    const prefix = prefixOf(item);
    if (!used.has(prefix)) used.set(prefix, new Set());
    const taken = used.get(prefix)!;
    let n = 1;
    while (taken.has(n)) n += 1;
    taken.add(n);
    given.set(item.id, `${prefix}-${n}`);
  }
  return { ...project, equipment: project.equipment.map(item => (given.has(item.id) ? { ...item, tag: given.get(item.id) } : item)) };
}

/**
 * A short list of tags, with runs of numbers folded: "SD-1–4, SD-7, RG-2". At most `limit` pieces, then "+n".
 */
export function compactTags(tags: readonly string[], limit = 3): string {
  const byPrefix = new Map<string, number[]>();
  const loose: string[] = [];
  for (const tag of tags) {
    const match = /^(.*)-(\d+)$/.exec(tag);
    if (!match) {
      loose.push(tag);
      continue;
    }
    if (!byPrefix.has(match[1])) byPrefix.set(match[1], []);
    byPrefix.get(match[1])!.push(Number(match[2]));
  }
  const pieces: string[] = [];
  for (const [prefix, numbers] of byPrefix) {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    let start = sorted[0];
    let last = sorted[0];
    const flush = () => pieces.push(start === last ? `${prefix}-${start}` : `${prefix}-${start}–${last}`);
    for (const n of sorted.slice(1)) {
      if (n === last + 1) {
        last = n;
        continue;
      }
      flush();
      start = n;
      last = n;
    }
    flush();
  }
  pieces.push(...loose);
  if (pieces.length <= limit) return pieces.join(', ');
  return `${pieces.slice(0, limit).join(', ')} +${pieces.length - limit}`;
}
