import { LOAD_CATEGORY_COLOR, type LoadCategory } from '@/domain/loadCatalog';
import { ink } from '@/domain/theme';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Plan symbols for internal loads. Drawn in a 24×24 box. */
export function LoadSymbol({ category, hair = false }: { category: LoadCategory; hair?: boolean }) {
  const pen = hair ? { ...stroke, strokeWidth: 1.6, vectorEffect: 'non-scaling-stroke' as const } : stroke;
  if (category === 'people') {
    return (
      <g>
        <circle {...pen} cx="12" cy="5.6" r="2.2" />
        <path {...pen} d="M12 8 V13.2 M8 11.2 H16 M12 13.2 L8.4 19.4 M12 13.2 L15.6 19.4" />
      </g>
    );
  }
  if (category === 'cooking') {
    return (
      <g>
        <rect {...pen} x="4.5" y="4.5" width="15" height="15" rx="1.4" />
        <circle {...pen} cx="9" cy="9" r="1.5" />
        <circle {...pen} cx="15" cy="9" r="1.5" />
        <circle {...pen} cx="9" cy="15" r="1.5" />
        <circle {...pen} cx="15" cy="15" r="1.5" />
      </g>
    );
  }
  if (category === 'warewashing') {
    return (
      <g>
        <rect {...pen} x="4.5" y="4.5" width="15" height="15" rx="1.4" />
        <path {...pen} d="M7 11 Q8.6 8.4 10.2 11 T13.4 11 T16.6 11" />
        <path {...pen} d="M7 15.4 Q8.6 12.8 10.2 15.4 T13.4 15.4 T16.6 15.4" />
      </g>
    );
  }
  if (category === 'refrigeration') {
    return (
      <g>
        <path {...pen} d="M12 4.2 V19.8 M5.2 8 L18.8 16 M18.8 8 L5.2 16" />
        <path {...pen} d="M12 7.2 L10.2 5.2 M12 7.2 L13.8 5.2 M12 16.8 L10.2 18.8 M12 16.8 L13.8 18.8 M7.6 9.4 L5.4 8.2 M7.6 9.4 L6.6 11.6 M16.4 14.6 L18.6 15.8 M16.4 14.6 L17.4 12.4 M16.4 9.4 L18.6 8.2 M16.4 9.4 L17.4 11.6 M7.6 14.6 L5.4 15.8 M7.6 14.6 L6.6 12.4" />
      </g>
    );
  }
  if (category === 'lighting') {
    return (
      <g>
        <circle {...pen} cx="12" cy="12" r="6.6" />
        <path {...pen} d="M7.4 7.4 L16.6 16.6 M16.6 7.4 L7.4 16.6" />
      </g>
    );
  }
  return (
    <g>
      <circle {...pen} cx="12" cy="12" r="6.6" />
      <path {...pen} d="M10 8.2 V15.8 M14 8.2 V15.8" />
    </g>
  );
}

export function LoadIcon({ category }: { category: LoadCategory }) {
  return (
    <svg className="load-icon" viewBox="0 0 24 24" aria-hidden="true" style={{ color: ink(LOAD_CATEGORY_COLOR[category]) }}>
      <LoadSymbol category={category} />
    </svg>
  );
}
