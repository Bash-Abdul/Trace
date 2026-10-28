import { ScheduleFields } from '../deadlines/ScheduleFields';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProjectApi } from './use-project-api';
import { StructureEditor, structurePayload, type StructureItem } from './StructureEditor';
import { detailSchema, templatesSchema, projectMessage } from './workspace-api';

export function CreateProjectPage() {
  const api = useProjectApi();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<{ key: string; name: string; milestones: string[] }[]>(
    [],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [projectType, setProjectType] = useState('INDIVIDUAL');
  const [creatorRole, setCreatorRole] = useState('LEAD_AUTHOR');
  const [templateKey, setTemplateKey] = useState('design');
  const [attempt, setAttempt] = useState(0);
  const [editedMilestones, setMilestones] = useState<StructureItem[] | null>(null);
  const [deliverables, setDeliverables] = useState<StructureItem[]>([
    { key: 'final', title: 'Final outcome & reflection', required: true },
  ]);
  const milestones =
    editedMilestones ??
    (templates.find((t) => t.key === templateKey)?.milestones ?? []).map((title, index) => ({
      key: `${templateKey}-${index}`,
      title,
      required: true,
    }));
  useEffect(() => {
    const controller = new AbortController();
    api('/templates', templatesSchema, { signal: controller.signal })
      .then((data) => {
        setTemplates(data.templates);
        setError('');
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(e));
      });
    return () => controller.abort();
  }, [api, attempt]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const project = await api('', detailSchema, {
        method: 'POST',
        body: {
          dueDate: data.get('dueDate') || null,
          timezone: data.get('timezone') || null,
          title: data.get('title'),
          description: data.get('description'),
          objectives: String(data.get('objectives'))
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          projectType,
          creatorRole,
          templateKey,
          milestones: structurePayload(milestones),
          deliverables: structurePayload(deliverables),
          approvalRoute: data.get('approvalRoute'),
        },
      });
      navigate(`/projects/${project.id}`);
    } catch (e) {
      setError(projectMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/projects">
        ← Back to your projects
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A NEW CHAPTER</p>
          <h1>Give your idea a place to grow.</h1>
          <p>Choose who’s working on it and how it will be approved.</p>
        </div>
      </div>
      <div className="creation-layout">
        <form className="panel form-panel" onSubmit={(e) => void submit(e)}>
          {error && (
            <p role="alert">
              {error}{' '}
              {!templates.length && (
                <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                  Retry
                </button>
              )}
            </p>
          )}
          <fieldset disabled={busy}>
            <legend>Who is working on this project?</legend>
            {(['INDIVIDUAL', 'GROUP'] as const).map((type) => (
              <label className="radio-card" key={type}>
                <input
                  type="radio"
                  name="projectType"
                  value={type}
                  checked={projectType === type}
                  onChange={() => setProjectType(type)}
                />
                <span>
                  <strong>{type === 'GROUP' ? 'Group' : 'Individual'}</strong>
                  <small>
                    {type === 'GROUP'
                      ? 'Several authors, one lead, and a Reviewer.'
                      : 'One author and a Reviewer.'}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          <label>
            Your role
            <select value={creatorRole} onChange={(e) => setCreatorRole(e.target.value)}>
              <option value="LEAD_AUTHOR">
                {projectType === 'GROUP' ? 'Lead Author' : 'Author'}
              </option>
              <option value="MAIN_REVIEWER">Reviewer — invite the initial Author</option>
            </select>
          </label>
          <label>
            Starting template
            <select
              value={templateKey}
              disabled={busy}
              onChange={(e) => {
                setTemplateKey(e.target.value);
                setMilestones(
                  e.target.value === 'custom'
                    ? [{ key: crypto.randomUUID(), title: '', required: true }]
                    : null,
                );
                setDeliverables([
                  {
                    key: crypto.randomUUID(),
                    title: e.target.value === 'custom' ? '' : 'Final outcome & reflection',
                    required: true,
                  },
                ]);
              }}
            >
              <option value="custom">Custom structure — start from scratch</option>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Templates are starting points. Edit your copy below; switching templates resets the
            milestone and deliverable fields.
          </p>
          <ScheduleFields
            timezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
            disabled={busy}
          />
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
          <label>
            Project title
            <input name="title" required maxLength={120} />
          </label>
          <label>
            About your project
            <textarea name="description" required maxLength={2000} rows={4} />
          </label>
          <label>
            Objectives
            <textarea
              name="objectives"
              required
              maxLength={10000}
              rows={3}
              aria-describedby="objectives-help"
            />
          </label>
          <small id="objectives-help">
            One objective per line, up to 20. What should this project achieve?
          </small>
          <label>
            Approval route
            <select name="approvalRoute" defaultValue="IN_PLATFORM_PROPOSAL">
              <option value="IN_PLATFORM_PROPOSAL">Proposal reviewed in Trace</option>
              <option value="EXTERNALLY_APPROVED">Already approved elsewhere</option>
            </select>
          </label>
          <p className="muted">
            Project type and approval route are fixed after creation. You can edit the brief before
            review.
          </p>
          <button className="button primary" disabled={busy || !milestones.length}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </form>
        <aside className="panel template-preview">
          <p className="eyebrow">YOUR STARTING STRUCTURE</p>
          <h2>
            {templateKey === 'custom'
              ? 'Custom structure'
              : (templates.find((t) => t.key === templateKey)?.name ?? 'Loading templates…')}
          </h2>
          <ol>
            {milestones.map((item, index) => (
              <li key={item.key}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {item.title || 'Untitled milestone'}
                {item.required ? '' : ' (optional)'}
              </li>
            ))}
          </ol>
          <p>
            Milestones are the stages where you submit evidence for review. Deliverables describe
            the final outputs. The proposal approves this plan; it is separate from milestone
            submissions.
          </p>
          <div className="soft-note">
            Invite people after creation.{' '}
            {creatorRole === 'MAIN_REVIEWER'
              ? 'The initial Author will shape and submit the work.'
              : projectType === 'GROUP'
                ? 'Your authors share drafts; you submit the team’s work.'
                : 'You submit your work for your Reviewer’s feedback.'}
          </div>
        </aside>
      </div>
    </>
  );
}
