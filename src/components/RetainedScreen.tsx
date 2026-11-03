import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Keep tab state mounted, but remove inactive content from focus and accessibility trees. */
export function RetainedScreen({ active, children }: { active: boolean; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [surface] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    if (active) host.current?.appendChild(surface);
    else surface.remove();
    return () => surface.remove();
  }, [active, surface]);
  return <><div ref={host} style={{ display: active ? 'contents' : 'none' }} />{createPortal(children, surface)}</>;
}
