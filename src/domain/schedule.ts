import { CATEGORY_LABEL, getProduct } from './catalog';
import { footprintOutsideRoom } from './projectOps';
import type { PlacedEquipment, Project, Room } from './types';
import { formatFlow, formatLength, formatPower } from './units';

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
    product.cooling ? `${formatPower(product.cooling.valueW, project.units)} cooling · assumption (stated ${product.cooling.stated})` : null,
    product.heating ? `${formatPower(product.heating.valueW, project.units)} heating · assumption (stated ${product.heating.stated})` : null,
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
      ? `${formatFlow(product.airflow.valueM3s, project.units)} · assumption (stated ${product.airflow.stated})`
      : 'Not stated',
    capacity: capacity || 'Not stated',
    dimensions: product.dimensions
      ? `${formatLength(product.dimensions.lengthM, project.units)} × ${formatLength(product.dimensions.widthM, project.units)} × ${formatLength(product.dimensions.heightM, project.units)} · assumption (stated ${product.dimensions.stated})`
      : 'Not stated',
    electrical: product.electrical ?? 'Not stated',
    connections: product.connections ?? 'Not stated',
    room: room?.name ?? 'Unassigned',
    system: system?.name ?? 'Unassigned',
    source: product.source,
    reviewStatus: 'Needs confirmation',
    review: [...product.gaps, ...review],
  };
}

function reviewNotes(item: PlacedEquipment, room: Room | undefined): string[] {
  const notes: string[] = [];
  if (!item.roomId) notes.push('No room assignment.');
  else if (footprintOutsideRoom(item, room)) notes.push('Footprint center is outside the assigned room.');
  if (!item.systemId) notes.push('No HVAC system assignment.');
  if (item.quantity !== 1) notes.push('Quantity is a schedule count. The model shows one footprint.');
  if (item.notes.trim()) notes.push(item.notes.trim());
  if (item.assumption) notes.push('Placement is a planning mark, not a solver result.');
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

export function scheduleCsv(project: Project, lines: ScheduleLine[], bom: BomLine[]): string {
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
      'Room',
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
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function projectSummary(project: Project, lines: ScheduleLine[], bom: BomLine[]) {
  return {
    disclaimer:
      'Preliminary planning export. Equipment was selected in the HVAC app. ThermoNode was not asked to size or validate performance.',
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
          walls: room.surfaces.walls.materialKey,
          ceiling: room.surfaces.ceiling.materialKey,
        },
        construction: {
          floor: room.surfaces.floor.constructionId ?? null,
          walls: room.surfaces.walls.constructionId ?? null,
          ceiling: room.surfaces.ceiling.constructionId ?? null,
          layers: {
            floor: (room.surfaces.floor.layers ?? []).map(layer => layer.materialId),
            walls: (room.surfaces.walls.layers ?? []).map(layer => layer.materialId),
            ceiling: (room.surfaces.ceiling.layers ?? []).map(layer => layer.materialId),
          },
        },
        assumption: room.assumption,
      })),
      systems: project.systems.map(system => ({ name: system.name, kind: system.kind, notes: system.notes })),
    },
    schedule: lines,
    bom,
  };
}
