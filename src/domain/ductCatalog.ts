import type { DuctService, DuctShape, SystemKind } from './types';

const INCH = 0.0254;

export interface DuctCatalogSize {
  id: string;
  widthM: number;
  heightM: number | null;
  label: string;
}

export interface DuctProduct {
  id: string;
  manufacturer: string;
  model: string;
  name: string;
  supplier: string;
  group: 'Round metal' | 'Rectangular' | 'Flexible' | 'Phenolic' | 'Fabric' | 'Grease';
  shape: DuctShape;
  /** Null when the airway is cut to the drawing instead of a published diameter list. */
  sizes: DuctCatalogSize[] | null;
  /** Planning start when sizes is null, inches. */
  defaultWidthIn: number;
  defaultHeightIn: number | null;
  /** ASHRAE absolute roughness, feet. Null when the manufacturer did not state one and no ASHRAE class applies. */
  roughnessFt: number | null;
  roughnessNote: string;
  pressure: string;
  material: string;
  services: DuctService[];
  systemKinds: SystemKind[];
  documentUrl: string | null;
  source: string;
  reviewStatus: 'needs-confirmation';
  gaps: string[];
}

export const DUCT_STREAMS: {
  id: string;
  label: string;
  color: string;
  kind: SystemKind;
  service: DuctService;
}[] = [
  { id: 'kitchen-exhaust', label: 'Kitchen exhaust', color: '#9b2c2c', kind: 'kitchen-exhaust', service: 'exhaust' },
  { id: 'makeup-air', label: 'Make-up air', color: '#0e6e66', kind: 'makeup-air', service: 'supply' },
  { id: 'comfort-supply', label: 'Comfort supply', color: '#1d4e89', kind: 'comfort', service: 'supply' },
  { id: 'comfort-return', label: 'Comfort return', color: '#c47b12', kind: 'comfort', service: 'return' },
  { id: 'comfort-outdoor', label: 'Outdoor air', color: '#2f7d32', kind: 'comfort', service: 'outdoor' },
  { id: 'comfort-relief', label: 'Relief', color: '#7a4a2b', kind: 'comfort', service: 'relief' },
  { id: 'restroom-exhaust', label: 'Restroom exhaust', color: '#6b3d6e', kind: 'restroom-exhaust', service: 'exhaust' },
  { id: 'ventilation-outdoor', label: 'Outdoor air', color: '#2f7d32', kind: 'ventilation', service: 'outdoor' },
  { id: 'ventilation-supply', label: 'Ventilation supply', color: '#1a7a8c', kind: 'ventilation', service: 'supply' },
  { id: 'ventilation-return', label: 'Ventilation return', color: '#5c6b2f', kind: 'ventilation', service: 'return' },
  { id: 'ventilation-exhaust', label: 'Ventilation exhaust', color: '#a33b6b', kind: 'ventilation', service: 'exhaust' },
  { id: 'ventilation-relief', label: 'Relief', color: '#7a4a2b', kind: 'ventilation', service: 'relief' },
];

const HVAC_KINDS: SystemKind[] = ['makeup-air', 'comfort', 'restroom-exhaust', 'ventilation'];
const HVAC_SERVICES: DuctService[] = ['supply', 'return', 'exhaust', 'outdoor', 'relief'];

function inches(values: number[]): DuctCatalogSize[] {
  return values.map(n => ({
    id: String(n),
    widthM: Number((n * INCH).toFixed(4)),
    heightM: null,
    label: `${n} in`,
  }));
}

function steps(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let n = from; n <= to + 1e-6; n += step) values.push(n);
  return values;
}

