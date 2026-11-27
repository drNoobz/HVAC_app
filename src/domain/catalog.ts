import type { DuctService, UnitSection } from './types';

export type EquipmentCategory =
  | 'kitchen-hood'
  | 'exhaust-fan'
  | 'makeup-air'
  | 'bathroom-exhaust'
  | 'system-equipment'
  | 'heating-cooling'
  | 'energy-recovery'
  | 'air-handling'
  | 'air-terminal'
  | 'plant'
  | 'air-path';

/** Top-level catalog family. Add families here when the library grows. */
export type EquipmentFamily = 'space' | 'system';

export type EquipmentMount = 'ceiling' | 'roof' | 'grade';

/** Connection on the plan footprint. u and v are -1 to 1 across length and width from the center. */
export interface CatalogPort {
  id: string;
  service: DuctService;
  /** In: air enters the equipment here. Out: air leaves it. */
  direction: 'in' | 'out';
  /** Other streams this port also takes, such as relief air at an exhaust louver. */
  accepts?: DuctService[];
  u: number;
  v: number;
}

export type UnitPortRole = 'oa' | 'ra' | 'sa' | 'ea';

/** Air-handling unit: default internal sections and where each air connection sits on the casing. */
export interface UnitSpec {
  sections: Omit<UnitSection, 'id'>[];
  portAt: Record<UnitPortRole, { id: string; u: number; v: number }>;
}

/** Room terminals serve a space. Outdoor terminals are intakes and discharges at the building skin. */
export type TerminalRole = 'room' | 'outdoor';

export interface StatedQuantity {
  /** Public catalog / listing text used for planning. Confirm on a current submittal. */
  stated: string;
  status: 'assumption';
}

export interface FlowSpec extends StatedQuantity {
  valueM3s: number;
}

export interface PowerSpec extends StatedQuantity {
  valueW: number;
}

export interface SizeSpec extends StatedQuantity {
  lengthM: number;
  widthM: number;
  heightM: number;
}

export interface CatalogProduct {
  id: string;
  manufacturer: string;
  model: string;
  name: string;
  category: EquipmentCategory;
  supplier: string;
  mount: EquipmentMount;
  dimensions: SizeSpec | null;
  airflow: FlowSpec | null;
  cooling: PowerSpec | null;
  heating: PowerSpec | null;
  electrical: string | null;
  connections: string | null;
  documentUrl: string | null;
  image: null;
  source: string;
  reviewStatus: 'needs-confirmation';
  /** Missing or unverified fields. Does not repeat the page-level disclaimer. */
  gaps: string[];
  /** Fixed connections. Units derive theirs from their sections instead. */
  ports?: CatalogPort[];
  /** Present on air-handling units, packaged rooftops, make-up air units, and ERVs. */
  unit?: UnitSpec;
  /** Present on diffusers, grilles, louvers, and roof hoods. */
  terminal?: TerminalRole;
  /** Older schematic nodes kept so saved projects open. Hidden from the library. */
  legacy?: boolean;
}

export const CATALOG_SOURCE =
  'North American manufacturer public catalogs and listing sheets, gathered for planning. Confirm model, options, and ratings on a current submittal before design.';

export const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  'kitchen-hood': 'Kitchen hood',
  'exhaust-fan': 'Exhaust fan',
  'makeup-air': 'Make-up air',
  'bathroom-exhaust': 'Bathroom exhaust',
  'system-equipment': 'System equipment',
  'heating-cooling': 'Heating and cooling',
  'energy-recovery': 'Energy recovery',
  'air-handling': 'Air-handling unit',
  'air-terminal': 'Air terminal',
  plant: 'Plant (boilers, chillers, racks)',
  'air-path': 'Air path (legacy)',
};

export const FAMILY_LABEL: Record<EquipmentFamily, string> = {
  space: 'Space equipment',
  system: 'System equipment',
};

export const FAMILY_ORDER: EquipmentFamily[] = ['space', 'system'];

/** Categories under each family. Subdivide by appending here later. */
export const FAMILY_CATEGORIES: Record<EquipmentFamily, EquipmentCategory[]> = {
  space: ['kitchen-hood', 'exhaust-fan', 'makeup-air', 'bathroom-exhaust', 'air-terminal'],
  system: ['air-handling', 'system-equipment', 'heating-cooling', 'energy-recovery', 'plant'],
};

/** Kept so older call sites compile. Air-path equipment is drawn on the plan. */
export function isSchematicOnly(_product: CatalogProduct | undefined | null): boolean {
  return false;
}

export function familyForCategory(category: EquipmentCategory): EquipmentFamily {
  for (const family of FAMILY_ORDER) {
    if (FAMILY_CATEGORIES[family].includes(category)) return family;
  }
  return 'space';
}

function flow(statedCfm: number, stated?: string): FlowSpec {
  return {
    stated: stated ?? `${statedCfm} CFM`,
    status: 'assumption',
    valueM3s: statedCfm * 0.0004719474432,
  };
}

function tons(statedTons: number, stated?: string): PowerSpec {
  return {
    stated: stated ?? `${statedTons} ton`,
    status: 'assumption',
    valueW: statedTons * 3516.85,
  };
}

function kBtu(stated: number, label?: string): PowerSpec {
  return {
    stated: label ?? `${stated} kBtu/h`,
    status: 'assumption',
    valueW: stated * 1000 * 0.29307107,
  };
}

function feet(lengthFt: number, widthFt: number, heightFt: number, stated?: string): SizeSpec {
  return {
    stated: stated ?? `${lengthFt} ft × ${widthFt} ft × ${heightFt} ft`,
    status: 'assumption',
    lengthM: lengthFt * 0.3048,
    widthM: widthFt * 0.3048,
    heightM: heightFt * 0.3048,
  };
}

function inches(lengthIn: number, widthIn: number, heightIn: number, stated?: string): SizeSpec {
  return {
    stated: stated ?? `${lengthIn} in × ${widthIn} in × ${heightIn} in`,
    status: 'assumption',
    lengthM: lengthIn * 0.0254,
    widthM: widthIn * 0.0254,
    heightM: heightIn * 0.0254,
  };
}

/**
 * Stable catalog ids keep existing project templates working.
 * Manufacturer / model / supplier rows are real North American product lines.
 */
