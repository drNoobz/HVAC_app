# Full-service restaurant template — ventilation review

- **Reviewed:** 2026-11-25, against the template built by `createFullServiceProject()` in
  `src/domain/templates.ts` (system packages in `src/domain/systemPackages.ts`).
- **Fixes applied:** 2026-11-26; then a regulations-first pass the same day (code basis, demand-controlled
  ventilation, Type II dish hood, small office ERV, best-guess capacities); supply and return layout on 2026-11-28 (finding 10). The template-specific packages live in `templates.ts`: `DINING_BAR_RTU`,
  `KITCHEN_LINE`, `RESTROOMS`, `DISH_EXHAUST`, `OFFICE_VENTILATION`, `OFFICE_SPLIT`.
- **Method and rate tables:** [ventilation-review-guide.md](ventilation-review-guide.md).

**Code basis** (stated in the template details as `CODE_BASIS`, generic and unamended):
- ventilation: IMC 2021 §403 and ASHRAE 62.1-2022
- kitchen exhaust and make-up air: IMC 2021 §506–508, NFPA 96-2021 and UL 710
- occupant load: IBC 2021 Table 1004.5
- energy: IECC 2021 §C403

See [regulations-first-templates.md](regulations-first-templates.md).

Rates come from ASHRAE 62.1 Tables 6-1 and 6-4, which the IMC (Table 403.3.1.1) follows closely. The template's
planning climate is Chicago, which enforces its own mechanical code (based on the IMC, with local amendments). Every
number here is a **planning check**, not a code-compliance sign-off. Confirm the adopted code edition and the real
seat count before design use.

## Summary (template as it stands now)

| Space | Area | People | Outdoor air needed | What serves it | Status |
|---|---|---|---|---|---|
| Dining | 1,033 ft² | 70 (`DINING_SEATS`) | 711 CFM | RTU, 6 × 500 CFM supply on a 3 × 2 grid, 2 × 1,050 CFM return between them | ✅ (returns were all at the west wall) |
| Bar | 237 ft² | 16 (`BAR_SEATS`) | 163 CFM | RTU, 2 × 275 CFM supply, 1 × 450 CFM return | ✅ (returned through its doorway) |
| Corridor | 318 ft² | — | 19 CFM | RTU, 1 × 120 CFM | ✅ |
| Storage | 145 ft² | — | 17 CFM | RTU, 1 × 80 CFM, branched on from the bar; returns through its door to the bar return | ✅ (was ❌: nothing served it) |
| Kitchen | 667 ft² | 4 | 110 CFM OA; 467 CFM exhaust | MAU 2 × 775 CFM (100% outdoor air); 10 ft hood at 2,000 CFM | ✅ (hood was 8 ft) |
| Prep | 220 ft² | 2 | 41 CFM | MAU, 1 × 150 CFM | ✅ (was transfer air only) |
| Dish | 207 ft² | 2 | 40 CFM OA; 145 CFM exhaust | Type II hood over the dishwasher, 400 CFM; air arrives from prep | ✅ (was a ceiling grille) |
| Restroom A / B | 71 ft² each | — | 70 CFM exhaust per WC (continuous) | 150 CFM fan each, to a roof hood; 150 CFM transfer grille in each door | ✅ (had no transfer path) |
| Office | 193 ft² | 2 | 22 CFM | Small ERV, 100 CFM class (placeholder) | ✅ (was 800 CFM) |

## Air balance

| | Original template | Now |
|---|---|---|
| Outdoor air in | RTU 750 + MAU 1,600 + ERV 800 = 3,150 | RTU 1,200 + MAU 1,700 + ERV 100 = 3,000 |
| Exhaust out | hood 1,600 + dish 400 + restrooms 300 + ERV 800 = 3,100 | hood 2,000 + dish 400 + restrooms 300 + ERV 100 = 2,800 |
| Net | +50 | +200 (about 7% of outdoor air); it leaves through the RTU's barometric relief |

How the air moves now:
- The RTU zone (dining, bar, corridor, storage) supplies 3,750 CFM and returns 2,550, so it is 1,200 CFM positive.
- That air moves on into the kitchen zone and the restrooms:
  - **Kitchen zone** (kitchen, prep, dish): MAU 1,700 in, hood 2,000 plus dish 400 out. It is 700 CFM negative,
    so it draws from the dining room and corridor.
  - **Restrooms:** 300 CFM negative, drawing from the corridor.
