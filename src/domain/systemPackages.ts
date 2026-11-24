import { getProduct } from './catalog';
import { placedPorts, unitSections } from './airUnits';
import { getDuctProduct } from './ductCatalog';
import { ductViewOf, portWorld } from './ducts';
import { createId } from './ids';
import { addDuct, buildPlacement, roomAtPoint } from './projectOps';
import { loadUserPackages } from './systemTemplates';
import type { ControlPoint, DuctNode, DuctService, DuctShape, LoopFluid, PlacedEquipment, PlantLoop, Project, SensorKind, StreamDesign, SystemKind, UnitSection, ValveKind } from './types';

/** One system the template creates. Members, junctions, and ducts name it by key; the first is the default. */
export interface PackageSystem {
  key: string;
  name: string;
  kind: SystemKind;
  notes: string;
}

export interface PackageMember {
  key: string;
  catalogId: string;
  /** Offset from the plan drop point, meters. */
  planOffset: { xM: number; yM: number };
  /** Package system key. Missing uses the first system; null leaves the placement out of every system (plant). */
  system?: string | null;
  yawDeg?: number;
  notes?: string;
  /** Terminal, hood, or fan design airflow, CFM. */
  designCfm?: number;
  /** Replaces the catalog default sections of a unit. Coils name a package loop by key. */
  sections?: PackageSection[];
}

export type PackageSection = Omit<UnitSection, 'id' | 'loopId' | 'valves'> & {
  loopKey?: string;
  valves?: { kind: ValveKind; tag: string; note?: string }[];
};

/** Plant loop created with the package. Temperatures °F. */
export interface PackageLoop {
  key: string;
  name: string;
  fluid: LoopFluid;
  glycolFraction?: number;
  supplyF: number | null;
  returnF: number | null;
  /** Member that feeds the loop: a boiler, chiller, or rack. */
  plantMember?: string;
  notes?: string;
}

/** Sensor created with the package: after a member section (by index), or in the room under the member. */
export interface PackagePoint {
  tag: string;
  sensor: SensorKind;
  member: string;
  section?: number;
  room?: boolean;
}

/** Junction offset from the drop point, meters. */
export interface PackageNode {
  key: string;
  service: DuctService;
  x: number;
  y: number;
  system?: string;
}

export type PackageRef = { member: string; portId: string } | { node: string } | { x: number; y: number };

export interface PackageDuct {
  catalogId: string;
  service: DuctService;
  shape: DuctShape;
  /** Round diameter or rectangular width, inches. */
  widthIn: number;
  /** Rectangular height, inches. */
  heightIn?: number;
  from: PackageRef;
  to: PackageRef;
  /** Bends between the ends, offsets from the drop point, meters. */
  via?: { x: number; y: number }[];
  system?: string;
  streamDesign?: StreamDesign;
}

export type PackageGroup = 'Air handling' | 'Kitchen' | 'Exhaust' | 'Ventilation' | 'My templates';

export const PACKAGE_GROUPS: PackageGroup[] = ['Air handling', 'Kitchen', 'Ventilation', 'Exhaust', 'My templates'];

export interface SystemPackage {
  id: string;
  name: string;
  description: string;
  group: PackageGroup;
  systems: PackageSystem[];
  members: PackageMember[];
  nodes: PackageNode[];
  ducts: PackageDuct[];
  loops?: PackageLoop[];
  points?: PackagePoint[];
  /** User templates saved from a project. */
  user?: boolean;
  savedAt?: string;
}

const INCH = 0.0254;
const CFM = 0.0004719474432;

function round(service: DuctService, widthIn: number, from: PackageRef, to: PackageRef, via?: { x: number; y: number }[]): PackageDuct {
  return { catalogId: 'esm-sw-round', service, shape: 'round', widthIn, from, to, via };
}

function rect(service: DuctService, widthIn: number, heightIn: number, from: PackageRef, to: PackageRef, via?: { x: number; y: number }[]): PackageDuct {
  return { catalogId: 'smacna-rect-galv', service, shape: 'rect', widthIn, heightIn, from, to, via };
}

/** °F to °C. */
const f = (degF: number) => (degF - 32) / 1.8;

const port = (member: string, portId: string): PackageRef => ({ member, portId });
const node = (key: string): PackageRef => ({ node: key });

/**
 * Packaged rooftop over the space it serves. 3,750 CFM supply trunk with three tees feeding six diffusers,
 * and a 3,000 CFM return main to three grilles. Trunk sizes step down at each tee to hold about 1,200–1,450 fpm.
 */
