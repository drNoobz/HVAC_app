'use client';

import { useState } from 'react';
import type { Project } from '@/domain/types';
import { ADAPTER_LIMITATIONS, type MaterialsResponseV1, type SimulationJobV1, type ValidateModelResponseV1 } from '@/thermonode/contract';
import { projectToBuildingModel } from '@/thermonode/localAdapter';

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

export function BoundaryPanel({ project }: { project: Project }) {
  const [output, setOutput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState('demo-job');
  const model = projectToBuildingModel(project);

  const run = async (request: string, action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      setOutput({ request, response: await action() });
    } catch (caught) {
      setOutput(null);
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="boundary">
      <div className="boundary-copy">
        <p className="kicker">Adapter · v1</p>
        <h2>Thermonode boundary</h2>
        <p>
          Projects, templates, the supplier catalog, equipment placement, and the bill of materials stay in this app. Building geometry and materials cross the adapter below.
        </p>
        <div className="split-cards">
          <article>
            <h3>This app</h3>
            <ul>
              <li>Project identity, units, and restaurant templates</li>
              <li>Equipment catalog and placed items</li>
              <li>Systems, schedule, and preliminary BoM</li>
            </ul>
          </article>
          <article>
            <h3>Adapter contract</h3>
            <ul>
              <li>List material reference data</li>
              <li>Validate a building model</li>
              <li>Write GeometryDocument v1</li>
              <li>Accept a later async simulation job</li>
            </ul>
          </article>
        </div>
        <h3>What is not connected</h3>
        <ul className="plain-list">
          {ADAPTER_LIMITATIONS.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="muted">
          Schema references in the ThermoNode repo: <code>apps/thermonode-lab/lib/geometry/types.ts</code> and <code>thermocore/src/library_materials_data.inc</code>. ThermoNode Lab’s existing HTTP routes cover AI, an Excel bridge, auth, and docs. They are not this contract.
        </p>
        <h3>Calls</h3>
        <div className="button-row">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => run('GET /api/thermonode/v1/materials', () => fetch('/api/thermonode/v1/materials').then(response => response.json() as Promise<MaterialsResponseV1>))}
          >
            Retrieve materials
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => run('POST /api/thermonode/v1/models/validate', () => postJson('/api/thermonode/v1/models/validate', { apiVersion: 'v1', model }))}
          >
            Validate model
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              run('POST /api/thermonode/v1/simulations', () =>
                postJson('/api/thermonode/v1/simulations', { apiVersion: 'v1', requestedAnalysis: 'steady-thermal', model })
              )
            }
          >
            Request simulation
          </button>
        </div>
        <label className="field job-field">
          <span>Job id</span>
          <span className="inline-field">
            <input value={jobId} onChange={event => setJobId(event.target.value)} />
            <button
              type="button"
              className="btn"
              disabled={busy || !jobId.trim()}
              onClick={() =>
                run(`GET /api/thermonode/v1/simulations/${jobId}`, () =>
                  fetch(`/api/thermonode/v1/simulations/${encodeURIComponent(jobId)}`).then(response => response.json() as Promise<SimulationJobV1>)
                )
              }
            >
              Check status
            </button>
          </span>
        </label>
        {error && <p className="flag amber">{error}</p>}
      </div>
      <div className="boundary-output">
        <p className="kicker">Response</p>
        {isValidation(output) ? <IssueList response={output.response} /> : null}
        <pre className="json-block">{output ? JSON.stringify(output, null, 2) : 'Run a call to see the versioned response. upstream will read not-connected.'}</pre>
      </div>
    </div>
  );
}

function isValidation(value: unknown): value is { response: ValidateModelResponseV1 } {
  if (!value || typeof value !== 'object') return false;
  const response = (value as { response?: { issues?: unknown; solverInvoked?: unknown } }).response;
  return Array.isArray(response?.issues) && response?.solverInvoked === false;
}

function IssueList({ response }: { response: ValidateModelResponseV1 }) {
  const errors = response.issues.filter(issue => issue.severity === 'error').length;
  const warnings = response.issues.filter(issue => issue.severity === 'warning').length;
  const infos = response.issues.filter(issue => issue.severity === 'info').length;
  return (
    <div className="issue-summary">
      <p>
        {response.valid ? 'No geometry errors.' : 'Geometry errors need attention.'} Solver invoked: false. {errors} errors · {warnings} warnings · {infos} notices.
      </p>
      <ul className="issue-list">
        {response.issues
          .filter(issue => issue.severity !== 'info')
          .map(issue => (
            <li key={`${issue.code}-${issue.message}`} className={issue.severity}>
              {issue.message}
            </li>
          ))}
      </ul>
      {infos > 0 && <p className="muted">Material notices are in the JSON. Unassigned surfaces are expected where the library has no envelope material.</p>}
    </div>
  );
}