- The remaining 200 CFM is relieved at the RTU.
- Air classes are right: return comes only from the dining room and the bar (both class 1). Kitchen, dish and
  restroom air is exhausted.

The Check phase on a fresh template shows only the planning balance note (2026-11-26).

## Findings and what was done

### 1. Dining and bar outdoor air depended on a low seat count — fixed

The template had 36 diners in 1,033 ft², which is 29 ft² per person. It now has 70 at 15 ft² per seat (the IBC
occupant load for unconcentrated tables). The bar went from 8 to 16. Both counts are constants, `DINING_SEATS` and
`BAR_SEATS`, and they also drive the people loads.

RTU multiple-zone check at the new counts:
- Assumptions: zone air distribution effectiveness Ez = 0.8 (warm ceiling supply), occupant diversity D = 1.
- Zones: dining, bar, corridor, storage.

| Zone | Vbz | Voz | Vpz (supply) | Zpz |
|---|---|---|---|---|
| Dining | 711 | 889 | 3,000 | 0.30 |
| Bar | 163 | 203 | 550 | 0.37 |
| Corridor | 19 | 24 | 120 | 0.20 |
| Storage | 17 | 22 | 80 | 0.27 |

- **Uncorrected outdoor air:** Vou = 7.5 × 86 + 265 = 910 CFM, which gives Xs = 0.24.
- **Appendix A:** Ev = 1 + 0.24 − 0.37 = 0.87, so Vot = 1,043 CFM.
- **Simplified method:** Ev = 0.75, so Vot = 1,213 CFM.
- **RTU minimum outdoor air is set to 1,200 CFM** (`RTU_MIN_OA_CFM`), so return = 3,750 − 1,200 = 2,550. That
  covers Appendix A and is within 1% of the simplified figure.
- **If the seat count changes,** recompute and reset the constant. The bar has the highest Zpz, so it sets Ev:
  give the bar more supply before raising outdoor air.

### 2. The 8 ft hood was too short for the cooking line — fixed

- **The line:** range, fryer and griddle run from 2.24 m to 4.90 m, which is 8.7 ft. A canopy needs at least 6 in
  of overhang at each open side.
- **The hood:** added `hood-wall-10` to the catalogue (CaptiveAire ND-2, same listing as the 8 ft). At
  200 CFM/ft for the 600 °F band it exhausts 2,000 CFM, and the roof fan is set to match.
- **Measured in the app:** the hood spans 2.08–5.12 m, giving 6.3 in overhang at the left end and 8.7 in at the
  right.
- **Appliances:** moved to y = 15.55 m, against the back wall. Their fronts are now 14.6 in inside the hood's
  front edge; before, they stuck out about 1 in.
- **Grease duct:** 16 in at 2,000 CFM is about 1,430 fpm, above the 500 fpm NFPA 96 floor.
- **Make-up air:** the MAU is set to 1,700 CFM (85% of the hood). The rest transfers from the dining room, which
  keeps the kitchen negative to it.

### 3. Prep had no supply of its own — fixed

The MAU trunk now tees in prep to a 150 CFM diffuser. The two kitchen diffusers dropped to 775 CFM each.

### 4. Dish exhaust was a ceiling grille over a high-temperature dishwasher — fixed

The IMC wants a Type II (condensate) hood over steam-producing dishwashers, or a listed direct vent. The template
now has one:
- a Type II hood (`hood-type2-4`, a labelled planning placeholder) directly over the door-type dishwasher
- then the inline fan, then the roof relief hood (`DISH_EXHAUST`)

400 CFM is a planning value. Replace it with the dishwasher and hood data, and swap in a real product once one is
in the catalogue.

### 5. Restrooms had no transfer path — fixed

