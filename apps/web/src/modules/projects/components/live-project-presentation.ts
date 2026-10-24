import { Code2, Compass, Flower2, Leaf } from 'lucide-react';
import type { ProjectSummary } from '../../workspace/workspace-api';

const templates = {
  design: { label: 'Design project', color: 'sage', icon: Flower2 },
  research: { label: 'Research dissertation', color: 'peach', icon: Leaf },
  software: { label: 'Software project', color: 'blue', icon: Code2 },
  independent: { label: 'Independent study', color: 'lilac', icon: Compass },
  custom: { label: 'Custom project', color: 'lilac', icon: Compass },
};
export function projectPresentation(project: ProjectSummary) {
  return templates[project.template_key as keyof typeof templates] ?? templates.custom;
}
export function progressMilestones(project: ProjectSummary) {
  return (
    project.progress?.milestones.map((m) => ({
      ...m,
      status: m.state.toLowerCase().replaceAll('_', '-') as
        'not-started' | 'draft' | 'awaiting-review' | 'revision-requested' | 'approved',
    })) ?? []
  );
}
