'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { createId } from '@/domain/ids';
import { downloadText } from '@/domain/download';
import {
  CATALOG,
  CATEGORY_LABEL,
  FAMILY_CATEGORIES,
  type CatalogProduct,
  type EquipmentCategory,
  type EquipmentFamily,
} from '@/domain/catalog';
import {
  ASSEMBLY_CATEGORIES,
  CONSTRUCTION_CATEGORIES,
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
import { DUCT_CATALOG, roughnessLabel, sizeSummary, streamLabels, type DuctProduct } from '@/domain/ductCatalog';
import { PACKAGE_GROUPS, packageSummary } from '@/domain/systemPackages';
import { deleteUserPackage } from '@/domain/systemTemplates';
import { useSystemPackages } from './useSystemPackages';
import { SYSTEM_KINDS } from '@/domain/types';
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
  potentialSupplier: '',
};

type Draft = typeof EMPTY_DRAFT;
type LibrarySection = 'construction' | EquipmentFamily | 'ducts' | 'packages';
type DuctGroup = DuctProduct['group'] | 'all';
type ConstructionMode = 'components' | 'layers';

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
    potentialSupplier: material.potentialSupplier,
  };
}

function productSpec(product: CatalogProduct): string {
  return [product.airflow?.stated, product.cooling?.stated, product.heating?.stated, product.dimensions?.stated]
    .filter(Boolean)
    .join(' · ');
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
  const [section, setSection] = useState<LibrarySection>('construction');
  const packages = useSystemPackages();
  const [constructionMode, setConstructionMode] = useState<ConstructionMode>('components');
  const [category, setCategory] = useState<ConstructionCategory | 'all'>('all');
  const [equipmentCategory, setEquipmentCategory] = useState<EquipmentCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);
  const [componentOpen, setComponentOpen] = useState(false);
  const [componentName, setComponentName] = useState('');
  const [componentCategory, setComponentCategory] = useState<AssemblyCategory>('wall');
  const [componentUse, setComponentUse] = useState('');
  const [componentError, setComponentError] = useState<string | null>(null);
  const [selectedAssemblyId, setSelectedAssemblyId] = useState<string | null>(null);
  const [ductGroup, setDuctGroup] = useState<DuctGroup>('all');

  const switchSection = (next: LibrarySection) => {
    setSection(next);
    setQuery('');
    setMessage(null);
    setFormOpen(false);
    setComponentOpen(false);
    setCategory('all');
    setEquipmentCategory('all');
    setDuctGroup('all');
    setSelectedAssemblyId(null);
  };

  const visible = materials.filter(item => {
    if (category !== 'all' && item.category !== category) return false;
    const haystack = `${item.name} ${item.typicalUse} ${item.source} ${item.potentialSupplier}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const visibleAssemblies = assemblies.filter(item => {
    if (category !== 'all' && item.category !== category) return false;
    const haystack = `${item.name} ${item.typicalUse} ${item.notes}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const equipmentFamily = section === 'space' || section === 'system' ? section : null;
  const familyCategories = equipmentFamily ? FAMILY_CATEGORIES[equipmentFamily] : [];
  const familyProducts = useMemo(() => {
    if (!equipmentFamily) return [];
    const needle = query.trim().toLowerCase();
    return CATALOG.filter(product => {
      if (!FAMILY_CATEGORIES[equipmentFamily].includes(product.category)) return false;
      if (equipmentCategory !== 'all' && product.category !== equipmentCategory) return false;
      if (!needle) return true;
      return `${product.name} ${product.manufacturer} ${product.model} ${product.supplier} ${CATEGORY_LABEL[product.category]}`
        .toLowerCase()
        .includes(needle);
    });
  }, [equipmentFamily, equipmentCategory, query]);

  const constructionCounts = useMemo(() => {
    const source = constructionMode === 'components' ? assemblies : materials;
    const counts: Record<string, number> = { all: source.length };
    for (const item of source) counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, [assemblies, materials, constructionMode]);

  const equipmentCounts = useMemo(() => {
    if (!equipmentFamily) return { all: 0 } as Record<string, number>;
    const inFamily = CATALOG.filter(product => FAMILY_CATEGORIES[equipmentFamily].includes(product.category));
    const counts: Record<string, number> = { all: inFamily.length };
    for (const item of familyCategories) counts[item] = inFamily.filter(product => product.category === item).length;
    return counts;
  }, [equipmentFamily, familyCategories]);

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

  const ductGroups = ['Round metal', 'Rectangular', 'Flexible', 'Phenolic', 'Fabric', 'Grease'] as const;
  const ductCounts = useMemo(() => {
    const counts: Record<string, number> = { all: DUCT_CATALOG.length };
    for (const item of DUCT_CATALOG) counts[item.group] = (counts[item.group] ?? 0) + 1;
    return counts;
  }, []);
  const visibleDucts = DUCT_CATALOG.filter(item => {
    if (ductGroup !== 'all' && item.group !== ductGroup) return false;
    const haystack = `${item.name} ${item.manufacturer} ${item.model} ${item.supplier} ${item.material}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const navCategory = section === 'construction' ? category : section === 'ducts' ? ductGroup : equipmentCategory;
  const navCounts = section === 'construction' ? constructionCounts : section === 'ducts' ? ductCounts : section === 'packages' ? { all: packages.length } : equipmentCounts;
  const navItems = section === 'construction'
    ? (constructionMode === 'components' ? ASSEMBLY_CATEGORIES : CONSTRUCTION_CATEGORIES)
    : section === 'ducts'
      ? ductGroups
      : section === 'packages'
        ? []
        : familyCategories;
  const selectedAssembly = visibleAssemblies.find(item => item.id === selectedAssemblyId) ?? null;

  return (
    <div className="library">
      <nav className="library-sections" aria-label="Library sections">
        <button type="button" className={section === 'construction' ? 'active' : ''} onClick={() => switchSection('construction')}>
          Construction
        </button>
        <button type="button" className={section === 'space' ? 'active' : ''} onClick={() => switchSection('space')}>
          Space equipment
        </button>
          <button type="button" className={section === 'system' ? 'active' : ''} onClick={() => switchSection('system')}>
            System equipment
          </button>
          <button type="button" className={section === 'packages' ? 'active' : ''} onClick={() => switchSection('packages')}>
            System templates
          </button>
          <button type="button" className={section === 'ducts' ? 'active' : ''} onClick={() => switchSection('ducts')}>
            Ducts
          </button>
        </nav>

      <div className="library-toolbar">
        <label className="library-search">
          <span className="sr-only">Search</span>
          <input placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="library-toolbar-rest">
          {section === 'construction' && (
            <div className="library-mode" role="group" aria-label="Construction records">
              <button
                type="button"
                className={constructionMode === 'components' ? 'active' : ''}
                onClick={() => {
                  setConstructionMode('components');
                  if (category === 'insulation') setCategory('all');
                  setFormOpen(false);
                }}
              >
                Components
              </button>
              <button
                type="button"
                className={constructionMode === 'layers' ? 'active' : ''}
                onClick={() => {
                  setConstructionMode('layers');
                  setComponentOpen(false);
                }}
              >
                Layers
              </button>
            </div>
          )}
          <div className="library-actions">
            {message && (
              <span className="library-status" role="status">
                {message}
              </span>
            )}
            {section === 'construction' && (
              <>
                {constructionMode === 'layers' ? (
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
              </>
            )}
          </div>
        </div>
      </div>

      <div className="library-body">
        <aside className="library-nav" aria-label="Categories">
          <ul className="library-cats">
            <li>
              <button
                type="button"
                className={navCategory === 'all' ? 'active' : ''}
                onClick={() => (section === 'construction' ? setCategory('all') : section === 'ducts' ? setDuctGroup('all') : setEquipmentCategory('all'))}
              >
                <span>All</span>
                <span className="tree-meta">{navCounts.all ?? 0}</span>
              </button>
            </li>
            {navItems.map(item => (
              <li key={item}>
                <button
                  type="button"
                  className={navCategory === item ? 'active' : ''}
                  onClick={() =>
                    section === 'construction'
                      ? setCategory(item as ConstructionCategory)
                      : section === 'ducts'
                        ? setDuctGroup(item as DuctGroup)
                        : setEquipmentCategory(item as EquipmentCategory)
                  }
                >
                  <span>
                    {section === 'construction'
                      ? constructionCategoryLabel[item as ConstructionCategory]
                      : section === 'ducts'
                        ? item
                        : CATEGORY_LABEL[item as EquipmentCategory]}
                  </span>
                  <span className="tree-meta">{navCounts[item] ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="library-main">
          {section === 'construction' && constructionMode === 'components' && componentOpen && (
            <form
              className="stack library-form"
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

          {section === 'construction' && constructionMode === 'layers' && formOpen && (
            <form
              className="stack library-form"
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
                <label className="field">
                  <span>Potential supplier</span>
                  <input value={draft.potentialSupplier} onChange={event => setDraft({ ...draft, potentialSupplier: event.target.value })} />
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

          {section === 'construction' && constructionMode === 'components' && (
            <div className="table-wrap library-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Category</th>
                    <th>Typical use</th>
                    <th>Layers</th>
                    <th>Source</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAssemblies.map(assembly => (
                    <Fragment key={assembly.id}>
                      <tr
                        className={selectedAssembly?.id === assembly.id ? 'is-selected library-pick' : 'library-pick'}
                        onClick={() => setSelectedAssemblyId(current => (current === assembly.id ? null : assembly.id))}
                      >
                        <td>
                          <strong>{assembly.name}</strong>
                          <div className="cell-sub">{assembly.origin === 'builtin' ? 'Built-in' : 'Added'}</div>
                        </td>
                        <td>{constructionCategoryLabel[assembly.category]}</td>
                        <td>{assembly.typicalUse || 'Use not stated'}</td>
                        <td>{assembly.layers.length}</td>
                        <td>{assembly.notes || assembly.orderLabel}</td>
                        <td>
                          {assembly.origin !== 'builtin' && (
                            <button
                              type="button"
                              className="btn danger"
                              onClick={event => {
                                event.stopPropagation();
                                onAssembliesChange(addedAssemblies.filter(item => item.id !== assembly.id));
                                if (selectedAssemblyId === assembly.id) setSelectedAssemblyId(null);
                                setMessage(`Removed ${assembly.name}. Rooms that already copied this stack keep their layers.`);
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                      {selectedAssembly?.id === assembly.id && (
                        <tr className="library-detail">
                          <td colSpan={6}>
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
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {visibleAssemblies.length === 0 && (
                    <tr>
                      <td colSpan={6}>No components match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {section === 'construction' && constructionMode === 'layers' && (
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
                    <th>Potential supplier</th>
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
                        <div className="cell-sub">
                          {item.origin === 'builtin' ? 'Built-in' : item.origin === 'import' ? 'Imported' : 'Added'}
                        </div>
                      </td>
                      <td>{item.potentialSupplier}</td>
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
                      <td colSpan={9}>No materials match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {section === 'packages' && (
            <div className="table-wrap library-table">
              <p className="muted library-note">
                Ready-made air systems: unit, terminals, branch ducts, loops, and sensors. Drag one from the Build catalogue onto the plan. Save your own from any system in its inspector.
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Systems</th>
                    <th>Contents</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {PACKAGE_GROUPS.map(group => {
                    const rows = packages.filter(item => item.group === group && `${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
                    if (rows.length === 0) return null;
                    return (
                      <Fragment key={group}>
                        <tr className="group-row">
                          <td colSpan={4}>{group}</td>
                        </tr>
                        {rows.map(item => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.name}</strong>
                              {item.user && (
                                <div className="cell-sub">
                                  Saved {item.savedAt ? new Date(item.savedAt).toLocaleDateString() : ''} ·{' '}
                                  <button type="button" className="link-button" onClick={() => deleteUserPackage(item.id)}>
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                            <td>{item.systems.map(system => `${system.name} (${SYSTEM_KINDS.find(kind => kind.id === system.kind)?.label ?? system.kind})`).join(', ')}</td>
                            <td>{packageSummary(item)}</td>
                            <td>{item.description}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {section === 'ducts' && (
            <div className="table-wrap library-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Supplier</th>
                    <th>Section</th>
                    <th>Sizes</th>
                    <th>Roughness</th>
                    <th>Pressure</th>
                    <th>Streams</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDucts.map(item => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <div className="cell-sub">{item.manufacturer} · {item.model}</div>
                        <div className="cell-sub">{item.material}</div>
                      </td>
                      <td>{item.supplier}</td>
                      <td>{item.shape === 'round' ? 'Round' : 'Rectangular'}</td>
                      <td>{sizeSummary(item)}</td>
                      <td>
                        {roughnessLabel(item)}
                        <div className="cell-sub">{item.roughnessNote}</div>
                      </td>
                      <td>{item.pressure}</td>
                      <td>
                        {streamLabels(item)}
                        {item.documentUrl && (
                          <div className="cell-sub">
                            <a href={item.documentUrl} target="_blank" rel="noreferrer">Source</a>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visibleDucts.length === 0 && (
                    <tr>
                      <td colSpan={7}>No ducts match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {(section === 'space' || section === 'system') && (
            <div className="table-wrap library-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Manufacturer</th>
                    <th>Model</th>
                    <th>Performance</th>
                    <th>Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {familyProducts.map(product => (
                    <tr key={product.id}>
                      <td>
                        <strong>{product.name}</strong>
                        {product.documentUrl && (
                          <div className="cell-sub">
                            <a href={product.documentUrl} target="_blank" rel="noreferrer">
                              Source
                            </a>
                          </div>
                        )}
                      </td>
                      <td>{CATEGORY_LABEL[product.category]}</td>
                      <td>{product.manufacturer}</td>
                      <td>{product.model}</td>
                      <td>{productSpec(product) || 'Not stated'}</td>
                      <td>{product.supplier}</td>
                    </tr>
                  ))}
                  {familyProducts.length === 0 && (
                    <tr>
                      <td colSpan={6}>No products match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
