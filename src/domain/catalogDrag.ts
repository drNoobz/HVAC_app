export type CatalogDrag =
  | { kind: 'equipment'; id: string }
  | { kind: 'load'; id: string }
  | { kind: 'duct'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; opening: 'door' | 'window' };

export function catalogToken(drag: CatalogDrag): string {
  return drag.kind === 'opening' ? `opening:${drag.opening}` : `${drag.kind}:${drag.id}`;
}

export function parseCatalogDrag(token: string): CatalogDrag | null {
  const split = token.indexOf(':');
  if (split < 0) return token ? { kind: 'equipment', id: token } : null;
  const kind = token.slice(0, split);
  const id = token.slice(split + 1);
  if (!id) return null;
  if (kind === 'equipment' || kind === 'load' || kind === 'duct' || kind === 'wall') return { kind, id };
  if (kind === 'opening' && (id === 'door' || id === 'window')) return { kind: 'opening', opening: id };
  return null;
}
