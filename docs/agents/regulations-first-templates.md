# Building a template: regulations first

The user's rule: **look at the regulations first, derive the requirements from them, then design.** A template
states which codes it follows, lists what those codes require of every space, and only then places equipment and
sets airflows to meet that list.

This guide covers:
- where the regulations come from
- how to turn them into a requirements list
- how to design and check against it

[ventilation-review-guide.md](ventilation-review-guide.md) has the ventilation arithmetic.
[restaurant-template-ventilation-review.md](restaurant-template-ventilation-review.md) is a worked example.

## Sizing in templates: best guess for now

There is no solver yet; one is coming. Until then, templates use **best-guess engineering values**:
- approximate CFM, Btu/h, tons and burner MBH
- worked by hand rules (for example 1.08 × CFM × ΔT for sensible heat, or the outdoor-air enthalpy load)
- labelled as planning estimates in the notes

The goal is the right equipment in the right places, at about the right size. When the solver arrives, it replaces
these numbers. Keep the arithmetic in the notes, so it is clear what to replace.

## 1. Where regulations come from (United States)

1. **Model codes.** Private bodies write them on a three-year cycle: 2018, 2021, 2024. A model code is not law
   until a government adopts it.
   - **ICC:**
     - IBC (building: occupant loads, fire separations)
     - IMC (mechanical: ventilation, exhaust, kitchen hoods, ducts)
     - IFGC (fuel gas)
     - IFC (fire)
     - IECC (energy)
     - IPC (plumbing: fixture counts)
   - **IAPMO:** the UMC and UPC, used instead of the ICC codes in some western states.
2. **Referenced standards.** These get legal force by being named in an adopted code:
   - ASHRAE 62.1 (ventilation) and 90.1 (energy)
   - NFPA 96 (kitchen exhaust and fire suppression)
   - UL 710 / UL 300 (hood and suppression listings)
   - SMACNA (duct construction), and AMCA / AHRI (ratings)
3. **Adoption with amendments.** A state, county or city adopts a named edition and changes parts of it. This
   decides what applies. Big cities often keep their own codes; Chicago does.
4. **Other agencies** with their own rules:
   - The health department: the FDA Food Code as adopted by the state, plus plan review for food service.
   - The fire marshal: IFC and NFPA 96.
   - Federal rules: EPA refrigerant rules, DOE minimum equipment efficiencies, OSHA, and ADA.
5. **The Authority Having Jurisdiction (AHJ).** This is the local building official or fire marshal. Their
   reading is what counts, for example on whether transferred air counts as a room's outdoor air.

Code text is copyrighted. Many ICC codes and ASHRAE 62.1 can be read free online. Cite sections and use the
published rates; do not paste code text into the app or the docs.

## 2. State the code basis

Every template names its jurisdiction and the editions it assumes. Use the template's details text and the notes
of its systems, so users see it. If the real jurisdiction is unknown, say the basis is **generic model codes,
unamended**.

**Generic US basis** (used by the full-service template, whose climate is Chicago):

| Topic | Code or standard |
|---|---|
| Ventilation and exhaust rates | IMC 2021 §403 (Table 403.3.1.1); ASHRAE 62.1-2022 |
| Kitchen hoods, grease ducts, make-up air | IMC 2021 §506–508; NFPA 96-2021; UL 710 hood listing |
| Occupant load | IBC 2021 Table 1004.5 |
| Energy (economizer, demand-controlled ventilation, energy recovery) | IECC 2021 §C403 or ASHRAE 90.1-2019 |
| Food-service rules | FDA Food Code as adopted by the state |

**For a real Chicago project**, confirm all of these with the Chicago Department of Buildings, the Chicago Fire
Department and the health department:
- the Chicago Construction Codes (Title 14 of the Municipal Code; the mechanical code is based on the IMC with
  Chicago amendments)
- the Chicago energy code
- the Illinois Food Code

## 3. Derive the requirements, space by space

Before placing anything, write one requirement record per room. Fields:

| Field | Source |
|---|---|
| Occupancy (people) | The design count if known; otherwise the IBC occupant-load factor or the ASHRAE 62.1 default density. Restaurant dining: 15 ft² net per person for unconcentrated tables. |
| Outdoor air (CFM) | Rp·Pz + Ra·Az from IMC Table 403.3.1.1 / ASHRAE 62.1 Table 6-1, divided by Ez |
| Exhaust (CFM) | IMC Table 403.3.1.1 exhaust column / 62.1 exhaust table. Restrooms: 70 per WC continuous. Commercial kitchens: 0.7 CFM/ft². |
| Air class / recirculation | Class 2 (kitchen, dish, restrooms) may not return to class 1 spaces (IMC §403.2.1) |
| Pressure | Kitchen negative to dining; restrooms negative to the corridor; the building slightly positive |
| Hoods | Type I over grease-producing appliances, sized for 6 in overhang, at the listing rate (IMC §507, NFPA 96). Type II over steam or heat (for example dishwashers) unless the machine is listed otherwise. |
| Make-up air | About equal to the kitchen exhaust from all sources, interlocked with the hood fan (IMC §508) |
| Energy rules | Economizer by climate zone and size; demand-controlled ventilation for spaces over 500 ft² at ≥ 25 people per 1,000 ft² on systems with an economizer or modulating outdoor-air damper (IECC §C403.7.1); energy recovery above the IECC thresholds |
| Food code | Hood coverage and cleanable surfaces; ventilation enough to keep condensation and grease off surfaces |

Put the records in the template review document as a table, with the section cited on each number.

## 4. Design to the requirements

1. **Zones by schedule and air class.** Group spaces with the same hours and class 1 air onto one system (dining,
   bar, corridor, storage on an RTU). Give spaces with other hours their own (an office ERV and split). Keep
   class 2 spaces on exhaust.
2. **Equipment.** Pick catalogue products whose rated range covers the best-guess size. If nothing fits, add a
   product. Use a real product when its data is known; otherwise add a clearly labelled planning placeholder. Do
   not stretch a product outside its published range.
3. **Airflows.**
   - Set terminal CFMs so each zone gets its outdoor air.
   - Set unit outdoor air from the system calculation (Vot).
   - Set the hood exhaust from the listing, and the make-up air from the exhaust.
4. **Best-guess capacities.**
   - Cooling from people + outdoor air + lights + envelope.
   - Heating from 1.08 × CFM × ΔT for outdoor air, plus envelope.
   - Write the arithmetic in the system notes.
5. **Controls the energy code asks for:** CO₂ sensors where demand-controlled ventilation is required, and hood
   and make-up-air interlocks.

## 5. Check

- Build a fresh template in the browser and open Check (see [browser-testing.md](browser-testing.md)).
- Compare each room against its requirement record.
- Update the review document: requirements table, design response, and open items.

## Next steps for the app

The requirement records live only in docs today. The next step is to make them data:
- a `codeBasis` on the project
- a per-room requirements list derived from a rate table

Then the Check phase could compare the design against each requirement and cite the section. This is bookkeeping,
so it fits the app now. The solver will later replace the best-guess capacities, not the requirements.
