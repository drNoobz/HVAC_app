export type LoadCategory = 'people' | 'cooking' | 'refrigeration' | 'warewashing' | 'lighting' | 'plug';

/** Per person, per appliance, or per m² of the host space. */
export type LoadBasis = 'person' | 'unit' | 'area';

export type LoadFuel = 'electric' | 'gas' | 'solid';

export interface LoadProduct {
  id: string;
  category: LoadCategory;
  group: string;
  name: string;
  basis: LoadBasis;
  fuel: LoadFuel | null;
  /** True when the tabulated value assumes a hood or duct captures the plume. Null when not applicable. */
  hooded: boolean | null;
  /** Rated input, W. Null when the source lists none. */
  ratedW: number | null;
  /** Idle (ready-to-cook) input, W. */
  standbyW: number | null;
  /** Sensible heat gain to the space per basis unit, W. */
  sensibleW: number;
  /** Radiant part of sensibleW, W. Null when the source gives no split. */
  radiantW: number | null;
  latentW: number;
  /** Food allowance already inside the people values, W. Excluded from metabolic CO2. */
  foodW?: number;
  source: string;
  note: string;
  /** Plan size stated by the source. A null side was not stated. */
  size: { lengthM: number | null; widthM: number | null; heightM: number | null; note: string } | null;
}

export const LOAD_CATEGORY_LABEL: Record<LoadCategory, string> = {
  people: 'People',
  cooking: 'Cooking',
  refrigeration: 'Refrigeration',
  warewashing: 'Dishwashing',
  lighting: 'Lighting',
  plug: 'Office and plug loads',
};

export const LOAD_CATEGORY_ORDER: LoadCategory[] = ['people', 'cooking', 'warewashing', 'refrigeration', 'lighting', 'plug'];

export const LOAD_CATEGORY_COLOR: Record<LoadCategory, string> = {
  people: '#2f5f8a',
  cooking: '#b4532a',
  warewashing: '#2b7a8c',
  refrigeration: '#4f6fb0',
  lighting: '#a07a12',
  plug: '#6b5b8a',
};

const F25 = 'ASHRAE Handbook—Fundamentals 2025 (SI), Ch. 18';
const PEOPLE_NOTE = 'Adjusted M/F values at 23.9 °C room dry bulb. At 26.7 °C, sensible drops about 20% and latent rises by the same amount.';
const HOODED_NOTE = 'Idle (ready-to-cook). Only sensible radiant heat reaches the space under a properly operating hood.';
const UNHOODED_NOTE = 'Idle (ready-to-cook), unhooded. Radiant, convective, and latent heat all reach the space.';
const WARE_NOTE = 'Peak values during continuous rinsing or washing. Rinse and wash usually run 1 to 3 hours after each meal period.';
const LPD_NOTE = 'Maximum lighting power density allowance from ASHRAE 90.1-2022 Table 9.5.2.1-1, not an installed value. Use installed watts when known. Use factor and allowance factor taken as 1.';

function people(id: string, name: string, location: string, sensibleW: number, latentW: number, foodW?: number): LoadProduct {
  return {
    id,
    category: 'people',
    group: location,
    name,
    basis: 'person',
    fuel: null,
    hooded: null,
    ratedW: null,
    standbyW: null,
    sensibleW,
    radiantW: null,
    latentW,
    ...(foodW ? { foodW } : {}),
    source: `${F25}, Table 4`,
    note: foodW ? `${PEOPLE_NOTE} Includes ${foodW} W for food per person.` : PEOPLE_NOTE,
    size: null,
  };
}

function hooded(id: string, fuel: LoadFuel, name: string, ratedW: number | null, standbyW: number, radiantW: number, table: string): LoadProduct {
  return {
    id,
    category: 'cooking',
    group: fuel === 'gas' ? 'Gas, hooded' : fuel === 'solid' ? 'Solid fuel, hooded' : 'Electric, hooded',
    name,
    basis: 'unit',
    fuel,
    hooded: true,
    ratedW,
    standbyW,
    sensibleW: radiantW,
    radiantW,
    latentW: 0,
    source: `${F25}, Table ${table}`,
    note: HOODED_NOTE,
    size: null,
  };
}

