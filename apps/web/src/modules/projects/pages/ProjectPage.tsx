import { ArrowLeft, ArrowUpRight, CalendarDays, Check, Send } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useDemo } from '../../../app/providers/DemoProvider';
import { Badge, EmptyState, formatDate } from '../../../shared/ui/Primitives';
import { FeedbackPanel } from '../../feedback/FeedbackPanel';
import { ActivityList } from '../../activity/ActivityList';
import { EvidenceList } from '../../submissions/EvidenceList';
import { MilestoneList } from '../components/MilestoneList';
import { ProjectOverview } from '../components/ProjectOverview';
import { ProjectTeam } from '../components/ProjectTeam';

const tabs = ['overview', 'milestones', 'evidence', 'feedback', 'activity', 'team'];
export function ProjectPage() {
  const { projectId } = useParams();
  const { projects, persona, perform } = useDemo();
  const project = projects.find((p) => p.id === projectId);
  const [params, setParams] = useSearchParams();
  const tab = tabs.includes(params.get('tab') ?? '') ? params.get('tab')! : 'overview';
  if (!project)
    return (
      <EmptyState
        title="Project not found"
        description="It may have been removed when the demo was reset."
      >
        <Link className="button secondary" to="/projects">
          Back to projects
        </Link>
      </EmptyState>
    );
  const labels = {
    setup: 'Getting started',
    'proposal-review': 'Proposal awaiting review',
    active: 'In progress',
    'final-review': 'Final approval pending',
    completed: 'Completed',
  };
  const evidence = project.milestones.flatMap((m) => m.evidence);
  return (
    <>
      <Link className="back-link" to="/projects">
        <ArrowLeft size={15} />
        All projects
      </Link>
      <div className="page-heading project-page-heading">
        <div>
          <p className="eyebrow">
            {project.code} <span className="eyebrow-separator">/</span> {project.category}
          </p>
          <h1>{project.title}</h1>
          <div className="project-heading-meta">
            <Badge
              tone={project.state === 'active' || project.state === 'completed' ? 'green' : 'amber'}
            >
              {labels[project.state]}
            </Badge>
            <span>
              <CalendarDays size={15} />
              Due {formatDate(project.due)}
            </span>
            <span>Your role: {persona === 'author' ? 'Author' : 'Main Reviewer'}</span>
          </div>
        </div>
        <Link className="button secondary" to={`/demo/projects/${project.id}/portfolio`}>
          Process portfolio
          <ArrowUpRight size={16} />
        </Link>
      </div>
      {project.state === 'setup' && (
        <div className="workflow-banner">
          <div>
            <strong>
              {project.reviewerJoined
                ? 'Your project is ready for a proposal.'
                : 'Let’s bring your Reviewer on board.'}
            </strong>
            <p>
              {project.reviewerJoined
                ? 'Submit your starting structure for review before the project activates.'
                : 'Visit the team view to try the invitation acceptance flow.'}
            </p>
          </div>
          {project.reviewerJoined && persona === 'author' ? (
            <button
              className="button primary small"
              onClick={() => perform(project.id, { type: 'submit-proposal' })}
            >
              <Send size={14} />
              Submit proposal
            </button>
          ) : (
            <button className="button secondary small" onClick={() => setParams({ tab: 'team' })}>
              View team
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      )}
      {project.state === 'proposal-review' && (
        <div className="workflow-banner">
          <div>
            <strong>A shared starting point.</strong>
            <p>
              {persona === 'reviewer'
                ? 'Review the objectives and milestones below, then decide whether the project is ready to begin.'
                : 'Your proposal is with Dr. Maya Patel. Your starting structure is held for review.'}
            </p>
          </div>
          {persona === 'reviewer' && (
            <div className="inline-actions">
              <button
                className="button secondary small"
                onClick={() => perform(project.id, { type: 'review-proposal', approve: false })}
              >
                Request changes
              </button>
              <button
                className="button primary small"
                onClick={() => perform(project.id, { type: 'review-proposal', approve: true })}
              >
                <Check size={14} />
                Approve proposal
              </button>
            </div>
          )}
        </div>
      )}
      <div className="project-tabs" role="tablist" aria-label="Project sections">
        {tabs.map((value) => (
          <button
            id={`tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls="project-panel"
            tabIndex={tab === value ? 0 : -1}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const index = tabs.indexOf(value);
              const next =
                event.key === 'Home'
                  ? tabs[0]!
                  : event.key === 'End'
                    ? tabs.at(-1)!
                    : tabs[
                        (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
                      ]!;
              setParams({ tab: next });
              document.getElementById(`tab-${next}`)?.focus();
            }}
            className={tab === value ? 'active' : ''}
            key={value}
            onClick={() => setParams({ tab: value })}
          >
            {value[0]!.toUpperCase() + value.slice(1)}
            {value === 'feedback' &&
              project.feedback.filter((f) => f.status !== 'resolved').length > 0 && (
                <span className="count">
                  {project.feedback.filter((f) => f.status !== 'resolved').length}
                </span>
              )}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="project-panel" aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <ProjectOverview project={project} />}
        {tab === 'milestones' && <MilestoneList project={project} />}
        {tab === 'evidence' && (
          <div className="panel">
            <div className="panel-heading">
              <h2>Evidence, connected to your process</h2>
              <p>Each item belongs to one milestone. Approval happens at submission level.</p>
            </div>
            {evidence.length ? (
              <EvidenceList items={evidence} />
            ) : (
              <EmptyState
                title="Your evidence will live here"
                description="Open a milestone to add your first note, reference, or sample document."
              />
            )}
          </div>
        )}
        {tab === 'feedback' && <FeedbackPanel project={project} />}
        {tab === 'activity' && (
          <div className="panel">
            <ActivityList projects={[project]} />
          </div>
        )}
        {tab === 'team' && <ProjectTeam project={project} />}
      </div>
    </>
  );
}
