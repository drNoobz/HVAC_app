import { NextResponse } from 'next/server';
import { parseValidateRequest } from '@/thermonode/contract';
import { validateModel } from '@/thermonode/localAdapter';
import { readJson } from '../../http';

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = parseValidateRequest(body.value);
  if (!parsed) {
    return NextResponse.json(
      { apiVersion: 'v1', error: 'Expected { apiVersion: "v1", model } with length unit m.' },
      { status: 400 }
    );
  }
  return NextResponse.json(validateModel(parsed.model));
}
