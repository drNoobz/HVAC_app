# Tutorials and Settings

Users find guides in **Settings → How to use**. The Settings button sits at the bottom left of every screen: first
in the status bar in a project, floating on the start page and the material library.

## Where things are

| What | File |
|---|---|
| Settings button and dialog, its sections | `src/components/Settings.tsx` (add a section to `SECTIONS`) |
| Tutorial types (steps, callouts, blocks) | `src/tutorials/types.ts` |
| Tutorial list | `src/tutorials/index.ts` |
| The small-office tutorial | `src/tutorials/simpleOffice.ts` |
| Its pictures | `public/tutorials/simple-office/*.webp` |
| Picture capture script | `scripts/tutorial-screenshots.mjs` (CDP helper in `scripts/lib/cdp.mjs`) |
| Plain-text copy for reading outside the app | `docs/tutorials/simple-office.md` |

## Keep them current (every change)

The tutorials must always describe the app as it is. Before you finish any change to the UI or its behaviour:

1. **Find what it touches.** Search `src/tutorials/` for the labels, buttons, fields and catalogue names you changed
   (for example `grep -rn "Minimum outdoor air" src/tutorials scripts/tutorial-screenshots.mjs`).
2. **Edited or removed feature:** fix the step text, the callouts and the script's selectors and markers. If a step
   no longer makes sense, rewrite it; don't leave instructions for something that is gone.
3. **New feature a user needs to learn:** add a step to the tutorial where it belongs in the workflow, or start a new
   tutorial (a new file in `src/tutorials/`, listed in `index.ts`, with its own picture folder and capture section in
   the script). Small features can be a sentence in an existing step's `after` blocks.
4. **Re-run the pictures** (`npm run tutorial:screenshots`) whenever the screens a tutorial shows have changed, even
   cosmetically, and look at every picture: markers on the right things, no error states, numbers matching the text.
5. **Check the counts:** each step's number of callouts equals the distinct marker numbers in its picture.
6. **Keep `docs/tutorials/simple-office.md` in step** for the parts you changed.
7. **Report it** in your wrap-up: which tutorial steps and pictures changed, or why none had to.

If the script fails after your change, that is a signal the tutorial is out of date: fix the script and the text,
don't delete the step.

## Rules

- Each step's `callouts` are numbered to match the orange markers in its picture. A number may appear twice when two
  places belong to one action (a catalogue row and where it lands). Change the script and the callouts together.
- Pictures come from the running app, never mock-ups. After changing the UI a tutorial shows, run the script again
  and look at every picture before committing.
- Tutorial text says planning values are planning values, like the rest of the app.

## Capturing the pictures

```
npm run dev                         # port 3100
npm run tutorial:screenshots        # all pictures
node scripts/tutorial-screenshots.mjs 11-drag-rtu   # build the whole flow, save only this picture
```

The script starts its own headless Chrome with a throw-away profile, so the projects stored in your normal browser
are not touched. It needs Google Chrome (or set `CHROME_PATH`). It runs on Node 18 by using the `ws` package that
Next.js bundles.

How it drives the app (same techniques as the browser tests in [browser-testing.md](browser-testing.md)):
- Inputs: native value setter, then `input`, `change`, Enter and `focusout`.
- Catalogue drags: `dragstart` on the real catalogue row (which sets the active drag), then `dragover` and `drop`
  on the plan at a point converted from plan metres with the SVG's screen matrix.
- Plan clicks: pointer and mouse events at the element under a plan point. Clicking an equipment group's centre can
  hit its outside-air tag; click the unit's own plan position instead.
- Markers: `t.mark([...])` draws boxes and numbered badges in a fixed overlay. Options per marker: `pad`, `inset`
  (for whole panels), `badge` (`tl` default, `tr`, `bl`, `br`, `l`, `r`, `t`) and `n` (repeat a number).

Pitfalls:
- The pictures are always taken in the light theme: the script sets `hvac-theme` to light and emulates a light
  system setting. Keep it that way so the set stays consistent.
- Labels change once filled: the climate button reads the station name after the climate is set.
- The optional branch step adds a diffuser; the script undoes it so the Check picture is clean.
