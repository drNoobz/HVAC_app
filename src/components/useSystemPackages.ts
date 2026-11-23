'use client';

import { useEffect, useState } from 'react';
import { allSystemPackages, SYSTEM_PACKAGES, type SystemPackage } from '@/domain/systemPackages';
import { onUserPackagesChange } from '@/domain/systemTemplates';

/** Built-in system templates plus the ones saved in this browser, kept current when templates are saved or deleted. */
export function useSystemPackages(): SystemPackage[] {
  const [list, setList] = useState<SystemPackage[]>(SYSTEM_PACKAGES);
  useEffect(() => {
    setList(allSystemPackages());
    return onUserPackagesChange(() => setList(allSystemPackages()));
  }, []);
  return list;
}
