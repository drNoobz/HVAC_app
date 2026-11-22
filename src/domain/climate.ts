import type { SiteClimate, SiteNumberKey } from './types';

export const SITE_NUMBER_KEYS: SiteNumberKey[] = [
  'latitudeDeg',
  'longitudeDeg',
  'timeZoneH',
  'elevationM',
  'heatingDbC',
  'coolingDbC',
  'coolingWbC',
  'coolingRangeK',
  'windMs',
  'windDirDeg',
  'taub',
  'taud',
  'groundC',
  'infiltrationAch',
];

const F_TO_C = (f: number) => ((f - 32) * 5) / 9;

/** Indoor defaults: cooling 75 °F at 50% RH, heating 70 °F. */
export function blankSite(): SiteClimate {
  return {
    station: '',
    fileName: '',
    latitudeDeg: null,
    longitudeDeg: null,
    timeZoneH: null,
    elevationM: null,
    heatingDbC: null,
    coolingDbC: null,
    coolingWbC: null,
    coolingRangeK: null,
    coolingMonth: 7,
    windMs: null,
    windDirDeg: null,
    taub: null,
    taud: null,
    tauEdition: '2017',
    groundC: null,
    groundReflectance: 0.2,
    surfaceColor: 'dark',
    indoorCoolC: F_TO_C(75),
    indoorCoolRh: 50,
    indoorHeatC: F_TO_C(70),
    infiltrationAch: null,
    sources: {},
  };
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

export function normalizeSite(value: unknown): SiteClimate | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<SiteClimate>;
  const base = blankSite();
  const next: SiteClimate = { ...base };
  for (const key of SITE_NUMBER_KEYS) next[key] = num(raw[key]);
  next.station = typeof raw.station === 'string' ? raw.station : '';
  next.fileName = typeof raw.fileName === 'string' ? raw.fileName : '';
  const month = num(raw.coolingMonth);
  next.coolingMonth = month != null && month >= 1 && month <= 12 ? Math.round(month) : base.coolingMonth;
  next.tauEdition = raw.tauEdition === '2009' ? '2009' : '2017';
  const rho = num(raw.groundReflectance);
  next.groundReflectance = rho != null && rho >= 0 && rho <= 1 ? rho : base.groundReflectance;
  next.surfaceColor = raw.surfaceColor === 'light' ? 'light' : 'dark';
  next.indoorCoolC = num(raw.indoorCoolC) ?? base.indoorCoolC;
  const rh = num(raw.indoorCoolRh);
  next.indoorCoolRh = rh != null && rh > 0 && rh < 100 ? rh : base.indoorCoolRh;
  next.indoorHeatC = num(raw.indoorHeatC) ?? base.indoorHeatC;
  const sources: SiteClimate['sources'] = {};
  if (raw.sources && typeof raw.sources === 'object') {
    for (const key of SITE_NUMBER_KEYS) {
      const source = (raw.sources as Record<string, unknown>)[key];
      if (source === 'file' || source === 'manual') sources[key] = source;
    }
  }
  next.sources = sources;
  return next;
}

export function siteOf(project: { site?: SiteClimate }): SiteClimate {
  return project.site ?? blankSite();
}

/** Inputs the design-day calculation needs, by label. */
export function siteMissing(site: SiteClimate): string[] {
  const missing: string[] = [];
  if (site.latitudeDeg == null) missing.push('latitude');
  if (site.longitudeDeg == null || site.timeZoneH == null) missing.push('longitude and time zone');
  if (site.coolingDbC == null) missing.push('cooling design dry bulb');
  if (site.coolingWbC == null) missing.push('coincident wet bulb');
  if (site.coolingRangeK == null) missing.push('daily range');
  if (site.heatingDbC == null) missing.push('heating design dry bulb');
  if (site.taub == null || site.taud == null) missing.push('taub and taud');
  if (site.infiltrationAch == null) missing.push('infiltration');
  return missing;
}

/** ASHRAE Fundamentals Ch. 1, Eq. 3: standard pressure at elevation, kPa. */
export function pressureKpa(elevationM: number | null): number {
  return 101.325 * Math.pow(1 - 2.25577e-5 * (elevationM ?? 0), 5.2559);
}

/** Hyland–Wexler saturation pressure over liquid water, kPa (ASHRAE Ch. 1, Eq. 6). */
export function saturationKpa(tC: number): number {
  const T = tC + 273.15;
  const ln = -5.8002206e3 / T + 1.3914993 - 4.8640239e-2 * T + 4.1764768e-5 * T * T - 1.4452093e-8 * T ** 3 + 6.5459673 * Math.log(T);
  return Math.exp(ln) / 1000;
}

