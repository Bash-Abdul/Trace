import { useState, type FormEvent } from 'react';
import { StructureEditor, structurePayload, type StructureItem } from './StructureEditor';
import type { ProjectDetail } from './workspace-api';
export function ProjectDraftEditor({
  project,
  busy,
  save,
  cancel,
}: {
  project: ProjectDetail;
  busy: boolean;
  save: (body: unknown) => Promise<void>;
  cancel: () => void;
}) {
  const [milestones, setMilestones] = useState<StructureItem[]>(() =>
    project.milestones.map((item) => ({ ...item, key: item.id })),
  );
  const [deliverables, setDeliverables] = useState<StructureItem[]>(() =>
    project.deliverables.map((item) => ({ ...item, key: item.id })),
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const lines = (name: string) =>
      String(data.get(name))
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    void save({
      version: project.version,
      title: data.get('title'),
      description: data.get('description'),
      objectives: lines('objectives'),
      milestones: structurePayload(milestones),
      deliverables: structurePayload(deliverables),
    });
  }
  return (
    <form className="panel form-panel" onSubmit={submit}>
      <h2>Shape the project brief</h2>
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
      <label>
        Objectives — one per line
        <textarea
          name="objectives"
          defaultValue={project.objectives.join('\n')}
          required
          maxLength={10000}
          rows={3}
        />
      </label>
      <StructureEditor
        label="Milestone"
        items={milestones}
        onChange={setMilestones}
        max={30}
        disabled={busy}
      />
      <StructureEditor
        label="Deliverable"
        items={deliverables}
        onChange={setDeliverables}
        max={20}
        disabled={busy}
      />
      <p className="muted">
        Reordering or renaming keeps existing milestone identities. Submitted proposal versions keep
        their original structure.
      </p>
      <div className="form-actions">
        <button disabled={busy} type="button" className="button secondary" onClick={cancel}>
          Cancel
        </button>
        <button disabled={busy} className="button primary">
          Save brief
        </button>
      </div>
    </form>
  );
}
