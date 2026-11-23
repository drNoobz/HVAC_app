import { getProduct } from './catalog';
import { SECTION_LABEL, SECTION_TAG, unitSections } from './airUnits';
import { createId } from './ids';
import type { CoilMedium, ControlPoint, LoopFluid, PlacedEquipment, PlantLoop, Project, SensorKind, ValveKind } from './types';

export const LOOP_FLUID_LABEL: Record<LoopFluid, string> = {
  water: 'Water',
  'propylene-glycol': 'Propylene glycol',
  'ethylene-glycol': 'Ethylene glycol',
  steam: 'Steam',
  co2: 'CO₂ (R-744)',
  refrigerant: 'Refrigerant',
};

export const VALVE_LABEL: Record<ValveKind, string> = {
  'two-way': '2-way control valve',
  'three-way': '3-way control valve',
  solenoid: 'Solenoid valve',
  'back-pressure': 'Back-pressure control valve',
  expansion: 'Expansion valve',
};

export const SENSOR_LABEL: Record<SensorKind, string> = {
  temperature: 'Temperature',
  humidity: 'Humidity',
  co2: 'CO₂',
  pressure: 'Pressure',
  'static-pressure': 'Duct static pressure',
  airflow: 'Airflow station',
};

/** Letter code drawn in a room-sensor bubble. */
export const SENSOR_SYMBOL: Record<SensorKind, string> = {
  temperature: 'T',
  humidity: '%RH',
  co2: 'CO₂',
  pressure: 'P',
  'static-pressure': 'SP',
  airflow: 'F',
};

/** Fluids a coil medium can be piped to. */
export function fluidsFor(medium: CoilMedium | undefined): LoopFluid[] {
  switch (medium) {
    case 'co2-dx':
      return ['co2'];
    case 'dx':
      return ['refrigerant'];
    case 'chilled-water':
      return ['water', 'propylene-glycol', 'ethylene-glycol'];
    case 'hot-water':
      return ['water', 'propylene-glycol', 'ethylene-glycol'];
    case 'glycol':
      return ['propylene-glycol', 'ethylene-glycol'];
    case 'steam':
      return ['steam'];
    default:
      return [];
  }
}

/** Does this coil medium connect to a loop at all? Gas and electric heat do not. */
export function isPiped(medium: CoilMedium | undefined): boolean {
  return fluidsFor(medium).length > 0;
}

export function isLiquidLoop(loop: PlantLoop): boolean {
  return loop.fluid === 'water' || loop.fluid === 'propylene-glycol' || loop.fluid === 'ethylene-glycol';
}

export function newPlantLoop(fluid: LoopFluid, name: string): PlantLoop {
  return {
    id: createId('loop'),
    name,
    fluid,
    glycolFraction: fluid === 'propylene-glycol' || fluid === 'ethylene-glycol' ? 0.5 : null,
    supplyC: null,
    returnC: null,
    plantEquipmentId: null,
    notes: '',
  };
}

export function newControlPoint(tag: string, sensor: SensorKind, location: ControlPoint['location']): ControlPoint {
  return { id: createId('pt'), tag, sensor, location };
}

/** Points list row, as on a controls submittal. */
export interface PointRow {
  tag: string;
  /** AI / AO / DI / DO. */
  io: 'AI' | 'AO' | 'DI' | 'DO';
  device: string;
  location: string;
  systemId: string | null;
}

function unitName(item: PlacedEquipment): string {
  return getProduct(item.catalogId)?.model ?? 'Unit';
}

/**
 * Controls points for a system, generated from the unit sections (damper actuators, fan start and status, coil valves)
 * and the entered sensors. Fans and coils without valves add no valve points.
 */
export function pointsList(project: Project, systemId: string | null = null): PointRow[] {
  const rows: PointRow[] = [];
  const units = project.equipment.filter(item => getProduct(item.catalogId)?.unit && (systemId == null || item.systemId === systemId));
  const unitIds = new Set(units.map(item => item.id));
  for (const item of units) {
    const name = unitName(item);
    for (const section of unitSections(item)) {
      const where = `${name} · ${SECTION_LABEL[section.kind]}`;
      if ((section.kind === 'oa-damper' || section.kind === 'ra-damper' || section.kind === 'exhaust-damper') && section.ducted !== false) {
        rows.push({ tag: `D-${SECTION_TAG[section.kind]}`, io: 'AO', device: `Damper actuator, ${section.position ?? 'NC'}`, location: where, systemId: item.systemId });
      } else if (section.kind === 'oa-damper' || section.kind === 'exhaust-damper') {
        rows.push({ tag: `D-${SECTION_TAG[section.kind]}`, io: 'AO', device: `Economizer damper actuator, ${section.position ?? 'NC'}`, location: where, systemId: item.systemId });
      }
      if (section.kind === 'supply-fan' || section.kind === 'relief-fan') {
        const tag = SECTION_TAG[section.kind];
        rows.push({ tag: `${tag}-SS`, io: 'DO', device: 'Fan start/stop', location: where, systemId: item.systemId });
        rows.push({ tag: `${tag}-ST`, io: 'DI', device: 'Fan status', location: where, systemId: item.systemId });
      }
      for (const valve of section.valves ?? []) {
        rows.push({ tag: valve.tag || 'V', io: valve.kind === 'solenoid' ? 'DO' : 'AO', device: VALVE_LABEL[valve.kind], location: where, systemId: item.systemId });
      }
    }
  }
  for (const point of project.controlPoints ?? []) {
    const location = point.location;
    if (location.kind === 'station') {
      const item = project.equipment.find(entry => entry.id === location.equipmentId);
      if (!item || (systemId != null && item.systemId !== systemId)) continue;
      const section = unitSections(item).find(entry => entry.id === location.sectionId);
      rows.push({
        tag: point.tag,
        io: 'AI',
        device: SENSOR_LABEL[point.sensor],
        location: `${unitName(item)} · after ${section ? SECTION_LABEL[section.kind].toLowerCase() : 'section'}`,
        systemId: item.systemId,
      });
    } else {
      const served = location.equipmentId ? project.equipment.find(entry => entry.id === location.equipmentId) : undefined;
      if (systemId != null && (!served || served.systemId !== systemId || !unitIds.has(served.id))) continue;
      const room = project.rooms.find(entry => entry.id === location.roomId);
      rows.push({ tag: point.tag, io: 'AI', device: `Room ${SENSOR_LABEL[point.sensor].toLowerCase()}`, location: room?.name ?? 'Room', systemId: served?.systemId ?? null });
    }
  }
  return rows;
}
