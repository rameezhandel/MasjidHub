'use client';

import { useEffect, useRef, useState } from 'react';
import { progress } from '@/lib/progress';

/**
 * Slim indeterminate bar pinned to the top of the viewport whenever any API
 * request is in flight. Appearance is delayed slightly so fast responses
 * don't flash, and kept up briefly after the last request so back-to-back
 * calls read as one continuous load.
 */
export function GlobalProgress() {
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = progress.subscribe((active) => {
      if (active) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = null;
        showTimer.current ??= setTimeout(() => setVisible(true), 150);
      } else {
        if (showTimer.current) clearTimeout(showTimer.current);
        showTimer.current = null;
        hideTimer.current = setTimeout(() => setVisible(false), 250);
      }
    });
    return () => {
      unsubscribe();
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!visible) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/15"
    >
      <div className="progress-indeterminate h-full w-2/5 rounded-full bg-gold" />
    </div>
  );
}
