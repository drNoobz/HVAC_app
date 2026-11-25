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

## Interaction rules (from the user)

- **Selecting anything switches to its phase:** Spaces, Loads or Systems (`stepForSelection` / `select()` in
  `Studio.tsx`). This includes tree and panel clicks. The Check phase stays put.
- **Lock positions** (`hvac-plan-positions-locked`): no dragging. A drag pans instead, clicks still select, and
  room-relative dimensions are hidden.
- **Everything happens on the main canvas.** Inspectors stay slim. Keep the phases (Spaces, Loads, Systems,
  Check) as they are.
