import { NextResponse } from 'next/server';

export async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, response: NextResponse.json({ apiVersion: 'v1', error: 'Request body is not JSON.' }, { status: 400 }) };
  }
}
