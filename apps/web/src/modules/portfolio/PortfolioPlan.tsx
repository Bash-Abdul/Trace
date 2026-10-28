import { z } from 'zod';
import { structureSchema } from '../workspace/workspace-api';
export function PortfolioPlan({ plan }: { plan: z.infer<typeof structureSchema> }) {
  return (
    <div>
      <h4>{plan.title}</h4>
      <p>{plan.description}</p>
      {plan.dueDate && (
        <p>
          Due {plan.dueDate} · {plan.timezone}
        </p>
      )}
      <ol>
        {plan.objectives.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ol>
      <h4>Milestones</h4>
      <ol>
        {plan.milestones.map((m) => (
          <li key={m.id}>
            {m.title} · {m.required ? 'Required' : 'Optional'}
            {m.dueDate ? ` · Due ${m.dueDate}` : ''}
            {!!m.expectedEvidence?.length && (
              <ul>
                {m.expectedEvidence.map((e) => (
                  <li key={e.id}>
                    {e.title} · {e.required ? 'Required evidence' : 'Optional evidence'}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <h4>Deliverables</h4>
      <ul>
        {plan.deliverables.map((d) => (
          <li key={d.id}>
            {d.title} · {d.required ? 'Required' : 'Optional'}
          </li>
        ))}
      </ul>
    </div>
  );
}
const minorSchema = z.object({
  reason: z.string(),
  before: structureSchema,
  after: structureSchema,
});
export function PortfolioMinorEdit({ details }: { details: unknown }) {
  const parsed = minorSchema.safeParse(details);
  return parsed.success ? (
    <div>
      <p>{parsed.data.reason}</p>
      <h4>Before wording correction</h4>
      <PortfolioPlan plan={parsed.data.before} />
      <h4>After wording correction</h4>
      <PortfolioPlan plan={parsed.data.after} />
    </div>
  ) : null;
}
