'use client';

import { useMemo, useRef, useState } from 'react';
import { createId } from '@/domain/ids';
import { downloadText } from '@/domain/download';
import {
  ASSEMBLY_CATEGORIES,
  ASSEMBLY_LIBRARY_NOTE,
  CONSTRUCTION_CATEGORIES,
  CONSTRUCTION_LIBRARY_NOTE,
  constructionCategoryLabel,
  importAssemblies,
  importMaterials,
  libraryDocument,
  mergeAssemblies,
  mergeLibrary,
  parseAssembly,
  parseMaterial,
  formatR,
  formatShgc,
  formatThickness,
  formatU,
  type AssemblyCategory,
  type ConstructionAssembly,
  type ConstructionCategory,
  type ConstructionMaterial,
} from '@/domain/constructionLibrary';
import { StackEditor } from './StackEditor';

const EMPTY_DRAFT = {
  name: '',
  category: 'wall' as ConstructionCategory,
  typicalUse: '',
  thicknessMm: '',
  rIp: '',
  uIp: '',
  uSi: '',
  shgc: '',
  source: '',
  notes: '',
};

type Draft = typeof EMPTY_DRAFT;

function draftFrom(material: ConstructionMaterial): Draft {
  return {
    name: material.name,
    category: material.category,
    typicalUse: material.typicalUse,
    thicknessMm: material.thicknessMm == null ? '' : String(material.thicknessMm),
    rIp: material.rIp == null ? '' : String(material.rIp),
    uIp: material.uIp == null ? '' : String(material.uIp),
    uSi: material.uSi == null ? '' : String(material.uSi),
    shgc: material.shgc == null ? '' : String(material.shgc),
    source: material.source,
    notes: material.notes,
  };
}

