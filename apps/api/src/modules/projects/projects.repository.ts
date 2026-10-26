import * as coverage from '../evidence-coverage/coverage.repository.js';
import type { PoolClient } from 'pg';
import type { Database } from '../../config/db.js';
import type {
  Draft,
  CreateProject,
  Invitation,
  Decision,
  Role,
  MemberProject,
  ProjectListItem,
  ProjectRecord,
  PendingInvitation,
  ProposalSnapshot,
  ProjectStructure,
  ProjectDetailResponse,
  CreatedInvitation,
  VerifiedAccount,
  SavedStructure,
} from './projects.types.js';

// Shared read projection for cards and detail. Correlated to the already authorised
// project row, so summary data uses the same membership check and database snapshot.
const progressSql = `jsonb_build_object(
  'milestones', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', pm.id,
      'required', pm.required,
      'state', COALESCE(ms.state, 'NOT_STARTED'),
      'evidence_count', (
        SELECT count(*)
        FROM milestone_draft_evidence e
        WHERE e.milestone_id = pm.id
      )
    ) ORDER BY pm.position)
    FROM project_milestones pm
    LEFT JOIN milestone_submissions ms ON ms.milestone_id = pm.id
    WHERE pm.project_id = p.id AND pm.archived_at IS NULL
  ), '[]'::jsonb),
  'unresolved_feedback', (
    SELECT count(*)
    FROM milestone_feedback f
    JOIN milestone_submission_versions v ON v.id = f.submission_version_id
    JOIN project_milestones pm ON pm.id = v.milestone_id
    WHERE pm.project_id = p.id
      AND f.state <> 'RESOLVED_BY_REVIEWER'
  ),
  'blocking_feedback', (
    SELECT count(*)
    FROM milestone_feedback f
    JOIN milestone_submission_versions v ON v.id = f.submission_version_id
    JOIN project_milestones pm ON pm.id = v.milestone_id
    WHERE pm.project_id = p.id
      AND f.blocking
      AND f.state <> 'RESOLVED_BY_REVIEWER'
  ),
  'members', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('user_id', pm.user_id, 'email', u.email)
      ORDER BY pm.joined_at, pm.user_id
    )
    FROM project_memberships pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = p.id
  ), '[]'::jsonb)
)`;

export async function event(
  client: PoolClient,
  id: string,
  userId: string,
  action: string,
  details: unknown = {},
): Promise<void> {
  await client.query(
    `INSERT INTO project_events (project_id, actor_user_id, action, details)
    VALUES ($1, $2, $3, $4)`,
    [id, userId, action, JSON.stringify(details)],
  );
}

export async function touch(client: PoolClient, id: string): Promise<void> {
  await client.query(
    `UPDATE projects
    SET version = version + 1, updated_at = now()
    WHERE id = $1`,
    [id],
  );
}

export async function structure(client: PoolClient, id: string): Promise<ProjectStructure> {
  const objectives = await client.query<{ id: string; title: string }>(
    `SELECT id, title
    FROM project_objectives
    WHERE project_id = $1
    ORDER BY position`,
    [id],
  );
  const milestones = await client.query<{ id: string; title: string; required: boolean }>(
    `SELECT id, title, required
    FROM project_milestones
    WHERE project_id = $1 AND archived_at IS NULL
    ORDER BY position`,
    [id],
  );
  const deliverables = await client.query<{ id: string; title: string; required: boolean }>(
    `SELECT id, title, required
    FROM project_deliverables
    WHERE project_id = $1 AND archived_at IS NULL
    ORDER BY position`,
    [id],
  );
  const coveragePlan = await coverage.plan(client, id);
  return {
    objectiveIds: objectives.rows.map((o) => o.id),
    objectives: objectives.rows.map((o) => o.title),
    milestones: milestones.rows.map((m) => ({
      ...m,
      objectiveIds: coveragePlan.links
        .filter((l) => l.milestone_id === m.id)
        .map((l) => l.objective_id),
      expectedEvidence: coveragePlan.requirements
        .filter((r) => r.milestone_id === m.id)
        .map(({ id, title, required }) => ({ id, title, required })),
    })),
    deliverables: deliverables.rows,
  };
}

