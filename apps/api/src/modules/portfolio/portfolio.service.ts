import { inspectReadiness } from '../final-approval/final-approval.service.js';
import { withTransaction } from '../../config/db.js';
import { notFound, conflict } from '../../utils/app-error.js';
import * as projects from '../projects/projects.repository.js';
import * as repository from './portfolio.repository.js';
import type { Portfolio, Manifest, Records } from './portfolio.types.js';
// Original manifests freeze metadata and reference histories by ID. Never include later records.
export function selectLegacyRecords(manifest: Manifest, records: Records): Records {
  const history = manifest.history;
  return {
    events: manifest.project.events,
    submissions: records.submissions.filter((v) => history.milestoneVersionIds.includes(v.id)),
    deliverables: records.deliverables.filter((v) => history.deliverableVersionIds.includes(v.id)),
    feedback: history.feedback,
    messages: records.messages.filter((v) => history.feedbackMessageIds.includes(v.id)),
    changes: records.changes.filter((v) => history.changeIds.includes(v.id)),
  };
}
export async function read(projectId: string, userId: string): Promise<Portfolio> {
  return withTransaction(async (db) => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // Access is checked now, even when the caller appears in the historical team snapshot.
    if (!(await projects.memberRole(db, projectId, userId))) throw notFound('Project not found');
    const saved = await repository.snapshot(db, projectId);
    if (saved)
      return {
        mode: 'FINAL',
        checklist: saved.manifest.finalRequest.snapshot.checklist,
        recordedAt: saved.recordedAt,
        project: saved.manifest.project,
        records:
          saved.manifest.records ??
          selectLegacyRecords(saved.manifest, await repository.records(db, projectId)),
        drafts: [],
        finalRequest: saved.manifest.finalRequest,
      };
    const { project, snapshot } = await inspectReadiness(db, projectId, userId);
    if (!project) throw notFound('Project not found');
    if (project.status === 'COMPLETED')
      throw conflict('The final portfolio record is unavailable.');
    return {
      mode: 'LIVE',
      checklist: snapshot.checklist,
      recordedAt: null,
      project,
      records: await repository.records(db, projectId),
      drafts: await repository.drafts(db, projectId),
      finalRequest: null,
    };
  });
}
