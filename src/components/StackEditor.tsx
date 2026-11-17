'use client';

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
  orderLabel,
  series,
  units,
  readOnly = false,
  onChange,
}: {
  layers: StackLayer[];
  materials: ConstructionMaterial[];
  orderLabel: string;
  series: boolean;
  units: UnitSystem;
  readOnly?: boolean;
  onChange?: (layers: StackLayer[]) => void;
}) {
  const total = stackResistance(layers, materials, series);
  const update = (next: StackLayer[]) => onChange?.(next);
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= layers.length) return;
    const next = layers.slice();
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    update(next);
  };

  return (
    <div className="stack">
      <p className="muted">{orderLabel}. {series ? 'Layers in contact. The total is the sum of layer R-values, without air films or framing.' : 'These layers are not one continuous path, so their R-values are not added.'}</p>
      <ol className="stack-list">
        {layers.map((layer, index) => {
          const material = findConstruction(materials, layer.materialId);
          const resistance = layerResistance(layer, materials);
          return (
            <li key={`${layer.materialId}-${index}`} className="stack-layer">
              <header>
                <strong>
                  {index + 1}. {layer.place || 'Layer'}
                </strong>
                {!readOnly && (
                  <span className="button-row">
                    <button type="button" className="btn" disabled={index === 0} onClick={() => move(index, -1)}>
                      Up
                    </button>
                    <button type="button" className="btn" disabled={index === layers.length - 1} onClick={() => move(index, 1)}>
                      Down
                    </button>
                    <button type="button" className="btn danger" onClick={() => update(layers.filter((_, layerIndex) => layerIndex !== index))}>
                      Remove
                    </button>
                  </span>
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
