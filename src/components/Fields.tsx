'use client';

import { useEffect, useState } from 'react';
import { formatNumber } from '@/domain/units';

export function UnitField({
  label,
  unit,
  value,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(formatNumber(value));
  useEffect(() => setText(formatNumber(value)), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="unit-input">
        <input
          inputMode="decimal"
          value={text}
          onChange={event => setText(event.target.value)}
          onBlur={event => {
            const next = Number(event.currentTarget.value);
            if (Number.isFinite(next)) onCommit(next);
            else setText(formatNumber(value));
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
          }}
        />
        <em>{unit}</em>
      </span>
    </label>
  );
}

export function TextField({
  label,
  value,
  onCommit,
  multiline = false,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (current: string) => {
    if (current !== value) onCommit(current);
  };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={text} rows={4} onChange={event => setText(event.target.value)} onBlur={event => commit(event.currentTarget.value)} />
      ) : (
        <input
          value={text}
          onChange={event => setText(event.target.value)}
          onBlur={event => commit(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      )}
    </label>
  );
}