export const CATALOG: CatalogProduct[] = [
  {
    id: 'hood-wall-8',
    manufacturer: 'CaptiveAire',
    model: 'ND-2',
    name: 'Type I wall canopy hood, 8 ft',
    category: 'kitchen-hood',
    supplier: 'CaptiveAire Systems (USA)',
    mount: 'ceiling',
    dimensions: feet(8, 4, 2, '8 ft long × 4 ft deep × 2 ft high planning envelope'),
    airflow: flow(1600, '1600 CFM (8 ft × 200 CFM/ft at 600 °F listing)'),
    cooling: null,
    heating: null,
    electrical: 'Lighting and controls per CaptiveAire package options. Confirm on submittal.',
    connections: 'Grease duct and fire-suppression package. Duct sized from exhaust CFM (listing uses ~1500 FPM).',
    documentUrl: 'https://pics.acitydiscount.com/specs/ND-2.pdf',
    image: null,
    source: 'CaptiveAire ND-2 wall canopy listing: min exhaust 150 / 200 / 250 CFM/ft at 450 / 600 / 700 °F cooking surface.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Total CFM uses the 600 °F band as a planning pick. Heavier cooking lines need the 700 °F band.',
      'Hood depth/height are a planning envelope; order length and options from CaptiveAire.',
      'No product image in this app.',
    ],
  },
  {
    id: 'hood-wall-10',
    manufacturer: 'CaptiveAire',
    model: 'ND-2',
    name: 'Type I wall canopy hood, 10 ft',
    category: 'kitchen-hood',
    supplier: 'CaptiveAire Systems (USA)',
    mount: 'ceiling',
    dimensions: feet(10, 4, 2, '10 ft long × 4 ft deep × 2 ft high planning envelope'),
    airflow: flow(2000, '2000 CFM (10 ft × 200 CFM/ft at 600 °F listing)'),
    cooling: null,
    heating: null,
    electrical: 'Lighting and controls per CaptiveAire package options. Confirm on submittal.',
    connections: 'Grease duct and fire-suppression package. Duct sized from exhaust CFM (listing uses ~1500 FPM).',
    documentUrl: 'https://pics.acitydiscount.com/specs/ND-2.pdf',
    image: null,
    source: 'CaptiveAire ND-2 wall canopy listing: min exhaust 150 / 200 / 250 CFM/ft at 450 / 600 / 700 °F cooking surface.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Total CFM uses the 600 °F band as a planning pick. Heavier cooking lines need the 700 °F band.',
      'Hood depth/height are a planning envelope; order length and options from CaptiveAire.',
      'No product image in this app.',
    ],
  },
  {
    id: 'hood-type2-4',
    manufacturer: 'Planning placeholder',
    model: 'Type II condensate hood',
    name: 'Type II condensate hood, 4 ft (dishwasher)',
    category: 'kitchen-hood',
    supplier: 'Select from the dishwasher and hood manufacturers',
    mount: 'ceiling',
    dimensions: feet(4, 3.5, 2, '4 ft × 3.5 ft × 2 ft planning envelope over a door-type dishwasher'),
    airflow: flow(400, '400 CFM planning value for a door-type dishwasher; use the machine data'),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Exhaust collar to a non-grease exhaust duct. Condensate gutter and drain.',
    documentUrl: null,
    image: null,
    source: 'Placeholder, not a product: IMC 507 asks for a Type II hood over dishwashers that make steam or heat, unless the machine is listed for venting otherwise.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Not a real product. Size and exhaust rate come from the dishwasher manufacturer and the hood selection.', 'No product image in this app.'],
  },
  {
    id: 'hood-island-10',
    manufacturer: 'CaptiveAire',
    model: 'ND-2WI',
    name: 'Type I single-island canopy hood, 10 ft',
    category: 'kitchen-hood',
    supplier: 'CaptiveAire Systems (USA)',
    mount: 'ceiling',
    dimensions: feet(10, 5, 2, '10 ft long × 5 ft deep × 2 ft high planning envelope'),
    airflow: flow(3000, '3000 CFM (10 ft × 300 CFM/ft at 600 °F single-island listing)'),
    cooling: null,
    heating: null,
    electrical: 'Lighting and controls per CaptiveAire package options. Confirm on submittal.',
    connections: 'Grease duct and fire-suppression package. Island hoods see all sides; end panels often required.',
    documentUrl: 'https://www.thermotek.com/CATALOGCONTENT/HOODS/ND2/ND2.ASP?catid=362',
    image: null,
    source: 'CaptiveAire / ThermoTek single-island ND-2 family listings: higher CFM/ft than wall canopy (about 269 / 300 / 350 CFM/ft at 450 / 600 / 700 °F).',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Total CFM uses the 600 °F single-island band as a planning pick.',
      'Confirm island vs wall configuration and end panels with CaptiveAire.',
      'No product image in this app.',
    ],
  },
  {
    id: 'fan-upblast-30',
    manufacturer: 'Greenheck',
    model: 'CUBE',
    name: 'Centrifugal upblast restaurant exhaust fan',
    category: 'exhaust-fan',
    supplier: 'Greenheck Fan Corporation (USA)',
    mount: 'roof',
    dimensions: feet(3.5, 3.5, 3, 'Planning curb envelope ~3.5 ft × 3.5 ft × 3 ft; size from fan selection'),
    airflow: flow(3000, '3000 CFM planning point (CUBE range 180–30,000 CFM)'),
    cooling: null,
    heating: null,
    electrical: 'Motor HP and voltage from Greenheck selection software. Confirm on submittal.',
    connections: 'Roof curb and welded grease duct. UL 705 Supplement SC (restaurant exhaust) listing available.',
    documentUrl: 'https://www.greenheck.com/products/fans/roof/cube',
    image: null,
    source: 'Greenheck CUBE belt-drive centrifugal upblast: 180–30,000 CFM, up to 5 in. wg, UL restaurant exhaust listing.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Exact wheel size, RPM, and static pressure must come from a fan selection for the duct system.',
      'Footprint is a planning curb envelope, not a certified outline.',
      'No product image in this app.',
    ],
  },
  {
    id: 'fan-inline-8',
    manufacturer: 'Greenheck',
    model: 'SQ-12',
    name: 'Square mixed-flow inline exhaust fan',
    category: 'exhaust-fan',
    supplier: 'Greenheck Fan Corporation (USA)',
    mount: 'ceiling',
    dimensions: inches(20, 18.25, 18.25, 'SQ-12 housing about 20 in long × 18.25 in square'),
    airflow: flow(800, '800 CFM planning point (SQ series up to ~27,800 CFM)'),
    cooling: null,
    heating: null,
    electrical: 'Direct-drive motor package from Greenheck selection. Confirm voltage on submittal.',
    connections: 'Inline duct connections both ends. Clean-air applications unless otherwise listed.',
    documentUrl: 'https://content.greenheck.com/public/DAMProd/Original/10017/SQMF_catalog.pdf',
    image: null,
    source: 'Greenheck Model SQ mixed-flow inline catalog: size 12 dimensions and series performance range.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      '800 CFM is a planning point inside the SQ family range, not a certified operating point for a specific motor.',
      'No product image in this app.',
    ],
  },
  {
    id: 'mau-40',
    manufacturer: 'CaptiveAire',
    model: 'AD / A1 modular direct-fired',
    name: 'Direct-fired make-up air unit',
    category: 'makeup-air',
    supplier: 'CaptiveAire Systems (USA)',
    mount: 'roof',
    dimensions: feet(8, 4, 4, 'Planning envelope 8 ft × 4 ft × 4 ft; confirm housing size from CaptiveAire'),
    airflow: flow(4000, '4000 CFM planning point (AD family about 1,000–19,000 CFM)'),
    cooling: null,
    heating: kBtu(400, 'Direct gas-fired heat; capacity follows selected burner / CFM (family to ~2,500 MBH)'),
    electrical: 'Controls and disconnect per CaptiveAire package. Confirm on submittal.',
    connections: 'Outdoor air intake, supply duct, gas train. Indoor or outdoor mounting options.',
    documentUrl: 'https://captiveaire.com/CatalogContent/Fans/Sup_AD/DirectFired.asp',
    image: null,
    source: 'CaptiveAire modular direct-fired make-up air (AD / A1): about 1,000–19,000 CFM, ANSI Z83.4 / CSA 3.7 listed packages.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Selected CFM and burner size must match the kitchen exhaust schedule.',
      'Cooling coil options are not stated on this row.',
      'Footprint is a planning envelope.',
      'No product image in this app.',
    ],
  },
  {
    id: 'bath-fan-150',
    manufacturer: 'Panasonic',
    model: 'FV-1115VK3',
    name: 'WhisperCeiling DC bathroom exhaust fan',
    category: 'bathroom-exhaust',
    supplier: 'Panasonic North America',
    mount: 'ceiling',
    dimensions: inches(13, 13, 7.5, 'About 13 in grille; mounting opening ~10.5 in; depth from product family'),
    airflow: flow(150, '150 CFM (Pick-A-Flow 110 / 130 / 150 CFM)'),
    cooling: null,
    heating: null,
    electrical: '120 V, ECM motor. ENERGY STAR family.',
    connections: '4 in or 6 in duct depending on setting / model guidance.',
    documentUrl: 'https://iaq.na.panasonic.com/ventilation/fans/whisperceiling-dc-smartflow-50-80-110-cfm',
    image: null,
    source: 'Panasonic WhisperCeiling DC / Intelli-Balance catalog: FV-1115VK3 Pick-A-Flow 110–130–150 CFM.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Exact housing depth and grille style vary by exact SKU; confirm on the submittal sheet.',
      'No product image in this app.',
    ],
  },
  {
    id: 'rtu-12',
    manufacturer: 'Carrier',
    model: '48FC*M14',
    name: 'WeatherMaker packaged rooftop, gas/electric',
    category: 'system-equipment',
    supplier: 'Carrier Corporation (USA)',
    mount: 'roof',
    dimensions: feet(7.4, 4.9, 4.2, 'Planning envelope ~89 in × 59 in × 50 in class for 10–12.5 ton WeatherMaker'),
    airflow: flow(3750, '3750 CFM AHRI rating CFM (48FC*M14)'),
    cooling: tons(12.5, '12.5 ton nominal (48FC*M14)'),
    heating: kBtu(200, 'Gas heat level selected in Carrier software; 200 kBtu/h is a planning pick'),
    electrical: 'Voltage / MCA / MOCP from Carrier product data for the selected voltage.',
    connections: 'Supply and return ducts, gas, condensate, power. Roof curb sized to unit.',
    documentUrl: 'https://www.shareddocs.com/hvac/docs/1005/Public/05/48-50FC-8-16-02PD.pdf',
    image: null,
    source: 'Carrier WeatherMaker 48FC product data: 48FC*M14 = 12.5 ton, 3750 CFM AHRI rating CFM.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Heating capacity depends on the ordered gas heat level.',
      'Footprint is a planning envelope from the 7.5–12.5 ton class, not a certified outline drawing.',
      'No product image in this app.',
    ],
  },
  {
    id: 'rtu-4',
    manufacturer: 'Carrier',
    model: '48FC*M05',
    name: 'WeatherMaker packaged rooftop, gas/electric',
    category: 'system-equipment',
    supplier: 'Carrier Corporation (USA)',
    mount: 'roof',
    dimensions: feet(74 / 12, 47 / 12, 33 / 12, '74 × 47 × 33 in (Carrier 48FC physical data, 4 ton); about 543 lb'),
    airflow: flow(1600, '1600 CFM planning value (400 CFM/ton); Carrier does not state a rated CFM on the spec page'),
    cooling: tons(4, '4 ton nominal, single-stage cooling (48FC 04–06)'),
    heating: kBtu(110, 'Medium gas heat, 110 kBtu/h input; 67 and 150 kBtu/h are the other options'),
    electrical: 'Voltage / MCA / MOCP from Carrier product data for the selected voltage.',
    connections: 'Supply and return ducts, gas, condensate, power. Roof curb sized to unit.',
    documentUrl: 'https://www.carrier.com/us/en/commercial/packaged-outdoor/48fc/technical-specifications/',
    image: null,
    source: 'Carrier WeatherMaker 48FC technical specifications, physical data table: 4 ton, 74 × 47 × 33 in, 543 lb, gas heat input 67 / 110 / 150 kBtu/h.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Supply airflow is a planning value at 400 CFM/ton; take the rated and fan-table airflow from the 48FC04-07 product data.',
      'Model code 48FC*M05 (size 05, medium heat) is inferred from the size order; confirm on a submittal.',
      'Heating capacity depends on the ordered gas heat level; the value here is input, not output.',
      'No product image in this app.',
    ],
  },
  {
    id: 'rtu-75',
    manufacturer: 'Carrier',
    model: '48FC*M08',
    name: 'WeatherMaker packaged rooftop, gas/electric',
    category: 'system-equipment',
    supplier: 'Carrier Corporation (USA)',
    mount: 'roof',
    dimensions: feet(7.4, 4.9, 3.8, 'Planning envelope for 7.5 ton WeatherMaker class'),
    airflow: flow(2650, '2650 CFM AHRI rating CFM (48FC*M08)'),
    cooling: tons(7.5, '7.5 ton nominal (48FC*M08)'),
    heating: kBtu(150, 'Gas heat level selected in Carrier software; 150 kBtu/h is a planning pick'),
    electrical: 'Voltage / MCA / MOCP from Carrier product data for the selected voltage.',
    connections: 'Supply and return ducts, gas, condensate, power. Roof curb sized to unit.',
    documentUrl: 'https://www.shareddocs.com/hvac/docs/1005/Public/05/48-50FC-8-16-02PD.pdf',
    image: null,
    source: 'Carrier WeatherMaker 48FC product data: 48FC*M08 = 7.5 ton, 2650 CFM AHRI rating CFM.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Heating capacity depends on the ordered gas heat level.',
      'Footprint is a planning envelope, not a certified outline drawing.',
      'No product image in this app.',
    ],
  },
  {
    id: 'erv-20',
    manufacturer: 'RenewAire',
    model: 'HE1XRT',
    name: 'HE Series energy recovery ventilator, outdoor',
    category: 'system-equipment',
    supplier: 'RenewAire (USA)',
    mount: 'roof',
    dimensions: inches(63, 30, 56, 'Shipping / planning envelope about 63 in × 30 in × 56 in (HE1X family)'),
    airflow: flow(800, '800 CFM planning point (HE1X typical range 250–925 CFM)'),
    cooling: null,
    heating: null,
    electrical: 'Dual blowers; voltage options per RenewAire submittal (often 120 / 208–230 V).',
    connections: 'OA, EA, SA, RA duct connections. AHRI 1060 certified core.',
    documentUrl: 'https://renewaire.com/wp-content/uploads/2025/06/HE1XINMan_105599_012_MAY22.pdf',
    image: null,
    source: 'RenewAire HE1X Series: typical airflow 250–925 CFM; outdoor HE1XRT / indoor HE1XIN variants.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      '800 CFM is inside the published range; static pressure and effectiveness come from the RenewAire selection.',
      'Manual linked is the indoor HE1XIN; confirm outdoor HE1XRT dimensions on the matching submittal.',
      'No product image in this app.',
    ],
  },
  {
    id: 'erv-small-100',
    manufacturer: 'Planning placeholder',
    model: 'Small ERV, 100 CFM class',
    name: 'Small energy recovery ventilator, 100 CFM class',
    category: 'system-equipment',
    supplier: 'Select a 50–150 CFM ERV for one room',
    mount: 'roof',
    dimensions: inches(36, 24, 20, 'Planning envelope about 36 in × 24 in × 20 in'),
    airflow: flow(100, '100 CFM planning point (50–150 CFM class)'),
    cooling: null,
    heating: null,
    electrical: '120 V single phase typical for this size. Confirm on the selection.',
    connections: 'Outdoor-air and exhaust connections to hoods or wall caps; supply and return ducts to the room.',
    documentUrl: null,
    image: null,
    source: 'Placeholder, not a product: ERVs in the 50–150 CFM class are common for single rooms. Many are indoor units with ducted wall caps instead of hoods on the casing.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Not a real product. Select the unit, its mounting, and its wall caps or hoods.', 'No product image in this app.'],
  },
  {
    id: 'split-12',
    manufacturer: 'Mitsubishi Electric',
    model: 'MSZ-GL12NA / MUZ-GL12NA',
    name: 'Ductless wall-mounted heat pump (mini-split)',
    category: 'heating-cooling',
    supplier: 'Mitsubishi Electric Trane HVAC US',
    mount: 'ceiling',
    dimensions: inches(31.4, 9.1, 11.6, 'Indoor high-wall unit about 31-7/16 in wide × 9-1/8 in deep × 11-5/8 in high'),
    airflow: null,
    cooling: tons(1, '12,000 Btu/h nominal cooling (1 ton)'),
    heating: kBtu(13.6, '13,600 Btu/h nominal heat-pump heating at 47 °F outdoor'),
    electrical: '208/230 V single phase to the outdoor unit; indoor unit powered from the outdoor unit. Confirm MCA / MOCP on the submittal.',
    connections: 'Refrigerant line set and control wire to the paired MUZ-GL12NA outdoor unit; condensate drain. Recirculates room air only: no outdoor air.',
    documentUrl: null,
    image: null,
    source: 'Mitsubishi Electric M-Series MSZ-GL / MUZ-GL wall-mounted heat pump family, 12,000 Btu/h size. Planning values.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Ratings and dimensions are planning values for the 12k size; confirm on the current submittal and AHRI certificate.',
      'Wall-mounted unit: drawn as a ceiling-height indoor unit on the plan.',
      'Outdoor unit is not placed as its own item.',
      'No product data link or image in this app.',
    ],
  },
  {
    id: 'cu-5',
    manufacturer: 'Carrier',
    model: '38AUZ07',
    name: 'Air-cooled condensing unit',
    category: 'system-equipment',
    supplier: 'Carrier Corporation (USA)',
    mount: 'grade',
    dimensions: inches(45, 35, 42.4, 'About 45 in × 35 in footprint × 42-3/8 in high (38AU 07 class)'),
    airflow: null,
    cooling: tons(6, '6 ton nominal (38AUZ07; Carrier commercial CU line starts at 6 ton)'),
    heating: null,
    electrical: 'Voltage / MCA / MOCP from Carrier 38AU product data.',
    connections: 'Refrigerant line set to matched indoor unit. Confirm pipe sizes on the combination rating.',
    documentUrl: 'https://www.shareddocs.com/hvac/docs/1005/Public/08/38AU-7-28-01PD.pdf',
    image: null,
    source: 'Carrier 38AUZ07 product data: 6 ton commercial air-cooled condensing unit.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Matched indoor air handler is not selected on this row.',
      'Outdoor condenser airflow is not used as a space ventilation rate.',
      'No product image in this app.',
    ],
  },
  {
    id: 'damper-oa',
    manufacturer: 'Generic',
    model: 'OA-DMP',
    name: 'Outdoor-air damper',
    category: 'air-path',
    supplier: 'Planning schematic',
    mount: 'ceiling',
    dimensions: inches(24, 12, 12, 'Schematic node 24 in × 12 in'),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'In / out air path. NC/NO and actuator options are not selected here.',
    documentUrl: null,
    image: null,
    source: 'Schematic air-path component for system diagrams.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Planning node only; confirm damper type and actuator on a submittal.'],
  },
  {
    id: 'damper-ra',
    manufacturer: 'Generic',
    model: 'RA-DMP',
    name: 'Return-air damper',
    category: 'air-path',
    supplier: 'Planning schematic',
    mount: 'ceiling',
    dimensions: inches(24, 12, 12, 'Schematic node 24 in × 12 in'),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'In / out air path.',
    documentUrl: null,
    image: null,
    source: 'Schematic air-path component for system diagrams.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Planning node only.'],
  },
  {
    id: 'damper-relief',
    manufacturer: 'Generic',
    model: 'RLF-DMP',
    name: 'Relief / exhaust damper',
    category: 'air-path',
    supplier: 'Planning schematic',
    mount: 'ceiling',
    dimensions: inches(24, 12, 12, 'Schematic node 24 in × 12 in'),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'In / out air path.',
    documentUrl: null,
    image: null,
    source: 'Schematic air-path component for system diagrams.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Planning node only.'],
  },
  {
    id: 'mix-plenum',
    manufacturer: 'Generic',
    model: 'MIX-BOX',
    name: 'Mixing plenum',
    category: 'air-path',
    supplier: 'Planning schematic',
    mount: 'ceiling',
    dimensions: inches(36, 24, 24, 'Schematic node 36 in × 24 in'),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'OA and RA inlets, mixed-air outlet.',
    documentUrl: null,
    image: null,
    source: 'Schematic air-path component for system diagrams.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Planning node only.'],
  },
  {
    id: 'filter-panel',
    manufacturer: 'Generic',
    model: 'FIL-2IN',
    name: 'Filter section',
    category: 'air-path',
    supplier: 'Planning schematic',
    mount: 'ceiling',
    dimensions: inches(24, 18, 24, 'Schematic node 24 in × 18 in'),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'In / out air path.',
    documentUrl: null,
    image: null,
    source: 'Schematic air-path component for system diagrams.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Planning node only; MERV and pressure drop not stated.'],
  },
  {
    id: 'coil-cool',
    manufacturer: 'Generic',
    model: 'CC-DX',
    name: 'Cooling coil',
    category: 'air-path',
    supplier: 'Planning schematic',
    mount: 'ceiling',
    dimensions: inches(30, 18, 24, 'Schematic node 30 in × 18 in'),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'In / out air path. Refrigerant or CHW connections not modeled.',
    documentUrl: null,
    image: null,
    source: 'Schematic air-path component for system diagrams.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Planning node only; capacity is not stated.'],
  },
  {
    id: 'coil-heat',
    manufacturer: 'Generic',
    model: 'HC-HW',
    name: 'Heating coil',
    category: 'air-path',
    supplier: 'Planning schematic',
    mount: 'ceiling',
    dimensions: inches(30, 18, 24, 'Schematic node 30 in × 18 in'),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'In / out air path. Hot water or electric heat not modeled.',
    documentUrl: null,
    image: null,
    source: 'Schematic air-path component for system diagrams.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Planning node only; capacity is not stated.'],
  },
  {
    id: 'sensor-air',
    manufacturer: 'Generic',
    model: 'SNS-AIR',
    name: 'Air-stream sensor',
    category: 'air-path',
    supplier: 'Planning schematic',
    mount: 'ceiling',
    dimensions: inches(10, 10, 6, 'Schematic node 10 in × 10 in'),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: 'Low-voltage sensor. Confirm protocol on submittal.',
    connections: 'In / out pass-through on the air path.',
    documentUrl: null,
    image: null,
    source: 'Schematic air-path component for system diagrams.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Planning node only; measured quantity is noted by the user.'],
  },
  {
    id: 'fan-supply',
    manufacturer: 'Generic',
    model: 'SF-AHU',
    name: 'Supply fan section',
    category: 'air-path',
    supplier: 'Planning schematic',
    mount: 'ceiling',
    dimensions: inches(30, 24, 24, 'Schematic node 30 in × 24 in'),
    airflow: flow(2000, '2000 CFM planning point'),
    cooling: null,
    heating: null,
    electrical: 'Fan motor package. Confirm voltage and BHP on submittal.',
    connections: 'In / out air path.',
    documentUrl: null,
    image: null,
    source: 'Schematic air-path component for system diagrams.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Planning node only; fan curve is not stated.'],
  },
  {
    id: 'ahu-csaa-12',
    manufacturer: 'Trane',
    model: 'Performance Climate Changer CSAA (size 12 class)',
    name: 'Modular indoor air handler, mixed air',
    category: 'air-handling',
    supplier: 'Trane Technologies (USA)',
    mount: 'grade',
    dimensions: feet(16, 5.5, 5, 'Planning envelope ~16 ft × 5.5 ft × 5 ft for a size 12 unit with mixing box, filter, fan, and two coils'),
    airflow: flow(6000, '6000 CFM planning point (size 12 ≈ 12 ft² coil face at 500 fpm)'),
    cooling: null,
    heating: null,
    electrical: 'Fan motor and VFD per Trane selection. Confirm on submittal.',
    connections: 'Outdoor, return, and supply air ducts. Coil piping and condensate per section.',
    documentUrl: 'https://www.trane.com/commercial/north-america/us/en/products-systems/air-handlers/indoor-air-handlers.html',
    image: null,
    source: 'Trane Performance Climate Changer (CSAA): modular indoor air handler. Size number is roughly coil face area in ft².',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Section lengths and casing size come from Trane selection software.',
      'Coil capacities are not stated until the coils are selected.',
      'No product image in this app.',
    ],
  },
  {
    id: 'ahu-csaa-66',
    manufacturer: 'Trane',
    model: 'Performance Climate Changer CSAA (size 66 class)',
    name: 'Modular air handler, economizer with exhaust fan',
    category: 'air-handling',
    supplier: 'Trane Technologies (USA)',
    mount: 'grade',
    dimensions: feet(32, 11, 8.5, 'Planning envelope ~32 ft × 11 ft × 8.5 ft for a size 66 unit with exhaust fan, mixing box, fan, and two coils'),
    airflow: flow(30000, '30,000 CFM planning point (size 66 ≈ 66 ft² coil face at ~450 fpm)'),
    cooling: null,
    heating: null,
    electrical: 'Supply and exhaust fan motors and VFDs per Trane selection. Confirm on submittal.',
    connections: 'Outdoor, return, exhaust, and supply air ducts. Refrigerant and glycol coil piping per section.',
    documentUrl: 'https://www.trane.com/commercial/north-america/us/en/products-systems/air-handlers/indoor-air-handlers.html',
    image: null,
    source: 'Trane Performance Climate Changer (CSAA): modular indoor air handler with optional exhaust fan / economizer sections.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Section lengths and casing size come from Trane selection software.',
      'CO₂ (R-744) DX coils are a special selection; confirm availability and pressure rating.',
      'No product image in this app.',
    ],
  },
  {
    id: 'diff-sq-24',
    manufacturer: 'Titus',
    model: 'TMS',
    name: 'Square ceiling supply diffuser, 24 × 24',
    category: 'air-terminal',
    supplier: 'Titus HVAC (USA)',
    mount: 'ceiling',
    dimensions: inches(24, 24, 10, '24 in × 24 in lay-in face; neck and plenum depth by selection'),
    airflow: flow(350, '350 CFM planning point for a 10 in neck'),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Round neck from the branch duct. Balancing damper optional.',
    documentUrl: 'https://www.titus-hvac.com/products/diffusers/square-and-rectangular-diffusers',
    image: null,
    source: 'Titus TMS square ceiling diffuser family. Neck size and throw from the Titus selection.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Throw, NC, and neck size need a selection at the design airflow.', 'No product image in this app.'],
  },
  {
    id: 'grille-ret-24',
    manufacturer: 'Titus',
    model: '50F',
    name: 'Eggcrate return grille, 24 × 24',
    category: 'air-terminal',
    supplier: 'Titus HVAC (USA)',
    mount: 'ceiling',
    dimensions: inches(24, 24, 8, '24 in × 24 in lay-in face'),
    airflow: flow(700, '700 CFM planning point'),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Return plenum box or ducted collar.',
    documentUrl: 'https://www.titus-hvac.com/products/grilles-and-registers',
    image: null,
    source: 'Titus 50F eggcrate return grille. Face velocity and pressure from the Titus selection.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Face velocity and NC need a selection at the design airflow.', 'No product image in this app.'],
  },
  {
    id: 'grille-exh-12',
    manufacturer: 'Titus',
    model: '50F',
    name: 'Eggcrate exhaust grille, 12 × 12',
    category: 'air-terminal',
    supplier: 'Titus HVAC (USA)',
    mount: 'ceiling',
    dimensions: inches(12, 12, 8, '12 in × 12 in face'),
    airflow: flow(150, '150 CFM planning point'),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Ducted collar to the exhaust branch.',
    documentUrl: 'https://www.titus-hvac.com/products/grilles-and-registers',
    image: null,
    source: 'Titus 50F eggcrate grille used for general exhaust.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Not for grease-laden air.', 'No product image in this app.'],
  },
  {
    id: 'grille-transfer-door',
    manufacturer: 'Planning placeholder',
    model: 'Sight-proof door transfer grille',
    name: 'Door transfer grille, 18 × 12 in',
    category: 'air-terminal',
    supplier: 'Select a sight-proof door grille or louver',
    mount: 'grade',
    dimensions: inches(18, 2, 12, '18 in × 12 in face, set in the lower part of the door leaf'),
    airflow: flow(150, '150 CFM planning point: about 0.7 ft² free area at about 210 fpm'),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'No duct. Set in the door leaf, or in the wall beside the door as a pair of grilles with a sight-proof sleeve.',
    documentUrl: null,
    image: null,
    source: 'Placeholder, not a product. Lets air pass from the corridor into an exhausted room with the door closed: a plain undercut passes only about 30–50 CFM quietly.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Not a real product. Size the free area for about 200–300 fpm, and keep the door fire rating where one applies.', 'No product image in this app.'],
  },
  {
    id: 'louver-oa',
    manufacturer: 'Ruskin',
    model: 'ELF6375DX',
    name: 'Stationary drainable wall louver, outdoor-air intake',
    category: 'air-terminal',
    supplier: 'Ruskin (USA)',
    mount: 'ceiling',
    dimensions: inches(48, 6, 36, '48 in wide × 36 in high, 6 in deep frame'),
    airflow: flow(3000, '3000 CFM planning point at about 500 fpm free-area velocity'),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Plenum or duct transition behind the louver. Bird screen standard.',
    documentUrl: 'https://www.ruskin.com/louvers',
    image: null,
    source: 'Ruskin ELF6375DX stationary drainable louver, AMCA 500-L rated.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Free area and beginning water penetration velocity need the Ruskin selection for this size.', 'No product image in this app.'],
  },
  {
    id: 'louver-ea',
    manufacturer: 'Ruskin',
    model: 'ELF6375DX',
    name: 'Stationary drainable wall louver, exhaust discharge',
    category: 'air-terminal',
    supplier: 'Ruskin (USA)',
    mount: 'ceiling',
    dimensions: inches(48, 6, 36, '48 in wide × 36 in high, 6 in deep frame'),
    airflow: flow(3000, '3000 CFM planning point'),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Plenum or duct transition behind the louver. Keep separation from outdoor-air intakes.',
    documentUrl: 'https://www.ruskin.com/louvers',
    image: null,
    source: 'Ruskin ELF6375DX stationary drainable louver, AMCA 500-L rated.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Confirm separation distance to intakes under the governing mechanical code.', 'No product image in this app.'],
  },
  {
    id: 'hood-intake-roof',
    manufacturer: 'Greenheck',
    model: 'FGI',
    name: 'Gravity intake roof hood',
    category: 'air-terminal',
    supplier: 'Greenheck Fan Corporation (USA)',
    mount: 'roof',
    dimensions: inches(30, 30, 18, 'Planning curb envelope ~30 in × 30 in'),
    airflow: flow(1500, '1500 CFM planning point'),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Roof curb and ducted throat.',
    documentUrl: 'https://www.greenheck.com/products/air-movement/gravity-ventilators',
    image: null,
    source: 'Greenheck FGI aluminum gravity intake hood.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Throat size and pressure drop from the Greenheck selection.', 'No product image in this app.'],
  },
  {
    id: 'hood-relief-roof',
    manufacturer: 'Greenheck',
    model: 'FGR',
    name: 'Gravity relief roof hood',
    category: 'air-terminal',
    supplier: 'Greenheck Fan Corporation (USA)',
    mount: 'roof',
    dimensions: inches(30, 30, 18, 'Planning curb envelope ~30 in × 30 in'),
    airflow: flow(1500, '1500 CFM planning point'),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Roof curb and ducted throat. Backdraft damper optional.',
    documentUrl: 'https://www.greenheck.com/products/air-movement/gravity-ventilators',
    image: null,
    source: 'Greenheck FGR aluminum gravity relief hood.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Not for grease-laden air.', 'No product image in this app.'],
  },
  {
    id: 'boiler-crest-1500',
    manufacturer: 'Lochinvar',
    model: 'Crest FBN1501',
    name: 'Condensing hot-water boiler, 1,500 MBH',
    category: 'plant',
    supplier: 'Lochinvar (USA)',
    mount: 'grade',
    dimensions: inches(30, 59, 80, 'Planning envelope ~30 in × 59 in × 80 in'),
    airflow: null,
    cooling: null,
    heating: kBtu(1500, '1,500 MBH input; output depends on return water temperature'),
    electrical: 'Controls and pump power per Lochinvar submittal.',
    connections: 'Hot-water supply and return, gas, flue, condensate. Glycol use needs a manufacturer review.',
    documentUrl: 'https://www.lochinvar.com/products/commercial-boilers/crest/',
    image: null,
    source: 'Lochinvar Crest condensing boiler family, 750–6,000 MBH.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Output and efficiency depend on return water temperature and glycol concentration.', 'No product image in this app.'],
  },
  {
    id: 'chiller-ascend-100',
    manufacturer: 'Trane',
    model: 'Ascend ACR (100 ton class)',
    name: 'Air-cooled scroll chiller, 100 ton',
    category: 'plant',
    supplier: 'Trane Technologies (USA)',
    mount: 'grade',
    dimensions: feet(16, 7.5, 8, 'Planning envelope ~16 ft × 7.5 ft × 8 ft'),
    airflow: null,
    cooling: tons(100, '100 ton nominal'),
    heating: null,
    electrical: 'Voltage / MCA / MOCP from Trane product data.',
    connections: 'Chilled-water supply and return. Service clearance on all sides.',
    documentUrl: 'https://www.trane.com/commercial/north-america/us/en/products-systems/chillers/air-cooled-chillers.html',
    image: null,
    source: 'Trane Ascend air-cooled chiller family.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Capacity at the design leaving water and ambient comes from Trane selection.', 'No product image in this app.'],
  },
  {
    id: 'co2-rack-advansor',
    manufacturer: 'Hillphoenix',
    model: 'Advansor',
    name: 'CO₂ transcritical booster rack',
    category: 'plant',
    supplier: 'Hillphoenix (USA)',
    mount: 'grade',
    dimensions: feet(12, 4, 7, 'Planning envelope ~12 ft × 4 ft × 7 ft; gas cooler is separate'),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: 'Compressor and controls per Hillphoenix submittal.',
    connections: 'CO₂ liquid and suction lines to evaporators and AHU coils. Gas cooler on the roof.',
    documentUrl: 'https://www.hillphoenix.com/refrigeration-systems/co2-systems/',
    image: null,
    source: 'Hillphoenix Advansor CO₂ (R-744) transcritical booster systems.',
    reviewStatus: 'needs-confirmation',
    gaps: ['Medium-temperature suction and capacity come from the rack selection.', 'No product image in this app.'],
  },
];

