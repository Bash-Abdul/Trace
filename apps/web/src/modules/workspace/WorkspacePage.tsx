import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowUpRight } from 'lucide-react';
import { z } from 'zod';
import { useProjectApi } from './use-project-api';
import {
  summarySchema,
  type ProjectSummary,
  roleLabels,
  statusLabels,
  projectMessage,
} from './workspace-api';
const listSchema = z.object({ projects: z.array(summarySchema) });
export function WorkspacePage() {
  const api = useProjectApi();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api('', listSchema, { signal: controller.signal })
      .then((data) => {
        setProjects(data.projects);
        setError('');
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(e));
      });
    return () => controller.abort();
  }, [api, attempt]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORK, TAKING SHAPE</p>
          <h1>A place for your next chapter.</h1>
          <p>Your projects and the people helping them grow.</p>
        </div>
        <Link className="button primary" to="/workspace/new">
          <Plus size={18} />
          New project
        </Link>
      </div>
      {error && (
        <div role="alert" className="soft-note">
          {error}{' '}
          <button className="button secondary small" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {!projects && !error && <p role="status">Loading your projects…</p>}
      {projects?.length === 0 && (
        <div className="panel live-empty">
          <h2>Your first project starts here.</h2>
          <p>
            Create an individual project or bring a group together. Invite your Reviewer when you’re
            ready.
          </p>
          <Link className="button primary" to="/workspace/new">
            Create your first project
          </Link>
        </div>
      )}
      <div className="live-project-grid">
        {projects?.map((p) => (
          <Link className="panel live-project-card" key={p.id} to={`/workspace/projects/${p.id}`}>
            <span className="eyebrow">
              {p.project_type === 'GROUP' ? 'GROUP PROJECT' : 'INDIVIDUAL PROJECT'}
            </span>
            <h2>{p.title}</h2>
            <p>{p.description}</p>
            <footer>
              <span>
                {statusLabels[p.status]} ·{' '}
                {p.project_type === 'INDIVIDUAL' && p.role === 'LEAD_AUTHOR'
                  ? 'Author'
                  : roleLabels[p.role]}
              </span>
              <ArrowUpRight size={19} />
            </footer>
          </Link>
        ))}
      </div>
      {projects && projects.length >= 100 && (
        <p>Showing your 100 most recently updated projects.</p>
      )}
    </>
  );
}
