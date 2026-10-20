import { useState } from 'react';
import { ArrowUpRight, FileText, Link2, NotebookPen, X } from 'lucide-react';
import { Modal } from '../../shared/ui/Primitives';
import type { Evidence } from '../projects/model/project';

export function EvidenceList({
  items,
  onRemove,
}: {
  items: Evidence[];
  onRemove?: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Evidence | null>(null);
  let safeUrl: string | null = null;
  try {
    const url = new URL(selected?.url ?? '');
    if (['https:', 'http:'].includes(url.protocol)) safeUrl = url.toString();
  } catch {
    /* Notes and sample documents have no external URL. */
  }
  return (
    <>
      <div className="evidence-list">
        {items.map((item) => {
          const Icon = item.kind === 'link' ? Link2 : item.kind === 'note' ? NotebookPen : FileText;
          return (
            <div className="evidence-row" key={item.id}>
              <span className={`evidence-icon ${item.kind}`}>
                <Icon size={20} />
              </span>
              <button className="evidence-title" onClick={() => setSelected(item)}>
                <strong>{item.title}</strong>
                <small>
                  {item.kind === 'document'
                    ? 'Sample document · Preview'
                    : item.kind === 'link'
                      ? 'External reference'
                      : 'Reflection note'}
                </small>
              </button>
              {onRemove ? (
                <button
                  className="icon-button"
                  aria-label={`Remove ${item.title}`}
                  onClick={() => onRemove(item.id)}
                >
                  <X size={16} />
                </button>
              ) : (
                <button
                  className="icon-button"
                  aria-label={`Preview ${item.title}`}
                  onClick={() => setSelected(item)}
                >
                  <ArrowUpRight size={17} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <div className="modal-body prose">
            <p className="eyebrow">
              {selected.kind === 'document'
                ? 'FICTIONAL DOCUMENT PREVIEW'
                : selected.kind === 'note'
                  ? 'REFLECTION NOTE'
                  : 'PROJECT REFERENCE'}
            </p>
            <p>{selected.detail}</p>
            {selected.kind === 'document' && (
              <>
                <h3>From observation to opportunity</h3>
                <p>
                  The research brings together observations, participant interviews, and a
                  reflective account of the decisions made during this milestone.
                </p>
                <blockquote>
                  “A space feels welcoming when you can choose how to be part of it.”
                </blockquote>
                <p className="muted">
                  This is sample content for the visual prototype. No actual file is uploaded or
                  stored.
                </p>
              </>
            )}
            {safeUrl && (
              <a className="button secondary" href={safeUrl} target="_blank" rel="noreferrer">
                Open reference
                <ArrowUpRight size={16} />
              </a>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
