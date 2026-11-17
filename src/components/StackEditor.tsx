'use client';

import { useRef, useState, type DragEvent } from 'react';
import {
  CONSTRUCTION_CATEGORIES,
  constructionCategoryLabel,
  findConstruction,
  formatResistance,
  formatThickness,
  layerResistance,
  stackResistance,
  type ConstructionMaterial,
} from '@/domain/constructionLibrary';
import type { StackLayer, UnitSystem } from '@/domain/types';

export function StackEditor({
  layers,
  materials,
  series,
  units,
  readOnly = false,
  onChange,
}: {
  layers: StackLayer[];
  materials: ConstructionMaterial[];
  series: boolean;
  units: UnitSystem;
  readOnly?: boolean;
  onChange?: (layers: StackLayer[]) => void;
}) {
  const dragFrom = useRef<number | null>(null);
  const dragToken = useRef(0);
  const consumedToken = useRef(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const total = stackResistance(layers, materials, series);
  const update = (next: StackLayer[]) => onChange?.(next);
  const moveTo = (from: number, to: number) => {
    if (from === to || to < 0 || to >= layers.length) return;
    const next = layers.slice();
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    update(next);
  };
  const clearDrag = () => {
    dragFrom.current = null;
    setDragIndex(null);
    setOverIndex(null);
  };
  const onDragStart = (index: number, event: DragEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button') && !target.closest('.drag-handle')) {
      event.preventDefault();
      return;
    }
    dragToken.current += 1;
    dragFrom.current = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  };
  const onDragOver = (index: number, event: DragEvent<HTMLElement>) => {
    const types = Array.from(event.dataTransfer.types);
    if (dragFrom.current == null && !types.includes('text/plain')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOverIndex(current => (current === index ? current : index));
  };
  const onDrop = (index: number, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (consumedToken.current === dragToken.current) return;
    consumedToken.current = dragToken.current;
    const raw = event.dataTransfer.getData('text/plain');
    const from = dragFrom.current ?? (raw === '' ? null : Number(raw));
    clearDrag();
    if (from != null && Number.isInteger(from)) moveTo(from, index);
  };

  return (
    <div className="stack">
      <ol className="stack-list">
        {layers.map((layer, index) => {
          const material = findConstruction(materials, layer.materialId);
          const resistance = layerResistance(layer, materials);
          const dragging = dragIndex === index;
          const dropTarget = overIndex === index && dragIndex !== index;
          return (
            <li
              key={`${layer.materialId}-${index}`}
              className={`stack-layer${dragging ? ' is-dragging' : ''}${dropTarget ? ' is-over' : ''}`}
              data-layer-index={index}
              onDragOver={event => onDragOver(index, event)}
              onDrop={event => onDrop(index, event)}
            >
              <header
                className={readOnly ? undefined : 'can-drag'}
                draggable={!readOnly}
                onDragStart={event => onDragStart(index, event)}
                onDragEnd={clearDrag}
                onDragOver={event => onDragOver(index, event)}
                onDrop={event => onDrop(index, event)}
              >
                <strong>
                  {!readOnly && (
                    <span
                      className="drag-handle"
                      draggable
                      role="button"
                      aria-label={`Drag ${layer.place || 'layer'} to reorder`}
                      onDragStart={event => {
                        event.stopPropagation();
                        onDragStart(index, event);
                      }}
                      onDragEnd={clearDrag}
                      onDragOver={event => onDragOver(index, event)}
                      onDrop={event => onDrop(index, event)}
                    >
                      ⋮⋮
                    </span>
                  )}
                  {index + 1}. {layer.place || 'Layer'}
                </strong>
                {!readOnly && (
                  <button type="button" className="btn danger" onClick={() => update(layers.filter((_, layerIndex) => layerIndex !== index))}>
                    Remove
                  </button>
                )}
              </header>
              {readOnly ? (
                <p>{material?.name ?? layer.materialId}</p>
              ) : (
                <label className="field">
                  <span>Material</span>
                  <select
                    value={layer.materialId}
                    onChange={event => update(layers.map((item, layerIndex) => (layerIndex === index ? { ...item, materialId: event.target.value } : item)))}
                  >
                    {!material && <option value={layer.materialId}>{layer.materialId}</option>}
                    {CONSTRUCTION_CATEGORIES.map(category => {
                      const items = materials.filter(item => item.category === category);
                      if (items.length === 0) return null;
                      return (
                        <optgroup key={category} label={constructionCategoryLabel[category]}>
                          {items.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </label>
              )}
              <p className="cell-sub">
                {formatThickness(resistance.thicknessMm, units)} · {formatResistance(resistance.rIp, units)}
              </p>
            </li>
          );
        })}
      </ol>
      {layers.length === 0 && <p className="muted">No layers yet.</p>}
      {series && total != null && (
        <p>
          Layer sum {formatResistance(total, units)} · {units === 'IP' ? `${(1 / total).toFixed(3)} Btu/(h·ft²·°F)` : `${((1 / total) * 5.678263337).toFixed(3)} W/(m²·K)`}
        </p>
      )}
      {!readOnly && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            const material = materials.find(item => item.category === 'insulation') ?? materials[0];
            if (!material) return;
            update([...layers, { materialId: material.id, thicknessMm: null, place: 'Added layer' }]);
          }}
        >
          Add layer
        </button>
      )}
    </div>
  );
}
