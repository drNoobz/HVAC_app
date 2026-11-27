# HVAC Project Planner — notes for agents

Next.js / React / TypeScript planning workspace for restaurant HVAC. Projects live in the browser's localStorage.
Run with `npm run dev` (port 3100).

## Ground rules from the user

- **Regulations first.** When building or changing a template, start from the code basis and derive each space's
  requirements before placing equipment. See
  [docs/agents/regulations-first-templates.md](docs/agents/regulations-first-templates.md).
- **No solver yet (temporary).** The app does not run psychrometrics or load calculations; a solver is planned.
  Until then, templates use best-guess sizes (approximate CFM, Btu/h, tons) with the arithmetic in the notes, so
  the right equipment lands in the right places. Airflow bookkeeping (sums, balances, ventilation-rate checks) is
  fine.
- **Everything happens on the main canvas.** Inspectors stay slim. Keep the phases Spaces, Loads, Systems and
  Check.
- Don't remove structure the user didn't ask to remove.
- **Commits:**
  - Commit only when asked.
  - End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - End PR bodies with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Every number in a template is a planning assumption. Notes in the code and UI say so; keep that wording.
- **Two themes.** Every colour must work in light and dark. Use the CSS tokens in `globals.css`; pass data colours
  (air, walls, loads) through `ink()` or `wash()`; never hard-code a hex in a component. Check both themes. See
  [docs/agents/theme.md](docs/agents/theme.md).
- **Keep the tutorials current.** Settings → How to use is how users learn the app. Any change that adds, renames,
  moves or removes something a user sees (a button, field, catalogue item, menu, drop behaviour, phase) is not done
  until the tutorials match: update the steps in `src/tutorials/`, re-run `npm run tutorial:screenshots`, and look at
  every picture. A new feature a user needs to learn gets a step or a new tutorial. Say in your wrap-up what changed
  in the tutorials, or why nothing had to. See [docs/agents/tutorials.md](docs/agents/tutorials.md).

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
| Floors, walls, ceilings (components, families, suggestions) | `src/domain/construction-assemblies.json`, `src/domain/envelopeDefaults.ts` |
| Space uses (grouped Use list, occupied / wet / cold flags, plan fills) | `src/domain/spaceUses.ts` |

## Guides

- [docs/agents/regulations-first-templates.md](docs/agents/regulations-first-templates.md): where codes come
  from, the code basis, deriving requirements per space, and designing a template to them.
- [docs/agents/plan-view-conventions.md](docs/agents/plan-view-conventions.md): colours, outside-air tags, flow
  arrows, duct layering, labels, interaction rules.
- [docs/agents/ventilation-review-guide.md](docs/agents/ventilation-review-guide.md): how to check that every
  space is ventilated (rates, system outdoor air, exhaust, pressure map).
- [docs/agents/restaurant-template-ventilation-review.md](docs/agents/restaurant-template-ventilation-review.md):
  the latest review of the full-service template, with open findings.
- [docs/agents/browser-testing.md](docs/agents/browser-testing.md): typecheck command, and the localStorage-safe
  test routine.
- [docs/agents/theme.md](docs/agents/theme.md): light and dark themes, colour tokens, `ink()` / `wash()`, the 3D scene
  look, and how to check a colour change.
- [docs/agents/constructions.md](docs/agents/constructions.md): floors, walls and ceilings named by how they are
  built and grouped by energy-code class, floor finishes, suggestions by position and construction, and how to add a component.
- [docs/agents/tutorials.md](docs/agents/tutorials.md): Settings → How to use, tutorial content, and the script that
  captures the annotated pictures. Re-run it when the UI a tutorial shows changes.
- [docs/proposals/user-built-spaces-loads-systems.md](docs/proposals/user-built-spaces-loads-systems.md): the plan
  for users building spaces, loads, units and systems by drag and drop (smart drops, space types, unit builder).

When you learn something a future agent would need (a user preference, a pitfall, a code rule), add it to the
matching guide, or start a new one in `docs/agents/` and link it here.
