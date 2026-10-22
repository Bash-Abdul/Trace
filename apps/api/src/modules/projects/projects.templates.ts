export const templates = [
  {
    key: 'design',
    name: 'Design project',
    version: 1,
    milestones: [
      'Project brief & proposal',
      'Context & research',
      'Concept development',
      'Prototype & evaluation',
      'Final outcome & reflection',
    ],
  },
  {
    key: 'research',
    name: 'Research dissertation',
    version: 1,
    milestones: [
      'Research proposal',
      'Literature review',
      'Methodology',
      'Analysis & findings',
      'Dissertation & reflection',
    ],
  },
  {
    key: 'software',
    name: 'Software project',
    version: 1,
    milestones: [
      'Discovery & requirements',
      'System design',
      'Implementation & testing',
      'Evaluation & reflection',
    ],
  },
  {
    key: 'independent',
    name: 'Independent study',
    version: 1,
    milestones: ['Intent & objectives', 'Exploration', 'Development', 'Outcome & reflection'],
  },
] as const;
