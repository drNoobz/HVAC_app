import { blankSite } from './climate';
import { builtinAssembly, cloneLayers } from './constructionLibrary';
import { equipmentSizeM, getProduct } from './catalog';
import { defaultSections, placedPorts } from './airUnits';
import { getDuctProduct } from './ductCatalog';
import { createId, nowIso } from './ids';
import { getLoadProduct } from './loadCatalog';
import { addDuct, placementZ } from './projectOps';
import { applySystemPackage } from './systemPackages';
import type { DuctService, DuctNode, HvacSystem, LoadItem, Opening, PlacedEquipment, Project, Room, SiteClimate, SurfaceAssignment, SystemKind } from './types';
import { interfaceTargets, isOutsideInterfaceKey, repeatedWalls, separateSharedWalls } from './walls';

const PLANNING_NOTE = 'Planning default from the restaurant construction library. The stack is copied onto this surface. Confirm the climate zone and the tested assembly before design use.';
const KITCHEN_USES = new Set(['Kitchen', 'Hot line', 'Prep', 'Dish']);
const SERVICE_USES = new Set(['Kitchen', 'Hot line', 'Prep', 'Dish', 'Restroom', 'Storage', 'Dry storage', 'Corridor', 'Service']);
const DINING_USES = new Set(['Dining', 'Bar']);

function surface(assemblyId: string): SurfaceAssignment {
  const assembly = builtinAssembly(assemblyId);
  if (!assembly) throw new Error(`Unknown assembly ${assemblyId}`);
  return { materialKey: null, constructionId: assembly.id, layers: cloneLayers(assembly.layers), note: PLANNING_NOTE };
}

function withAssembly(kind: 'door' | 'window'): Pick<Opening, 'constructionId' | 'layers'> {
  const assembly = builtinAssembly(kind === 'door' ? 'asm-door-restaurant' : 'asm-window-dining');
  if (!assembly) throw new Error(`Unknown ${kind} assembly`);
  return { constructionId: assembly.id, layers: cloneLayers(assembly.layers) };
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
  const floorId =
    input.use === 'Walk-in'
      ? 'asm-floor-walkin'
      : KITCHEN_USES.has(input.use) || input.use === 'Restroom'
        ? 'asm-floor-kitchen'
        : DINING_USES.has(input.use) || input.use === 'Office'
          ? 'asm-floor-dining'
          : 'asm-floor-service';
  const wallId = input.use === 'Walk-in' ? 'asm-wall-walkin' : KITCHEN_USES.has(input.use) ? 'asm-wall-kitchen' : DINING_USES.has(input.use) ? 'asm-wall-dining' : 'asm-wall-partition';
  const ceilingId = input.use === 'Walk-in' ? 'asm-ceiling-walkin' : KITCHEN_USES.has(input.use) || input.use === 'Restroom' ? 'asm-ceiling-kitchen' : 'asm-ceiling-dining';
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
      floor: surface(floorId),
      walls: repeatedWalls(wallId),
      ceiling: surface(ceilingId),
    },
    openings: input.openings ?? [],
    assumption: true,
  };
}

function door(face: Opening['face'], offsetM: number, widthM = 0.9): Opening {
  return { id: createId('open'), kind: 'door', face, offsetM, widthM, heightM: 2.13, sillM: 0, ...withAssembly('door') };
}

function windowOpening(face: Opening['face'], offsetM: number, widthM: number): Opening {
  return { id: createId('open'), kind: 'window', face, offsetM, widthM, heightM: 1.2, sillM: 0.9, ...withAssembly('window') };
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
  notes: string,
  yawDeg = 0,
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
    yawDeg,
    quantity: 1,
    notes,
    assumption: true,
    ...(product.unit ? { sections: defaultSections(product) } : {}),
  };
}

const CFM = 0.0004719474432;

/** Same placement with a design airflow, CFM. */
function rated(item: PlacedEquipment, cfm: number): PlacedEquipment {
  return { ...item, designFlowM3s: cfm * CFM };
}

const EXAMPLE = 'Example from the full-service template. Confirm the selection before design use.';

