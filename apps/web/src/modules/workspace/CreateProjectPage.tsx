import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProjectApi } from './use-project-api';
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
          title: data.get('title'),
          description: data.get('description'),
          objectives: String(data.get('objectives'))
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          projectType,
          creatorRole,
          templateKey,
          approvalRoute: data.get('approvalRoute'),
        },
      });
      navigate(`/workspace/projects/${project.id}`);
    } catch (e) {
      setError(projectMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/workspace">
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
            <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
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
          <button className="button primary" disabled={busy || !templates.length}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </form>
        <aside className="panel template-preview">
          <p className="eyebrow">YOUR STARTING STRUCTURE</p>
          <h2>{templates.find((t) => t.key === templateKey)?.name ?? 'Loading templates…'}</h2>
          <ol>
            {templates
              .find((t) => t.key === templateKey)
              ?.milestones.map((title, i) => (
                <li key={title}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {title}
                </li>
              ))}
          </ol>
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
