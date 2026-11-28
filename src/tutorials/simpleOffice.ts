import type { Tutorial } from './types';

/**
 * Beginner tutorial: one open-plan office for 15 people on a 4-ton rooftop unit.
 * The pictures come from scripts/tutorial-screenshots.mjs; each step's callouts match the numbered markers.
 * When the steps change, change the script too and run it again (see docs/agents/tutorials.md).
 */
export const SIMPLE_OFFICE: Tutorial = {
  id: 'simple-office',
  title: 'Your first project: a small office',
  summary: 'Build a 2,400 ft² office for 15 people, from an empty screen to a rooftop unit, its ducts and a clean Check.',
  minutes: 25,
  imageDir: '/tutorials/simple-office',
  intro: [
    {
      kind: 'p',
      text: 'This tutorial assumes you have never used the app. You will build one open-plan office, **60 × 40 ft (2,400 ft²) for 15 people**, heated, cooled and ventilated by one packaged **rooftop unit (RTU)**.',
    },
    {
      kind: 'p',
      text: 'Each picture has **orange numbered markers**. The numbered list under it says what to do at each marker, in order. When a number appears twice, both places belong to the same action, for example a catalogue item and where it lands on the plan.',
    },
    {
      kind: 'note',
      text: 'Every number the app gives (airflows, capacities, loads) is a **planning value**, not a final design. Confirm equipment and code requirements with a mechanical engineer before construction.',
    },
  ],
  steps: [
    {
      id: 'start',
      title: 'Start a blank project',
      intro: 'The start page is the first thing you see. It lists the ways to begin, and your saved projects.',
      image: '01-start.webp',
      alt: 'The start page with Blank project marked',
      callouts: [
        'Click **Blank project**. The app opens an empty workspace.',
        'Projects you create are listed here. Click one to open it again later.',
      ],
      after: [
        { kind: 'p', text: 'Your work **saves automatically** in this browser. There is no Save button.' },
        { kind: 'p', text: 'The **Full-service restaurant** card builds a complete example project. Open it later to see what a finished project looks like.' },
      ],
    },
    {
      id: 'workspace',
      title: 'Find your way around',
      intro: 'Every project uses the same workspace. Take a moment to learn its parts.',
      image: '02-workspace.webp',
      alt: 'The empty workspace with its main areas marked',
      callouts: [
        '**Phase bar.** You work through four phases from left to right: **Spaces** (rooms and walls), **Loads** (what heats the rooms), **Systems** (equipment and ducts) and **Check** (what is missing). The number beside each phase is how many items it has.',
        '**Left panel.** **Project** lists what is in your project. **Catalogue** lists what you can drag onto the plan. The catalogue changes with the phase.',
        '**Canvas.** The floor plan. Everything happens here: drag items onto it, click to select, drag to move. Scroll to zoom; drag empty space to pan.',
        '**Right panel.** The settings of whatever is selected. Nothing selected shows the project.',
        '**Undo and Redo** (or Ctrl/Cmd + Z). Press **Esc** at any time to stop the tool you are using.',
        '**Settings**, at the bottom left. **Appearance** switches between a light and a dark theme (or follows your computer); **How to use** brings you back to these tutorials.',
      ],
    },
    {
      id: 'project',
      title: 'Name the project',
      intro: 'With nothing selected, the right panel shows the project.',
      image: '03-project.webp',
      alt: 'Project settings in the right panel',
      callouts: [
        'Type a **Name**, for example "Small office".',
        'Set **Building type** to **Commercial**.',
        'Set **Construction** to **Steel frame, brick or panel cladding**: how the shell is built. The floors, walls and ceilings that fit it are suggested first later on. Leave it **Not set** if you don\'t know yet.',
        'Pick your **Display units**: **IP (ft, CFM, Btu/h)** or **SI (m, L/s, kW)**. This tutorial uses IP.',
      ],
      after: [
        { kind: 'p', text: '**North** sets which way the plan faces. Walls are named by compass from it: an outside wall is the **North wall**, **East wall** and so on, and a wall shared with another space is named after it, such as **Wall to Corridor**. Change North and every wall is renamed. This tutorial keeps north at the top of the plan.' },
        { kind: 'p', text: 'To get back here later, click an empty part of the canvas, or use **⋯ → Project settings** at the top right.' },
      ],
    },
    {
      id: 'space',
      title: 'Add the office space',
      intro: 'Offices are usually planned at 150–175 ft² per person, including desks, aisles and a meeting corner. 15 people × 160 ft² ≈ 2,400 ft², so the office is 60 × 40 ft.',
      image: '04-add-space.webp',
      alt: 'The Add space by size form',
      callouts: [
        'Phase **1 Spaces** and the **Project** tab are selected. Click **+ By size**.',
        'Enter **Length X 60**, **Width Y 40** and **Height Z 10** (feet).',
        'Click **Add space**. The room appears on the canvas.',
      ],
      after: [
        { kind: 'p', text: 'Prefer to draw? Click **+ Draw** and drag a rectangle on the canvas instead. You can type exact sizes afterwards in the right panel.' },
      ],
    },
    {
      id: 'space-settings',
      title: 'Describe the space',
      intro: 'The new room is selected, so the right panel shows its settings.',
      image: '05-space-settings.webp',
      alt: 'The space selected, with its settings in the right panel',
      callouts: [
        'Change **Name** to "Open office".',
        'Set **Use** to **Office**, in the **Office** group. Uses are grouped by kind of building (office, retail, food, education, assembly, lodging and healthcare, industrial, shared spaces). Wet rooms such as restrooms and cold rooms such as walk-ins also change what is suggested below.',
        'Set **Floor** to "Slab on grade 4 in, carpet". Floors, walls and ceilings are named by how they are built and grouped by construction class. The **Suggested** group at the top fits where the surface sits (ground floor, top floor, outside or shared wall) and the project\'s **Construction**; hover a field to see why.',
        '**Floor finish** now reads **Carpet**. Change it to tile, vinyl, hardwood or bare concrete at any time; the floor under it stays the same.',
        'Set **Ceiling** to "Exposed roof deck, membrane on R-30 polyiso", for a single-storey building with no dropped ceiling.',
        'The room on the plan, with its size. Drag a wall to resize the room, or drag the room to move it.',
      ],
    },
    {
      id: 'walls',
      title: 'Walls, a door and windows',
      intro: 'Walls tell the app how much heat passes through the outside of the building.',
      image: '06-walls.webp',
      alt: 'The Spaces catalogue and a room with walls, a door and windows',
      callouts: [
        'Click the **Catalogue** tab.',
        'Drag **Exterior wall** onto each of the four walls of the room. Drop it right on the wall line. A painted wall changes colour.',
        'Drag a **Door** onto the **South wall** (the bottom of the plan): the entrance.',
        'Drag a **Window** onto the **North wall** (the top of the plan). Do it twice for two windows.',
        'The door on the plan. Click any door or window to drag it along its wall or change its size.',
      ],
      after: [{ kind: 'p', text: 'If you drop off a wall, a short message at the cursor says **"Drop on a wall"**. Try again closer to the line.' }],
    },
    {
      id: 'people',
      title: 'Add the people',
      intro: 'Loads are what heat and humidify the room from the inside: people, lights and equipment.',
      image: '07-people.webp',
      alt: 'The Loads catalogue with an office people load placed',
      callouts: [
        'Click phase **2 Loads**.',
        'In the **Catalogue** tab, click the **People** chip.',
        'Drag **Moderately active office work** into the room.',
        'In the right panel, set **People** to **15** and press Enter.',
        '**Type** changes the activity level if your office is busier or quieter.',
      ],
    },
    {
      id: 'lights',
      title: 'Lights and computers',
      image: '08-lights.webp',
      alt: 'The Lighting chip and the office lighting load',
      callouts: [
        'Click the **Lighting** chip.',
        'Drag **Office, 13.9 m² or less** into the room. It covers the whole room automatically.',
        'Click **Office and plug loads**, then drag **Office, medium, 100% laptop docking** into the room (or **100% desktop** if staff use desktop PCs).',
      ],
      after: [
        {
          kind: 'p',
          text: 'The lighting entry is written for small private offices, so it is a little higher than an open-plan allowance and errs on the safe side. If you know the installed lighting watts, choose **Manual** in the right panel and enter them.',
        },
        { kind: 'p', text: 'With these three loads, the room gives off about **13,500 Btu/h sensible** and **3,000 Btu/h latent** (moisture) heat.' },
      ],
    },
    {
      id: 'climate',
      title: 'Set the climate',
      intro: 'The app needs local weather to work out the heat coming through walls, windows and the roof.',
      image: '09-climate.webp',
      alt: 'The site climate panel',
      callouts: [
        'In phase **2 Loads**, on the **Project** tab, click **Site climate**. Once the climate is set, this button shows the station name and design temperatures instead.',
        'Easiest: **Import** the weather file for the station nearest your site. Free `.ddy` design-day files are published for thousands of stations by EnergyPlus and climate.onebuilding.org.',
        'Or type the **Station** name and the location by hand …',
        '… and the design-day temperatures. The table below has example values.',
      ],
      after: [
        { kind: 'p', text: 'Example values for Chicago O\'Hare:' },
        {
          kind: 'table',
          head: ['Field', 'Value'],
          rows: [
            ['Latitude / Longitude', '41.98 / −87.92'],
            ['Time zone / Elevation', '−6 / 201 m'],
            ['Heating dry bulb (99.6%)', '−4 °F'],
            ['Cooling dry bulb (0.4%) / Coincident wet bulb', '91.9 °F / 74.7 °F'],
            ['Daily range', '10.5 K'],
            ['taub / taud', '0.455 / 2.05'],
            ['Infiltration default', '0.25 ACH'],
          ],
        },
      ],
    },
    {
      id: 'design-loads',
      title: 'Read the room’s heating and cooling needs',
      image: '10-design-loads.webp',
      alt: 'Design loads at the bottom of the climate panel',
      callouts: [
        'Once nothing is "still needed", **Design loads** shows the room’s peaks. For the Chicago example: about **27,400 Btu/h sensible + 5,600 Btu/h latent** for cooling (about 2.75 tons) and **32,300 Btu/h** for heating.',
      ],
      after: [
        {
          kind: 'p',
          text: 'The outdoor air you bring in (step 14) adds roughly another ton of cooling, so this office needs a unit of about **4 tons**.',
        },
      ],
    },
    {
      id: 'rtu',
      title: 'Drag in the rooftop unit',
      image: '11-drag-rtu.webp',
      alt: 'Dragging the 4-ton rooftop unit onto the plan',
      callouts: [
        'Click phase **3 Systems**.',
        'Click the **Catalogue** tab, then open **System equipment → System equipment** in the tree (the **+** opens a group).',
        'Find **WeatherMaker packaged rooftop** with **1600 CFM** and **4 ton** in its description. Drag it onto the left third of the room.',
        'While you drag, a note at the cursor says what the drop will do.',
      ],
    },
    {
      id: 'pregenerated',
      title: 'Choose a pregenerated system',
      intro: 'When you drop a unit, the app asks how to place it.',
      image: '12-place-menu.webp',
      alt: 'The placement menu for the rooftop unit',
      callouts: [
        'Choose **Pregenerated system: Rooftop unit, ducted supply and return**. You get the unit, 6 supply diffusers and 3 return grilles sized to its 1,600 CFM, the ducts that join them, and its control sensors.',
        'Or choose **… only, in a new system** to lay out every diffuser and duct yourself.',
      ],
    },
    {
      id: 'system',
      title: 'Name the system',
      intro: 'The new system is selected, so the right panel shows it.',
      image: '13-system.webp',
      alt: 'The placed rooftop system',
      callouts: [
        'Change **Name** to "Office RTU".',
        'The rooftop unit.',
        'A supply diffuser: blue, supply air.',
        'A return grille: orange, return air. Drag diffusers and grilles to spread them evenly; their ducts follow.',
      ],
      after: [{ kind: 'p', text: 'Ducts are coloured by the air they carry: **blue supply**, **orange return**, **green outdoor air in** and **brown air out**. The key is at the bottom right of the canvas.' }],
    },
    {
      id: 'outdoor-air',
      title: 'Set the fresh (outdoor) air',
      intro: 'Codes require a minimum of fresh air for the people and the floor area.',
      image: '14-outdoor-air.webp',
      alt: 'The rooftop unit selected, with its outdoor air setting',
      callouts: [
        'Click the rooftop unit on the plan. The right panel shows the unit.',
        '**Supply airflow** is the unit’s total airflow, 1,600 CFM. Leave it.',
        'Set **Minimum outdoor air** to **300 CFM** and press Enter.',
      ],
      after: [
        {
          kind: 'table',
          head: ['ASHRAE 62.1 / IMC office rates', 'CFM'],
          rows: [
            ['People: 5 CFM × 15', '75'],
            ['Floor: 0.06 CFM/ft² × 2,400 ft²', '144'],
            ['Total, ÷ 0.8 for ceiling supply in heating', '274 → **300**'],
          ],
        },
        {
          kind: 'p',
          text: '**Why 4 tons?** The room needs about 2.75 tons and the 300 CFM of outdoor air about one more. The unit’s gas heat (110 kBtu/h input, about 88 kBtu/h output) covers the room’s 32,300 Btu/h plus warming the outdoor air (about 24,000 Btu/h).',
        },
      ],
    },
    {
      id: 'branch',
      title: 'Optional: branch a duct to a new diffuser',
      intro: 'You can build pieces yourself. Anything you drop joins the right system on its own.',
      image: '15-branch.webp',
      alt: 'Dragging a duct onto an existing supply duct',
      callouts: [
        'Drag **Square ceiling supply diffuser** (under **Space equipment → Air terminal**) into the room. While you drag, the note says **"Joins Office RTU"**: it becomes part of your system.',
        'Drag **G90 galvanized single-wall round spiral** (under **Ducts**) onto a blue **supply** duct. The note says **"Branch off Office RTU · supply"**.',
      ],
      after: [
        {
          kind: 'list',
          items: [
            'Let go: a branch starts there, with the same air, duct type and size.',
            'Click along the route you want, then click the new diffuser. The duct connects and the run ends.',
            'Press **Esc** to stop at any time.',
            'Also: right-click any duct and choose **Draw branch**, then click the duct where the branch should start.',
          ],
        },
        {
          kind: 'p',
          text: '**Check** may list the new diffuser, for example while it has no duct, or because the diffusers now add up to more than the unit’s 1,600 CFM. Click the issue to see what to change (such as the diffusers’ **Terminal airflow**), or press **Undo** to take the diffuser out. The pictures below continue without it.',
        },
      ],
    },
    {
      id: 'check',
      title: 'Check your work',
      image: '16-check.webp',
      alt: 'The Check phase',
      callouts: [
        'Click phase **4 Check**. When everything is in order, it says **OK**.',
        'Otherwise the left panel lists what is missing or inconsistent, for example a wall without construction, missing climate data, or two ducts that clash where they cross at the same height. Click an issue to jump to it on the plan, fix it, and watch the count go down.',
        'A clash is also marked with a red **!** on the plan and in 3D; click it to select the duct. Its issue has a **Hop under** button that drops the smaller duct under the other where they cross.',
      ],
    },
    {
      id: '3d',
      title: 'See it in 3D',
      image: '17-3d.webp',
      alt: 'The 3D view',
      callouts: ['Click **3D** at the top of the canvas to see the building, the equipment and the ducts in their air colours. Click **Plan** to go back.'],
      after: [
        {
          kind: 'list',
          items: [
            'Drag to orbit, right-drag to pan, scroll to zoom toward the pointer. **Fit** frames the whole project again.',
            'Click anything to select it, as on the plan. Layers outside the current phase recede, and a click goes through them to what is behind.',
            'Green arrows show outside air coming in, brown arrows air going out, as on the plan.',
            'Pale chevrons painted on each duct point the way the air flows, like the Flow mark in the air key. Diffusers and grilles hang from the end of their duct.',
          ],
        },
      ],
    },
    {
      id: '3d-graphics',
      title: 'See through walls in 3D',
      image: '17b-3d-graphics.webp',
      alt: 'The Layers menu in the 3D view, with Visibility and graphics',
      callouts: [
        'In 3D, open **Layers**.',
        '**Fade by phase** makes what belongs to other phases recede, as on the plan. **Ghost surfaces** makes walls, floors, ceilings, doors and windows see-through, so the equipment and ducts inside show. **Shadows** turns the sun shadows on or off.',
        'Each category has its own tick box to hide it and a **Transparency** slider. **Reset visibility and graphics** puts them all back.',
      ],
    },
    {
      id: 'share',
      title: 'Share the results',
      image: '18-export.webp',
      alt: 'The Export menu',
      callouts: [
        '**Schedule** lists the equipment, construction and a bill of materials.',
        '**Export** downloads a **Schedule CSV** or a **Project summary JSON**, or prints the schedule.',
      ],
    },
  ],
  outro: [
    {
      title: 'If something goes wrong',
      blocks: [
        {
          kind: 'table',
          head: ['Problem', 'Fix'],
          rows: [
            ['A dropped item didn’t appear', 'Read the note at the cursor. Loads must land inside a space; walls, doors and windows on a wall.'],
            ['An item joined the wrong system', 'Select it and change **System** in the right panel. Hold **Alt** while dropping to place it with no system.'],
            ['Something moved by accident', '**Undo** (Ctrl/Cmd + Z). The padlock on the canvas toolbar locks positions.'],
            ['A duct tool won’t stop', 'Press **Esc**.'],
            ['You want a fresh start', '**‹ Projects** at the top left, then **Blank project**. Old projects stay on the start page.'],
          ],
        },
      ],
    },
  ],
};
