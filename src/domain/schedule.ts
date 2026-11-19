import { CATEGORY_LABEL, getProduct } from './catalog';
import { findAssembly, findConstruction, formatThickness, resolveStack, type ConstructionAssembly, type ConstructionMaterial } from './constructionLibrary';
import { doorCopies, doorwayKey } from './doorSwing';
import { footprintOutsideRoom } from './projectOps';
import type { Opening, PlacedEquipment, Project, Room, SurfaceAssignment } from './types';
import { formatFlow, formatLength, formatPower } from './units';
import { interfaceTargets } from './walls';

export interface ScheduleLine {
  placementId: string;
  category: string;
  manufacturer: string;
  model: string;
  name: string;
  quantity: number;
  supplier: string;
  documentUrl: string | null;
  airflow: string;
  capacity: string;
  dimensions: string;
  electrical: string;
  connections: string;
  room: string;
  system: string;
  source: string;
  reviewStatus: string;
  review: string[];
}

export interface BomLine {
  catalogId: string;
  category: string;
  manufacturer: string;
  model: string;
  name: string;
  quantity: number;
  supplier: string;
  documentUrl: string | null;
  airflow: string;
  capacity: string;
  dimensions: string;
  assignments: string;
  source: string;
  reviewStatus: string;
  review: string[];
}

export function buildSchedule(project: Project): ScheduleLine[] {
  return project.equipment.map(item => lineFor(project, item));
}

function lineFor(project: Project, item: PlacedEquipment): ScheduleLine {
  const product = getProduct(item.catalogId);
  const room = project.rooms.find(entry => entry.id === item.roomId);
  const system = project.systems.find(entry => entry.id === item.systemId);
  const review = reviewNotes(item, room);
  if (!product) {
    return {
      placementId: item.id,
      category: 'Unknown',
      manufacturer: 'Unknown',
      model: item.catalogId,
      name: 'Missing catalog product',
      quantity: item.quantity,
      supplier: 'Not stated',
      documentUrl: null,
      airflow: 'Not stated',
      capacity: 'Not stated',
      dimensions: 'Not stated',
      electrical: 'Not stated',
      connections: 'Not stated',
      room: room?.name ?? 'Unassigned',
      system: system?.name ?? 'Unassigned',
      source: 'Catalog id is not in the demo catalog.',
      reviewStatus: 'Needs confirmation',
      review: ['Catalog product was not found.', ...review],
    };
  }
  const capacity = [
    product.cooling ? `${formatPower(product.cooling.valueW, project.units)} cooling` : null,
    product.heating ? `${formatPower(product.heating.valueW, project.units)} heating` : null,
  ]
    .filter(Boolean)
    .join('; ');
  return {
    placementId: item.id,
    category: CATEGORY_LABEL[product.category],
    manufacturer: product.manufacturer,
    model: product.model,
    name: product.name,
    quantity: item.quantity,
    supplier: product.supplier,
    documentUrl: product.documentUrl,
    airflow: product.airflow
      ? formatFlow(product.airflow.valueM3s, project.units)
      : 'Not stated',
    capacity: capacity || 'Not stated',
    dimensions: product.dimensions
      ? `${formatLength(product.dimensions.lengthM, project.units)} × ${formatLength(product.dimensions.widthM, project.units)} × ${formatLength(product.dimensions.heightM, project.units)}`
      : 'Not stated',
    electrical: product.electrical ?? 'Not stated',
    connections: product.connections ?? 'Not stated',
    room: room?.name ?? 'Unassigned',
    system: system?.name ?? 'Unassigned',
    source: product.source,
    reviewStatus: 'Needs confirmation',
    review,
  };
}

function reviewNotes(item: PlacedEquipment, room: Room | undefined): string[] {
  const notes: string[] = [];
  if (!item.roomId) notes.push('No space assignment.');
  else if (footprintOutsideRoom(item, room)) notes.push('Footprint center is outside the assigned space.');
  if (!item.systemId) notes.push('No HVAC system assignment.');
  if (item.notes.trim()) notes.push(item.notes.trim());
  return notes;
}