export const DUCT_CATALOG: DuctProduct[] = [
  {
    id: 'esm-sw-round',
    manufacturer: 'Eastern Sheet Metal',
    model: 'Single-wall round spiral',
    name: 'G90 galvanized single-wall round spiral',
    supplier: 'Eastern Sheet Metal (USA)',
    group: 'Round metal',
    shape: 'round',
    sizes: inches([...steps(3, 30, 1), ...steps(32, 84, 2)]),
    defaultWidthIn: 12,
    defaultHeightIn: null,
    roughnessFt: 0.0003,
    roughnessNote: 'ASHRAE Fundamentals medium-smooth class for galvanized spiral, ε = 0.0003 ft. Eastern does not publish its own roughness.',
    pressure: 'Gauge follows the SMACNA pressure class and diameter on the Eastern single-wall round sheet. Positive-pressure galvanized spiral is listed from 26 ga down to 20 ga.',
    material: 'G90 galvanized steel, ASTM A653. Also offered in paint grip, 304/316 stainless, 3003 aluminum, and Eastern PCS.',
    services: HVAC_SERVICES,
    systemKinds: HVAC_KINDS,
    documentUrl: 'https://www.easternsheetmetal.com/Products2/Single-Wall-Round',
    source: 'Eastern Sheet Metal single-wall round spiral: 1 in increments from 3 in to 30 in, and 2 in increments from 32 in to 84 in.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Roughness is the ASHRAE class for this construction, not a test of this product.',
      'Joint length and corrugation (6 in and larger are corrugated unless ordered plain) change the installed loss.',
    ],
  },
  {
    id: 'smacna-rect-galv',
    manufacturer: 'SMACNA',
    model: 'Rectangular galvanized',
    name: 'Galvanized rectangular duct, shop fabricated',
    supplier: 'Sheet-metal shop to SMACNA HVAC Duct Construction Standards',
    group: 'Rectangular',
    shape: 'rect',
    sizes: null,
    defaultWidthIn: 24,
    defaultHeightIn: 12,
    roughnessFt: 0.0003,
    roughnessNote: 'ASHRAE Fundamentals average/medium-smooth class for galvanized rectangular duct with about 4 ft joints, ε = 0.0003 ft.',
    pressure: 'SMACNA pressure class sets the gauge and reinforcement. It is not a single catalog gauge.',
    material: 'Galvanized steel sheet, fabricated to the internal width and height on the drawing.',
    services: HVAC_SERVICES,
    systemKinds: HVAC_KINDS,
    documentUrl: null,
    source: 'SMACNA HVAC Duct Construction Standards for rectangular galvanized duct. Internal size is the drawing size, not a fixed manufacturer list.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'No single branded size list. A shop fabricates the airway.',
      'Roughness is the ASHRAE class, not a shop test.',
    ],
  },
  {
    id: 'atco-031',
    manufacturer: 'ATCO Rubber Products',
    model: 'UPC #031',
    name: 'Insulated flexible air duct, R-8',
    supplier: 'ATCO Rubber Products, Inc. (Fort Worth, Texas)',
    group: 'Flexible',
    shape: 'round',
    sizes: inches([...steps(3, 10, 1), 12, 14, 16, 18, 20, 22]),
    defaultWidthIn: 8,
    defaultHeightIn: null,
    roughnessFt: 0.003,
    roughnessNote: 'ASHRAE Fundamentals medium-rough class for nonmetallic flexible duct, fully extended, ε = 0.003 ft.',
    pressure: 'UL 181 rated positive pressure 10 in w.g. in a straight length at ambient temperature. ATCO recommended maximum positive pressure is 6 in w.g. for 3–12 in and 4 in w.g. for 14–22 in. Negative rating 0.75 in w.g. Maximum velocity 5,000 fpm.',
    material: 'Double polyester core over a steel wire helix, fiberglass blanket, metallized polyester jacket. R-8.0. Lengths 25 ft and 50 ft.',
    services: ['supply', 'return'],
    systemKinds: ['comfort', 'ventilation', 'makeup-air'],
    documentUrl: 'https://atcoflex.com/wp-content/uploads/2025/04/ATCO-031-Double-ply-polyester-core.-Metallized-Jacket-R8.0.pdf',
    source: 'ATCO #030/#036/#031 sheet: UL 181 Class 1 air duct for indoor supply and return. Diameters 3–10 in, plus 12–22 in even diameters.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Roughness is the ASHRAE class for fully extended nonmetallic flex. Compressed flex needs a pressure-drop correction, which this row does not apply.',
      'The sheet is for supply and return. It is not a grease duct.',
    ],
  },
  {
    id: 'koolduct',
    manufacturer: 'Kingspan',
    model: 'KoolDuct',
    name: 'Pre-insulated phenolic rectangular duct',
    supplier: 'Kingspan Insulation (US/CA system)',
    group: 'Phenolic',
    shape: 'rect',
    sizes: null,
    defaultWidthIn: 24,
    defaultHeightIn: 12,
    roughnessFt: null,
    roughnessNote: 'Kingspan states frictional resistance is comparable with galvanized sheet steel. No absolute roughness is published on the data sheet.',
    pressure: 'UL 181 Class 1 air duct when fabricated to the UL specification. Panel is not a grease duct.',
    material: 'Fiber-free phenolic core, 7/8 in (R-6.0), 1-3/16 in (R-8.1), or 1-25/32 in (R-12), faced both sides with reinforced aluminum foil. Sections up to 13 ft (3.93 m). Panel stock 12.89 ft × 3.94 ft.',
    services: ['supply', 'return', 'exhaust', 'outdoor'],
    systemKinds: HVAC_KINDS,
    documentUrl: 'https://xamyxyg7fn.filerobot.com/kingspan/kil/products/general---us-and-ca/pre-insulated-ductwork/koolduct-liner-system/kingspan-koolduct-koolduct-system-product-data-sheet-en-us.pdf?func=proxy&vh=4446f0',
    source: 'Kingspan KoolDuct product data sheet: rectangular pre-insulated duct, internal sizing like galvanized duct, section length up to 13 ft.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Internal width and height are fabricated. The panel thicknesses are the wall, not the airway.',
      'Absolute roughness is not stated.',
    ],
  },
  {
    id: 'ductsox-cylindrical',
    manufacturer: 'DuctSox',
    model: 'Cylindrical',
    name: 'Fabric air-dispersion duct, cylindrical',
    supplier: 'DuctSox Corporation (USA)',
    group: 'Fabric',
    shape: 'round',
    sizes: inches(steps(8, 60, 2)),
    defaultWidthIn: 16,
    defaultHeightIn: null,
    roughnessFt: null,
    roughnessNote: 'Not stated. Fabric dispersion is not in the ASHRAE galvanized roughness table.',
    pressure: 'Inlet velocity guidance in the DuctSox design manual: about 1,000–1,600 fpm on a straight inlet. Confirm the current series rating.',
    material: 'Polyester fabric cylinder on cable or track. Brochure suspension range 8–60 in diameter.',
    services: ['supply'],
    systemKinds: ['comfort', 'ventilation'],
    documentUrl: 'http://www.vibrangroup.com/wp-content/uploads/2016/03/DuctSox-Full-Line-Brochure.pdf',
    source: 'DuctSox full-line brochure: FTS and Pull-Tight cylindrical systems, 8–60 in diameter. A 2007 design manual listed cylindrical diameters from 6–72 in.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Even-inch sizes from 8 to 60 in follow the published range. Confirm the current diameter list.',
      'Roughness is not stated. This is a supply dispersion duct, not an exhaust or grease duct.',
    ],
  },
  {
    id: 'captiveaire-dw',
    manufacturer: 'CaptiveAire',
    model: 'DW',
    name: 'Single-wall listed grease duct',
    supplier: 'CaptiveAire (USA)',
    group: 'Grease',
    shape: 'round',
    sizes: inches([5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36]),
    defaultWidthIn: 16,
    defaultHeightIn: null,
    roughnessFt: null,
    roughnessNote: 'Not stated on the CaptiveAire listing.',
    pressure: 'ETL listed to UL 1978. Continuous kitchen exhaust. 20 gauge is the standard wall and 18 gauge is the maximum allowed by this listing. Clearance to combustibles is 18 in for the diameters in the installation manual table.',
    material: '430 stainless steel, single wall, factory built. Not field-welded galvanized duct.',
    services: ['exhaust'],
    systemKinds: ['kitchen-exhaust'],
    documentUrl: 'https://www.captiveaire.com/manuals/ductwork/ductwork-oim.pdf',
    source: 'CaptiveAire DW installation manual (March 2025): UL 1978 listing for diameters 4–36 in. Clearance table lists 5–36 in. An older flier listed 8–24 in stock diameters.',
    reviewStatus: 'needs-confirmation',
    gaps: [
      'Absolute roughness is not stated.',
      'NFPA 96 welded 16 gauge carbon steel is a different grease-duct construction and is not this listed product.',
    ],
  },
];

