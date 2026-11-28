# Proposal: one duct tool for Plan and 3D

Status: proposal, 2026-11-28. Phases 0 and 1 (clash list, marks and Hop under) are built; the rest is not.

The user asked for "a better tool to lay out ducting. It should work in 2D and 3D, be easy to use, and be very
intuitive to humans." This proposal looks at how other tools do it, says what to take from each, and lays out one
tool that works the same way in the Plan and 3D views.

## 1. What we have today

- **Drawing (Plan only):** pick a duct in the catalogue, click a start, click corners, and finish on a port, a
  junction or another run (`snapDuct` in `PlanView.tsx`). Snapping goes to a matching port first, then a junction,
  then a run of the same air (which makes a tee), then the grid. A duct dropped on a run starts a branch.
- **Height:** a run has one height (`zM`). `ductElevation` puts it under the lowest ceiling it crosses. Risers to
  units, and rises or drops to a node at another height, are drawn for you. The only way to change a height is the
  Elevation field in the inspector.
- **3D:** shows and selects ducts, but cannot draw or edit them.
- **What goes wrong:**
  - Every run sits just under the ceiling, so two runs that cross in plan collide in 3D. This is the clash the user
    found in the Dining room.
  - A route can only be changed by deleting it and drawing it again.
  - Corners are clicked one by one; there is no "go from here to that diffuser".
  - The user sees size and air speed only after drawing.

## 2. How other tools do it

| Tool | How you draw | What it does for you | What to take |
|---|---|---|---|
| **Revit** | Draw in plan. An Offset (height) on the Options Bar; change it mid-run and Revit adds the vertical piece. It snaps to connectors on equipment, terminals, fittings and duct centrelines. Vertical runs are easier in a section. | Elbows, tees and transitions from the duct type's routing preferences. **Generate Layout:** select terminals and equipment, then cycle through proposed routes (Network, Perimeter, Intersection), then drag segments and Finish. | Change height while drawing. Snap to connectors. Fittings come for free. Proposals you cycle through, then edit. |
| **AutoCAD MEP** | A compass sets the angle; tracking lines align with other objects. | Fittings from routing preferences (size ranges for elbows, tees, takeoffs). | Angle guides and alignment lines while drawing. |
| **Wrightsoft Right-Draw / Right-D** (residential) | Draw the trunk on the floor plan. | One button connects every register to the trunk with branches. Registers can be placed by rules. Right-HV Duct offers trunk patterns: horseshoe, dogleg, H, perimeter, X and Y axis. | **Draw the trunk, branches are automatic.** Named layout patterns a user can pick. |
| **MagiCAD** | A Connect function joins two duct ends using standard angles. Device connection hooks a terminal or fan to a duct. | It picks the fittings to make the connection. | "Connect these two" instead of drawing the corners. |
| **DDS-CAD** | — | A collision check flags ducts, pipes and trays that meet at the same height. | Clash list (we now have one). |
| **Bentley OpenBuildings** | A Bypass tool routes a duct around an obstruction. | It builds the offset for you. | One action to hop a crossing. |
| **Revit add-ins** (EveryBIM "MEP Avoid", Greater BIM bends, MEP updown) | Pick a duct and an obstruction. | Moves that part up or down by a set offset and angle, keeping the rest. | Hop over or under with one pick. |
| **Augmenta** (electrical today) | — | Automatic clash-free routing against the whole model, which a professional then checks. | Automatic routing is a helper whose result you review, not the main way to draw. |
| **Cities: Skylines** (a game, for the gestures) | Drag a road. Page Up and Page Down raise and lower it while you draw. Guide lines and angle snapping; straight, curved and free modes; the slope shows as you go. | Bridges and ramps appear by themselves. | Change height while drawing, guides that show what will happen, and structure that appears by itself. (Not its keys: see principle 4.) |

Two patterns stand out:

1. **The professional tools** let you draw the route, and the fittings, risers and tees appear automatically. Their
   weak point is settings: routing preferences, offsets typed into an options bar, a separate section view for
   vertical pieces.
2. **The easy tools** (Wrightsoft, games) never ask for a number while you draw. You choose *where*. Height is a
   key, branches are automatic, and the result shows live as you move.

We want the second feel with the first's results.

## 3. Principles

1. **One tool, two views.** The same duct tool, the same controls and the same snapping in Plan and in 3D. 3D only adds
   height you can see.
