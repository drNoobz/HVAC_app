import { equipmentSizeM, getProduct } from './catalog';
import { createId } from './ids';
import { basisLabel, getLoadProduct, type LoadBasis, type LoadProduct } from './loadCatalog';
import { roomAtPoint } from './projectOps';
import type { LoadItem, LoadOverride, PlacedEquipment, Project, Room, UnitSystem } from './types';
import { formatNumber, WATTS_PER_BTU_H } from './units';
import { polygonArea } from './wallDraw';

const SQFT_PER_M2 = 10.7639104167;

/** Persily and de Jonge (2017), Indoor Air 27(5), Eq. 9 with RQ 0.85: L/s CO2 at 273 K and 101 kPa per MJ/day. */
const CO2_LS_PER_MJ_DAY = 0.000484;
const MJ_DAY_PER_W = 0.0864;
/** Natural gas taken as methane: HHV 890.3 kJ/mol, 1 mol CO2 and 2 mol water per mol. */
const CH4_HHV_KJ_MOL = 890.3;
const MOLAR_VOLUME_L = 22.414;
const WATER_G_MOL = 18.015;
/** Latent heat of vaporization near room temperature. */
const HFG_J_G = 2450;

export const LOAD_METHOD_NOTES = [
  'People CO2: total heat less food allowance, converted with Persily and de Jonge (2017) Eq. 9, RQ 0.85, at 0 °C and 101 kPa.',
  'Combustion products: gas idle input treated as methane at HHV 890.3 kJ/mol.',
  'Moisture: latent heat divided by 2450 J/g.',
  'CO has no catalog default. Enter a manufacturer or manual value.',
];

export interface LoadGains {
  sensibleW: number;
  latentW: number;
  moistureGh: number;
  co2Ls: number;
  coMgS: number | null;
  /** Products of combustion at idle. Captured means a hood exhausts them. */
  combustion: { co2Ls: number; waterGh: number; captured: boolean } | null;
  multiplier: number;
  source: 'ashrae' | 'manufacturer' | 'manual';
}

export interface LoadTotals {
  sensibleW: number;
  latentW: number;
  moistureGh: number;
  co2Ls: number;
  coMgS: number | null;
  count: number;
}

/** Per-basis heat gain unit: W or Btu/h per person or each, W/m² or Btu/h·ft² for area loads. */
export function gainUnit(basis: LoadBasis, units: UnitSystem): { label: string; factor: number } {
  if (basis === 'area') return units === 'IP' ? { label: 'Btu/h·ft²', factor: 1 / WATTS_PER_BTU_H / SQFT_PER_M2 } : { label: 'W/m²', factor: 1 };
  return units === 'IP' ? { label: 'Btu/h', factor: 1 / WATTS_PER_BTU_H } : { label: 'W', factor: 1 };
}

export function loadSpec(product: LoadProduct, units: UnitSystem): string {
  const gain = gainUnit(product.basis, units);
  const parts = [`${formatNumber(product.sensibleW * gain.factor, 1)} ${gain.label} sensible`];
  if (product.latentW > 0) parts.push(`${formatNumber(product.latentW * gain.factor, 1)} ${gain.label} latent`);
  return `${parts.join(' · ')}${product.basis === 'area' ? '' : ` ${basisLabel(product.basis)}`}`;
}

export function roomAreaM2(room: Room): number {
  return room.outline && room.outline.length >= 3 ? polygonArea(room.outline) : room.lengthM * room.widthM;
}

export function combustionPerUnit(product: LoadProduct): { co2Ls: number; waterGh: number } | null {
  if (product.fuel !== 'gas' || !product.standbyW) return null;
  const molS = product.standbyW / 1000 / CH4_HHV_KJ_MOL;
  return { co2Ls: molS * MOLAR_VOLUME_L, waterGh: molS * 2 * WATER_G_MOL * 3600 };
}

export function defaultCo2Ls(product: LoadProduct): number {
  if (product.category === 'people') {
    const metabolicW = product.sensibleW + product.latentW - (product.foodW ?? 0);
    return metabolicW * MJ_DAY_PER_W * CO2_LS_PER_MJ_DAY;
  }
  const burn = combustionPerUnit(product);
  return burn && product.hooded === false ? burn.co2Ls : 0;
}

export function loadMultiplier(project: Project, item: LoadItem, product: LoadProduct): number {
  if (product.basis !== 'area') return Math.max(0, item.quantity);
  const room = project.rooms.find(entry => entry.id === item.roomId);
  return room ? roomAreaM2(room) : 0;
}

