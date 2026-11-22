import { humidityRatioRh, humidityRatioWb, outdoorDb, pressureKpa, siteOf, sunAt, surfaceIrradiance } from './climate';
import {
  findAssembly,
  findConstruction,
  layerResistance,
  publishedU,
  resolveStack,
  type ConstructionAssembly,
  type ConstructionMaterial,
} from './constructionLibrary';
import { roomAreaM2, roomLoads, sumLoads } from './loads';
import type { Project, Room, Selection, SiteClimate, StackLayer, WallFace } from './types';
import { northDegrees, interfaceTargets } from './walls';

// TODO(next): replace fixed air changes with the ASHRAE Fundamentals Ch. 16 wind and stack model
// (effective leakage area per envelope area, stack and wind coefficients, site wind speed and shielding).
// TODO(next): hourly 8760 analysis from an uploaded EPW (dry bulb, dew point, direct/diffuse solar,
// horizontal infrared for sky temperature, wind, ground temperature).

const U_SI_PER_IP = 5.678263337;
/** h·ft²·°F/Btu. ASHRAE Fundamentals Ch. 26, surface film resistances. */
const FILM = { wallIn: 0.68, roofInDown: 0.92, roofInUp: 0.61, outSummer: 0.25, outWinter: 0.17 };
/** ASHRAE 90.1 Appendix A, unheated uninsulated slab-on-grade, Btu/(h·ft·°F) to W/(m·K). */
const SLAB_F_SI = 0.73 * 1.730735;
const SKY_CORRECTION_K = 3.9;
const ALPHA_HO = { dark: 0.052, light: 0.026 };
const TOUCH_M = 0.05;

export type SurfaceKind = 'wall' | 'window' | 'door' | 'roof';

export interface ExteriorSurface {
  id: string;
  roomId: string;
  kind: SurfaceKind;
  label: string;
  areaM2: number;
  /** Degrees clockwise from north. 0 for roofs. */
  azimuthDeg: number;
  tiltDeg: number;
  uCool: number | null;
  uHeat: number | null;
  shgc: number | null;
  /** Layer resistances were added even though the component is not marked as series layers. */
  summedNonSeries: boolean;
  selection: Selection;
}

export const COOL_PARTS = ['walls', 'roof', 'windowConduction', 'windowSolar', 'doors', 'infiltration', 'internal'] as const;
export type CoolPart = (typeof COOL_PARTS)[number];
export const HEAT_PARTS = ['walls', 'roof', 'windows', 'doors', 'floor', 'infiltration'] as const;
export type HeatPart = (typeof HEAT_PARTS)[number];

export const PART_LABEL: Record<CoolPart | HeatPart, string> = {
  walls: 'Walls',
  roof: 'Roof',
  windowConduction: 'Window conduction',
  windowSolar: 'Window solar',
  windows: 'Windows',
  doors: 'Doors',
  floor: 'Slab edge',
  infiltration: 'Infiltration',
  internal: 'Internal loads',
};

export interface RoomDesignLoad {
  roomId: string;
  surfaces: ExteriorSurface[];
  perimeterM: number;
  slab: boolean;
  ach: number | null;
  volumeM3: number;
  /** Sensible W for clock hours 1–24. Null without a cooling design temperature. */
  hourly: number[] | null;
  cooling: { hour: number; sensibleW: number; latentW: number; parts: Record<CoolPart, number>; latent: { infiltration: number; internal: number } } | null;
  heating: { totalW: number; parts: Record<HeatPart, number> } | null;
  missing: string[];
}

export interface DesignLoadReport {
  rooms: RoomDesignLoad[];
  block: { hour: number; sensibleW: number; latentW: number } | null;
  heatingW: number | null;
  gaps: string[];
}

type Rating = { uCool: number; uHeat: number; shgc: number | null; summedNonSeries: boolean };

