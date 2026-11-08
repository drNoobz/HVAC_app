export type EquipmentCategory =
  | 'kitchen-hood'
  | 'exhaust-fan'
  | 'makeup-air'
  | 'bathroom-exhaust'
  | 'heating-cooling'
  | 'energy-recovery';

export type EquipmentMount = 'ceiling' | 'roof' | 'grade';

export interface StatedQuantity {
  /** The text the demo catalog states. Not a verified submittal. */
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
  'HVAC Project Planner demo catalog, stage 1. Fictional representative products for workflow demonstration. Not manufacturer submittals.';

export const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  'kitchen-hood': 'Kitchen hood',
  'exhaust-fan': 'Exhaust fan',
  'makeup-air': 'Make-up air',
  'bathroom-exhaust': 'Bathroom exhaust',
  'heating-cooling': 'Heating and cooling',
  'energy-recovery': 'Energy recovery',
};

const SUPPLIER = 'Atlas Demo Supply';

function flow(statedCfm: number): FlowSpec {
  return {
    stated: `${statedCfm} CFM`,
    status: 'assumption',
    valueM3s: statedCfm * 0.0004719474432,
  };
}

function tons(statedTons: number): PowerSpec {
  return {
    stated: `${statedTons} ton`,
    status: 'assumption',
    valueW: statedTons * 3516.85,
  };
}

