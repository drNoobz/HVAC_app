import { blankSite } from './climate';
import { builtinAssembly, cloneLayers } from './constructionLibrary';
import { getProduct } from './catalog';
import { defaultAssemblyId } from './envelopeDefaults';
import { defaultSections } from './airUnits';
import { createId, nowIso } from './ids';
import { getLoadProduct } from './loadCatalog';
import { placementZ } from './projectOps';
import { applySystemPackage, GENERAL_EXHAUST, KITCHEN_HOOD_MAU, OFFICE_ERV, RESTROOM_EXHAUST, RTU_DUCTED, type PackageDuct, type PackageRef, type PackageSection, type SystemPackage } from './systemPackages';
import type { HvacSystem, LoadItem, Opening, PlacedEquipment, Project, Room, SiteClimate, SurfaceAssignment, SystemKind } from './types';
import { interfaceTargets, isOutsideInterfaceKey, repeatedWalls, separateSharedWalls } from './walls';

const PLANNING_NOTE = 'Planning default from the construction library. The stack is copied onto this surface. Confirm the climate zone and the tested assembly before design use.';
const KITCHEN_USES = new Set(['Kitchen', 'Hot line', 'Prep', 'Dish']);
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
  const floorId = defaultAssemblyId(input.use, 'floor');
  const wallId = KITCHEN_USES.has(input.use) || DINING_USES.has(input.use) || input.use === 'Walk-in' ? defaultAssemblyId(input.use, 'wall') : defaultAssemblyId(input.use, 'shared');
  const ceilingId = defaultAssemblyId(input.use, 'ceiling');
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