function load(loadId: string, host: Room, xM: number, yM: number, quantity = 1, yawDeg = 0): LoadItem {
  const product = getLoadProduct(loadId);
  if (!product) throw new Error(`Unknown load ${loadId}`);
  return {
    id: createId('load'),
    loadId,
    roomId: host.id,
    xM,
    yM,
    yawDeg,
    lengthM: product.size?.lengthM ?? null,
    widthM: product.size?.widthM ?? null,
    heightM: product.size?.heightM ?? null,
    quantity,
    override: null,
    notes: EXAMPLE,
  };
}

function ductDiameter(catalogId: string, inches: number): number {
  const size = getDuctProduct(catalogId)?.sizes?.find(item => item.id === String(inches));
  if (!size) throw new Error(`No ${inches} in size on ${catalogId}`);
  return size.widthM;
}

function portPoint(item: PlacedEquipment, portId: string): { x: number; y: number; equipmentId: string; portId: string } {
  const product = getProduct(item.catalogId);
  const port = product ? placedPorts(item).find(entry => entry.id === portId) : undefined;
  if (!product || !port) throw new Error(`No port ${portId} on ${item.catalogId}`);
  const size = equipmentSizeM(product);
  const yaw = (item.yawDeg * Math.PI) / 180;
  const lx = (port.u * size.lengthM) / 2;
  const ly = (port.v * size.widthM) / 2;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: item.xM + lx * c - ly * s, y: item.yM + lx * s + ly * c, equipmentId: item.id, portId };
}

function connect(
  project: Project,
  catalogId: string,
  systemId: string,
  service: DuctService,
  inches: number,
  points: { x: number; y: number; equipmentId?: string; portId?: string; nodeId?: string }[],
): Project {
  const next = addDuct(project, { catalogId, systemId, service, shape: 'round', widthM: ductDiameter(catalogId, inches), heightM: null, points });
  if (next === project) throw new Error(`Could not add ${service} duct ${catalogId}`);
  return next;
}

/** Junction where a trunk tees into branches. */
function junction(project: Project, systemId: string, service: DuctService, x: number, y: number): { project: Project; point: { x: number; y: number; nodeId: string } } {
  const node: DuctNode = { id: createId('node'), systemId, service, x, y };
  return { project: { ...project, ductNodes: [...(project.ductNodes ?? []), node] }, point: { x, y, nodeId: node.id } };
}

/** Duct from an equipment port out to a free terminal (outlet / discharge / diffuser). */
function fromPort(
  project: Project,
  item: PlacedEquipment,
  portId: string,
  catalogId: string,
  systemId: string,
  service: DuctService,
  inches: number,
  end: { x: number; y: number },
  via: { x: number; y: number }[] = [],
): Project {
  return connect(project, catalogId, systemId, service, inches, [portPoint(item, portId), ...via, end]);
}

