'use client';

import { useState } from 'react';
import { cloneProject, createBlankProject } from '@/domain/projectOps';
import { BUILTIN_TEMPLATES, createSampleProject } from '@/domain/templates';
import { DISCLAIMER, type Project, type StoredTemplate } from '@/domain/types';

export function StartScreen({
  projects,
  templates,
  onCreate,
  onOpen,
  onDeleteProject,
  onDeleteTemplate,
}: {
  projects: Project[];
  templates: StoredTemplate[];
  onCreate: (project: Project) => void;
  onOpen: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
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
      </header>
      <p className="disclaimer">{DISCLAIMER}</p>
      <main className="start-grid">
        <section>
          <p className="kicker">Start</p>
          <h1>Restaurant projects</h1>
          <p className="lede">
            Model spaces, assign ThermoNode materials where the library has them, place equipment, and export a preliminary schedule. Other building types can be set on a project. Templates are restaurants for this stage.
          </p>
          <div className="choice-list">
            <button type="button" className="choice" onClick={() => onCreate(createBlankProject())}>
              <strong>Blank project</strong>
              <span>Empty model. Draw spaces or enter dimensions.</span>
            </button>
            {BUILTIN_TEMPLATES.map(template => (
              <button key={template.id} type="button" className="choice" onClick={() => onCreate(template.create())}>
                <strong>{template.name}</strong>
                <span>{template.description}</span>
              </button>
            ))}
            <button type="button" className="choice sample" onClick={() => onCreate(createSampleProject())}>
              <strong>Harbor & Rye sample</strong>
              <span>Completed example with rooms, materials, systems, and placed equipment. Every value is an assumption.</span>
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
          <p className="muted">Stored locally. Nothing is uploaded, and there is no portal sign-in in this demo.</p>
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
