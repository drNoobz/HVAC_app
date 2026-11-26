# Proposal: users build their own spaces, loads and systems

- **Date:** 2026-11-26
- **Status:** phase 1 (smart drops for systems) built 2026-11-27; phases 2–5 proposed.
- **Goal:** a user can build what the restaurant template builds by dragging from the catalogue onto the canvas:
  - spaces, loads and systems
  - prebuilt units (RTU, MAU, ERV…)
  - their own units and systems, saved for reuse

## 1. What a user can do today

Tested on a blank project in the browser (2026-11-26) and read in the code (`Studio.tsx`, `PlanView.tsx` `onDrop`,
`catalogDrag.ts`, `systemPackages.ts`, `systemTemplates.ts`, `Inspector.tsx`).

| Phase | What works | What is missing or awkward |
|---|---|---|
| **Spaces** | Draw a rectangle (Room tool), trace walls, or add one by size. Drag wall types, doors and windows onto walls. | The new space is "Space 1", use **Unassigned**. Nothing to drag that says "Dining" or "Restroom", so occupancy, ventilation rate and air class are never set unless the user finds the Use field. |
| **Loads** | Good catalogue (people, cooking, dish, refrigeration, lighting, plug), drag into a space. | A load dropped outside a space does nothing, with no message. No sets ("cook line", "70 diners"), so a dining room takes many drags. |
| **Systems: templates** | Drag a system template (RTU ducted, hood + MAU, restroom exhaust…). It drops units, terminals and ducts as one system. Works well. | It lands at the drop point at its own size and ignores the room it falls on. Terminal airflows are the package defaults, not the room's needs. |
| **Systems: single items** | Drag any unit, terminal or fan onto the plan. | The item gets **no system**, so it is not part of any airflow sum. A **duct dropped with no system does nothing**, silently. The user must first create a system from a menu, then pick it in the bottom bar, then drag. |
| **Build a unit** | A placed unit's sections can be added from a dropdown in the inspector and edited one by one. | Not on the canvas. Loose parts in the catalogue (damper, filter, coil, fan, mixing plenum) drop as separate boxes, not as sections of a unit. There is no "empty unit casing" to start from. |
| **Save my own** | A system can be saved as a template ("Save as template" in the system inspector). It appears under System templates › My templates in this browser. | Hard to find. Only whole systems; a user-built unit cannot be saved as a catalogue product. |

**The pattern:** the drag-and-drop pieces exist (`CatalogDrag` tokens for equipment, load, duct, wall, package,
opening), but the drop does too little. The canvas places things without connecting them, and the user has to fix
system membership, room use and airflows in side panels.

## 2. The idea: smart drops, one catalogue per phase

Keep the four phases and the left Catalogue tab. Make every drop on the canvas **do the bookkeeping a template
does**, and show what it did on the canvas.

### 2.1 Spaces: drag a space type (any building type)

The app will cover more than restaurants: offices, retail and malls, banks, schools, factories and warehouses.
So space types are **not** restaurant rooms. They follow the occupancy categories the codes already use:
ASHRAE 62.1 Table 6-1 and IMC Table 403.3.1.1 list about 100 categories across every building type, each with
its people rate (Rp), area rate (Ra), default density and air class. Exhaust needs come from 62.1 Table 6-4.

**Data model (generic):**
- `SPACE_TYPES` in `src/domain/spaceTypes.ts`. One record per code occupancy category:
  - name (the code's wording, for example "Restaurant dining rooms", "Office space", "Sales (retail)",
    "Bank vaults / safe deposit", "Manufacturing (excludes heavy industrial and chemical processes)",
    "Warehouses", "Corridors", "Toilets, public")
  - group: Food and beverage, Office, Retail, Industrial, Assembly, Education, Lodging, Healthcare, Shared
    (corridors, storage, restrooms, mechanical rooms)
  - Rp, Ra, default people per 1,000 ft², air class, exhaust rule, and the code reference for each number
  - a typical floor area, used only for the first size
- The rate table is tied to a **code basis on the project** (IMC 2021 / ASHRAE 62.1-2022 to start). Other bases
  (UMC, the National Building Code of Canada, a city's amendments) can be added later as more tables. Space types
  never change; only the rates under them do.
- A room keeps its free-text name ("Dining", "Bay 3") separate from its space type, so a user can call a room
  anything.

**In the catalogue:** a Space types group, filtered by the project's building type first (a restaurant project
shows food-service types on top), with search across all groups.

| Gesture | Result |
|---|---|
| Drag a space type onto empty canvas | Creates a room with that type, named after it |
| Drag a space type onto an existing room | Sets that room's type, and renames it if it still has the default name |
| Draw a room, then drop a type | Same as above; drawing stays the way to get exact sizes |

**First size (your decision: generic and editable):** a 4:3 rectangle of the type's typical area, rounded to
1 ft. For example: office 150 ft², dining 1,000 ft², sales floor 2,000 ft², warehouse 5,000 ft², restroom
70 ft². It snaps to the grid and stays clear of other rooms. The user then drags walls or types the dimensions.
Nothing about the size is locked.