export const RTU_DUCTED: SystemPackage = {
  id: 'rtu-ducted',
  name: 'Rooftop unit, ducted supply and return',
  description: '12.5 ton RTU with economizer. Supply trunk → 3 tees → 6 ceiling diffusers; return main → 3 grilles. Drop it over the space it serves.',
  group: 'Air handling',
  systems: [
    {
      key: 'main',
      name: 'Rooftop comfort',
      kind: 'comfort',
      notes: 'Economizer hood and barometric relief are on the unit. Supply is 3,750 CFM; return is supply less minimum outdoor air. Terminal airflows are planning values.',
    },
  ],
  members: [
    { key: 'rtu', catalogId: 'rtu-12', planOffset: { xM: 0, yM: 0 } },
    { key: 'd1a', catalogId: 'diff-sq-24', planOffset: { xM: 2.3, yM: 2.0 }, designCfm: 625 },
    { key: 'd1b', catalogId: 'diff-sq-24', planOffset: { xM: 2.3, yM: -2.0 }, designCfm: 625 },
    { key: 'd2a', catalogId: 'diff-sq-24', planOffset: { xM: 4.5, yM: 2.0 }, designCfm: 625 },
    { key: 'd2b', catalogId: 'diff-sq-24', planOffset: { xM: 4.5, yM: -2.0 }, designCfm: 625 },
    { key: 'd3a', catalogId: 'diff-sq-24', planOffset: { xM: 6.7, yM: 2.0 }, designCfm: 625 },
    { key: 'd3b', catalogId: 'diff-sq-24', planOffset: { xM: 6.7, yM: -2.0 }, designCfm: 625 },
    { key: 'r1a', catalogId: 'grille-ret-24', planOffset: { xM: -2.3, yM: 2.0 }, designCfm: 1000 },
    { key: 'r1b', catalogId: 'grille-ret-24', planOffset: { xM: -2.3, yM: -2.0 }, designCfm: 1000 },
    { key: 'r2', catalogId: 'grille-ret-24', planOffset: { xM: -3.8, yM: 0 }, designCfm: 1000 },
  ],
  points: [
    { tag: 'SAT', sensor: 'temperature', member: 'rtu', section: 7 },
    { tag: 'T-1', sensor: 'temperature', member: 'rtu', room: true },
  ],
  nodes: [
    { key: 's1', service: 'supply', x: 2.3, y: 0 },
    { key: 's2', service: 'supply', x: 4.5, y: 0 },
    { key: 's3', service: 'supply', x: 6.7, y: 0 },
    { key: 'r1', service: 'return', x: -2.3, y: 0 },
  ],
  ducts: [
    round('supply', 22, port('rtu', 'supply'), node('s1')),
    round('supply', 18, node('s1'), node('s2')),
    round('supply', 14, node('s2'), node('s3')),
    round('supply', 10, node('s1'), port('d1a', 'neck')),
    round('supply', 10, node('s1'), port('d1b', 'neck')),
    round('supply', 10, node('s2'), port('d2a', 'neck')),
    round('supply', 10, node('s2'), port('d2b', 'neck')),
    round('supply', 10, node('s3'), port('d3a', 'neck')),
    round('supply', 10, node('s3'), port('d3b', 'neck')),
    round('return', 20, port('rtu', 'return'), node('r1')),
    round('return', 14, node('r1'), port('r1a', 'collar')),
    round('return', 14, node('r1'), port('r1b', 'collar')),
    round('return', 14, node('r1'), port('r2', 'collar')),
  ],
};

/**
 * Indoor AHU from a process diagram: 5,000 CFM fresh air (NC), evacuation fan and NC exhaust damper,
 * 25,000 CFM return through an NO damper, 30,000 CFM supply fan, CO₂ DX cooling coil, 50% propylene glycol heating coil.
 * Distribution mains leave as open stubs to route to the zones.
 */
