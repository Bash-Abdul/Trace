import { ArrowUpRight, CalendarDays, Flower2, Leaf, Code2, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, Badge, formatDate, MilestoneProgress } from '../../../shared/ui/Primitives';
import type { Project } from '../model/project';

const icons = { sage: Flower2, peach: Leaf, blue: Code2, lilac: Compass };
export function ProjectCard({ project }: { project: Project }) {
  const Icon = icons[project.color];
  const feedback = project.feedback.filter((f) => f.status === 'open').length;
  const state =
    project.state === 'active'
      ? 'In progress'
      : project.state === 'proposal-review'
        ? 'Proposal review'
        : project.state === 'final-review'
          ? 'Final review'
          : project.state === 'completed'
            ? 'Completed'
            : 'Getting started';
  return (
    <article className="project-card">
      <div className="project-card-top">
        <span className={`project-icon ${project.color}`}>
          <Icon size={23} strokeWidth={1.5} />
        </span>
        <Badge
          tone={project.state === 'active' || project.state === 'completed' ? 'green' : 'amber'}
        >
          {state}
        </Badge>
        <Link
          to={`/projects/${project.id}`}
          className="icon-button card-arrow"
          aria-label={`Open ${project.title}`}
        >
          <ArrowUpRight size={19} />
        </Link>
      </div>
      <p className="eyebrow">{project.category}</p>
      <h3>
        <Link to={`/projects/${project.id}`}>{project.title}</Link>
      </h3>
      <p className="project-description">{project.description}</p>
      <MilestoneProgress milestones={project.milestones} />
      <div className="project-card-footer">
        <span className="people-stack">
          <Avatar small />
          <Avatar name="Dr. Maya Patel" small />
        </span>
        <span>
          <CalendarDays size={14} />
          {formatDate(project.due)}
        </span>
      </div>
      {feedback > 0 && (
        <Link className="card-feedback" to={`/projects/${project.id}?tab=feedback`}>
          <span className="tiny-dot" />
          {feedback} feedback thread needs your attention <ArrowUpRight size={14} />
        </Link>
      )}
    </article>
  );
}
