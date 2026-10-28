export type StructureItem = {
  key: string;
  id?: string;
  title: string;
  required: boolean;
  dueDate?: string | null;
  objectiveIds?: string[] | undefined;
  expectedEvidence?: { id?: string; key?: string; title: string; required: boolean }[] | undefined;
};
export function structurePayload(items: StructureItem[]) {
  return items.map(({ id, title, required, dueDate, objectiveIds, expectedEvidence }) => ({
    ...(id ? { id } : {}),
    title: title.trim(),
    required,
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(objectiveIds ? { objectiveIds } : {}),
    ...(expectedEvidence
      ? {
          expectedEvidence: expectedEvidence.map(({ id, title, required }) => ({
            ...(id ? { id } : {}),
            title,
            required,
          })),
        }
      : {}),
  }));
}
export function StructureEditor({
  label,
  items,
  onChange,
  max,
  disabled = false,
  allowStructure = true,
  objectives,
}: {
  label: 'Milestone' | 'Deliverable';
  items: StructureItem[];
  onChange: (items: StructureItem[]) => void;
  max: number;
  disabled?: boolean;
  allowStructure?: boolean;
  objectives?: { id: string; title: string }[];
}) {
  function move(index: number, offset: number) {
    const next = [...items];
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    onChange(next);
  }
  return (
    <fieldset disabled={disabled} className="structure-editor">
      <legend>{label}s</legend>
      {items.map((item, index) => (
        <div className="evidence-item" key={item.key}>
          <label>
            {label} {index + 1} title
            <input
              required
              maxLength={120}
              value={item.title}
              onChange={(event) =>
                onChange(
                  items.map((entry, position) =>
                    position === index ? { ...entry, title: event.target.value } : entry,
                  ),
                )
              }
            />
          </label>
          <label className="coverage-choice">
            <input
              type="checkbox"
              disabled={!allowStructure}
              checked={item.required}
              onChange={(event) =>
                onChange(
                  items.map((entry, position) =>
                    position === index ? { ...entry, required: event.target.checked } : entry,
                  ),
                )
              }
            />
            {label} {index + 1} required
          </label>
          {label === 'Milestone' && (
            <label>
              Milestone {index + 1} due date (optional)
              <input
                type="date"
                value={item.dueDate ?? ''}
                disabled={!allowStructure}
                onChange={(event) =>
                  onChange(
                    items.map((entry) =>
                      entry.key === item.key
                        ? { ...entry, dueDate: event.target.value || null }
                        : entry,
                    ),
                  )
                }
              />
            </label>
          )}
          {label === 'Milestone' && objectives && (
            <details>
              <summary>Objectives and expected evidence</summary>
              <p className="muted">
                Choose the objectives this milestone supports, then describe the evidence expected.
                Authors link their evidence to these when preparing a submission.
              </p>
              {objectives.length === 0 && <p>Save the brief first to link new objectives.</p>}
              {objectives.map((objective) => (
                <label className="coverage-choice" key={objective.id}>
                  <input
                    type="checkbox"
                    disabled={!allowStructure}
                    checked={item.objectiveIds?.includes(objective.id) ?? false}
                    onChange={(event) =>
                      onChange(
                        items.map((entry) =>
                          entry.key === item.key
                            ? {
                                ...entry,
                                objectiveIds: event.target.checked
                                  ? [...(entry.objectiveIds ?? []), objective.id]
                                  : (entry.objectiveIds ?? []).filter((id) => id !== objective.id),
                              }
                            : entry,
                        ),
                      )
                    }
                  />
                  Supports: {objective.title}
                </label>
              ))}
              {(item.expectedEvidence ?? []).map((requirement, rIndex) => (
                <div key={requirement.id ?? requirement.key} className="evidence-item">
                  <label>
                    Expected evidence {rIndex + 1}
                    <input
                      required
                      maxLength={120}
                      disabled={!allowStructure}
                      value={requirement.title}
                      onChange={(event) =>
                        onChange(
                          items.map((entry) =>
                            entry.key === item.key
                              ? {
                                  ...entry,
                                  expectedEvidence: entry.expectedEvidence?.map((r, i) =>
                                    i === rIndex ? { ...r, title: event.target.value } : r,
                                  ),
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="coverage-choice">
                    <input
                      type="checkbox"
                      disabled={!allowStructure}
                      checked={requirement.required}
                      onChange={(event) =>
                        onChange(
                          items.map((entry) =>
                            entry.key === item.key
                              ? {
                                  ...entry,
                                  expectedEvidence: entry.expectedEvidence?.map((r, i) =>
                                    i === rIndex ? { ...r, required: event.target.checked } : r,
                                  ),
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                    Required evidence
                  </label>
                  {allowStructure && (
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() =>
                        onChange(
                          items.map((entry) =>
                            entry.key === item.key
                              ? {
                                  ...entry,
                                  expectedEvidence: entry.expectedEvidence?.filter(
                                    (_, i) => i !== rIndex,
                                  ),
                                }
                              : entry,
                          ),
                        )
                      }
                    >
                      Remove expected evidence {rIndex + 1}
                    </button>
                  )}
                </div>
              ))}
              {allowStructure && (
                <button
                  type="button"
                  className="button secondary small"
                  disabled={(item.expectedEvidence?.length ?? 0) >= 30}
                  onClick={() =>
                    onChange(
                      items.map((entry) =>
                        entry.key === item.key
                          ? {
                              ...entry,
                              expectedEvidence: [
                                ...(entry.expectedEvidence ?? []),
                                { key: crypto.randomUUID(), title: '', required: true },
                              ],
                            }
                          : entry,
                      ),
                    )
                  }
                >
                  Add expected evidence
                </button>
              )}
            </details>
          )}
          {allowStructure && (
            <div className="inline-actions">
              <button
                type="button"
                className="button secondary small"
                disabled={index === 0}
                aria-label={`Move ${label.toLowerCase()} ${index + 1} up`}
                onClick={() => move(index, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="button secondary small"
                disabled={index === items.length - 1}
                aria-label={`Move ${label.toLowerCase()} ${index + 1} down`}
                onClick={() => move(index, 1)}
              >
                Down
              </button>
              <button
                type="button"
                className="button secondary small"
                disabled={items.length === 1}
                aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                onClick={() => onChange(items.filter((_, position) => position !== index))}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ))}
      {allowStructure && (
        <button
          type="button"
          className="button secondary small"
          disabled={items.length >= max}
          onClick={() =>
            onChange([...items, { key: crypto.randomUUID(), title: '', required: true }])
          }
        >
          Add {label.toLowerCase()}
        </button>
      )}
    </fieldset>
  );
}
