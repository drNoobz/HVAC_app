import { NextResponse } from 'next/server';
import { listMaterials } from '@/thermonode/localAdapter';

export async function GET() {
  return NextResponse.json(listMaterials());
}
