'use client';

import { useEffect, useRef, useState } from 'react';
import { CLIMATE_METHOD_NOTES, importWeatherFile, siteMissing, siteOf } from '@/domain/climate';
import type { ConstructionAssembly, ConstructionMaterial } from '@/domain/constructionLibrary';
import { designLoads, hourLabel } from '@/domain/envelope';
import type { Project, SiteClimate, SiteNumberKey } from '@/domain/types';
import { formatNumber, formatPower } from '@/domain/units';
import { TextField } from './Fields';

const MONTHS = [
  { id: 1, label: 'January' },
  { id: 2, label: 'February' },
  { id: 3, label: 'March' },
  { id: 4, label: 'April' },
  { id: 5, label: 'May' },
  { id: 6, label: 'June' },
  { id: 7, label: 'July' },
  { id: 8, label: 'August' },
  { id: 9, label: 'September' },
  { id: 10, label: 'October' },
  { id: 11, label: 'November' },
  { id: 12, label: 'December' },
];

function tempUnit(units: Project['units']): string {
  return units === 'IP' ? '°F' : '°C';
}

function toDisplayTemp(c: number, units: Project['units']): number {
  return units === 'IP' ? (c * 9) / 5 + 32 : c;
}

function fromDisplayTemp(value: number, units: Project['units']): number {
  return units === 'IP' ? ((value - 32) * 5) / 9 : value;
}

function patchSite(project: Project, patch: Partial<SiteClimate>, keys: SiteNumberKey[] = []): Project {
  const site = siteOf(project);
  const sources = { ...site.sources };
  for (const key of keys) sources[key] = 'manual';
  return { ...project, site: { ...site, ...patch, sources } };
}

function NullableNumberField({
  label,
  unit,
  value,
  digits = 2,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number | null;
  digits?: number;
  onCommit: (value: number | null) => void;
}) {
  const shown = value == null ? '' : formatNumber(value, digits);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="unit-input">
        <input
          inputMode="decimal"
          value={text}
          onChange={event => setText(event.target.value)}
          onBlur={() => {
            const raw = text.trim();
            if (raw === '') {
              onCommit(null);
              return;
            }
            const next = Number(raw);
            if (Number.isFinite(next)) onCommit(next);
            else setText(shown);
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
          }}
        />
        {unit ? <em>{unit}</em> : null}
      </span>
    </label>
  );
}

function TempField({
  label,
  valueC,
  units,
  onCommitC,
}: {
  label: string;
  valueC: number | null;
  units: Project['units'];
  onCommitC: (valueC: number | null) => void;
}) {
  return (
    <NullableNumberField
      label={label}
      unit={tempUnit(units)}
      value={valueC == null ? null : toDisplayTemp(valueC, units)}
      onCommit={value => onCommitC(value == null ? null : fromDisplayTemp(value, units))}
    />
  );
}

