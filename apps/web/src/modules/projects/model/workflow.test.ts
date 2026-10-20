import { describe, expect, it } from 'vitest';
import { createDemoProjects, makeProject } from '../data/demo-projects';
import { transitionProject } from './workflow';

describe('project demo workflow', () => {
  it('preserves submitted versions when creating and submitting a revision', () => {
    const original = createDemoProjects()[0]!;
    const originalVersion = structuredClone(original.milestones[2]!.history[0]);
    const draft = transitionProject(
      original,
      {
        type: 'save-draft',
        milestoneId: 'research',
        summary: 'New synthesis map',
        evidence: original.milestones[2]!.evidence,
      },
      'author',
    );
    expect(draft.milestones[2]!.version).toBe(2);
    expect(original.milestones[2]!.version).toBe(1);
    const submitted = transitionProject(
      draft,
      { type: 'submit', milestoneId: 'research' },
      'author',
    );
    expect(submitted.milestones[2]!.history).toHaveLength(2);
    expect(submitted.milestones[2]!.history[0]).toEqual(originalVersion);
    expect(() =>
      transitionProject(
        submitted,
        { type: 'save-draft', milestoneId: 'research', summary: 'Overwrite', evidence: [] },
        'author',
      ),
    ).toThrow('cannot be edited');
    expect(() =>
      transitionProject(
        submitted,
        { type: 'review', milestoneId: 'research', decision: 'approved', comment: '' },
        'author',
      ),
    ).toThrow('appropriate');
    const approved = transitionProject(
      submitted,
      { type: 'review', milestoneId: 'research', decision: 'approved', comment: '' },
      'reviewer',
    );
    expect(approved.milestones[2]!.history[1]!.decision).toBe('Approved');
  });
  it('requires reviewer resolution, deliverables, and approved required milestones before final approval', () => {
    let project = createDemoProjects()[0]!;
    expect(() => transitionProject(project, { type: 'request-final' }, 'author')).toThrow();
    project.milestones.forEach((m) => {
      m.status = 'approved';
    });
    project.deliverables.forEach((d) => {
      d.submitted = true;
    });
    project = transitionProject(
      project,
      { type: 'respond', feedbackId: 'feedback-1', reply: 'Addressed in the new version.' },
      'author',
    );
    expect(() => transitionProject(project, { type: 'request-final' }, 'author')).toThrow();
    project = transitionProject(project, { type: 'resolve', feedbackId: 'feedback-1' }, 'reviewer');
    expect(() => transitionProject(project, { type: 'approve-final' }, 'reviewer')).toThrow();
    project = transitionProject(project, { type: 'request-final' }, 'author');
    project = transitionProject(project, { type: 'approve-final' }, 'reviewer');
    expect(project.state).toBe('completed');
    expect(() =>
      transitionProject(project, { type: 'deliver', deliverableId: 'report' }, 'author'),
    ).toThrow('complete');
  });
  it('activates the external route on joining and the in-platform route after proposal approval', () => {
    const external = makeProject('External', 'Sample', 0, 'external', 'maya@example.com');
    expect(transitionProject(external, { type: 'join-reviewer' }, 'author').state).toBe('active');
    let project = makeProject('Proposal', 'Sample', 0, 'in-platform', 'maya@example.com');
    expect(() => transitionProject(project, { type: 'submit-proposal' }, 'author')).toThrow();
    project = transitionProject(project, { type: 'join-reviewer' }, 'author');
    expect(project.state).toBe('setup');
    project = transitionProject(project, { type: 'submit-proposal' }, 'author');
    project = transitionProject(project, { type: 'review-proposal', approve: true }, 'reviewer');
    expect(project.state).toBe('active');
  });
});
