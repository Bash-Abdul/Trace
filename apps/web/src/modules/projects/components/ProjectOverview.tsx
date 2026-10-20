import { ArrowRight, Check, CircleCheck, FileCheck2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../../app/providers/DemoProvider';
import { CheckItem, MilestoneProgress, SectionHeading } from '../../../shared/ui/Primitives';
import { completionChecks, type Project } from '../model/project';
import { MilestoneList } from './MilestoneList';

export function ProjectOverview({ project }: { project: Project }) {
  const { persona, perform } = useDemo();
  const checks = completionChecks(project);
  return (
    <div className="project-overview-grid">
      <div>
        <section className="panel project-about">
          <p className="eyebrow">THE BIG PICTURE</p>
          <h2>A question worth exploring.</h2>
          <p>{project.description}</p>
          <h3>What we’re working towards</h3>
          {project.objectives.map((objective, index) => (
            <div className="objective" key={objective}>
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
          <MilestoneList project={project} />
        </section>
      </div>
      <aside>
        <div className="panel project-summary">
          <SectionHeading title="At a glance" />
          <MilestoneProgress milestones={project.milestones} />
          <div className="summary-line">
            <span>Evidence collected</span>
            <strong>
              {project.milestones.reduce((sum, m) => sum + m.evidence.length, 0)} items
            </strong>
          </div>
          <div className="summary-line">
            <span>Unresolved feedback</span>
            <strong>
              {project.feedback.filter((f) => f.status !== 'resolved').length} threads
            </strong>
          </div>
          <div className="summary-line">
            <span>Approval route</span>
            <strong>
              {project.route === 'external' ? 'Externally approved' : 'Proposal in Trace'}
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
              <span className={d.submitted ? 'delivered' : ''}>
                {d.submitted ? <Check size={15} /> : <FileCheck2 size={15} />}
              </span>
              <div>
                <strong>{d.title}</strong>
                <small>{d.submitted ? 'Sample deliverable submitted' : 'Not submitted yet'}</small>
              </div>
              {!d.submitted && persona === 'author' && project.state === 'active' && (
                <button
                  className="text-button"
                  onClick={() => perform(project.id, { type: 'deliver', deliverableId: d.id })}
                >
                  Add sample
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="panel completion-panel">
          <h2>
            <CircleCheck size={18} />
            Ready for the finish line?
          </h2>
          {checks.map((check) => (
            <CheckItem key={check.label} done={check.done}>
              {check.label}
            </CheckItem>
          ))}
          {project.state === 'completed' ? (
            <Link className="button primary full-width" to={`/projects/${project.id}/portfolio`}>
              View final portfolio
              <ArrowRight size={15} />
            </Link>
          ) : persona === 'author' ? (
            <button
              className="button secondary full-width"
              disabled={project.state !== 'active' || !checks.every((c) => c.done)}
              onClick={() => perform(project.id, { type: 'request-final' })}
            >
              {project.state === 'final-review'
                ? 'Final approval requested'
                : 'Request final approval'}
            </button>
          ) : (
            <button
              className="button primary full-width"
              disabled={project.state !== 'final-review' || !checks.every((c) => c.done)}
              onClick={() => perform(project.id, { type: 'approve-final' })}
            >
              Approve completed project
            </button>
          )}
          <small>Final approval belongs to the active main Reviewer.</small>
        </div>
      </aside>
    </div>
  );
}
