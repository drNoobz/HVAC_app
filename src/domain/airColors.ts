/**
 * Which colour of air a piece of equipment shows, shared by the Plan view and the 3D view. Equipment is one neutral
 * colour; only diffusers, grilles, louvers and hoods take the colour of the air they handle (`SERVICE_COLOR`).
 */
import { getProduct } from './catalog';
import { SERVICE_COLOR } from './ductCatalog';

/** Outside-air tags: the same two colours everywhere, in the air key too. */
export const OUTSIDE_IN_COLOR = '#2f7d32';
export const OUTSIDE_OUT_COLOR = '#7a4a2b';

/** A grille that passes room air through a door or wall, with no duct. Air crosses it along its local +y. */
export function isTransferGrille(catalogId: string): boolean {
  return catalogId.startsWith('grille-transfer');
}

/** Equipment that is itself the opening to outdoors (louvers, roof hoods, roof fans): which way air crosses. */
export function outdoorOpening(catalogId: string): 'oa' | 'ea' | null {
  const product = getProduct(catalogId);
  if (!product) return null;
  if (product.category === 'air-terminal') {
    if (product.id.startsWith('louver')) return product.id.endsWith('oa') ? 'oa' : 'ea';
    if (product.mount === 'roof') return product.id.includes('intake') ? 'oa' : 'ea';
    return null;
  }
  if ((product.category === 'exhaust-fan' || product.category === 'bathroom-exhaust') && product.mount === 'roof') return 'ea';
  return null;
}

/**
 * Equipment is drawn in one neutral colour. Only diffusers, grilles, louvers and hoods take a colour: the colour
 * of the air they handle, so they read with their ducts.
 */
export function terminalAirColor(catalogId: string): string | undefined {
  const product = getProduct(catalogId);
  if (product?.category !== 'air-terminal' || isTransferGrille(product.id)) return undefined;
  const id = product.id;
  if (id.startsWith('diff')) return SERVICE_COLOR.supply;
  if (id.startsWith('grille-ret')) return SERVICE_COLOR.return;
  if (id.endsWith('-oa') || id.includes('intake')) return SERVICE_COLOR.outdoor;
  return SERVICE_COLOR.exhaust;
}