function unhooded(
  id: string,
  category: LoadCategory,
  group: string,
  name: string,
  ratedW: number,
  standbyW: number,
  radiantW: number,
  convectiveW: number,
  latentW: number,
): LoadProduct {
  return {
    id,
    category,
    group,
    name,
    basis: 'unit',
    fuel: 'electric',
    hooded: false,
    ratedW,
    standbyW,
    sensibleW: radiantW + convectiveW,
    radiantW,
    latentW,
    source: `${F25}, Table 8A`,
    note: UNHOODED_NOTE,
    size: null,
  };
}

function ware(id: string, name: string, convectiveW: number, latentW: number, captured: boolean): LoadProduct {
  return {
    id,
    category: 'warewashing',
    group: captured ? 'Hooded or ducted' : 'Unhooded',
    name,
    basis: 'unit',
    fuel: 'electric',
    hooded: captured,
    ratedW: null,
    standbyW: null,
    sensibleW: convectiveW,
    radiantW: 0,
    latentW,
    source: `${F25}, Table 8F`,
    note: captured ? `${WARE_NOTE} Only the part not captured by the hood or duct is listed.` : WARE_NOTE,
    size: null,
  };
}

function lighting(id: string, name: string, lpd: number): LoadProduct {
  return {
    id,
    category: 'lighting',
    group: 'Lighting power density',
    name,
    basis: 'area',
    fuel: 'electric',
    hooded: null,
    ratedW: null,
    standbyW: null,
    sensibleW: lpd,
    radiantW: null,
    latentW: 0,
    source: `${F25}, Table 5`,
    note: LPD_NOTE,
    size: null,
  };
}

function plug(
  id: string,
  category: LoadCategory,
  group: string,
  name: string,
  basis: 'unit' | 'area',
  sensibleW: number,
  radiantShare: number | null,
  table: string,
  note: string,
): LoadProduct {
  return {
    id,
    category,
    group,
    name,
    basis,
    fuel: 'electric',
    hooded: null,
    ratedW: null,
    standbyW: null,
    sensibleW,
    radiantW: radiantShare == null ? null : Math.round(sensibleW * radiantShare * 10) / 10,
    latentW: 0,
    source: `${F25}, Table ${table}`,
    note,
    size: null,
  };
}

/** One stated plan length. The other sides are left empty. */
function statedLength(product: LoadProduct, lengthM: number, stated: string): LoadProduct {
  return { ...product, size: { lengthM, widthM: null, heightM: null, note: `${stated} Depth and height are not stated.` } };
}

const INCH = 0.0254;

type PlanBox = { w: number; d: number; h: number; source: string };

function box(w: number, d: number, h: number, source: string): PlanBox {
  return { w, d, h, source };
}

