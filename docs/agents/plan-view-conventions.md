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
