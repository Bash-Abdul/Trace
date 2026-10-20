import {
  completionChecks,
  personaNames,
  type Evidence,
  type Persona,
  type Project,
} from './project';

export type ProjectAction =
  | { type: 'save-draft'; milestoneId: string; summary: string; evidence: Evidence[] }
  | { type: 'submit'; milestoneId: string }
  | {
      type: 'review';
      milestoneId: string;
      decision: 'approved' | 'revision-requested';
      comment: string;
    }
  | { type: 'respond'; feedbackId: string; reply: string }
  | { type: 'resolve'; feedbackId: string }
  | { type: 'join-reviewer' }
  | { type: 'submit-proposal' }
  | { type: 'review-proposal'; approve: boolean }
  | { type: 'deliver'; deliverableId: string }
  | { type: 'request-final' }
  | { type: 'approve-final' };

export function transitionProject(
  original: Project,
  action: ProjectAction,
  persona: Persona,
): Project {
  const project = structuredClone(original);
  const reviewerActions = ['review', 'resolve', 'review-proposal', 'approve-final'];
  if (
    action.type !== 'join-reviewer' &&
    (reviewerActions.includes(action.type) ? persona !== 'reviewer' : persona !== 'author')
  )
    throw new Error('Switch to the appropriate demo participant for this action.');
  if (project.state === 'completed')
    throw new Error('This project is complete. Its portfolio is now a snapshot.');
  let detail = '';
  let verb = '';
  if ('milestoneId' in action) {
    if (project.state !== 'active')
      throw new Error('The project must be active before working on milestones.');
    const milestone = project.milestones.find((m) => m.id === action.milestoneId);
    if (!milestone) throw new Error('Milestone not found.');
    detail = milestone.title;
    if (action.type === 'save-draft') {
      if (!['draft', 'not-started', 'revision-requested'].includes(milestone.status))
        throw new Error('Submitted versions cannot be edited.');
      if (milestone.status === 'revision-requested') milestone.version += 1;
      milestone.summary = action.summary.trim();
      milestone.evidence = action.evidence;
      milestone.status = 'draft';
      verb = 'saved a draft';
    } else if (action.type === 'submit') {
      if (
        milestone.status !== 'draft' ||
        !milestone.summary.trim() ||
        milestone.evidence.length === 0
      )
        throw new Error('Save a reflection and at least one evidence item before submitting.');
      milestone.status = 'awaiting-review';
      milestone.history.push({
        version: milestone.version,
        summary: milestone.summary,
        evidence: structuredClone(milestone.evidence),
        decision: 'Awaiting review',
      });
      verb = 'submitted a milestone';
    } else {
      if (milestone.status !== 'awaiting-review')
        throw new Error('Only a submitted milestone can be reviewed.');
      if (action.decision === 'revision-requested' && !action.comment.trim())
        throw new Error('Explain what needs to change before requesting a revision.');
      milestone.status = action.decision;
      const version = milestone.history.find((v) => v.version === milestone.version);
      if (version)
        version.decision = action.decision === 'approved' ? 'Approved' : 'Changes requested';
      if (action.comment.trim())
        project.feedback.push({
          id: crypto.randomUUID(),
          milestoneId: milestone.id,
          author: personaNames.reviewer,
          body: action.comment.trim(),
          blocking: action.decision === 'revision-requested',
          status: 'open',
          reply: '',
        });
      verb = action.decision === 'approved' ? 'approved a milestone' : 'requested a revision';
    }
  } else if (action.type === 'respond' || action.type === 'resolve') {
    const feedback = project.feedback.find((f) => f.id === action.feedbackId);
    if (!feedback) throw new Error('Feedback not found.');
    if (action.type === 'respond') {
      if (!action.reply.trim() || feedback.status === 'resolved')
        throw new Error('Add a response to an open feedback thread.');
      feedback.reply = action.reply.trim();
      feedback.status = 'addressed';
      verb = 'responded to feedback';
    } else {
      feedback.status = 'resolved';
      verb = 'resolved feedback';
    }
    detail = project.milestones.find((m) => m.id === feedback.milestoneId)?.title ?? project.title;
  } else if (action.type === 'join-reviewer') {
    if (project.reviewerJoined || project.state !== 'setup')
      throw new Error('The reviewer has already joined.');
    project.reviewerJoined = true;
    if (project.route === 'external') project.state = 'active';
    verb = 'simulated invitation acceptance';
    detail = 'Reviewer joined the demo project';
  } else if (action.type === 'submit-proposal') {
    if (project.state !== 'setup' || !project.reviewerJoined)
      throw new Error('Your reviewer must join before submitting a proposal.');
    project.state = 'proposal-review';
    verb = 'submitted a project proposal';
  } else if (action.type === 'review-proposal') {
    if (project.state !== 'proposal-review')
      throw new Error('There is no proposal awaiting review.');
    project.state = action.approve ? 'active' : 'setup';
    verb = action.approve ? 'approved the project proposal' : 'requested proposal changes';
  } else if (action.type === 'deliver') {
    if (project.state !== 'active')
      throw new Error('Deliverables can be submitted on active projects.');
    const deliverable = project.deliverables.find((d) => d.id === action.deliverableId);
    if (!deliverable) throw new Error('Deliverable not found.');
    deliverable.submitted = true;
    detail = deliverable.title;
    verb = 'added a sample deliverable';
  } else if (action.type === 'request-final') {
    if (project.state !== 'active' || !completionChecks(project).every((c) => c.done))
      throw new Error('Complete every checklist item before requesting final approval.');
    project.state = 'final-review';
    verb = 'requested final approval';
  } else if (action.type === 'approve-final') {
    if (project.state !== 'final-review' || !completionChecks(project).every((c) => c.done))
      throw new Error('This project is not ready for final approval.');
    project.state = 'completed';
    verb = 'approved the completed project';
  }
  project.updated = new Date().toISOString();
  project.activity.unshift({
    id: crypto.randomUUID(),
    actor: personaNames[persona],
    action: verb,
    detail: detail || project.title,
    date: project.updated,
  });
  return project;
}
