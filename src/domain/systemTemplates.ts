import type { SystemPackage } from './systemPackages';

const KEY = 'hvac-system-templates-v1';
const EVENT = 'hvac-system-templates';

/** System templates saved in this browser. */
export function loadUserPackages(): SystemPackage[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SystemPackage =>
        !!item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.systems) && Array.isArray(item.members) && Array.isArray(item.ducts),
    ).map(item => ({ ...item, nodes: item.nodes ?? [], group: 'My templates', user: true }));
  } catch {
    return [];
  }
}

function write(list: SystemPackage[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function saveUserPackage(pack: SystemPackage): void {
  write([...loadUserPackages().filter(item => item.id !== pack.id), pack]);
}

export function deleteUserPackage(id: string): void {
  write(loadUserPackages().filter(item => item.id !== id));
}

/** Call back when templates are saved or deleted, here or in another tab. Returns the unsubscribe. */
export function onUserPackagesChange(listener: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', storage);
  };
}
