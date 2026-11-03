import { useState } from 'react';

/** Independent visual preferences. Speech settings and learning state are untouched. */
export function ConversationText({ label, text, live = 'off' }: { label: 'Last said' | 'Last heard'; text: string; live?: 'off' | 'polite' }) {
  const key = label === 'Last said' ? 'tiesua-hide-said' : 'tiesua-hide-heard';
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  const action = `${hidden ? 'Show' : 'Hide'} ${label.toLowerCase()}`;
  return <div className="conversation-panel-text">
    <div className="conversation-text-heading"><h2>{label}:</h2>
      <button type="button" className="conversation-text-visibility" aria-label={action} title={action} aria-pressed={hidden} onClick={() => {
        setHidden(!hidden); try { localStorage.setItem(key, hidden ? '0' : '1'); } catch { /* optional storage */ }
      }}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>{hidden && <path d="M3 3l18 18"/>}</svg></button>
    </div>
    <div aria-live={live} aria-atomic="true"><p className={hidden ? 'sr-only' : undefined}>{text}</p></div>
  </div>;
}
