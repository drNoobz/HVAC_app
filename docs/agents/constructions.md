# Construction components (floors, walls, ceilings, roofs, doors, windows)

The app plans any commercial building (offices, retail, restaurants, schools, assembly, factories, warehouses),
so components are **named by how they are built, not by the room they sit in**. "Slab on grade 4 in, carpet"
is right; "Dining floor" is not. A gym, a cinema and an office reuse the same components. Do not add a set of
components per building type.

## Where things are

| What | File |
|---|---|
| Materials (one layer each, with a published R or U and its source) | `src/domain/construction-materials.json` |
| Components (ordered stacks of materials) | `src/domain/construction-assemblies.json` |
| Families, grouping, parsing, layer sums | `src/domain/constructionLibrary.ts` |
| Which component suits which room use, and floor finishes | `src/domain/envelopeDefaults.ts` |
| Wall kinds, plan colours, role labels | `src/domain/walls.ts` (`WALL_TYPES`, `wallKindFor`, `wallColor`) |
| Plan wall thickness | `graphicWall()` in `src/components/PlanView.tsx` |

## Families follow the energy codes

Every built-in component has a `family` from `ASSEMBLY_FAMILIES`. Walls, roofs and floors use the envelope
classes of ASHRAE 90.1 and the IECC: mass, steel-framed, wood-framed, metal building; insulation above deck;
slab on grade. Ceilings, partitions and insulated panels have their own groups. The pickers group by family,
and later a component can be checked against the code's maximum U-factor for the climate zone. A family must
belong to the component's category; the loader throws if it does not.

The wall kind, the plan colour and the plan thickness all come from the family, so a new wall component needs
no colour or kind code. Only add a case when a component must look different from its family.

## Rules

- **Never change or reuse a component id.** Saved projects and templates refer to components by id
  (`asm-floor-dining` is "Slab on grade 4 in, carpet"). Rename the `name`, never the `id`.
- **Every number has a source.** Put the published table and value in `source`, and say in `notes` what the
  layer sum leaves out (studs, air films, plenums). Where layers cannot be added (metal buildings, attics),
  use one whole-element row from the IECC table and say so. These are planning values: keep that wording.
- **Floor finishes are not separate components.** The finish is the top layer of a floor, chosen with
  **Floor finish** on the space (`FLOOR_FINISHES`). Add a finish there, not a new floor for each finish.
  When a finish makes a floor's layers match another built-in floor exactly, the floor switches to it.
- **Suggestions come from the building, not the room's name.** `suggestFor` in `envelopeDefaults.ts` lists
  components first under one **Suggested** group, from three things, and puts the reason on the field's hover
  text ("Outside wall · metal building", "Space above", "Ground floor · wet room"):
  1. **Where the surface sits**, read from the plan (`roomSituation`): ground floor, a space below, raised
     with nothing below, a space above, top floor, outside wall or shared wall.
  2. **The project's Construction** (project settings: steel frame, concrete, masonry, metal building, wood
     frame, or not set). It picks the exterior wall, the top ceiling or roof, and the slab.
  3. **Special uses only**: wet rooms (tile, washable ceiling) and cold rooms (insulated panels). Do not add
     suggestions per ordinary use such as "Office"; that was tried and was too specific.
- **Template picks are separate.** `defaultAssemblyId` holds the restaurant template's per-use picks. Keep them
  unchanged unless the template itself is being redesigned.
- **Keep the tutorials current.** Component names appear in the simple office tutorial and its pictures
  (see [tutorials.md](tutorials.md)).

## Adding a component

1. Add any new material to `construction-materials.json`, with its source.
2. Add the component to `construction-assemblies.json` with a `family`, a `typicalUse` that lists several
   building types, the layer order the file's note gives, and `series: false` when a plenum or attic sits
   between layers.
3. If it should be suggested, add its id to the matching list in `suggestFor` (by position and construction).
4. Typecheck, open the space's pickers, and check both themes if it is a wall (its family colour).
