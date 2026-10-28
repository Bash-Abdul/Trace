import { DeadlineLabel } from '../../deadlines/DeadlineLabel';
import { ArrowUpRight, Check, Circle, FilePenLine, MessageSquare, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../shared/ui/Primitives';
import type { ProjectDetail } from '../../workspace/workspace-api';
import { stateLabels } from '../../milestones/milestones-api';
const icons = {
  APPROVED: Check,
  NOT_STARTED: Circle,
  DRAFT: FilePenLine,
  AWAITING_REVIEW: Send,
  REVISION_REQUESTED: MessageSquare,
};
export function LiveMilestoneList({ project }: { project: ProjectDetail }) {
  return (
    <div className="milestone-list">
      {project.milestones.map((milestone, index) => {
        const state = project.progress?.milestones.find((m) => m.id === milestone.id)?.state;
        const Icon = state ? icons[state] : Circle;
        return (
          <Link
            className="milestone-row"
            key={milestone.id}
            to={`/projects/${project.id}/milestones/${milestone.id}`}
          >
            <span className={`milestone-state state-${state?.toLowerCase().replaceAll('_', '-')}`}>
              <Icon size={17} />
            </span>
            <div className="milestone-name">
              <small>
                MILESTONE {String(index + 1).padStart(2, '0')}
                {milestone.required ? '' : ' · OPTIONAL'}
              </small>
              <strong>{milestone.title}</strong>
            </div>
            <Badge
              tone={
                state === 'APPROVED'
                  ? 'green'
                  : state === 'REVISION_REQUESTED'
                    ? 'amber'
                    : state === 'AWAITING_REVIEW'
                      ? 'blue'
                      : 'neutral'
              }
            >
              {state ? stateLabels[state] : 'Status unavailable'}
            </Badge>
            <span className="milestone-due">
              <DeadlineLabel
                dueDate={milestone.dueDate}
                timezone={project.timezone}
                deadline={project.progress?.milestones.find((m) => m.id === milestone.id)?.deadline}
              />
            </span>
            <ArrowUpRight size={17} />
          </Link>
        );
      })}
    </div>
  );
}
