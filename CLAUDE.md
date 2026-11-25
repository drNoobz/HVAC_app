# HVAC Project Planner — notes for agents

Next.js / React / TypeScript planning workspace for restaurant HVAC. Projects live in the browser's localStorage.
Run with `npm run dev` (port 3100).

## Ground rules from the user

- **No solving.** No psychrometrics, load calculations or equipment sizing in the app. Airflow bookkeeping
  (sums, balances, ventilation-rate checks) is fine.
- **Everything happens on the main canvas.** Inspectors stay slim. Keep the phases Spaces, Loads, Systems and
  Check.
- Don't remove structure the user didn't ask to remove.
- **Commits:**
  - Commit only when asked.
  - End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - End PR bodies with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Every number in a template is a planning assumption. Notes in the code and UI say so; keep that wording.

## Where things are

| Area | Files |
|---|---|
| Canvas, ducts, units, legend | `src/components/PlanView.tsx` |
| App shell, phases, selection | `src/components/Studio.tsx` |
| Templates (rooms, loads, which packages are dropped) | `src/domain/templates.ts` |
| System packages (equipment + ducts dropped as one) | `src/domain/systemPackages.ts` |
| Equipment catalogue and ports | `src/domain/catalog.ts` |
| Duct catalogue, air types, colours | `src/domain/ductCatalog.ts` |
| Duct flow directions and sums | `src/domain/ducts.ts` |
| Check phase issues | `src/domain/checks.ts` |

## Guides

- [docs/agents/plan-view-conventions.md](docs/agents/plan-view-conventions.md): colours, outside-air tags, flow
  arrows, duct layering, labels, interaction rules.
- [docs/agents/ventilation-review-guide.md](docs/agents/ventilation-review-guide.md): how to check that every
  space is ventilated (rates, system outdoor air, exhaust, pressure map).
- [docs/agents/restaurant-template-ventilation-review.md](docs/agents/restaurant-template-ventilation-review.md):
  the latest review of the full-service template, with open findings.
- [docs/agents/browser-testing.md](docs/agents/browser-testing.md): typecheck command, and the localStorage-safe
  test routine.

When you learn something a future agent would need (a user preference, a pitfall, a code rule), add it to the
matching guide, or start a new one in `docs/agents/` and link it here.