export function buildBom(lines: ScheduleLine[]): BomLine[] {
  const groups = new Map<string, BomLine>();
  for (const line of lines) {
    const key = `${line.manufacturer}|${line.model}`;
    const existing = groups.get(key);
    const assignment = `${line.room} / ${line.system} × ${line.quantity}`;
    if (!existing) {
      groups.set(key, {
        catalogId: key,
        category: line.category,
        manufacturer: line.manufacturer,
        model: line.model,
        name: line.name,
        quantity: line.quantity,
        supplier: line.supplier,
        documentUrl: line.documentUrl,
        airflow: line.airflow,
        capacity: line.capacity,
        dimensions: line.dimensions,
        assignments: assignment,
        source: line.source,
        reviewStatus: line.reviewStatus,
        review: line.review,
      });
    } else {
      existing.quantity += line.quantity;
      existing.assignments = `${existing.assignments}; ${assignment}`;
      const merged = new Set([...existing.review, ...line.review]);
      existing.review = [...merged];
    }
  }
  return [...groups.values()];
}

function csvCell(value: string | number | null): string {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export interface ConstructionLine {
  id: string;
  category: 'Interface' | 'Door' | 'Window' | 'Opening';
  name: string;
  space: string;
  size: string;
  thickness: string;
  component: string;
  layers: string;
  lengthM: number;
  reviewStatus: 'Preliminary';
  review: string[];
}

export interface ConstructionBomLine {
  id: string;
  category: string;
  component: string;
  layers: string;
  quantity: number;
  size: string;
  assignments: string;
  reviewStatus: 'Preliminary';
  review: string[];
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

function layerText(layers: { materialId: string; thicknessMm: number | null }[], materials: ConstructionMaterial[], units: Project['units']): string {
  if (layers.length === 0) return 'No layers';
  return layers
    .map(layer => {
      const material = findConstruction(materials, layer.materialId);
      const name = material?.name ?? layer.materialId;
      return `${name} (${formatThickness(layer.thicknessMm ?? material?.thicknessMm ?? null, units)})`;
    })
    .join('; ');
}

function constructionFacts(
  assignment: SurfaceAssignment | Opening | undefined,
  assemblies: ConstructionAssembly[],
  materials: ConstructionMaterial[],
  units: Project['units'],
): { component: string; layers: string; thickness: string; review: string[] } {
  const stored = assignment ?? { constructionId: null, layers: [] };
  const layers = resolveStack(stored, assemblies, materials);
  const assembly = findAssembly(assemblies, stored.constructionId);
  const component = assembly?.name ?? (layers.length > 0 ? 'Custom' : 'Unassigned');
  const review = component === 'Unassigned' ? ['No component is assigned.'] : [];
  return {
    component,
    layers: layerText(layers, materials, units),
    thickness: formatThickness(stackThicknessMm(layers, materials), units),
    review,
  };
}

export function buildConstructionSchedule(project: Project, assemblies: ConstructionAssembly[], materials: ConstructionMaterial[]): ConstructionLine[] {
  const lines: ConstructionLine[] = [];
  const seenDoors = new Set<string>();
  for (const target of interfaceTargets(project.rooms)) {
    const host = target.sides[0];
    const other = target.sides[1];
    if (!host) continue;
    const room = project.rooms.find(item => item.id === host.roomId);
    const facts = constructionFacts(project.interfaceWalls?.[target.key], assemblies, materials, project.units);
    const height = room?.heightM ?? 0;
    lines.push({
      id: target.key,
      category: 'Interface',
      name: `Interface · ${other?.name || 'Outside'}`,
      space: other ? `${host.name} · ${other.name}` : host.name,
      size: `${formatLength(target.lengthM, project.units, 2)} × ${formatLength(height, project.units, 2)}`,
      thickness: facts.thickness,
      component: facts.component,
      layers: facts.layers,
      lengthM: target.lengthM,
      reviewStatus: 'Preliminary',
      review: facts.review,
    });
  }
  for (const room of project.rooms) {
    for (const opening of room.openings) {
      let space = room.name || 'Space';
      let source = opening;
      if (opening.kind === 'door') {
        const key = doorwayKey(room, opening);
        if (seenDoors.has(key)) continue;
        seenDoors.add(key);
        const copies = doorCopies(project.rooms, room, opening);
        space = [...new Set(copies.map(copy => copy.room.name || 'Space'))].join(' · ');
        source = copies.find(copy => copy.opening.constructionId || (copy.opening.layers && copy.opening.layers.length > 0))?.opening ?? opening;
      }
      const facts = constructionFacts(source, assemblies, materials, project.units);
      const category = opening.kind === 'door' ? 'Door' : opening.kind === 'window' ? 'Window' : 'Opening';
      lines.push({
        id: source.id,
        category,
        name: category,
        space,
        size: `${formatLength(source.widthM, project.units, 2)} × ${formatLength(source.heightM, project.units, 2)}`,
        thickness: facts.thickness,
        component: facts.component,
        layers: facts.layers,
        lengthM: source.widthM,
        reviewStatus: 'Preliminary',
        review: facts.review,
      });
    }
  }
  return lines;
}

export function buildConstructionBom(lines: ConstructionLine[], units: Project['units']): ConstructionBomLine[] {
  const groups = new Map<string, ConstructionBomLine & { lengthM: number }>();
  for (const line of lines) {
    const key = `${line.category}|${line.component}|${line.layers}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: key,
        category: line.category,
        component: line.component,
        layers: line.layers,
        quantity: 1,
        size: '',
        assignments: line.space,
        reviewStatus: 'Preliminary',
        review: line.review,
        lengthM: line.lengthM,
      });
    } else {
      existing.quantity += 1;
      existing.lengthM += line.lengthM;
      if (!existing.assignments.split('; ').includes(line.space)) existing.assignments = `${existing.assignments}; ${line.space}`;
      existing.review = [...new Set([...existing.review, ...line.review])];
    }
  }
  return [...groups.values()].map(line => ({
    id: line.id,
    category: line.category,
    component: line.component,
    layers: line.layers,
    quantity: line.quantity,
    size: formatLength(line.lengthM, units, 2),
    assignments: line.assignments,
    reviewStatus: 'Preliminary',
    review: line.review,
  }));
}

export function scheduleCsv(
  project: Project,
  lines: ScheduleLine[],
  bom: BomLine[],
  construction: ConstructionLine[] = [],
  constructionBom: ConstructionBomLine[] = [],
): string {
  const unitNote =
    project.units === 'IP'
      ? 'Display units: ft, CFM, Btu/h. Canonical project storage is m, m³/s, and W.'
      : 'Display units: m, L/s, kW. Canonical project storage is m, m³/s, and W.';
  const rows: string[][] = [
    ['Preliminary equipment schedule'],
    [project.name],
    [unitNote],
    ['This schedule is user-selected planning data. It is not a sized or code-checked design.'],
    [],
    [
      'Category',
      'Manufacturer',
      'Model',
      'Name',
      'Quantity',
      'Supplier',
      'Document',
      'Airflow',
      'Capacity',
      'Dimensions',
      'Electrical',
      'Connections',
      'Space',
      'System',
      'Review status',
      'Review notes',
    ],
    ...lines.map(line => [
      line.category,
      line.manufacturer,
      line.model,
      line.name,
      String(line.quantity),
      line.supplier,
      line.documentUrl ?? 'None',
      line.airflow,
      line.capacity,
      line.dimensions,
      line.electrical,
      line.connections,
      line.room,
      line.system,
      line.reviewStatus,
      line.review.join(' '),
    ]),
    [],
    ['Preliminary bill of materials'],
    [
      'Category',
      'Manufacturer',
      'Model',
      'Name',
      'Total quantity',
      'Supplier',
      'Document',
      'Airflow',
      'Capacity',
      'Dimensions',
      'Assignments',
      'Review status',
      'Review notes',
    ],
    ...bom.map(line => [
      line.category,
      line.manufacturer,
      line.model,
      line.name,
      String(line.quantity),
      line.supplier,
      line.documentUrl ?? 'None',
      line.airflow,
      line.capacity,
      line.dimensions,
      line.assignments,
      line.reviewStatus,
      line.review.join(' '),
    ]),
    [],
    ['Preliminary construction'],
    ['Category', 'Name', 'Space', 'Size', 'Thickness', 'Component', 'Layers', 'Review status', 'Review notes'],
    ...construction.map(line => [line.category, line.name, line.space, line.size, line.thickness, line.component, line.layers, line.reviewStatus, line.review.join(' ')]),
    [],
    ['Preliminary construction bill of materials'],
    ['Category', 'Component', 'Layers', 'Quantity', 'Length', 'Assignments', 'Review status', 'Review notes'],
    ...constructionBom.map(line => [line.category, line.component, line.layers, String(line.quantity), line.size, line.assignments, line.reviewStatus, line.review.join(' ')]),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function projectSummary(
  project: Project,
  lines: ScheduleLine[],
  bom: BomLine[],
  construction: ConstructionLine[] = [],
  constructionBom: ConstructionBomLine[] = [],
) {
  return {
    exportedAt: new Date().toISOString(),
    units: {
      storedLength: 'm',
      storedAirflow: 'm³/s',
      storedPower: 'W',
      display: project.units,
    },
    project: {
      name: project.name,
      location: project.location || 'Not stated',
      buildingType: project.buildingType,
      subtype: project.subtype || 'Not stated',
      details: project.details,
      createdFrom: project.createdFrom,
      preliminary: true,
      rooms: project.rooms.map(room => ({
        name: room.name,
        use: room.use,
        originM: { x: room.xM, y: room.yM, z: room.zM },
        sizeM: { length: room.lengthM, width: room.widthM, height: room.heightM },
        materials: {
          floor: room.surfaces.floor.materialKey,
          walls: {
            px: room.surfaces.walls.px.materialKey,
            nx: room.surfaces.walls.nx.materialKey,
            py: room.surfaces.walls.py.materialKey,
            ny: room.surfaces.walls.ny.materialKey,
          },
          ceiling: room.surfaces.ceiling.materialKey,
        },
        construction: {
          floor: room.surfaces.floor.constructionId ?? null,
          walls: {
            px: room.surfaces.walls.px.constructionId ?? null,
            nx: room.surfaces.walls.nx.constructionId ?? null,
            py: room.surfaces.walls.py.constructionId ?? null,
            ny: room.surfaces.walls.ny.constructionId ?? null,
          },
          ceiling: room.surfaces.ceiling.constructionId ?? null,
          layers: {
            floor: (room.surfaces.floor.layers ?? []).map(layer => layer.materialId),
            walls: {
              px: (room.surfaces.walls.px.layers ?? []).map(layer => layer.materialId),
              nx: (room.surfaces.walls.nx.layers ?? []).map(layer => layer.materialId),
              py: (room.surfaces.walls.py.layers ?? []).map(layer => layer.materialId),
              ny: (room.surfaces.walls.ny.layers ?? []).map(layer => layer.materialId),
            },
            ceiling: (room.surfaces.ceiling.layers ?? []).map(layer => layer.materialId),
          },
        },
        assumption: room.assumption,
      })),
      systems: project.systems.map(system => ({ name: system.name, kind: system.kind, notes: system.notes })),
    },
    schedule: lines,
    bom,
    construction,
    constructionBom,
  };
}