2. **Draw the path, never the fittings.** Elbows, tees, risers, drops and hops are drawn for you, as they are today.
3. **Start and end on things.** Ports, terminals, junctions and other ducts are magnets that light up as you get
   close. What you snap to sets the system, the air type and the size. You never pick a system from a menu.
4. **Height is a step, not a number, and you change it where you see it.** A few named levels per room: *high*,
   under the ceiling or deck (today's default); *low*, one duct depth plus 50 mm lower, for crossings; and *custom*.
   No keyboard shortcuts (the user's choice, 2026-11-28). Two places to change it:
   - **A small height panel on the canvas**, next to what it concerns: beside the leg being drawn, beside a selected
     segment, or beside a clash. It shows the level ("High · 9′-2″") with ▲ and ▼ arrows that step through the
     levels, and it moves out of the way of the duct.
   - **The inspector's Elevation field**, as today, for an exact number.
5. **Show it before it happens.** The preview shows the duct at its true width with its size, airflow and air speed,
   the corners it will get, and a red mark where it would clash.
6. **Crossings fix themselves.** When the preview crosses another duct at the same height, the new duct hops under
   it: a short drop, run under, rise back. The height panel at the crossing offers **Over** instead, or ▼ to run the
   whole duct low.
7. **Edit by dragging.** Drag a segment sideways and its neighbours stretch; connections hold. Drag a corner. In 3D,
   drag a segment's height handle. No delete-and-redraw.
8. **Helpers propose; the user decides.** "Connect" and the layout patterns draw a proposal the user can cycle
   through and edit, as Revit's Generate Layout does. Nothing routes itself without being asked.

## 4. The tool, step by step

### 4.1 Draw a run (Plan and 3D)

1. Pick a duct in the catalogue, or press `D`. Or start by dragging from a port: the unit's SA, RA, OA or EA, or a
   terminal's neck. That arms the tool with the port's system and air.
2. **Move the pointer.** The preview runs from the last point to the pointer as an **L**: two straight legs and one
   elbow. `Space` flips which leg goes first. Hold `Shift` for one straight leg at any angle, snapped to 45°.
3. **Click** to fix a corner, or click a magnet to finish. A port, terminal or junction ends the run there. A duct of
   the same air makes a tee, as today. Ending on a terminal links it, and in 3D it hangs from that end.
4. **The height panel** beside the leg being drawn changes the level of that leg: click ▲ or ▼. The riser or drop is
   added at the corner.
5. `Esc` ends the run as it is. `Backspace` removes the last corner.

**In 3D** the pointer moves on a horizontal plane at the current level. A faint grid patch under the pointer shows
the plane, and a thin vertical line drops to the floor, so the height is clear. Magnets are the same, with a
highlight ring.

### 4.2 Branch to terminals ("Connect")

- Select a main and some terminals (or a room), then **Connect**.
- Each terminal gets a branch from the nearest point on the main. Each branch leaves the main at right angles and
  arrives *beside* the terminal, never over another one.
- Sizes come from the airflow, at the template's speed rule (about 700–900 fpm for branches).
- This is Wrightsoft's "draw the trunk, branches follow". It also covers most of what a template does today.

### 4.3 Lay out a whole system ("Suggest a layout", later)

- Select a unit and its terminals, then **Suggest a layout**.
- Two or three proposals: *spine*, one main down the long axis with branches; *loop*, a perimeter main; *H*, two
  mains joined by a cross main.
- `Tab` cycles through them. Each shows its total length, its largest air speed and any clashes. `Enter` keeps one,
  and the user then edits it by dragging.

### 4.4 Edit

| Action | Plan | 3D |
|---|---|---|
| Move a segment sideways | Drag it; its neighbours stretch, and the ends stay on their ports | Same, on its level's plane |
| Move a corner | Drag the corner dot | Same |
| Change height | The height panel's ▲ ▼ beside the selected segment, or the inspector's Elevation | Same panel, plus dragging the arrow handle on the segment, which snaps to levels |
| Hop a crossing | Right-click the crossing, then **Hop under** or **Hop over** | Same |
| Add a corner | Double-click the segment | Same |
| Resize | Inspector, or `+` / `−` | Same |

### 4.5 Clashes in the Check phase

- **Built:** clashes are listed in Check and marked with a red "!" in Plan and 3D. A duct clash has **Hop under**,
  which lowers the shallower duct under the other. In Check, a selected duct makes the building see-through in 3D.
- **Later:** Hop over, and a hop chosen from a right-click on the crossing (Phase 3's editing).

## 5. Data model

Phases 1 to 3 need no new data:
- A run already has one height. A hop is three runs at two heights, joined by nodes, and the 3D view already draws
  the drops between them (`endRise`, and nodes at a different height).
- A level change at a corner is the same thing: two runs joined at a node at different heights.

Later, if a single run with many heights becomes common, `DuctRun.points` could carry an optional `z` per point. Even
then, the drawing rules here stay the same.

Fittings stay implied. When the solver arrives, its pressure-drop pass counts them from the geometry: corners are
elbows, nodes are tees, and height changes are pairs of elbows.

## 6. Phases

| Phase | What | Size |
|---|---|---|
| **0. Clash list** (built 2026-11-28) | `findClashes` (`src/domain/clashes.ts`) on the 3D scene; Check lists duct–duct and duct-through-equipment clashes | Done |
| **1. Clash marks and quick fix** (built 2026-11-28) | Red rings with "!" at clashes in Plan and 3D (Systems and Check), click to select; **Hop under** on a duct clash (`hopUnder`); in Check a selected duct ghosts the surfaces in 3D | Done |
| **2. Better drawing in Plan** | L-shaped preview with `Space` to flip; lit magnets; live size, airflow and speed; height panel with ▲ ▼ beside the leg; automatic hop when crossing at the same height; `Backspace` | Medium |
| **3. Edit by dragging in Plan** | Drag segments and corners with connections kept; double-click to add a corner; height panel beside a selected segment | Medium |
| **4. The same tool in 3D** | Drawing plane at the current level, magnets in 3D, height handles, drag segments | Large |
| **5. Connect** | Branches from a main to selected terminals, sized from airflow | Medium |
| **6. Suggest a layout** | Spine, loop and H proposals for a unit and its terminals, cycled with `Tab`, then edited | Large |

Every phase changes what users see and do, so each one updates Settings → How to use with new steps and new
pictures. Phase 2 also rewrites the tutorial's duct step.

## 7. Questions for the user

1. **Crossing rule.** When two ducts cross, which one hops? The proposal is that the smaller one hops under the
   larger one. Some offices instead keep supply high and send return under.
2. **Levels.** Is high / low / custom enough, or do you want named levels per project (e.g. "below beams")?
3. **Height control** (answered 2026-11-28): no keyboard shortcuts. Use the inspector, or a small panel with arrows
   on the canvas next to the place it concerns.
4. **Order.** Phase 2 (better drawing in Plan) first, or Phase 4 (drawing in 3D) first?

## Sources

- Revit, Draw Duct in a Plan View: https://help.autodesk.com/cloudhelp/2027/ENU/Revit-MEPEng/files/GUID-63A40217-8591-47A2-883F-49906BF1BC5D.htm
- Revit, Change Routing Solutions: https://help.autodesk.com/cloudhelp/2022/ENU/Revit-MEPEng/files/GUID-5B574513-B8D5-421C-B3DF-D8D7B39B9E37.htm
- AutoCAD MEP, About Auto Layout: https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-MEP/files/GUID-BCD0871A-CC82-4C37-B25E-23770AE5EACF.htm
- AutoCAD MEP, About Duct Routing Preferences: https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-MEP/files/GUID-10758110-DAC9-4A4A-9ADA-7CC066558E0D.htm
- Wrightsoft Right-Draw: https://wrightsoft.com/product/right-draw
- Wrightsoft Right-D: https://wrightsoft.com/product/right-d
- Wrightsoft Right-HV Duct: https://www.wrightsoft.com/product/right-hv-duct/
- MagiCAD connections: https://asia.glodon.com/MagiCAD/93
- DDS-CAD ventilation duct course (collision check): https://docs.dds-cad.net/19/int/manual/Content/CSH-relatedTopics/Ven/CL_VenDuc10/CL_VenDuc10_Reg2_Task01_03_03.htm
- Bentley OpenBuildings, Bypass Ducts/Pipes: https://DOCS.BENTLEY.COM/LiveContent/web/OpenBuildings%20Designer%20Help-v6/en/BmechBypass.html
- Revit add-ins: MEP updown https://marketplace.autodesk.com/apps/1aae1e18-2965-4d33-8c21-126d4ee9d24e
- Augmenta ACP 2.0 release: https://www.globenewswire.com/news-release/2026/06/17/3313424/0/en/Augmenta-Releases-ACP-2-0-the-Complete-AI-Native-Design-Environment-Built-to-Multiply-Electrical-VDC-Team-Output-and-Capacity.html
- Cities: Skylines II road tools: https://paradoxinteractive.com/games/cities-skylines-ii/features/road-tools
