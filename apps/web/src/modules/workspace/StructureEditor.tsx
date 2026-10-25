export type StructureItem = { key: string; id?: string; title: string; required: boolean };
export function structurePayload(items: StructureItem[]) {
  return items.map(({ id, title, required }) => ({
    ...(id ? { id } : {}),
    title: title.trim(),
    required,
  }));
}
export function StructureEditor({
  label,
  items,
  onChange,
  max,
  disabled = false,
  allowStructure = true,
}: {
  label: 'Milestone' | 'Deliverable';
  items: StructureItem[];
  onChange: (items: StructureItem[]) => void;
  max: number;
  disabled?: boolean;
  allowStructure?: boolean;
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
          <label>
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