export async function saveStructure(
  client: PoolClient,
  id: string,
  draft: SavedStructure,
): Promise<void> {
  await client.query(
    'DELETE FROM project_objectives WHERE project_id = $1 AND NOT (id = ANY($2::uuid[]))',
    [id, draft.objectiveIds ?? []],
  );
  await client.query(
    `INSERT INTO project_objectives (id, project_id, position, title)
    SELECT objective_id, $1, (ordinality - 1)::integer, ($3::text[])[ordinality]
    FROM unnest($2::uuid[]) WITH ORDINALITY AS incoming(objective_id, ordinality)
    ON CONFLICT (id) DO UPDATE SET position = EXCLUDED.position, title = EXCLUDED.title
    WHERE project_objectives.project_id = EXCLUDED.project_id`,
    [id, draft.objectiveIds, draft.objectives],
  );
  await saveItems(client, 'project_milestones', id, draft.milestones);
  await saveItems(client, 'project_deliverables', id, draft.deliverables);
  await coverage.savePlan(client, id, draft.milestones);
}

// The table identifier is restricted to these two internal constants; values stay parameterised.
async function saveItems(
  client: PoolClient,
  table: 'project_milestones' | 'project_deliverables',
  projectId: string,
  items: SavedStructure['milestones'],
): Promise<void> {
  await client.query(
    `WITH incoming AS (
      SELECT
        (item ->> 'id')::uuid AS id,
        (ordinality - 1)::integer AS position,
        item ->> 'title' AS title,
        (item ->> 'required')::boolean AS required
      FROM jsonb_array_elements($2::jsonb)
        WITH ORDINALITY AS v(item, ordinality)
    ),
    removed AS (
      DELETE FROM ${table}
      WHERE project_id = $1 AND archived_at IS NULL
        AND id NOT IN (SELECT id FROM incoming)
    )
    INSERT INTO ${table} (id, project_id, position, title, required)
    SELECT id, $1, position, title, required
    FROM incoming
    ON CONFLICT (id) DO UPDATE
    SET
      position = EXCLUDED.position,
      title = EXCLUDED.title,
      required = EXCLUDED.required
    WHERE ${table}.project_id = EXCLUDED.project_id
      AND (${table}.position, ${table}.title, ${table}.required)
        IS DISTINCT FROM (EXCLUDED.position, EXCLUDED.title, EXCLUDED.required)`,
    [projectId, JSON.stringify(items)],
  );
}

export async function listProjects(client: Database, userId: string): Promise<ProjectListItem[]> {
  return (
    await client.query<ProjectListItem>(
      `SELECT
        p.id,
        p.created_by_user_id,
        p.project_type,
        p.approval_route,
        p.title,
        p.description,
        p.template_key,
        p.template_version,
        p.status,
        p.version,
        p.activated_at,
        p.activated_version,
        p.created_at,
        p.updated_at,
        m.role,
        ${progressSql} AS progress
      FROM projects p
      JOIN project_memberships m ON m.project_id = p.id
      WHERE m.user_id = $1
      ORDER BY p.updated_at DESC
      LIMIT 100`,
      [userId],
    )
  ).rows;
}

export async function hasRole(client: PoolClient, id: string, role: Role): Promise<boolean> {
  return Boolean(
    (
      await client.query(
        `SELECT 1
        FROM project_memberships
        WHERE project_id = $1
          AND role = $2`,
        [id, role],
      )
    ).rowCount,
  );
}

export async function findMemberProjectForUpdate(
  client: PoolClient,
  id: string,
  userId: string,
): Promise<MemberProject | null> {
  // First acquire the shared project lock using the caller's visible membership.
  // Then read authority in a fresh statement snapshot: a JOIN evaluated before a
  // lock wait can otherwise retain a membership that was removed while waiting.
  const locked = await client.query(
    `SELECT p.id
    FROM projects p
    JOIN project_memberships m ON m.project_id = p.id
    WHERE p.id = $1 AND m.user_id = $2
    FOR UPDATE OF p`,
    [id, userId],
  );
  if (locked.rowCount !== 1) return null;
  return (
    (
      await client.query<MemberProject>(
        `SELECT
          p.id,
          p.created_by_user_id,
          p.project_type,
          p.approval_route,
          p.title,
          p.description,
          p.template_key,
          p.template_version,
          p.status,
          p.version,
          p.activated_at,
          p.activated_version,
          p.created_at,
          p.updated_at,
          m.role
        FROM projects p
        JOIN project_memberships m ON m.project_id = p.id
        WHERE p.id = $1
          AND m.user_id = $2`,
        [id, userId],
      )
    ).rows[0] ?? null
  );
}