const BY_ID = new Map(DUCT_CATALOG.map(item => [item.id, item]));

export function getDuctProduct(id: string): DuctProduct | undefined {
  return BY_ID.get(id);
}

export function streamFor(kind: SystemKind, service: DuctService) {
  return DUCT_STREAMS.find(item => item.kind === kind && item.service === service) ?? null;
}

export function servicesFor(product: DuctProduct, kind: SystemKind): DuctService[] {
  if (!product.systemKinds.includes(kind)) return [];
  const streamServices = DUCT_STREAMS.filter(item => item.kind === kind).map(item => item.service);
  return product.services.filter(service => streamServices.includes(service));
}

export function ductPairAllowed(product: DuctProduct, kind: SystemKind, service: DuctService): boolean {
  return servicesFor(product, kind).includes(service);
}

export function systemsForProduct<T extends { id: string; kind: SystemKind }>(product: DuctProduct, systems: readonly T[]): T[] {
  return systems.filter(system => product.systemKinds.includes(system.kind) && servicesFor(product, system.kind).length > 0);
}

export function roughnessLabel(product: DuctProduct): string {
  if (product.roughnessFt == null) return 'Not stated';
  return `ε ${product.roughnessFt} ft`;
}

export function streamLabels(product: DuctProduct): string {
  return DUCT_STREAMS.filter(stream => product.systemKinds.includes(stream.kind) && product.services.includes(stream.service))
    .map(stream => stream.label)
    .join(', ');
}

export function sizeSummary(product: DuctProduct): string {
  if (!product.sizes || product.sizes.length === 0) {
    return product.shape === 'rect' ? 'Internal width × height, fabricated' : 'Diameter fabricated';
  }
  const first = product.sizes[0]?.label;
  const last = product.sizes[product.sizes.length - 1]?.label;
  return first && last ? `${first} – ${last}` : 'Published list';
}