export function humidityRatioRh(tC: number, rhPct: number, pKpa: number): number {
  const pw = (rhPct / 100) * saturationKpa(tC);
  return (0.621945 * pw) / (pKpa - pw);
}

/** ASHRAE Ch. 1, Eq. 33: humidity ratio from dry bulb and wet bulb above freezing. */
export function humidityRatioWb(dbC: number, wbC: number, pKpa: number): number {
  const ps = saturationKpa(wbC);
  const ws = (0.621945 * ps) / (pKpa - ps);
  return ((2501 - 2.326 * wbC) * ws - 1.006 * (dbC - wbC)) / (2501 + 1.86 * dbC - 4.186 * wbC);
}

/** ASHRAE Ch. 14, Table 6: fraction of daily range below the peak, by solar hour 1–24. */
const DAILY_RANGE_FRACTION = [0.88, 0.92, 0.95, 0.98, 1.0, 0.98, 0.91, 0.74, 0.55, 0.38, 0.23, 0.13, 0.05, 0.0, 0.0, 0.06, 0.14, 0.24, 0.39, 0.5, 0.59, 0.68, 0.75, 0.82];

const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function designDayOfYear(month: number): number {
  return MONTH_START[Math.min(11, Math.max(0, month - 1))] + 21;
}

/** Apparent solar time for a local standard clock hour (ASHRAE Ch. 14, Eqs. 5 and 7). */
export function apparentSolarHour(site: SiteClimate, clockHour: number): number {
  const n = designDayOfYear(site.coolingMonth);
  const g = rad((360 * (n - 1)) / 365);
  const et = 2.2918 * (0.0075 + 0.1868 * Math.cos(g) - 3.2077 * Math.sin(g) - 1.4615 * Math.cos(2 * g) - 4.089 * Math.sin(2 * g));
  const lonFix = site.longitudeDeg != null && site.timeZoneH != null ? (site.longitudeDeg - 15 * site.timeZoneH) / 15 : 0;
  return clockHour + et / 60 + lonFix;
}

export function outdoorDb(site: SiteClimate, clockHour: number): number | null {
  if (site.coolingDbC == null) return null;
  const ast = apparentSolarHour(site, clockHour);
  const index = ((Math.round(ast) - 1) % 24 + 24) % 24;
  return site.coolingDbC - DAILY_RANGE_FRACTION[index] * (site.coolingRangeK ?? 0);
}

export interface SunState {
  altitudeDeg: number;
  azimuthDeg: number;
  beamNormal: number;
  diffuseHorizontal: number;
}

/** ASHRAE Ch. 14 clear-sky model on the 21st of the cooling month. Null when latitude or optical depths are missing. */
export function sunAt(site: SiteClimate, clockHour: number): SunState | null {
  if (site.latitudeDeg == null || site.taub == null || site.taud == null) return null;
  const n = designDayOfYear(site.coolingMonth);
  const decl = 23.45 * Math.sin(rad((360 * (n + 284)) / 365));
  const hourAngle = 15 * (apparentSolarHour(site, clockHour) - 12);
  const L = rad(site.latitudeDeg);
  const d = rad(decl);
  const H = rad(hourAngle);
  const sinBeta = Math.cos(L) * Math.cos(d) * Math.cos(H) + Math.sin(L) * Math.sin(d);
  const beta = deg(Math.asin(Math.max(-1, Math.min(1, sinBeta))));
  const cosBeta = Math.cos(rad(beta));
  const sinPhi = (Math.sin(H) * Math.cos(d)) / Math.max(cosBeta, 1e-9);
  const cosPhi = (Math.cos(H) * Math.cos(d) * Math.sin(L) - Math.sin(d) * Math.cos(L)) / Math.max(cosBeta, 1e-9);
  const azimuthDeg = (180 + deg(Math.atan2(sinPhi, cosPhi)) + 360) % 360;
  if (beta <= 0) return { altitudeDeg: beta, azimuthDeg, beamNormal: 0, diffuseHorizontal: 0 };
  const e0 = 1367 * (1 + 0.033 * Math.cos(rad((360 * (n - 3)) / 365)));
  const m = 1 / (Math.sin(rad(beta)) + 0.50572 * Math.pow(6.07995 + beta, -1.6364));
  const tb = site.taub;
  const td = site.taud;
  const ab = site.tauEdition === '2009' ? 1.219 - 0.043 * tb - 0.151 * td - 0.204 * tb * td : 1.454 - 0.406 * tb - 0.268 * td + 0.021 * tb * td;
  const ad = site.tauEdition === '2009' ? 0.202 + 0.852 * tb - 0.007 * td - 0.357 * tb * td : 0.507 + 0.205 * tb - 0.08 * td - 0.19 * tb * td;
  return {
    altitudeDeg: beta,
    azimuthDeg,
    beamNormal: e0 * Math.exp(-tb * Math.pow(m, ab)),
    diffuseHorizontal: e0 * Math.exp(-td * Math.pow(m, ad)),
  };
}