export function LibraryPanel({
  added,
  onChange,
  addedAssemblies,
  onAssembliesChange,
}: {
  added: ConstructionMaterial[];
  onChange: (next: ConstructionMaterial[]) => void;
  addedAssemblies: ConstructionAssembly[];
  onAssembliesChange: (next: ConstructionAssembly[]) => void;
}) {
  const materials = useMemo(() => mergeLibrary(added), [added]);
  const assemblies = useMemo(() => mergeAssemblies(addedAssemblies), [addedAssemblies]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<ConstructionCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);
  const [libraryView, setLibraryView] = useState<'components' | 'layers'>('components');
  const [componentOpen, setComponentOpen] = useState(false);
  const [componentName, setComponentName] = useState('');
  const [componentCategory, setComponentCategory] = useState<AssemblyCategory>('wall');
  const [componentUse, setComponentUse] = useState('');
  const [componentError, setComponentError] = useState<string | null>(null);

  const visible = materials.filter(item => {
    if (category !== 'all' && item.category !== category) return false;
    const haystack = `${item.name} ${item.typicalUse} ${item.source}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const visibleAssemblies = assemblies.filter(item => {
    if (category !== 'all' && item.category !== category) return false;
    const haystack = `${item.name} ${item.typicalUse} ${item.notes}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const openAdd = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (material: ConstructionMaterial) => {
    setEditingId(material.id);
    setDraft(draftFrom(material));
    setFormError(null);
    setFormOpen(true);
  };

  const saveDraft = () => {
    const parsed = parseMaterial(
      {
        id: editingId ?? createId('mat'),
        ...draft,
        thicknessMm: draft.thicknessMm.trim() === '' ? null : Number(draft.thicknessMm),
        rIp: draft.rIp.trim() === '' ? null : Number(draft.rIp),
        uIp: draft.uIp.trim() === '' ? null : Number(draft.uIp),
        uSi: draft.uSi.trim() === '' ? null : Number(draft.uSi),
        shgc: draft.shgc.trim() === '' ? null : Number(draft.shgc),
        deriveComplement: true,
      },
      editingId ? (added.find(item => item.id === editingId)?.origin ?? 'manual') : 'manual'
    );
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    if (!editingId && materials.some(item => item.id === parsed.material.id)) {
      setFormError('That id is already in the library.');
      return;
    }
    const next = editingId
      ? added.map(item => (item.id === editingId ? parsed.material : item))
      : [...added, parsed.material];
    onChange(next);
    setFormOpen(false);
    setMessage(editingId ? `Updated ${parsed.material.name}.` : `Added ${parsed.material.name}.`);
  };

  const saveComponent = () => {
    const first = materials.find(item => item.category === componentCategory) ?? materials.find(item => item.category === 'insulation') ?? materials[0];
    if (!first) {
      setComponentError('Add a layer material before creating a component.');
      return;
    }
    const parsed = parseAssembly(
      {
        id: createId('asm'),
        name: componentName,
        category: componentCategory,
        typicalUse: componentUse,
        orderLabel: componentCategory === 'floor' ? 'Top → bottom' : componentCategory === 'ceiling' ? 'Room side → outside' : 'Outside → inside',
        series: componentCategory !== 'ceiling',
        layers: [{ materialId: first.id, thicknessMm: null, place: 'Layer 1' }],
        source: 'Added in this browser.',
        notes: 'Custom restaurant component.',
      },
      'manual'
    );
    if (!parsed.ok) {
      setComponentError(parsed.error);
      return;
    }
    onAssembliesChange([...addedAssemblies, parsed.assembly]);
    setComponentOpen(false);
    setComponentName('');
    setComponentUse('');
    setComponentError(null);
    setMessage(`Added ${parsed.assembly.name}. Swap its layers below, or pick it on a room.`);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const materialResult = importMaterials(text, added);
      const assemblyResult = importAssemblies(text, addedAssemblies);
      const parts: string[] = [];
      const materialFailed = materialResult.message.startsWith('That file') || materialResult.message.startsWith('The file must');
      if (!materialFailed) {
        onChange(materialResult.additions);
        parts.push(materialResult.message);
      }
      if (!('error' in assemblyResult)) {
        onAssembliesChange(assemblyResult.additions);
        parts.push(`Components added ${assemblyResult.added}. Skipped ${assemblyResult.skipped}.`);
        if (assemblyResult.errors.length > 0) parts.push(assemblyResult.errors.slice(0, 2).join(' '));
      }
      setMessage(parts.length > 0 ? parts.join(' ') : materialResult.message);
    };
    reader.readAsText(file);
  };

  return (
    <div className="schedule">
      <div className="schedule-head">
        <div className="library-note">
          <p className="kicker">Settings</p>
          <h2>Material library</h2>
          <p>{libraryView === 'components' ? ASSEMBLY_LIBRARY_NOTE : CONSTRUCTION_LIBRARY_NOTE}</p>
          <p className="muted">
            Components are the restaurant floors, walls, ceilings, roofs, windows, and doors. Each one is a stack of layers. Pick a component on a room to copy that stack, then add or swap layers on that surface. A loaded database adds new ids. Built-in rows stay as shipped.
          </p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className={libraryView === 'components' ? 'btn active' : 'btn'}
            onClick={() => {
              setLibraryView('components');
              if (category === 'insulation') setCategory('all');
            }}
          >
            Components
          </button>
          <button type="button" className={libraryView === 'layers' ? 'btn active' : 'btn'} onClick={() => setLibraryView('layers')}>
            Layers
          </button>
          {libraryView === 'layers' ? (
            <button type="button" className="btn primary" onClick={openAdd}>
              Add material
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => setComponentOpen(true)}>
              Add component
            </button>
          )}
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Load database
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => downloadText('construction-materials.json', JSON.stringify(libraryDocument(materials), null, 2), 'application/json')}
          >
            Download JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              onFile(file);
            }}
          />
        </div>
      </div>
      {message && (
        <p className="muted" role="status">
          {message}
        </p>
      )}
      {libraryView === 'components' && componentOpen && (
        <form
          className="stack"
          onSubmit={event => {
            event.preventDefault();
            saveComponent();
          }}
        >
          <h3>New component</h3>
          <div className="field-grid">
            <label className="field">
              <span>Name</span>
              <input value={componentName} onChange={event => setComponentName(event.target.value)} required />
            </label>
            <label className="field">
              <span>Category</span>
              <select value={componentCategory} onChange={event => setComponentCategory(event.target.value as AssemblyCategory)}>
                {ASSEMBLY_CATEGORIES.map(item => (
                  <option key={item} value={item}>
                    {constructionCategoryLabel[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Typical use</span>
              <input value={componentUse} onChange={event => setComponentUse(event.target.value)} />
            </label>
          </div>
          {componentError && <p className="flag amber">{componentError}</p>}
          <div className="button-row">
            <button type="submit" className="btn primary">
              Save component
            </button>
            <button type="button" className="btn" onClick={() => setComponentOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {libraryView === 'layers' && formOpen && (
        <form
          className="stack"
          onSubmit={event => {
            event.preventDefault();
            saveDraft();
          }}
        >
          <h3>{editingId ? 'Edit material' : 'New material'}</h3>
          <div className="field-grid">
            <label className="field">
              <span>Name</span>
              <input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required />
            </label>
            <label className="field">
              <span>Category</span>
              <select
                value={draft.category}
                onChange={event => setDraft({ ...draft, category: event.target.value as ConstructionCategory })}
              >
                {CONSTRUCTION_CATEGORIES.map(item => (
                  <option key={item} value={item}>
                    {constructionCategoryLabel[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Typical use</span>
              <input value={draft.typicalUse} onChange={event => setDraft({ ...draft, typicalUse: event.target.value })} />
            </label>
            <label className="field">
              <span>Thickness (mm)</span>
              <input value={draft.thicknessMm} inputMode="decimal" onChange={event => setDraft({ ...draft, thicknessMm: event.target.value })} />
            </label>
            <label className="field">
              <span>R-value (h·ft²·°F/Btu)</span>
              <input value={draft.rIp} inputMode="decimal" onChange={event => setDraft({ ...draft, rIp: event.target.value })} />
            </label>
            <label className="field">
              <span>U-factor, IP</span>
              <input value={draft.uIp} inputMode="decimal" onChange={event => setDraft({ ...draft, uIp: event.target.value })} />
            </label>
            <label className="field">
              <span>U-factor, SI (W/(m²·K))</span>
              <input value={draft.uSi} inputMode="decimal" onChange={event => setDraft({ ...draft, uSi: event.target.value })} />
            </label>
            <label className="field">
              <span>SHGC</span>
              <input value={draft.shgc} inputMode="decimal" onChange={event => setDraft({ ...draft, shgc: event.target.value })} />
            </label>
            <label className="field">
              <span>Source</span>
              <input value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea rows={3} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} />
          </label>
          {formError && <p className="flag amber">{formError}</p>}
          <div className="button-row">
            <button type="submit" className="btn primary">
              Save material
            </button>
            <button type="button" className="btn" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="button-row">
        <button type="button" className={category === 'all' ? 'btn active' : 'btn'} onClick={() => setCategory('all')}>
          All
        </button>
        {(libraryView === 'components' ? ASSEMBLY_CATEGORIES : CONSTRUCTION_CATEGORIES).map(item => (
          <button key={item} type="button" className={category === item ? 'btn active' : 'btn'} onClick={() => setCategory(item)}>
            {constructionCategoryLabel[item]}
          </button>
        ))}
        <label className="field">
          <span>Search</span>
          <input value={query} onChange={event => setQuery(event.target.value)} />
        </label>
      </div>
      {libraryView === 'components' && (
        <div className="component-list">
          {visibleAssemblies.map(assembly => (
            <article key={assembly.id} className="stack-layer">
              <header>
                <div>
                  <strong>{assembly.name}</strong>
                  <div className="cell-sub">
                    {constructionCategoryLabel[assembly.category]} · {assembly.orderLabel} · {assembly.origin === 'builtin' ? 'Built-in' : 'Added'}
                  </div>
                </div>
                {assembly.origin !== 'builtin' && (
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      onAssembliesChange(addedAssemblies.filter(item => item.id !== assembly.id));
                      setMessage(`Removed ${assembly.name}. Rooms that already copied this stack keep their layers.`);
                    }}
                  >
                    Remove
                  </button>
                )}
              </header>
              <p className="muted">{assembly.typicalUse}</p>
              <StackEditor
                layers={assembly.layers}
                materials={materials}
                series={assembly.series}
                units="IP"
                readOnly={assembly.origin === 'builtin'}
                onChange={layers =>
                  onAssembliesChange(addedAssemblies.map(item => (item.id === assembly.id ? { ...item, layers } : item)))
                }
              />
              {assembly.notes && <p className="muted">{assembly.notes}</p>}
            </article>
          ))}
          {visibleAssemblies.length === 0 && <p className="muted">No components match.</p>}
        </div>
      )}
      {libraryView === 'layers' && (
      <div className="table-wrap library-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Category</th>
              <th>Thickness</th>
              <th>R</th>
              <th>U</th>
              <th>SHGC</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(item => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <div className="cell-sub">{item.typicalUse || 'Use not stated'}</div>
                  {item.notes && <div className="cell-sub">{item.notes}</div>}
                </td>
                <td>{constructionCategoryLabel[item.category]}</td>
                <td>
                  {formatThickness(item.thicknessMm, 'IP')}
                  <div className="cell-sub">{formatThickness(item.thicknessMm, 'SI')}</div>
                </td>
                <td>
                  {formatR(item, 'IP')}
                  <div className="cell-sub">{formatR(item, 'SI')}</div>
                </td>
                <td>
                  {formatU(item, 'IP')}
                  <div className="cell-sub">{formatU(item, 'SI')}</div>
                </td>
                <td>{formatShgc(item)}</td>
                <td>
                  {item.source || 'Not stated'}
                  <div className="cell-sub">{item.origin === 'builtin' ? 'Built-in' : item.origin === 'import' ? 'Imported' : 'Added'}</div>
                </td>
                <td>
                  {item.origin === 'builtin' ? (
                    <span className="muted">Built-in</span>
                  ) : (
                    <span className="button-row">
                      <button type="button" className="btn" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => {
                          onChange(added.filter(entry => entry.id !== item.id));
                          setMessage(`Removed ${item.name}. Projects that already use this id keep the id.`);
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8}>No materials match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
