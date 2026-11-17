import type { UnitSystem } from './types';

export const METERS_PER_FOOT = 0.3048;
/** 1 ft³/min in m³/s. */
export const M3S_PER_CFM = 0.028316846592 / 60;
/** 1 refrigeration ton in watts. */
export const WATTS_PER_TON = 3516.85;
/** 1 Btu/h in watts. */
export const WATTS_PER_BTU_H = 0.29307107;

export function lengthUnit(system: UnitSystem): string {
  return system === 'IP' ? 'ft' : 'm';
}

export function flowUnit(system: UnitSystem): string {
  return system === 'IP' ? 'CFM' : 'L/s';
}

export function powerUnit(system: UnitSystem): string {
  return system === 'IP' ? 'Btu/h' : 'kW';
}

export function mToLength(meters: number, system: UnitSystem): number {
  return system === 'IP' ? meters / METERS_PER_FOOT : meters;
}

export function lengthToM(value: number, system: UnitSystem): number {
  return system === 'IP' ? value * METERS_PER_FOOT : value;
}

export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '';
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor);
}

export function formatLength(meters: number, system: UnitSystem, digits = 3): string {
  return `${formatNumber(mToLength(meters, system), digits)} ${lengthUnit(system)}`;
}

export function formatArea(squareMeters: number, system: UnitSystem): string {
  if (system === 'IP') return `${formatNumber(squareMeters * 10.7639104167, 0)} ft²`;
  return `${formatNumber(squareMeters, 1)} m²`;
}

export function formatFlow(m3s: number, system: UnitSystem): string {
  if (system === 'IP') return `${formatNumber(m3s / M3S_PER_CFM, 0)} CFM`;
  return `${formatNumber(m3s * 1000, 1)} L/s`;
}

export function formatPower(watts: number, system: UnitSystem): string {
  if (system === 'IP') return `${formatNumber(watts / WATTS_PER_BTU_H, 0)} Btu/h`;
  return `${formatNumber(watts / 1000, 2)} kW`;
}

export function lengthStep(system: UnitSystem): number {
  return system === 'IP' ? 0.25 : 0.1;
}
