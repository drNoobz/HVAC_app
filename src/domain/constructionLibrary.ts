import assemblyFile from './construction-assemblies.json';
import seedFile from './construction-materials.json';
import type { OpeningKind, StackLayer, SurfaceFace, UnitSystem } from './types';

export const CONSTRUCTION_CATEGORIES = ['floor', 'wall', 'ceiling', 'roof', 'window', 'door', 'insulation'] as const;

export type ConstructionCategory = (typeof CONSTRUCTION_CATEGORIES)[number];

export const constructionCategoryLabel: Record<ConstructionCategory, string> = {
  floor: 'Floors',
  wall: 'Walls',
  ceiling: 'Ceilings',
  roof: 'Roofs',
  window: 'Windows',
  door: 'Doors',
  insulation: 'Insulation',
};

export interface ConstructionMaterial {
  id: string;
  name: string;
  category: ConstructionCategory;
  typicalUse: string;
  thicknessMm: number | null;
  /** R-value, h·ft²·°F/Btu. Null when the source did not state R. */
  rIp: number | null;
  /** U-factor, Btu/(h·ft²·°F). Null when the source did not state an IP U-factor. */
  uIp: number | null;
  /** U-factor, W/(m²·K). Null when the source did not state an SI U-factor. */
  uSi: number | null;
  shgc: number | null;
  /** When false, a missing R or U stays blank instead of being filled by the reciprocal. */
  deriveComplement: boolean;
  source: string;
  notes: string;
  origin: 'builtin' | 'manual' | 'import';
}

const U_SI_PER_IP = 5.678263337;
const STORAGE_KEY = 'hvac-construction-library-v1';

interface SeedFile {
  schemaVersion: number;
  note: string;
  materials: unknown[];
}

const seed = seedFile as SeedFile;

export const CONSTRUCTION_LIBRARY_NOTE = seed.note;

function trimNum(value: number): string {
  const digits = Math.abs(value) >= 10 ? 1 : Math.abs(value) >= 1 ? 2 : 3;
  return value.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function isCategory(value: string): value is ConstructionCategory {
  return (CONSTRUCTION_CATEGORIES as readonly string[]).includes(value);
}

function readNumber(
  value: unknown,
  label: string,
  allow: (value: number) => boolean
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value == null || value === '') return { ok: true, value: null };
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || !allow(number)) return { ok: false, error: `${label} is not a valid number.` };
  return { ok: true, value: number };
}

function readText(value: unknown, label: string, max: number, fallback = ''): { ok: true; value: string } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: fallback };
  if (typeof value !== 'string') return { ok: false, error: `${label} must be text.` };
  const text = value.trim();
  if (text.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, value: text };
}

export function parseMaterial(
  input: unknown,
  origin: ConstructionMaterial['origin']
): { ok: true; material: ConstructionMaterial } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Each material must be an object.' };
  const row = input as Record<string, unknown>;
  const id = readText(row.id, 'Id', 80);
  if (!id.ok) return id;
  if (!id.value) return { ok: false, error: 'Id is required.' };
  const name = readText(row.name, 'Name', 160);
  if (!name.ok) return name;
  if (!name.value) return { ok: false, error: 'Name is required.' };
  if (typeof row.category !== 'string' || !isCategory(row.category)) {
    return { ok: false, error: 'Category must be floor, wall, ceiling, roof, window, door, or insulation.' };
  }
  const typicalUse = readText(row.typicalUse, 'Typical use', 400);
  if (!typicalUse.ok) return typicalUse;
  const source = readText(row.source, 'Source', 500);
  if (!source.ok) return source;
  const notes = readText(row.notes, 'Notes', 1200);
  if (!notes.ok) return notes;
  const thicknessMm = readNumber(row.thicknessMm, 'Thickness', value => value > 0 && value < 10000);
  if (!thicknessMm.ok) return thicknessMm;
  const rIp = readNumber(row.rIp, 'R-value', value => value > 0 && value < 1000);
  if (!rIp.ok) return rIp;
  const uIp = readNumber(row.uIp, 'U-factor (IP)', value => value > 0 && value < 100);
  if (!uIp.ok) return uIp;
  const uSi = readNumber(row.uSi, 'U-factor (SI)', value => value > 0 && value < 100);
  if (!uSi.ok) return uSi;
  const shgc = readNumber(row.shgc, 'SHGC', value => value >= 0 && value <= 1);
  if (!shgc.ok) return shgc;
  if (row.deriveComplement != null && typeof row.deriveComplement !== 'boolean') {
    return { ok: false, error: 'deriveComplement must be true or false.' };
  }
  return {
    ok: true,
    material: {
      id: id.value,
      name: name.value,
      category: row.category,
      typicalUse: typicalUse.value,
      thicknessMm: thicknessMm.value,
      rIp: rIp.value,
      uIp: uIp.value,
      uSi: uSi.value,
      shgc: shgc.value,
      deriveComplement: row.deriveComplement ?? true,
      source: source.value,
      notes: notes.value,
      origin,
    },
  };
}