/** Representative published sizes. Length along the front, then depth, then height, in inches. */
const PLANNING: Record<string, PlanBox> = {
  'cook-e-cheesemelter': box(36.5, 17.125, 19.25, 'Vulcan 1036 electric cheesemelter, 36.5 × 17.125 × 19.25 in.'),
  'cook-e-salamander': box(36, 19, 21, 'Vulcan VICM36 gas cheesemelter class, 36 × 19 × 21 in.'),
  'cook-g-salamander': box(36, 19, 21, 'Vulcan VICM36 gas cheesemelter class, 36 × 19 × 21 in.'),
  'cook-e-fryer-open': box(15.5, 30.75, 46.125, 'Dean 1PRG50T 50 lb floor fryer, 15.5 × 30.75 × 46.125 in.'),
  'cook-g-fryer-open': box(15.5, 30.75, 46.125, 'Dean 1PRG50T 50 lb floor fryer, 15.5 × 30.75 × 46.125 in.'),
  'cook-e-fryer-pressure': box(15.5, 30.75, 46.125, 'Open-vat floor fryer envelope (Dean 1PRG50T). A pressure fryer is often a similar footprint.'),
  'cook-g-fryer-pressure': box(15.5, 30.75, 46.125, 'Open-vat floor fryer envelope (Dean 1PRG50T). A pressure fryer is often a similar footprint.'),
  'cook-e-pasta': box(15.5, 30.75, 46.125, 'Single-vat floor fryer envelope (Dean 1PRG50T), used for a pasta cooker.'),
  'cook-g-pasta': box(15.5, 30.75, 46.125, 'Single-vat floor fryer envelope (Dean 1PRG50T), used for a pasta cooker.'),
  'cook-e-induction': box(36, 30, 8, 'Planning envelope for a 36 in countertop induction top.'),
  'cook-e-combi': box(33.5, 33.125, 41.875, 'Rational iCombi Classic 10-half size, 33.5 × 33.125 × 41.875 in overall.'),
  'cook-g-combi': box(33.5, 33.125, 41.875, 'Rational iCombi Classic 10-half size, 33.5 × 33.125 × 41.875 in overall.'),
  'cook-e-convection': box(38.25, 36.875, 57, 'Blodgett Zephaire-100-E full-size single deck, 38.25 × 36.875 × 57 in.'),
  'cook-g-convection': box(38.25, 36.875, 57, 'Blodgett Zephaire-100-E full-size single deck, 38.25 × 36.875 × 57 in.'),
  'cook-g-pizza-conveyor': box(48, 36, 42, 'Planning envelope for a single-deck conveyor pizza oven.'),
  'cook-g-deck': box(54, 42, 60, 'Planning envelope for a single deck oven.'),
  'cook-e-range-6': box(36, 31.5, 56.5, 'Imperial IR-6 36 in restaurant range, 36 × 31.5 × 56.5 in.'),
  'cook-g-range-6': box(36, 31.5, 56.5, 'Imperial IR-6 36 in restaurant range, 36 × 31.5 × 56.5 in.'),
  'cook-e-hot-top': box(36, 31.5, 56.5, 'Imperial IR-6 range body, used for a 36 in hot-top.'),
  'cook-g-wok': box(18, 31.5, 36, 'Planning envelope for one wok chamber, half the width of a 36 in range.'),
  'cook-e-rotisserie': box(36, 30, 60, 'Planning envelope for a floor rotisserie.'),
  'cook-e-steamer': box(24, 33, 64, 'Planning envelope for a two-compartment floor steamer.'),
  'cook-e-skillet': box(46, 35.5, 40.5, 'Vulcan VG40 40 gal tilting braising pan, 46 × 35.5 × 40.5 in.'),
  'cook-g-skillet': box(46, 35.5, 40.5, 'Vulcan VG40 40 gal tilting braising pan, 46 × 35.5 × 40.5 in.'),
  'cook-g-kettle': box(32, 32, 42, 'Planning envelope for a medium floor steam kettle of about 150 L.'),
  'cook-g-broiler-chain': box(36, 36, 48, 'Planning envelope for a conveyor chain broiler.'),
  'cook-s-charcoal': box(36, 31.5, 36, 'Planning envelope for a 36 in solid-fuel broiler.'),
  'cook-s-mesquite': box(36, 31.5, 36, 'Planning envelope for a 36 in solid-fuel broiler.'),
  'cook-e-broiler-underfired': box(36, 31.5, 36, 'Planning depth and height for a 36 in underfired broiler. Length stays the ASHRAE 900 mm.'),
  'cook-g-broiler-underfired': box(36, 31.5, 36, 'Planning depth and height for a 36 in underfired broiler. Length stays the ASHRAE 900 mm.'),
  'cook-e-griddle-flat': box(36, 31.5, 15.25, 'Vulcan VMG36 depth 31.5 in and height 15.25 in. Length stays the ASHRAE 900 mm.'),
  'cook-g-griddle-flat': box(36, 31.5, 15.25, 'Vulcan VMG36 depth 31.5 in and height 15.25 in. Length stays the ASHRAE 900 mm.'),
  'cook-u-cheesemelter': box(27, 17.125, 19.25, 'Vulcan 1024 countertop cheesemelter, 27 × 17.125 × 19.25 in.'),
  'cook-u-coffee-urn': box(16, 18, 28, 'Planning envelope for a countertop coffee urn.'),
  'cook-u-espresso': box(14, 22, 21, 'Planning envelope for a two-group espresso machine.'),
  'cook-u-steam-table': box(32, 24, 34, 'Planning envelope for a two-well steam table.'),
  'cook-u-fryer': box(16, 22, 17, 'Planning envelope for a countertop fryer.'),
  'cook-u-griddle': box(36, 31.5, 15.25, 'Vulcan VMG36 countertop griddle, 36 × 31.5 × 15.25 in.'),
  'cook-u-hot-case': box(48, 28, 54, 'Planning envelope for a moist hot-food case.'),
  'cook-u-microwave': box(22, 20, 18, 'Planning envelope for a commercial microwave.'),
  'cook-u-conveyor-oven': box(48, 22, 18, 'Planning envelope for a countertop conveyor oven.'),
  'cook-u-panini': box(17, 15, 9, 'Planning envelope for a panini grill.'),
  'cook-u-rapid': box(16, 24, 20, 'Planning envelope for a countertop rapid-cook oven.'),
  'cook-u-rice': box(14, 14, 14, 'Planning envelope for a commercial rice cooker.'),
  'cook-u-soup': box(12, 14, 13, 'Planning envelope for a soup warmer.'),
  'cook-u-toaster': box(18, 22, 16, 'Planning envelope for a large conveyor toaster.'),
  'cook-u-tortilla': box(24, 18, 8, 'Planning envelope for a countertop tortilla grill.'),
  'ware-sink-3': box(90, 24, 43, 'Advance Tabco FC-3-1818-18RL three-compartment sink, 90 × 24 × 43 in.'),
  'ware-uc-low': box(23.94, 25.56, 32.5, 'Hobart LXe undercounter dishmachine, about 23.94 × 25.56 × 32.5 in.'),
  'ware-uc-high': box(23.94, 25.56, 32.5, 'Hobart LXe undercounter dishmachine, about 23.94 × 25.56 × 32.5 in.'),
  'ware-door-high': box(28.5, 32.08, 62.95, 'Hobart CDH door-type dishmachine, 28.5 × 32.08 × 62.95 in.'),
  'ware-door-high-hr': box(28.5, 32.08, 62.95, 'Hobart CDH door-type body. Heat recovery can add a module.'),
  'ware-door-hood': box(28.5, 32.08, 62.95, 'Hobart CDH door-type body. The 0.9 m figure in the name is the hood.'),
  'ware-potpan': box(28.5, 32.08, 62.95, 'Door-type dishmachine envelope (Hobart CDH). A dedicated pot washer is often wider.'),
  'ware-conveyor-1120': box(44.75, 31.25, 68.5, 'Hobart CL44eN-BAS depth 31.25 in and height 68.5 in. Length stays the ASHRAE 1120 mm.'),
  'ware-conveyor-hood': box(44.75, 31.25, 68.5, 'Hobart CL44eN-BAS depth and height. Length stays the ASHRAE 1120 mm.'),
  'ware-conveyor-ducted': box(66, 31.25, 68.5, 'Hobart CL44eN-BAS depth and height. Length stays the ASHRAE 1680 mm.'),
  'fridge-reach-in': box(27, 29.5, 78.375, 'True T-23-HC one-door reach-in, 27 × 29.5 × 78.375 in, casters not included.'),
  'fridge-prep': box(48.375, 30.125, 36.75, 'True TSSU-48-12-HC prep table, 48.375 × 30.125 × 36.75 in, casters not included.'),
  'fridge-freezer-small': box(27, 29.5, 78.375, 'True T-23-HC cabinet, used for a one-door reach-in freezer. Casters not included.'),
  'fridge-ice': box(19.69, 22.34, 36, 'Manitowoc UDP0080 undercounter cuber, 19.69 × 22.34 × 36 in. Bin holds about 14 kg.'),
  'fridge-510': box(27, 24.5, 75.25, 'True T-19-HC reach-in, 27 × 24.5 × 75.25 in, used for a refrigerator near 510 L.'),
  'fridge-vending': box(39, 33, 72, 'Planning envelope for a glass-front drinks vendor.'),
  'plug-desktop': box(7, 15, 14, 'Planning envelope for a desktop tower.'),
  'plug-monitor': box(21, 8, 16, 'Planning envelope for a 24 in monitor on a stand.'),
  'plug-laptop': box(13, 9, 8, 'Planning envelope for an open 14 in laptop.'),
  'plug-mfp': box(26, 26, 48, 'Planning envelope for a floor-standing multifunction printer.'),
  'plug-pos': box(15, 16, 14, 'Planning envelope for a touch-screen POS terminal.'),
  'plug-register': box(16, 17, 12, 'Planning envelope for a cash register.'),
  'plug-microwave': box(22, 18, 13, 'Planning envelope for a microwave of about 25 to 34 L.'),
  'plug-coffee': box(10, 8, 14, 'Planning envelope for a 12-cup coffee maker.'),
};