export const AHU_ECONOMIZER: SystemPackage = {
  id: 'ahu-economizer-co2-glycol',
  name: 'AHU, economizer with exhaust fan, CO₂ cooling, glycol heating',
  description: '30,000 CFM mixed-air AHU: OA louver → NC damper; return → NO damper; evacuation fan → NC damper → exhaust louver; CO₂ DX coil and glycol coil. Supply and return mains end as stubs to route.',
  group: 'Air handling',
  systems: [
    {
      key: 'main',
      name: 'AHU-1',
      kind: 'comfort',
      notes: 'Fresh air 5,000 CFM at 93 °F DB / 73 °F WB summer, -20 °F winter. Return 25,000 CFM at 50 °F / 60% RH. Cooling coil leaving 33.0 °F DB; heating coil leaving 53.7 °F DB in winter.',
    },
  ],
  members: [
    {
      key: 'ahu',
      catalogId: 'ahu-csaa-66',
      planOffset: { xM: 0, yM: 0 },
      sections: [
        {
          kind: 'oa-damper',
          position: 'NC',
          ducted: true,
          flowM3s: 5000 * CFM,
          states: { cooling: { dbC: f(93), wbC: f(73), rh: null }, heating: { dbC: f(-20), wbC: null, rh: null } },
        },
        { kind: 'relief-fan', flowM3s: null, note: 'Evacuation fan for economizer operation.' },
        { kind: 'exhaust-damper', position: 'NC', ducted: true, flowM3s: null },
        {
          kind: 'ra-damper',
          position: 'NO',
          ducted: true,
          states: { cooling: { dbC: f(50), wbC: null, rh: 0.6 }, heating: { dbC: f(50), wbC: null, rh: 0.6 } },
        },
        { kind: 'mixing-box' },
        { kind: 'filter' },
        { kind: 'supply-fan', flowM3s: 30000 * CFM },
        {
          kind: 'cooling-coil',
          medium: 'co2-dx',
          capacityW: null,
          loopKey: 'co2',
          valves: [
            { kind: 'solenoid', tag: 'V-1' },
            { kind: 'back-pressure', tag: 'V-2' },
          ],
          states: { cooling: { dbC: f(33), wbC: null, rh: null } },
        },
        {
          kind: 'heating-coil',
          medium: 'glycol',
          capacityW: null,
          loopKey: 'glycol',
          fluidFlowM3s: 68 * 0.0000630902,
          valves: [{ kind: 'three-way', tag: 'V-3' }],
          states: { heating: { dbC: f(53.7), wbC: null, rh: null } },
        },
      ],
    },
    { key: 'oaLouver', catalogId: 'louver-oa', planOffset: { xM: -7.5, yM: 1.0 }, yawDeg: 90, designCfm: 5000 },
    { key: 'eaLouver', catalogId: 'louver-ea', planOffset: { xM: -7.5, yM: -1.0 }, yawDeg: 90 },
  ],
  nodes: [],
  loops: [
    { key: 'co2', name: 'CO₂ medium-temperature suction', fluid: 'co2', supplyF: 30, returnF: null, notes: 'From the CO₂ rack. 30 °F saturated suction at the coil.' },
    { key: 'glycol', name: 'Hot propylene glycol', fluid: 'propylene-glycol', glycolFraction: 0.5, supplyF: 140, returnF: 101, notes: 'Heat-recovery glycol loop.' },
  ],
  points: [
    { tag: 'HAF', sensor: 'humidity', member: 'ahu', section: 0 },
    { tag: 'TAF', sensor: 'temperature', member: 'ahu', section: 0 },
    { tag: 'TR', sensor: 'temperature', member: 'ahu', section: 3 },
    { tag: 'HR', sensor: 'humidity', member: 'ahu', section: 3 },
    { tag: 'TM', sensor: 'temperature', member: 'ahu', section: 4 },
    { tag: 'HM', sensor: 'humidity', member: 'ahu', section: 4 },
    { tag: 'TA1', sensor: 'temperature', member: 'ahu', section: 8 },
    { tag: 'HA', sensor: 'humidity', member: 'ahu', section: 8 },
    { tag: 'TA2', sensor: 'temperature', member: 'ahu', section: 8 },
    { tag: 'T', sensor: 'temperature', member: 'ahu', room: true },
    { tag: '%RH', sensor: 'humidity', member: 'ahu', room: true },
  ],
  ducts: [
    rect('outdoor', 30, 24, port('oaLouver', 'collar'), port('ahu', 'oa')),
    rect('relief', 30, 24, port('ahu', 'ea'), port('eaLouver', 'collar'), [{ x: -6.2, y: 0 }, { x: -6.2, y: -1.0 }]),
    rect('return', 72, 30, { x: -5.6, y: -4.0 }, port('ahu', 'ra'), [{ x: -5.6, y: -1.005 }]),
    rect('supply', 72, 36, port('ahu', 'sa'), { x: 8.5, y: 0 }),
  ],
};

const GPM = 0.0000630902;

