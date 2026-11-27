'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadAddedAssemblies, loadAddedMaterials, saveAddedAssemblies, saveAddedMaterials, type ConstructionAssembly, type ConstructionMaterial } from '@/domain/constructionLibrary';
import { createId, nowIso } from '@/domain/ids';
import { cloneProject } from '@/domain/projectOps';
import { loadState, saveState } from '@/domain/storage';
import type { Project, StoredTemplate } from '@/domain/types';
import { LibraryPanel } from './LibraryPanel';
import { SettingsButton } from './Settings';
import { useThemeSync } from '@/domain/theme';
import { StartScreen } from './StartScreen';
import { Studio } from './Studio';

export default function App() {
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get('project');
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [addedMaterials, setAddedMaterials] = useState<ConstructionMaterial[]>([]);
  const [addedAssemblies, setAddedAssemblies] = useState<ConstructionAssembly[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  useThemeSync();

  useEffect(() => {
    const block = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('wheel', block, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', block, { capture: true });
  }, []);

  useEffect(() => {
    const loaded = loadState();
    setProjects(loaded.projects);
    setTemplates(loaded.templates);
    setAddedMaterials(loadAddedMaterials());
    setAddedAssemblies(loadAddedAssemblies());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveState({ schemaVersion: 1, projects, templates });
  }, [ready, projects, templates]);

  useEffect(() => {
    if (!ready) return;
    saveAddedMaterials(addedMaterials);
  }, [ready, addedMaterials]);

  useEffect(() => {
    if (!ready) return;
    saveAddedAssemblies(addedAssemblies);
  }, [ready, addedAssemblies]);

  if (!ready) return <div className="boot">Loading workspace…</div>;

  const open = (id: string) => {
    setLibraryOpen(false);
    router.push(`/?project=${encodeURIComponent(id)}`);
  };
  const project = projects.find(item => item.id === projectId) ?? null;

  if (!projectId && libraryOpen) {
    return (
      <div className="start">
        <header className="topbar">
          <div className="brand">
            <span className="mark">HP</span>
            <div>
              <strong>HVAC Project Planner</strong>
              <span>Material library</span>
            </div>
          </div>
          <button type="button" className="btn" onClick={() => setLibraryOpen(false)}>
            Back
          </button>
        </header>
        <LibraryPanel added={addedMaterials} onChange={setAddedMaterials} addedAssemblies={addedAssemblies} onAssembliesChange={setAddedAssemblies} />
        <SettingsButton floating />
      </div>
    );
  }

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
        onOpenLibrary={() => setLibraryOpen(true)}
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
      addedMaterials={addedMaterials}
      addedAssemblies={addedAssemblies}
      onLibraryChange={setAddedMaterials}
      onAssembliesChange={setAddedAssemblies}
      onChange={next =>
        setProjects(list => list.map(item => (item.id === next.id ? { ...next, preliminary: true, updatedAt: nowIso() } : item)))
      }
      onBack={() => router.push('/')}
      onSaveTemplate={name => {
        const snapshot = cloneProject(project, { name });
        const template: StoredTemplate = {
          id: createId('tpl'),
          name,
          description: '',
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
