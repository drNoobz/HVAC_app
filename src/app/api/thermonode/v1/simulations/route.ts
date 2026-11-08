import { NextResponse } from 'next/server';
import { parseSimulationRequest } from '@/thermonode/contract';
import { startSimulation } from '@/thermonode/localAdapter';
import { readJson } from '../http';

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = parseSimulationRequest(body.value);
  if (!parsed) {
    return NextResponse.json(
      {
        apiVersion: 'v1',
        error: 'Expected { apiVersion: "v1", requestedAnalysis: "steady-thermal", model }.',
      },
      { status: 400 }
    );
  }
  return NextResponse.json(startSimulation());
}