export async function findProjectForUpdate(
  client: PoolClient,
  id: string,
): Promise<ProjectRecord | null> {
  return (
    (
      await client.query<ProjectRecord>(
        `SELECT
          id,
          created_by_user_id,
          project_type,
          approval_route,
          title,
          description,
          template_key,
          template_version,
          status,
          version,
          activated_at,
          activated_version,
          created_at,
          updated_at
        FROM projects
        WHERE id = $1
        FOR UPDATE`,
        [id],
      )
    ).rows[0] ?? null
  );
}

export async function insertProject(
  client: PoolClient,
  userId: string,
  input: CreateProject,
  templateVersion: number,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO projects (
      created_by_user_id,
      project_type,
      approval_route,
      title,
      description,
      template_key,
      template_version
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id`,
    [
      userId,
      input.projectType,
      input.approvalRoute,
      input.title,
      input.description,
      input.templateKey,
      templateVersion,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Project insert returned no record');
  return row.id;
}

export async function addMember(
  client: PoolClient,
  id: string,
  userId: string,
  role: Role,
): Promise<void> {
  await client.query(
    `INSERT INTO project_memberships (project_id, user_id, role)
    VALUES ($1, $2, $3)`,
    [id, userId, role],
  );
}

export async function updateBrief(client: PoolClient, id: string, input: Draft): Promise<void> {
  await client.query(
    `UPDATE projects
    SET title = $2, description = $3
    WHERE id = $1`,
    [id, input.title, input.description],
  );
}

export async function memberByEmail(
  client: PoolClient,
  id: string,
  email: string,
): Promise<boolean> {
  return Boolean(
    (
      await client.query(
        `SELECT 1
        FROM project_memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.project_id = $1
          AND u.email = $2`,
        [id, email],
      )
    ).rowCount,
  );
}

export async function memberRole(
  client: Database,
  id: string,
  userId: string,
): Promise<Role | null> {
  return (
    (
      await client.query<{ role: Role }>(
        `SELECT role
        FROM project_memberships
        WHERE project_id = $1
          AND user_id = $2`,
        [id, userId],
      )
    ).rows[0]?.role ?? null
  );
}

export async function cancelSupersededInvitations(
  client: PoolClient,
  id: string,
  email: string,
): Promise<void> {
  await client.query(
    `UPDATE project_invitations
    SET cancelled_at = now()
    WHERE project_id = $1
      AND consumed_at IS NULL
      AND cancelled_at IS NULL
      AND (email = $2 OR expires_at <= now())`,
    [id, email],
  );
}

export async function hasPendingRole(
  client: PoolClient,
  id: string,
  role: Invitation['role'],
): Promise<boolean> {
  return Boolean(
    (
      await client.query(
        `SELECT 1
        FROM project_invitations
        WHERE project_id = $1
          AND role = $2
          AND consumed_at IS NULL
          AND cancelled_at IS NULL`,
        [id, role],
      )
    ).rowCount,
  );
}

export async function insertInvitation(
  client: PoolClient,
  id: string,
  userId: string,
  input: Invitation,
  tokenHash: string,
): Promise<CreatedInvitation> {
  const result = (
    await client.query<{ id: string; expires_at: Date }>(
      `INSERT INTO project_invitations (project_id, invited_by_user_id, email, role, token_hash)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, expires_at`,
      [id, userId, input.email, input.role, tokenHash],
    )
  ).rows[0];
  if (!result) throw new Error('Invitation insert returned no record');
  return result;
}

export async function invitationRole(
  client: PoolClient,
  id: string,
  invitationId: string,
): Promise<Invitation['role'] | null> {
  return (
    (
      await client.query<{ role: Invitation['role'] }>(
        `SELECT role
        FROM project_invitations
        WHERE id = $1
          AND project_id = $2`,
        [invitationId, id],
      )
    ).rows[0]?.role ?? null
  );
}

export async function cancelInvitation(
  client: PoolClient,
  id: string,
  invitationId: string,
): Promise<boolean> {
  return Boolean(
    (
      await client.query(
        `UPDATE project_invitations
        SET cancelled_at = now()
        WHERE id = $1
          AND project_id = $2
          AND consumed_at IS NULL
          AND cancelled_at IS NULL`,
        [invitationId, id],
      )
    ).rowCount,
  );
}

export async function activateExternal(client: PoolClient, id: string): Promise<boolean> {
  return Boolean(
    (
      await client.query(
        `UPDATE projects
        SET
          status = 'ACTIVE',
          activated_at = now(),
          activated_version = version
        WHERE id = $1
          AND status = 'SETUP'
          AND approval_route = 'EXTERNALLY_APPROVED'
        RETURNING id`,
        [id],
      )
    ).rowCount,
  );
}

export async function invitationProjectId(
  client: PoolClient,
  tokenHash: string,
): Promise<string | null> {
  return (
    (
      await client.query<{ project_id: string }>(
        `SELECT project_id
        FROM project_invitations
        WHERE token_hash = $1`,
        [tokenHash],
      )
    ).rows[0]?.project_id ?? null
  );
}

export async function pendingInvitationForUpdate(
  client: PoolClient,
  tokenHash: string,
): Promise<PendingInvitation | null> {
  return (
    (
      await client.query<PendingInvitation>(
        `SELECT id, role, email, invited_by_user_id
        FROM project_invitations
        WHERE token_hash = $1
          AND consumed_at IS NULL
          AND cancelled_at IS NULL
          AND expires_at > clock_timestamp()
        FOR UPDATE`,
        [tokenHash],
      )
    ).rows[0] ?? null
  );
}

export async function account(client: PoolClient, userId: string): Promise<VerifiedAccount | null> {
  return (
    (
      await client.query<{ email: string; email_verified_at: Date | null }>(
        `SELECT email, email_verified_at
        FROM users
        WHERE id = $1`,
        [userId],
      )
    ).rows[0] ?? null
  );
}

export async function consumeInvitation(client: PoolClient, invitationId: string): Promise<void> {
  await client.query(
    `UPDATE project_invitations
    SET consumed_at = now()
    WHERE id = $1`,
    [invitationId],
  );
}

export async function insertProposal(
  client: PoolClient,
  id: string,
  version: number,
  snapshot: ProposalSnapshot,
  userId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO project_proposals (project_id, version, structure, submitted_by_user_id)
    VALUES ($1, $2, $3, $4)`,
    [id, version, JSON.stringify(snapshot), userId],
  );
  await client.query(
    `UPDATE projects
    SET status = 'PROPOSAL_IN_REVIEW'
    WHERE id = $1`,
    [id],
  );
}

