import { ArrowUpRight, FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../shared/ui/Primitives';
import { roleLabels, statusLabels, type ProjectSummary } from '../../workspace/workspace-api';
export function LiveProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <article className="project-card">
      <div className="project-card-top">
        <span className="project-icon sage">
          <FolderKanban size={23} />
        </span>
        <Badge tone={project.status === 'ACTIVE' ? 'green' : 'amber'}>
          {statusLabels[project.status]}
        </Badge>
        <Link
          to={`/projects/${project.id}`}
          className="icon-button card-arrow"
          aria-label={`Open ${project.title}`}
        >
          <ArrowUpRight size={19} />
        </Link>
      </div>
      <p className="eyebrow">
        {project.project_type === 'GROUP' ? 'Group project' : 'Individual project'}
      </p>
      <h3>
        <Link to={`/projects/${project.id}`}>{project.title}</Link>
      </h3>
      <p className="project-description">{project.description}</p>
      <div className="project-card-footer">
        <span>
          {project.project_type === 'INDIVIDUAL' && project.role === 'LEAD_AUTHOR'
            ? 'Author'
            : roleLabels[project.role]}
        </span>
      </div>
    </article>
  );
}
