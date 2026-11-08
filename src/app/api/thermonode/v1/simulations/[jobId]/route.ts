import { NextResponse } from 'next/server';
import { getSimulation } from '@/thermonode/localAdapter';

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return NextResponse.json(getSimulation(jobId));
}
