'use client';

import { useMemo } from 'react';
import { buildBom, buildConstructionBom, buildConstructionSchedule, buildSchedule, scheduleCsv, projectSummary } from '@/domain/schedule';
import type { ConstructionAssembly, ConstructionMaterial } from '@/domain/constructionLibrary';
import { type Project } from '@/domain/types';
import { downloadText, fileSlug } from '@/domain/download';

export function SchedulePanel({
  project,
  assemblies,
  materials,
}: {
  project: Project;
  assemblies: ConstructionAssembly[];
  materials: ConstructionMaterial[];
}) {
  const lines = useMemo(() => buildSchedule(project), [project]);
  const bom = useMemo(() => buildBom(lines), [lines]);
  const construction = useMemo(() => buildConstructionSchedule(project, assemblies, materials), [project, assemblies, materials]);
  const constructionBom = useMemo(() => buildConstructionBom(construction, project.units), [construction, project.units]);
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <div className="schedule print-root">
      <header className="schedule-head">
        <div>
          <p className="kicker">Preliminary</p>
          <h2>Equipment schedule, construction, and bill of materials</h2>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="btn"
            onClick={() => downloadText(`${fileSlug(project.name)}-schedule.csv`, scheduleCsv(project, lines, bom, construction, constructionBom), 'text/csv')}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              downloadText(
                `${fileSlug(project.name)}-summary.json`,
                JSON.stringify(projectSummary(project, lines, bom, construction, constructionBom), null, 2),
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
        {lines.length} placed items · quantity {quantity} · {bom.length} equipment BoM lines · {construction.length} construction lines · display units {project.units === 'IP' ? 'ft, CFM, Btu/h' : 'm, L/s, kW'}
      </p>
      {lines.length === 0 ? (
        <p className="empty">No equipment is placed.</p>
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
                  <th>Space</th>
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
      {construction.length > 0 && (
        <>
          <h3>Preliminary construction</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Name</th>
                  <th>Space</th>
                  <th>Size</th>
                  <th>Thickness</th>
                  <th>Component</th>
                  <th>Layers</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {construction.map(line => (
                  <tr key={line.id}>
                    <td>{line.category}</td>
                    <td>{line.name}</td>
                    <td>{line.space}</td>
                    <td>{line.size}</td>
                    <td>{line.thickness}</td>
                    <td>{line.component}</td>
                    <td>{line.layers}</td>
                    <td>
                      <span className="flag amber">{line.reviewStatus}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Preliminary construction bill of materials</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Component</th>
                  <th>Quantity</th>
                  <th>Length</th>
                  <th>Layers</th>
                  <th>Assignments</th>
                </tr>
              </thead>
              <tbody>
                {constructionBom.map(line => (
                  <tr key={line.id}>
                    <td>{line.category}</td>
                    <td>{line.component}</td>
                    <td className="num">{line.quantity}</td>
                    <td>{line.size}</td>
                    <td>{line.layers}</td>
                    <td>{line.assignments}</td>
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
