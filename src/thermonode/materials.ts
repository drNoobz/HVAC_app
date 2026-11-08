/**
 * Building-relevant snapshot of ThermoNode library reference constants.
 * Source rows: ThermoNode `thermocore/src/library_materials_data.inc`.
 * Values are the k, cp, and rho constants stored on those rows.
 * Temperature-dependent evaluation stays in thermocore and is not called here.
 * Emissivity is not a column on those rows and is left unset.
 * Gypsum, concrete, glass, and wood are not in this library and are not invented here.
 */

export type LibraryType = 'gas' | 'liquid' | 'solid';
export type PlannerGroup = 'fluid' | 'metal' | 'insulation';

export interface MaterialSnapshot {
  key: string;
  name: string;
  libraryType: LibraryType;
  plannerGroup: PlannerGroup;
  k: number;
  cp: number;
  rho: number;
  sourceFile: 'thermocore/src/library_materials_data.inc';
}

export const MATERIAL_SOURCE_FILE = 'thermocore/src/library_materials_data.inc' as const;

function row(
  key: string,
  name: string,
  libraryType: LibraryType,
  plannerGroup: PlannerGroup,
  k: number,
  cp: number,
  rho: number
): MaterialSnapshot {
  return { key, name, libraryType, plannerGroup, k, cp, rho, sourceFile: MATERIAL_SOURCE_FILE };
}

export const MATERIAL_SNAPSHOT: MaterialSnapshot[] = [
  row('Air', 'Air', 'gas', 'fluid', 0.025, 1005, 1.2),
  row('Water', 'Water', 'liquid', 'fluid', 0.6, 4180, 998),
  row('Ethylene_Glycol_Water_20pc', 'Ethylene glycol / water 20%', 'liquid', 'fluid', 0.52, 3800, 1026),
  row('Ethylene_Glycol_Water_40pc', 'Ethylene glycol / water 40%', 'liquid', 'fluid', 0.43, 3500, 1072),
  row('Ethylene_Glycol_Water_60pc', 'Ethylene glycol / water 60%', 'liquid', 'fluid', 0.38, 3200, 1108),
  row('Propylene_Glycol_Water_50pc', 'Propylene glycol / water 50%', 'liquid', 'fluid', 0.36, 3650, 1048),
  row('Aluminum_6061_T6', 'Aluminum 6061-T6', 'solid', 'metal', 167, 896, 2700),
  row('Aluminum_2024', 'Aluminum 2024', 'solid', 'metal', 121, 875, 2780),
  row('Aluminum_7075', 'Aluminum 7075', 'solid', 'metal', 130, 960, 2810),
  row('Copper', 'Copper', 'solid', 'metal', 400, 385, 8960),
  row('Stainless_steel_AISI_304', 'Stainless steel AISI 304', 'solid', 'metal', 16.2, 500, 8000),
  row('Titanium_CP_70', 'Titanium CP-70', 'solid', 'metal', 22, 540, 4510),
  row('Titanium_6Al_4V', 'Titanium 6Al-4V', 'solid', 'metal', 6.7, 565, 4430),
  row('Min_K_0_125_in', 'Min-K 0.125 in', 'solid', 'insulation', 0.0389182408861054, 725.4695643428548, 256.297),
  row('Min_K_0_250_in', 'Min-K 0.250 in', 'solid', 'insulation', 0.02420175811428507, 725.4695643428548, 256.297),
  row('Min_K_0_375_in', 'Min-K 0.375 in', 'solid', 'insulation', 0.02374645819140858, 725.4695643428548, 256.297),
  row('Microlite_6_4_kg_m3', 'Microlite 6.4 kg/m³', 'solid', 'insulation', 0.035, 800, 6.4),
  row('Microlite_9_6_kg_m3', 'Microlite 9.6 kg/m³', 'solid', 'insulation', 0.038, 800, 9.6),
  row('Microlite_24_kg_m3', 'Microlite 24 kg/m³', 'solid', 'insulation', 0.045, 800, 24),
  row('Micro_Fiber_Felt_48_kg_m3', 'Micro-fiber felt 48 kg/m³', 'solid', 'insulation', 0.04, 800, 48),
  row('Micro_Fiber_Felt_64_kg_m3', 'Micro-fiber felt 64 kg/m³', 'solid', 'insulation', 0.042, 800, 64),
  row('Micro_Fiber_Felt_96_kg_m3', 'Micro-fiber felt 96 kg/m³', 'solid', 'insulation', 0.045, 800, 96),
  row('Pyrogel_AR5220_series', 'Pyrogel AR5220 series', 'solid', 'insulation', 0.014, 800, 180),
  row('Kaowool_3000', 'Kaowool 3000', 'solid', 'insulation', 0.06, 1100, 128),
];

const BY_KEY = new Map(MATERIAL_SNAPSHOT.map(item => [item.key, item]));

export function materialByKey(key: string): MaterialSnapshot | undefined {
  return BY_KEY.get(key);
}

export const MATERIAL_SNAPSHOT_NOTE =
  'Reference constants copied from the ThermoNode library rows named above. The full thermocore library also contains fluids and refrigerants that this snapshot omits. This list is not a live query of the WASM solver.';
