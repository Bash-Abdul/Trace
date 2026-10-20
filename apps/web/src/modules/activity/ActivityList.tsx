import { Link } from 'react-router-dom';
import { Avatar, EmptyState, formatDate } from '../../shared/ui/Primitives';
import { useDemo } from '../../app/providers/DemoProvider';
import type { Project } from '../projects/model/project';
export function ActivityList({ projects }: { projects: Project[] }) {
  const rows = projects
    .flatMap((p) => p.activity.map((a) => ({ ...a, project: p })))
    .sort((a, b) => b.date.localeCompare(a.date));
  return rows.length ? (
    <div className="timeline">
      {rows.map((row) => (
        <div className="timeline-row" key={`${row.project.id}-${row.id}`}>
          <Avatar name={row.actor.includes('Maya') ? row.actor : 'Bashir Abdul'} small />
          <div>
            <p>
              <strong>{row.actor}</strong> {row.action}
            </p>
            <Link to={`/projects/${row.project.id}`}>{row.project.title}</Link>
            <span className="timeline-detail">{row.detail}</span>
          </div>
          <time>{formatDate(row.date)}</time>
        </div>
      ))}
    </div>
  ) : (
    <EmptyState
      title="Your story starts here"
      description="Project decisions and submissions will appear in this timeline."
    />
  );
}
export function ActivityPage() {
  const { projects } = useDemo();
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
        <ActivityList projects={projects} />
      </div>
    </>
  );
}
