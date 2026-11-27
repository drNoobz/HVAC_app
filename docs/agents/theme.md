# Light and dark themes

Users pick **Settings → Appearance**: Match system (default), Light or Dark. The choice is stored in this browser as
`hvac-theme` (`light`, `dark`, or absent for system) and applied as `data-theme` on `<html>`. A boot script in the root
layout (`src/domain/themeBoot.ts`) applies it before the first paint, so a dark page never flashes light.
`useThemeSync()` in `App.tsx` follows the system setting live while the choice is "Match system".

## Where colours come from

| Kind of colour | Where | How it changes in dark |
|---|---|---|
| UI (panels, text, buttons, borders, states) | Tokens in `:root` and `:root[data-theme="dark"]` in `src/app/globals.css` | Hand-picked dark values |
| Plan neutrals (paper, ink, grid, selection, halos, dimension teal) | `--plan-*` tokens; `PLAN_COLOR` in `src/domain/theme.ts` | Hand-picked dark values |
| Data colours (air types, wall constructions, loads, loops, unit streams) | Hex in `ductCatalog.ts`, `walls.ts`, `loadCatalog.ts`, `PlanView.tsx` | `ink()` / `wash()` |
| 3D view (sky, light, grid) | `SCENE_LOOK` in `Viewport.tsx` | Swapped on the theme event; the model's own colours stay |

Data colours stay hex because the 3D view (three.js) needs real colours. On the plan and in HTML swatches, wrap them:

- `ink(color)`: lines, text, markers, small swatches and translucent tints. Light: unchanged. Dark: OKLCH lightness
  becomes `0.48 + 0.55 L`, chroma × 0.9. Every colour reads on the dark paper, and a darker colour stays darker than a
  lighter one (a plain "at least L" lift made framed and masonry walls look the same).
- `wash(color)`: opaque pale fills such as room colours. Light: unchanged. Dark: lightness capped at 0.31, a dark tint
  of the same hue.
- `fade(color, amount)`: a colour mixed toward the plan background (white in light, the paper in dark). Use it instead
  of mixing toward white in JS.
- `ink()` and `wash()` pass through `none`, `transparent`, `currentColor`, `var(...)`, `color-mix(...)` and colours
  they already wrapped, so wrapping a value that might be one of those is safe.

These use CSS relative colour syntax (`oklch(from …)`), which works in SVG presentation attributes and inline styles.

## Rules

- Never hard-code a colour in a component or a new CSS rule. Use a token, or add one to **both** `:root` and the dark
  block, with a light value that keeps the light theme exactly as it was.
- White on the plan is almost always a halo or a hollow fill: use `PLAN_COLOR.halo` (white in light, the paper in dark),
  not `#fff`.
- Text on a coloured marker uses `PLAN_COLOR.halo` too, so it stays readable when `ink()` lightens the marker in dark.
- Dark palette principles: blue-slate neutrals; surfaces get lighter as they rise (background → panels → cards and
  menus → hover); text is off-white (`#e2e8ed`), never pure white; the accent teal is lifted for text (`#6ccbd3`) and
  kept deeper for filled buttons (`#17808a`, white text); warnings and errors are muted tints with light text; the
  selection orange is the same in both themes.
- The tutorial pictures are always light (see [tutorials.md](tutorials.md)).

## Checking a colour change

1. Typecheck.
2. Light: run `npm run tutorial:screenshots` and compare with the committed pictures; a token change that keeps light
   values should change no pixel beyond compression noise.
3. Dark: open the Full-service restaurant template with `hvac-theme` set to `dark` and look at every phase, the 3D view,
   Schedule, Library and Settings, in full resolution (the headless helper in `scripts/lib/cdp.mjs` is handy for this).
   Check that walls, air types and loads stay distinguishable and that labels read on the paper.
