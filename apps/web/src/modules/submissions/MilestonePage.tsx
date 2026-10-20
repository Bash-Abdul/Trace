import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, FileClock, Plus, Save, Send } from 'lucide-react';
import { useDemo } from '../../app/providers/DemoProvider';
import { Badge, EmptyState, formatDate, Modal } from '../../shared/ui/Primitives';
import { statusLabels, type Project, type Milestone } from '../projects/model/project';
import { EvidenceList } from './EvidenceList';
import { AddEvidenceModal } from './AddEvidenceModal';

function SubmissionWorkspace({ project, milestone }: { project: Project; milestone: Milestone }) {
  const { persona, perform } = useDemo();
  const [summary, setSummary] = useState(milestone.summary);
  const [evidence, setEvidence] = useState(milestone.evidence);
  const [comment, setComment] = useState('');
  const [adding, setAdding] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const editable =
    persona === 'author' &&
    project.state === 'active' &&
    ['draft', 'not-started', 'revision-requested'].includes(milestone.status);
  const dirty =
    summary.trim() !== milestone.summary ||
    JSON.stringify(evidence) !== JSON.stringify(milestone.evidence);
  const canSubmit =
    editable &&
    milestone.status === 'draft' &&
    !dirty &&
    Boolean(milestone.summary.trim()) &&
    milestone.evidence.length > 0;
  function save() {
    if (perform(project.id, { type: 'save-draft', milestoneId: milestone.id, summary, evidence }))
      setSummary(summary.trim());
  }
  return (
    <>
      <Link to={`/projects/${project.id}?tab=milestones`} className="back-link">
        <ArrowLeft size={15} />
        {project.title}
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            MILESTONE {String(project.milestones.indexOf(milestone) + 1).padStart(2, '0')}{' '}
            <span className="eyebrow-separator">/</span> VERSION {milestone.version}
          </p>
          <h1>{milestone.title}</h1>
          <div className="project-heading-meta">
            <Badge
              tone={
                milestone.status === 'approved'
                  ? 'green'
                  : milestone.status === 'revision-requested'
                    ? 'amber'
                    : 'neutral'
              }
            >
              {statusLabels[milestone.status]}
            </Badge>
            <span>Due {formatDate(milestone.due)}</span>
            <span>Required milestone</span>
          </div>
        </div>
        <button className="button secondary" onClick={() => setHistoryOpen(true)}>
          <FileClock size={16} />
          Version history
        </button>
      </div>
      {milestone.status === 'revision-requested' && (
        <div className="workflow-banner">
          <div>
            <strong>A chance to take the work further.</strong>
            <p>Your Reviewer requested changes. Save a revised draft to start the next version.</p>
          </div>
          <Link className="text-link" to={`/projects/${project.id}?tab=feedback`}>
            Read feedback
          </Link>
        </div>
      )}
      <div className="submission-grid">
        <div>
          <section className="panel submission-panel">
            <div className="panel-heading">
              <h2>The thinking behind the work</h2>
              <p>{milestone.description}</p>
            </div>
            {editable ? (
              <label className="submission-reflection">
                Reflection & explanation
                <textarea
                  rows={8}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  maxLength={8000}
                  placeholder="What did you do, what did you learn, and how does the evidence support it?"
                />
              </label>
            ) : (
              <p className="readable-text">
                {milestone.summary || 'This milestone has not started yet.'}
              </p>
            )}
          </section>
          <section className="panel evidence-panel">
            <div className="section-heading">
              <h2>
                Supporting evidence <span className="count">{evidence.length}</span>
              </h2>
              {editable && (
                <button className="button secondary small" onClick={() => setAdding(true)}>
                  <Plus size={14} />
                  Add evidence
                </button>
              )}
            </div>
            <p className="muted">
              Notes, references, and documents that tell the story of this milestone.
            </p>
            {(editable ? evidence : milestone.evidence).length ? (
              <EvidenceList
                items={editable ? evidence : milestone.evidence}
                onRemove={
                  editable
                    ? (id) => setEvidence((items) => items.filter((item) => item.id !== id))
                    : undefined
                }
              />
            ) : (
              <EmptyState
                title="Start with a small piece of evidence"
                description="A reflection note is a good place to begin."
              />
            )}
          </section>
        </div>
        <aside className="panel submission-actions">
          <p className="eyebrow">
            {persona === 'author' ? 'YOUR NEXT STEP' : 'REVIEW THIS VERSION'}
          </p>
          <h2>
            {persona === 'author'
              ? 'Ready to share your process?'
              : 'A thoughtful review goes a long way.'}
          </h2>
          <p>
            {persona === 'author'
              ? 'Save a reflection and add evidence before sending this version to your Reviewer.'
              : 'Decide on this milestone as a whole. Evidence items are not approved separately.'}
          </p>
          {editable && (
            <>
              <button className="button secondary full-width" onClick={save}>
                <Save size={16} />
                {milestone.status === 'revision-requested' ? 'Save revised draft' : 'Save draft'}
              </button>
              <button
                className="button primary full-width"
                disabled={!canSubmit}
                onClick={() => perform(project.id, { type: 'submit', milestoneId: milestone.id })}
              >
                <Send size={16} />
                Submit for review
              </button>
              {dirty && <small>Save your changes before submitting.</small>}
            </>
          )}
          {persona === 'reviewer' &&
            milestone.status === 'awaiting-review' &&
            project.state === 'active' && (
              <>
                <label>
                  Reviewer feedback
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="What’s working, and what could move further?"
                  />
                </label>
                <button
                  className="button primary full-width"
                  onClick={() =>
                    perform(project.id, {
                      type: 'review',
                      milestoneId: milestone.id,
                      decision: 'approved',
                      comment,
                    })
                  }
                >
                  <Check size={16} />
                  Approve milestone
                </button>
                <button
                  className="button secondary full-width"
                  disabled={!comment.trim()}
                  onClick={() =>
                    perform(project.id, {
                      type: 'review',
                      milestoneId: milestone.id,
                      decision: 'revision-requested',
                      comment,
                    })
                  }
                >
                  Request revision
                </button>
              </>
            )}
          {milestone.status === 'approved' && (
            <div className="approved-note">
              <Check size={20} />
              This version has been approved.
            </div>
          )}
          {persona === 'author' && milestone.status === 'awaiting-review' && (
            <div className="soft-note">
              This version is with your Reviewer. Switch to Reviewer view to try the next step.
            </div>
          )}
          {project.state !== 'active' && (
            <div className="soft-note">
              Milestone editing is available after project activation.
            </div>
          )}
          <hr />
          <small>
            Submitted versions are kept in the project history. A revision starts a new version.
          </small>
        </aside>
      </div>
      {adding && (
        <AddEvidenceModal
          onClose={() => setAdding(false)}
          onAdd={(item) => setEvidence((items) => [...items, item])}
        />
      )}
      {historyOpen && (
        <Modal wide title="Submission history" onClose={() => setHistoryOpen(false)}>
          <div className="modal-body">
            {milestone.history.length ? (
              milestone.history.map((version) => (
                <section className="version-record" key={version.version}>
                  <div className="section-heading">
                    <h3>Version {version.version}</h3>
                    <Badge>{version.decision}</Badge>
                  </div>
                  <p>{version.summary}</p>
                  <EvidenceList items={version.evidence} />
                </section>
              ))
            ) : (
              <EmptyState
                title="The first chapter is still being written"
                description="Your submitted versions will appear here. Drafts can be edited until submission."
              />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
export function MilestonePage() {
  const { projectId, milestoneId } = useParams();
  const { projects } = useDemo();
  const project = projects.find((p) => p.id === projectId);
  const milestone = project?.milestones.find((m) => m.id === milestoneId);
  if (!project || !milestone)
    return (
      <EmptyState
        title="Milestone not found"
        description="Return to your projects to pick up where you left off."
      >
        <Link className="button secondary" to="/projects">
          View projects
        </Link>
      </EmptyState>
    );
  return (
    <SubmissionWorkspace
      key={`${project.id}-${milestone.id}`}
      project={project}
      milestone={milestone}
    />
  );
}
