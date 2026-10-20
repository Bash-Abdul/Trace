import { Check, Mail } from 'lucide-react';
import { useDemo } from '../../../app/providers/DemoProvider';
import { Avatar, Badge } from '../../../shared/ui/Primitives';
import type { Project } from '../model/project';
export function ProjectTeam({ project }: { project: Project }) {
  const { perform } = useDemo();
  return (
    <div className="panel">
      <div className="panel-heading">
        <h2>The people behind the project</h2>
        <p>Roles belong to this project. One Author, one active main Reviewer.</p>
      </div>
      <div className="team-row">
        <Avatar />
        <div>
          <strong>Bashir Abdul</strong>
          <small>Permanent Author</small>
        </div>
        <Badge tone="green">Joined</Badge>
      </div>
      <div className="team-row">
        <Avatar name="Dr. Maya Patel" />
        <div>
          <strong>Dr. Maya Patel</strong>
          <small>Main Reviewer · {project.reviewerEmail}</small>
        </div>
        <Badge tone={project.reviewerJoined ? 'green' : 'amber'}>
          {project.reviewerJoined ? 'Joined' : 'Invited'}
        </Badge>
      </div>
      {!project.reviewerJoined && (
        <div className="soft-note invitation-demo">
          <Mail size={20} />
          <div>
            <strong>Try the invitation flow</strong>
            <p>
              No email has been sent. Simulate the invited Reviewer accepting to continue this demo.
            </p>
            <button
              className="button secondary small"
              onClick={() => perform(project.id, { type: 'join-reviewer' })}
            >
              <Check size={14} />
              Simulate invitation acceptance
            </button>
          </div>
        </div>
      )}
      <p className="team-footnote">
        Reviewer succession and dormant membership management are reserved for a later prototype.
      </p>
    </div>
  );
}
