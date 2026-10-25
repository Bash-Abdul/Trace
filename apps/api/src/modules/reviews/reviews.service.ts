import { withTransaction } from '../../config/db.js';
import type { Role } from '../projects/projects.types.js';
import * as repository from './reviews.repository.js';
import type { QueueItem, QueueKind, QueueRecord, ReviewQueue } from './reviews.types.js';
const roles: Role[] = ['LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER'];
const limit = 200;
function item(record: QueueRecord, kind: QueueKind): QueueItem {
  const reviewer = record.role === 'MAIN_REVIEWER';
  const waitingForReview = [
    'PROPOSAL_IN_REVIEW',
    'PROPOSED',
    'AWAITING_REVIEW',
    'ADDRESSED_BY_AUTHOR',
  ].includes(record.state);
  const needs_attention = reviewer === waitingForReview;
  const action =
    kind === 'MILESTONE_FEEDBACK'
      ? reviewer
        ? needs_attention
          ? 'Review addressed feedback'
          : 'Awaiting author response'
        : needs_attention
          ? 'Respond to milestone feedback'
          : 'Awaiting Reviewer resolution'
      : reviewer
        ? needs_attention
          ? 'Review submission'
          : 'Awaiting revised submission'
        : needs_attention
          ? record.role === 'LEAD_AUTHOR'
            ? 'Revise and resubmit'
            : 'Contribute to the revision'
          : 'Awaiting Reviewer decision';
  return {
    ...record,
    kind,
    perspective: reviewer ? 'reviewer' : 'author',
    needs_attention,
    action,
  };
}
export async function getQueue(userId: string): Promise<ReviewQueue> {
  return withTransaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const proposals = await repository.proposals(client, userId, roles, limit + 1);
    const submissions = await repository.submissions(client, userId, roles, limit + 1);
    const feedback = await repository.feedback(client, userId, roles, limit + 1);
    const changes = await repository.changes(client, userId, roles, limit + 1);
    const items = [
      ...changes.slice(0, limit).map((row) => item(row, 'PROJECT_CHANGE')),
      ...proposals.slice(0, limit).map((row) => item(row, 'PROPOSAL')),
      ...submissions.slice(0, limit).map((row) => item(row, 'MILESTONE_SUBMISSION')),
      ...feedback.slice(0, limit).map((row) => item(row, 'MILESTONE_FEEDBACK')),
    ].sort(
      (a, b) =>
        Number(b.needs_attention) - Number(a.needs_attention) ||
        b.updated_at.getTime() - a.updated_at.getTime() ||
        a.id.localeCompare(b.id),
    );
    return {
      items,
      truncated: [proposals, submissions, feedback, changes].some((rows) => rows.length > limit),
    };
  });
}
