import { type FormEvent } from 'react';
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
      milestones: lines('milestones').map((title) => ({ title, required: true })),
      deliverables: lines('deliverables').map((title) => ({ title, required: true })),
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
      <label>
        Milestones — one per line
        <textarea
          name="milestones"
          defaultValue={project.milestones.map((m) => m.title).join('\n')}
          required
          maxLength={3600}
          rows={5}
        />
      </label>
      <label>
        Deliverables — one per line
        <textarea
          name="deliverables"
          defaultValue={project.deliverables.map((m) => m.title).join('\n')}
          required
          maxLength={2400}
          rows={3}
        />
      </label>
      <p className="muted">
        Milestones and deliverables entered here are required. Submitted proposal versions keep
        their original content.
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
