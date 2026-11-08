import { createId, nowIso } from './ids';
import { placementZ } from './projectOps';
import { getProduct } from './catalog';
import type { HvacSystem, Opening, PlacedEquipment, Project, Room, SurfaceAssignment, SystemKind } from './types';

const CEILING_NOTE =
  'Planning assumption. Microlite_24_kg_m3 is a ThermoNode insulation entry, not a specified ceiling assembly.';
const WALL_METAL_NOTE =
  'Planning assumption. Stainless_steel_AISI_304 is a ThermoNode solid used as a metal wall finish, not a rated partition.';
const UNASSIGNED_NOTE =
  'No ThermoNode material assigned. Gypsum board, concrete, glass, and wood are not in the library snapshot.';

const KITCHEN_USES = new Set(['Kitchen', 'Hot line', 'Prep', 'Dish', 'Walk-in']);

function surface(materialKey: string | null, note: string): SurfaceAssignment {
  return { materialKey, note };
}

function room(input: {
  name: string;
  use: string;
  xM: number;
  yM: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  openings?: Opening[];
}): Room {
  const metal = KITCHEN_USES.has(input.use);
  return {
    id: createId('room'),
    name: input.name,
    use: input.use,
    xM: input.xM,
    yM: input.yM,
    zM: 0,
    lengthM: input.lengthM,
    widthM: input.widthM,
    heightM: input.heightM,
    surfaces: {
      floor: surface(null, UNASSIGNED_NOTE),
      walls: metal ? surface('Stainless_steel_AISI_304', WALL_METAL_NOTE) : surface(null, UNASSIGNED_NOTE),
      ceiling: surface('Microlite_24_kg_m3', CEILING_NOTE),
    },
    openings: input.openings ?? [],
    assumption: true,
  };
}

function door(face: Opening['face'], offsetM: number, widthM = 0.9): Opening {
  return { id: createId('open'), kind: 'door', face, offsetM, widthM, heightM: 2.13, sillM: 0 };
}

function windowOpening(face: Opening['face'], offsetM: number, widthM: number): Opening {
  return { id: createId('open'), kind: 'window', face, offsetM, widthM, heightM: 1.2, sillM: 0.9 };
}

function system(name: string, kind: SystemKind, notes = ''): HvacSystem {
  return { id: createId('sys'), name, kind, notes };
}

function place(
  catalogId: string,
  host: Room | null,
  xM: number,
  yM: number,
  systemId: string | null,
  notes: string
): PlacedEquipment {
  const product = getProduct(catalogId);
  if (!product) throw new Error(`Unknown catalog id ${catalogId}`);
  return {
    id: createId('eq'),
    catalogId,
    roomId: host?.id ?? null,
    systemId,
    xM,
    yM,
    zM: placementZ(host, product),
    yawDeg: 0,
    quantity: 1,
    notes,
    assumption: true,
  };
}

