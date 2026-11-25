# Full-service restaurant template — ventilation review

- **Reviewed:** 2026-11-25, against the template built by `createFullServiceProject()` in
  `src/domain/templates.ts` (system packages in `src/domain/systemPackages.ts`).
- **Fixes applied:** 2026-11-26. The template-specific packages live in `templates.ts`: `DINING_BAR_RTU`,
  `KITCHEN_LINE`, `RESTROOMS`, `DISH_EXHAUST`, `OFFICE_VENTILATION`, `OFFICE_SPLIT`.
- **Method and rate tables:** [ventilation-review-guide.md](ventilation-review-guide.md).

Rates come from ASHRAE 62.1 Tables 6-1 and 6-4, which the IMC (Table 403.3.1.1) follows closely. The template's
planning climate is Chicago, which enforces its own mechanical code (based on the IMC, with local amendments). Every
number here is a **planning check**, not a code-compliance sign-off. Confirm the adopted code edition and the real
seat count before design use.

## Summary (template as it stands now)

| Space | Area | People | Outdoor air needed | What serves it | Status |
|---|---|---|---|---|---|
| Dining | 1,033 ft² | 70 (`DINING_SEATS`) | 711 CFM | RTU, 6 × 500 CFM supply, 3 × 850 CFM return | ✅ |
| Bar | 237 ft² | 16 (`BAR_SEATS`) | 163 CFM | RTU, 2 × 275 CFM; returns through its doorway | ✅ |
| Corridor | 318 ft² | — | 19 CFM | RTU, 1 × 120 CFM | ✅ |
| Storage | 145 ft² | — | 17 CFM | RTU, 1 × 80 CFM, branched on from the bar; returns through the bar | ✅ (was ❌: nothing served it) |
| Kitchen | 667 ft² | 4 | 110 CFM OA; 467 CFM exhaust | MAU 2 × 775 CFM (100% outdoor air); 10 ft hood at 2,000 CFM | ✅ (hood was 8 ft) |
| Prep | 220 ft² | 2 | 41 CFM | MAU, 1 × 150 CFM | ✅ (was transfer air only) |
| Dish | 207 ft² | 2 | 40 CFM OA; 145 CFM exhaust | 400 CFM exhaust; air arrives from prep | ⚠ The grille stands in for a Type II hood: see 4 |
| Restroom A / B | 71 ft² each | — | 70 CFM exhaust per WC (continuous) | 150 CFM fan each, to a roof hood | ⚠ Needs door louvers, noted on the system: see 5 |
| Office | 193 ft² | 2 | 22 CFM | ERV at 250 CFM | ⚠ Still about 11× too much: see 7 |

## Air balance

| | Original template | Now |
|---|---|---|
| Outdoor air in | RTU 750 + MAU 1,600 + ERV 800 = 3,150 | RTU 1,200 + MAU 1,700 + ERV 250 = 3,150 |
| Exhaust out | hood 1,600 + dish 400 + restrooms 300 + ERV 800 = 3,100 | hood 2,000 + dish 400 + restrooms 300 + ERV 250 = 2,950 |
| Net | +50 | +200 (about 6% of outdoor air); it leaves through the RTU's barometric relief |

How the air moves now:
- The RTU zone (dining, bar, corridor, storage) supplies 3,750 CFM and returns 2,550, so it is 1,200 CFM positive.
- That air moves on into the kitchen zone and the restrooms:
  - **Kitchen zone** (kitchen, prep, dish): MAU 1,700 in, hood 2,000 plus dish 400 out. It is 700 CFM negative,
    so it draws from the dining room and corridor.
  - **Restrooms:** 300 CFM negative, drawing from the corridor.
- The remaining 200 CFM is relieved at the RTU.
- Air classes are right: return comes only from the dining room. Kitchen, dish and restroom air is exhausted.

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

### 4. Dish exhaust is a ceiling grille over a high-temperature dishwasher — open (documented)

The airflow (400 CFM against 145 required) is fine. The IMC wants a Type II (condensate) hood over steam-producing
dishwashers, or a listed direct vent. The catalogue has no Type II hood yet, so the system and grille notes now
say the grille is a placeholder.
- **Next step:** add a Type II hood product with real listing data, and swap it in `DISH_EXHAUST`.

### 5. Restrooms need a transfer path — open (documented)

Each restroom exhausts 150 CFM (70 CFM per WC is required). The make-up comes from the corridor. A 1 in undercut
passes only about 30–50 CFM quietly, so each door needs a louver or transfer grille of about 0.5–1 ft² free area.
The plan has no transfer element (`Opening` has no notes or louver field), so the requirement is in the restroom
exhaust system's notes.
- **Next step:** a transfer grille or door louver element.

### 6. Storage had no ventilation — fixed

An 80 CFM diffuser now branches off the bar supply (node `s5`), and its air returns through the door to the bar.
If the room will ever hold chemicals, it needs exhaust at 1.5 CFM/ft² instead.

### 7. Office ERV oversized — reduced, still open

The ERV went from 800 to 250 CFM, with the diffuser and grille at 250. 250 CFM is the bottom of the RenewAire HE1X
range and the smallest ERV in the catalogue. The office needs about 22 CFM, so it still over-ventilates by
about 11×. The system notes say so.
- **Next step:** add a small ERV (about 50–100 CFM; indoor units of this size need ducted outdoor-air and exhaust
  wall caps), and use it in `OFFICE_VENTILATION`.

## Not checked here

- Thermal loads, coil capacities and psychrometrics: the app does not solve them at this stage. Note that the
  added diners raise the internal loads; the RTU's 12.5 tons was not re-checked.
- Duct static pressure, noise criteria, filtration (MERV) and economizer high-limit settings.
- Fire separations, grease duct clearances and enclosures, and the fire-suppression system: NFPA 96 and the
  building code.
- The Check-phase strip along the bottom still lists systems by name (Kitchen exhaust, Make-up air…). The plan
  itself now colours air by type only.
