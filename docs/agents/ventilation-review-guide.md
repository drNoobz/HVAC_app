# How to review a template's ventilation

A repeatable method for checking that every space in a template (or a user's project) gets the outdoor air and
exhaust it needs. The worked example is
[restaurant-template-ventilation-review.md](restaurant-template-ventilation-review.md).

This is **airflow bookkeeping**, not a load calculation. The app has no solver yet; one is planned. Until then,
templates use best-guess capacities, as described in [regulations-first-templates.md](regulations-first-templates.md).
Write results as planning checks and say which code edition they assume.

## 1. Collect the inputs

| Input | Where it lives |
|---|---|
| Rooms: size, use, doors | `fullServiceRooms()` in `src/domain/templates.ts`. Area = `lengthM × widthM`; multiply by 10.764 for ft². |
| People per room | `load('people-…', room, x, y, count)` in `createFullServiceProject()`. This is the template's design occupancy. |
| Systems, terminals, airflows | The `drop(...)` calls in `createFullServiceProject()` → packages in `src/domain/systemPackages.ts` (`members[].designCfm`, unit `sections[].flowM3s`). Some packages are local to `templates.ts` (for example `DINING_BAR_RTU`, `OFFICE_SPLIT`). |
| Unit outdoor air | Mixed-air units: outdoor air = supply − return. In the template that is the RTU: 3,750 supply, 3,000 return, so 750 CFM. 100% outdoor-air units (MAU, ERV): their `oa-damper` `flowM3s`. |
| Equipment ratings | `src/domain/catalog.ts` (`airflow`, `source`, `gaps`). Cooking appliance sizes: `src/domain/loadCatalog.ts`, the `box(...)` calls. |
| What the app already checks | `airIssues()` in `src/domain/checks.ts`: open duct ends, terminal sum against unit airflow, duct velocity, grease velocity ≥ 500 fpm, building outdoor air against exhaust. It does **not** check per-space outdoor air yet. |

You can also read the built project from the running app. Create the template in the browser (see
[browser-testing.md](browser-testing.md)), then read `JSON.parse(localStorage['hvac-planner-state-v1'])`. Restore
storage afterwards.

## 2. Rates (ASHRAE 62.1 Tables 6-1 and 6-4; IMC Table 403.3.1.1 is close)

Breathing-zone outdoor air **Vbz = Rp·Pz + Ra·Az**.

| Space type | Rp (CFM/person) | Ra (CFM/ft²) | Default people / 1,000 ft² | Air class | Exhaust |
|---|---|---|---|---|---|
| Restaurant dining | 7.5 | 0.18 | 70 | 1 | — |
| Bar / cocktail lounge | 7.5 | 0.18 | 100 | 1 | — |
| Cafeteria / fast-food dining | 7.5 | 0.18 | 100 | 1 | — |
| Kitchen (cooking), prep | 7.5 | 0.12 | 20 | 2 | Commercial kitchens 0.7 CFM/ft² minimum; the hood usually exceeds it |
| Office | 5 | 0.06 | 5 | 1 | — |
| Corridor | — | 0.06 | — | 1 | — |
| Storage room (occupiable) | — | 0.12 | — | 1 | Chemical storage: exhaust 1.5 CFM/ft² |
| Toilet, public | — | — | — | 2 | 70 CFM per WC/urinal continuous (50 intermittent) |
| Toilet, private / single-user | — | — | — | 2 | 50 continuous / 25 intermittent (62.1); check the IMC table for the adopted edition |

- Use the **design occupancy** (the expected people) when it is known. Use the default density only when it is
  not.
- A full-service dining room is usually around 15 ft² per seat, which is also the IBC occupant load for
  unconcentrated tables and chairs. If a template's people count is far below that, flag it.
- Air classes: class 2 air (kitchens, restrooms, dish) must not be returned to class 1 spaces. Check that no
  return grille sits in a class 2 room.

## 3. System outdoor air

**Single-zone system** (one room, for example an office ERV): **Voz = Vbz / Ez**. Ez is 1.0 for ceiling supply of
cool air and 0.8 for ceiling supply of warm air with a ceiling return.

**Multiple-zone recirculating system** (one RTU serving dining, bar and corridor):
1. For each zone: Voz = Vbz / Ez, and Zpz = Voz / (that zone's primary supply airflow Vpz, the sum of its
   diffusers).
2. Uncorrected outdoor air: Vou = D·ΣRp·Pz + ΣRa·Az. Use D = 1 unless the zones peak at different times.
3. System ventilation efficiency Ev:
   - Simplified: Ev = 0.75 when D ≥ 0.6.
   - Appendix A: Xs = Vou / Vps (Vps = unit supply), Evz = 1 + Xs − Zpz for each zone, Ev = the smallest Evz.
4. Vot = Vou / Ev. Compare it with the unit's minimum outdoor air (supply − return for a mixed-air unit).

The zone with the highest Zpz (most outdoor air needed for the supply it gets) sets Ev. To fix a short system,
give that zone more supply first.

**100% outdoor-air units** (MAU, ERV, DOAS): the outdoor air delivered to a zone is the air delivered. Check it
against Voz for each zone, and look for gross **over**-ventilation as well as shortfall. An 800 CFM ERV on a 22 CFM
office is a finding.

## 4. Exhaust and make-up

- **Kitchen hood.** Check the length first: a canopy needs at least 6 in of overhang past the appliance line on
  every open side (front and both ends for a wall canopy). Then:
  - The exhaust rate is the listing rate × hood length for a listed hood, or the IMC table rate for an unlisted
    one (wall canopy: 200 / 300 / 400 / 550 CFM/ft for light / medium / heavy / extra-heavy duty).
  - Fryers, griddles and ranges are medium duty. Charbroilers are heavy duty.
  - Check that the appliances sit under the hood in plan: back against the wall, fronts at least 6 in inside the
    hood's front edge.
- **Grease duct.** At least 500 fpm (NFPA 96); the app already checks this. Keep the grease duct short and
  straight to the roof fan, and never route it across other ducts in plan without a clear crossing.
- **Dishwashers.** Steam-producing machines need a Type II hood or a listed direct vent, not just a ceiling
  grille.
- **Restrooms.** Exhaust straight outdoors, never into a return. Each restroom needs a transfer path for its
  make-up: a door louver or transfer grille. A 1 in undercut carries only about 30–50 CFM quietly.
- **Make-up air.** Common practice is 80–90% of hood exhaust as make-up air, with the rest transferred from the
  dining room. That keeps the kitchen negative to the dining room.

## 5. Pressure map

Write out every zone's supply − return − exhaust. The healthy restaurant pattern is:
- dining and bar positive
- the corridor passes air on
- kitchen, dish and restrooms negative
- the building slightly positive (a few percent of outdoor air)

Excess outdoor air leaves through RTU relief. Say where it goes.

## 6. Write it up

- **Summary table:** one row per space: area, people, outdoor air needed, what serves it, verdict (✅ / ⚠ / ❌).
- **Findings:** one section per finding, each with the numbers and a concrete fix (which package, which member,
  which value).
- **After-fix balance:** a table showing how the building balance moves after the fixes.
- **Not checked:** what was left out (loads, static pressure, fire and life safety).

## Pitfalls seen so far

- A template's people loads double as ventilation occupancy. Low counts silently make the RTU's outdoor air look
  adequate.
- Rooms with no terminals at all (storage, prep) are easy to miss. List every room, not every system.
- Package defaults are sized for the package's own demo room, not the template room they land in. The office ERV
  kept its 800 CFM catalogue planning point.
- Rates and sums can all pass while the terminals sit in the wrong places. Look at the plan: the supply should
  cover each room (no third of a room with returns and no diffusers), each return should sit among the diffusers
  it draws from, and an occupied room should not return only through a doorway into the next room. The
  restaurant RTU had all its dining returns at one wall and none in the bar (review finding 10).
- Appliance loads can be placed off the wall even when the hood is on it. Check the geometry, not just the hood
  airflow.
- Old projects in a user's browser keep the template as it was when they were created. A fix to `templates.ts`
  reaches only new projects.

## Changing a template's air systems

- Do not edit the catalogue packages in `systemPackages.ts` for one template's needs: other templates and the
  catalogue drop them too. Make a template-local variant in `templates.ts` that spreads the package and overrides
  `members`, `nodes`, `ducts` and `systems[].notes`, like `DINING_BAR_RTU` or `KITCHEN_LINE`.
- To change a unit's airflows, give the member `sections`: copy the catalogue sections and change `flowM3s`.
  Outdoor air on a mixed-air unit is the `oa-damper` flow, and return is supply − outdoor air.
- Select members by exact key, never by prefix. `key.startsWith('r')` silently dropped the `rtu` member along with
  the return grilles. The template still built, with no unit, and the Check phase showed it only as "units bring in
  too little outdoor air".
- After a change, build a fresh template in the browser and open Check. A correct template shows only the
  building-balance planning note. Then look for open duct ends and terminal-sum warnings.
