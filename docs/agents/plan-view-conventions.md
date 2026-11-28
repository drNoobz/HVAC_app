# Plan view conventions

How the main canvas (`src/components/PlanView.tsx`) draws air systems, and the decisions behind it. Keep these
consistent when adding equipment, packages or layers.

## Coordinates and sizes

- Plan units are metres with +y up. The SVG viewBox is `${minX} ${-(minY + h)} ${w} ${h}`, so text is drawn
  inside `scale(1,-1)` groups.
- `pxPerM` comes from the SVG width over `view.w`. Text and markers are **screen-sized**:
  - `font = 12 * zoomBoost / pxPerM`
  - zoomBoost runs from 1 to 1.4 as you zoom in
  - Do not add metre floors to marker sizes; they make overlaps at high zoom.
- Unit internals use `t = min(h * 0.2, 13 / pxPerM)`. Readable thresholds are `t * pxPerM >= 6` (readable) and
  `>= 9` (fine).

## Colours: one per kind of air

These are the light-theme values. In dark mode the plan draws every data colour through `ink()` or `wash()`, so new
colours must too: see [theme.md](theme.md).

- Ducts are coloured **only by air type**, never by system or room. `SERVICE_COLOR` in `src/domain/ductCatalog.ts`:
  - supply `#1d4e89` (blue)
  - return `#c47b12` (orange)
  - outdoor `#2f7d32` (green)
  - exhaust and relief `#7a4a2b` (brown)
  - mixed `#6f6a8a`
- `DUCT_STREAMS[].color` derives from it, and air inside units uses the same colours (`unitStreamColor`).
- Line dashes (`SERVICE_DASH`) also separate air types for colour-blind readers.
- Equipment is one neutral colour (`MARK_COLOR.equipment`). Only air terminals take a colour, the colour of the
  air they handle (`terminalAirColor`): diffuser supply, return grille return, exhaust grille or relief hood
  exhaust, outdoor-air louver or intake outdoor.
- The user asked for this explicitly: "We dont want to differentiate which ones are in the kitchen and which ones
  are in dining room". Do not reintroduce per-system palettes.

## Outside air

Every place air crosses the building envelope gets an `OutsideAirTag`: a solid tag reading **OUTSIDE AIR** and a
bold arrow.
- **Green `#2f7d32` = air coming in** (arrow points into the building).
- **Brown `#7a4a2b` = air going out** (arrow points away).
- These two colours are fixed (`OUTSIDE_IN_COLOR` / `OUTSIDE_OUT_COLOR`) whatever the system. The air key shows
  them as "Outside air in" and "Outside air out".