/** Total irradiance on a surface, W/m². Azimuth is degrees clockwise from north; tilt 90 is a wall, 0 is a roof. */
export function surfaceIrradiance(sun: SunState | null, azimuthDeg: number, tiltDeg: number, groundReflectance: number): { total: number; beam: number } {
  if (!sun || sun.altitudeDeg <= 0) return { total: 0, beam: 0 };
  const beta = rad(sun.altitudeDeg);
  const tilt = rad(tiltDeg);
  const gamma = rad(sun.azimuthDeg - azimuthDeg);
  const cosTheta = Math.cos(beta) * Math.cos(gamma) * Math.sin(tilt) + Math.sin(beta) * Math.cos(tilt);
  const beam = sun.beamNormal * Math.max(0, cosTheta);
  const y = Math.max(0.45, 0.55 + 0.437 * cosTheta + 0.313 * cosTheta * cosTheta);
  const diffuse = tiltDeg >= 89.9 ? sun.diffuseHorizontal * y : sun.diffuseHorizontal * (y * Math.sin(tilt) + Math.cos(tilt));
  const ground = (sun.beamNormal * Math.sin(beta) + sun.diffuseHorizontal) * groundReflectance * ((1 - Math.cos(tilt)) / 2);
  return { total: beam + diffuse + ground, beam };
}

export interface WeatherImport {
  patch: Partial<SiteClimate>;
  filled: SiteNumberKey[];
  message: string;
}

function setField(patch: Partial<SiteClimate>, filled: SiteNumberKey[], key: SiteNumberKey, value: number | null) {
  if (value == null || !Number.isFinite(value)) return;
  patch[key] = value;
  if (!filled.includes(key)) filled.push(key);
}

function parseNumber(text: string | undefined): number | null {
  if (text == null || text.trim() === '') return null;
  const n = Number(text.trim());
  return Number.isFinite(n) ? n : null;
}

function parseEpw(text: string, patch: Partial<SiteClimate>, filled: SiteNumberKey[]): string[] {
  const notes: string[] = [];
  const lines = text.split(/\r?\n/, 9);
  const loc = lines.find(line => line.startsWith('LOCATION'))?.split(',');
  if (loc) {
    patch.station = [loc[1], loc[2], loc[3]].filter(part => part && part !== '-').join(', ');
    setField(patch, filled, 'latitudeDeg', parseNumber(loc[6]));
    setField(patch, filled, 'longitudeDeg', parseNumber(loc[7]));
    setField(patch, filled, 'timeZoneH', parseNumber(loc[8]));
    setField(patch, filled, 'elevationM', parseNumber(loc[9]));
  }
  const design = lines.find(line => line.startsWith('DESIGN CONDITIONS'))?.split(',');
  const h = design ? design.indexOf('Heating') : -1;
  const c = design ? design.indexOf('Cooling') : -1;
  if (design && h > 0) setField(patch, filled, 'heatingDbC', parseNumber(design[h + 2]));
  if (design && c > 0) {
    const month = parseNumber(design[c + 1]);
    if (month != null && month >= 1 && month <= 12) patch.coolingMonth = Math.round(month);
    setField(patch, filled, 'coolingRangeK', parseNumber(design[c + 2]));
    setField(patch, filled, 'coolingDbC', parseNumber(design[c + 3]));
    setField(patch, filled, 'coolingWbC', parseNumber(design[c + 4]));
    setField(patch, filled, 'windMs', parseNumber(design[c + 15]));
    setField(patch, filled, 'windDirDeg', parseNumber(design[c + 16]));
  }
  if (!design || h < 0 || c < 0) notes.push('This EPW has no ASHRAE design conditions in its header.');
  const ground = lines.find(line => line.startsWith('GROUND TEMPERATURES'))?.split(',');
  if (ground && Number(ground[1]) > 0) {
    const month = patch.coolingMonth ?? 7;
    setField(patch, filled, 'groundC', parseNumber(ground[6 + month - 1]));
  }
  notes.push('EPW files do not carry clear-sky optical depths. Import the matching DDY or STAT file, or enter taub and taud.');
  return notes;
}