function base(
  name: string,
  subtype: string,
  origin: Project['createdFrom'],
  details: string,
  rooms: Room[],
  systems: HvacSystem[],
  equipment: PlacedEquipment[]
): Project {
  const timestamp = nowIso();
  return {
    schemaVersion: 1,
    id: createId('prj'),
    name,
    location: '',
    buildingType: 'restaurant',
    subtype,
    units: 'IP',
    details,
    createdFrom: origin,
    rooms,
    systems,
    equipment,
    preliminary: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const TEMPLATE_DETAILS =
  'Editable restaurant template. Room sizes, materials, and any example equipment are planning assumptions. Confirm them before design use.';

export function createCafeProject(): Project {
  const dining = room({
    name: 'Dining',
    use: 'Dining',
    xM: 0,
    yM: 0,
    lengthM: 9,
    widthM: 6.5,
    heightM: 3.05,
    openings: [door('px', 1.2), windowOpening('ny', 1.2, 1.6), windowOpening('ny', 4.8, 1.4)],
  });
  const kitchen = room({
    name: 'Kitchen',
    use: 'Kitchen',
    xM: 9,
    yM: 0,
    lengthM: 5,
    widthM: 4.2,
    heightM: 3.2,
    openings: [door('nx', 1.2)],
  });
  const restroom = room({
    name: 'Restroom',
    use: 'Restroom',
    xM: 9,
    yM: 4.2,
    lengthM: 2.4,
    widthM: 2.3,
    heightM: 2.7,
    openings: [door('nx', 0.4, 0.8)],
  });
  const storage = room({
    name: 'Storage',
    use: 'Storage',
    xM: 11.4,
    yM: 4.2,
    lengthM: 2.6,
    widthM: 2.3,
    heightM: 2.7,
    openings: [door('ny', 0.4, 0.9)],
  });
  const exhaust = system('Kitchen exhaust', 'kitchen-exhaust', 'Template grouping. No airflow has been calculated.');
  const comfort = system('Dining comfort', 'comfort', 'Template grouping. No heating or cooling load has been calculated.');
  const restroomSys = system('Restroom exhaust', 'restroom-exhaust', 'Template grouping.');
  const example = 'Example from the café template. Not a sized selection.';
  return base(
    'Café',
    'cafe',
    { kind: 'template', templateId: 'cafe', label: 'Café template' },
    TEMPLATE_DETAILS,
    [dining, kitchen, restroom, storage],
    [exhaust, comfort, restroomSys],
    [
      place('hood-wall-8', kitchen, 11.2, 2.1, exhaust.id, example),
      place('bath-fan-150', restroom, 10.2, 5.3, restroomSys.id, example),
    ]
  );
}

export function createFullServiceProject(): Project {
  const plan = fullServiceRooms();
  const exhaust = system('Kitchen exhaust', 'kitchen-exhaust', 'Template grouping. No airflow has been calculated.');
  const makeup = system('Make-up air', 'makeup-air', 'Template grouping. No airflow has been calculated.');
  const comfort = system('Dining comfort', 'comfort', 'Template grouping. No heating or cooling load has been calculated.');
  const restroomSys = system('Restroom exhaust', 'restroom-exhaust', 'Template grouping.');
  return base(
    'Full-service restaurant',
    'full-service',
    { kind: 'template', templateId: 'full-service', label: 'Full-service restaurant template' },
    `${TEMPLATE_DETAILS} This template has rooms and systems only. Place equipment from the catalog.`,
    plan.rooms,
    [exhaust, makeup, comfort, restroomSys],
    []
  );
}

export function createCommercialKitchenProject(): Project {
  const hot = room({
    name: 'Hot line',
    use: 'Hot line',
    xM: 0,
    yM: 0,
    lengthM: 8,
    widthM: 6.5,
    heightM: 3.6,
    openings: [door('px', 2.2, 1.2), door('py', 1.5, 1.2)],
  });
  const prep = room({
    name: 'Prep',
    use: 'Prep',
    xM: 8,
    yM: 0,
    lengthM: 5.5,
    widthM: 6.5,
    heightM: 3.6,
    openings: [door('nx', 2.2, 1.2)],
  });
  const dish = room({
    name: 'Dish',
    use: 'Dish',
    xM: 0,
    yM: 6.5,
    lengthM: 6,
    widthM: 4.2,
    heightM: 3.4,
    openings: [door('ny', 1.5, 1.2)],
  });
  const walkIn = room({
    name: 'Walk-in',
    use: 'Walk-in',
    xM: 6,
    yM: 6.5,
    lengthM: 4,
    widthM: 4.2,
    heightM: 3.4,
    openings: [door('ny', 1.4, 1.1)],
  });
  const dry = room({
    name: 'Dry storage',
    use: 'Dry storage',
    xM: 10,
    yM: 6.5,
    lengthM: 3.5,
    widthM: 4.2,
    heightM: 3.2,
    openings: [door('ny', 1.1, 0.9)],
  });
  const office = room({
    name: 'Office',
    use: 'Office',
    xM: 13.5,
    yM: 0,
    lengthM: 3.2,
    widthM: 3.2,
    heightM: 2.7,
    openings: [door('py', 1.0, 0.9), windowOpening('px', 0.8, 1.2)],
  });
  const corridor = room({
    name: 'Corridor',
    use: 'Corridor',
    xM: 13.5,
    yM: 3.2,
    lengthM: 3.2,
    widthM: 7.5,
    heightM: 2.7,
    openings: [door('ny', 1.0, 0.9)],
  });
  const exhaust = system('Kitchen exhaust', 'kitchen-exhaust', 'Template grouping. No airflow has been calculated.');
  const makeup = system('Make-up air', 'makeup-air', 'Template grouping. No airflow has been calculated.');
  const dishSys = system('Dish exhaust', 'ventilation', 'Template grouping.');
  const example = 'Example from the commercial kitchen template. Not a sized selection.';
  return base(
    'Commercial kitchen',
    'commercial-kitchen',
    { kind: 'template', templateId: 'commercial-kitchen', label: 'Commercial kitchen template' },
    TEMPLATE_DETAILS,
    [hot, prep, dish, walkIn, dry, office, corridor],
    [exhaust, makeup, dishSys],
    [
      place('hood-island-10', hot, 4, 3.2, exhaust.id, example),
      place('fan-upblast-30', hot, 6.2, 2.2, exhaust.id, example),
      place('mau-40', prep, 10.8, 3.2, makeup.id, example),
      place('fan-inline-8', dish, 3, 8.4, dishSys.id, example),
    ]
  );
}

function fullServiceRooms() {
  const dining = room({
    name: 'Dining',
    use: 'Dining',
    xM: 0,
    yM: 0,
    lengthM: 12,
    widthM: 8,
    heightM: 3.2,
    openings: [door('py', 5.5, 1.2), door('px', 1.5, 1.5), windowOpening('ny', 1.5, 1.8), windowOpening('ny', 6, 1.8)],
  });
  const bar = room({
    name: 'Bar',
    use: 'Bar',
    xM: 12,
    yM: 0,
    lengthM: 4.4,
    widthM: 5,
    heightM: 3.2,
    openings: [door('nx', 1.5, 1.5)],
  });
  const restroomA = room({
    name: 'Restroom A',
    use: 'Restroom',
    xM: 12,
    yM: 5,
    lengthM: 2.2,
    widthM: 3,
    heightM: 2.7,
    openings: [door('py', 0.6, 0.8)],
  });
  const restroomB = room({
    name: 'Restroom B',
    use: 'Restroom',
    xM: 14.2,
    yM: 5,
    lengthM: 2.2,
    widthM: 3,
    heightM: 2.7,
    openings: [door('py', 0.6, 0.8)],
  });
  const corridor = room({
    name: 'Corridor',
    use: 'Corridor',
    xM: 0,
    yM: 8,
    lengthM: 16.4,
    widthM: 1.8,
    heightM: 3,
    openings: [door('ny', 5.5, 1.2), door('py', 4, 1.2)],
  });
  const kitchen = room({
    name: 'Kitchen',
    use: 'Kitchen',
    xM: 0,
    yM: 9.8,
    lengthM: 10,
    widthM: 6.2,
    heightM: 3.4,
    openings: [door('ny', 4, 1.2), door('px', 1.2, 1.2)],
  });
  const prep = room({
    name: 'Prep',
    use: 'Prep',
    xM: 10,
    yM: 9.8,
    lengthM: 6.4,
    widthM: 3.2,
    heightM: 3.4,
    openings: [door('nx', 1, 1.2)],
  });
  const dish = room({
    name: 'Dish',
    use: 'Dish',
    xM: 10,
    yM: 13,
    lengthM: 6.4,
    widthM: 3,
    heightM: 3.4,
    openings: [door('ny', 1.2, 1.1)],
  });
  const storage = room({
    name: 'Storage',
    use: 'Storage',
    xM: 16.4,
    yM: 0,
    lengthM: 3.2,
    widthM: 4.2,
    heightM: 3,
    openings: [door('nx', 1.2, 0.9)],
  });
  const office = room({
    name: 'Office',
    use: 'Office',
    xM: 16.4,
    yM: 4.2,
    lengthM: 3.2,
    widthM: 5.6,
    heightM: 3,
    openings: [door('nx', 3.8, 0.9), windowOpening('px', 1.5, 1.2)],
  });
  return {
    rooms: [dining, bar, restroomA, restroomB, corridor, kitchen, prep, dish, storage, office],
    dining,
    kitchen,
    prep,
    dish,
    restroomA,
    restroomB,
    office,
  };
}

export function createSampleProject(): Project {
  const plan = fullServiceRooms();
  const exhaust = system('Kitchen exhaust', 'kitchen-exhaust', 'Sample grouping for the cooking line. Airflow is not calculated.');
  const makeup = system('Make-up air', 'makeup-air', 'Sample grouping. Not balanced to the exhaust.');
  const comfort = system('Dining comfort', 'comfort', 'Sample grouping. Not a load calculation.');
  const restroomSys = system('Restroom exhaust', 'restroom-exhaust', 'Sample grouping.');
  const dishSys = system('Dish exhaust', 'ventilation', 'Sample grouping.');
  const mark = 'Sample placement for workflow exploration. Not a sized or validated selection.';
  return base(
    'Harbor & Rye — sample',
    'full-service',
    { kind: 'sample', templateId: 'sample-harbor', label: 'Completed sample project' },
    'Fictional full-service restaurant used to explore the workflow. Room sizes, materials, and equipment are planning assumptions, not survey data or engineered selections. Location is not specified.',
    plan.rooms,
    [exhaust, makeup, comfort, restroomSys, dishSys],
    [
      place('hood-wall-8', plan.kitchen, 3.5, 13, exhaust.id, `${mark} Shown over the cooking line.`),
      place('fan-upblast-30', plan.kitchen, 6.5, 14.5, exhaust.id, `${mark} Shown on the kitchen roof. Fan dimensions are not stated.`),
      place('mau-40', plan.prep, 13.2, 11.4, makeup.id, `${mark} Shown on the prep roof. Not balanced to the hood.`),
      place('fan-inline-8', plan.dish, 13.2, 14.5, dishSys.id, mark),
      place('bath-fan-150', plan.restroomA, 13.1, 6.5, restroomSys.id, mark),
      place('bath-fan-150', plan.restroomB, 15.3, 6.5, restroomSys.id, mark),
      place('rtu-12', plan.dining, 6, 4, comfort.id, `${mark} Cooling capacity is not a calculated load.`),
      place('erv-20', plan.office, 18, 7, comfort.id, mark),
      place('cu-5', plan.office, 21, 6, comfort.id, `${mark} Footprint is outside the office. The assignment is only a zone tag.`),
    ]
  );
}

export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  create: () => Project;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'cafe',
    name: 'Café',
    description: 'Dining, kitchen, restroom, and storage, with an example hood and bathroom fan.',
    create: createCafeProject,
  },
  {
    id: 'full-service',
    name: 'Full-service restaurant',
    description: 'Dining, bar, kitchen, prep, dish, restrooms, storage, office, and corridor. Systems are grouped. Equipment is left for you to place.',
    create: createFullServiceProject,
  },
  {
    id: 'commercial-kitchen',
    name: 'Commercial kitchen',
    description: 'Hot line, prep, dish, walk-in, storage, office, and corridor, with example hood, exhaust, and make-up air.',
    create: createCommercialKitchenProject,
  },
];