function withPlanning(items: LoadProduct[]): LoadProduct[] {
  return items.map(item => {
    const plan = PLANNING[item.id];
    if (!plan) return item;
    const keptLength = item.size?.lengthM ?? null;
    return {
      ...item,
      size: {
        lengthM: keptLength ?? Math.round(plan.w * INCH * 1000) / 1000,
        widthM: Math.round(plan.d * INCH * 1000) / 1000,
        heightM: Math.round(plan.h * INCH * 1000) / 1000,
        note: keptLength != null ? `Length is the figure in the ASHRAE name. ${plan.source}` : `Planning assumption, not an ASHRAE dimension. ${plan.source}`,
      },
    };
  });
}

export const LOAD_CATALOG: LoadProduct[] = withPlanning([
  people('people-restaurant', 'Diners, sedentary', 'Restaurant', 81, 81, 18),
  people('people-theater', 'Seated at theater', 'Theater', 72, 31),
  people('people-seated-light', 'Seated, very light work', 'Offices, hotels, apartments', 72, 45),
  people('people-office', 'Moderately active office work', 'Offices, hotels, apartments', 73, 59),
  people('people-standing', 'Standing, light work; walking', 'Department store, retail store', 73, 59),
  people('people-walking', 'Walking, standing', 'Drug store, bank', 73, 73),
  people('people-bench', 'Light bench work', 'Factory', 81, 139),
  people('people-machine', 'Walking 3 mph; light machine work', 'Factory', 110, 183),
  people('people-heavy', 'Heavy work', 'Factory', 170, 255),

  statedLength(hooded('cook-e-broiler-underfired', 'electric', 'Broiler, underfired 900 mm', 10814, 9056, 3165, '8C'), 0.9, 'ASHRAE names this broiler as 900 mm.'),
  hooded('cook-e-cheesemelter', 'electric', 'Cheesemelter', 3605, 3488, 1348, '8C'),
  hooded('cook-e-fryer-open', 'electric', 'Fryer, open deep-fat, 1 vat', 14008, 821, 293, '8C'),
  hooded('cook-e-fryer-pressure', 'electric', 'Fryer, pressure', 13511, 791, 147, '8C'),
  statedLength(hooded('cook-e-griddle-flat', 'electric', 'Griddle, flat 900 mm', 17115, 3370, 1319, '8C'), 0.9, 'ASHRAE names this griddle as 900 mm.'),
  hooded('cook-e-induction', 'electric', 'Induction cooktop', 21013, 0, 0, '8C'),
  hooded('cook-e-combi', 'electric', 'Oven, combi (convection mode)', 16412, 1612, 410, '8C'),
  hooded('cook-e-convection', 'electric', 'Oven, convection full-size', 12103, 1964, 440, '8C'),
  hooded('cook-e-pasta', 'electric', 'Pasta cooker', 22010, 2491, 0, '8C'),
  hooded('cook-e-range-6', 'electric', 'Range top, 6 elements on, oven off', 15005, 9730, 4074, '8C'),
  hooded('cook-e-hot-top', 'electric', 'Range, hot-top', 15826, 15035, 3458, '8C'),
  hooded('cook-e-rotisserie', 'electric', 'Rotisserie', 11107, 4044, 1319, '8C'),
  hooded('cook-e-salamander', 'electric', 'Salamander', 7004, 6829, 2051, '8C'),
  hooded('cook-e-steamer', 'electric', 'Steamer, compartment, atmospheric', 9789, 4484, 59, '8C'),
  hooded('cook-e-skillet', 'electric', 'Tilting skillet / braising pan', 9642, 1553, 0, '8C'),

  hooded('cook-g-broiler-chain', 'gas', 'Broiler, chain (conveyor)', 38685, 28340, 3869, '8D'),
  statedLength(hooded('cook-g-broiler-underfired', 'gas', 'Broiler, underfired 900 mm', 28135, 21658, 2638, '8D'), 0.9, 'ASHRAE names this broiler as 900 mm.'),
  hooded('cook-g-fryer-open', 'gas', 'Fryer, open deep-fat, 1 vat', 23446, 1377, 322, '8D'),
  hooded('cook-g-fryer-pressure', 'gas', 'Fryer, pressure', 23446, 2638, 234, '8D'),
  statedLength(hooded('cook-g-griddle-flat', 'gas', 'Griddle, flat 900 mm', 26376, 5979, 1084, '8D'), 0.9, 'ASHRAE names this griddle as 900 mm.'),
  hooded('cook-g-combi', 'gas', 'Oven, combi (convection mode)', 22185, 1700, 293, '8D'),
  hooded('cook-g-convection', 'gas', 'Oven, convection full-size', 12895, 3488, 293, '8D'),
  hooded('cook-g-pizza-conveyor', 'gas', 'Oven, conveyor (pizza)', 49822, 20017, 2286, '8D'),
  hooded('cook-g-deck', 'gas', 'Oven, deck', 30772, 6008, 1026, '8D'),
  hooded('cook-g-pasta', 'gas', 'Pasta cooker', 23446, 6946, 0, '8D'),
  hooded('cook-g-range-6', 'gas', 'Range top, 6 burners on, oven off', 35169, 35403, 3370, '8D'),
  hooded('cook-g-wok', 'gas', 'Range, wok', 29014, 25614, 1524, '8D'),
  hooded('cook-g-salamander', 'gas', 'Salamander', 10257, 9759, 1553, '8D'),
  hooded('cook-g-kettle', 'gas', 'Steam kettle, medium (150 L), simmer lid down', 29307, 1260, 0, '8D'),
  hooded('cook-g-skillet', 'gas', 'Tilting skillet / braising pan', 30479, 3048, 117, '8D'),

  hooded('cook-s-charcoal', 'solid', 'Broiler, charcoal (18 kg)', null, 12309, 1817, '8E'),
  hooded('cook-s-mesquite', 'solid', 'Broiler, wood mesquite (18 kg)', null, 14536, 2051, '8E'),

  unhooded('cook-u-cheesemelter', 'cooking', 'Electric, unhooded', 'Cheesemelter, countertop', 2400, 976, 443, 533, 0),
  unhooded('cook-u-coffee-urn', 'cooking', 'Electric, unhooded', 'Coffee brewing urn', 3810, 352, 59, 88, 205),
  unhooded('cook-u-espresso', 'cooking', 'Electric, unhooded', 'Espresso machine', 2403, 352, 117, 234, 0),
  unhooded('cook-u-steam-table', 'cooking', 'Electric, unhooded', 'Food warmer, steam table (2-well)', 1495, 1026, 88, 176, 762),
  unhooded('cook-u-fryer', 'cooking', 'Electric, unhooded', 'Fryer, countertop, open deep fat', 4600, 431, 202, 229, 0),
  unhooded('cook-u-griddle', 'cooking', 'Electric, unhooded', 'Griddle, countertop', 8000, 1771, 848, 923, 0),
  unhooded('cook-u-hot-case', 'cooking', 'Electric, unhooded', 'Hot-food case (moist holding)', 9115, 967, 264, 528, 176),
  unhooded('cook-u-microwave', 'cooking', 'Electric, unhooded', 'Microwave oven, commercial', 1700, 0, 0, 0, 0),
  unhooded('cook-u-conveyor-oven', 'cooking', 'Electric, unhooded', 'Oven, countertop conveyorized bake/finishing', 5000, 3932, 718, 3214, 0),
  unhooded('cook-u-panini', 'cooking', 'Electric, unhooded', 'Panini grill', 1800, 673, 195, 478, 0),
  unhooded('cook-u-rapid', 'cooking', 'Electric, unhooded', 'Rapid-cook oven (microwave/convection)', 5700, 1141, 96, 1045, 0),
  unhooded('cook-u-rice', 'cooking', 'Electric, unhooded', 'Rice cooker', 1550, 82, 14, 68, 0),
  unhooded('cook-u-soup', 'cooking', 'Electric, unhooded', 'Soup warmer', 800, 390, 0, 53, 337),
  unhooded('cook-u-toaster', 'cooking', 'Electric, unhooded', 'Toaster, conveyor (large)', 9613, 3019, 879, 2139, 0),
  unhooded('cook-u-tortilla', 'cooking', 'Electric, unhooded', 'Tortilla grill', 2200, 1034, 254, 780, 0),

  ware('ware-prerinse', 'Pre-rinse spray valve, 0.08 L/s', 88, 3429, false),
  ware('ware-sink-3', '3-compartment sink, rinsing', 264, 1436, false),
  ware('ware-uc-low', 'Under-counter dishwasher, low temperature', 645, 1436, false),
  ware('ware-uc-high', 'Under-counter dishwasher, high temperature', 1172, 1348, false),
  ware('ware-door-high', 'Upright door type, high temperature', 2345, 6272, false),
  ware('ware-door-high-hr', 'Upright door type, high temperature, heat recovery', 1407, 3810, false),
  ware('ware-potpan', 'Pot and pan washer', 1758, 6887, false),
  statedLength(ware('ware-conveyor-1120', '1120 mm conveyor dishwasher, unvented', 2931, 17379, false), 1.12, 'ASHRAE names this conveyor as 1120 mm.'),
  ware('ware-door-hood', 'Upright door type, high temperature, under 0.9 × 0.9 m hood at 142 L/s', 1026, 3810, true),
  statedLength(ware('ware-conveyor-hood', '1120 mm conveyor, high temperature, under 0.9 m hood at 472 L/s', 293, 5861, true), 1.12, 'ASHRAE names this conveyor as 1120 mm. The 0.9 m figure is the hood, not the machine.'),
  statedLength(ware('ware-conveyor-ducted', 'Ducted 1680 mm conveyor dishwasher', 3107, 1846, true), 1.68, 'ASHRAE names this conveyor as 1680 mm.'),

  unhooded('fridge-reach-in', 'refrigeration', 'Refrigeration', 'Reach-in refrigerator', 1407, 352, 88, 264, 0),
  unhooded('fridge-prep', 'refrigeration', 'Refrigeration', 'Refrigerated prep table', 586, 264, 176, 88, 0),
  unhooded('fridge-freezer-small', 'refrigeration', 'Refrigeration', 'Freezer (small)', 791, 322, 147, 176, 0),
  plug('fridge-ice', 'refrigeration', 'Refrigeration', 'Ice maker and dispenser, 9 kg bin', 'unit', 658, null, '13', 'Peak 15-min heat gain.'),
  plug('fridge-510', 'refrigeration', 'Refrigeration', 'Refrigerator, 510 L', 'unit', 430, null, '13', 'Upper end of the listed 387 to 430 W peak heat gain.'),
  plug('fridge-vending', 'refrigeration', 'Refrigeration', 'Vending machine, drinks (280 to 400 items)', 'unit', 940, null, '13', 'Peak 15-min heat gain.'),

  lighting('lpd-dining-bar', 'Dining, bar/lounge or leisure', 8.2),
  lighting('lpd-dining-fast', 'Dining, cafeteria or fast food', 3.9),
  lighting('lpd-dining-family', 'Dining, family', 5.6),
  lighting('lpd-food-prep', 'Food preparation area', 10.4),
  lighting('lpd-restroom', 'Restroom', 8.0),
  lighting('lpd-storage-small', 'Storage room, under 4.6 m²', 5.2),
  lighting('lpd-storage', 'Storage room, 4.6 m² or more', 3.8),
  lighting('lpd-office-small', 'Office, 13.9 m² or less', 7.9),
  lighting('lpd-breakroom', 'Lounge / breakroom', 5.4),
  lighting('lpd-mech', 'Electrical / mechanical room', 7.6),
  lighting('lpd-laundry', 'Laundry / washing area', 5.5),

  plug('plug-office-laptop', 'plug', 'Office load factor', 'Office, medium, 100% laptop docking', 'area', 4.91, null, '14', '11.6 m² per workstation, 1 printer per 10.'),
  plug('plug-office-desktop', 'plug', 'Office load factor', 'Office, medium, 100% desktop', 'area', 7.79, null, '14', '11.6 m² per workstation, 1 printer per 10.'),
  plug('plug-desktop', 'plug', 'Equipment', 'Desktop computer', 'unit', 82, 0.1, '11A', 'Average 15-min peak. About 90% convective, 10% radiative.'),
  plug('plug-monitor', 'plug', 'Equipment', 'Monitor', 'unit', 21, 0.4, '11D', 'Average 15-min peak. About 60% convective, 40% radiative.'),
  plug('plug-laptop', 'plug', 'Equipment', 'Laptop computer', 'unit', 53, 0.25, '11B', 'Average 15-min peak. About 75% convective, 25% radiative.'),
  plug('plug-mfp', 'plug', 'Equipment', 'Multifunction printer, large', 'unit', 425, 0.3, '12', 'Average 15-min peak. About 70% convective, 30% radiative.'),
  plug('plug-pos', 'plug', 'Equipment', 'Touch screen computer (POS)', 'unit', 58, null, '13', 'Peak 15-min heat gain.'),
  plug('plug-register', 'plug', 'Equipment', 'Cash register', 'unit', 9, null, '13', 'Peak 15-min heat gain.'),
  plug('plug-microwave', 'plug', 'Equipment', 'Microwave oven, 25 to 34 L', 'unit', 822, null, '13', 'Upper end of the listed 713 to 822 W peak heat gain.'),
  plug('plug-coffee', 'plug', 'Equipment', 'Coffee maker, up to 12 cups', 'unit', 780, null, '13', 'Peak 15-min heat gain.'),
]);

const BY_ID = new Map(LOAD_CATALOG.map(item => [item.id, item]));

export function getLoadProduct(id: string): LoadProduct | undefined {
  return BY_ID.get(id);
}

export function loadGroups(category: LoadCategory): { group: string; items: LoadProduct[] }[] {
  const groups: { group: string; items: LoadProduct[] }[] = [];
  for (const item of LOAD_CATALOG) {
    if (item.category !== category) continue;
    const found = groups.find(entry => entry.group === item.group);
    if (found) found.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}

export function basisLabel(basis: LoadBasis): string {
  if (basis === 'person') return 'per person';
  if (basis === 'area') return 'per m²';
  return 'each';
}