type IdfObject = { type: string; fields: { value: string; label: string }[] };

function idfObjects(text: string): IdfObject[] {
  const objects: IdfObject[] = [];
  let current: IdfObject | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const bang = raw.indexOf('!');
    const body = (bang >= 0 ? raw.slice(0, bang) : raw).trim();
    const label = bang >= 0 ? raw.slice(bang + 1).replace(/^-\s*/, '').trim() : '';
    if (!body) continue;
    const parts = body.split(/[,;]/);
    const ends = body.includes(';');
    for (let i = 0; i < parts.length; i += 1) {
      const value = parts[i].trim();
      const last = i === parts.length - 1;
      if (last && value === '') continue;
      if (!current) {
        current = { type: value.toLowerCase(), fields: [] };
        continue;
      }
      current.fields.push({ value, label: last || parts.length === 2 ? label : '' });
    }
    if (ends && current) {
      objects.push(current);
      current = null;
    }
  }
  return objects;
}

function idfValue(object: IdfObject, pattern: RegExp): string | undefined {
  return object.fields.find(field => pattern.test(field.label))?.value;
}

function parseDdy(text: string, patch: Partial<SiteClimate>, filled: SiteNumberKey[]): string[] {
  const notes: string[] = [];
  const objects = idfObjects(text);
  const site = objects.find(object => object.type === 'site:location');
  if (site) {
    patch.station = (site.fields[0]?.value ?? '').replace(/\s*Design_Conditions$/i, '');
    setField(patch, filled, 'latitudeDeg', parseNumber(idfValue(site, /^Latitude/i)));
    setField(patch, filled, 'longitudeDeg', parseNumber(idfValue(site, /^Longitude/i)));
    setField(patch, filled, 'timeZoneH', parseNumber(idfValue(site, /^Time Zone/i)));
    setField(patch, filled, 'elevationM', parseNumber(idfValue(site, /^Elevation/i)));
  }
  const days = objects.filter(object => object.type === 'sizingperiod:designday');
  const name = (object: IdfObject) => object.fields[0]?.value ?? '';
  const heating = days.find(day => /Htg 99\.6%/i.test(name(day))) ?? days.find(day => /Htg 99%/i.test(name(day)));
  const cooling = days.find(day => /Ann Clg \.4%.*DB=>M/i.test(name(day))) ?? days.find(day => /Clg \.4%.*DB=>M/i.test(name(day)));
  if (heating) setField(patch, filled, 'heatingDbC', parseNumber(idfValue(heating, /^Maximum Dry-Bulb/i)));
  else notes.push('No 99.6% heating design day was found.');
  if (cooling) {
    const month = parseNumber(idfValue(cooling, /^Month$/i));
    if (month != null && month >= 1 && month <= 12) patch.coolingMonth = Math.round(month);
    setField(patch, filled, 'coolingDbC', parseNumber(idfValue(cooling, /^Maximum Dry-Bulb/i)));
    setField(patch, filled, 'coolingRangeK', parseNumber(idfValue(cooling, /^Daily Dry-Bulb Temperature Range/i)));
    const humidity = idfValue(cooling, /^Humidity Condition Type/i);
    if (!humidity || /wetbulb/i.test(humidity)) setField(patch, filled, 'coolingWbC', parseNumber(idfValue(cooling, /^Wetbulb or DewPoint at Maximum Dry-Bulb/i)));
    setField(patch, filled, 'windMs', parseNumber(idfValue(cooling, /^Wind Speed/i)));
    setField(patch, filled, 'windDirDeg', parseNumber(idfValue(cooling, /^Wind Direction/i)));
    const model = idfValue(cooling, /^Solar Model Indicator/i) ?? '';
    if (/ASHRAETau/i.test(model)) {
      setField(patch, filled, 'taub', parseNumber(idfValue(cooling, /taub/i)));
      setField(patch, filled, 'taud', parseNumber(idfValue(cooling, /taud/i)));
      patch.tauEdition = /2017/.test(model) ? '2017' : '2009';
    }
  } else notes.push('No 0.4% cooling design day was found.');
  return notes;
}

