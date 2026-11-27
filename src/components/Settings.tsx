'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { TUTORIALS } from '@/tutorials';
import type { Tutorial, TutorialBlock } from '@/tutorials/types';
import { useThemePreference, type ThemePreference } from '@/domain/theme';

/**
 * Settings, opened from the bottom-left corner of every screen. Sections are listed on the left of the dialog;
 * add new ones to SECTIONS.
 */
interface SettingsSection {
  id: string;
  label: string;
  render: () => ReactNode;
}

const SECTIONS: SettingsSection[] = [
  { id: 'appearance', label: 'Appearance', render: () => <Appearance /> },
  { id: 'how-to', label: 'How to use', render: () => <HowToUse /> },
];

const THEME_CHOICES: { id: ThemePreference; label: string; note: string }[] = [
  { id: 'system', label: 'Match system', note: 'Follows your computer’s light or dark setting.' },
  { id: 'light', label: 'Light', note: 'Light panels and a paper-white plan.' },
  { id: 'dark', label: 'Dark', note: 'Dark panels and a dark plan, easier on the eyes at night.' },
];

function Appearance() {
  const [preference, setPreference] = useThemePreference();
  return (
    <div className="appearance">
      <h1>Appearance</h1>
      <p className="howto-lead">Choose how the app looks. Your choice is saved in this browser.</p>
      <h2 className="settings-subhead">Theme</h2>
      <div className="theme-choices" role="radiogroup" aria-label="Theme">
        {THEME_CHOICES.map(choice => (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={preference === choice.id}
            className={`theme-choice${preference === choice.id ? ' active' : ''}`}
            onClick={() => setPreference(choice.id)}
          >
            <ThemePreview kind={choice.id} />
            <strong>{choice.label}</strong>
            <span>{choice.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A small drawing of the workspace in a theme's own colours (fixed, so each card shows its theme). */
function ThemePreview({ kind }: { kind: ThemePreference }) {
  const frame = (theme: 'light' | 'dark') => (
    <span className={`theme-preview tp-${theme}`}>
      <span className="tp-top" />
      <span className="tp-body">
        <span className="tp-side">
          <i />
          <i />
          <i />
        </span>
        <span className="tp-plan">
          <span className="tp-room">
            <span className="tp-duct" />
            <span className="tp-return" />
          </span>
        </span>
        <span className="tp-inspector">
          <i />
          <i />
        </span>
      </span>
    </span>
  );
  if (kind !== 'system') return frame(kind);
  return (
    <span className="theme-preview-split">
      {frame('light')}
      {frame('dark')}
    </span>
  );
}

/** The gear button. `floating` pins it to the bottom-left of the window, for screens without a status bar. */
export function SettingsButton({ floating = false }: { floating?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`settings-button${floating ? ' floating' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="Settings and tutorials"
      >
        <GearIcon />
        <span>Settings</span>
      </button>
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [sectionId, setSectionId] = useState(SECTIONS[0].id);
  const section = SECTIONS.find(item => item.id === sectionId) ?? SECTIONS[0];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="settings-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="settings-dialog" role="dialog" aria-modal="true" aria-label="Settings">
        <nav className="settings-nav">
          <h2>Settings</h2>
          {SECTIONS.map(item => (
            <button key={item.id} type="button" className={item.id === section.id ? 'active' : ''} onClick={() => setSectionId(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <section className="settings-content">
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
          {section.render()}
        </section>
      </div>
    </div>
  );
}

function HowToUse() {
  const [tutorialId, setTutorialId] = useState<string | null>(null);
  const tutorial = TUTORIALS.find(item => item.id === tutorialId);
  if (tutorial) return <TutorialView tutorial={tutorial} onBack={() => setTutorialId(null)} />;
  return (
    <div className="howto">
      <h1>How to use</h1>
      <p className="howto-lead">Step-by-step guides with pictures from the app. Each picture has numbered markers that match the steps under it.</p>
      <div className="howto-cards">
        {TUTORIALS.map(item => (
          <button key={item.id} type="button" className="howto-card" onClick={() => setTutorialId(item.id)}>
            {item.steps[0]?.image && <img src={`${item.imageDir}/${coverOf(item)}`} alt="" />}
            <strong>{item.title}</strong>
            <span>{item.summary}</span>
            <small>
              {item.steps.length} steps · about {item.minutes} min
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The picture that best shows what a tutorial ends with. */
function coverOf(tutorial: Tutorial): string {
  const withImages = tutorial.steps.filter(step => step.image);
  return (withImages.find(step => step.id === 'system') ?? withImages[0]).image!;
}

function TutorialView({ tutorial, onBack }: { tutorial: Tutorial; onBack: () => void }) {
  return (
    <article className="tutorial">
      <button type="button" className="tutorial-back" onClick={onBack}>
        ‹ All guides
      </button>
      <h1>{tutorial.title}</h1>
      <p className="tutorial-meta">
        {tutorial.steps.length} steps · about {tutorial.minutes} min
      </p>
      <Blocks blocks={tutorial.intro} />
      <ol className="tutorial-toc">
        {tutorial.steps.map(step => (
          <li key={step.id}>
            <a
              href={`#tut-${tutorial.id}-${step.id}`}
              onClick={event => {
                // Scroll inside the dialog; leave the app's URL alone.
                event.preventDefault();
                document.getElementById(`tut-${tutorial.id}-${step.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {step.title}
            </a>
          </li>
        ))}
      </ol>
      {tutorial.steps.map((step, index) => (
        <section key={step.id} id={`tut-${tutorial.id}-${step.id}`} className="tutorial-step">
          <h2>
            <span className="tutorial-step-number">{index + 1}</span>
            {step.title}
          </h2>
          {step.intro && <p>{rich(step.intro)}</p>}
          {step.image && (
            <a className="tutorial-shot" href={`${tutorial.imageDir}/${step.image}`} target="_blank" rel="noreferrer" title="Open full size">
              <img src={`${tutorial.imageDir}/${step.image}`} alt={step.alt ?? step.title} loading="lazy" />
            </a>
          )}
          {step.callouts && step.callouts.length > 0 && (
            <ol className="tutorial-callouts">
              {step.callouts.map((text, n) => (
                <li key={n}>
                  <span className="tutorial-marker" aria-hidden="true">
                    {n + 1}
                  </span>
                  <span>{rich(text)}</span>
                </li>
              ))}
            </ol>
          )}
          {step.after && <Blocks blocks={step.after} />}
        </section>
      ))}
      {tutorial.outro?.map(part => (
        <section key={part.title} className="tutorial-step">
          <h2>{part.title}</h2>
          <Blocks blocks={part.blocks} />
        </section>
      ))}
    </article>
  );
}

function Blocks({ blocks }: { blocks: TutorialBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'p':
            return <p key={index}>{rich(block.text)}</p>;
          case 'note':
            return (
              <p key={index} className="tutorial-note">
                {rich(block.text)}
              </p>
            );
          case 'list':
            return (
              <ul key={index}>
                {block.items.map((item, n) => (
                  <li key={n}>{rich(item)}</li>
                ))}
              </ul>
            );
          case 'table':
            return (
              <table key={index} className="tutorial-table">
                <thead>
                  <tr>
                    {block.head.map(cell => (
                      <th key={cell}>{rich(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c}>{rich(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
        }
      })}
    </>
  );
}

/** **bold** and `code` inside tutorial text. */
function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