function rating(
  assignment: { constructionId?: string | null; layers?: StackLayer[] } | undefined,
  kind: SurfaceKind,
  assemblies: ConstructionAssembly[],
  materials: ConstructionMaterial[],
): Rating | null {
  if (!assignment) return null;
  const layers = resolveStack(assignment, assemblies, materials);
  if (layers.length === 0) return null;
  if (layers.length === 1) {
    const material = findConstruction(materials, layers[0].materialId);
    if (material && (material.category === 'window' || material.category === 'door')) {
      const u = publishedU(material).uSi;
      if (u != null) return { uCool: u, uHeat: u, shgc: material.shgc, summedNonSeries: false };
    }
  }
  let r = 0;
  for (const layer of layers) {
    const value = layerResistance(layer, materials).rIp;
    if (value == null) return null;
    r += value;
  }
  const roof = kind === 'roof';
  const assembly = !assignment.layers?.length ? findAssembly(assemblies, assignment.constructionId) : undefined;
  return {
    uCool: U_SI_PER_IP / (r + (roof ? FILM.roofInDown : FILM.wallIn) + FILM.outSummer),
    uHeat: U_SI_PER_IP / (r + (roof ? FILM.roofInUp : FILM.wallIn) + FILM.outWinter),
    shgc: null,
    summedNonSeries: assembly ? !assembly.series : false,
  };
}

const FACE_NORMAL: Record<WallFace, [number, number]> = { px: [1, 0], nx: [-1, 0], py: [0, 1], ny: [0, -1] };

function edgeNormal(room: Room, anchor: string): [number, number] | null {
  if (anchor.startsWith('f:')) return FACE_NORMAL[anchor.slice(2) as WallFace] ?? null;
  const loop = room.outline;
  const index = Number(anchor.slice(2));
  if (!loop || !Number.isInteger(index) || !loop[index]) return null;
  let signed = 0;
  loop.forEach((point, i) => {
    const next = loop[(i + 1) % loop.length];
    signed += point.x * next.y - next.x * point.y;
  });
  const a = loop[index];
  const b = loop[(index + 1) % loop.length];
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dx = (b.x - a.x) / length;
  const dy = (b.y - a.y) / length;
  return signed > 0 ? [dy, -dx] : [-dy, dx];
}

function azimuth(normal: [number, number], northDeg: number): number {
  const bearing = (Math.atan2(normal[0], normal[1]) * 180) / Math.PI;
  return (((bearing - northDeg) % 360) + 360) % 360;
}

