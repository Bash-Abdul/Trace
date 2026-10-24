import { CircleCheck, FileCheck2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { CheckItem, MilestoneProgress, SectionHeading } from '../../../shared/ui/Primitives';
import type { ProjectDetail } from '../../workspace/workspace-api';
import { LiveMilestoneList } from './LiveMilestoneList';
import { progressMilestones } from './live-project-presentation';

export function LiveProjectOverview({
  project,
  children,
}: {
  project: ProjectDetail;
  children?: ReactNode;
}) {
  const progress = project.progress;
  const required = progress?.milestones.filter((m) => m.required);
  return (
    <div className="project-overview-grid">
      <div>
        <section className="panel project-about">
          <p className="eyebrow">THE BIG PICTURE</p>
          <h2>A question worth exploring.</h2>
          <p>{project.description}</p>
          <h3>What we’re working towards</h3>
          {project.objectives.map((objective, index) => (
            <div className="objective" key={index}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{objective}</p>
            </div>
          ))}
        </section>
        <section className="section-spaced">
          <SectionHeading
            title="The path ahead"
            to={`/projects/${project.id}?tab=milestones`}
            label="All milestones"
          />
          <LiveMilestoneList project={project} />
        </section>
        {children}
      </div>
      <aside>
        <div className="panel project-summary">
          <SectionHeading title="At a glance" />
          {progress ? (
            <MilestoneProgress milestones={progressMilestones(project)} />
          ) : (
            <p>Progress unavailable</p>
          )}
          <div className="summary-line">
            <span>Evidence collected</span>
            <strong>
              {progress
                ? `${progress.milestones.reduce((sum, m) => sum + m.evidence_count, 0)} items`
                : 'Unavailable'}
            </strong>
          </div>
          <div className="summary-line">
            <span>Unresolved milestone feedback</span>
            <strong>
              {progress
                ? `${progress.unresolved_feedback} ${progress.unresolved_feedback === 1 ? 'thread' : 'threads'}`
                : 'Unavailable'}
            </strong>
          </div>
          <div className="summary-line">
            <span>Approval route</span>
            <strong>
              {project.approval_route === 'EXTERNALLY_APPROVED'
                ? 'Externally approved'
                : 'Proposal in Trace'}
            </strong>
          </div>
        </div>
        <div className="panel deliverables-panel">
          <h2>
            <FileCheck2 size={18} />
            Final deliverables
          </h2>
          {project.deliverables.map((d) => (
            <div className="deliverable" key={d.id}>
              <span>
                <FileCheck2 size={15} />
              </span>
              <div>
                <strong>{d.title}</strong>
                <small>{d.required ? 'Required' : 'Optional'} · Submission coming soon</small>
              </div>
            </div>
          ))}
        </div>
        <div className="panel completion-panel">
          <h2>
            <CircleCheck size={18} />
            Ready for the finish line?
          </h2>
          <CheckItem done={!!required && required.every((m) => m.state === 'APPROVED')}>
            All required milestones approved
          </CheckItem>
          <CheckItem done={false}>Required deliverables submitted</CheckItem>
          <CheckItem done={!!progress && progress.blocking_feedback === 0}>
            Blocking feedback resolved
          </CheckItem>
          <button className="button secondary full-width" disabled>
            Request final approval
          </button>
          <small>Final deliverable submission and final approval are coming soon.</small>
        </div>
      </aside>
    </div>
  );
}
