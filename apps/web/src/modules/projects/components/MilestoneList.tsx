import { ArrowUpRight, Check, Circle, FilePenLine, MessageSquare, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, formatDate } from '../../../shared/ui/Primitives';
import { statusLabels, type Project } from '../model/project';
const icons = {
  approved: Check,
  'not-started': Circle,
  draft: FilePenLine,
  'awaiting-review': Send,
  'revision-requested': MessageSquare,
};
export function MilestoneList({ project }: { project: Project }) {
  return (
    <div className="milestone-list">
      {project.milestones.map((milestone, index) => {
        const Icon = icons[milestone.status];
        return (
          <Link
            className="milestone-row"
            key={milestone.id}
            to={`/projects/${project.id}/milestones/${milestone.id}`}
          >
            <span className={`milestone-state state-${milestone.status}`}>
              <Icon size={17} />
            </span>
            <div className="milestone-name">
              <small>MILESTONE {String(index + 1).padStart(2, '0')}</small>
              <strong>{milestone.title}</strong>
            </div>
            <Badge
              tone={
                milestone.status === 'approved'
                  ? 'green'
                  : milestone.status === 'revision-requested'
                    ? 'amber'
                    : milestone.status === 'awaiting-review'
                      ? 'blue'
                      : 'neutral'
              }
            >
              {statusLabels[milestone.status]}
            </Badge>
            <span className="milestone-due">{formatDate(milestone.due)}</span>
            <ArrowUpRight size={17} />
          </Link>
        );
      })}
    </div>
  );
}