function loadBuiltin(): ConstructionMaterial[] {
  if (seed.schemaVersion !== 1 || !Array.isArray(seed.materials)) {
    throw new Error('Construction library seed is missing schemaVersion 1.');
  }
  const seen = new Set<string>();
  return seed.materials.map((item, index) => {
    const parsed = parseMaterial(item, 'builtin');
    if (!parsed.ok) throw new Error(`Construction library row ${index + 1}: ${parsed.error}`);
    if (seen.has(parsed.material.id)) throw new Error(`Duplicate construction material id ${parsed.material.id}.`);
    seen.add(parsed.material.id);
    return parsed.material;
  });
}

export const BUILTIN_MATERIALS = loadBuiltin();

const builtinIds = new Set(BUILTIN_MATERIALS.map(item => item.id));

export function mergeLibrary(added: ConstructionMaterial[]): ConstructionMaterial[] {
  const seen = new Set(builtinIds);
  const extra = added.filter(item => {
    if (seen.has(item.id) || item.origin === 'builtin') return false;
    seen.add(item.id);
    return true;
  });
  return [...BUILTIN_MATERIALS, ...extra];
}

export function loadAddedMaterials(): ConstructionMaterial[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { schemaVersion?: number; materials?: unknown };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.materials)) return [];
    return parsed.materials.flatMap(item => {
      const material = parseMaterial(item, item && typeof item === 'object' && (item as { origin?: string }).origin === 'import' ? 'import' : 'manual');
      return material.ok && !builtinIds.has(material.material.id) ? [material.material] : [];
    });
  } catch {
    return [];
  }
}

export function saveAddedMaterials(materials: ConstructionMaterial[]): void {
  if (typeof window === 'undefined') return;
  const added = materials.filter(item => item.origin !== 'builtin' && !builtinIds.has(item.id));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, materials: added }));
}

export function libraryDocument(materials: ConstructionMaterial[]) {
  return {
    schemaVersion: 1 as const,
    note: CONSTRUCTION_LIBRARY_NOTE,
    materials: materials.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      typicalUse: item.typicalUse,
      thicknessMm: item.thicknessMm,
      rIp: item.rIp,
      uIp: item.uIp,
      uSi: item.uSi,
      shgc: item.shgc,
      deriveComplement: item.deriveComplement,
      source: item.source,
      notes: item.notes,
    })),
  };
}

export function importMaterials(
  text: string,
  existing: ConstructionMaterial[]
): { additions: ConstructionMaterial[]; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { additions: existing, message: 'That file is not valid JSON.' };
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { materials?: unknown }).materials)
      ? (parsed as { materials: unknown[] }).materials
      : null;
  if (!rows) {
    return { additions: existing, message: 'The file must be a JSON array, or an object with a materials array.' };
  }
  const seen = new Set([...builtinIds, ...existing.map(item => item.id)]);
  const additions = [...existing];
  let added = 0;
  let skipped = 0;
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const material = parseMaterial(row, 'import');
    if (!material.ok) {
      errors.push(`Row ${index + 1}: ${material.error}`);
      return;
    }
    if (seen.has(material.material.id)) {
      skipped += 1;
      return;
    }
    seen.add(material.material.id);
    additions.push(material.material);
    added += 1;
  });
  const parts = [`Added ${added}.`, `Skipped ${skipped} already in the library.`];
  if (errors.length > 0) {
    const shown = errors.slice(0, 3).join(' ');
    parts.push(errors.length > 3 ? `${shown} And ${errors.length - 3} more.` : shown);
  }
  return { additions, message: parts.join(' ') };
}

