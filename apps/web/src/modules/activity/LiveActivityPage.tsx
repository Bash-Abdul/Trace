import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspaceView } from '../../app/providers/WorkspaceViewProvider';
import { Avatar, EmptyState, formatDate } from '../../shared/ui/Primitives';
import { useProjectApi } from '../workspace/use-project-api';
import { detailSchema, projectMessage, type ProjectDetail } from '../workspace/workspace-api';
import { ProjectListState } from '../projects/components/ProjectListState';

export function LiveActivityFeed({ compact = false }: { compact?: boolean }) {
  const { projects, error, retry } = useWorkspaceView();
  const [selected, setSelected] = useState('');
  const projectId = projects?.find((p) => p.id === selected)?.id ?? projects?.[0]?.id;
  if (!projects || error) return <ProjectListState error={error} retry={retry} />;
  if (!projectId)
    return (
      <EmptyState
        title="Your story starts here"
        description="Project decisions and submissions will appear in this timeline."
      />
    );
  return (
    <>
      <label>
        Activity for project
        <select value={projectId} onChange={(event) => setSelected(event.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <ProjectActivity key={projectId} projectId={projectId} compact={compact} />
    </>
  );
}
function ProjectActivity({ projectId, compact }: { projectId: string; compact: boolean }) {
  const api = useProjectApi();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(`/${projectId}`, detailSchema, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setProject(value);
          setError('');
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(err));
      });
    return () => controller.abort();
  }, [api, projectId, attempt]);
  if (error || !project)
    return <ProjectListState error={error} retry={() => setAttempt((n) => n + 1)} />;
  const events = [...project.events].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
  const rows = compact ? events.slice(0, 3) : events;
  return (
    <>
      {!compact && events.length >= 100 && (
        <p className="soft-note">
          Showing the latest 100 project events. Earlier history remains in the process portfolio.
        </p>
      )}
      {!rows.length ? (
        <p>No project activity yet.</p>
      ) : (
        <div className={compact ? 'activity-card' : 'timeline'}>
          {rows.map((event) => (
            <Link
              className={compact ? 'activity-row' : 'timeline-row'}
              to={`/projects/${projectId}?tab=activity`}
              key={event.id}
            >
              <Avatar name={event.actor} small />
              <div>
                <p>
                  <strong>{event.actor}</strong> {event.action.toLowerCase().replaceAll('_', ' ')}
                </p>
                <span className="timeline-detail">{project.title}</span>
              </div>
              <time dateTime={event.created_at} title={new Date(event.created_at).toLocaleString()}>
                {formatDate(event.created_at)}
              </time>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
export function LiveActivityPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE THREAD THROUGH YOUR WORK</p>
          <h1>Every step leaves a trace.</h1>
          <p>A shared record of submissions, conversations, and decisions.</p>
        </div>
      </div>
      <div className="panel">
        <LiveActivityFeed />
      </div>
    </>
  );
}
