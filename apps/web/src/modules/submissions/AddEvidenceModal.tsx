import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../../shared/ui/Primitives';
import type { Evidence } from '../projects/model/project';
export function AddEvidenceModal({
  onAdd,
  onClose,
}: {
  onAdd: (item: Evidence) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Evidence['kind']>('note');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !detail.trim()) return;
    if (kind === 'link') {
      try {
        if (!['https:', 'http:'].includes(new URL(url).protocol)) throw new Error();
      } catch {
        setError('Use a full http or https URL.');
        return;
      }
    }
    onAdd({
      id: crypto.randomUUID(),
      kind,
      title: title.trim(),
      detail: detail.trim(),
      ...(kind === 'link' ? { url } : {}),
    });
    onClose();
  }
  return (
    <Modal title="Add a piece of your process" onClose={onClose}>
      <form className="modal-body form-panel" onSubmit={submit}>
        <label>
          Evidence type
          <select value={kind} onChange={(e) => setKind(e.target.value as Evidence['kind'])}>
            <option value="note">Reflection note</option>
            <option value="link">External reference</option>
            <option value="document">Sample document</option>
          </select>
        </label>
        <label>
          Title
          <input
            required
            autoFocus
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What does this evidence show?"
          />
        </label>
        <label>
          {kind === 'note' ? 'Your reflection' : 'Description'}
          <textarea
            required
            maxLength={4000}
            rows={4}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Connect this evidence to the work you’re doing…"
          />
        </label>
        {kind === 'link' && (
          <label>
            Reference URL
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
        )}
        {kind === 'document' && (
          <p className="soft-note">
            This adds a fictional document for the demo. No file is uploaded.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            <Plus size={16} />
            Add evidence
          </button>
        </div>
      </form>
    </Modal>
  );
}
