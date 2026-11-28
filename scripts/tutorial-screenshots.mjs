// Captures the pictures for the "small office" tutorial (src/tutorials/simpleOffice.ts).
//
//   npm run dev                                  # in another terminal, port 3100
//   node scripts/tutorial-screenshots.mjs        # writes public/tutorials/simple-office/*.webp
//
// It drives the running app in a headless Chrome with its own empty profile (your projects are not touched),
// builds the office step by step, draws the numbered orange markers, and saves one picture per step.
// The marker numbers must match the callouts in simpleOffice.ts: change both together.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './lib/cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/tutorials/simple-office');
const BASE = process.env.APP_URL ?? 'http://127.0.0.1:3100';
const ONLY = process.argv.slice(2); // optional: picture names to keep, e.g. 11-drag-rtu

/** Helpers installed in the page as window.__t. Plan points are in metres, +y up. */
function pageHelpers() {
  const t = {
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    buttons: (root = document) => [...root.querySelectorAll('button')],
    btn(text, root = document) {
      const all = t.buttons(root);
      const found = all.find(b => b.textContent.trim() === text) ?? all.find(b => b.textContent.trim().startsWith(text));
      if (!found) throw new Error(`No button "${text}"`);
      return found;
    },
    side: () => document.querySelector('.side'),
    /** A row of the open Layers menu, by its text. */
    layersRow: text => [...document.querySelectorAll('.layers-menu label')].find(label => label.textContent.trim() === text),
    inspector: () => document.querySelector('.inspector'),
    labelOf(field) {
      return t.labelText(field).trim();
    },
    labelText: label => label.querySelector(':scope > span')?.textContent ?? [...label.childNodes].find(node => node.nodeType === 3)?.textContent ?? '',
    fieldLabel(label, root = t.inspector()) {
      const found = [...root.querySelectorAll('label')].find(item => t.labelText(item).trim() === label);
      if (!found) throw new Error(`No field "${label}"`);
      return found;
    },
    field: (label, root) => t.fieldLabel(label, root).querySelector('input, select, textarea'),
    async set(el, value) {
      el.focus();
      if (el.tagName === 'SELECT') {
        const options = [...el.options];
        const option = options.find(o => o.textContent.trim() === value) ?? options.find(o => o.textContent.includes(value));
        if (!option) throw new Error(`No option "${value}"`);
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, option.value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        el.blur();
      }
      await t.sleep(120);
    },
    async phase(name) {
      [...document.querySelectorAll('.step-bar button')].find(b => b.textContent.includes(name)).click();
      await t.sleep(400);
    },
    async tab(name) {
      t.btn(name, t.side()).click();
      await t.sleep(300);
    },
    async expand(label, nth = 0) {
      const matches = [...t.side().querySelectorAll('button.tree-exp')].filter(b => b.getAttribute('aria-label') === label);
      const button = matches[nth];
      if (button && button.getAttribute('aria-expanded') === 'false') {
        button.click();
        await t.sleep(250);
      }
    },
    treeRow(label, nth = 0) {
      return [...t.side().querySelectorAll('button.tree-exp')].filter(b => b.getAttribute('aria-label') === label)[nth]?.closest('.tree-row');
    },
    plan: () => document.querySelector('.stage svg'),
    toClient(x, y) {
      const svg = t.plan();
      const point = svg.createSVGPoint();
      point.x = x;
      point.y = -y;
      const at = point.matrixTransform(svg.getScreenCTM());
      return { x: at.x, y: at.y };
    },
    row(text) {
      const rows = [...t.side().querySelectorAll('[draggable="true"]')];
      const found = rows.find(e => e.textContent.trim() === text) ?? rows.find(e => e.textContent.trim().startsWith(text)) ?? rows.find(e => e.textContent.includes(text));
      if (!found) throw new Error(`No catalogue row "${text}"`);
      return found;
    },
    startDrag(row) {
      row.scrollIntoView({ block: 'nearest' });
      const dataTransfer = new DataTransfer();
      row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      return dataTransfer;
    },
    dragOver(dataTransfer, x, y) {
      const c = t.toClient(x, y);
      const el = document.elementFromPoint(c.x, c.y);
      for (const type of ['dragenter', 'dragover']) el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: c.x, clientY: c.y }));
    },
    drop(row, dataTransfer, x, y) {
      const c = t.toClient(x, y);
      document.elementFromPoint(c.x, c.y).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX: c.x, clientY: c.y }));
      row.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    },
    cancelDrag(row) {
      row.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: new DataTransfer() }));
      t.plan().dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
    },
    async dropAt(rowOrText, x, y) {
      const row = typeof rowOrText === 'string' ? t.row(rowOrText) : rowOrText;
      const dataTransfer = t.startDrag(row);
      await t.sleep(50);
      t.dragOver(dataTransfer, x, y);
      await t.sleep(80);
      t.drop(row, dataTransfer, x, y);
      await t.sleep(300);
    },
    async clickClient(x, y) {
      const el = document.elementFromPoint(x, y);
      const base = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
      el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
      await t.sleep(30);
      el.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
      await t.sleep(300);
    },
    clickAt: (x, y) => {
      const c = t.toClient(x, y);
      return t.clickClient(c.x, c.y);
    },
    clickEl(el) {
      const r = el.getBoundingClientRect();
      return t.clickClient(r.left + r.width / 2, r.top + r.height / 2);
    },
    equipment: label => [...t.plan().querySelectorAll('g[data-hit="equipment"]')].find(g => (g.getAttribute('aria-label') ?? '').includes(label)),
    project() {
      const state = JSON.parse(localStorage.getItem('hvac-planner-state-v1'));
      return state.projects[0];
    },
    /** Elements from one prop-section heading up to the next. */
    section(title) {
      const heads = [...t.inspector().querySelectorAll('.prop-section')];
      const head = heads.find(h => h.textContent.trim() === title);
      const items = [head];
      for (let el = head.nextElementSibling; el && !el.classList.contains('prop-section'); el = el.nextElementSibling) items.push(el);
      return items;
    },
    /**
     * Numbered markers. Each item is an element, a list of elements (boxed together), or
     * { el, pad, inset } where pad grows the box and inset keeps it inside large panels.
     */
    mark(items) {
      t.unmark();
      document.querySelectorAll('nextjs-portal').forEach(el => (el.style.display = 'none'));
      const W = innerWidth;
      const H = innerHeight;
      const layer = document.createElement('div');
      layer.id = '__tutorial-marks';
      layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:"IBM Plex Sans","Segoe UI",sans-serif';
      items.forEach((item, index) => {
        if (!item) throw new Error(`Marker ${index + 1} has no element`);
        const spec = item instanceof Element || Array.isArray(item) ? { el: item } : item;
        const els = [].concat(spec.el).filter(Boolean);
        if (els.length === 0) throw new Error(`Marker ${index + 1} has no element`);
        const rects = els.map(el => el.getBoundingClientRect());
        const pad = spec.inset ? -4 : spec.pad ?? 4;
        let left = Math.min(...rects.map(r => r.left)) - pad;
        let top = Math.min(...rects.map(r => r.top)) - pad;
        let right = Math.max(...rects.map(r => r.right)) + pad;
        let bottom = Math.max(...rects.map(r => r.bottom)) + pad;
        left = Math.max(2, left);
        top = Math.max(2, top);
        right = Math.min(W - 2, right);
        bottom = Math.min(H - 2, bottom);
        const box = document.createElement('div');
        box.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px;border:3px solid #e8590c;border-radius:8px;box-shadow:0 0 0 4px rgba(232,89,12,0.22);box-sizing:border-box`;
        const badge = document.createElement('div');
        const size = 28;
        // The badge sits on the box edge: tl (default), tr, bl, br, l, r or t. Inset boxes pull it inside.
        const where = spec.badge ?? 'tl';
        const inward = spec.inset ? size / 2 + 6 : 0;
        const cx = where.includes('l') ? left + inward : where.includes('r') ? right - inward : (left + right) / 2;
        const cy = where.startsWith('t') ? top + inward : where.startsWith('b') ? bottom - inward : (top + bottom) / 2;
        const bx = Math.min(Math.max(4, cx - size / 2), W - size - 4);
        const by = Math.min(Math.max(4, cy - size / 2), H - size - 4);
        badge.textContent = String(spec.n ?? index + 1);
        badge.style.cssText = `position:absolute;left:${bx}px;top:${by}px;width:${size}px;height:${size}px;border-radius:50%;background:#e8590c;color:white;font-weight:700;font-size:15px;line-height:${size - 4}px;text-align:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);box-sizing:border-box`;
        layer.append(box, badge);
      });
      document.body.append(layer);
    },
    unmark() {
      document.getElementById('__tutorial-marks')?.remove();
    },
  };
  window.__t = t;
}

