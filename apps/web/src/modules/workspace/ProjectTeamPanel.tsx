import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import type { useProjectApi } from './use-project-api';
import { type ProjectDetail, roleLabels } from './workspace-api';

type Api = ReturnType<typeof useProjectApi>;
export type RunMutation = (operation: () => Promise<unknown>) => Promise<boolean>;
export function ProjectTeamPanel({
  project,
  api,
  run,
  busy,
}: {
  project: ProjectDetail;
  api: Api;
  run: RunMutation;
  busy: boolean;
}) {
  const [link, setLink] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const lead = project.role === 'LEAD_AUTHOR';
  const roles = [
    ...(lead && project.project_type === 'GROUP' ? (['AUTHOR'] as const) : []),
    ...(lead && !project.members.some((m) => m.role === 'MAIN_REVIEWER')
      ? (['MAIN_REVIEWER'] as const)
      : []),
    ...(project.role === 'MAIN_REVIEWER' &&
    project.status === 'SETUP' &&
    !project.members.some((m) => m.role === 'LEAD_AUTHOR')
      ? (['LEAD_AUTHOR'] as const)
      : []),
  ];
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLink('');
    setCopyNotice('');
    await run(async () => {
      const result = await api(
        `/${project.id}/invitations`,
        z.object({ invitationUrl: z.string() }),
        { method: 'POST', body: { email: data.get('email'), role: data.get('role') } },
      );
      setLink(result.invitationUrl);
    });
  }
  return (
    <section className="panel form-panel">
      <h2>The people behind the project</h2>
      {project.members.map((m) => (
        <div className="team-row" key={m.user_id}>
          <div>
            <strong>{m.email}</strong>
            <small>
              {project.project_type === 'INDIVIDUAL' && m.role === 'LEAD_AUTHOR'
                ? 'Author'
                : roleLabels[m.role]}
            </small>
          </div>
          <span>Joined</span>
        </div>
      ))}
      {roles.length > 0 && project.status !== 'PROPOSAL_REJECTED' && (
        <form onSubmit={(e) => void invite(e)} className="live-inline-form">
          <h3>Invite someone</h3>
          <label>
            Email address
            <input name="email" type="email" required maxLength={320} />
          </label>
          <label>
            Invite as
            <select name="role" key={roles.join(',')}>
              {roles.map((role) => (
                <option value={role} key={role}>
                  {role === 'LEAD_AUTHOR' && project.project_type === 'INDIVIDUAL'
                    ? 'Author'
                    : roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Create a link to share yourself. Only a verified account with this email can accept. No
            email is sent. Reissuing for the same email replaces the previous link.
          </p>
          <button disabled={busy} className="button secondary">
            Create invitation link
          </button>
        </form>
      )}
      {link && (
        <div className="soft-note">
          <label>
            Invitation link
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
          <button
            className="button secondary small"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => setCopyNotice('Link copied.'))
                .catch(() => setCopyNotice('Select and copy the link above.'))
            }
          >
            Copy link
          </button>
          <p role="status">{copyNotice}</p>
          <small>Save this link now. It is not shown again after leaving this page.</small>
        </div>
      )}
      {project.invitations
        .filter((i) => !i.consumed_at && !i.cancelled_at)
        .map((i) => (
          <div className="team-row" key={i.id}>
            <div>
              <strong>{i.email}</strong>
              <small>
                {roleLabels[i.role]} ·{' '}
                {new Date(i.expires_at) <= new Date()
                  ? 'Expired'
                  : `Expires ${new Date(i.expires_at).toLocaleDateString()}`}
              </small>
            </div>
            {roles.includes(i.role as 'AUTHOR' | 'LEAD_AUTHOR' | 'MAIN_REVIEWER') && (
              <button
                disabled={busy}
                className="button secondary small"
                onClick={() =>
                  void run(async () => {
                    await api(`/${project.id}/invitations/${i.id}`, z.null(), { method: 'DELETE' });
                    setLink('');
                  })
                }
              >
                Cancel invitation
              </button>
            )}
          </div>
        ))}
    </section>
  );
}