function bounds(room: Room) {
  if (room.outline && room.outline.length >= 3) {
    const xs = room.outline.map(point => point.x);
    const ys = room.outline.map(point => point.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  return { x0: room.xM, x1: room.xM + room.lengthM, y0: room.yM, y1: room.yM + room.widthM };
}

function stacked(room: Room, rooms: readonly Room[], side: 'above' | 'below'): boolean {
  const a = bounds(room);
  const level = side === 'above' ? room.zM + room.heightM : room.zM;
  return rooms.some(other => {
    if (other.id === room.id) return false;
    const otherLevel = side === 'above' ? other.zM : other.zM + other.heightM;
    if (Math.abs(otherLevel - level) > TOUCH_M) return false;
    const b = bounds(other);
    return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > TOUCH_M && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > TOUCH_M;
  });
}

export function exteriorSurfaces(
  project: Project,
  assemblies: ConstructionAssembly[],
  materials: ConstructionMaterial[],
): { surfaces: ExteriorSurface[]; perimeter: Map<string, number> } {
  const north = northDegrees(project.northDeg);
  const surfaces: ExteriorSurface[] = [];
  const perimeter = new Map<string, number>();
  for (const target of interfaceTargets(project.rooms)) {
    if (target.sides.length !== 1) continue;
    const side = target.sides[0];
    const room = project.rooms.find(item => item.id === side.roomId);
    if (!room) continue;
    perimeter.set(room.id, (perimeter.get(room.id) ?? 0) + target.lengthM);
    const normal = edgeNormal(room, side.anchor);
    if (!normal) continue;
    const az = azimuth(normal, north);
    const face = side.anchor.startsWith('f:') ? (side.anchor.slice(2) as WallFace) : null;
    const openings = face
      ? room.openings.filter(item => item.face === face && item.offsetM + item.widthM / 2 >= side.startM - 0.02 && item.offsetM + item.widthM / 2 <= side.endM + 0.02)
      : [];
    let openArea = 0;
    for (const opening of openings) {
      const area = opening.widthM * opening.heightM;
      openArea += area;
      if (opening.kind === 'opening') continue;
      const kind: SurfaceKind = opening.kind === 'window' ? 'window' : 'door';
      const rated = rating(opening, kind, assemblies, materials);
      surfaces.push({
        id: opening.id,
        roomId: room.id,
        kind,
        label: kind === 'window' ? 'Window' : 'Door',
        areaM2: area,
        azimuthDeg: az,
        tiltDeg: 90,
        uCool: rated?.uCool ?? null,
        uHeat: rated?.uHeat ?? null,
        shgc: rated?.shgc ?? null,
        summedNonSeries: false,
        selection: { kind: 'opening', roomId: room.id, id: opening.id },
      });
    }
    const rated = rating(project.interfaceWalls?.[target.key], 'wall', assemblies, materials);
    const glazed = rated?.shgc != null;
    surfaces.push({
      id: target.key,
      roomId: room.id,
      kind: glazed ? 'window' : 'wall',
      label: glazed ? 'Glass wall' : 'Wall',
      areaM2: Math.max(0, target.lengthM * room.heightM - openArea),
      azimuthDeg: az,
      tiltDeg: 90,
      uCool: rated?.uCool ?? null,
      uHeat: rated?.uHeat ?? null,
      shgc: rated?.shgc ?? null,
      summedNonSeries: rated?.summedNonSeries ?? false,
      selection: { kind: 'interface', key: target.key },
    });
  }
  for (const room of project.rooms) {
    if (stacked(room, project.rooms, 'above')) continue;
    const rated = rating(room.surfaces.ceiling, 'roof', assemblies, materials);
    surfaces.push({
      id: `${room.id}:roof`,
      roomId: room.id,
      kind: 'roof',
      label: 'Roof',
      areaM2: roomAreaM2(room),
      azimuthDeg: 0,
      tiltDeg: 0,
      uCool: rated?.uCool ?? null,
      uHeat: rated?.uHeat ?? null,
      shgc: null,
      summedNonSeries: rated?.summedNonSeries ?? false,
      selection: { kind: 'surface', roomId: room.id, face: 'ceiling' },
    });
  }
  return { surfaces, perimeter };
}

/** Site inputs that are missing. Each entry says what the gap removes from the result. */
export function siteGaps(site: SiteClimate): string[] {
  const gaps: string[] = [];
  if (site.coolingDbC == null) gaps.push('Cooling design dry bulb is not set, so there is no cooling result.');
  if (site.heatingDbC == null) gaps.push('Heating design dry bulb is not set, so there is no heating result.');
  if (site.latitudeDeg == null || site.taub == null || site.taud == null) gaps.push('Solar gain is left out until latitude, taub, and taud are set.');
  if (site.coolingDbC != null && site.coolingWbC == null) gaps.push('Outdoor-air latent gain is left out until the coincident wet bulb is set.');
  if (site.coolingDbC != null && site.coolingRangeK == null) gaps.push('Daily range is not set, so the outdoor temperature stays at its peak all day.');
  if (site.longitudeDeg == null || site.timeZoneH == null) gaps.push('Solar time equals clock time until longitude and time zone are set.');
  if (site.infiltrationAch == null) gaps.push('Infiltration is left out of spaces without their own air-change rate until a default is set.');
  return gaps;
}

const zeroParts = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map(key => [key, 0])) as Record<K, number>;

export function designLoads(project: Project, assemblies: ConstructionAssembly[], materials: ConstructionMaterial[]): DesignLoadReport {
  const site = siteOf(project);
  const { surfaces, perimeter } = exteriorSurfaces(project, assemblies, materials);
  const pressureRatio = pressureKpa(site.elevationM) / 101.325;
  const alphaHo = ALPHA_HO[site.surfaceColor];
  const hours = Array.from({ length: 24 }, (_, i) => i + 1);
  const outdoor = hours.map(h => outdoorDb(site, h));
  const sun = hours.map(h => sunAt(site, h));
  const p = pressureKpa(site.elevationM);
  const wIn = humidityRatioRh(site.indoorCoolC, site.indoorCoolRh, p);
  const wOut = site.coolingDbC != null && site.coolingWbC != null ? humidityRatioWb(site.coolingDbC, site.coolingWbC, p) : null;

  const rooms: RoomDesignLoad[] = project.rooms.map(room => {
    const own = surfaces.filter(surface => surface.roomId === room.id);
    const missing: string[] = [];
    const unrated = own.filter(surface => surface.uCool == null);
    if (unrated.length) missing.push(`${unrated.length} exterior surface${unrated.length === 1 ? ' has' : 's have'} no U-value and ${unrated.length === 1 ? 'is' : 'are'} left out.`);
    const noShgc = own.filter(surface => surface.kind === 'window' && surface.uCool != null && surface.shgc == null);
    if (noShgc.length) missing.push(`${noShgc.length} window${noShgc.length === 1 ? ' has' : 's have'} no SHGC, so solar gain through ${noShgc.length === 1 ? 'it' : 'them'} is left out.`);
    if (own.some(surface => surface.summedNonSeries)) missing.push('A roof or wall component is not marked as series layers. Its layer R-values were added and the air space was not counted.');
    const ach = room.infiltrationAch ?? site.infiltrationAch;
    const volumeM3 = roomAreaM2(room) * room.heightM;
    const flowLs = ach != null ? (ach * volumeM3 * 1000) / 3600 : 0;
    const slab = room.zM < TOUCH_M && !stacked(room, project.rooms, 'below');
    const perimeterM = slab ? perimeter.get(room.id) ?? 0 : 0;
    const internal = sumLoads(project, roomLoads(project, room.id));

    let hourly: number[] | null = null;
    let cooling: RoomDesignLoad['cooling'] = null;
    if (site.coolingDbC != null) {
      const byHour = hours.map((h, index) => {
        const to = outdoor[index] ?? site.coolingDbC!;
        const parts = zeroParts(COOL_PARTS);
        for (const surface of own) {
          if (surface.uCool == null) continue;
          const solar = surfaceIrradiance(sun[index], surface.azimuthDeg, surface.tiltDeg, site.groundReflectance).total;
          if (surface.kind === 'window') {
            parts.windowConduction += surface.uCool * surface.areaM2 * (to - site.indoorCoolC);
            if (surface.shgc != null) parts.windowSolar += surface.shgc * surface.areaM2 * solar;
            continue;
          }
          const solAir = to + alphaHo * solar - (surface.kind === 'roof' ? SKY_CORRECTION_K : 0);
          const gain = surface.uCool * surface.areaM2 * (solAir - site.indoorCoolC);
          if (surface.kind === 'roof') parts.roof += gain;
          else if (surface.kind === 'door') parts.doors += gain;
          else parts.walls += gain;
        }
        parts.infiltration = 1.23 * flowLs * (to - site.indoorCoolC) * pressureRatio;
        parts.internal = internal.sensibleW;
        return { h, parts, total: COOL_PARTS.reduce((sum, key) => sum + parts[key], 0) };
      });
      hourly = byHour.map(item => item.total);
      const peak = byHour.reduce((best, item) => (item.total > best.total ? item : best), byHour[0]);
      const latentInfiltration = wOut != null ? 3010 * flowLs * Math.max(0, wOut - wIn) * pressureRatio : 0;
      cooling = {
        hour: peak.h,
        sensibleW: peak.total,
        latentW: latentInfiltration + internal.latentW,
        parts: peak.parts,
        latent: { infiltration: latentInfiltration, internal: internal.latentW },
      };
    }

    let heating: RoomDesignLoad['heating'] = null;
    if (site.heatingDbC != null) {
      const dt = site.indoorHeatC - site.heatingDbC;
      const parts = zeroParts(HEAT_PARTS);
      for (const surface of own) {
        if (surface.uHeat == null) continue;
        const loss = surface.uHeat * surface.areaM2 * dt;
        if (surface.kind === 'roof') parts.roof += loss;
        else if (surface.kind === 'window') parts.windows += loss;
        else if (surface.kind === 'door') parts.doors += loss;
        else parts.walls += loss;
      }
      parts.floor = SLAB_F_SI * perimeterM * dt;
      parts.infiltration = 1.23 * flowLs * dt * pressureRatio;
      heating = { totalW: HEAT_PARTS.reduce((sum, key) => sum + parts[key], 0), parts };
    }
    return { roomId: room.id, surfaces: own, perimeterM, slab, ach, volumeM3, hourly, cooling, heating, missing };
  });

  let block: DesignLoadReport['block'] = null;
  if (site.coolingDbC != null && rooms.length > 0) {
    const sums = hours.map((_, index) => rooms.reduce((sum, room) => sum + (room.hourly?.[index] ?? 0), 0));
    const peakIndex = sums.reduce((best, value, index) => (value > sums[best] ? index : best), 0);
    block = { hour: peakIndex + 1, sensibleW: sums[peakIndex], latentW: rooms.reduce((sum, room) => sum + (room.cooling?.latentW ?? 0), 0) };
  }
  const heatingW = site.heatingDbC != null ? rooms.reduce((sum, room) => sum + (room.heating?.totalW ?? 0), 0) : null;
  return { rooms, block, heatingW, gaps: siteGaps(site) };
}

export function hourLabel(hour: number): string {
  return `${String(hour % 24).padStart(2, '0')}:00`;
}
