'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function TopLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [, startTransition] = useTransition();

  // Reset when navigation finishes (pathname or searchParams changes)
  useEffect(() => {
    if (visible) {
      setProgress(100);
      const timer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  // Intercept click on internal links to start progress immediately
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement)?.closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      const isInternal =
        href &&
        (href.startsWith('/') || href.startsWith(window.location.origin)) &&
        !href.startsWith('#') &&
        !target.hasAttribute('download') &&
        target.getAttribute('target') !== '_blank';

      if (isInternal) {
        const url = new URL(target.href, window.location.href);
        // Only trigger if destination is different from current page
        if (url.pathname !== window.location.pathname || url.search !== window.location.search) {
          startTransition(() => {
            setVisible(true);
            setProgress(25);
            setTimeout(() => setProgress((p) => (p >= 25 && p < 80 ? 70 : p)), 100);
          });
        }
      }
    }

    window.addEventListener('click', handleClick, { capture: true });
    return () => window.removeEventListener('click', handleClick, { capture: true });
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        zIndex: 99999,
        pointerEvents: 'none',
        background: 'transparent',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--accent, #e53935)',
          boxShadow: '0 0 8px rgba(229, 57, 53, 0.6)',
          transition: progress === 100 ? 'width 150ms ease-out, opacity 200ms ease-out' : 'width 250ms ease-out',
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