export function loadGains(project: Project, item: LoadItem): LoadGains | null {
  const product = getLoadProduct(item.loadId);
  if (!product) return null;
  const multiplier = loadMultiplier(project, item, product);
  const override = item.override;
  const sensible = override?.sensibleW ?? product.sensibleW;
  const latent = override?.latentW ?? product.latentW;
  const co2 = override?.co2Ls ?? defaultCo2Ls(product);
  const burn = combustionPerUnit(product);
  return {
    sensibleW: sensible * multiplier,
    latentW: latent * multiplier,
    moistureGh: ((latent * multiplier) / HFG_J_G) * 3600,
    co2Ls: co2 * multiplier,
    coMgS: override?.coMgS != null ? override.coMgS * multiplier : null,
    combustion: burn ? { co2Ls: burn.co2Ls * multiplier, waterGh: burn.waterGh * multiplier, captured: product.hooded === true } : null,
    multiplier,
    source: override ? override.source : 'ashrae',
  };
}

export function sumLoads(project: Project, items: readonly LoadItem[]): LoadTotals {
  const totals: LoadTotals = { sensibleW: 0, latentW: 0, moistureGh: 0, co2Ls: 0, coMgS: null, count: 0 };
  for (const item of items) {
    const gains = loadGains(project, item);
    if (!gains) continue;
    totals.sensibleW += gains.sensibleW;
    totals.latentW += gains.latentW;
    totals.moistureGh += gains.moistureGh;
    totals.co2Ls += gains.co2Ls;
    if (gains.coMgS != null) totals.coMgS = (totals.coMgS ?? 0) + gains.coMgS;
    totals.count += 1;
  }
  return totals;
}

export function roomLoads(project: Project, roomId: string): LoadItem[] {
  return (project.loads ?? []).filter(item => item.roomId === roomId);
}

function insideFootprint(equipment: PlacedEquipment, x: number, y: number): boolean {
  const size = equipmentSizeM(getProduct(equipment.catalogId));
  const yaw = (-equipment.yawDeg * Math.PI) / 180;
  const dx = x - equipment.xM;
  const dy = y - equipment.yM;
  const lx = dx * Math.cos(yaw) - dy * Math.sin(yaw);
  const ly = dx * Math.sin(yaw) + dy * Math.cos(yaw);
  return Math.abs(lx) <= size.lengthM / 2 + 0.05 && Math.abs(ly) <= size.widthM / 2 + 0.05;
}

export function hoodOver(project: Project, item: LoadItem): PlacedEquipment | null {
  return project.equipment.find(entry => getProduct(entry.catalogId)?.category === 'kitchen-hood' && insideFootprint(entry, item.xM, item.yM)) ?? null;
}

export function loadLabel(item: LoadItem, product: LoadProduct | undefined): string {
  if (!product) return 'Load';
  if (product.basis === 'person') return `${item.quantity} ${item.quantity === 1 ? 'person' : 'people'}`;
  if (product.basis === 'area') return product.category === 'lighting' ? 'Lighting' : 'Plug load';
  return item.quantity > 1 ? `${product.name} × ${item.quantity}` : product.name;
}

/** Length and depth for the plan. Height is kept but not drawn. */
export function loadPlanSize(item: LoadItem): { lengthM: number; widthM: number; heightM: number | null } | null {
  if (item.lengthM == null || item.widthM == null || item.lengthM < 0.05 || item.widthM < 0.05) return null;
  return { lengthM: item.lengthM, widthM: item.widthM, heightM: item.heightM };
}

export function addLoad(project: Project, loadId: string, point: { xM: number; yM: number }): Project {
  const product = getLoadProduct(loadId);
  const room = roomAtPoint(project.rooms, point.xM, point.yM);
  if (!product || !room) return project;
  const item: LoadItem = {
    id: createId('load'),
    loadId,
    roomId: room.id,
    xM: Number(point.xM.toFixed(3)),
    yM: Number(point.yM.toFixed(3)),
    yawDeg: 0,
    lengthM: product.size?.lengthM ?? null,
    widthM: product.size?.widthM ?? null,
    heightM: product.size?.heightM ?? null,
    quantity: 1,
    override: null,
    notes: '',
  };
  return { ...project, loads: [...(project.loads ?? []), item] };
}

export function updateLoad(project: Project, id: string, patch: Partial<LoadItem>): Project {
  return {
    ...project,
    loads: (project.loads ?? []).map(item => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      if (patch.xM != null || patch.yM != null) next.roomId = roomAtPoint(project.rooms, next.xM, next.yM)?.id ?? null;
      return next;
    }),
  };
}

export function removeLoad(project: Project, id: string): Project {
  return { ...project, loads: (project.loads ?? []).filter(item => item.id !== id) };
}

export function blankOverride(source: LoadOverride['source']): LoadOverride {
  return { source, sensibleW: null, latentW: null, co2Ls: null, coMgS: null, note: '' };
}