/** Type I hood → listed grease duct → roof upblast fan, with a direct-fired MAU set to the hood exhaust. Drop on the hood. */
export const KITCHEN_HOOD_MAU: SystemPackage = {
  id: 'kitchen-hood-mau',
  name: 'Kitchen hood exhaust with make-up air',
  description: '8 ft Type I wall canopy (1,600 CFM) → 16 in listed grease duct → roof upblast fan. Direct-fired MAU at the same airflow tees to two diffusers ahead of the line. Drop it on the hood position.',
  group: 'Kitchen',
  systems: [
    { key: 'exhaust', name: 'Kitchen exhaust', kind: 'kitchen-exhaust', notes: 'Type I hood (1,600 CFM) → listed grease duct → roof upblast fan selected at the hood airflow. The fan discharges to outdoors on its own.' },
    { key: 'makeup', name: 'Make-up air', kind: 'makeup-air', notes: 'Direct-fired MAU with its intake hood on the unit. Supply trunk tees to two diffusers ahead of the cooking line. Set to the hood exhaust so the kitchen is close to neutral.' },
  ],
  members: [
    { key: 'hood', catalogId: 'hood-wall-8', planOffset: { xM: 0, yM: 0 }, system: 'exhaust', notes: 'Wall canopy on the back wall.' },
    { key: 'fan', catalogId: 'fan-upblast-30', planOffset: { xM: 3.2, yM: 0 }, system: 'exhaust', designCfm: 1600, notes: 'Roof upblast fan beside the hood, selected at the hood airflow. A short grease duct, clear of the make-up air.' },
    {
      key: 'mau',
      catalogId: 'mau-40',
      planOffset: { xM: 9.6, yM: -4.19 },
      system: 'makeup',
      yawDeg: 180,
      notes: 'Rooftop MAU. Intake hood on the unit; supply faces the kitchen.',
      sections: [
        { kind: 'oa-damper', position: 'NC', ducted: false, flowM3s: 1600 * CFM, note: 'Intake hood with bird screen on the unit.' },
        { kind: 'filter' },
        { kind: 'supply-fan', flowM3s: 1600 * CFM },
        { kind: 'heating-coil', medium: 'gas', capacityW: 400000 * 0.29307107, note: 'Direct gas-fired burner in the airstream.' },
      ],
    },
    { key: 'diffA', catalogId: 'diff-sq-24', planOffset: { xM: -2.0, yM: -1.99 }, system: 'makeup', designCfm: 800, notes: 'Make-up air diffuser ahead of the line.' },
    { key: 'diffB', catalogId: 'diff-sq-24', planOffset: { xM: 2.4, yM: -1.99 }, system: 'makeup', designCfm: 800, notes: 'Make-up air diffuser ahead of the line.' },
  ],
  nodes: [{ key: 'tee', service: 'supply', x: 2.4, y: -4.19, system: 'makeup' }],
  ducts: [
    // Grease duct along the back wall to the roof fan: short, and it never crosses the make-up air supply.
    { catalogId: 'captiveaire-dw', service: 'exhaust', shape: 'round', widthIn: 16, from: port('hood', 'exhaust'), to: port('fan', 'in'), system: 'exhaust' },
    { ...round('supply', 16, port('mau', 'supply'), node('tee')), system: 'makeup' },
    { ...round('supply', 12, node('tee'), port('diffB', 'neck')), system: 'makeup' },
    { ...round('supply', 12, node('tee'), port('diffA', 'neck'), [{ x: -2.0, y: -4.19 }]), system: 'makeup' },
  ],
  points: [{ tag: 'DAT-1', sensor: 'temperature', member: 'mau', section: 3 }],
};

/** Two restroom ceiling fans, each ducted to a gravity relief hood on the roof. Drop on the first fan. */
export const RESTROOM_EXHAUST: SystemPackage = {
  id: 'restroom-exhaust-2',
  name: 'Restroom exhaust, two rooms',
  description: 'Two ceiling exhaust fans (150 CFM each) with 6 in ducts to gravity relief hoods on the roof. Drop it on the first restroom fan; the second sits 2.2 m to the right.',
  group: 'Exhaust',
  systems: [{ key: 'main', name: 'Restroom exhaust', kind: 'restroom-exhaust', notes: 'Ceiling fan in each restroom (the grille is the fan face) → duct → gravity relief hood on the roof.' }],
  members: [
    { key: 'fanA', catalogId: 'bath-fan-150', planOffset: { xM: 0, yM: 0 }, notes: 'Ceiling fan — grille is the inlet.' },
    { key: 'fanB', catalogId: 'bath-fan-150', planOffset: { xM: 2.2, yM: 0 }, notes: 'Ceiling fan — grille is the inlet.' },
    { key: 'hoodA', catalogId: 'hood-relief-roof', planOffset: { xM: 0, yM: 0.95 }, notes: 'Roof discharge.' },
    { key: 'hoodB', catalogId: 'hood-relief-roof', planOffset: { xM: 2.2, yM: 0.95 }, notes: 'Roof discharge.' },
  ],
  nodes: [],
  ducts: [
    round('exhaust', 6, port('fanA', 'exhaust'), port('hoodA', 'throat')),
    round('exhaust', 6, port('fanB', 'exhaust'), port('hoodB', 'throat')),
  ],
};

/** Exhaust grille → inline fan → roof relief hood, as for a dish area. Drop on the fan. */
export const GENERAL_EXHAUST: SystemPackage = {
  id: 'general-exhaust-inline',
  name: 'General exhaust, inline fan',
  description: '12 × 12 exhaust grille (400 CFM) → 10 in duct → inline mixed-flow fan → gravity relief hood on the roof. Suits dish areas, storage, and janitor rooms.',
  group: 'Exhaust',
  systems: [{ key: 'main', name: 'Dish exhaust', kind: 'ventilation', notes: 'Exhaust grille over the dish machine → inline fan → gravity relief hood on the roof.' }],
  members: [
    { key: 'fan', catalogId: 'fan-inline-8', planOffset: { xM: 0, yM: 0 }, yawDeg: 180, designCfm: 400, notes: 'Inline fan. Inlet toward the grille; outlet to the roof hood.' },
    { key: 'grille', catalogId: 'grille-exh-12', planOffset: { xM: 3.0, yM: 0.7 }, designCfm: 400, notes: 'Exhaust grille over the dish machine.' },
    { key: 'hood', catalogId: 'hood-relief-roof', planOffset: { xM: -1.0, yM: 1.1 }, notes: 'Roof discharge.' },
  ],
  nodes: [],
  ducts: [
    round('exhaust', 10, port('grille', 'collar'), port('fan', 'in'), [{ x: 3.0, y: 0 }]),
    round('exhaust', 10, port('fan', 'out'), port('hood', 'throat'), [{ x: -0.254, y: 1.1 }]),
  ],
};