function parseDms(match: RegExpMatchArray | null): number | null {
  if (!match) return null;
  const value = Number(match[2]) + Number(match[3]) / 60;
  return /[SW]/.test(match[1]) ? -value : value;
}

function parseStat(text: string, patch: Partial<SiteClimate>, filled: SiteNumberKey[]): string[] {
  const notes: string[] = [];
  const station = text.match(/Location\s*--\s*(.+)/);
  if (station) patch.station = station[1].trim();
  setField(patch, filled, 'latitudeDeg', parseDms(text.match(/\{([NS])\s*(\d+)°\s*(\d+)'\}/)));
  setField(patch, filled, 'longitudeDeg', parseDms(text.match(/\{([EW])\s*(\d+)°\s*(\d+)'\}/)));
  const tz = text.match(/\{GMT\s*([+-]?\d+(?:\.\d+)?)\s*Hours\}/);
  setField(patch, filled, 'timeZoneH', tz ? Number(tz[1]) : null);
  const elevation = text.match(/Elevation\s*--\s*(-?\d+(?:\.\d+)?)m\s*(above|below)/i);
  setField(patch, filled, 'elevationM', elevation ? Number(elevation[1]) * (elevation[2].toLowerCase() === 'below' ? -1 : 1) : null);
  const row = (name: string) => {
    const line = text.split(/\r?\n/).find(item => item.trim().toLowerCase().startsWith(name));
    if (!line) return null;
    const values = line.split(/\t+/).slice(1).map(item => Number(item.trim())).filter(Number.isFinite);
    return values.length >= 12 ? values : null;
  };
  const month = patch.coolingMonth ?? 7;
  const taub = row('taub');
  const taud = row('taud');
  if (taub && taud) {
    setField(patch, filled, 'taub', taub[month - 1]);
    setField(patch, filled, 'taud', taud[month - 1]);
  } else notes.push('No monthly taub and taud rows were found.');
  notes.push('Design temperatures are not read from STAT files. Import the DDY or EPW file for those.');
  return notes;
}

/** Reads an EnergyPlus EPW, DDY, or STAT file. Only the fields found are returned. */
export function importWeatherFile(fileName: string, text: string, current: SiteClimate): WeatherImport {
  const patch: Partial<SiteClimate> = { coolingMonth: current.coolingMonth };
  const filled: SiteNumberKey[] = [];
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  let notes: string[];
  if (ext === 'epw') notes = parseEpw(text, patch, filled);
  else if (ext === 'ddy') notes = parseDdy(text, patch, filled);
  else if (ext === 'stat') notes = parseStat(text, patch, filled);
  else return { patch: {}, filled: [], message: 'Choose an .epw, .ddy, or .stat file.' };
  if (filled.length === 0) return { patch: {}, filled: [], message: ['No climate values were found in that file.', ...notes].join(' ') };
  if (!patch.station) delete patch.station;
  patch.fileName = fileName;
  return { patch, filled, message: [`Filled ${filled.length} values from ${fileName}.`, ...notes].join(' ') };
}

export const CLIMATE_METHOD_NOTES = [
  'Design day: ASHRAE Fundamentals Ch. 14. Hourly dry bulb uses the Table 6 fraction of the daily range, by apparent solar time. Daylight saving time is not applied.',
  'Solar: ASHRAE clear-sky model on the 21st of the cooling month, with the air-mass exponents for the stated taub/taud edition. Ground reflectance as entered.',
  'Opaque surfaces: sol-air temperature (Ch. 18) with α/ho 0.052 m²·K/W for dark or 0.026 for light surfaces, and a 3.9 K sky long-wave correction on roofs.',
  'Heat gain is taken as cooling load in the same hour. Radiant and conduction time series (RTS/CTS) are not applied, so heavy walls peak earlier and higher than they would.',
  'Windows: U × area × (outdoor − indoor) plus SHGC × area × incident solar. No interior shading and no angle correction.',
  'Air films: inside 0.68 (walls), 0.92 roof summer, 0.61 roof winter; outside 0.25 summer, 0.17 winter, h·ft²·°F/Btu.',
  'Ground floor: slab-on-grade heat loss with F-factor 0.73 Btu/(h·ft·°F) on the exposed perimeter (ASHRAE 90.1 Appendix A, unheated, uninsulated).',
  'Infiltration: air changes per hour × volume. Sensible 1.23 W per L/s·K, latent 3010 W per L/s per kg/kg, scaled by site pressure.',
];
