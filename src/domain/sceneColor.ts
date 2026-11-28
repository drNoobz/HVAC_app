/**
 * Real colours for the 3D view. three.js needs numbers, while the plan's colours are CSS: tokens (`var(--ink)`) and
 * `ink()` / `wash()` expressions that change with the theme. These helpers let the browser resolve the CSS in the
 * current theme, then read the result back as sRGB. Results are cached per theme.
 */
import { currentTheme } from './theme';

let probe: HTMLElement | null = null;
let pixel: CanvasRenderingContext2D | null = null;
const cache = new Map<string, { rgba: string; hex: number }>();

function resolve(css: string): { rgba: string; hex: number } {
  const key = `${currentTheme()}|${css}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return { rgba: 'rgb(128,128,128)', hex: 0x808080 };
  if (!probe) {
    probe = document.createElement('span');
    probe.style.display = 'none';
    document.body.appendChild(probe);
  }
  if (!pixel) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    pixel = canvas.getContext('2d', { willReadFrequently: true });
  }
  probe.style.color = '';
  probe.style.color = css;
  const computed = getComputedStyle(probe).color;
  let result = { rgba: computed, hex: 0x808080 };
  if (pixel) {
    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = '#808080';
    pixel.fillStyle = computed;
    pixel.fillRect(0, 0, 1, 1);
    // getImageData returns unpremultiplied values, so a translucent token keeps its own rgb and alpha.
    const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
    result = { rgba: `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`, hex: (r << 16) | (g << 8) | b };
  }
  cache.set(key, result);
  return result;
}

/** A CSS colour (hex, token or ink()/wash() expression) as a three.js colour number in the current theme. */
export function sceneColor(css: string): number {
  return resolve(css).hex;
}

/** A CSS colour as an `rgba()` string a canvas can draw with, in the current theme. */
export function canvasColor(css: string): string {
  return resolve(css).rgba;
}
