import { useState, type FormEvent } from 'react';
import type { Evidence } from './milestones-api';

type Item = {
  key: string;
  id?: string;
  title: string;
  kind: 'TEXT' | 'LINK';
  content: string;
  objectiveIds: string[];
  expectationIds: string[];
};
export function EvidenceEditor({
  evidence,
  objectives = [],
  expectations = [],
  busy,
  save,
  onDirty,
}: {
  evidence: Evidence[];
  objectives?: { id: string; title: string }[];
  expectations?: { id: string; title: string; required: boolean }[];
  busy: boolean;
  save: (items: Omit<Item, 'key'>[]) => Promise<void>;
  onDirty: () => void;
}) {
  const [items, setItems] = useState<Item[]>(() =>
    evidence.map((item) => ({
      id: item.id,
      key: item.id,
      title: item.title,
      kind: item.kind,
      content: item.content,
      objectiveIds: item.objectiveIds ?? [],
      expectationIds: item.expectationIds ?? [],
    })),
  );
  function change(key: string, values: Partial<Item>) {
    onDirty();
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...values } : item)),
    );
  }
  function move(index: number, offset: number) {
    onDirty();
    setItems((current) => {
      const reordered = [...current];
      const item = reordered.splice(index, 1)[0];
      if (item) reordered.splice(index + offset, 0, item);
      return reordered;
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void save(
      items.map(({ id, title, kind, content, objectiveIds, expectationIds }) => ({
        ...(id ? { id } : {}),
        title,
        kind,
        content,
        objectiveIds,
        expectationIds,
      })),
    );
  }
  return (
    <form className="panel form-panel" onSubmit={submit}>
      <h2>Evidence draft</h2>
      <p>Save text and links here. Submitted versions keep their original content.</p>
      <fieldset disabled={busy} className="evidence-fields">
        {items.map((item, index) => (
          <fieldset key={item.key} className="evidence-item">
            <legend>Evidence {index + 1}</legend>
            <label>
              Evidence title
              <input
                required
                maxLength={120}
                value={item.title}
                onChange={(event) => change(item.key, { title: event.target.value })}
              />
            </label>
            <label htmlFor={`evidence-type-${item.key}`}>Evidence type</label>
            <select
              id={`evidence-type-${item.key}`}
              value={item.kind}
              onChange={(event) =>
                change(item.key, { kind: event.target.value === 'LINK' ? 'LINK' : 'TEXT' })
              }
            >
              <option value="TEXT">Text</option>
              <option value="LINK">Link</option>
            </select>
            <label htmlFor={`evidence-content-${item.key}`}>
              {item.kind === 'LINK' ? 'Evidence URL' : 'Evidence text'}
            </label>
            {item.kind === 'LINK' ? (
              <input
                id={`evidence-content-${item.key}`}
                type="url"
                required
                value={item.content}
                onChange={(event) => change(item.key, { content: event.target.value })}
              />
            ) : (
              <textarea
                id={`evidence-content-${item.key}`}
                required
                maxLength={10000}
                rows={5}
                value={item.content}
                onChange={(event) => change(item.key, { content: event.target.value })}
              />
            )}
            {(objectives.length > 0 || expectations.length > 0) && (
              <fieldset>
                <legend>What does this evidence support?</legend>
                <p className="muted">
                  Select the objectives and expectations addressed by this item. These links
                  describe coverage; the Reviewer approves the milestone submission.
                </p>
                {objectives.map((o) => (
                  <label className="coverage-choice" key={o.id}>
                    <input
                      type="checkbox"
                      checked={item.objectiveIds.includes(o.id)}
                      onChange={(event) =>
                        change(item.key, {
                          objectiveIds: event.target.checked
                            ? [...item.objectiveIds, o.id]
                            : item.objectiveIds.filter((id) => id !== o.id),
                        })
                      }
                    />
                    Objective: {o.title}
                  </label>
                ))}
                {expectations.map((r) => (
                  <label className="coverage-choice" key={r.id}>
                    <input
                      type="checkbox"
                      checked={item.expectationIds.includes(r.id)}
                      onChange={(event) =>
                        change(item.key, {
                          expectationIds: event.target.checked
                            ? [...item.expectationIds, r.id]
                            : item.expectationIds.filter((id) => id !== r.id),
                        })
                      }
                    />
                    Expected: {r.title} · {r.required ? 'Required' : 'Optional'}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary small"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                Move up
              </button>
              <button
                type="button"
                className="button secondary small"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                Move down
              </button>
              <button
                type="button"
                className="button secondary small"
                onClick={() => {
                  onDirty();
                  setItems((current) => current.filter((entry) => entry.key !== item.key));
                }}
              >
                Remove evidence {index + 1}
              </button>
            </div>
          </fieldset>
        ))}
        <div className="form-actions">
          <button
            type="button"
            disabled={items.length >= 30}
            className="button secondary"
            onClick={() => {
              onDirty();
              setItems((current) => [
                ...current,
                {
                  key: crypto.randomUUID(),
                  title: '',
                  kind: 'TEXT',
                  content: '',
                  objectiveIds: [],
                  expectationIds: [],
                },
              ]);
            }}
          >
            Add evidence
          </button>
          <button className="button primary">Save evidence draft</button>
        </div>
      </fieldset>
    </form>
  );
}