export function publishedU(material: ConstructionMaterial): { uIp: number | null; uSi: number | null } {
  if (material.uIp != null && material.uSi != null) return { uIp: material.uIp, uSi: material.uSi };
  if (material.uIp != null) return { uIp: material.uIp, uSi: material.uIp * U_SI_PER_IP };
  if (material.uSi != null) return { uSi: material.uSi, uIp: material.uSi / U_SI_PER_IP };
  if (material.deriveComplement && material.rIp != null && material.rIp > 0) {
    const uIp = 1 / material.rIp;
    return { uIp, uSi: uIp * U_SI_PER_IP };
  }
  return { uIp: null, uSi: null };
}

export function publishedR(material: ConstructionMaterial): { rIp: number | null; rSi: number | null } {
  if (material.rIp != null) {
    const rIp = material.rIp;
    return { rIp, rSi: rIp / U_SI_PER_IP };
  }
  if (!material.deriveComplement) return { rIp: null, rSi: null };
  const u = publishedU(material);
  if (u.uIp == null || u.uIp <= 0) return { rIp: null, rSi: null };
  const rIp = 1 / u.uIp;
  return { rIp, rSi: rIp / U_SI_PER_IP };
}

export function formatThickness(thicknessMm: number | null, units: UnitSystem): string {
  if (thicknessMm == null) return 'Not stated';
  if (units === 'SI') return `${trimNum(thicknessMm)} mm`;
  return `${trimNum(thicknessMm / 25.4)} in`;
}

export function formatR(material: ConstructionMaterial, units: UnitSystem): string {
  const value = publishedR(material);
  const number = units === 'IP' ? value.rIp : value.rSi;
  if (number == null) return 'Not stated';
  return units === 'IP' ? `R-${trimNum(number)}` : `${trimNum(number)} m²·K/W`;
}

export function formatU(material: ConstructionMaterial, units: UnitSystem): string {
  const value = publishedU(material);
  const number = units === 'IP' ? value.uIp : value.uSi;
  if (number == null) return 'Not stated';
  return units === 'IP' ? `${trimNum(number)} Btu/(h·ft²·°F)` : `${trimNum(number)} W/(m²·K)`;
}

export function formatShgc(material: ConstructionMaterial): string {
  return material.shgc == null ? 'Not stated' : trimNum(material.shgc);
}

export function categoriesForFace(face: SurfaceFace): ConstructionCategory[] {
  if (face === 'floor') return ['floor', 'insulation'];
  if (face === 'walls') return ['wall', 'insulation'];
  return ['ceiling', 'roof', 'insulation'];
}

export function categoriesForOpening(kind: OpeningKind): ConstructionCategory[] {
  if (kind === 'door') return ['door'];
  if (kind === 'window') return ['window'];
  return [];
}

export function findConstruction(materials: ConstructionMaterial[], id: string | null | undefined): ConstructionMaterial | undefined {
  if (!id) return undefined;
  return materials.find(item => item.id === id);
}

export const ASSEMBLY_CATEGORIES = ['floor', 'wall', 'ceiling', 'roof', 'window', 'door'] as const;
export type AssemblyCategory = (typeof ASSEMBLY_CATEGORIES)[number];

export interface ConstructionAssembly {
  id: string;
  name: string;
  category: AssemblyCategory;
  typicalUse: string;
  orderLabel: string;
  /** True when the layers sit in contact and their R-values can be added. */
  series: boolean;
  layers: StackLayer[];
  source: string;
  notes: string;
  origin: 'builtin' | 'manual' | 'import';
}

const ASSEMBLY_KEY = 'hvac-construction-assemblies-v1';

interface AssemblySeed {
  schemaVersion: number;
  note: string;
  assemblies: unknown[];
}

const assemblySeed = assemblyFile as AssemblySeed;

export const ASSEMBLY_LIBRARY_NOTE = assemblySeed.note;

function isAssemblyCategory(value: string): value is AssemblyCategory {
  return (ASSEMBLY_CATEGORIES as readonly string[]).includes(value);
}

export function parseStackLayer(input: unknown): { ok: true; layer: StackLayer } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Each layer must be an object.' };
  const row = input as Record<string, unknown>;
  const materialId = readText(row.materialId, 'Layer material', 80);
  if (!materialId.ok) return materialId;
  if (!materialId.value) return { ok: false, error: 'Layer material is required.' };
  const place = readText(row.place, 'Layer place', 160);
  if (!place.ok) return place;
  const thicknessMm = readNumber(row.thicknessMm, 'Layer thickness', value => value > 0 && value < 10000);
  if (!thicknessMm.ok) return thicknessMm;
  return { ok: true, layer: { materialId: materialId.value, place: place.value, thicknessMm: thicknessMm.value } };
}

