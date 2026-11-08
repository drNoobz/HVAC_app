/**
 * Geometry document compatible with ThermoNode Lab `GeometryDocument` version 1
 * (`apps/thermonode-lab/lib/geometry/types.ts`). Lengths are meters.
 * This module does not import ThermoNode. The HVAC app writes the same shape.
 */

export interface GeoVec3 {
  x: number;
  y: number;
  z: number;
}

export interface GeoSketch {
  id: string;
  name: string;
  origin: GeoVec3;
}

export interface GeoRect {
  id: string;
  sketchId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeoBody {
  id: string;
  name: string;
  material?: string;
  placement: GeoVec3;
  shape: {
    kind: 'extrudedRectangle';
    sketchId: string;
    rectangleId: string;
    distance: number;
  };
}

export interface GeometryDocument {
  version: 1;
  sketches: GeoSketch[];
  rectangles: GeoRect[];
  lines: [];
  circles: [];
  constraints: [];
  bodies: GeoBody[];
  faceBoundaries: [];
}
