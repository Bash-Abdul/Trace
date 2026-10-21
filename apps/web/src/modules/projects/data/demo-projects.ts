import type { Milestone, Project } from '../model/project';

function milestone(id: string, title: string, status: Milestone['status'], due: string): Milestone {
  const record: Milestone = {
    id,
    title,
    status,
    due,
    required: true,
    description:
      'Document your approach, connect the evidence to your objectives, and reflect on what you learned.',
    version: 1,
    summary:
      status === 'not-started'
        ? ''
        : 'This stage explores the needs of our community through research, observation, and iterative design. The evidence below captures both the findings and the decisions that shaped the work.',
    evidence:
      status === 'not-started'
        ? []
        : [
            {
              id: `${id}-doc`,
              title: 'Research findings & reflections',
              kind: 'document',
              detail: 'Sample document · 8 pages',
            },
            {
              id: `${id}-note`,
              title: 'What changed along the way',
              kind: 'note',
              detail:
                'Early interviews challenged my assumption that wayfinding was the main issue. Students consistently described a need for quieter, more inclusive shared spaces. This shifted the focus of the next phase.',
            },
          ],
    history: [],
  };
  if (['approved', 'revision-requested', 'awaiting-review'].includes(status))
    record.history.push({
      version: 1,
      summary: record.summary,
      evidence: structuredClone(record.evidence),
      decision:
        status === 'approved'
          ? 'Approved'
          : status === 'revision-requested'
            ? 'Changes requested'
            : 'Awaiting review',
    });
  return record;
}
export function createDemoProjects(): Project[] {
  return [
    {
      id: 'calmer-campus',
      title: 'Designing a calmer campus',
      code: 'TR–024',
      category: 'Design project',
      color: 'sage',
      state: 'active',
      route: 'in-platform',
      projectType: 'individual',
      reviewerJoined: true,
      reviewerEmail: 'maya.patel@example.com',
      description:
        'Exploring how thoughtful spatial design can support student wellbeing and a stronger sense of belonging on campus.',
      due: '2026-12-14',
      updated: '2026-10-20',
      objectives: [
        'Understand how students experience shared campus spaces.',
        'Design an inclusive intervention grounded in primary research.',
        'Evaluate the prototype through student feedback.',
      ],
      milestones: [
        milestone('brief', 'Project brief & proposal', 'approved', '2026-09-21'),
        milestone('context', 'Context & literature review', 'approved', '2026-10-05'),
        milestone('research', 'User research & insights', 'revision-requested', '2026-10-23'),
        milestone('concept', 'Concept development', 'draft', '2026-11-06'),
        milestone('prototype', 'Prototype & evaluation', 'not-started', '2026-11-27'),
        milestone('reflection', 'Final outcome & reflection', 'not-started', '2026-12-14'),
      ],
      feedback: [
        {
          id: 'feedback-1',
          milestoneId: 'research',
          author: 'Dr. Maya Patel',
          body: 'A thoughtful set of interviews, Bashir. Could you make the connection between your findings and the design opportunities more explicit? A short synthesis map would help tell that story.',
          blocking: true,
          status: 'open',
          reply: '',
        },
      ],
      deliverables: [
        { id: 'report', title: 'Final project report', submitted: false },
        { id: 'outcome', title: 'Design outcome & evaluation', submitted: false },
      ],
      activity: [
        {
          id: 'a1',
          actor: 'Dr. Maya Patel',
          action: 'requested a revision',
          detail: 'User research & insights · Version 1',
          date: '2026-10-20T09:15:00',
        },
        {
          id: 'a2',
          actor: 'You',
          action: 'submitted a milestone',
          detail: 'User research & insights · Version 1',
          date: '2026-10-19T14:30:00',
        },
        {
          id: 'a3',
          actor: 'Dr. Maya Patel',
          action: 'approved a milestone',
          detail: 'Context & literature review',
          date: '2026-10-06T10:00:00',
        },
      ],
    },
    {
      id: 'urban-greens',
      title: 'Urban green spaces & wellbeing',
      code: 'TR–019',
      category: 'Research dissertation',
      color: 'peach',
      state: 'active',
      route: 'external',
      projectType: 'individual',
      reviewerJoined: true,
      reviewerEmail: 'maya.patel@example.com',
      description:
        'Investigating the relationship between access to urban green spaces and everyday wellbeing in young adults.',
      due: '2027-01-18',
      updated: '2026-10-18',
      objectives: [
        'Map local green-space access.',
        'Compare lived experiences through qualitative interviews.',
      ],
      milestones: [
        milestone('u-brief', 'Research proposal', 'approved', '2026-09-28'),
        milestone('u-literature', 'Literature review', 'awaiting-review', '2026-10-26'),
        milestone('u-method', 'Methodology & fieldwork', 'draft', '2026-11-16'),
        milestone('u-analysis', 'Analysis & findings', 'not-started', '2026-12-14'),
        milestone('u-final', 'Dissertation & reflection', 'not-started', '2027-01-18'),
      ],
      feedback: [],
      deliverables: [{ id: 'u-report', title: 'Final dissertation', submitted: false }],
      activity: [
        {
          id: 'ua1',
          actor: 'You',
          action: 'submitted a milestone',
          detail: 'Literature review · Version 1',
          date: '2026-10-18T16:20:00',
        },
      ],
    },
    {
      id: 'open-source',
      title: 'Open source, open possibilities',
      code: 'TR–031',
      category: 'Software project',
      color: 'blue',
      state: 'proposal-review',
      route: 'in-platform',
      projectType: 'individual',
      reviewerJoined: true,
      reviewerEmail: 'maya.patel@example.com',
      description:
        'Creating an accessible contribution experience for first-time open-source developers.',
      due: '2027-02-08',
      updated: '2026-10-17',
      objectives: [
        'Identify barriers to a first contribution.',
        'Build and evaluate an accessible onboarding experience.',
      ],
      milestones: [
        milestone('s-discovery', 'Discovery & requirements', 'not-started', '2026-11-02'),
        milestone('s-design', 'System design', 'not-started', '2026-11-23'),
        milestone('s-build', 'Implementation & testing', 'not-started', '2027-01-11'),
        milestone('s-reflect', 'Evaluation & reflection', 'not-started', '2027-02-08'),
      ],
      feedback: [],
      deliverables: [
        { id: 's-code', title: 'Source code & documentation', submitted: false },
        { id: 's-report', title: 'Evaluation report', submitted: false },
      ],
      activity: [
        {
          id: 'sa1',
          actor: 'You',
          action: 'submitted a project proposal',
          detail: 'Waiting for Dr. Maya Patel',
          date: '2026-10-17T11:00:00',
        },
      ],
    },
  ];
}
// Illustrative template labels; the backend plan does not define their final names.
export const demoTemplates = [
  {
    name: 'Design project',
    description: 'From discovery to a considered design outcome.',
    color: 'sage' as const,
    milestones: [
      'Project brief & proposal',
      'Context & research',
      'Concept development',
      'Prototype & evaluation',
      'Final outcome & reflection',
    ],
  },
  {
    name: 'Research dissertation',
    description: 'A structured path from question to contribution.',
    color: 'peach' as const,
    milestones: [
      'Research proposal',
      'Literature review',
      'Methodology',
      'Analysis & findings',
      'Dissertation & reflection',
    ],
  },
  {
    name: 'Software project',
    description: 'Make your technical decisions and process visible.',
    color: 'blue' as const,
    milestones: [
      'Discovery & requirements',
      'System design',
      'Implementation & testing',
      'Evaluation & reflection',
    ],
  },
  {
    name: 'Independent study',
    description: 'Room to shape a project around your curiosity.',
    color: 'lilac' as const,
    milestones: ['Intent & objectives', 'Exploration', 'Development', 'Outcome & reflection'],
  },
];
export function makeProject(
  title: string,
  description: string,
  templateIndex: number,
  route: Project['route'],
  reviewerEmail: string,
  projectType: Project['projectType'] = 'individual',
): Project {
  const template = demoTemplates[templateIndex] ?? demoTemplates[0]!;
  const id = crypto.randomUUID();
  return {
    projectType,
    id,
    title,
    description,
    code: `TR–${id.slice(0, 3).toUpperCase()}`,
    category: template.name,
    color: template.color,
    state: 'setup',
    route,
    reviewerEmail,
    reviewerJoined: false,
    due: '2027-02-15',
    updated: new Date().toISOString(),
    objectives: ['Define the intended outcome and gather evidence of your process.'],
    milestones: template.milestones.map((title, i) =>
      milestone(`${id}-${i}`, title, 'not-started', '2027-02-15'),
    ),
    feedback: [],
    deliverables: [{ id: `${id}-report`, title: 'Final outcome & reflection', submitted: false }],
    activity: [
      {
        id: crypto.randomUUID(),
        actor: 'You',
        action: 'created this project',
        detail: template.name,
        date: new Date().toISOString(),
      },
    ],
  };
}
