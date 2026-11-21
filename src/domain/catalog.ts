export type EquipmentCategory =
  | 'kitchen-hood'
  | 'exhaust-fan'
  | 'makeup-air'
  | 'bathroom-exhaust'
  | 'system-equipment'
  | 'heating-cooling'
  | 'energy-recovery';

/** Top-level catalog family. Add families here when the library grows. */
export type EquipmentFamily = 'space' | 'system';

export type EquipmentMount = 'ceiling' | 'roof' | 'grade';

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
};

export const FAMILY_LABEL: Record<EquipmentFamily, string> = {
  space: 'Space equipment',
  system: 'System equipment',
};

export const FAMILY_ORDER: EquipmentFamily[] = ['space', 'system'];

/** Categories under each family. Subdivide by appending here later. */
export const FAMILY_CATEGORIES: Record<EquipmentFamily, EquipmentCategory[]> = {
  space: ['kitchen-hood', 'exhaust-fan', 'makeup-air', 'bathroom-exhaust'],
  system: ['system-equipment', 'heating-cooling', 'energy-recovery'],
};

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
];

const BY_ID = new Map(CATALOG.map(item => [item.id, item]));

/** Planning marker when a catalog product does not state dimensions. */
export const FALLBACK_EQUIPMENT_SIZE_M = { lengthM: 0.6, widthM: 0.6, heightM: 0.6 } as const;

export function getProduct(id: string): CatalogProduct | undefined {
  return BY_ID.get(id);
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
