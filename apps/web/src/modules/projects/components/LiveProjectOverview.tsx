import { FinalApprovalPanel } from '../../final-approval/FinalApprovalPanel';
import { Link } from 'react-router-dom';
import { HelpHint } from '../../../shared/ui/HelpHint';
import { FileCheck2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { MilestoneProgress, SectionHeading } from '../../../shared/ui/Primitives';
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
            help="These are the milestones in your project plan. Open one to add evidence, submit work or follow its review. They are separate checkpoints, not automatic deadlines."
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
            Final deliverables{' '}
            <HelpHint label="Final deliverables">
              The final outputs promised in your project plan. Authors prepare drafts; the lead
              submits each version. Submitting these outputs does not complete the project or
              replace final approval.
            </HelpHint>
          </h2>
          {project.deliverables.map((d) => (
            <div className="deliverable" key={d.id}>
              <span>
                <FileCheck2 size={15} />
              </span>
              <div>
                <strong>{d.title}</strong>
                <small>
                  {d.required ? 'Required' : 'Optional'} ·{' '}
                  {project.progress?.deliverables?.find((item) => item.id === d.id)?.state ===
                  'SUBMITTED'
                    ? 'Submitted'
                    : project.progress?.deliverables?.find((item) => item.id === d.id)?.state ===
                        'DRAFT'
                      ? 'Draft · not submitted'
                      : 'Not submitted yet'}
                </small>
                <Link className="text-button" to={`/projects/${project.id}/deliverables/${d.id}`}>
                  Open deliverable
                </Link>
              </div>
            </div>
          ))}
          {project.archived_deliverables.length > 0 && (
            <details>
              <summary>Removed deliverable history</summary>
              {project.archived_deliverables.map((d) => (
                <p key={d.id}>
                  <Link to={`/projects/${project.id}/deliverables/${d.id}`}>{d.title}</Link>
                </p>
              ))}
            </details>
          )}
        </div>
        <FinalApprovalPanel project={project} />
      </aside>
    </div>
  );
}