/** Rooftop ERV with hoods on the casing, one supply diffuser and one return grille. Drop on the ERV. */
export const OFFICE_ERV: SystemPackage = {
  id: 'erv-small-room',
  name: 'Energy recovery ventilator, one room',
  description: '800 CFM rooftop ERV with outdoor-air and exhaust hoods on the casing. 10 in supply to a ceiling diffuser and 10 in return from a grille.',
  group: 'Ventilation',
  systems: [{ key: 'main', name: 'Office ERV', kind: 'ventilation', notes: 'Rooftop ERV with outdoor-air and exhaust hoods on the casing. Supply diffuser and return grille in the room.' }],
  members: [
    {
      key: 'erv',
      catalogId: 'erv-20',
      planOffset: { xM: 0, yM: 0 },
      yawDeg: 180,
      notes: 'Rooftop ERV. Outdoor-air and exhaust hoods are on the casing.',
      sections: [
        { kind: 'oa-damper', position: 'NC', ducted: false, flowM3s: 800 * CFM },
        { kind: 'ra-damper', position: 'NC', ducted: true, note: 'Return inlet to the exhaust side of the core.' },
        { kind: 'heat-recovery' },
        { kind: 'filter' },
        { kind: 'supply-fan', flowM3s: 800 * CFM },
        { kind: 'relief-fan', flowM3s: 800 * CFM },
        { kind: 'exhaust-damper', position: 'NC', ducted: false, flowM3s: 800 * CFM },
      ],
    },
    { key: 'diff', catalogId: 'diff-sq-24', planOffset: { xM: -1.8, yM: -1.6 }, designCfm: 800, notes: 'Supply diffuser.' },
    { key: 'grille', catalogId: 'grille-ret-24', planOffset: { xM: -1.8, yM: 1.6 }, designCfm: 800, notes: 'Return grille.' },
  ],
  nodes: [],
  ducts: [
    round('supply', 10, port('erv', 'sa'), port('diff', 'neck'), [{ x: -1.8, y: -0.21 }]),
    round('return', 10, port('grille', 'collar'), port('erv', 'ra'), [{ x: -1.8, y: 0.21 }]),
  ],
  points: [{ tag: 'CO2-1', sensor: 'co2', member: 'erv', room: true }],
};

/**
 * Mixed-air AHU on chilled and hot water from a boiler and chiller. 6,000 CFM, 1,200 CFM minimum outdoor air,
 * 2-way valves on both coils, discharge and mixed-air sensors, and a room thermostat.
 */
export const AHU_HYDRONIC: SystemPackage = {
  id: 'ahu-chw-hw',
  name: 'AHU on chilled and hot water, with boiler and chiller',
  description: '6,000 CFM mixed-air AHU: OA louver → NC damper, return → NO damper, filter, fan, chilled-water and hot-water coils with 2-way valves. Places a 100 ton chiller and a 1,500 MBH boiler with their loops. Supply and return mains end as stubs to route.',
  group: 'Air handling',
  systems: [
    { key: 'main', name: 'AHU-2', kind: 'comfort', notes: 'Chilled water 44 → 56 °F, hot water 180 → 150 °F. Coil leaving conditions are planning values to confirm with a coil selection.' },
  ],
  members: [
    {
      key: 'ahu',
      catalogId: 'ahu-csaa-12',
      planOffset: { xM: 0, yM: 0 },
      sections: [
        { kind: 'oa-damper', position: 'NC', ducted: true, flowM3s: 1200 * CFM },
        { kind: 'ra-damper', position: 'NO', ducted: true },
        { kind: 'mixing-box' },
        { kind: 'filter' },
        { kind: 'supply-fan', flowM3s: 6000 * CFM },
        {
          kind: 'cooling-coil',
          medium: 'chilled-water',
          capacityW: null,
          loopKey: 'chw',
          fluidFlowM3s: 36 * GPM,
          valves: [{ kind: 'two-way', tag: 'CV-1' }],
          states: { cooling: { dbC: f(55), wbC: f(54), rh: null } },
        },
        {
          kind: 'heating-coil',
          medium: 'hot-water',
          capacityW: null,
          loopKey: 'hw',
          fluidFlowM3s: 13 * GPM,
          valves: [{ kind: 'two-way', tag: 'HV-1' }],
          states: { heating: { dbC: f(85), wbC: null, rh: null } },
        },
      ],
    },
    { key: 'oaLouver', catalogId: 'louver-oa', planOffset: { xM: -4.3, yM: 0.5 }, yawDeg: 90, designCfm: 1200 },
    { key: 'chiller', catalogId: 'chiller-ascend-100', planOffset: { xM: 0, yM: 5 }, system: null },
    { key: 'boiler', catalogId: 'boiler-crest-1500', planOffset: { xM: 4, yM: 5 }, system: null },
  ],
  nodes: [],
  loops: [
    { key: 'chw', name: 'Chilled water', fluid: 'water', supplyF: 44, returnF: 56, plantMember: 'chiller' },
    { key: 'hw', name: 'Heating hot water', fluid: 'water', supplyF: 180, returnF: 150, plantMember: 'boiler' },
  ],
  points: [
    { tag: 'OAT', sensor: 'temperature', member: 'ahu', section: 0 },
    { tag: 'MAT', sensor: 'temperature', member: 'ahu', section: 2 },
    { tag: 'SP-2', sensor: 'static-pressure', member: 'ahu', section: 4 },
    { tag: 'DAT-2', sensor: 'temperature', member: 'ahu', section: 6 },
    { tag: 'T-2', sensor: 'temperature', member: 'ahu', room: true },
  ],
  ducts: [
    rect('outdoor', 24, 18, port('oaLouver', 'collar'), port('ahu', 'oa')),
    rect('return', 40, 20, { x: -3.6, y: -3.0 }, port('ahu', 'ra'), [{ x: -3.6, y: -0.5 }]),
    rect('supply', 36, 20, port('ahu', 'sa'), { x: 5.4, y: 0 }),
  ],
};