export function SiteClimateFields({
  project,
  materials,
  assemblies,
  onChange,
}: {
  project: Project;
  materials: ConstructionMaterial[];
  assemblies: ConstructionAssembly[];
  onChange: (project: Project) => void;
}) {
  const site = siteOf(project);
  const missing = siteMissing(site);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importNote, setImportNote] = useState('');
  const report = designLoads(project, assemblies, materials);
  const units = project.units;

  const setNumber = (key: SiteNumberKey, value: number | null) => {
    onChange(patchSite(project, { [key]: value }, [key]));
  };

  return (
    <div className="stack props">
      <header className="prop-head">
        <p className="prop-kicker">Loads · Climate</p>
        <h2>{site.station || 'Site climate'}</h2>
        <p className="muted">Exterior design day for envelope, solar, and infiltration. Internal gains stay on the space catalogue.</p>
      </header>

      <section className="prop-block">
        <p className="prop-section">Weather file</p>
        <TextField
          label="Station"
          value={site.station}
          onCommit={station => onChange(patchSite(project, { station }))}
        />
        {site.fileName ? <p className="muted">Source file: {site.fileName}</p> : null}
        <div className="button-row">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import .epw / .ddy / .stat
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".epw,.ddy,.stat,text/plain"
            hidden
            onChange={async event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              const text = await file.text();
              const current = siteOf(project);
              const result = importWeatherFile(file.name, text, current);
              const sources = { ...current.sources };
              for (const key of result.filled) sources[key] = 'file';
              onChange({
                ...project,
                location: typeof result.patch.station === 'string' && result.patch.station ? result.patch.station : project.location,
                site: { ...current, ...result.patch, sources },
              });
              setImportNote(result.message);
            }}
          />
        </div>
        {importNote ? <p className="muted">{importNote}</p> : null}
        {missing.length > 0 ? <p className="warn-line">Still needed: {missing.join(', ')}.</p> : null}
      </section>

      <section className="prop-block">
        <p className="prop-section">Location</p>
        <div className="field-grid">
          <NullableNumberField label="Latitude" unit="°" value={site.latitudeDeg} onCommit={value => setNumber('latitudeDeg', value)} />
          <NullableNumberField label="Longitude" unit="°" value={site.longitudeDeg} onCommit={value => setNumber('longitudeDeg', value)} />
          <NullableNumberField label="Time zone" unit="h GMT" value={site.timeZoneH} digits={1} onCommit={value => setNumber('timeZoneH', value)} />
          <NullableNumberField label="Elevation" unit="m" value={site.elevationM} digits={0} onCommit={value => setNumber('elevationM', value)} />
        </div>
      </section>

      <section className="prop-block">
        <p className="prop-section">Design day</p>
        <div className="field-grid">
          <TempField label="Heating dry bulb (99.6%)" valueC={site.heatingDbC} units={units} onCommitC={value => setNumber('heatingDbC', value)} />
          <TempField label="Cooling dry bulb (0.4%)" valueC={site.coolingDbC} units={units} onCommitC={value => setNumber('coolingDbC', value)} />
          <TempField label="Coincident wet bulb" valueC={site.coolingWbC} units={units} onCommitC={value => setNumber('coolingWbC', value)} />
          <NullableNumberField label="Daily range" unit="K" value={site.coolingRangeK} onCommit={value => setNumber('coolingRangeK', value)} />
          <label className="field">
            <span>Cooling month</span>
            <select
              value={site.coolingMonth}
              onChange={event => onChange(patchSite(project, { coolingMonth: Number(event.target.value) }))}
            >
              {MONTHS.map(month => (
                <option key={month.id} value={month.id}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <NullableNumberField label="Wind speed" unit="m/s" value={site.windMs} onCommit={value => setNumber('windMs', value)} />
          <NullableNumberField label="Wind direction" unit="° from N" value={site.windDirDeg} digits={0} onCommit={value => setNumber('windDirDeg', value)} />
          <TempField label="Ground temperature" valueC={site.groundC} units={units} onCommitC={value => setNumber('groundC', value)} />
          <NullableNumberField label="Infiltration default" unit="ACH" value={site.infiltrationAch} digits={2} onCommit={value => setNumber('infiltrationAch', value)} />
        </div>
      </section>

      <section className="prop-block">
        <p className="prop-section">Solar</p>
        <div className="field-grid">
          <NullableNumberField label="taub (beam)" unit="" value={site.taub} digits={3} onCommit={value => setNumber('taub', value)} />
          <NullableNumberField label="taud (diffuse)" unit="" value={site.taud} digits={3} onCommit={value => setNumber('taud', value)} />
          <label className="field">
            <span>Optical-depth edition</span>
            <select
              value={site.tauEdition}
              onChange={event => onChange(patchSite(project, { tauEdition: event.target.value === '2009' ? '2009' : '2017' }))}
            >
              <option value="2009">2009</option>
              <option value="2017">2017</option>
            </select>
          </label>
          <NullableNumberField
            label="Ground reflectance"
            unit=""
            value={site.groundReflectance}
            digits={2}
            onCommit={value => {
              if (value == null) return;
              onChange(patchSite(project, { groundReflectance: Math.min(1, Math.max(0, value)) }));
            }}
          />
          <label className="field">
            <span>Opaque surface color</span>
            <select
              value={site.surfaceColor}
              onChange={event => onChange(patchSite(project, { surfaceColor: event.target.value === 'light' ? 'light' : 'dark' }))}
            >
              <option value="dark">Dark (α/ho 0.052)</option>
              <option value="light">Light (α/ho 0.026)</option>
            </select>
          </label>
        </div>
        <p className="muted">Sky long-wave is a fixed 3.9 K roof correction in sol-air, not a typed sky temperature.</p>
      </section>

      <section className="prop-block">
        <p className="prop-section">Indoor targets</p>
        <div className="field-grid">
          <TempField
            label="Indoor cooling"
            valueC={site.indoorCoolC}
            units={units}
            onCommitC={value => {
              if (value == null) return;
              onChange(patchSite(project, { indoorCoolC: value }));
            }}
          />
          <NullableNumberField
            label="Indoor cooling RH"
            unit="%"
            value={site.indoorCoolRh}
            digits={0}
            onCommit={value => {
              if (value == null) return;
              onChange(patchSite(project, { indoorCoolRh: value }));
            }}
          />
          <TempField
            label="Indoor heating"
            valueC={site.indoorHeatC}
            units={units}
            onCommitC={value => {
              if (value == null) return;
              onChange(patchSite(project, { indoorHeatC: value }));
            }}
          />
        </div>
      </section>

      <section className="prop-block">
        <p className="prop-section">Design loads</p>
        {report.gaps.length > 0 ? (
          <ul className="prop-links">
            {report.gaps.map(gap => (
              <li key={gap}>
                <span className="muted">{gap}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="stat-row">
          <span>
            Peak cool {report.block ? `${formatPower(report.block.sensibleW, units)} S @ ${hourLabel(report.block.hour)}` : '—'}
            {report.block ? ` · ${formatPower(report.block.latentW, units)} L` : ''}
          </span>
          <span>Heat {report.heatingW != null ? formatPower(report.heatingW, units) : '—'}</span>
        </div>
      </section>

      <section className="prop-block">
        <p className="prop-section">Method</p>
        <ul className="prop-links">
          {CLIMATE_METHOD_NOTES.map(note => (
            <li key={note}>
              <span className="muted">{note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
