'use client';

import { pointsList } from '@/domain/controls';
import type { Project } from '@/domain/types';

/** Controls points for a system, as on a controls submittal. */
export function PointsTable({ project, systemId }: { project: Project; systemId: string }) {
  const rows = pointsList(project, systemId);
  if (rows.length === 0) return null;
  return (
    <section className="prop-block points-list">
      <p className="prop-section">Controls points · {rows.length}</p>
      <table>
        <thead>
          <tr>
            <th>Tag</th>
            <th>I/O</th>
            <th>Device</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.tag}-${index}`} title={row.location}>
              <td>{row.tag}</td>
              <td>{row.io}</td>
              <td>
                {row.device}
                <span className="muted points-where">{row.location}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