const CFM_M3S = 0.0004719474432;

function port(id: string, service: DuctService, direction: 'in' | 'out', u: number, v: number, accepts?: DuctService[]): CatalogPort {
  return accepts ? { id, service, direction, accepts, u, v } : { id, service, direction, u, v };
}

/** Explicit connections. Air flows in at an inlet and out at an outlet. */
const PORTS: Record<string, CatalogPort[]> = {
  'hood-wall-8': [port('exhaust', 'exhaust', 'out', 0, 0)],
  'hood-wall-10': [port('exhaust', 'exhaust', 'out', 0, 0)],
  'hood-type2-4': [port('exhaust', 'exhaust', 'out', 0, 0)],
  'hood-island-10': [port('exhaust', 'exhaust', 'out', 0, 0)],
  'fan-upblast-30': [port('in', 'exhaust', 'in', 0, 0)],
  'fan-inline-8': [port('in', 'exhaust', 'in', -1, 0), port('out', 'exhaust', 'out', 1, 0)],
  'bath-fan-150': [port('exhaust', 'exhaust', 'out', 0, 0)],
  'cu-5': [],
  'damper-oa': [port('in', 'outdoor', 'in', -1, 0), port('out', 'outdoor', 'out', 1, 0)],
  'damper-ra': [port('in', 'return', 'in', -1, 0), port('out', 'return', 'out', 1, 0)],
  'damper-relief': [port('in', 'relief', 'in', -1, 0), port('out', 'relief', 'out', 1, 0)],
  'mix-plenum': [port('oa', 'outdoor', 'in', -1, 0.55), port('ra', 'return', 'in', -1, -0.55), port('out', 'supply', 'out', 1, 0, ['mixed'])],
  'filter-panel': [port('in', 'supply', 'in', -1, 0, ['mixed']), port('out', 'supply', 'out', 1, 0, ['mixed'])],
  'coil-cool': [port('in', 'supply', 'in', -1, 0, ['mixed']), port('out', 'supply', 'out', 1, 0)],
  'coil-heat': [port('in', 'supply', 'in', -1, 0), port('out', 'supply', 'out', 1, 0)],
  'sensor-air': [port('in', 'supply', 'in', -1, 0), port('out', 'supply', 'out', 1, 0)],
  'fan-supply': [port('in', 'supply', 'in', -1, 0, ['mixed']), port('out', 'supply', 'out', 1, 0)],
  'diff-sq-24': [port('neck', 'supply', 'in', 0, 0)],
  'grille-ret-24': [port('collar', 'return', 'out', 0, 0)],
  'grille-exh-12': [port('collar', 'exhaust', 'out', 0, 0, ['relief'])],
  'louver-oa': [port('collar', 'outdoor', 'out', 0, 0)],
  'louver-ea': [port('collar', 'exhaust', 'in', 0, 0, ['relief'])],
  'hood-intake-roof': [port('throat', 'outdoor', 'out', 0, 0)],
  'hood-relief-roof': [port('throat', 'relief', 'in', 0, 0, ['exhaust'])],
};

