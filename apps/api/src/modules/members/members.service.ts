import type { PoolClient } from 'pg';
import { conflict, forbidden, notFound } from '../../utils/app-error.js';
import * as projects from '../projects/projects.repository.js';
import { enqueue } from '../notifications/notifications.repository.js';
import * as repository from './members.repository.js';
import type { MemberParams, MembershipAction } from './members.types.js';

// Invitation acceptance, changes and milestone mutations use the same project lock.
async function context(
  db: PoolClient,
  params: MemberParams,
  actorId: string,
  input: MembershipAction,
) {
  const project = await projects.findMemberProjectForUpdate(db, params.projectId, actorId);
  if (!project) throw notFound('Project not found');
  if (project.project_type !== 'GROUP' || project.role !== 'LEAD_AUTHOR') {
    throw forbidden('Only the lead Author of a group project can manage Authors.');
  }
  if (project.status === 'PROPOSAL_REJECTED') throw conflict('This project was rejected.');
  if (project.version !== input.version)
    throw conflict('The team or project changed. Reload before continuing.', 'PROJECT_STALE');
  const target = await repository.member(db, params.projectId, params.userId);
  if (!target) throw notFound('Current group member not found');
  if (target.role !== 'AUTHOR')
    throw forbidden(
      'Choose an accepted group Author. The current lead and Reviewers cannot be removed or selected here.',
    );
  return target;
}
export async function remove(
  db: PoolClient,
  params: MemberParams,
  actorId: string,
  input: MembershipAction,
) {
  const target = await context(db, params, actorId, input);
  await repository.recordRemoval(db, params.projectId, target, actorId, input.reason);
  if (!(await repository.removeAccess(db, params.projectId, params.userId)))
    throw conflict('This membership changed.');
  const cancelledInvitationIds = await repository.cancelIssuedInvitations(
    db,
    params.projectId,
    params.userId,
  );
  const details = { userId: params.userId, reason: input.reason, cancelledInvitationIds };
  await projects.touch(db, params.projectId);
  await projects.event(db, params.projectId, actorId, 'GROUP_AUTHOR_REMOVED', details);
  await enqueue(
    db,
    params.projectId,
    actorId,
    'GROUP_AUTHOR_REMOVED',
    ['LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER'],
    details,
  );
}
export async function transferLead(
  db: PoolClient,
  params: MemberParams,
  actorId: string,
  input: MembershipAction,
) {
  await context(db, params, actorId, input);
  // The unique lead index is immediate: demote first, then promote in this transaction.
  // Other transactions see the old or new committed membership, never an intermediate team.
  if (
    !(await repository.changeRole(db, params.projectId, actorId, 'LEAD_AUTHOR', 'AUTHOR')) ||
    !(await repository.changeRole(db, params.projectId, params.userId, 'AUTHOR', 'LEAD_AUTHOR'))
  )
    throw conflict('The lead changed. Reload the team.');
  const cancelledInvitationIds = await repository.cancelIssuedInvitations(
    db,
    params.projectId,
    actorId,
  );
  const details = {
    previousLeadId: actorId,
    newLeadId: params.userId,
    reason: input.reason,
    cancelledInvitationIds,
  };
  await projects.touch(db, params.projectId);
  await projects.event(db, params.projectId, actorId, 'GROUP_LEAD_TRANSFERRED', details);
  await enqueue(
    db,
    params.projectId,
    actorId,
    'GROUP_LEAD_TRANSFERRED',
    ['LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER'],
    details,
  );
}