function assignInterfaces(project: Project): Project {
  const interfaceWalls: NonNullable<Project['interfaceWalls']> = { ...project.interfaceWalls };
  for (const target of interfaceTargets(project.rooms)) {
    if (interfaceWalls[target.key]?.constructionId) continue;
    const host = project.rooms.find(room => room.id === target.sides[0]?.roomId);
    const other = project.rooms.find(room => room.id === target.sides[1]?.roomId);
    const outside = isOutsideInterfaceKey(target.key);
    const assemblyId = outside
      ? defaultAssemblyId(host?.use ?? '', 'wall')
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

const roundDuct = (service: PackageDuct['service'], widthIn: number, from: PackageRef, to: PackageRef, via?: { x: number; y: number }[]): PackageDuct => ({
  catalogId: 'esm-sw-round',
  service,
  shape: 'round',
  widthIn,
  from,
  to,
  via,
});
const memberPort = (member: string, portId: string): PackageRef => ({ member, portId });
const junction = (key: string): PackageRef => ({ node: key });

const CFM = 0.0004719474432;

/**
 * Code basis: the requirements in this template are derived from these, before any equipment is placed
 * (docs/agents/regulations-first-templates.md). Generic model codes, unamended; a real project uses the editions
 * and amendments its jurisdiction adopted.
 */
const CODE_BASIS =
  'Code basis (planning, generic and unamended): IMC 2021 §403 and ASHRAE 62.1-2022 for ventilation and exhaust; IMC 2021 §506–508, NFPA 96-2021, and the UL 710 hood listing for kitchen exhaust and make-up air; IBC 2021 Table 1004.5 for occupant load; IECC 2021 §C403 for economizer and demand-controlled ventilation. A Chicago project follows the Chicago Construction Codes, the Chicago energy code, and the Illinois Food Code: confirm editions with the city.';

/**
 * Design occupancy, which also sets the ventilation outdoor air. Full-service dining at about 15 ft² per seat
 * (the IBC occupant load for unconcentrated tables): 1,033 ft² → 70. Bar: 237 ft² → 16 seats.
 */
const DINING_SEATS = 70;
const BAR_SEATS = 16;

/** RTU minimum outdoor air from the ASHRAE 62.1 multiple-zone check in docs/agents/restaurant-template-ventilation-review.md. */
const RTU_MIN_OA_CFM = 1200;

const rtuSections = (): PackageSection[] =>
  (getProduct('rtu-12')?.unit?.sections ?? []).map(section =>
    section.kind === 'oa-damper'
      ? {
          ...section,
          flowM3s: RTU_MIN_OA_CFM * CFM,
          note: `Economizer outdoor-air hood. Minimum outdoor air ${RTU_MIN_OA_CFM.toLocaleString('en-US')} CFM for ${DINING_SEATS} dining and ${BAR_SEATS} bar seats (ASHRAE 62.1, planning check). Reset it when the seat count changes.`,
        }
      : section,
  );

/**
 * The catalogue rooftop package stretched to serve the dining room, the bar, the corridor, and the storage room
 * from one unit. Supply 3,750 CFM: dining 6 × 500, bar 2 × 275, corridor 120, storage 80. Return 2,550 CFM
 * through the dining grilles (supply less 1,200 CFM minimum outdoor air): the bar and storage return through
 * their doorways, and corridor air leaves through the exhausted restrooms and the kitchen.
 */
const DINING_BAR_RTU: SystemPackage = {
  ...RTU_DUCTED,
  id: 'rtu-ducted-dining-bar',
  name: 'Rooftop unit, dining, bar, corridor and storage',
  description: '12.5 ton RTU with economizer. Supply trunk → dining (6 diffusers), corridor (1 diffuser), through the wall to the bar (2 diffusers) and on to storage (1 diffuser). Return main → 3 dining grilles.',
  systems: [
    {
      ...RTU_DUCTED.systems[0],
      notes: `One rooftop for the dining room, bar, corridor, and storage: same hours and similar loads. Supply 3,750 CFM = dining 3,000 + bar 550 + corridor 120 + storage 80. Minimum outdoor air ${RTU_MIN_OA_CFM.toLocaleString('en-US')} CFM ventilates all four for ${DINING_SEATS} dining and ${BAR_SEATS} bar seats (IMC §403 / ASHRAE 62.1); return 2,550 CFM through the dining grilles. The bar and storage return through their doorways; the corridor air is drawn on by the restroom exhaust and the kitchen. The dining room is over 500 ft² at more than 25 people per 1,000 ft² on an economizer unit, so demand-controlled ventilation applies (IECC §C403.7.1): CO2-2 resets the outdoor air down from the minimum when the room is not full. Best-guess cooling (no solver yet): people 86 × 615 Btu/h ≈ 53,000; outdoor air 4.5 × 1,200 CFM × 9.9 Btu/lb ≈ 53,000 at the Chicago design day; lights ≈ 5,500; envelope and sun ≈ 20,000; about 132,000 Btu/h, 11 tons, inside the unit's 12.5. Terminal airflows are planning values.`,
    },
  ],
  members: [
    ...RTU_DUCTED.members
      .filter(member => member.key === 'rtu')
      .map(member => (member.key === 'rtu' ? { ...member, sections: rtuSections() } : member)),
    { key: 'r1a', catalogId: 'grille-ret-24', planOffset: { xM: -2.3, yM: 2.0 }, designCfm: 850 },
    { key: 'r1b', catalogId: 'grille-ret-24', planOffset: { xM: -2.3, yM: -2.0 }, designCfm: 850 },
    { key: 'r2', catalogId: 'grille-ret-24', planOffset: { xM: -3.8, yM: 0 }, designCfm: 850 },
    { key: 'd1a', catalogId: 'diff-sq-24', planOffset: { xM: 2.3, yM: 2.0 }, designCfm: 500 },
    { key: 'd1b', catalogId: 'diff-sq-24', planOffset: { xM: 2.3, yM: -2.0 }, designCfm: 500 },
    { key: 'd2a', catalogId: 'diff-sq-24', planOffset: { xM: 4.5, yM: 2.0 }, designCfm: 500 },
    { key: 'd2b', catalogId: 'diff-sq-24', planOffset: { xM: 4.5, yM: -2.0 }, designCfm: 500 },
    { key: 'd3a', catalogId: 'diff-sq-24', planOffset: { xM: 6.7, yM: 2.0 }, designCfm: 500 },
    { key: 'd3b', catalogId: 'diff-sq-24', planOffset: { xM: 6.7, yM: -2.0 }, designCfm: 500 },
    { key: 'dc', catalogId: 'diff-sq-24', planOffset: { xM: 3.4, yM: 4.9 }, designCfm: 120, notes: 'Corridor supply. Ventilates the corridor; the air moves on to the exhausted restrooms and the kitchen.' },
    { key: 'd4a', catalogId: 'diff-sq-24', planOffset: { xM: 8.6, yM: -1.6 }, designCfm: 275, notes: 'Bar supply.' },
    { key: 'd4b', catalogId: 'diff-sq-24', planOffset: { xM: 10.6, yM: -1.6 }, designCfm: 275, notes: 'Bar supply.' },
    { key: 'dst', catalogId: 'diff-sq-24', planOffset: { xM: 13.4, yM: -1.9 }, designCfm: 80, notes: 'Storage supply: 0.12 CFM/ft² of outdoor air (ASHRAE 62.1) arrives in this air. It returns through the door to the bar.' },
  ],
  nodes: [
    { key: 's1', service: 'supply', x: 2.3, y: 0 },
    { key: 'sc', service: 'supply', x: 3.4, y: 0 },
    { key: 's2', service: 'supply', x: 4.5, y: 0 },
    { key: 's3', service: 'supply', x: 6.7, y: 0 },
    { key: 's4', service: 'supply', x: 8.6, y: 0 },
    { key: 's5', service: 'supply', x: 10.6, y: 0 },
    { key: 'r1', service: 'return', x: -2.3, y: 0 },
  ],
  ducts: [
    // Trunk steps down as each branch leaves: 3,750 → 2,750 → 2,630 → 1,630 → 630 → 355 CFM.
    roundDuct('supply', 22, memberPort('rtu', 'supply'), junction('s1')),
    roundDuct('supply', 20, junction('s1'), junction('sc')),
    roundDuct('supply', 20, junction('sc'), junction('s2')),
    roundDuct('supply', 16, junction('s2'), junction('s3')),
    roundDuct('supply', 10, junction('s3'), junction('s4')),
    roundDuct('supply', 8, junction('s4'), junction('s5')),
    roundDuct('supply', 8, junction('s5'), memberPort('d4b', 'neck')),
    roundDuct('supply', 6, junction('s5'), memberPort('dst', 'neck'), [{ x: 13.4, y: 0 }]),
    roundDuct('supply', 10, junction('s1'), memberPort('d1a', 'neck')),
    roundDuct('supply', 10, junction('s1'), memberPort('d1b', 'neck')),
    roundDuct('supply', 6, junction('sc'), memberPort('dc', 'neck')),
    roundDuct('supply', 10, junction('s2'), memberPort('d2a', 'neck')),
    roundDuct('supply', 10, junction('s2'), memberPort('d2b', 'neck')),
    roundDuct('supply', 10, junction('s3'), memberPort('d3a', 'neck')),
    roundDuct('supply', 10, junction('s3'), memberPort('d3b', 'neck')),
    roundDuct('supply', 8, junction('s4'), memberPort('d4a', 'neck')),
    ...RTU_DUCTED.ducts.filter(duct => duct.service === 'return'),
  ],
  points: [...(RTU_DUCTED.points ?? []), { tag: 'CO2-2', sensor: 'co2', member: 'rtu', room: true }],
};

/**
 * Hood exhaust with make-up air for the cooking line. The range, fryer, and griddle run 8.7 ft, and a canopy must
 * overhang them 6 in at each end, so the line takes a 10 ft hood at 2,000 CFM. The MAU supplies 85% of that
 * (1,700 CFM): 2 × 775 ahead of the line and 150 to prep. The rest is drawn from the dining room, so the
 * kitchen stays negative to it.
 */
const KITCHEN_LINE: SystemPackage = {
  ...KITCHEN_HOOD_MAU,
  id: 'kitchen-hood-mau-10',
  description: '10 ft Type I wall canopy (2,000 CFM) → 16 in listed grease duct → roof upblast fan beside the hood. Direct-fired MAU at 1,700 CFM: two diffusers ahead of the line and one in prep.',
  systems: KITCHEN_HOOD_MAU.systems.map(system =>
    system.key === 'exhaust'
      ? { ...system, notes: 'Type I hood over the grease-producing line (IMC §507, NFPA 96), 10 ft, covering the range, fryer, and griddle with 6 in overhang at each end. 2,000 CFM (200 CFM/ft at the 600 °F UL 710 listing) → listed grease duct at about 1,430 fpm (500 fpm minimum) → roof upblast fan selected at the hood airflow. The fan discharges to outdoors on its own. Fire suppression per the hood listing (UL 300).' }
      : { ...system, notes: 'Direct-fired MAU with its intake hood on the unit, interlocked to run with the hood fan (IMC §508). 1,700 CFM, 85% of the hood exhaust: two diffusers ahead of the cooking line (775 each) and one in prep (150), which also ventilates prep. The other 15% transfers from the dining room, so make-up from all sources about equals the exhaust and the kitchen stays negative to the dining room. Best-guess burner (no solver yet): 1.08 × 1,700 CFM × (65 − (−4) °F) ≈ 127,000 Btu/h, so about 130 MBH output.' },
  ),
  members: KITCHEN_HOOD_MAU.members
    .map(member => {
      if (member.key === 'hood') return { ...member, catalogId: 'hood-wall-10', notes: 'Wall canopy on the back wall, 10 ft: 6 in past the range and the griddle at each end.' };
      if (member.key === 'fan') return { ...member, designCfm: 2000 };
      if (member.key === 'mau')
        return {
          ...member,
          sections: (member.sections ?? []).map(section => {
            if (section.kind === 'heating-coil') return { ...section, capacityW: 130000 * 0.29307107, note: 'Direct gas-fired burner in the airstream. About 130 MBH output: best guess for 1,700 CFM from −4 °F to 65 °F.' };
            return section.flowM3s != null ? { ...section, flowM3s: 1700 * CFM } : section;
          }),
        };
      if (member.key === 'diffA' || member.key === 'diffB') return { ...member, designCfm: 775 };
      return member;
    })
    .concat([{ key: 'diffP', catalogId: 'diff-sq-24', planOffset: { xM: 7.4, yM: -3.19 }, system: 'makeup', designCfm: 150, notes: 'Prep supply. Ventilates prep with outdoor air; it moves on to the dish exhaust.' }]),
  nodes: [...KITCHEN_HOOD_MAU.nodes, { key: 'tp', service: 'supply', x: 7.4, y: -4.19, system: 'makeup' }],
  ducts: [
    ...KITCHEN_HOOD_MAU.ducts.filter(duct => duct.service === 'exhaust'),
    { ...roundDuct('supply', 16, memberPort('mau', 'supply'), junction('tp')), system: 'makeup' },
    { ...roundDuct('supply', 16, junction('tp'), junction('tee')), system: 'makeup' },
    { ...roundDuct('supply', 8, junction('tp'), memberPort('diffP', 'neck')), system: 'makeup' },
    ...KITCHEN_HOOD_MAU.ducts.filter(duct => duct.service === 'supply' && 'node' in duct.from && duct.from.node === 'tee'),
  ],
};

/**
 * Restroom exhaust with its make-up path: each restroom door gets a transfer grille sized for the fan, so corridor
 * air can reach the fan with the door closed.
 */
const RESTROOMS: SystemPackage = {
  ...RESTROOM_EXHAUST,
  systems: RESTROOM_EXHAUST.systems.map(system => ({
    ...system,
    notes: `${system.notes} Make-up air comes from the corridor through a transfer grille in each door (about 0.7 ft² free area for 150 CFM at about 210 fpm). A plain undercut passes only about 30–50 CFM quietly.`,
  })),
  members: [
    // Roof hoods beside the fans rather than toward the doors, so the doors stay clear for the transfer grilles.
    ...RESTROOM_EXHAUST.members.map(member =>
      member.key === 'hoodA' ? { ...member, planOffset: { xM: -0.7, yM: 0 } } : member.key === 'hoodB' ? { ...member, planOffset: { xM: 2.9, yM: 0 } } : member,
    ),
    { key: 'tgA', catalogId: 'grille-transfer-door', planOffset: { xM: -0.1, yM: 1.4 }, yawDeg: 180, designCfm: 150, notes: 'Transfer grille in the Restroom A door: corridor air in to the exhaust fan.' },
    { key: 'tgB', catalogId: 'grille-transfer-door', planOffset: { xM: 2.1, yM: 1.4 }, yawDeg: 180, designCfm: 150, notes: 'Transfer grille in the Restroom B door: corridor air in to the exhaust fan.' },
  ],
};

/**
 * Dish exhaust. The high-temperature door-type dishwasher makes steam and heat, so it gets a Type II condensate hood
 * (IMC §507), not a ceiling grille: hood → inline fan → gravity relief hood on the roof.
 */
const DISH_EXHAUST: SystemPackage = {
  ...GENERAL_EXHAUST,
  id: 'dish-exhaust-type2',
  name: 'Dish exhaust, Type II hood',
  description: 'Type II condensate hood over the dishwasher (400 CFM) → 10 in duct → inline fan → gravity relief hood on the roof.',
  systems: GENERAL_EXHAUST.systems.map(system => ({
    ...system,
    notes: 'Type II condensate hood over the high-temperature door-type dishwasher (IMC §507) → inline fan → gravity relief hood on the roof. 400 CFM is a planning value: use the dishwasher and hood data. Dish air is not returned (class 2); it arrives from prep.',
  })),
  members: [
    { key: 'fan', catalogId: 'fan-inline-8', planOffset: { xM: 0, yM: 0 }, yawDeg: 0, designCfm: 400, notes: 'Inline fan. Inlet from the dishwasher hood; outlet to the roof hood.' },
    { key: 'hood2', catalogId: 'hood-type2-4', planOffset: { xM: -0.9, yM: -0.2 }, designCfm: 400, notes: 'Type II condensate hood over the door-type dishwasher.' },
    { key: 'hood', catalogId: 'hood-relief-roof', planOffset: { xM: 1.4, yM: 0.8 }, notes: 'Roof discharge.' },
  ],
  nodes: [],
  ducts: [
    roundDuct('exhaust', 10, memberPort('hood2', 'exhaust'), memberPort('fan', 'in'), [{ x: -0.9, y: 0 }]),
    roundDuct('exhaust', 10, memberPort('fan', 'out'), memberPort('hood', 'throat'), [{ x: 1.4, y: 0 }]),
  ],
};

/**
 * Office ventilation. The office needs about 22 CFM of outdoor air (2 people, 193 ft², IMC §403 / ASHRAE 62.1).
 * A 100 CFM-class ERV covers it with margin and runs on the office's own hours.
 */
const OFFICE_VENTILATION: SystemPackage = {
  ...OFFICE_ERV,
  id: 'erv-office-100',
  description: '100 CFM-class ERV with outdoor-air and exhaust hoods on the casing. 6 in supply to a ceiling diffuser and 6 in return from a grille.',
  systems: OFFICE_ERV.systems.map(system => ({
    ...system,
    notes: 'ERV at 100 CFM for the office: it needs about 22 CFM of outdoor air (2 people, 193 ft², IMC §403 / ASHRAE 62.1), and the smallest common ERVs run 50–150 CFM. Balanced supply and exhaust, so it does not shift the building balance. The office is under 500 ft², so demand-controlled ventilation is not required; CO2-1 still reports. Placeholder unit: select the ERV and its hoods or wall caps.',
  })),
  members: OFFICE_ERV.members.map(member => {
    if (member.key === 'erv')
      return {
        ...member,
        catalogId: 'erv-small-100',
        notes: 'Small ERV, 100 CFM class. Outdoor-air and exhaust hoods on the casing.',
        sections: (member.sections ?? []).map(section => (section.flowM3s != null ? { ...section, flowM3s: 100 * CFM } : section)),
      };
    if (member.key === 'diff' || member.key === 'grille') return { ...member, designCfm: 100 };
    return member;
  }),
  ducts: OFFICE_ERV.ducts.map(duct => ({ ...duct, widthIn: 6 })),
};

/** Office heating and cooling: a ductless wall unit with its own thermostat. The ERV keeps supplying outdoor air. */
const OFFICE_SPLIT: SystemPackage = {
  id: 'office-split',
  name: 'Ductless heat pump, one room',
  description: '1 ton wall-mounted heat pump with a room thermostat.',
  group: 'Air handling',
  systems: [
    {
      key: 'main',
      name: 'Office heat pump',
      kind: 'comfort',
      notes: 'Ductless wall unit heats and cools the office on its own thermostat, so it can run outside dining hours. It recirculates room air only; the office ERV supplies the outdoor air.',
    },
  ],
  members: [{ key: 'split', catalogId: 'split-12', planOffset: { xM: 0, yM: 0 }, yawDeg: 90, notes: 'High on the wall. Outdoor unit on the roof or at grade.' }],
  nodes: [],
  ducts: [],
  points: [{ tag: 'T-2', sensor: 'temperature', member: 'split', room: true }],
};

export function createFullServiceProject(): Project {
  const plan = fullServiceRooms();
  const project = base(
    'Full-service restaurant',
    'full-service',
    { kind: 'template', templateId: 'full-service', label: 'Full-service restaurant template' },
    `${TEMPLATE_DETAILS} Equipment, loads, and ducts are planning placements, not a design.`,
    plan.rooms,
    [],
    [],
  );

  // Each air system is a catalogue system template, dropped where it serves.
  let next = project;
  const drop = (packageId: string | SystemPackage, xM: number, yM: number, rename?: string) => {
    const before = new Set(next.systems.map(item => item.id));
    const placed = applySystemPackage(next, packageId, { xM, yM });
    if (placed === next) throw new Error(`System template ${typeof packageId === 'string' ? packageId : packageId.id} did not apply`);
    next = rename ? { ...placed, systems: placed.systems.map(item => (before.has(item.id) ? item : { ...item, name: rename })) } : placed;
  };
  drop(KITCHEN_LINE, 3.6, 15.39);
  drop(RESTROOMS, 13.1, 6.5);
  drop(DISH_EXHAUST, 12.2, 14.5);
  drop(OFFICE_VENTILATION, 19.0, 7.0);
  drop(DINING_BAR_RTU, 4.6, 4, 'Dining & bar comfort');
  drop(OFFICE_SPLIT, 16.62, 7.0);
  next = { ...next, equipment: next.equipment.map(item => ({ ...item, notes: item.notes ? `${EXAMPLE} ${item.notes}` : EXAMPLE })) };

  return {
    ...next,
    location: "Chicago O'Hare, IL (planning climate)",
    details: `${TEMPLATE_DETAILS} ${CODE_BASIS} Equipment, loads, and ducts are planning placements sized by best guess until the solver is connected, not a design. Exterior conditions use Chicago O'Hare ASHRAE 2009 design-day values; confirm the project site before design use. Every duct ends at a unit, a fan, or a terminal, and branch airflows add up to the unit airflow.`,
    site: fullServiceSite(),
    loads: [
      load('people-restaurant', plan.dining, 4, 3.2, DINING_SEATS),
      load('people-restaurant', plan.bar, 14.2, 2.2, BAR_SEATS),
      load('people-standing', plan.kitchen, 1.6, 12.4, 4),
      load('people-standing', plan.prep, 11.5, 11.6, 2),
      load('people-standing', plan.dish, 15.6, 13.8, 2),
      load('people-office', plan.office, 17.6, 6.2, 2),
      load('lpd-dining-family', plan.dining, 8.2, 2),
      load('lpd-food-prep', plan.kitchen, 1.8, 14.2),
      load('lpd-restroom', plan.restroomA, 13.1, 7.2),
      // Cooking line against the back wall (y = 16.0 m), so the 4 ft deep hood overhangs the fronts by more than 6 in.
      load('cook-g-range-6', plan.kitchen, 2.7, 15.55),
      load('cook-g-fryer-open', plan.kitchen, 3.55, 15.55),
      load('cook-g-griddle-flat', plan.kitchen, 4.45, 15.55),
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
      'Dining, bar, kitchen, prep, dish, restrooms, storage, office, and corridor, with climate, loads, and complete air systems: a ducted RTU for the dining room, bar, corridor, and storage, a 10 ft hood with make-up air to the kitchen and prep, restroom exhaust, a Type II hood over the dishwasher, and an office ERV with a ductless heat pump.',
    create: createFullServiceProject,
  },
];