const SIDE_PORTS: UnitSpec['portAt'] = {
  oa: { id: 'oa', u: -1, v: 0.6 },
  ea: { id: 'ea', u: -1, v: 0 },
  ra: { id: 'ra', u: -1, v: -0.6 },
  sa: { id: 'sa', u: 1, v: 0 },
};

/** Packaged rooftop: horizontal supply and return. Economizer hood and barometric relief sit on the casing. */
function rooftop(cfm: number, heatingW: number, coolingW: number, condenserFans: number): UnitSpec {
  return {
    sections: [
      { kind: 'oa-damper', position: 'NC', ducted: false, flowM3s: cfm * 0.2 * CFM_M3S, note: 'Economizer outdoor-air hood. Minimum outdoor air is a planning value.' },
      { kind: 'exhaust-damper', position: 'NC', ducted: false, flowM3s: null, note: 'Barometric relief on the economizer.' },
      { kind: 'ra-damper', position: 'NO', ducted: true },
      { kind: 'mixing-box' },
      { kind: 'filter' },
      { kind: 'cooling-coil', medium: 'dx', capacityW: coolingW },
      { kind: 'heating-coil', medium: 'gas', capacityW: heatingW },
      { kind: 'supply-fan', flowM3s: cfm * CFM_M3S },
      { kind: 'condenser', fanCount: condenserFans, note: 'Condenser fans draw outdoor air across the outdoor coil and discharge up. Fan count is a planning value.' },
    ],
    portAt: {
      oa: { id: 'oa', u: -1, v: 0.6 },
      ea: { id: 'ea', u: -1, v: 0 },
      ra: { id: 'return', u: -1, v: 0 },
      sa: { id: 'supply', u: 1, v: 0 },
    },
  };
}

