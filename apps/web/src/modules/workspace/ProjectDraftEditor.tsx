import { ScheduleFields } from '../deadlines/ScheduleFields';
import { useState, type FormEvent } from 'react';
import { StructureEditor, structurePayload, type StructureItem } from './StructureEditor';
import type { ProjectDetail } from './workspace-api';
export function ProjectDraftEditor({
  project,
  busy,
  save,
  cancel,
  changeMode,
  reason = '',
}: {
  project: ProjectDetail;
  busy: boolean;
  save: (body: unknown) => Promise<void>;
  cancel: () => void;
  changeMode?: 'minor' | 'major';
  reason?: string;
}) {
  const [milestones, setMilestones] = useState<StructureItem[]>(() =>
    project.milestones.map((item) => ({ ...item, key: item.id })),
  );
  const [deliverables, setDeliverables] = useState<StructureItem[]>(() =>
    project.deliverables.map((item) => ({ ...item, key: item.id })),
  );
  const [objectives, setObjectives] = useState(() =>
    project.objectives.map((title, index) => ({
      key: crypto.randomUUID(),
      id: project.objectiveIds?.[index] ?? null,
      title,
    })),
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void save({
      version: project.version,
      ...(changeMode ? { reason: data.get('reason') } : {}),
      ...(changeMode === 'minor'
        ? { meaningUnchanged: data.get('meaningUnchanged') === 'on' }
        : {}),
      ...(changeMode === 'minor'
        ? {}
        : { dueDate: data.get('dueDate') || null, timezone: data.get('timezone') || null }),
      title: data.get('title'),
      description: data.get('description'),
      objectives: objectives.map((o) => o.title),
      objectiveIds: objectives.map((o) => o.id),
      milestones: structurePayload(milestones),
      deliverables: structurePayload(deliverables),
    });
  }
  return (
    <form className="panel form-panel" onSubmit={submit}>
      <h2>
        {changeMode === 'minor'
          ? 'Correct the wording'
          : changeMode === 'major'
            ? 'Draft a project change'
            : 'Shape the project brief'}
      </h2>
      {changeMode && (
        <>
          <p>
            {changeMode === 'minor'
              ? 'Keep the meaning and requirements unchanged. Structural changes need Reviewer approval.'
              : 'The current plan stays in place until your main Reviewer approves this proposal.'}
          </p>
          <label>
            Reason for the change
            <textarea name="reason" required maxLength={2000} defaultValue={reason} rows={2} />
          </label>
        </>
      )}
      <label>
        Project title
        <input name="title" defaultValue={project.title} required maxLength={120} />
      </label>
      <label>
        About your project
        <textarea
          name="description"
          defaultValue={project.description}
          required
          maxLength={2000}
          rows={4}
        />
      </label>
      <fieldset disabled={busy} className="structure-editor">
        <legend>Objectives</legend>
        {objectives.map((objective, index) => (
          <div key={objective.key} className="evidence-item">
            <label>
              Objective {index + 1}
              <input
                required
                maxLength={500}
                value={objective.title}
                onChange={(event) =>
                  setObjectives((current) =>
                    current.map((o) =>
                      o.key === objective.key ? { ...o, title: event.target.value } : o,
                    ),
                  )
                }
              />
            </label>
            {changeMode !== 'minor' && (
              <div className="inline-actions">
                <button
                  type="button"
                  className="button secondary small"
                  disabled={index === 0}
                  onClick={() =>
                    setObjectives((current) => {
                      const next = [...current];
                      [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                      return next;
                    })
                  }
                >
                  Move objective {index + 1} up
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={objectives.length === 1}
                  onClick={() => {
                    setObjectives((current) => current.filter((o) => o.key !== objective.key));
                    setMilestones((current) =>
                      current.map((m) => ({
                        ...m,
                        objectiveIds: m.objectiveIds?.filter((id) => id !== objective.id),
                      })),
                    );
                  }}
                >
                  Remove objective {index + 1}
                </button>
              </div>
            )}
          </div>
        ))}
        {changeMode !== 'minor' && (
          <button
            type="button"
            className="button secondary small"
            disabled={objectives.length >= 20}
            onClick={() =>
              setObjectives((current) => [
                ...current,
                { key: crypto.randomUUID(), id: null, title: '' },
              ])
            }
          >
            Add objective
          </button>
        )}
      </fieldset>
      <ScheduleFields
        dueDate={project.dueDate}
        timezone={project.timezone}
        disabled={busy || changeMode === 'minor'}
      />
      <StructureEditor
        label="Milestone"
        objectives={objectives.flatMap((o) => (o.id ? [{ id: o.id, title: o.title }] : []))}
        items={milestones}
        onChange={setMilestones}
        max={30}
        disabled={busy}
        allowStructure={changeMode !== 'minor'}
      />
      <StructureEditor
        label="Deliverable"
        items={deliverables}
        onChange={setDeliverables}
        max={20}
        disabled={busy}
        allowStructure={changeMode !== 'minor'}
      />
      <p className="muted">
        Reordering or renaming keeps existing milestone identities. Submitted proposal versions keep
        their original structure.
      </p>
      {changeMode === 'minor' && (
        <label>
          <input type="checkbox" name="meaningUnchanged" required /> I confirm that meaning, scope
          and requirements are unchanged.
        </label>
      )}
      <div className="form-actions">
        <button disabled={busy} type="button" className="button secondary" onClick={cancel}>
          Cancel
        </button>
        <button disabled={busy} className="button primary">
          {changeMode === 'minor'
            ? 'Save minor edit'
            : changeMode === 'major'
              ? 'Save change draft'
              : 'Save brief'}
        </button>
      </div>
    </form>
  );
}