The room chip shows what the code needs, for example **Office space · 2 people · 22 CFM OA**. This is the
per-room requirements list the regulations guide already names as the next step. The rates come from the rate
table, so they work for a bank or a factory as well as a restaurant.

### 2.2 Loads: fewer, smarter catalogue items

**Today the catalogue lists a row per table entry.** There are 9 "people" rows (one per ASHRAE activity level), and
separate rows for electric/gas and hooded/unhooded versions of the same appliance. Proposed:

| Item | Options set on the canvas chip or in the slim inspector |
|---|---|
| **People** (one item) | Count; activity level (the 9 ASHRAE Table 4 levels, from "seated at theater" to "heavy work"). The space type picks the default activity and the count comes from its density. |
| **Appliance** (one item per appliance type: fryer, griddle, range, oven…) | Fuel (electric / gas / solid) and hood (hooded / unhooded), limited to the combinations ASHRAE tabulates; quantity |
| **Dishwasher** | Type (door, conveyor…), vented / unvented |
| **Refrigeration** | Type; quantity |
| **Lighting** (one item) | W/ft² from the space type's lighting power allowance (ASHRAE 90.1 table), or installed watts |
| **Plug loads** (one item) | W/ft² by density (light / medium / heavy office), or a list of devices |
| **Process source** (new, for industrial) | User-entered sensible, latent or moisture (kg/h), CO₂ and CO. Covers ovens, motors, forklifts, wash lines. |

- **A load dropped outside a space** snaps into the nearest space, or shows "Drop inside a space" at the cursor.
  Never a silent no-op (done in phase 1).
- **Load sets** stay in the plan for later ("Cook line, 10 ft", "Dish station", "Workstation × 10").

**Heat, humidity, CO₂ and CO: what is wired in today** (checked in `src/domain/loads.ts`, 2026-11-27):

| Load | Heat (sensible / latent) | Moisture | CO₂ | CO |
|---|---|---|---|---|
| People (9 activity levels) | ✅ ASHRAE Table 4 | ✅ latent ÷ 2,450 J/g | ✅ metabolic, Persily & de Jonge 2017 (food allowance excluded) | — (none from people) |
| Cooking, electric unhooded (15) | ✅ | ✅ where latent > 0 | 0 (correct: no combustion) | — |
| Cooking, hooded electric and gas | ✅ radiant only (the hood takes the rest) | 0 to the room (correct when under a hood) | Gas combustion CO₂ and water are computed per item and shown as "goes to hood exhaust" | ❌ no value |
| Dishwashers | ✅ | ✅ | 0 | — |
| Refrigeration, lighting, plug | ✅ sensible | 0 (correct) | 0 (correct) | — |
| Any load | Manual override of sensible, latent, CO₂ and CO | | | |

**Gaps found:**
1. **CO is never filled in.** Every load needs a manual value. That's acceptable for electric appliances and
   people, but unvented combustion (gas, propane forklifts, vehicles) needs a default. Add a CO default with the
   new Process source and any unvented gas item.
2. **A hooded gas appliance that is not under a hood** still sends its combustion CO₂ and water to the hood. The
   Check phase already warns that it's not under a hood, but the totals should count the products in the room.
   Fix: treat them as captured only when `hoodOver()` finds a hood. (Fixed alongside phase 1.)
3. **Combustion water is never added to room moisture**, even when it isn't captured. No unhooded gas item exists
   today, so nothing is wrong yet, but the first one would be undercounted. (Fixed alongside phase 1.)
4. **Nothing uses the totals yet.** Moisture, CO₂ and CO are shown in the Loads panel and the room inspector, but
   no check compares room CO₂ against the ventilation or links it to the CO₂ sensors. That belongs with the space
   types (phase 2) and the solver.

### 2.3 Systems: every drop joins a system

The rule: **nothing on the plan is left without a system unless the user wants that.**

| Drop | What happens |
|---|---|
| A **unit** (RTU, MAU, ERV, AHU, split) | **Asks:** "Pregenerated system" (the matching system template, with the dropped unit in it, terminals scaled to its airflow) or "Unit only" (a new, empty system of the right kind). Either way everything stays editable. (Your decision.) |
| A **fan or hood** | Joins the nearest system of a matching kind. If there is none, it asks like a unit: pregenerated system (hood + make-up air, restroom exhaust…) or fan only. |
| A **terminal** (diffuser, grille, louver) | Joins the nearest system that carries its air (supply, return, exhaust, outdoor). Hold Alt to drop it unassigned. |
| A **duct** on an existing duct | **Starts a branch:** a tee on that duct, same system, air type, product and size. Click to route it into another space. |
| A **duct** near an open port | Starts from that port, in that unit's system and air type. |
| A **duct** on empty canvas with no system | Creates a new system the duct can carry, instead of doing nothing. |
| A **system template** | As today, at the drop point. (Centring on a room is for later.) |

