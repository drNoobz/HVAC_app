# HVAC Project Planner

Standalone planning workspace for HVAC engineers and contractors. The first project type is restaurants. Equipment schedules and bills of materials are preliminary: this stage does not size equipment or call a thermal solver.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3100.

Projects and custom templates stay in this browser’s local storage. There is no sign-in provider.

## Boundary

ThermoNode Lab does not publish an HTTP API for materials, geometry validation, or simulation. This app keeps projects, templates, the catalog, placements, and the BoM. It calls an in-app adapter at `/api/thermonode/v1`:

- `GET /materials` — reference constants copied from `thermocore/src/library_materials_data.inc`
- `POST /models/validate` — geometry checks and a GeometryDocument v1 payload compatible with ThermoNode Lab’s extruded-rectangle schema
- `POST /simulations` and `GET /simulations/:jobId` — asynchronous job shape; stage 1 returns `status: unavailable` and `upstream: not-connected`

Gypsum, concrete, glass, and wood are not in that ThermoNode library snapshot, so those surfaces stay unassigned instead of receiving invented properties.
