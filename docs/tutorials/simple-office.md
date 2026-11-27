# Tutorial: a simple office for 10–15 people

This tutorial takes you from an empty screen to a small office with its walls, heat loads, a rooftop unit and
its ducts, and a clean Check. It assumes you have never used the app. It takes about 20 minutes.

**What you will build:** one open-plan office, 60 × 40 ft (2,400 ft²), for 15 people, heated, cooled and
ventilated by one packaged rooftop unit (RTU).

> **In the app:** this tutorial, with annotated pictures of every step, is in **Settings → How to use** (bottom
> left of every screen). The in-app version (`src/tutorials/simpleOffice.ts`) is the one kept up to date; its pictures
> are in `public/tutorials/simple-office/`.

> Every number the app gives (airflows, capacities, loads) is a **planning value**, not a final design.
> Confirm equipment and code requirements with a mechanical engineer before using them for construction.

---

## Before you start: how the app is laid out

| Area | Where | What it's for |
|---|---|---|
| **Phase bar** | Across the top: **1 Spaces · 2 Loads · 3 Systems · 4 Check** | You work through these in order. The number beside each shows how many items it has, or the issue count on Check. |
| **Left panel** | Two tabs: **Project** (what is in your project) and **Catalogue** (things you can drag in) | The Catalogue changes with the phase: walls and doors in Spaces, heat sources in Loads, equipment and ducts in Systems. |
| **Canvas** | The middle: the floor plan | Everything happens here. Drag items onto it, click to select, drag to move. **Plan / 3D** switch views; **Fit** zooms to the whole project. |
| **Right panel** | The inspector | Settings for whatever is selected. |

Useful to know:
- **Your work saves automatically** in this browser. There is no Save button.
- **Undo / Redo** are at the top right (or Ctrl/Cmd + Z).
- **Esc** stops whatever tool you are using.
- Scroll to zoom; drag empty canvas to pan.
- **Settings** (bottom left): **Appearance** for a light or dark theme, **How to use** for this tutorial with pictures.

---

## Step 1: Create the project

1. Open the app. On the start page, click **Blank project**.
2. The right panel shows **Project**. Fill in:
   - **Name:** for example "Small office".
   - **Location:** your city (just a label for now).
   - **Building type:** **Commercial**.
   - **Display units:** **IP (ft, CFM, Btu/h)** (or SI if you prefer metres and L/s).

You can get back to these settings any time from **⋯ → Project settings** (top right).

---

## Step 2: Add the office space (phase 1, Spaces)

**Why 60 × 40 ft?** Offices are usually planned at 150–175 ft² per person, including desks, aisles and a meeting
corner. 15 people × 160 ft² ≈ 2,400 ft².

1. Make sure **1 Spaces** is selected in the phase bar and the left panel shows **Project**.
2. Click **+ By size**. Enter **Length X 60**, **Width Y 40**, **Height Z 10** (ft) and click **Add space**.
   The room appears on the canvas, named "Space 1".
   - *Alternative:* click **+ Draw** and drag a rectangle on the canvas. Dimensions show while you drag, and you
     can type exact values afterwards.
3. With the space selected, set these in the right panel:
   - **Name:** "Open office"
   - **Use:** **Office**
   - **Floor:** "Dining floor, carpet on a 4 in slab" (carpet on a slab; the name comes from the restaurant set)
   - **Ceiling:** "Flat roof, membrane on polyiso" (a single-storey building with a flat roof)

---

## Step 3: Walls, a door and windows

1. In the left panel, click the **Catalogue** tab.
2. Drag **Exterior wall** onto each of the four walls of the office. Drop it right on the wall line; the wall
   changes colour when it is painted.
3. Drag a **Door** onto the bottom wall (the entrance).
4. Drag a **Window** onto the top wall, twice, to add two windows.
5. To adjust a door or window, click it. You can drag it along the wall, or change its size in the right panel.

If a drop lands off a wall, a short message at the cursor says "Drop on a wall". Try again closer to the line.

---

## Step 4: Heat sources (phase 2, Loads)

These are what heat (and humidify) the room from the inside: people, lights and computers.

1. Click **2 Loads** in the phase bar, then the **Catalogue** tab on the left.
2. **People:** click the **People** chip, then drag **Moderately active office work** into the office.
   - In the right panel, set **People** to **15** and press Enter.
   - The **Type** list in the same panel changes the activity level if your office is different.
3. **Lights:** click the **Lighting** chip and drag **Office, 13.9 m² or less** into the office.
   - It covers the whole room automatically (it is a per-square-foot value).
   - It is the closest office entry in the catalogue. It is written for small private offices, so it is a little
     higher than an open-plan allowance and errs on the safe side. If you know the installed lighting watts, use
     **Manual** in the right panel to enter them.
4. **Computers and plug loads:** click **Office and plug loads** and drag **Office, medium, 100% laptop
   docking** into the office (or "100% desktop" if staff use desktop PCs). It also covers the whole room.

The **Project** tab in this phase shows the room's totals: heat (sensible and latent), moisture and CO₂. With these
three loads they are about **13,500 Btu/h sensible** and **3,000 Btu/h latent**.

