/**
 * In-app tutorials (Settings → How to use). Text may use **bold**. Images live in public/tutorials/<id>/ and are
 * captured from the running app by scripts/tutorial-screenshots.mjs, which also draws the numbered markers.
 */
export type TutorialBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] };

export interface TutorialStep {
  id: string;
  title: string;
  /** Shown above the picture. */
  intro?: string;
  /** File name inside the tutorial's image folder. */
  image?: string;
  alt?: string;
  /** One line per numbered marker in the picture, in the same order: what to do there. */
  callouts?: string[];
  /** Shown below the picture. */
  after?: TutorialBlock[];
}

export interface Tutorial {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  /** Folder under /public/tutorials. */
  imageDir: string;
  intro: TutorialBlock[];
  steps: TutorialStep[];
  outro?: { title: string; blocks: TutorialBlock[] }[];
}
