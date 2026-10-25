import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';
import './help-hint.css';

export function HelpHint({ label, children }: { label: string; children: string }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  function show() {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(270, window.innerWidth - 32);
    setPosition({
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      top: rect.bottom > window.innerHeight - 190 ? Math.max(16, rect.top - 190) : rect.bottom,
    });
  }
  return (
    <span className="help-hint" onMouseEnter={show} onMouseLeave={() => setPosition(null)}>
      <button
        ref={button}
        type="button"
        className="help-hint-button"
        aria-label={`Help: ${label}`}
        aria-describedby={position ? id : undefined}
        aria-expanded={!!position}
        onFocus={show}
        onBlur={() => setPosition(null)}
        onClick={show}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setPosition(null);
          }
        }}
      >
        <CircleHelp size={15} aria-hidden="true" />
      </button>
      {position &&
        createPortal(
          <span id={id} role="tooltip" className="help-hint-content" style={position}>
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}