export async function findLatestProposal(
  client: PoolClient,
  projectId: string,
): Promise<{ id: string; decision: Decision['decision'] | null } | null> {
  const result = await client.query<{ id: string; decision: Decision['decision'] | null }>(
    `SELECT id, decision
    FROM project_proposals
    WHERE project_id = $1
    ORDER BY version DESC
    LIMIT 1`,
    [projectId],
  );
  return result.rows[0] ?? null;
}

export async function recordDecision(
  client: PoolClient,
  id: string,
  proposalId: string,
  userId: string,
  input: Decision,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE project_proposals
    SET
      decision = $3,
      feedback = $4,
      decided_by_user_id = $5,
      decided_at = now()
    WHERE id = $1
      AND project_id = $2
      AND decision IS NULL
    RETURNING id`,
    [proposalId, id, input.decision, input.feedback, userId],
  );
  return result.rowCount === 1;
}

export async function applyDecisionStatus(
  client: PoolClient,
  id: string,
  status: ProjectRecord['status'],
): Promise<void> {
  await client.query(
    `UPDATE projects
    SET
      status = $2,
      activated_at = CASE WHEN $2 = 'ACTIVE' THEN now() ELSE NULL END,
      activated_version = CASE WHEN $2 = 'ACTIVE' THEN version ELSE NULL END
    WHERE id = $1`,
    [id, status],
  );
}

export async function findProjectDetail(
  database: Database,
  id: string,
  userId: string,
  invitationRoles: Role[],
): Promise<ProjectDetailResponse | null> {
  const result = await database.query<{ project: ProjectDetailResponse }>(
    `
    SELECT jsonb_build_object(
      'id', p.id,
      'created_by_user_id', p.created_by_user_id,
      'project_type', p.project_type,
      'approval_route', p.approval_route,
      'title', p.title,
      'description', p.description,
      'template_key', p.template_key,
      'template_version', p.template_version,
      'status', p.status,
      'version', p.version,
      'activated_at', p.activated_at,
      'activated_version', p.activated_version,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'role', m.role,
      'progress', ${progressSql},
      'objectiveIds', COALESCE((SELECT jsonb_agg(o.id ORDER BY o.position) FROM project_objectives o WHERE o.project_id = p.id), '[]'),
      'objectives', COALESCE((
        SELECT jsonb_agg(o.title ORDER BY o.position)
        FROM project_objectives o
        WHERE o.project_id = p.id
      ), '[]'),
      'milestones', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'title', i.title,
            'required', i.required,
            'objectiveIds', COALESCE((SELECT jsonb_agg(mo.objective_id ORDER BY mo.objective_id) FROM milestone_objectives mo WHERE mo.milestone_id = i.id), '[]'),
            'expectedEvidence', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'required', e.required) ORDER BY e.position) FROM milestone_expected_evidence e WHERE e.milestone_id = i.id), '[]')
          ) ORDER BY i.position
        )
        FROM project_milestones i
        WHERE i.project_id = p.id AND i.archived_at IS NULL
      ), '[]'),
      'deliverables', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'title', i.title,
            'required', i.required
          ) ORDER BY i.position
        )
        FROM project_deliverables i
        WHERE i.project_id = p.id AND i.archived_at IS NULL
      ), '[]'),
      'archived_milestones', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('id', am.id, 'title', am.title, 'required', am.required)
          ORDER BY am.archived_at, am.id
        )
        FROM project_milestones am
        WHERE am.project_id = p.id AND am.archived_at IS NOT NULL
      ), '[]'),
      'members', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', pm.user_id,
            'email', u.email,
            'role', pm.role
          ) ORDER BY pm.joined_at, pm.user_id
        )
        FROM project_memberships pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = p.id
      ), '[]'),
      'former_members', COALESCE((
        SELECT jsonb_agg(h ORDER BY h.removed_at DESC, h.user_id)
        FROM (
          SELECT DISTINCT ON (r.user_id) r.user_id, u.email, r.role, r.joined_at, r.removed_at
          FROM project_membership_removals r
          JOIN users u ON u.id = r.user_id
          WHERE r.project_id = p.id AND NOT EXISTS (
            SELECT 1 FROM project_memberships current_member
            WHERE current_member.project_id = r.project_id AND current_member.user_id = r.user_id
          )
          ORDER BY r.user_id, r.removed_at DESC, r.id
        ) h
      ), '[]'),
      'invitations', CASE WHEN m.role = ANY($3::text[]) THEN COALESCE((
        SELECT jsonb_agg(i)
        FROM (
          SELECT id, email, role, expires_at, consumed_at, cancelled_at
          FROM project_invitations
          WHERE project_id = p.id
          ORDER BY created_at DESC
          LIMIT 100
        ) i
      ), '[]') ELSE '[]'::jsonb END,
      'proposals', COALESCE((
        SELECT jsonb_agg(pr)
        FROM (
          SELECT
            id,
            version,
            structure,
            submitted_at,
            submitted_by_user_id,
            decision,
            feedback,
            decided_at,
            decided_by_user_id
          FROM project_proposals
          WHERE project_id = p.id
          ORDER BY version DESC
        ) pr
      ), '[]'),
      'events', COALESCE((
        SELECT jsonb_agg(e)
        FROM (
          SELECT e.id, e.action, e.details, e.created_at, u.email AS actor
          FROM project_events e
          JOIN users u ON u.id = e.actor_user_id
          WHERE e.project_id = p.id
          ORDER BY e.created_at DESC, e.id
          LIMIT 100
        ) e
      ), '[]')
    ) AS project
    FROM projects p
    JOIN project_memberships m ON m.project_id = p.id
    WHERE p.id = $1
      AND m.user_id = $2`,
    [id, userId, invitationRoles],
  );
  return result.rows[0]?.project ?? null;
}