- The tag carries no "inlet" or "outlet" wording: colour and arrow say it (the user's request).
- Where it appears:
  - **Unit outdoor ports (OA and EA) that have no plan duct:** beside the hood, in the unit's frame. This applies
    on open units (internals drawn) and on closed boxes.
  - **Louvers, roof hoods and roof fans** (`outdoorOpening`): standing straight up from the item, past its name
    chip.

## Transfer grilles

`grille-transfer-door` (any `grille-transfer*` id) is an air terminal with no duct:
- **Plan drawing:** a slotted bar plus an arrow along its local +y, the direction the air passes. Set the item's
  yaw so that +y points into the room that pulls the air (the exhausted room).
- **Colour:** neutral; it is not a supply or exhaust terminal.
- **Label:** "TG", drawn on the upstream side so it stays clear of the arrow.
- **Check:** counts it as make-up for restroom exhaust fans in the same room.

## Flow arrows

- `flowChevrons(points, fontM, avoid?)`: one arrow per stretch of about 7 × font along a run, pointing toward
  the last point.
- An arrow that would land under an in-duct label slides along its slot to the nearest clear spot. It is not
  deleted.
- Ducts need a known direction (`ductFlows().runs.get(id).toward`). A network with no single source shows no
  arrows.
- Pipes draw arrows outward from the plant on supply and back on the dashed return (liquid loops only).

## Wide (double-line) ducts

- A duct is drawn double-line at its true width once `widthM * pxPerM >= 6`. Walls are a wide stroke, with the
  pale inside stroked over it, so that branches of **one network** share an outline.
- Each network (system + air type) is a separate layer, drawn in order exhaust → relief → outdoor → return →
  mixed → supply. Two networks that cross show one passing over the other. Never merge them into one outline: a
  merged crossing looks like the kitchen exhaust feeding the supply.

## Wall names

Users never see plan sides (top, left, right, bottom, or "Wall 3"). Name a wall with `wallName()` in
`src/domain/walls.ts`, or `wallNameInText()` mid-sentence and `wallPlaceLabel()` in pickers:

- An outside wall, or one only partly shared, is named by the compass point it faces: "North wall",
  "Southwest wall" (eight points). The direction comes from the project's **North** setting, so pass
  `project.northDeg`; changing North renames every wall, and nothing stores a name.
- A wall fully shared with one or two spaces is named after them: "Wall to Corridor", "Wall to Kitchen and Prep".
- Two walls of one room with the same name are numbered in plan order: "North wall 1", "North wall 2".
- The plan-side ids (`px`, `nx`, `py`, `ny`, edge indexes) stay internal. `PLAN_SIDES` and `WALL_FACES` labels
  are for geometry only.

## Labels and declutter

- Anything with `data-label="<priority>"` (text or a whole group) takes part in `declutterLabels`. It runs every
  render, and lower priority loses on overlap (`data-declutter="hidden"` → `visibility: hidden`).
- Priorities (`LABEL_PRIORITY`):
  - room 90
  - outside 85
  - duct 70
  - equipment 60
  - pipe 55
  - roomDetail 40
  - systemName 30
  - load 20
  - the selected item: 1000
- Duct labels sit inside a double duct when it is wide enough (`widthM >= size * 1.7`), otherwise beside it. A
  label too long for its segment shows only when its run is selected.

## Air key (legend)

- `AirKey` is a small wrapping strip at the bottom-right of the canvas. It lists only the air types **visible in
  the current view**, from plan ducts in view and units drawn open in view.
- It always adds "Outside air in", "Outside air out" and "Flow".
- It folds to colour dots. The fold state is kept in localStorage under `hvac-air-key-collapsed`.

## Catalogue drops

Rules live in `src/domain/smartDrop.ts`; Studio's `placeEquipment`, `beginDuctAt` and `describeDrop` apply them.
- **Every drop joins a system** unless the user holds Alt or picks a system in "Place into":
  - `dropRole(product)`: unit (has a `unit` spec, or is an AHU, MAU, ERV or split), head (hood, exhaust fan,
    bath fan), member (terminals and air-path parts), free (plant, items with no ports).
  - Units ask, in a small menu at the drop point, "Pregenerated system: …" (a matching system package, with the
    dropped product swapped in, its terminals scaled to the new airflow, and its round ducts resized with
    the square root of the airflow, snapped to a listed size) or "… only, in a new system" (the
    user's decision, 2026-11-27).
  - Heads join a system of their kind within 6 m, otherwise they ask like a unit.
  - Members join the nearest system that carries their **main** air (port service, not `accepts`), so an
    exhaust grille never becomes an RTU's relief. With none, they drop unassigned and a note says so.
- **Ducts:** dropped on a run, they start a branch (a tee on that run, same system, air, product and size).
  Near an open port, they start there. Otherwise they go in the nearest system that can carry them, or a new
  one. A new system made for a duct is removed if the user leaves the duct tool without drawing.
  Right-click a run → "Draw branch" does the same as dropping on it.
- **Feedback:** while dragging, a dark chip at the cursor says what the drop will do and the target system's
  labels show (`DropHint`). A drop that did nothing useful leaves an amber note for about 3 s. Never fail
  silently.
- Browsers hide drag data until the drop. Drag sources call `setActiveCatalogDrag(token)` on dragstart, so
  the canvas can read the item during dragover.

## Interaction rules (from the user)

- **Selecting anything switches to its phase:** Spaces, Loads or Systems (`stepForSelection` / `select()` in
  `Studio.tsx`). This includes tree and panel clicks. The Check phase stays put.
- **Lock positions** (`hvac-plan-positions-locked`): no dragging. A drag pans instead, clicks still select, and
  room-relative dimensions are hidden.
- **Everything happens on the main canvas.** Inspectors stay slim. Keep the phases (Spaces, Loads, Systems,
  Check) as they are.

## The 3D view

The 3D view follows these conventions too. It draws the list `buildScene(project)` makes in
`src/domain/scene3d.ts`, from the same helpers as the plan. When you add something to the plan, add it there too.

- **Colours:** the same data colours (`SERVICE_COLOR`, wall constructions, `MARK_COLOR`, `LOAD_CATEGORY_COLOR`,
  `OUTSIDE_IN_COLOR` / `OUTSIDE_OUT_COLOR`), resolved for the theme by `sceneColor(ink())` or `sceneColor(wash())`.
- **Ducts and risers:** a run sits at its `zM`. `ductElevation` puts a new run under the lowest ceiling it crosses,
  less half its depth and 50 mm. `endRise` gives the riser to the equipment at each end: to a rooftop unit's
  underside, or clamped to a unit's height in the space. The plan marks a riser over 50 mm with a circle at that end.
  Where a run meets a node at another height (a tee from a lower main), it rises or drops to the node with an elbow,
  so branches always meet their main.
- **Ceiling terminals hang from their duct.** A diffuser or grille linked to a duct end is drawn under that end on a
  short neck (`hangingTerminals` in `scene3d.ts`), not at its stored ceiling height, so the two always meet. The neck
  is part of the duct run: a click on it selects the run.
- **Rooftop items:** a duct ending at a rooftop unit, fan or hood carries on under the casing and rises into its
  underside (`roofEntry`), to where the item is drawn (`drawnBottom`, shared with the equipment). The collar under
  the unit is sized to the duct. Keep a template's rooftop connections on the unit's edge as before: the 3D view
  pulls them in.
- **Avoid clashes in templates:** a duct must not pass over a diffuser or grille it does not feed, and supply and
  return should not cross at the same height. Branch off beside a terminal, never run past it and double back. Check
  lists clashes (`clashIssues` in `checks.ts`, geometry in `clashes.ts`); a template must show none. Look in 3D too.
- **Clash marks:** Studio finds clashes once (`projectClashes`) and passes them to Check, the plan and 3D. In the
  Systems and Check phases each clash gets a red ring with "!" (`PLAN_COLOR.clash`, `--plan-clash-fill`; in 3D the HTML
  `.viewport-clash`, drawn over everything so ceilings never hide it). Clicking a mark selects the duct. In Check, a
  selected duct ghosts the building surfaces in 3D, since Check draws them solid.
- **Hop under** (`hopUnder` in `projectOps.ts`): the shallower duct of a clash (`clashHopper`) is split on both sides
  of the crossing and the middle piece lowered to pass under the other with a 50 mm gap. Near equipment at a run end
  the low piece runs on to the end, so the drop never lands inside a diffuser. `pruneNodes` never merges runs at
  different heights, so a hop survives later edits.
- **Tags, not model names:** equipment is named by its stored tag (`PlacedEquipment.tag`, `src/domain/tags.ts`):
  RTU-1, SD-3, RG-2, EF-1. Plan labels, 3D labels (model as detail) and tree rows show the tag; the model and
  manufacturer stay in the inspector. `assignTags` runs on every edit and load and only fills missing tags, so a
  user's rename is never changed. Templates need not set tags.
- **Duct sizes** read in whole inches in IP (`ø 14 in`, `16 × 10 in`) and mm in SI (`ductSizeLabel`).
- **Systems tree** (`systemOutline` in `src/domain/systemTree.ts`): system → head equipment, then one group per air
  (supply, return, outdoor, mixed, exhaust, relief) → room → terminals by tag, with a folded duct group per air
  ("Supply ducts") whose rows name what each run serves ("Main · SD-1–6", "H-2 → EF-4"). Each duct is listed once,
  there: the user asked for no separate duct list (the old "Duct runs" panel was removed). **All · Equipment ·
  Ducts** chips narrow the tree; in Ducts the runs sit straight under their air. Equipment and ducts in no system (or a
  deleted one) go under **Not in a system** at the bottom, and Check lists each. Never list items by product name
  alone, and never show a row of identical names. A clash puts a red "!" on the duct row and on every group above
  it. Selecting on the canvas opens the path (`outlinePath`) and highlights the row.
- **System names** (`src/domain/systemNames.ts`): a system the app creates (drop, system template, + Add system) has
  `autoName` and is named "kind · spaces it serves" ("Heating and cooling · Open office", two spaces then "+n"),
  kept up to date on every edit and numbered when taken. Typing a name turns `autoName` off; clearing it turns it
  back on. Project templates (the restaurant) keep their written names.
- **Flow marks:** flat chevrons painted on the top of the duct, about one every 3 m, like the air key's Flow mark.
  They are unlit, so they read the same from any angle. No arrows or cones stand outside a duct.
- **Look:** a sun with soft shadows and a cool fill light. Shadows is a setting (Layers → Visibility and graphics);
  only solid pieces cast them.
- **Phase fade:** `stepFade` (in `src/domain/viewRules.ts`) for both views. In 3D, ceilings fade twice as far, so
  ducts read in Systems.
- **Visibility and graphics** (`src/domain/view3d.ts`): the categories, ghost surfaces and transparency, stored as
  `hvac-3d-view`. A category also follows its Layers row (Spaces and walls, Loads, Equipment, Ducts).
- **Picking:** a click goes through pieces under 60 % opaque to the first solid one. Doors and windows win within
  14 px. Selecting switches to the item's phase, as on the plan.
- **Labels:** HTML, decluttered with `LABEL_PRIORITY`. Room names and OUTSIDE AIR always show; duct, equipment and
  load labels show on the selection or with Details on all items.
- **North:** the plan's `NorthGlyph` in the bottom-left corner, turned to where north points on screen.