const UNITS: Record<string, UnitSpec> = {
  'rtu-12': rooftop(3750, 200 * 293.07107, 12.5 * 3516.85, 2),
  'rtu-75': rooftop(2650, 150 * 293.07107, 7.5 * 3516.85, 1),
  'rtu-4': rooftop(1600, 110 * 293.07107, 4 * 3516.85, 1),
  'mau-40': {
    sections: [
      { kind: 'oa-damper', position: 'NC', ducted: false, flowM3s: 4000 * CFM_M3S, note: 'Intake hood with bird screen on the unit.' },
      { kind: 'filter' },
      { kind: 'supply-fan', flowM3s: 4000 * CFM_M3S },
      { kind: 'heating-coil', medium: 'gas', capacityW: 400000 * 0.29307107, note: 'Direct gas-fired burner in the airstream.' },
    ],
    portAt: { ...SIDE_PORTS, sa: { id: 'supply', u: 1, v: 0 } },
  },
  'erv-20': {
    sections: [
      { kind: 'oa-damper', position: 'NC', ducted: true, flowM3s: 800 * CFM_M3S },
      { kind: 'ra-damper', position: 'NC', ducted: true, note: 'Return inlet to the exhaust side of the core.' },
      { kind: 'heat-recovery' },
      { kind: 'filter' },
      { kind: 'supply-fan', flowM3s: 800 * CFM_M3S },
      { kind: 'relief-fan', flowM3s: 800 * CFM_M3S },
      { kind: 'exhaust-damper', position: 'NC', ducted: true, flowM3s: 800 * CFM_M3S },
    ],
    portAt: {
      oa: { id: 'oa', u: -1, v: 0.55 },
      ea: { id: 'ea', u: -1, v: -0.55 },
      sa: { id: 'sa', u: 1, v: 0.55 },
      ra: { id: 'ra', u: 1, v: -0.55 },
    },
  },
  'erv-small-100': {
    sections: [
      { kind: 'oa-damper', position: 'NC', ducted: false, flowM3s: 100 * CFM_M3S },
      { kind: 'ra-damper', position: 'NC', ducted: true, note: 'Return inlet to the exhaust side of the core.' },
      { kind: 'heat-recovery' },
      { kind: 'filter' },
      { kind: 'supply-fan', flowM3s: 100 * CFM_M3S },
      { kind: 'relief-fan', flowM3s: 100 * CFM_M3S },
      { kind: 'exhaust-damper', position: 'NC', ducted: false, flowM3s: 100 * CFM_M3S },
    ],
    portAt: {
      oa: { id: 'oa', u: -1, v: 0.55 },
      ea: { id: 'ea', u: -1, v: -0.55 },
      sa: { id: 'sa', u: 1, v: 0.55 },
      ra: { id: 'ra', u: 1, v: -0.55 },
    },
  },
  'ahu-csaa-12': {
    sections: [
      { kind: 'oa-damper', position: 'NC', ducted: true, flowM3s: 1200 * CFM_M3S },
      { kind: 'ra-damper', position: 'NO', ducted: true },
      { kind: 'mixing-box' },
      { kind: 'filter' },
      { kind: 'supply-fan', flowM3s: 6000 * CFM_M3S },
      { kind: 'cooling-coil', medium: 'chilled-water', capacityW: null },
      { kind: 'heating-coil', medium: 'hot-water', capacityW: null },
    ],
    portAt: SIDE_PORTS,
  },
  'ahu-csaa-66': {
    sections: [
      { kind: 'oa-damper', position: 'NC', ducted: true, flowM3s: 5000 * CFM_M3S, note: 'Fresh air 5,000 CFM. 93 °F DB / 73 °F WB summer, -20 °F winter.' },
      { kind: 'relief-fan', flowM3s: null, note: 'Evacuation fan for economizer operation.' },
      { kind: 'exhaust-damper', position: 'NC', ducted: true, flowM3s: null },
      { kind: 'ra-damper', position: 'NO', ducted: true, note: 'Return air 25,000 CFM at 50 °F / 60% RH.' },
      { kind: 'mixing-box' },
      { kind: 'filter' },
      { kind: 'supply-fan', flowM3s: 30000 * CFM_M3S },
      { kind: 'cooling-coil', medium: 'co2-dx', capacityW: null, note: 'Entering 57.3 °F DB / 49.9 °F WB, leaving 33.0 °F DB. Solenoid V-1, back-pressure valve V-2, 30 °F suction.' },
      { kind: 'heating-coil', medium: 'glycol', capacityW: null, note: '50% propylene glycol, 68 GPM, 140 °F supply / 101 °F return. 3-way valve V-3. Leaving 53.7 °F DB in winter.' },
    ],
    portAt: SIDE_PORTS,
  },
};

