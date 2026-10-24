import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, Badge, MilestoneProgress } from '../../../shared/ui/Primitives';
import { statusLabels, type ProjectSummary } from '../../workspace/workspace-api';
import { progressMilestones, projectPresentation } from './live-project-presentation';

export function LiveProjectCard({ project }: { project: ProjectSummary }) {
  const { icon: Icon, color, label } = projectPresentation(project);
  const feedback = project.progress?.unresolved_feedback ?? 0;
  return (
    <article className="project-card">
      <div className="project-card-top">
        <span className={`project-icon ${color}`}>
          <Icon size={23} strokeWidth={1.5} />
        </span>
        <Badge tone={project.status === 'ACTIVE' ? 'green' : 'amber'}>
          {project.status === 'ACTIVE' ? 'In progress' : statusLabels[project.status]}
        </Badge>
        <Link
          to={`/projects/${project.id}`}
          className="icon-button card-arrow"
          aria-label={`Open ${project.title}`}
        >
          <ArrowUpRight size={19} />
        </Link>
      </div>
      <p className="eyebrow">{label}</p>
      <h3>
        <Link to={`/projects/${project.id}`}>{project.title}</Link>
      </h3>
      <p className="project-description">{project.description}</p>
      {project.progress ? (
        <MilestoneProgress milestones={progressMilestones(project)} />
      ) : (
        <p className="muted">Progress unavailable</p>
      )}
      <div className="project-card-footer">
        <span className="people-stack">
          {project.progress?.members.slice(0, 3).map((member) => (
            <Avatar key={member.user_id} name={member.email} small />
          ))}
        </span>
        <span>
          <CalendarDays size={14} />
          No due date
        </span>
      </div>
      {feedback > 0 && (
        <Link className="card-feedback" to={`/projects/${project.id}?tab=feedback`}>
          <span className="tiny-dot" />
          {feedback} unresolved milestone feedback {feedback === 1 ? 'thread' : 'threads'}{' '}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </article>
  );
}
