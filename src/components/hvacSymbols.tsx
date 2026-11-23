import type { ReactNode } from 'react';
import type { SensorKind, ValveKind } from '@/domain/types';

/**
 * HVAC drawing symbols after ANSI/ASHRAE Standard 134 (graphic symbols for HVAC and refrigeration) and ANSI/ISA-5.1
 * (instrumentation symbols and identification). The shapes follow the common conventions of those standards; check
 * them against the published editions or your office legend before issuing drawings. Every plan and diagram symbol
 * in the app comes from this file, so a correction is made once.
 *
 * Coordinates are the caller's: plan metres with +y up. Line weights do not scale with zoom.
 */

export const SYMBOL_INK = '#2a2e32';

const NS = 'non-scaling-stroke' as const;

function stroke(color: string, width = 1.1, fill = 'none') {
  return { stroke: color, strokeWidth: width, fill, vectorEffect: NS, pointerEvents: 'none' as const };
}

/** Text upright on screen inside a +y-up frame that is rotated by `yaw` degrees. */
export function UprightText({
  x,
  y,
  size,
  color,
  yaw = 0,
  weight = 600,
  children,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  yaw?: number;
  weight?: number;
  children: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${-yaw}) scale(1,-1)`} pointerEvents="none">
      <text textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={weight} fill={color}>
        {children}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------------------------------------------------------
 * Diagram symbols (ASHRAE 134). Drawn across a duct of inside height h, centred on (x, y). Air moves along x;
 * `dir` is +1 when it moves toward +x. `length` is the room the symbol takes along the duct.
 * ---------------------------------------------------------------------------------------------------------------- */

interface InDuct {
  x: number;
  y: number;
  h: number;
  length: number;
  color: string;
}

/**
 * Control damper: blades on pivots in a frame. Opposed blades alternate; parallel blades turn together. A motorized
 * damper carries an operator (M) on the side given; a gravity (barometric) damper has none.
 */
export function ControlDamper({ x, y, h, length, color, blades = 'opposed', operator = 'motor', operatorSide = -1 }: InDuct & { blades?: 'opposed' | 'parallel'; operator?: 'motor' | 'gravity'; operatorSide?: 1 | -1 }) {
  const count = 3;
  const half = (h / count) * 0.42;
  const tilt = 0.6;
  return (
    <g pointerEvents="none">
      <rect x={x - length / 2} y={y - h / 2} width={length} height={h} {...stroke(color, 1.1, '#fff')} />
      {Array.from({ length: count }, (_, index) => {
        const by = y - h / 2 + (h * (index + 0.5)) / count;
        const sign = blades === 'parallel' || index % 2 === 0 ? 1 : -1;
        return (
          <g key={index}>
            <line x1={x - half * tilt * sign} y1={by - half} x2={x + half * tilt * sign} y2={by + half} {...stroke(color, 1.2)} />
            <circle cx={x} cy={by} r={h * 0.025} fill={color} />
          </g>
        );
      })}
      {operator === 'motor' ? (
        <MotorOperator at={x} from={y + operatorSide * (h / 2)} side={operatorSide} size={h * 0.13} color={color} />
      ) : (
        // Gravity damper: counterweight arm on the top blade.
        <g>
          <line x1={x} y1={y + h / 2 - h / (count * 2)} x2={x + length * 0.9} y2={y + h / 2 - h / (count * 2) + h * 0.12} {...stroke(color)} />
          <circle cx={x + length * 0.9} cy={y + h / 2 - h / (count * 2) + h * 0.12} r={h * 0.04} fill={color} />
        </g>
      )}
    </g>
  );
}

/**
 * Electric operator (ISA-5.1 motor actuator): a stem from the device to a circle marked M. The stem runs along y from
 * (`at`, `from`), or along x from (`from`, `at`) when `alongX` is set, toward `side`.
 */
export function MotorOperator({ at, from, side, size, color, letter = 'M', alongX = false }: { at: number; from: number; side: 1 | -1; size: number; color: string; letter?: string; alongX?: boolean }) {
  const reach = size * 1.6;
  const end = from + side * (reach + size);
  const [x1, y1, x2, y2, cx, cy] = alongX ? [from, at, from + side * reach, at, end, at] : [at, from, at, from + side * reach, at, end];
  return (
    <g pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} {...stroke(color)} />
      <circle cx={cx} cy={cy} r={size} {...stroke(color, 1.1, '#fff')} />
      <UprightText x={cx} y={cy} size={size * 1.15} color={color}>
        {letter}
      </UprightText>
    </g>
  );
}

/** Filter: pleated media across the duct. */
export function DuctFilter({ x, y, h, length, color }: InDuct) {
  const folds = 6;
  const points = Array.from({ length: folds + 1 }, (_, i) => `${x + (i % 2 === 0 ? -length * 0.32 : length * 0.32)},${y - h / 2 + (h * i) / folds}`).join(' ');
  return (
    <g pointerEvents="none">
      <rect x={x - length / 2} y={y - h / 2} width={length} height={h} {...stroke(color, 1.1, '#fff')} />
      <polyline points={points} {...stroke(color)} />
    </g>
  );
}

/** Coil: frame with a diagonal. Piped coils mark supply (S) and return (R) connections. */
export function DuctCoil({ x, y, h, length, color, piped }: InDuct & { piped: boolean }) {
  return (
    <g pointerEvents="none">
      <rect x={x - length / 2} y={y - h / 2} width={length} height={h} {...stroke(color, 1.1, '#fff')} />
      <line x1={x - length / 2} y1={y - h / 2} x2={x + length / 2} y2={y + h / 2} {...stroke(color)} />
      {piped && (
        <>
          <UprightText x={x + length * 0.2} y={y + h * 0.36} size={h * 0.13} color={color} weight={500}>
            S
          </UprightText>
          <UprightText x={x - length * 0.2} y={y - h * 0.36} size={h * 0.13} color={color} weight={500}>
            R
          </UprightText>
        </>
      )}
    </g>
  );
}

/** Centrifugal fan (blower): impeller circle in a scroll housing whose outlet points downstream. */
export function CentrifugalFan({ x, y, h, color, dir }: { x: number; y: number; h: number; color: string; dir: 1 | -1 }) {
  const r = h * 0.38;
  return (
    <g pointerEvents="none">
      <path
        d={`M ${x - dir * r * 1.12} ${y} A ${r * 1.12} ${r * 1.12} 0 1 ${dir > 0 ? 0 : 1} ${x} ${y - r * 1.12} L ${x + dir * r * 1.45} ${y - r * 1.12} L ${x + dir * r * 1.45} ${y - r * 0.1}`}
        {...stroke(color, 1.1, '#fff')}
      />
      <circle cx={x} cy={y} r={r * 0.78} {...stroke(color)} />
      <circle cx={x} cy={y} r={r * 0.1} fill={color} />
    </g>
  );
}

/** Axial or propeller fan in a duct: two blades about a hub. */
export function AxialFan({ x, y, h, length, color }: InDuct) {
  return (
    <g pointerEvents="none">
      <ellipse cx={x} cy={y + h * 0.2} rx={length * 0.16} ry={h * 0.18} {...stroke(color, 1.1, '#fff')} />
      <ellipse cx={x} cy={y - h * 0.2} rx={length * 0.16} ry={h * 0.18} {...stroke(color, 1.1, '#fff')} />
      <circle cx={x} cy={y} r={h * 0.035} fill={color} />
    </g>
  );
}

/** Air-to-air heat exchanger across two streams: frame with crossed diagonals. */
export function HeatExchanger({ x, y0, y1, length, color }: { x: number; y0: number; y1: number; length: number; color: string }) {
  return (
    <g pointerEvents="none">
      <rect x={x - length / 2} y={y0} width={length} height={y1 - y0} {...stroke(color, 1.1, '#fff')} />
      <line x1={x - length / 2} y1={y0} x2={x + length / 2} y2={y1} {...stroke(color)} />
      <line x1={x - length / 2} y1={y1} x2={x + length / 2} y2={y0} {...stroke(color)} />
    </g>
  );
}

/** Steam humidifier: dispersion manifold with nozzles across the duct. */
export function Humidifier({ x, y, h, length, color }: InDuct) {
  return (
    <g pointerEvents="none">
      <rect x={x - length / 2} y={y - h / 2} width={length} height={h} {...stroke(color, 1.1, '#fff')} />
      <line x1={x} y1={y - h * 0.4} x2={x} y2={y + h * 0.4} {...stroke(color)} />
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={x} y1={y - h / 2 + h * f} x2={x + length * 0.3} y2={y - h / 2 + h * f + h * 0.05} {...stroke(color, 0.9)} />
      ))}
    </g>
  );
}

/** Mixing plenum: dashed boundary of the chamber where streams meet. */
export function MixingPlenum({ x, y0, y1, length, color }: { x: number; y0: number; y1: number; length: number; color: string }) {
  return <rect x={x - length / 2} y={y0} width={length} height={y1 - y0} {...stroke(color)} strokeDasharray="4 3" strokeOpacity={0.6} />;
}

/** Condensing section seen from above: outdoor coil along one side, condenser fans (propellers) discharging up. */
export function CondenserSection({ x0, x1, y0, y1, fans, color }: { x0: number; x1: number; y0: number; y1: number; fans: { x: number; y: number; r: number }[]; color: string }) {
  const coil = Math.min((y1 - y0) * 0.14, (x1 - x0) * 0.2);
  const steps = Math.max(4, Math.round(((x1 - x0) / Math.max(coil, 1e-6)) * 1.2));
  const fins = Array.from({ length: steps + 1 }, (_, i) => `${x0 + ((x1 - x0) * i) / steps},${y0 + (i % 2 === 0 ? coil * 0.15 : coil * 0.85)}`).join(' ');
  return (
    <g pointerEvents="none">
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} {...stroke(color, 1.1, '#fff')} />
      <rect x={x0} y={y0} width={x1 - x0} height={coil} {...stroke(color, 0.9)} />
      <polyline points={fins} {...stroke(color, 0.8)} />
      {fans.map((fan, index) => (
        <PropellerFan key={index} x={fan.x} y={fan.y} r={fan.r} color={color} />
      ))}
    </g>
  );
}

/** Propeller fan seen along its axis: housing circle, three blades, hub. */
export function PropellerFan({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={r} {...stroke(color, 1.1, '#fff')} />
      {[0, 1, 2].map(i => {
        const a = (i * 2 * Math.PI) / 3;
        const bx = x + Math.cos(a) * r * 0.5;
        const by = y + Math.sin(a) * r * 0.5;
        return <ellipse key={i} cx={bx} cy={by} rx={r * 0.42} ry={r * 0.17} transform={`rotate(${(a * 180) / Math.PI} ${bx} ${by})`} {...stroke(color)} />;
      })}
      <circle cx={x} cy={y} r={r * 0.1} fill={color} />
    </g>
  );
}

/* ------------------------------------------------------------------------------------------------------------------
 * Valves (ASHRAE 134 bodies, ISA-5.1 actuators). Drawn on a vertical pipe through (x, y); `size` is half the body.
 * ---------------------------------------------------------------------------------------------------------------- */

export function Valve({ x, y, size, kind, color }: { x: number; y: number; size: number; kind: ValveKind; color: string }) {
  const s = size;
  // Two triangles tip to tip along the pipe.
  const body = `M ${x - s * 0.6} ${y + s} L ${x + s * 0.6} ${y + s} L ${x} ${y} Z M ${x - s * 0.6} ${y - s} L ${x + s * 0.6} ${y - s} L ${x} ${y} Z`;
  return (
    <g pointerEvents="none">
      <path d={body} {...stroke(color, 1.1, '#fff')} />
      {kind === 'three-way' && <path d={`M ${x - s} ${y - s * 0.6} L ${x - s} ${y + s * 0.6} L ${x} ${y} Z`} {...stroke(color, 1.1, '#fff')} />}
      {(kind === 'two-way' || kind === 'three-way') && <MotorOperator at={y} from={x} side={1} size={s * 0.55} color={color} alongX />}
      {kind === 'solenoid' && (
        <g>
          <line x1={x} y1={y} x2={x + s * 1.3} y2={y} {...stroke(color)} />
          <rect x={x + s * 1.3} y={y - s * 0.5} width={s} height={s} {...stroke(color, 1.1, '#fff')} />
          <UprightText x={x + s * 1.8} y={y} size={s * 0.7} color={color}>
            S
          </UprightText>
        </g>
      )}
      {kind === 'back-pressure' && (
        // Self-contained regulator: diaphragm operator with a sensing line to the upstream pipe.
        <g>
          <line x1={x} y1={y} x2={x + s * 1.2} y2={y} {...stroke(color)} />
          <path d={`M ${x + s * 1.2} ${y - s * 0.6} A ${s * 0.6} ${s * 0.6} 0 0 1 ${x + s * 1.2} ${y + s * 0.6} Z`} {...stroke(color, 1.1, '#fff')} />
          <polyline points={`${x + s * 1.5},${y + s * 0.3} ${x + s * 2.2},${y + s * 0.3} ${x + s * 2.2},${y + s * 1.8} ${x},${y + s * 1.8}`} {...stroke(color, 0.8)} strokeDasharray="2 2" />
        </g>
      )}
      {kind === 'expansion' && (
        // Thermostatic expansion valve: capillary to a sensing bulb.
        <g>
          <line x1={x} y1={y} x2={x + s * 1.2} y2={y} {...stroke(color)} />
          <path d={`M ${x + s * 1.2} ${y - s * 0.6} A ${s * 0.6} ${s * 0.6} 0 0 1 ${x + s * 1.2} ${y + s * 0.6} Z`} {...stroke(color, 1.1, '#fff')} />
          <polyline points={`${x + s * 1.8},${y} ${x + s * 2.6},${y} ${x + s * 2.6},${y + s * 1.6}`} {...stroke(color, 0.8)} strokeDasharray="2 2" />
          <rect x={x + s * 2.4} y={y + s * 1.6} width={s * 0.4} height={s * 0.8} fill={color} />
        </g>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------------------------------------------------------
 * Instruments (ISA-5.1). A field-mounted instrument is a plain circle: function letters on top, tag below.
 * ---------------------------------------------------------------------------------------------------------------- */

/** ISA-5.1 identification letters for a transmitter of each measured variable. */
export const ISA_LETTERS: Record<SensorKind, string> = {
  temperature: 'TT',
  humidity: 'MT',
  co2: 'AT',
  pressure: 'PT',
  'static-pressure': 'PDT',
  airflow: 'FT',
};

export function InstrumentBubble({ x, y, r, sensor, tag, color, yaw = 0, fill = '#fff', strokeWidth = 1.1 }: { x: number; y: number; r: number; sensor: SensorKind; tag: string; color: string; yaw?: number; fill?: string; strokeWidth?: number }) {
  const letters = ISA_LETTERS[sensor];
  const loop = tag.length > 6 ? `${tag.slice(0, 6)}…` : tag;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} stroke={color} strokeWidth={strokeWidth} vectorEffect={NS} />
      <g transform={`translate(${x} ${y}) rotate(${-yaw}) scale(1,-1)`} pointerEvents="none">
        <text y={-r * 0.3} textAnchor="middle" dominantBaseline="central" fontSize={r * (letters.length > 2 ? 0.55 : 0.68)} fontWeight={700} fill={color}>
          {letters}
        </text>
        <text y={r * 0.36} textAnchor="middle" dominantBaseline="central" fontSize={r * (loop.length > 4 ? 0.36 : 0.46)} fontWeight={500} fill={color}>
          {loop}
        </text>
      </g>
      {sensor === 'co2' && (
        <g transform={`translate(${x} ${y}) rotate(${-yaw}) scale(1,-1)`} pointerEvents="none">
          <text x={r * 1.25} y={-r * 0.7} textAnchor="start" dominantBaseline="central" fontSize={r * 0.42} fill={color}>
            CO₂
          </text>
        </g>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------------------------------------------------------
 * Plan symbols. Drawn inside an item's footprint (x0..x1, y0..y1) in its own rotated frame; the footprint outline is
 * drawn by the caller.
 * ---------------------------------------------------------------------------------------------------------------- */

export type PlanSymbolKind = 'supply-outlet' | 'return-inlet' | 'exhaust-inlet' | 'louver' | 'roof-hood' | 'centrifugal-fan' | 'axial-fan' | 'none';

export function PlanSymbol({ kind, x0, x1, y0, y1, color }: { kind: PlanSymbolKind; x0: number; x1: number; y0: number; y1: number; color: string }) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = x1 - x0;
  const h = y1 - y0;
  switch (kind) {
    case 'supply-outlet':
      // Supply outlet: both diagonals.
      return (
        <g pointerEvents="none">
          <line x1={x0} y1={y0} x2={x1} y2={y1} {...stroke(color)} />
          <line x1={x0} y1={y1} x2={x1} y2={y0} {...stroke(color)} />
        </g>
      );
    case 'return-inlet':
      // Return inlet: one diagonal.
      return <line x1={x0} y1={y0} x2={x1} y2={y1} {...stroke(color)} />;
    case 'exhaust-inlet':
      // Exhaust inlet: one diagonal, the opposite way to a return, so the two read apart.
      return <line x1={x0} y1={y1} x2={x1} y2={y0} {...stroke(color)} />;
    case 'louver': {
      const blades = Math.max(3, Math.min(10, Math.round(w / Math.max(h, 1e-6)) * 3));
      return (
        <g pointerEvents="none">
          {Array.from({ length: blades }, (_, i) => {
            const bx = x0 + (w * (i + 0.5)) / blades;
            return <line key={i} x1={bx - w / blades / 2} y1={y0 + h * 0.1} x2={bx + w / blades / 2} y2={y1 - h * 0.1} {...stroke(color, 0.9)} />;
          })}
        </g>
      );
    }
    case 'roof-hood':
      // Gravity hood: throat inside the hood outline.
      return <rect x={cx - w * 0.28} y={cy - h * 0.28} width={w * 0.56} height={h * 0.56} {...stroke(color, 0.9)} />;
    case 'centrifugal-fan': {
      const r = Math.min(w, h) * 0.4;
      return (
        <g pointerEvents="none">
          <circle cx={cx} cy={cy} r={r} {...stroke(color)} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
            const a = (i * Math.PI) / 4;
            return <line key={i} x1={cx + Math.cos(a) * r * 0.35} y1={cy + Math.sin(a) * r * 0.35} x2={cx + Math.cos(a + 0.45) * r * 0.85} y2={cy + Math.sin(a + 0.45) * r * 0.85} {...stroke(color, 0.9)} />;
          })}
          <circle cx={cx} cy={cy} r={r * 0.12} fill={color} />
        </g>
      );
    }
    case 'axial-fan':
      return <PropellerFan x={cx} y={cy} r={Math.min(w, h) * 0.4} color={color} />;
    default:
      return null;
  }
}