Each restroom exhausts 150 CFM (70 CFM per WC is required). A 1 in undercut passes only about 30–50 CFM quietly.
- **The element:** the catalogue now has `grille-transfer-door`, a labelled planning placeholder: an 18 × 12 in
  sight-proof door grille, about 0.7 ft² free area, 150 CFM at about 210 fpm. The plan draws it as a slotted
  bar with an arrow showing which way the air passes (the item's local +y).
- **The template:** `RESTROOMS` puts one in each restroom door (yaw 180: corridor → restroom).
- **The roof hoods:** moved beside the fans, so the doors stay clear.
- **The check:** Check now warns when a room with a restroom exhaust fan has less than 80% of that airflow in
  supply diffusers plus transfer grilles.

### 6. Storage had no ventilation — fixed

An 80 CFM diffuser now branches off the bar supply (node `s5`), and its air returns through the door to the bar
return grille.
If the room will ever hold chemicals, it needs exhaust at 1.5 CFM/ft² instead.

### 7. Office ERV oversized — fixed with a placeholder

The ERV is now a 100 CFM-class unit (`erv-small-100`, a labelled planning placeholder), with its diffuser and
return grille at 100 CFM on 6 in ducts. The office needs about 22 CFM; ERVs of 50–150 CFM are the smallest common
size.
- **Next step:** select a real unit. Many at this size are indoor units with ducted wall caps rather than hoods on
  the casing, so the package may need outdoor-air and exhaust ducts.

### 8. Energy code: demand-controlled ventilation — added

The dining room is over 500 ft² with more than 25 people per 1,000 ft², and it is served by an economizer unit.
IECC §C403.7.1 therefore requires demand-controlled ventilation. The RTU package now has a room CO₂ sensor,
CO2-2. The office is under 500 ft², so its CO2-1 is optional.

### 9. Best-guess capacities (no solver yet)

| Equipment | Estimate | Selected |
|---|---|---|
| RTU cooling | People 86 × 615 Btu/h ≈ 53,000; outdoor air 4.5 × 1,200 × 9.9 Btu/lb ≈ 53,000 (Chicago design day, room at 75 °F / 50%); lights ≈ 5,500; envelope and sun ≈ 20,000 (guess). About 132,000 Btu/h ≈ 11 tons. | 12.5 tons ✅ |
| MAU burner | 1.08 × 1,700 CFM × (65 − (−4) °F) ≈ 127,000 Btu/h | About 130 MBH output (was 400 MBH) |
| Office split | 193 ft² office, 2 people, one window | 1 ton ✅ (rule of thumb) |

The solver will replace these numbers. The arithmetic is in the system notes, so it is clear what to replace.

### 10. Supply and return were at opposite ends of the dining room — fixed (2026-11-28)

The user noticed that the return air sat far to the left and some supply far to the right. All three dining
return grilles were in the west fifth of the room (x 0.8–2.3 m of 12 m) and all six diffusers in the east half
(x 6.9–11.3 m), so the west third had returns and no supply, and supply air crossed about 9–10 m of the room to
reach a return. The bar had no return: its air crossed the dining room through the doorway (about 11 m), and
storage air went through the bar first (about 17 m).

With ceiling diffusers mixing the room, a return's exact spot matters less than the supply covering the room;
but each room should have supply over all of it and a return of its own nearby. Now (`DINING_BAR_RTU`):
- The RTU sits over the middle of the dining room (drop at 6, 4 m), turned 90° so its return end faces south and
  its supply end north.
- Dining: 6 × 500 CFM on a 3 × 2 grid (columns 4 m apart, rows 4.8 m apart, 1.6–2 m from the walls). Supply runs
  along the north side and down the west and east thirds, clear of the returns.
- Dining returns: 2 × 1,050 CFM on the centre line, each among four diffusers, about 3 m (10 ft) from them.
- Bar: its own 450 CFM return. It takes 550 supply plus 80 from storage, so about 180 CFM spills to the dining
  room and the bar stays slightly positive.
- Totals are unchanged (return 2,550, outdoor air 1,200), so the air balance and pressure map above still hold.
  Diffuser throw against spacing is a planning check: confirm it with the diffuser data.

## Not checked here

- A full load calculation: the capacities above are best guesses until the solver is connected.
- Energy recovery thresholds (IECC §C403.7.4) for the RTU at about 32% outdoor air: check them for the climate
  zone.
- Duct static pressure, noise criteria, filtration (MERV) and economizer high-limit settings.
- Fire separations, grease duct clearances and enclosures, and the fire-suppression system: NFPA 96 and the
  building code.
- The Check-phase strip along the bottom still lists systems by name (Kitchen exhaust, Make-up air…). The plan
  itself now colours air by type only.
