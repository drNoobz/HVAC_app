# Checking changes in the browser

The app keeps every project in the browser's localStorage. There is no server-side data, so testing must never
leave the user's projects changed.

## Run and typecheck

```bash
npm run dev            # http://localhost:3100
npx tsc --noEmit -p . --noUnusedLocals 2>&1 | grep -v "StackLayer\|Property 'place'\|roomLoop"
```

The grep hides **pre-existing** errors (the `StackLayer` / `place` mismatch in `Inspector.tsx`, and `roomLoop`).
Any other line is yours.

## Safe test routine

1. Back up storage before touching anything:
   ```js
   const all = {}; for (const k of Object.keys(localStorage)) all[k] = localStorage.getItem(k);
   localStorage.setItem('zz-claude-backup', JSON.stringify(all));
   ```
2. Work on a copy, never on the user's project. Do one of these:
   - Clone a project in `hvac-planner-state-v1` with a new id (for example `prj-claude-test`) and open
     `/?project=prj-claude-test`.
   - Create a new project from the start page (the "Full-service restaurant" card builds the current template).
3. Use a fixed viewport (1440 × 900) for comparable screenshots. Reset it to desktop when done.
4. Restore afterwards: remove keys that are not in the backup, write the backup's keys back, then check the
   project list matches what was there before.
   ```js
   const b = JSON.parse(localStorage.getItem('zz-claude-backup'));
   for (const k of Object.keys(localStorage)) if (!(k in b)) localStorage.removeItem(k);
   for (const [k, v] of Object.entries(b)) localStorage.setItem(k, v);
   ```

The browser pane can reopen with **fresh, empty storage**. If the project list is unexpectedly empty, it is a new
profile, not lost data. Say so to the user rather than guessing.

## Useful probes

- **Zoom:** dispatch `WheelEvent`s on `.plan-wrap svg` in a loop with short awaits. A single burst only moves a
  little. Read the zoom back from the SVG `viewBox`.
- **Overlap audit:** collect visible `text` elements (skip `visibility: hidden`) and compare their
  `getBoundingClientRect()`s pairwise.
- **Equipment:** `[data-hit="equipment"]` elements carry an `aria-label` with the product name.
- **Stale console errors:** hot reloads can leave old errors in the console ("pxPerM is not defined" and the like).
  Reload before trusting the console.