/** Duct from a free terminal into an equipment port (inlet / capture / outdoor intake). */
function toPort(
  project: Project,
  start: { x: number; y: number },
  item: PlacedEquipment,
  portId: string,
  catalogId: string,
  systemId: string,
  service: DuctService,
  inches: number,
  via: { x: number; y: number }[] = [],
): Project {
  return connect(project, catalogId, systemId, service, inches, [start, ...via, portPoint(item, portId)]);
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
  return assignInterfaces({
    schemaVersion: 1,
    id: createId('prj'),
    name,
    location: '',
    buildingType: 'restaurant',
    subtype,
    units: 'IP',
    details,
    createdFrom: origin,
    rooms: separateSharedWalls(rooms),
    systems,
    equipment,
    wallRuns: [],
    loads: [],
    ducts: [],
    preliminary: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function exteriorAssemblyId(use: string): string {
  if (use === 'Walk-in') return 'asm-wall-walkin';
  if (SERVICE_USES.has(use)) return 'asm-wall-kitchen';
  return 'asm-wall-dining';
}

function assignInterfaces(project: Project): Project {
  const interfaceWalls: NonNullable<Project['interfaceWalls']> = { ...project.interfaceWalls };
  for (const target of interfaceTargets(project.rooms)) {
    if (interfaceWalls[target.key]?.constructionId) continue;
    const host = project.rooms.find(room => room.id === target.sides[0]?.roomId);
    const other = project.rooms.find(room => room.id === target.sides[1]?.roomId);
    const outside = isOutsideInterfaceKey(target.key);
    const assemblyId = outside
      ? exteriorAssemblyId(host?.use ?? '')
      : host?.use === 'Walk-in' || other?.use === 'Walk-in'
        ? 'asm-wall-walkin'
        : 'asm-wall-partition';
    interfaceWalls[target.key] = surface(assemblyId);
  }
  return { ...project, interfaceWalls };
}

const TEMPLATE_DETAILS =
  'Editable restaurant template. Room sizes, materials, and any example equipment are planning assumptions. Confirm them before design use. Each air system runs from its unit or fan through branch ducts to diffusers, grilles, louvers, or roof hoods.';

/**
 * Chicago O'Hare annual design day from EnergyPlus TMY3 .ddy (ASHRAE 2009 Climate Design Data).
 * July deep ground from the matching .stat. Infiltration is a planning default, not from that file.
 */
function fullServiceSite(): SiteClimate {
  const site = blankSite();
  const keys = [
    'latitudeDeg',
    'longitudeDeg',
    'timeZoneH',
    'elevationM',
    'heatingDbC',
    'coolingDbC',
    'coolingWbC',
    'coolingRangeK',
    'windMs',
    'windDirDeg',
    'taub',
    'taud',
    'groundC',
    'infiltrationAch',
  ] as const;
  return {
    ...site,
    station: "Chicago O'Hare Intl AP, IL (planning)",
    fileName: 'USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.ddy',
    latitudeDeg: 41.98,
    longitudeDeg: -87.92,
    timeZoneH: -6,
    elevationM: 201,
    heatingDbC: -20,
    coolingDbC: 33.3,
    coolingWbC: 23.7,
    coolingRangeK: 10.5,
    coolingMonth: 7,
    windMs: 5.2,
    windDirDeg: 230,
    taub: 0.455,
    taud: 2.05,
    tauEdition: '2009',
    groundC: 13.8,
    infiltrationAch: 0.25,
    sources: Object.fromEntries(keys.map(key => [key, 'manual' as const])),
  };
}

export function createFullServiceProject(): Project {
  const plan = fullServiceRooms();
  const exhaust = system(
    'Kitchen exhaust',
    'kitchen-exhaust',
    'Type I hood (1,600 CFM) → listed grease duct → roof upblast fan selected at the hood airflow. The fan discharges to outdoors on its own.',
  );
  const makeup = system(
    'Make-up air',
    'makeup-air',
    'Rooftop direct-fired MAU with its intake hood on the unit. Supply trunk tees to two diffusers ahead of the cooking line. Set to the hood exhaust so the kitchen is close to neutral.',
  );
  const restroomSys = system(
    'Restroom exhaust',
    'restroom-exhaust',
    'Ceiling fan in each restroom (the grille is the fan face) → duct → gravity relief hood on the roof.',
  );
  const dishSys = system(
    'Dish exhaust',
    'ventilation',
    'Exhaust grille over the dish machine → inline fan → gravity relief hood on the roof.',
  );
  const ervSys = system(
    'Office ERV',
    'ventilation',
    'Rooftop ERV with outdoor-air and exhaust hoods on the casing. Supply diffuser and return grille in the office.',
  );
  const hood = place('hood-wall-8', plan.kitchen, 3.6, 15.39, exhaust.id, `${EXAMPLE} Wall canopy on the back wall.`);
  const fan = rated(place('fan-upblast-30', plan.kitchen, 7.6, 12.2, exhaust.id, `${EXAMPLE} Roof upblast fan selected at the hood airflow.`), 1600);
  const mauBase = place('mau-40', plan.prep, 13.2, 11.2, makeup.id, `${EXAMPLE} Rooftop MAU. Intake hood on the unit; supply faces the kitchen.`, 180);
  const mau: PlacedEquipment = {
    ...mauBase,
    sections: (mauBase.sections ?? []).map(section =>
      section.kind === 'supply-fan' || section.kind === 'oa-damper' ? { ...section, flowM3s: 1600 * CFM } : section,
    ),
  };
  const mauDiffA = rated(place('diff-sq-24', plan.kitchen, 1.6, 13.4, makeup.id, `${EXAMPLE} Make-up air diffuser ahead of the line.`), 800);
  const mauDiffB = rated(place('diff-sq-24', plan.kitchen, 6.0, 13.4, makeup.id, `${EXAMPLE} Make-up air diffuser ahead of the line.`), 800);
  const dishFan = rated(
    place('fan-inline-8', plan.dish, 12.2, 14.5, dishSys.id, `${EXAMPLE} Inline fan. Inlet toward the dish grille; outlet to the roof hood.`, 180),
    400,
  );
  const dishGrille = rated(place('grille-exh-12', plan.dish, 15.2, 15.2, dishSys.id, `${EXAMPLE} Exhaust grille over the dish machine.`), 400);
  const dishRelief = place('hood-relief-roof', plan.dish, 11.2, 15.6, dishSys.id, `${EXAMPLE} Roof discharge.`);
  const bathA = place('bath-fan-150', plan.restroomA, 13.1, 6.5, restroomSys.id, `${EXAMPLE} Ceiling fan — grille is the inlet.`);
  const bathB = place('bath-fan-150', plan.restroomB, 15.3, 6.5, restroomSys.id, `${EXAMPLE} Ceiling fan — grille is the inlet.`);
  const bathReliefA = place('hood-relief-roof', plan.restroomA, 13.1, 7.45, restroomSys.id, `${EXAMPLE} Roof discharge for restroom A.`);
  const bathReliefB = place('hood-relief-roof', plan.restroomB, 15.3, 7.45, restroomSys.id, `${EXAMPLE} Roof discharge for restroom B.`);
  const ervBase = place('erv-20', plan.office, 19.0, 7.0, ervSys.id, `${EXAMPLE} Rooftop ERV. Outdoor-air and exhaust hoods are on the casing.`, 180);
  const erv: PlacedEquipment = {
    ...ervBase,
    sections: (ervBase.sections ?? []).map(section =>
      section.kind === 'oa-damper' || section.kind === 'exhaust-damper' ? { ...section, ducted: false } : section,
    ),
  };
  const ervDiff = rated(place('diff-sq-24', plan.office, 17.2, 5.4, ervSys.id, `${EXAMPLE} Office supply diffuser.`), 800);
  const ervGrille = rated(place('grille-ret-24', plan.office, 17.2, 8.6, ervSys.id, `${EXAMPLE} Office return grille.`), 800);
  const project = base(
    'Full-service restaurant',
    'full-service',
    { kind: 'template', templateId: 'full-service', label: 'Full-service restaurant template' },
    `${TEMPLATE_DETAILS} Equipment, loads, and ducts are planning placements, not a design.`,
    plan.rooms,
    [exhaust, makeup, restroomSys, dishSys, ervSys],
    [hood, fan, mau, mauDiffA, mauDiffB, dishFan, dishGrille, dishRelief, bathA, bathB, bathReliefA, bathReliefB, erv, ervDiff, ervGrille],
  );

  // Kitchen exhaust: hood collar → grease duct → upblast fan inlet.
  const hoodPort = portPoint(hood, 'exhaust');
  const fanIn = portPoint(fan, 'in');
  let next = connect(project, 'captiveaire-dw', exhaust.id, 'exhaust', 16, [hoodPort, { x: hoodPort.x, y: fanIn.y }, fanIn]);

  // Make-up air: MAU supply → trunk → tee → two diffusers.
  const tee = junction(next, makeup.id, 'supply', 6.0, 11.2);
  next = tee.project;
  next = connect(next, 'esm-sw-round', makeup.id, 'supply', 16, [portPoint(mau, 'supply'), tee.point]);
  next = connect(next, 'esm-sw-round', makeup.id, 'supply', 12, [tee.point, portPoint(mauDiffB, 'neck')]);
  next = connect(next, 'esm-sw-round', makeup.id, 'supply', 12, [tee.point, { x: 1.6, y: 11.2 }, portPoint(mauDiffA, 'neck')]);

  // Dining comfort: rooftop unit with a ducted supply trunk and return main.
  const beforeSystems = new Set(next.systems.map(item => item.id));
  next = applySystemPackage(next, 'rtu-ducted', { xM: 4.6, yM: 4 });
  const comfort = next.systems.find(item => !beforeSystems.has(item.id));
  if (!comfort) throw new Error('Dining comfort package failed to create a system');
  next = {
    ...next,
    systems: next.systems.map(item => (item.id === comfort.id ? { ...item, name: 'Dining comfort' } : item)),
    equipment: next.equipment.map(item => (item.systemId === comfort.id && !item.notes ? { ...item, notes: EXAMPLE } : item)),
  };

  // Dish exhaust: grille → inline fan → roof relief hood.
  next = connect(next, 'esm-sw-round', dishSys.id, 'exhaust', 10, [portPoint(dishGrille, 'collar'), { x: 15.2, y: 14.5 }, portPoint(dishFan, 'in')]);
  const dishOut = portPoint(dishFan, 'out');
  next = connect(next, 'esm-sw-round', dishSys.id, 'exhaust', 10, [dishOut, { x: dishOut.x, y: 15.6 }, portPoint(dishRelief, 'throat')]);

  // Restroom exhaust: each fan → roof relief hood.
  next = connect(next, 'esm-sw-round', restroomSys.id, 'exhaust', 6, [portPoint(bathA, 'exhaust'), portPoint(bathReliefA, 'throat')]);
  next = connect(next, 'esm-sw-round', restroomSys.id, 'exhaust', 6, [portPoint(bathB, 'exhaust'), portPoint(bathReliefB, 'throat')]);

  // Office ERV: supply to the diffuser, return from the grille.
  const ervSa = portPoint(erv, 'sa');
  const ervRa = portPoint(erv, 'ra');
  next = connect(next, 'esm-sw-round', ervSys.id, 'supply', 10, [ervSa, { x: 17.2, y: ervSa.y }, portPoint(ervDiff, 'neck')]);
  next = connect(next, 'esm-sw-round', ervSys.id, 'return', 10, [portPoint(ervGrille, 'collar'), { x: 17.2, y: ervRa.y }, ervRa]);

  return {
    ...next,
    location: "Chicago O'Hare, IL (planning climate)",
    details: `${TEMPLATE_DETAILS} Equipment, loads, and ducts are planning placements, not a design. Exterior conditions use Chicago O'Hare ASHRAE 2009 design-day values; confirm the project site before design use. Every duct ends at a unit, a fan, or a terminal, and branch airflows add up to the unit airflow.`,
    site: fullServiceSite(),
    loads: [
      load('people-restaurant', plan.dining, 4, 3.2, 36),
      load('people-restaurant', plan.bar, 14.2, 2.2, 8),
      load('people-standing', plan.kitchen, 1.6, 12.4, 4),
      load('people-standing', plan.prep, 11.5, 11.6, 2),
      load('people-standing', plan.dish, 15.6, 13.8, 2),
      load('people-office', plan.office, 17.6, 6.2, 2),
      load('lpd-dining-family', plan.dining, 8.2, 2),
      load('lpd-food-prep', plan.kitchen, 1.8, 14.2),
      load('lpd-restroom', plan.restroomA, 13.1, 7.2),
      load('cook-g-range-6', plan.kitchen, 2.7, 15.15),
      load('cook-g-fryer-open', plan.kitchen, 3.55, 15.15),
      load('cook-g-griddle-flat', plan.kitchen, 4.45, 15.15),
      load('fridge-reach-in', plan.kitchen, 1.15, 11.1),
      load('fridge-prep', plan.prep, 15.2, 10.6),
      load('ware-sink-3', plan.dish, 14.2, 15.5),
      load('ware-door-high', plan.dish, 11.3, 14.3),
      load('plug-pos', plan.dining, 10.4, 6.2),
      load('plug-desktop', plan.office, 17.2, 5.2),
    ],
  };
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
    bar,
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
      place('fan-upblast-30', plan.kitchen, 6.5, 14.5, exhaust.id, `${mark} Shown on the kitchen roof.`),
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
    id: 'full-service',
    name: 'Full-service restaurant',
    description:
      'Dining, bar, kitchen, prep, dish, restrooms, storage, office, and corridor, with climate, loads, and complete air systems: ducted RTU, hood exhaust with make-up air, restroom and dish exhaust, and an office ERV.',
    create: createFullServiceProject,
  },
];
