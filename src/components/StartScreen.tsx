'use client';

import { useState } from 'react';
import { cloneProject, createBlankProject } from '@/domain/projectOps';
import { BUILTIN_TEMPLATES, createSampleProject } from '@/domain/templates';
import { type Project, type StoredTemplate } from '@/domain/types';
import { SettingsButton } from './Settings';

export function StartScreen({
  projects,
  templates,
  onCreate,
  onOpen,
  onDeleteProject,
  onDeleteTemplate,
  onOpenLibrary,
}: {
  projects: Project[];
  templates: StoredTemplate[];
  onCreate: (project: Project) => void;
  onOpen: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
  onOpenLibrary: () => void;
}) {
  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="start">
      <header className="topbar">
        <div className="brand">
          <span className="mark">HP</span>
          <div>
            <strong>HVAC Project Planner</strong>
            <span>Engineering studio · Stage 1</span>
          </div>
        </div>
        <button type="button" className="btn" onClick={onOpenLibrary}>
          Material library
        </button>
      </header>
      <main className="start-grid">
        <section>
          <p className="kicker">Start</p>
          <h1>Restaurant projects</h1>
          <div className="choice-list">
            <button type="button" className="choice" onClick={() => onCreate(createBlankProject())}>
              <strong>Blank project</strong>
            </button>
            {BUILTIN_TEMPLATES.map(template => (
              <button key={template.id} type="button" className="choice" onClick={() => onCreate(template.create())}>
                <strong>{template.name}</strong>
                <span>{template.description}</span>
              </button>
            ))}
            <button type="button" className="choice sample" onClick={() => onCreate(createSampleProject())}>
              <strong>Harbor & Rye sample</strong>
            </button>
          </div>
          {templates.length > 0 && (
            <>
              <h2>Saved templates</h2>
              <div className="choice-list">
                {templates.map(template => (
                  <article key={template.id} className="choice static">
                    <strong>{template.name}</strong>
                    <span>{template.description}</span>
                    <span className="button-row">
                      <button type="button" className="btn primary" onClick={() => onCreate(fromTemplate(template))}>
                        Start project
                      </button>
                      <button type="button" className="btn" onClick={() => onDeleteTemplate(template.id)}>
                        Delete template
                      </button>
                    </span>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
        <section>
          <p className="kicker">This browser</p>
          <h2>Projects</h2>
          {recent.length === 0 ? (
            <p className="empty">No saved projects yet.</p>
          ) : (
            <ul className="project-list">
              {recent.map(project => (
                <ProjectRow key={project.id} project={project} onOpen={onOpen} onDelete={onDeleteProject} />
              ))}
            </ul>
          )}
        </section>
      </main>
      <SettingsButton floating />
    </div>
  );
}

function ProjectRow({ project, onOpen, onDelete }: { project: Project; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li>
      <button type="button" className="project-main" onClick={() => onOpen(project.id)}>
        <strong>{project.name}</strong>
        <span>
          {project.createdFrom.label} · {project.rooms.length} rooms · {project.equipment.length} items · {project.units}
        </span>
      </button>
      {confirming ? (
        <span className="button-row">
          <button type="button" className="btn danger" onClick={() => onDelete(project.id)}>
            Confirm
          </button>
          <button type="button" className="btn" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <button type="button" className="btn" onClick={() => setConfirming(true)}>
          Delete
        </button>
      )}
    </li>
  );
}

function fromTemplate(template: StoredTemplate): Project {
  return cloneProject(template.project, {
    name: template.name.replace(/ template$/i, ''),
    createdFrom: { kind: 'custom-template', templateId: template.id, label: template.name },
  });
}
