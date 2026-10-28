export type CoverageState =
  'MISSING' | 'DRAFT' | 'SUBMITTED' | 'REVISION_REQUIRED' | 'ACCEPTED_WITH_MILESTONE';
export interface CoverageItem {
  id: string;
  title: string;
  state: CoverageState;
}
export interface MilestoneCoverage {
  id: string;
  title: string;
  required: boolean;
  objectives: CoverageItem[];
  expectedEvidence: (CoverageItem & { required: boolean })[];
}
export interface Coverage {
  milestones: MilestoneCoverage[];
  objectives: CoverageItem[];
  requiredOmissions: { milestoneId: string; expectationId: string; title: string }[];
}
