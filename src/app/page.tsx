import { Suspense } from 'react';
import App from '@/components/App';

export default function Page() {
  return (
    <Suspense fallback={<div className="boot">Loading workspace…</div>}>
      <App />
    </Suspense>
  );
}