export const SYSTEM_PACKAGES: SystemPackage[] = [RTU_DUCTED, AHU_ECONOMIZER, AHU_HYDRONIC, KITCHEN_HOOD_MAU, OFFICE_ERV, RESTROOM_EXHAUST, GENERAL_EXHAUST];

const BY_ID = new Map(SYSTEM_PACKAGES.map(item => [item.id, item]));

/** Built-in templates, then the ones saved in this browser. */
export function allSystemPackages(): SystemPackage[] {
  return [...SYSTEM_PACKAGES, ...loadUserPackages()];
}

export function getSystemPackage(id: string): SystemPackage | undefined {
  return BY_ID.get(id) ?? loadUserPackages().find(item => item.id === id);
}

/** One-line contents: units, terminals, systems, and total supply. */
export function packageSummary(pack: SystemPackage): string {
  let units = 0;
  let terminals = 0;
  let fans = 0;
  let plant = 0;
  for (const member of pack.members) {
    const product = getProduct(member.catalogId);
    if (!product) continue;
    if (product.unit) units += 1;
    else if (product.terminal || product.category === 'kitchen-hood') terminals += 1;
    else if (product.category === 'plant') plant += 1;
    else if (product.category === 'exhaust-fan' || product.category === 'bathroom-exhaust') fans += 1;
  }
  const bits = [
    units ? `${units} unit${units === 1 ? '' : 's'}` : '',
    fans ? `${fans} fan${fans === 1 ? '' : 's'}` : '',
    terminals ? `${terminals} terminal${terminals === 1 ? '' : 's'}` : '',
    plant ? `${plant} plant` : '',
    `${pack.ducts.length} duct${pack.ducts.length === 1 ? '' : 's'}`,
    pack.points?.length ? `${pack.points.length} sensor${pack.points.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return bits.join(' · ');
}

function memberPortPoint(item: PlacedEquipment, portId: string): { x: number; y: number; equipmentId: string; portId: string } | null {
  const found = placedPorts(item).find(entry => entry.id === portId);
  if (!found) return null;
  const world = portWorld(item, found, 'plan');
  if (!world) return null;
  return { x: world.x, y: world.y, equipmentId: item.id, portId: found.id };
}

/** Drop a pre-wired template onto the plan: its systems, units and terminals, plant, loops, sensors, junctions, and sized ducts. */
export function applySystemPackage(project: Project, packageOrId: string | SystemPackage, drop: { xM: number; yM: number }): Project {
  const pack = typeof packageOrId === 'string' ? getSystemPackage(packageOrId) : packageOrId;
  if (!pack || pack.systems.length === 0) return project;
  const systemIds = new Map(pack.systems.map(system => [system.key, createId('sys')]));
  const defaultSystem = systemIds.get(pack.systems[0].key)!;
  const systemFor = (key: string | null | undefined) => (key === null ? null : key ? (systemIds.get(key) ?? defaultSystem) : defaultSystem);
  const fToC = (value: number | null) => (value == null ? null : (value - 32) / 1.8);
  const loopIds = new Map<string, string>();
  for (const entry of pack.loops ?? []) loopIds.set(entry.key, createId('loop'));
  const byKey = new Map<string, PlacedEquipment>();
  const equipment: PlacedEquipment[] = [];
  for (const member of pack.members) {
    const product = getProduct(member.catalogId);
    if (!product) continue;
    const plan = { xM: drop.xM + member.planOffset.xM, yM: drop.yM + member.planOffset.yM };
    const item = buildPlacement(product, roomAtPoint(project.rooms, plan.xM, plan.yM), plan, null);
    item.systemId = systemFor(member.system);
    item.yawDeg = member.yawDeg ?? 0;
    item.notes = member.notes ?? '';
    item.assumption = true;
    if (member.designCfm != null) item.designFlowM3s = member.designCfm * CFM;
    if (member.sections) {
      item.sections = member.sections.map(({ loopKey, valves, ...section }) => ({
        ...section,
        id: createId('sec'),
        ...(loopKey ? { loopId: loopIds.get(loopKey) ?? null } : {}),
        ...(valves ? { valves: valves.map(valve => ({ ...valve, id: createId('valve') })) } : {}),
      }));
    }
    byKey.set(member.key, item);
    equipment.push(item);
  }
  const loops: PlantLoop[] = (pack.loops ?? []).map(entry => ({
    id: loopIds.get(entry.key)!,
    name: entry.name,
    fluid: entry.fluid,
    glycolFraction: entry.glycolFraction ?? null,
    supplyC: fToC(entry.supplyF),
    returnC: fToC(entry.returnF),
    plantEquipmentId: entry.plantMember ? (byKey.get(entry.plantMember)?.id ?? null) : null,
    notes: entry.notes ?? '',
  }));
  const nodes = new Map<string, DuctNode>();
  for (const entry of pack.nodes) {
    nodes.set(entry.key, { id: createId('node'), systemId: systemFor(entry.system)!, service: entry.service, x: drop.xM + entry.x, y: drop.yM + entry.y });
  }
  const points: ControlPoint[] = [];
  for (const entry of pack.points ?? []) {
    const item = byKey.get(entry.member);
    if (!item) continue;
    if (entry.room) {
      const room = roomAtPoint(project.rooms, item.xM, item.yM);
      if (room) points.push({ id: createId('pt'), tag: entry.tag, sensor: entry.sensor, location: { kind: 'room', roomId: room.id, equipmentId: item.id } });
      continue;
    }
    const section = entry.section != null ? item.sections?.[entry.section] : undefined;
    if (section) points.push({ id: createId('pt'), tag: entry.tag, sensor: entry.sensor, location: { kind: 'station', equipmentId: item.id, sectionId: section.id } });
  }
  let next: Project = {
    ...project,
    systems: [...project.systems, ...pack.systems.map(system => ({ id: systemIds.get(system.key)!, name: system.name, kind: system.kind, notes: system.notes }))],
    equipment: [...project.equipment, ...equipment],
    ductNodes: [...(project.ductNodes ?? []), ...nodes.values()],
    plantLoops: [...(project.plantLoops ?? []), ...loops],
    controlPoints: [...(project.controlPoints ?? []), ...points],
  };
  const resolve = (ref: PackageRef): { x: number; y: number; equipmentId?: string; portId?: string; nodeId?: string } | null => {
    if ('node' in ref) {
      const found = nodes.get(ref.node);
      return found ? { x: found.x, y: found.y, nodeId: found.id } : null;
    }
    if ('member' in ref) {
      const item = byKey.get(ref.member);
      return item ? memberPortPoint(item, ref.portId) : null;
    }
    return { x: drop.xM + ref.x, y: drop.yM + ref.y };
  };
  for (const duct of pack.ducts) {
    const start = resolve(duct.from);
    const end = resolve(duct.to);
    if (!start || !end) continue;
    const via = (duct.via ?? []).map(point => ({ x: drop.xM + point.x, y: drop.yM + point.y }));
    const product = getDuctProduct(duct.catalogId);
    const size = product?.sizes?.find(entry => entry.id === String(Math.round(duct.widthIn)));
    next = addDuct(next, {
      catalogId: duct.catalogId,
      systemId: systemFor(duct.system)!,
      service: duct.service,
      shape: duct.shape,
      widthM: size?.widthM ?? duct.widthIn * INCH,
      heightM: duct.heightIn != null ? duct.heightIn * INCH : null,
      points: [start, ...via, end],
      view: 'plan',
      streamDesign: duct.streamDesign,
    });
  }
  return next;
}

const round3 = (value: number) => Number(value.toFixed(3));

/**
 * Capture a system as a reusable template: its placements (and the plant feeding its coils), junctions, plan ducts,
 * loops, and sensors, as offsets from the centre of its placements.
 */
export function packageFromSystem(project: Project, systemId: string, name: string): SystemPackage | null {
  const system = project.systems.find(entry => entry.id === systemId);
  if (!system) return null;
  const inSystem = project.equipment.filter(item => item.systemId === systemId);
  if (inSystem.length === 0) return null;
  const usedLoops = new Map<string, PlantLoop>();
  for (const item of inSystem) {
    for (const section of item.sections ?? []) {
      const loop = section.loopId ? (project.plantLoops ?? []).find(entry => entry.id === section.loopId) : undefined;
      if (loop) usedLoops.set(loop.id, loop);
    }
  }
  const plant = [...usedLoops.values()]
    .map(loop => project.equipment.find(item => item.id === loop.plantEquipmentId))
    .filter((item): item is PlacedEquipment => !!item && item.systemId !== systemId);
  const members = [...inSystem, ...plant.filter((item, index, list) => list.indexOf(item) === index)];
  const cx = members.reduce((sum, item) => sum + item.xM, 0) / members.length;
  const cy = members.reduce((sum, item) => sum + item.yM, 0) / members.length;
  const keyOf = new Map(members.map((item, index) => [item.id, `m${index}`]));
  const loopKey = new Map([...usedLoops.keys()].map((id, index) => [id, `l${index}`]));
  const cToF = (value: number | null) => (value == null ? null : round3(value * 1.8 + 32));
  const nodes = (project.ductNodes ?? []).filter(item => item.systemId === systemId);
  const nodeKey = new Map(nodes.map((item, index) => [item.id, `n${index}`]));
  const ref = (end: { equipmentId: string | null; portId: string | null; nodeId?: string | null }, point: { x: number; y: number }): PackageRef => {
    if (end.equipmentId && end.portId && keyOf.has(end.equipmentId)) return { member: keyOf.get(end.equipmentId)!, portId: end.portId };
    if (end.nodeId && nodeKey.has(end.nodeId)) return { node: nodeKey.get(end.nodeId)! };
    return { x: round3(point.x - cx), y: round3(point.y - cy) };
  };
  const ducts: PackageDuct[] = (project.ducts ?? [])
    .filter(run => run.systemId === systemId && ductViewOf(run) === 'plan')
    .map(run => ({
      catalogId: run.catalogId,
      service: run.service,
      shape: run.shape,
      widthIn: round3(run.widthM / INCH),
      ...(run.heightM != null ? { heightIn: round3(run.heightM / INCH) } : {}),
      from: ref(run.start, run.points[0]),
      to: ref(run.end, run.points[run.points.length - 1]),
      via: run.points.slice(1, -1).map(point => ({ x: round3(point.x - cx), y: round3(point.y - cy) })),
      ...(run.streamDesign ? { streamDesign: run.streamDesign } : {}),
    }));
  const points: PackagePoint[] = [];
  for (const point of project.controlPoints ?? []) {
    const location = point.location;
    if (location.kind === 'station') {
      const item = members.find(entry => entry.id === location.equipmentId);
      if (!item) continue;
      const index = unitSections(item).findIndex(section => section.id === location.sectionId);
      if (index >= 0) points.push({ tag: point.tag, sensor: point.sensor, member: keyOf.get(item.id)!, section: index });
    } else if (location.equipmentId && keyOf.has(location.equipmentId)) {
      points.push({ tag: point.tag, sensor: point.sensor, member: keyOf.get(location.equipmentId)!, room: true });
    }
  }
  return {
    id: createId('tpl'),
    name,
    description: `Saved from ${project.name}: ${system.name}.`,
    group: 'My templates',
    user: true,
    savedAt: new Date().toISOString(),
    systems: [{ key: 'main', name: system.name, kind: system.kind, notes: system.notes }],
    members: members.map(item => ({
      key: keyOf.get(item.id)!,
      catalogId: item.catalogId,
      planOffset: { xM: round3(item.xM - cx), yM: round3(item.yM - cy) },
      ...(item.systemId === systemId ? {} : { system: null }),
      ...(item.yawDeg ? { yawDeg: item.yawDeg } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.designFlowM3s != null ? { designCfm: round3(item.designFlowM3s / CFM) } : {}),
      ...(item.sections
        ? {
            sections: item.sections.map(({ id: _id, loopId, valves, ...section }) => ({
              ...section,
              ...(loopId && loopKey.has(loopId) ? { loopKey: loopKey.get(loopId) } : {}),
              ...(valves ? { valves: valves.map(({ id: _valve, ...valve }) => valve) } : {}),
            })),
          }
        : {}),
    })),
    nodes: nodes.map(item => ({ key: nodeKey.get(item.id)!, service: item.service, x: round3(item.x - cx), y: round3(item.y - cy) })),
    ducts,
    loops: [...usedLoops.values()].map(loop => ({
      key: loopKey.get(loop.id)!,
      name: loop.name,
      fluid: loop.fluid,
      ...(loop.glycolFraction != null ? { glycolFraction: loop.glycolFraction } : {}),
      supplyF: cToF(loop.supplyC),
      returnF: cToF(loop.returnC),
      ...(loop.plantEquipmentId && keyOf.has(loop.plantEquipmentId) ? { plantMember: keyOf.get(loop.plantEquipmentId) } : {}),
      notes: loop.notes,
    })),
    points,
  };
}
