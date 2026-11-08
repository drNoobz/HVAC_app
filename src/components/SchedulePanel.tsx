'use client';

import { useMemo } from 'react';
import { buildBom, buildSchedule, scheduleCsv, projectSummary } from '@/domain/schedule';
import { DISCLAIMER, type Project } from '@/domain/types';
import { downloadText, fileSlug } from '@/domain/download';

export function SchedulePanel({ project }: { project: Project }) {
  const lines = useMemo(() => buildSchedule(project), [project]);
  const bom = useMemo(() => buildBom(lines), [lines]);
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <div className="schedule print-root">
      <header className="schedule-head">
        <div>
          <p className="kicker">Preliminary</p>
          <h2>Equipment schedule and bill of materials</h2>
          <p className="muted">{DISCLAIMER}</p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="btn"
            onClick={() => downloadText(`${fileSlug(project.name)}-schedule.csv`, scheduleCsv(project, lines, bom), 'text/csv')}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              downloadText(
                `${fileSlug(project.name)}-summary.json`,
                JSON.stringify(projectSummary(project, lines, bom), null, 2),
                'application/json'
              )
            }
          >
            Export summary
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>
      <p className="summary-line">
        {lines.length} placed items · quantity {quantity} · {bom.length} BoM lines · display units {project.units === 'IP' ? 'ft, CFM, Btu/h' : 'm, L/s, kW'}
      </p>
      {lines.length === 0 ? (
        <p className="empty">No equipment is placed. Choose a product in the catalog and place it in the model.</p>
      ) : (
        <>
          <h3>Equipment schedule</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Manufacturer</th>
                  <th>Model</th>
                  <th>Qty</th>
                  <th>Supplier</th>
                  <th>Document</th>
                  <th>Airflow</th>
                  <th>Capacity</th>
                  <th>Dimensions</th>
                  <th>Room</th>
                  <th>System</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(line => (
                  <tr key={line.placementId}>
                    <td>{line.category}</td>
                    <td>{line.manufacturer}</td>
                    <td>
                      {line.model}
                      <span className="sub">{line.name}</span>
                    </td>
                    <td className="num">{line.quantity}</td>
                    <td>{line.supplier}</td>
                    <td>{line.documentUrl ? <a href={line.documentUrl}>{line.documentUrl}</a> : <span className="flag amber">None</span>}</td>
                    <td>{line.airflow}</td>
                    <td>{line.capacity}</td>
                    <td>{line.dimensions}</td>
                    <td>{line.room}</td>
                    <td>{line.system}</td>
                    <td>
                      <span className="flag amber">{line.reviewStatus}</span>
                      <ul className="review-list">
                        {line.review.slice(0, 3).map((note, index) => (
                          <li key={`${line.placementId}-${index}`}>{note}</li>
                        ))}
                      </ul>
                      {line.review.length > 3 && (
                        <details>
                          <summary>{line.review.length - 3} more</summary>
                          <ul className="review-list">
                            {line.review.slice(3).map((note, index) => (
                              <li key={`${line.placementId}-more-${index}`}>{note}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Preliminary bill of materials</h3>
          <p className="muted">Aggregated by manufacturer and model. Assignments stay visible so the count can be traced to rooms and systems.</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Manufacturer</th>
                  <th>Model</th>
                  <th>Total qty</th>
                  <th>Supplier</th>
                  <th>Document</th>
                  <th>Specifications</th>
                  <th>Dimensions</th>
                  <th>Assignments</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {bom.map(line => (
                  <tr key={line.catalogId}>
                    <td>{line.category}</td>
                    <td>{line.manufacturer}</td>
                    <td>
                      {line.model}
                      <span className="sub">{line.name}</span>
                    </td>
                    <td className="num">{line.quantity}</td>
                    <td>{line.supplier}</td>
                    <td>{line.documentUrl ?? <span className="flag amber">None</span>}</td>
                    <td>
                      {line.airflow}
                      <span className="sub">{line.capacity}</span>
                    </td>
                    <td>{line.dimensions}</td>
                    <td>{line.assignments}</td>
                    <td>
                      <span className="flag amber">{line.reviewStatus}</span>
                      <ul className="review-list">
                        {line.review.slice(0, 2).map((note, index) => (
                          <li key={`${line.catalogId}-${index}`}>{note}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