---

## Step 5: Climate

The app needs your local weather to work out heat coming through walls, windows and the roof.

1. Still in **2 Loads**, click the **Project** tab, then **Site climate · Set exterior conditions**.
2. **Easiest:** click **Import .epw / .ddy / .stat** and choose the weather file for the station nearest your
   site. Free files are published by EnergyPlus and climate.onebuilding.org. The `.ddy` design-day file is the
   most useful.
3. **Or type the values.** As an example, for Chicago O'Hare:

| Field | Value |
|---|---|
| Latitude / Longitude | 41.98 / −87.92 |
| Time zone | −6 |
| Elevation | 201 m |
| Heating dry bulb (99.6%) | −4 °F |
| Cooling dry bulb (0.4%) | 91.9 °F |
| Coincident wet bulb | 74.7 °F |
| Daily range | 10.5 K |
| taub / taud | 0.455 / 2.05 |
| Infiltration default | 0.25 ACH |

Once the "Still needed" line disappears, **Design loads** at the bottom of the panel shows the room's peaks.
With the Chicago example, they are about **27,400 Btu/h sensible + 5,600 latent for cooling** (about 2.75 tons)
and **32,300 Btu/h for heating**.

---

## Step 6: Heating, cooling and fresh air (phase 3, Systems)

1. Click **3 Systems**, then the **Catalogue** tab.
2. Open **System equipment → System equipment** in the tree and find **WeatherMaker packaged rooftop** with
   **1600 CFM** and **4 ton** in its description (there are three sizes: 4, 7.5 and 12.5 tons).
3. Drag it onto the **left third of the office** and let go.
4. A small menu asks how to place it. Choose **Pregenerated system: Rooftop unit, ducted supply and return**.
   You get:
   - the rooftop unit
   - 6 supply diffusers (about 265 CFM each) and 3 return grilles, sized to the unit's 1,600 CFM
   - the supply and return ducts joining them, sized for that airflow
   - its control sensors (room temperature and supply air)

   (Choose "*… only, in a new system*" instead if you want to lay out every diffuser and duct yourself.)
5. **Rename the system:** right after the drop, the new system is selected and the right panel shows it. Change
   **Name** to "Office RTU". (Later you can find it in the left panel's **Project** tab, under **Systems**.)
6. **Set the fresh (outdoor) air.** Click the rooftop unit. In the right panel set **Minimum outdoor air** to
   **300 CFM**. Where that comes from (ASHRAE 62.1 / IMC office rates):
   - People: 5 CFM × 15 = 75 CFM
   - Floor area: 0.06 CFM/ft² × 2,400 = 144 CFM
   - Total 219 CFM; divided by 0.8 for ceiling supply in heating mode = 274 CFM. Round up to 300.
7. **Spread the diffusers** so they cover the room evenly: drag each one into place. Their ducts follow.

**Why 4 tons?** The room itself needs about 2.75 tons (Step 5). Cooling the 300 CFM of outdoor air adds roughly
another ton, so a 4-ton unit fits. Its gas heat (110 kBtu/h input, about 88 kBtu/h output) covers the room's
32,300 Btu/h plus warming the outdoor air (about 24,000 Btu/h). The unit's 1,600 CFM is a planning value (400 CFM
per ton). The app will size equipment itself once its solver is connected.

### Optional: add one more diffuser and route a duct to it

This shows how to build pieces yourself.
1. Drag **Square ceiling supply diffuser** (under **Space equipment → Air terminal**) into the room. The note at the
   cursor says **"Joins Office RTU"**: it becomes part of your system automatically.
2. Drag **G90 galvanized single-wall round spiral** (under **Ducts**) onto an existing **supply** duct. The note
   says **"Branch off … supply"**.
3. Click along the route you want, then click the new diffuser. The duct connects to it and the run finishes.
   Press **Esc** at any time to stop.

You can also right-click any duct and choose **Draw branch**, then click the duct where the branch should start.

---

## Step 7: Check your work (phase 4, Check)

1. Click **4 Check**. The left panel lists anything missing or inconsistent, for example a wall without
   construction, missing climate data, or terminals that don't add up to the unit's airflow.
2. Click an issue to jump to it on the plan, fix it, and watch the count go down.
3. When everything is in order, the phase bar shows **Check OK**.

---

## Step 8: Share the results

- **Schedule** (top centre) lists the equipment, construction and a bill of materials.
- **Export** (top right): **Schedule CSV**, **Project summary JSON**, or **Print schedule**.
- **3D** (top of the canvas) shows the building and equipment in three dimensions.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| A dropped item didn't appear | Read the note at the cursor. Loads must land inside a space; walls, doors and windows on a wall. |
| An item landed in the wrong system | Select it and change **System** in the right panel. Hold **Alt** while dropping to place it with no system. |
| Something moved by accident | **Undo** (Ctrl/Cmd + Z). The padlock button on the canvas toolbar locks positions. |
| A duct tool won't stop | Press **Esc**. |
| You want a fresh start | **‹ Projects** (top left) → **Blank project**. Old projects stay listed on the start page. |
