import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useProjectApi } from '../workspace/use-project-api';
import { projectMessage } from '../workspace/workspace-api';
import { Badge } from '../../shared/ui/Primitives';
import { HelpHint } from '../../shared/ui/HelpHint';
const state = z.enum([
  'MISSING',
  'DRAFT',
  'SUBMITTED',
  'REVISION_REQUIRED',
  'ACCEPTED_WITH_MILESTONE',
]);
const item = z.object({ id: z.string(), title: z.string(), state });
const schema = z.object({
  objectives: z.array(item),
  milestones: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      required: z.boolean(),
      objectives: z.array(item),
      expectedEvidence: z.array(item.extend({ required: z.boolean() })),
    }),
  ),
  requiredOmissions: z.array(
    z.object({ milestoneId: z.string(), expectationId: z.string(), title: z.string() }),
  ),
});
const labels = {
  MISSING: 'Missing',
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  REVISION_REQUIRED: 'Revision requested',
  ACCEPTED_WITH_MILESTONE: 'Accepted with milestone',
};
export function ProjectCoverage({
  projectId,
  version,
  milestoneId,
}: {
  projectId: string;
  version: number;
  milestoneId?: string;
}) {
  const api = useProjectApi();
  const [data, setData] = useState<z.infer<typeof schema> | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(`/${projectId}/coverage`, schema, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(e));
      });
    return () => controller.abort();
  }, [api, projectId, version, attempt]);
  const milestones = data?.milestones.filter((m) => !milestoneId || m.id === milestoneId) ?? [];
  const objectives = milestoneId ? (milestones[0]?.objectives ?? []) : (data?.objectives ?? []);
  return (
    <section className="panel form-panel live-section">
      <h2>
        Evidence coverage{' '}
        <HelpHint label="Evidence coverage">
          Coverage shows which objectives and expected evidence have linked work. Acceptance comes
          from the milestone decision. An objective is accepted only when all its linked milestone
          contributions are accepted. Missing links remain visible even on an approved milestone.
        </HelpHint>
      </h2>
      <p className="muted">What the work supports, and what still needs evidence.</p>
      {error ? (
        <p role="alert">
          {error}{' '}
          <button className="button secondary small" onClick={() => setAttempt((n) => n + 1)}>
            Retry coverage
          </button>
        </p>
      ) : !data ? (
        <p role="status">Loading coverage…</p>
      ) : (
        <>
          <h3>Objectives</h3>
          {objectives.length === 0 && (
            <p>
              No objectives linked to this milestone yet. Add links in the project brief, or propose
              a change for an active project.
            </p>
          )}
          <ul className="evidence-list">
            {objectives.map((o) => (
              <li key={o.id}>
                {o.title}{' '}
                <Badge tone={o.state === 'ACCEPTED_WITH_MILESTONE' ? 'green' : 'amber'}>
                  {labels[o.state]}
                </Badge>
              </li>
            ))}
          </ul>
          {milestones.map((m) => (
            <div key={m.id}>
              <h3>
                {milestoneId ? 'Expected evidence' : m.title}{' '}
                <small>· {m.required ? 'Required milestone' : 'Optional milestone'}</small>
              </h3>
              {m.expectedEvidence.length === 0 ? (
                <p className="muted">No expected evidence specified.</p>
              ) : (
                <ul className="evidence-list">
                  {m.expectedEvidence.map((r) => (
                    <li key={r.id}>
                      {r.title} · {r.required ? 'Required' : 'Optional'}{' '}
                      <Badge tone={r.state === 'ACCEPTED_WITH_MILESTONE' ? 'green' : 'amber'}>
                        {labels[r.state]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
