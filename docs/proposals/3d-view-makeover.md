# 3D view makeover

- **Status:** 2026-11-28. Phases 0 and 1 are done, on React Three Fiber; phases 2 to 4 are not built.
- **Scope:** the 3D view (`src/components/Viewport.tsx`, React Three Fiber; `src/domain/scene3d.ts` and
  `src/domain/view3d.ts`), and how Studio feeds it. Section 1 describes the view before the makeover.

**Target (the user's words, 2026-11-28):** the 3D view should have "a similar look and functionality to Revit",
with similar polish. Walls and other building elements can be made transparent to see equipment, as the Plan view
already does by fading the layers outside the current phase.

Two rules follow:
1. **Same project, same language as the Plan view.** The 3D view draws the same items from the same domain
   helpers, in the same air and construction colours.
2. **Revit's 3D conventions where Revit has one.** A Revit user should find the view cube, visual styles,
   visibility and transparency per category, Temporary Hide/Isolate, the section box, the blue selection and the
   grips where they expect them.

## 1. What the 3D view does today

Reviewed on the Full-service restaurant and the simple office tutorial, in both themes.

**What it shows:**
- Rooms as boxes: a floor slab, a ceiling slab in the room's fill colour, and walls coloured by construction.
- Doors and windows as flat panels.
- Equipment as plain boxes in one dark colour, with no ports or shape.
- One white name plate per room.

**What it leaves out, though the plan has all of it:**
- **Ducts.** Not one duct is drawn, although every `DuctRun` already stores its size and its elevation (`zM`). On the
  restaurant, 35 ducts are missing, so the diffusers float with nothing joining them.
- Pipes, loads, room sensors, flow arrows and air colours. Diffusers, grilles and hoods are the same dark grey as the
  units.
- The OUTSIDE AIR tags, North, wall names, the air key, and system names.
- The phase fade: the plan fades whatever the current phase is not about (`stepFade` in `PlanView.tsx`). The 3D view
  draws everything solid, so walls and ceilings hide the equipment.
- The Layers menu: its rows say "Show on plan" and have no effect in 3D. Only "Hide roof" works there.

**Bugs found while reviewing (fixed in phase 0):**
- **The canvas was twice too big on Retina and other high-resolution screens.**
  - `renderer.setSize(w, h, false)` set the drawing buffer but not the canvas's CSS size, and no CSS set it either.
  - On a Mac the canvas came out 1,520 px wide in a 760 px pane. It covered the right-hand panel, put the model
    off-centre, and made **Fit** look broken.
  - The tutorial pictures are captured at 1×, so they never showed it.
- **A debug axes helper** in the scene.
- **Labels ignored the theme:** white plates with hard-coded text colours. A unit with no stated size was drawn in a
  hard-coded tan.
- **Dark-mode floors:** floors kept their pale light-theme fill.
- **Constant redrawing:** it rendered 60 frames a second even when nothing moved.
- **Zoom:** it did not zoom toward the cursor, and it was slow.

## 2. Revit's 3D view, and what we take from it

| Revit | Here |
|---|---|
| **ViewCube** with Home and a compass ring, North from the project | View cube at the top right. The compass ring turns with `project.northDeg`; Home frames the project. Top lines up exactly with the Plan view. |
| **Navigation bar**: zoom to fit, zoom region, orbit about the selection | Fit (all / selection), zoom toward the cursor, double-click to orbit about an item, F and Home keys |
| **Visual styles**: Wireframe, Hidden Line, Shaded, Consistent Colors, Realistic | A Visual style menu on the canvas: **Wireframe**, **Hidden line** (white faces, black edges), **Shaded** (lit, with edges), **Consistent colors** (flat colour, with edges; the default, closest to the plan). Realistic comes later, if at all. |
| **Visibility/Graphics**: per category, show or hide, **transparency 0–100 %**, halftone | The Layers menu grows into **Visibility and graphics**. Each category (Walls, Floors, Ceilings, Roofs, Doors and windows, Equipment, Ducts, Air terminals, Piping, Loads, Sensors) has a show box and a transparency slider. Settings are kept per project. |
| **Ghost surfaces** (Graphic display options) | One switch that makes every building surface 70 % transparent, so equipment and ducts show through walls. |
| Halftone and underlays | **Phase fade, as on the plan.** In Systems, the building recedes (about 60 % transparent and greyed); in Spaces, systems recede. Same `stepFade` numbers, applied as transparency. On by default; switch off for "all solid". |
| **Temporary Hide/Isolate** (sunglasses icon): hide or isolate an element or a whole category; Reset | Right-click → Hide, Isolate, Hide category, Isolate category. A cyan frame shows that a temporary state is on, with **Reset temporary hide/isolate**. Nothing is saved. |
| **Section box** with arrow grips; **Selection Box** (BX) | **Section box** toggle with six arrow grips. **Section box from selection** fits it around the selected rooms, system or items. |
| **Sun and shadows**, **ambient shadows** | Shadows on/off, and ambient occlusion on/off, in Graphic display options. Both are on in Shaded and Consistent colors. |
| **Detail level** Coarse / Medium / Fine (ducts as lines or solids) | **Coarse**: ducts as centre lines in their air colour. **Medium and Fine**: ducts as solids with drops, risers and fittings. |
| **Blue selection**, pre-highlight on hover, Tab to cycle overlapping items, window and crossing selection | Selection in the app's selection colour (orange in both themes). An outline pre-highlights on hover. Tab cycles what is under the cursor. Drag left-to-right for window select, right-to-left for crossing. |
| Element **grips** and temporary dimensions | Grips to move equipment on its mount plane and to raise or lower a duct run. A temporary dimension shows height above the floor or below the ceiling. |
| **Properties** palette | The existing Inspector, unchanged and slim |
| Saved **3D views** in the Project Browser | **Saved views**: name the current camera, visual style, section box and visibility, then come back to it. Stored on the project, usable in exports. |
| MEP system colours by system type | Kept as the plan's air-type colours (`SERVICE_COLOR`), never per system. The user asked for this on the plan. |

## 3. Part A: match the Plan view

### A1. One scene description, two renderers

- Add `src/domain/scene3d.ts`, a pure function `buildScene(project)`. It returns typed items: rooms, wall pieces,
  openings, equipment with ports, duct segments, terminals, pipes, loads, sensors and outside-air points.
- Each item has its **category** (for visibility, transparency and isolate) and its **phase** (for the phase fade).
- It reads the plan's helpers: `ductFlows`, `SERVICE_COLOR`, `terminalAirColor`, `wallKindFor` and `wallColor`,
  `spaceUseFill`, `wallName`, `graphicWall`'s thickness, and the unit `portAt` positions.
- The Viewport only renders it. Testable without WebGL; cannot drift from the plan.

### A2. Air systems in 3D: the main gap

- **Ducts at their true size and elevation:**
  - round as tubes, rectangular as boxes;
  - coloured only by air type;
  - drawn from `DuctRun.points`, `widthM` / `heightM` and `zM`.
- **Drops and risers:** from the duct down to its ceiling terminal and up through the roof to a rooftop unit's port.
  Elbows and tees are drawn at Fine detail.
- **Flow arrows** along each run, as the plan's `flowChevrons`, and an optional slow moving-dash animation.
- **Terminals** take the colour of their air (`terminalAirColor`). Equipment stays one neutral colour.
- **Units** get a recognisable shape with port stubs at their `portAt` positions, and the economizer hood, relief and
  condenser drawn on rooftop units.
- **Outside air:** at each louver, roof hood and open unit port, a 3D arrow, green coming in and brown going out.
- **Pipes**, when shown, in the plan's supply and dashed-return colours.

### A3. Architecture that matches the plan

- **Walls** in the plan's construction-family palette and thickness. Their tooltips use the plan's compass names:
  "Dining · South wall · outside".
- **Openings:** doors show their swing on the floor; windows are glass.
- **Floors** use the room's use fill. In dark mode it is resolved through `wash()`.

### A4. Annotations

- **Labels:**
  - HTML labels pinned to the model (`CSS2DRenderer`), styled with the app's CSS tokens;
  - screen-sized, with the plan's `LABEL_PRIORITY` and declutter rule;
  - rooms show name and size; equipment, ducts and terminals show details when selected or with "Details on all
    items".
- **North:** a compass on the ground and on the view cube's ring.
- **The air key** at the bottom right, as on the plan.
- **Selection and phases:** picking in 3D selects the same item and switches the phase, as on the plan.

## 4. Part B: Revit-grade look and tools

### B1. Look

The default, **Consistent colors**, gives a calm model. The building is light and matte, the systems carry strong
colour, and crisp dark edges define every shape, as in a Revit view.

- **Edges:** screen-space edge lines (from depth and normals) at a constant pixel width, as Revit draws model lines.
  No per-box wireframes.
- **Lighting:**
  - a sky light plus one sun with soft shadows (the sun direction follows North);
  - ambient occlusion in corners;
  - filmic tone mapping.
- **Materials:** walls light neutral with the family colour on the cut faces; ducts lightly metallic in their air
  colour; glass clear with a light tint.
- **Ground:** a soft shadow catcher and a grid that fades out, replacing the fixed grid helper.
- **Section cut faces** are filled in the family colour with a hatch, as Revit's cut patterns.
- **Both themes:** the background, ground, grid and edges come from CSS tokens; data colours are resolved through
  `ink()` / `wash()`; labels are HTML.

### B2. Seeing inside

- Phase fade, ghost surfaces and per-category transparency (section 2).
- **Section box** and **Temporary Hide/Isolate** (section 2).
- **Roof and ceilings** follow the phase: off in Systems, on in Spaces, and each has a show box.
- **Levels:** with more than one storey, a level picker shows one floor or all of them.

### B3. Checks that are easiest in 3D

These are geometry and bookkeeping checks, not psychrometrics, so they fit the no-solver rule:
- a duct below the ceiling or under the minimum headroom;
- a duct above the roof deck;
- a rooftop unit not on a roof;
- two ducts of different networks overlapping (a clash);
- a duct passing through equipment or a terminal it does not serve: a duct over a diffuser, through a unit or a
  hood (the user asked for this on 2026-11-28 after spotting a supply main running over a dining diffuser).

How a clash check could work: test each duct segment (a capsule of its radius, or a box for rectangular ducts)
against every other segment and every equipment box, ignoring pairs that are joined (the same node, a run and the
item at its end, a terminal and its neck). Report each clash once, at its midpoint, and mark it in the Plan and 3D
views in the Check colour. The scene list from `buildScene` already has every shape in metres, so the check can run on
it, or on the same helpers, without the renderer.

**Built 2026-11-28 (list only):** `findClashes` in `src/domain/clashes.ts` runs on `buildScene`'s pieces as above
(capsules, with rectangular ducts taken at half their larger side; equipment boxes; runs joined at a node or port
ignored). `clashIssues` in `checks.ts` lists each clash as a Systems warning that names the room and both ducts, and
selects the first duct. Marks in Plan and 3D, a Hop under fix, and see-through surfaces for a selected duct in Check
followed the same day (Phase 1 of [duct-layout-tool.md](duct-layout-tool.md)).

They feed the Check phase. Selecting an issue in 3D flies to it with a section box around it.

**Tools:**
- a measure tool (distance and clear height, in IP or SI);
- colour by planning values the app already sums (supply CFM/ft², outdoor air against required);
- hover facts for ducts (air type, airflow, size, velocity) and terminals.

### B4. Speed

- Render on demand (done in phase 0).
- Update only the items whose data changed.
- Instanced terminals, shared materials, and walls and slabs merged per room.

## 5. Technology choice (needs a decision)

| Option | For | Against |
|---|---|---|
| **React Three Fiber v9 + drei + postprocessing** (recommended for Revit-grade polish) | <ul><li>Supports React 19.</li><li>drei and postprocessing already have the view cube, HTML labels, outlines and edge detection, ambient occlusion, contact shadows, environment lighting and render-on-demand.</li><li>One component per item, so only changed items re-render.</li><li>Easier for future agents to extend.</li></ul> | <ul><li>Three new dependencies.</li><li>The Viewport is rewritten, not patched.</li></ul> |
| **Keep plain three.js** | <ul><li>No new dependencies.</li><li>three's examples cover the parts: `ViewHelper`, `CSS2DRenderer`, `OutlinePass`, `SAOPass`, clipping planes.</li></ul> | <ul><li>Much more hand-written lifecycle code to reach the same polish.</li><li>The file keeps growing.</li></ul> |

Either way, `buildScene` (A1) stays in the domain and is shared.

## 6. Phases

| Phase | What | Size |
|---|---|---|
| 0. Fixes ✅ | Canvas CSS size; no axes helper; theme-aware labels and colours, with no hard-coded hex; `wash()` on dark floors; render on demand; zoom to cursor | Done 2026-11-28 |
| 1. Align and see through ✅ | `buildScene`; ducts, drops, risers; terminals and units with air colours; outside-air arrows; wall families and openings; phase fade and per-category transparency (Visibility and graphics); HTML labels; compass; air key | Done 2026-11-28, see "Phase 1 as built" |
| 2. Revit look | Visual styles; screen-space edges; ambient occlusion (sun shadows came early, in phase 1); cut faces; fading ground grid; selection outline and hover pre-highlight | Medium |
| 3. Revit navigation | View cube with North and Home; Fit selection; Temporary Hide/Isolate; section box with grips; levels; saved views; detail level | Medium |
| 4. Check and edit | Clearance and clash checks into the Check phase; measure; colour by data; hover facts; grips to move equipment and raise ducts; Tab cycling; window and crossing selection | Medium to large |

**Each phase:**
- passes the typecheck;
- is checked on the Full-service restaurant and the simple office in both themes, at 1× and on a high-resolution
  screen;
- updates the tutorials: the "Check it in 3D" step and `17-3d.webp`, plus a new step for the 3D controls;
- updates [plan-view-conventions.md](../agents/plan-view-conventions.md) with a "3D view" section and
  [theme.md](../agents/theme.md) for the scene's tokens.

### Phase 1 as built

- **Libraries:** `@react-three/fiber` 9.8, `@react-three/drei` 10.7 (three 0.170 was already there). No
  postprocessing yet; phase 2 adds it.
- **One scene list.** `buildScene(project)` in `src/domain/scene3d.ts` returns pieces (box, slab, tube, beam, ball,
  cone, puck, chevron) and labels, each with a category, a plan data colour and what a click selects. The Viewport only renders
  it, with shared unit shapes scaled into place.
- **Ducts** sit at their `zM`: under the lowest ceiling they cross, less half their depth and 50 mm
  (`ductElevation`). A riser joins each end to its equipment (`endRise`): through the roof to a rooftop unit's
  underside, or up or down to a unit in the space. New ducts get the rule; saved projects keep their heights.
- **Connected ducts and terminals** (revisited 2026-11-28 after the user saw branches and diffusers floating apart):
  a run that meets a node at another height rises or drops to it with an elbow; ceiling diffusers and grilles hang
  under their duct end on a short neck instead of sitting at the ceiling, so nothing floats.
- **Flow marks:** the first build stood dark cones on the ducts; they did not match the air key and looked out of
  place. They are now pale chevrons painted flat on the duct top (`--flow-mark`), like the key's Flow mark.
- **Rooftop units:** a duct to a rooftop item carries on under the casing, by its radius plus 100 mm, and rises into
  the underside where the unit is drawn (`roofEntry`, `drawnBottom`), on a collar sized to the duct. Before, the
  riser went up the unit's edge, half outside it.
- **Template fixes found in 3D (2026-11-28):** the dining supply drops ran over the south diffusers and crossed the bar
  return; they are rerouted (one feed down x = 3 m and along y = 1 m). The restroom roof hoods sat 0.7 m from the
  fans and hid the duct; they moved about 1.2 m away with an L-shaped duct.
- **Look:** sun with soft shadows (PCF, 2048 map fitted to the model) and a fill light; ducts slightly metallic.
  Shadows is a Visibility and graphics setting, on by default. Ambient occlusion and outlines stay in phase 2.
- **Units** show a coloured collar at each duct connection; outside air is a vertical arrow, green in and brown out,
  with an OUTSIDE AIR tag, where the plan draws one.
- **Visibility and graphics** (Layers menu, 3D only): Fade by phase (default on, the plan's `stepFade`; ceilings fade
  twice as far so the ductwork reads), Ghost surfaces (building surfaces at most 22 % opaque), and per category
  (walls, floors, ceilings and roofs, doors and windows, equipment, air terminals, ducts, loads) a tick box and a
  transparency slider. Stored in this browser as `hvac-3d-view`. The old "Hide roof" box became the Ceilings and roofs
  category. Plan-only rows (piping, sensors, unit internals, duct widths, clearances) are hidden in 3D.
- **Picking** goes through anything under 60 % opaque to the first solid piece behind it, so in Systems a click on a
  faded wall selects the duct behind it. Doors and windows still win within 14 px.
- **Labels** are HTML over the canvas, decluttered by the plan's `LABEL_PRIORITY`; flow and size, equipment and load
  names show on the selection or with Details on all items.
- **Compass:** the plan's north arrow in the canvas's bottom-left corner, turned each frame to where north points on
  screen. A ground compass was tried first: in the orbit view it fell behind the building.
- **Air key:** the plan's `AirKey`, with the air types drawn in 3D.
- **Not changed:** outside walls that border nothing still pick as their wall stretch, with no context menu (as
  before).

## 7. Decisions for the user

1. **Library:** React Three Fiber (chosen 2026-11-28).
2. **Default visual style:** Consistent colors with edges (recommended, closest to both Revit's MEP views and the
   plan), or Shaded.
3. **Phase fade on by default** (recommended: the building recedes in Systems, like the plan), or everything solid
   until the user sets transparency.
