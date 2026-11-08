'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createId, nowIso } from '@/domain/ids';
import { cloneProject } from '@/domain/projectOps';
import { loadState, saveState } from '@/domain/storage';
import type { Project, StoredTemplate } from '@/domain/types';
import { StartScreen } from './StartScreen';
import { Studio } from './Studio';

export default function App() {
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get('project');
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);

  useEffect(() => {
    const loaded = loadState();
    setProjects(loaded.projects);
    setTemplates(loaded.templates);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveState({ schemaVersion: 1, projects, templates });
  }, [ready, projects, templates]);

  if (!ready) return <div className="boot">Loading workspace…</div>;

  const open = (id: string) => router.push(`/?project=${encodeURIComponent(id)}`);
  const project = projects.find(item => item.id === projectId) ?? null;

  if (!projectId) {
    return (
      <StartScreen
        projects={projects}
        templates={templates}
        onCreate={next => {
          setProjects(list => [next, ...list]);
          open(next.id);
        }}
        onOpen={open}
        onDeleteProject={id => setProjects(list => list.filter(item => item.id !== id))}
        onDeleteTemplate={id => setTemplates(list => list.filter(item => item.id !== id))}
      />
    );
  }

  if (!project) {
    return (
      <div className="boot">
        <p>That project is not stored in this browser.</p>
        <button type="button" className="btn" onClick={() => router.push('/')}>
          Back to projects
        </button>
      </div>
    );
  }

  return (
    <Studio
      project={project}
      templates={templates}
      onChange={next =>
        setProjects(list => list.map(item => (item.id === next.id ? { ...next, preliminary: true, updatedAt: nowIso() } : item)))
      }
      onBack={() => router.push('/')}
      onSaveTemplate={name => {
        const snapshot = cloneProject(project, { name });
        const template: StoredTemplate = {
          id: createId('tpl'),
          name,
          description: 'Saved from a project. Rooms, materials, and equipment remain assumptions until confirmed.',
          updatedAt: nowIso(),
          project: snapshot,
        };
        setTemplates(list => [template, ...list]);
      }}
      onUpdateTemplate={() => {
        const templateId = project.createdFrom.templateId;
        if (!templateId) return;
        setTemplates(list =>
          list.map(item =>
            item.id === templateId ? { ...item, updatedAt: nowIso(), project: cloneProject(project, { name: item.name }) } : item
          )
        );
      }}
      onDeleteProject={() => {
        setProjects(list => list.filter(item => item.id !== project.id));
        router.push('/');
      }}
    />
  );
}