const TERMINALS: Record<string, TerminalRole> = {
  'diff-sq-24': 'room',
  'grille-ret-24': 'room',
  'grille-exh-12': 'room',
  'louver-oa': 'outdoor',
  'louver-ea': 'outdoor',
  'hood-intake-roof': 'outdoor',
  'hood-relief-roof': 'outdoor',
};

for (const product of CATALOG) {
  if (UNITS[product.id]) product.unit = UNITS[product.id];
  else product.ports = PORTS[product.id] ?? [];
  if (TERMINALS[product.id]) product.terminal = TERMINALS[product.id];
  if (product.category === 'air-path') product.legacy = true;
}

const BY_ID = new Map(CATALOG.map(item => [item.id, item]));

/** Planning marker when a catalog product does not state dimensions. */
export const FALLBACK_EQUIPMENT_SIZE_M = { lengthM: 0.6, widthM: 0.6, heightM: 0.6 } as const;

export function getProduct(id: string): CatalogProduct | undefined {
  return BY_ID.get(id);
}

/** Fixed plan connection points. Units return none here; use placedPorts for a placed unit. */
export function catalogPorts(product: CatalogProduct): CatalogPort[] {
  return product.ports ?? [];
}

/** Plan/model footprint size from catalog specs, or the 0.6 m marker when not stated. */
export function equipmentSizeM(product: CatalogProduct | undefined | null): {
  lengthM: number;
  widthM: number;
  heightM: number;
  stated: boolean;
} {
  if (product?.dimensions) {
    return {
      lengthM: product.dimensions.lengthM,
      widthM: product.dimensions.widthM,
      heightM: product.dimensions.heightM,
      stated: true,
    };
  }
  return { ...FALLBACK_EQUIPMENT_SIZE_M, stated: false };
}

export const CATALOG_MIME = 'application/hvac-catalog';

export const CATEGORY_ORDER: EquipmentCategory[] = FAMILY_ORDER.flatMap(family => FAMILY_CATEGORIES[family]);