export function parseAssembly(
  input: unknown,
  origin: ConstructionAssembly['origin']
): { ok: true; assembly: ConstructionAssembly } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Each component must be an object.' };
  const row = input as Record<string, unknown>;
  const id = readText(row.id, 'Id', 80);
  if (!id.ok) return id;
  if (!id.value) return { ok: false, error: 'Id is required.' };
  const name = readText(row.name, 'Name', 160);
  if (!name.ok) return name;
  if (!name.value) return { ok: false, error: 'Name is required.' };
  if (typeof row.category !== 'string' || !isAssemblyCategory(row.category)) {
    return { ok: false, error: 'Category must be floor, wall, ceiling, roof, window, or door.' };
  }
  const typicalUse = readText(row.typicalUse, 'Typical use', 400);
  if (!typicalUse.ok) return typicalUse;
  const orderLabel = readText(row.orderLabel, 'Order', 80);
  if (!orderLabel.ok) return orderLabel;
  if (!orderLabel.value) return { ok: false, error: 'Order is required.' };
  const source = readText(row.source, 'Source', 500);
  if (!source.ok) return source;
  const notes = readText(row.notes, 'Notes', 1200);
  if (!notes.ok) return notes;
  if (typeof row.series !== 'boolean') return { ok: false, error: 'Series must be true or false.' };
  if (!Array.isArray(row.layers) || row.layers.length === 0) return { ok: false, error: 'A component needs at least one layer.' };
  const layers: StackLayer[] = [];
  for (let index = 0; index < row.layers.length; index += 1) {
    const layer = parseStackLayer(row.layers[index]);
    if (!layer.ok) return { ok: false, error: `Layer ${index + 1}: ${layer.error}` };
    layers.push(layer.layer);
  }
  return {
    ok: true,
    assembly: {
      id: id.value,
      name: name.value,
      category: row.category,
      typicalUse: typicalUse.value,
      orderLabel: orderLabel.value,
      series: row.series,
      layers,
      source: source.value,
      notes: notes.value,
      origin,
    },
  };
}

function loadBuiltinAssemblies(): ConstructionAssembly[] {
  if (assemblySeed.schemaVersion !== 1 || !Array.isArray(assemblySeed.assemblies)) {
    throw new Error('Construction assembly seed is missing schemaVersion 1.');
  }
  const materialIds = new Set(BUILTIN_MATERIALS.map(item => item.id));
  const seen = new Set<string>();
  return assemblySeed.assemblies.map((item, index) => {
    const parsed = parseAssembly(item, 'builtin');
    if (!parsed.ok) throw new Error(`Construction assembly ${index + 1}: ${parsed.error}`);
    if (seen.has(parsed.assembly.id)) throw new Error(`Duplicate construction assembly id ${parsed.assembly.id}.`);
    seen.add(parsed.assembly.id);
    for (const layer of parsed.assembly.layers) {
      if (!materialIds.has(layer.materialId)) {
        throw new Error(`Assembly ${parsed.assembly.id} uses unknown material ${layer.materialId}.`);
      }
    }
    return parsed.assembly;
  });
}

export const BUILTIN_ASSEMBLIES = loadBuiltinAssemblies();

const builtinAssemblyIds = new Set(BUILTIN_ASSEMBLIES.map(item => item.id));

export function builtinAssembly(id: string): ConstructionAssembly | undefined {
  return BUILTIN_ASSEMBLIES.find(item => item.id === id);
}

export function cloneLayers(layers: StackLayer[]): StackLayer[] {
  return layers.map(layer => ({ ...layer }));
}

export function mergeAssemblies(added: ConstructionAssembly[]): ConstructionAssembly[] {
  const seen = new Set(builtinAssemblyIds);
  const extra = added.filter(item => {
    if (seen.has(item.id) || item.origin === 'builtin') return false;
    seen.add(item.id);
    return true;
  });
  return [...BUILTIN_ASSEMBLIES, ...extra];
}