const W = 18.288; // 60 ft
const H = 12.192; // 40 ft

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { page, close } = await launchChrome();
  const run = async (fn, arg) => {
    const ready = await page.evaluate('!!window.__t');
    if (!ready) await page.evaluate(`(${pageHelpers.toString()})()`);
    return page.evaluate(`(${fn.toString()})(window.__t, ${JSON.stringify(arg ?? null)})`);
  };
  const shot = async (name, marks) => {
    if (marks) await run(marks);
    await new Promise(resolve => setTimeout(resolve, 250));
    if (ONLY.length === 0 || ONLY.includes(name)) {
      await page.screenshot(join(OUT, `${name}.webp`));
      console.log(`saved ${name}.webp`);
    }
    await run(t => t.unmark());
  };

  try {
    // The pictures are always in the light theme, whatever the computer prefers.
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await page.navigate(`${BASE}/`);
    await page.evaluate("localStorage.setItem('hvac-theme', 'light')");
    await page.navigate(`${BASE}/`);
    await run(async t => {
      for (let i = 0; i < 50 && !document.querySelector('.start'); i += 1) await t.sleep(200);
    });

    // 1. Start page
    await shot('01-start', t => t.mark([t.btn('Blank project'), { el: document.querySelectorAll('.start-grid > section')[1], pad: 8 }]));

    // 2. Workspace tour
    await run(async t => {
      t.btn('Blank project').click();
      for (let i = 0; i < 50 && !document.querySelector('.studio-body'); i += 1) await t.sleep(200);
      await t.sleep(600);
    });
    await shot('02-workspace', t =>
      t.mark([
        { el: document.querySelector('.step-bar'), inset: true, badge: 'tr' },
        { el: t.side(), inset: true, badge: 'br' },
        { el: document.querySelector('.stage'), inset: true, badge: 't' },
        { el: t.inspector(), inset: true, badge: 'tr' },
        [t.btn('Undo'), t.btn('Redo')],
        document.querySelector('.settings-button'),
      ])
    );

    // 3. Project settings
    await run(async t => {
      await t.set(t.field('Name'), 'Small office');
      await t.set(t.field('Building type'), 'Commercial');
      await t.set(t.field('Construction'), 'Steel frame, brick or panel cladding');
    });
    await shot('03-project', t => t.mark([t.fieldLabel('Name'), t.fieldLabel('Building type'), t.fieldLabel('Construction'), t.fieldLabel('Display units')]));

    // 4. Add a space by size
    await run(async t => {
      t.btn('+ By size').click();
      await t.sleep(300);
      await t.set(t.field('Length X', t.side()), 60);
      await t.set(t.field('Width Y', t.side()), 40);
      await t.set(t.field('Height Z', t.side()), 10);
    });
    await shot('04-add-space', t =>
      t.mark([t.btn('+ By size'), ['Length X', 'Width Y', 'Height Z'].map(label => t.fieldLabel(label, t.side())), t.btn('Add space', t.side())])
    );

    // 5. Space settings
    await run(async t => {
      t.btn('Add space', t.side()).click();
      await t.sleep(500);
      t.btn('Fit').click();
      await t.sleep(300);
      await t.set(t.field('Name'), 'Open office');
      await t.set(t.field('Use'), 'Office');
      await t.set(t.field('Floor'), 'Slab on grade 4 in, carpet');
      await t.set(t.field('Ceiling'), 'Exposed roof deck, membrane on R-30 polyiso');
    });
    await shot('05-space-settings', t =>
      t.mark([t.fieldLabel('Name'), t.fieldLabel('Use'), t.fieldLabel('Floor'), t.fieldLabel('Floor finish'), t.fieldLabel('Ceiling'), { el: t.plan().querySelector('rect[data-hit="room"]'), pad: 6 }])
    );

    // 6. Walls, door, windows
    await run(
      async (t, { W, H }) => {
        await t.tab('Catalogue');
        await t.dropAt('Exterior wall', W / 2, 0);
        await t.dropAt('Exterior wall', W / 2, H);
        await t.dropAt('Exterior wall', 0, H / 2);
        await t.dropAt('Exterior wall', W, H / 2);
        await t.dropAt('Door', W / 2, 0);
        await t.dropAt('Window', W / 3, H);
        await t.dropAt('Window', (2 * W) / 3, H);
        const door = t.project().rooms[0].openings.find(o => o.kind === 'door');
        await t.clickEl(t.plan().querySelector(`[data-opening="${door.id}"]`));
      },
      { W, H }
    );
    await shot('06-walls', t => {
      const row = el => ({ el, pad: 1, badge: 'r' });
      const door = t.project().rooms[0].openings.find(o => o.kind === 'door');
      t.mark([t.btn('Catalogue', t.side()), row(t.row('Exterior wall')), row(t.row('Door')), row(t.row('Window')), { el: t.plan().querySelector(`[data-opening="${door.id}"]`), pad: 14 }]);
    });

    // 7. People
    await run(async t => {
      await t.phase('Loads');
      await t.tab('Catalogue');
      t.btn('People', t.side()).click();
      await t.sleep(250);
      await t.dropAt('Moderately active office work', 9, 6);
      await t.set(t.field('People'), 15);
      await t.sleep(300);
    });
    await shot('07-people', t =>
      t.mark([
        [...document.querySelectorAll('.step-bar button')].find(b => b.textContent.includes('Loads')),
        t.btn('People', t.side()),
        t.row('Moderately active office work'),
        t.fieldLabel('People'),
        t.fieldLabel('Type'),
      ])
    );

    // 8. Lighting and plug loads
    await run(async t => {
      t.btn('Lighting', t.side()).click();
      await t.sleep(250);
      await t.dropAt('Office, 13.9 m', 5, 9);
      t.btn('Office and plug loads', t.side()).click();
      await t.sleep(250);
      await t.dropAt('Office, medium, 100% laptop', 13, 9);
      t.btn('Lighting', t.side()).click();
      await t.sleep(250);
    });
    await shot('08-lights', t => t.mark([{ el: t.btn('Lighting', t.side()), badge: 'r' }, { el: t.row('Office, 13.9 m'), pad: 1, badge: 'r' }, { el: t.btn('Office and plug loads', t.side()), badge: 'r' }]));

    // 9. Climate
    await run(async t => {
      await t.tab('Project');
      t.buttons(t.side()).find(b => b.textContent.includes('Site climate')).click();
      await t.sleep(400);
      const values = [
        ['Station', "Chicago O'Hare"],
        ['Latitude', 41.98],
        ['Longitude', -87.92],
        ['Time zone', -6],
        ['Elevation', 201],
        ['Heating dry bulb (99.6%)', -4],
        ['Cooling dry bulb (0.4%)', 91.9],
        ['Coincident wet bulb', 74.7],
        ['Daily range', 10.5],
        ['Infiltration default', 0.25],
        ['taub (beam)', 0.455],
        ['taud (diffuse)', 2.05],
      ];
      for (const [label, value] of values) await t.set(t.field(label), value);
      t.inspector().scrollTop = 0;
      await t.sleep(300);
    });
    await shot('09-climate', t =>
      t.mark([
        // Once the station is named, the climate button shows it instead of "Site climate".
        t.buttons(t.side()).find(b => /Site climate|Chicago O'Hare/.test(b.textContent)),
        { el: t.btn('Import .epw'), badge: 'r' },
        ['Latitude', 'Longitude', 'Time zone', 'Elevation'].map(label => t.fieldLabel(label)),
        ['Heating dry bulb (99.6%)', 'Cooling dry bulb (0.4%)', 'Coincident wet bulb', 'Daily range'].map(label => t.fieldLabel(label)),
      ])
    );

    // 10. Design loads
    await run(async t => {
      t.section('Design loads')[0].scrollIntoView({ block: 'center' });
      await t.sleep(300);
    });
    await shot('10-design-loads', t => t.mark([{ el: t.section('Design loads'), pad: 6 }]));

    // 11. Drag the rooftop unit
    await run(async t => {
      t.inspector().scrollTop = 0;
      await t.phase('Systems');
      await t.clickAt(-1.5, 6); // empty canvas: nothing selected, the project shows on the right
      await t.tab('Catalogue');
      await t.expand('System equipment', 0);
      await t.expand('System equipment', 1);
      const row = t.row('1600 CFM');
      window.__rtuDrag = t.startDrag(row);
      await t.sleep(80);
      t.dragOver(window.__rtuDrag, 5, 6);
      await t.sleep(250);
    });
    await shot('11-drag-rtu', t =>
      t.mark([
        [...document.querySelectorAll('.step-bar button')].find(b => b.textContent.includes('Systems')),
        { el: t.btn('Catalogue', t.side()), badge: 'r', n: 2 },
        { el: t.treeRow('System equipment', 1), pad: 1, badge: 'r', n: 2 },
        { el: t.row('1600 CFM'), pad: 1, badge: 'r', n: 3 },
        { el: document.querySelector('.drop-hint'), pad: 5, n: 4 },
      ])
    );

    // 12. Placement menu
    await run(async t => {
      t.drop(t.row('1600 CFM'), window.__rtuDrag, 5, 6);
      await t.sleep(400);
    });
    await shot('12-place-menu', t => {
      const items = [...document.querySelectorAll('.context-menu button')];
      t.mark([items[0], items[1]]);
    });

    // 13. The system
    await run(async t => {
      document.querySelector('.context-menu button').click();
      await t.sleep(600);
      await t.set(t.field('Name'), 'Office RTU');
      await t.sleep(200);
    });
    await shot('13-system', t =>
      t.mark([t.fieldLabel('Name'), { el: t.equipment('rooftop'), pad: 8 }, { el: t.equipment('supply diffuser'), pad: 6 }, { el: t.equipment('return grille'), pad: 6 }])
    );

    // 14. Outdoor air
    await run(async t => {
      const unit = t.project().equipment.find(item => item.catalogId === 'rtu-4');
      await t.clickAt(unit.xM, unit.yM);
      await t.set(t.field('Minimum outdoor air (CFM)'), 300);
      await t.sleep(300);
    });
    await shot('14-outdoor-air', t => {
      const unit = t.project().equipment.find(item => item.catalogId === 'rtu-4');
      t.mark([
        { el: t.plan().querySelector(`g[data-hit="equipment"][data-id="${unit.id}"]`), pad: 6 },
        { el: t.fieldLabel('Supply airflow (CFM)'), badge: 'l' },
        { el: t.fieldLabel('Minimum outdoor air (CFM)'), badge: 'l' },
      ]);
    });

    // 14b. Tags and the Systems tree: click a diffuser on the plan, the tree opens to its row.
    await run(async t => {
      await t.tab('Project');
      const diffuser = t.project().equipment.find(item => item.catalogId.startsWith('diff'));
      await t.clickAt(diffuser.xM, diffuser.yM);
      await t.sleep(300);
    });
    await shot('14b-tree', t => {
      const diffuser = t.project().equipment.find(item => item.catalogId.startsWith('diff'));
      const active = t.side().querySelector('.tree-row.active');
      t.mark([
        { el: t.plan().querySelector(`g[data-hit="equipment"][data-id="${diffuser.id}"]`), pad: 8 },
        { el: active, pad: 1, badge: 'r' },
        { el: t.treeRow('Collapse Supply air'), pad: 1, badge: 'r' },
        { el: t.treeRow('Expand Supply ducts'), pad: 1, badge: 'r' },
        { el: t.fieldLabel('Tag'), badge: 'r' },
      ]);
    });
    await run(async t => {
      await t.tab('Catalogue');
      const unit = t.project().equipment.find(item => item.catalogId === 'rtu-4');
      await t.clickAt(unit.xM, unit.yM);
    });

    // 15. Branch
    await run(async t => {
      await t.expand('Ducts');
      await t.expand('Space equipment');
      await t.expand('Air terminal');
      await t.dropAt('Square ceiling supply diffuser', 15.5, 8);
      const duct = t.row('G90 galvanized');
      window.__ductDrag = t.startDrag(duct);
      await t.sleep(80);
      t.dragOver(window.__ductDrag, 10.6, 6);
      await t.sleep(250);
    });
    // Each marker appears twice: the catalogue row, and what it does on the plan.
    await shot('15-branch', t => {
      const added = t.project().equipment.at(-1);
      t.mark([
        { el: t.row('Square ceiling supply diffuser'), pad: 1, badge: 'r', n: 1 },
        { el: t.plan().querySelector(`g[data-hit="equipment"][data-id="${added.id}"]`), pad: 6, n: 1 },
        { el: t.row('G90 galvanized'), pad: 1, badge: 'r', n: 2 },
        { el: document.querySelector('.drop-hint'), pad: 5, n: 2 },
      ]);
    });

    // 16. Check (the optional diffuser is undone first so the project checks clean)
    await run(async t => {
      t.cancelDrag(t.row('G90 galvanized'));
      await t.sleep(200);
      t.btn('Undo').click();
      await t.sleep(300);
      await t.phase('Check');
      await t.tab('Project');
    });
    await shot('16-check', t =>
      t.mark([[...document.querySelectorAll('.step-bar button')].find(b => b.textContent.includes('Check')), { el: t.side().querySelector('.panel-section') ?? t.side(), pad: -2 }])
    );

    // 17. 3D
    await run(async t => {
      t.btn('3D').click();
      await t.sleep(2500);
    });
    await shot('17-3d', t => t.mark([[t.btn('Plan'), t.btn('3D')]]));

    // 17b. Visibility and graphics: ghost surfaces on, with the Layers menu open
    await run(async t => {
      t.btn('Layers ▾').click();
      await t.sleep(300);
      t.layersRow('Ghost surfaces').querySelector('input').click();
      await t.sleep(1200);
    });
    await shot('17b-3d-graphics', t =>
      t.mark([t.btn('Layers ▾'), { el: [t.layersRow('Fade by phase'), t.layersRow('Ghost surfaces'), t.layersRow('Shadows')], badge: 'l' }, { el: document.querySelector('.vg-grid'), pad: 2, badge: 'l' }])
    );

    // 18. Schedule and export
    await run(async t => {
      t.layersRow('Ghost surfaces').querySelector('input').click();
      await t.sleep(200);
      t.btn('Layers ▾').click();
      await t.sleep(200);
      t.btn('Plan').click();
      await t.sleep(300);
      t.btn('Schedule').click();
      await t.sleep(600);
      t.btn('Export ▾').click();
      await t.sleep(300);
    });
    await shot('18-export', t => t.mark([{ el: t.btn('Schedule'), badge: 'tr' }, { el: document.querySelector('.menu-panel'), pad: 4 }]));
  } finally {
    await close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