While dragging, a hint at the cursor says what will happen ("Joins Rooftop comfort", "Branch off Rooftop comfort
supply", "Drop inside a space"), and the target system's labels show. A drop that can't do anything says why.

**Branching from an existing duct (your question).** It already works, but it's hidden: with the duct tool set to
the same system and air type, clicking on a run makes a tee there. Phase 1 makes it reachable:
- drag a duct from the catalogue onto the run, or
- right-click a run → **Draw branch**, then click on the run where the tee goes.

Either way the tool picks up the run's system, air type, product and size, so the user only clicks the route into
the other space.

### 2.4 Prebuilt units in the catalogue

Reorganise the Systems catalogue into four groups, in this order:

1. **Systems** (today's "System templates"): RTU ducted, kitchen hood + MAU, restroom exhaust, office ERV + split…
   plus **My systems**.
2. **Units:** packaged products with internals. RTU, MAU, ERV, AHU, split, DOAS. Plus **My units**.
3. **Terminals and fans:** diffusers, grilles, transfer grilles, louvers, roof hoods, hoods, exhaust fans.
4. **Ducts and parts:** ducts, and loose unit sections (damper, filter, coil, fan, humidifier, heat-recovery
   wheel…) for building units (see 2.5).

Each row shows a small icon and one line of spec ("12.5 t · 3,750 CFM · gas"). Search spans all groups.

### 2.5 Users build their own units on the canvas

A unit is already a list of sections (`UnitSection`, `SECTION_KINDS`) drawn open on the plan when the unit is
expanded. Make that drawing the editor:

1. Drag **Custom air handler (empty casing)** from Units onto the plan. It opens on the canvas, showing a supply
   fan and an empty slot.
2. Drag sections from **Ducts and parts** into the open unit. Drop markers show where a section will go: between
   sections, on the outdoor-air side, or on the return side. A section dropped outside a unit stays what it is today,
   a loose item.
3. Drag a section along the unit to reorder it. Drag it out of the casing to remove it. Click it to set flow,
   medium and capacity in the slim inspector (as today).
4. The casing grows to fit the sections. Ports (SA, RA, OA, EA) appear where the sections need them, so ducts snap
   to them.
5. **Save as unit** (inspector button and right-click on the canvas): stores the casing, sections and ports as a
   **My units** product in this browser, next to My systems. The user names it ("RTU 7.5 t gas, economizer").

Prebuilt units are the same thing: a catalogue product with default sections. A user can drop an RTU, open it,
drag in a heat-recovery wheel, and save it as their own unit.

### 2.6 Users build their own systems

This already exists ("Save as template" on a system). Make it visible:
- Right-click a system on the canvas or in the tree → **Save as my system**.
- A lasso selection on the canvas → **Save selection as system**. That is the natural "I built this, keep it"
  gesture.
- My systems and My units get rename, delete and export / import (JSON) in the Library view, like construction
  assemblies today.

## 3. Drop feedback (applies everywhere)

- **While dragging:** a ghost of the item at true size, the target room or system highlighted, and a one-line hint
  at the cursor ("Joins Rooftop comfort", "New make-up air system", "Sets use: Restroom").
- **After the drop:** select the new item and switch to its phase (already a rule).
- **If the drop can't do anything:** say why at the cursor for two seconds. No silent failures.

## 4. Data changes (small)

- `CatalogDrag` gains: `{ kind: 'space'; id }`, `{ kind: 'loadSet'; id }`, `{ kind: 'section'; sectionKind }`,
  `{ kind: 'unit'; id }` (a user unit).
- A `SPACE_TYPES` table in a new `src/domain/spaceTypes.ts`: use, typical size, density, Rp, Ra, exhaust, air
  class, pressure, code reference.
- User units are stored like user systems: a new localStorage key `hvac-user-units-v1`, read by `getProduct`
  alongside `CATALOG`.
- `PlacedEquipment.sections` already holds a unit's sections, so a custom unit needs no new placement model.

## 5. Phased plan

Each phase is usable on its own and keeps the four phases and slim inspectors.

| # | Phase | Size | What the user gets |
|---|---|---|---|
| 1 | **Smart drops for systems** | M | Units create their system; terminals join the nearest system; ducts never no-op; drop hints. Fixes the biggest pain found in testing. |
| 2 | **Space types** | M | Drag an occupancy category (any building type) onto the canvas or a room; code rates and occupancy on the room chip. |
| 3 | **Catalogue regroup + My systems visible** | S | Systems / Units / Terminals and fans / Ducts and parts; Save as my system on right-click. |
| 4 | **Build units on the canvas** | L | Empty casing, drag sections in, reorder, save as My unit. |
| 5 | **Consolidated loads** | M | One People item with activity level, one item per appliance with fuel and hood options, a Process source for industrial, CO defaults; load sets. |

**Recommended start: phase 1.** It is what blocks a user from building a system by hand today, and phases 2–4 build
on its drop feedback.

## 6. Decisions (2026-11-27)

- **Dropped units:** ask whether to drop a pregenerated system or the unit alone. Either way the user can edit
  everything afterwards.
- **My units and My systems:** must move between projects. For now they live in this browser (like today's saved
  system templates); an account-level save and load comes later.
- **Space type size:** a generic first size (section 2.1), freely editable.
- **Space types:** generic code occupancy categories, not restaurant rooms, so other building types fit.
