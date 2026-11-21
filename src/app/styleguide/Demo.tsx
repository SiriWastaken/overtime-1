'use client';

import { toast } from '@/lib/fx';

export function FxDemo() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => toast('Robot locked in')}>
        Toast
      </button>
      <button type="button" className="ghost">
        Secondary
      </button>
      <button type="button" disabled>
        Disabled
      </button>
    </div>
  );
}