function kBtu(stated: number): PowerSpec {
  return {
    stated: `${stated} kBtu/h`,
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

export const CATALOG: CatalogProduct[] = [
  {
    id: 'hood-wall-8',
    manufacturer: 'Hearthline Hoods',
    model: 'HL-W-8',
    name: 'Type I wall canopy hood',
    category: 'kitchen-hood',
    supplier: SUPPLIER,
    mount: 'ceiling',
    dimensions: feet(8, 4, 2),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Grease duct assumed. Duct size not stated.',
    documentUrl: null,
    image: null,
    source: CATALOG_SOURCE,
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Airflow not stated. It depends on the appliance line and is not calculated here.',
      'Electrical requirements not stated.',
      'No product document.',
      'No product image.',
    ],
  },
  {
    id: 'hood-island-10',
    manufacturer: 'Hearthline Hoods',
    model: 'HL-I-10',
    name: 'Type I island canopy hood',
    category: 'kitchen-hood',
    supplier: SUPPLIER,
    mount: 'ceiling',
    dimensions: feet(10, 5, 2),
    airflow: null,
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Grease duct assumed. Duct size not stated.',
    documentUrl: null,
    image: null,
    source: CATALOG_SOURCE,
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Airflow not stated. It depends on the appliance line and is not calculated here.',
      'Electrical requirements not stated.',
      'No product document.',
      'No product image.',
    ],
  },
  {
    id: 'fan-upblast-30',
    manufacturer: 'Northair Ventilation',
    model: 'NV-UB-30',
    name: 'Upblast exhaust fan',
    category: 'exhaust-fan',
    supplier: SUPPLIER,
    mount: 'roof',
    dimensions: null,
    airflow: flow(3000),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Roof curb and grease duct assumed. Sizes not stated.',
    documentUrl: null,
    image: null,
    source: CATALOG_SOURCE,
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Airflow is a planning assumption, not a fan selection.',
      'Dimensions not stated. The model uses a 0.6 m marker.',
      'Electrical requirements not stated.',
      'Static pressure not stated.',
      'No product document.',
      'No product image.',
    ],
  },
  {
    id: 'fan-inline-8',
    manufacturer: 'Northair Ventilation',
    model: 'NV-IL-8',
    name: 'Inline exhaust fan',
    category: 'exhaust-fan',
    supplier: SUPPLIER,
    mount: 'ceiling',
    dimensions: null,
    airflow: flow(800),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Round duct assumed. Diameter not stated.',
    documentUrl: null,
    image: null,
    source: CATALOG_SOURCE,
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Airflow is a planning assumption, not a fan selection.',
      'Dimensions not stated. The model uses a 0.6 m marker.',
      'Electrical requirements not stated.',
      'No product document.',
      'No product image.',
    ],
  },
  {
    id: 'mau-40',
    manufacturer: 'Northair Ventilation',
    model: 'NV-MA-40',
    name: 'Make-up air unit',
    category: 'makeup-air',
    supplier: SUPPLIER,
    mount: 'roof',
    dimensions: null,
    airflow: flow(4000),
    cooling: null,
    heating: kBtu(250),
    electrical: null,
    connections: 'Outdoor air intake and supply duct assumed. Heat source (gas or electric) not confirmed.',
    documentUrl: null,
    image: null,
    source: CATALOG_SOURCE,
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Airflow and heating capacity are planning assumptions, not a load calculation.',
      'Cooling capacity not stated.',
      'Dimensions not stated. The model uses a 0.6 m marker.',
      'Electrical and fuel requirements not stated.',
      'No product document.',
      'No product image.',
    ],
  },
  {
    id: 'bath-fan-150',
    manufacturer: 'Northair Ventilation',
    model: 'NV-BF-150',
    name: 'Ceiling exhaust fan',
    category: 'bathroom-exhaust',
    supplier: SUPPLIER,
    mount: 'ceiling',
    dimensions: {
      stated: '12 in × 12 in × 8 in',
      status: 'assumption',
      lengthM: 0.3048,
      widthM: 0.3048,
      heightM: 0.2032,
    },
    airflow: flow(150),
    cooling: null,
    heating: null,
    electrical: 'Assumption: 120 V, 1 phase. Confirm on a submittal.',
    connections: 'Round duct assumed. Diameter not stated.',
    documentUrl: null,
    image: null,
    source: CATALOG_SOURCE,
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Airflow is a planning assumption.',
      'No product document.',
      'No product image.',
    ],
  },
  {
    id: 'rtu-12',
    manufacturer: 'Fieldline Mechanical',
    model: 'FL-RTU-12',
    name: 'Packaged rooftop unit',
    category: 'heating-cooling',
    supplier: SUPPLIER,
    mount: 'roof',
    dimensions: null,
    airflow: flow(4000),
    cooling: tons(12),
    heating: kBtu(200),
    electrical: null,
    connections: 'Supply and return ducts assumed. Curb size not stated.',
    documentUrl: null,
    image: null,
    source: CATALOG_SOURCE,
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Cooling, heating, and airflow are planning assumptions, not a load calculation.',
      'Dimensions not stated. The model uses a 0.6 m marker.',
      'Electrical requirements not stated.',
      'No product document.',
      'No product image.',
    ],
  },
  {
    id: 'rtu-75',
    manufacturer: 'Fieldline Mechanical',
    model: 'FL-RTU-75',
    name: 'Packaged rooftop unit',
    category: 'heating-cooling',
    supplier: SUPPLIER,
    mount: 'roof',
    dimensions: null,
    airflow: flow(3000),
    cooling: tons(7.5),
    heating: null,
    electrical: null,
    connections: 'Supply and return ducts assumed. Heat source not stated.',
    documentUrl: null,
    image: null,
    source: CATALOG_SOURCE,
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Cooling and airflow are planning assumptions, not a load calculation.',
      'Heating capacity not stated.',
      'Dimensions not stated. The model uses a 0.6 m marker.',
      'Electrical requirements not stated.',
      'No product document.',
      'No product image.',
    ],
  },
  {
    id: 'erv-20',
    manufacturer: 'Fieldline Mechanical',
    model: 'FL-ERV-20',
    name: 'Energy recovery ventilator',
    category: 'energy-recovery',
    supplier: SUPPLIER,
    mount: 'roof',
    dimensions: null,
    airflow: flow(2000),
    cooling: null,
    heating: null,
    electrical: null,
    connections: 'Outdoor, exhaust, supply, and return ducts assumed. Sizes not stated.',
    documentUrl: null,
    image: null,
    source: CATALOG_SOURCE,
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Airflow is a planning assumption.',
      'Sensible and latent effectiveness not stated.',
      'Dimensions not stated. The model uses a 0.6 m marker.',
      'Electrical requirements not stated.',
      'No product document.',
      'No product image.',
    ],
  },
  {
    id: 'cu-5',
    manufacturer: 'Fieldline Mechanical',
    model: 'FL-CU-5',
    name: 'Air-cooled condensing unit',
    category: 'heating-cooling',
    supplier: SUPPLIER,
    mount: 'grade',
    dimensions: feet(3, 1, 2.5, 'Planning envelope 3 ft × 1 ft × 2.5 ft'),
    airflow: null,
    cooling: tons(5),
    heating: null,
    electrical: null,
    connections: 'Refrigerant line set assumed. Sizes not stated.',
    documentUrl: null,
    image: null,
    source: CATALOG_SOURCE,
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Cooling capacity is a planning assumption, not a load calculation.',
      'The footprint is a planning envelope, not a certified outline.',
      'Matched indoor unit not stated.',
      'Airflow not stated.',
      'Electrical requirements not stated.',
      'No product document.',
      'No product image.',
    ],
  },
];

const BY_ID = new Map(CATALOG.map(item => [item.id, item]));

export function getProduct(id: string): CatalogProduct | undefined {
  return BY_ID.get(id);
}

export const CATEGORY_ORDER: EquipmentCategory[] = [
  'kitchen-hood',
  'exhaust-fan',
  'makeup-air',
  'bathroom-exhaust',
  'heating-cooling',
  'energy-recovery',
];
