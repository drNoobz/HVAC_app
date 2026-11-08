let sequence = 0;

export function createId(prefix: string): string {
  sequence += 1;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${time}-${rand}-${sequence}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