export function loadAddedAssemblies(): ConstructionAssembly[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ASSEMBLY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { schemaVersion?: number; assemblies?: unknown };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.assemblies)) return [];
    return parsed.assemblies.flatMap(item => {
      const origin = item && typeof item === 'object' && (item as { origin?: string }).origin === 'import' ? 'import' : 'manual';
      const assembly = parseAssembly(item, origin);
      return assembly.ok && !builtinAssemblyIds.has(assembly.assembly.id) ? [assembly.assembly] : [];
    });
  } catch {
    return [];
  }
}

export function saveAddedAssemblies(assemblies: ConstructionAssembly[]): void {
  if (typeof window === 'undefined') return;
  const added = assemblies.filter(item => item.origin !== 'builtin' && !builtinAssemblyIds.has(item.id));
  window.localStorage.setItem(ASSEMBLY_KEY, JSON.stringify({ schemaVersion: 1, assemblies: added }));
}

export function assemblyCategoriesForFace(face: SurfaceFace): AssemblyCategory[] {
  if (face === 'floor') return ['floor'];
  if (face === 'walls') return ['wall'];
  return ['ceiling', 'roof'];
}

export function assemblyCategoriesForOpening(kind: OpeningKind): AssemblyCategory[] {
  if (kind === 'door') return ['door'];
  if (kind === 'window') return ['window'];
  return [];
}

export function findAssembly(assemblies: ConstructionAssembly[], id: string | null | undefined): ConstructionAssembly | undefined {
  if (!id) return undefined;
  return assemblies.find(item => item.id === id);
}

export function resolveStack(
  assignment: { constructionId?: string | null; layers?: StackLayer[] },
  assemblies: ConstructionAssembly[],
  materials: ConstructionMaterial[]
): StackLayer[] {
  if (assignment.layers && assignment.layers.length > 0) return assignment.layers;
  const assembly = findAssembly(assemblies, assignment.constructionId);
  if (assembly) return assembly.layers;
  if (assignment.constructionId && materials.some(item => item.id === assignment.constructionId)) {
    return [{ materialId: assignment.constructionId, thicknessMm: null, place: 'Single layer' }];
  }
  return [];
}

export function layerResistance(layer: StackLayer, materials: ConstructionMaterial[]): { rIp: number | null; thicknessMm: number | null } {
  const material = findConstruction(materials, layer.materialId);
  if (!material) return { rIp: null, thicknessMm: layer.thicknessMm };
  const thicknessMm = layer.thicknessMm ?? material.thicknessMm;
  if (material.rIp != null && material.thicknessMm && thicknessMm && thicknessMm !== material.thicknessMm) {
    return { rIp: material.rIp * (thicknessMm / material.thicknessMm), thicknessMm };
  }
  return { rIp: publishedR(material).rIp, thicknessMm };
}

export function stackResistance(layers: StackLayer[], materials: ConstructionMaterial[], series: boolean): number | null {
  if (!series || layers.length === 0) return null;
  let sum = 0;
  for (const layer of layers) {
    const resistance = layerResistance(layer, materials).rIp;
    if (resistance == null) return null;
    sum += resistance;
  }
  return sum;
}

export function formatResistance(rIp: number | null, units: UnitSystem): string {
  if (rIp == null) return 'Not stated';
  const number = units === 'IP' ? rIp : rIp / U_SI_PER_IP;
  return units === 'IP' ? `R-${trimNum(number)}` : `${trimNum(number)} m²·K/W`;
}

export function importAssemblies(
  text: string,
  existing: ConstructionAssembly[]
): { additions: ConstructionAssembly[]; added: number; skipped: number; errors: string[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'That file is not valid JSON.' };
  }
  const rows = Array.isArray(parsed)
    ? null
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { assemblies?: unknown }).assemblies)
      ? (parsed as { assemblies: unknown[] }).assemblies
      : null;
  if (!rows) return { error: 'no-assemblies' };
  const seen = new Set([...builtinAssemblyIds, ...existing.map(item => item.id)]);
  const additions = [...existing];
  let added = 0;
  let skipped = 0;
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const assembly = parseAssembly(row, 'import');
    if (!assembly.ok) {
      errors.push(`Component ${index + 1}: ${assembly.error}`);
      return;
    }
    if (seen.has(assembly.assembly.id)) {
      skipped += 1;
      return;
    }
    seen.add(assembly.assembly.id);
    additions.push(assembly.assembly);
    added += 1;
  });
  return { additions, added, skipped, errors };
}
