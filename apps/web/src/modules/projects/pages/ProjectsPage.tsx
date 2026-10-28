import { useState } from 'react';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWorkspaceView } from '../../../app/providers/WorkspaceViewProvider';
import { ProjectListState } from '../components/ProjectListState';
import { EmptyState } from '../../../shared/ui/Primitives';
import { LiveProjectCard as ProjectCard } from '../components/LiveProjectCard';

export function ProjectsPage({ reviewing = false }: { reviewing?: boolean }) {
  const { projects, error, retry, persona } = useWorkspaceView();
  const reviewer = reviewing || persona === 'reviewer';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const visible = (projects ?? [])
    .filter(
      (p) =>
        (reviewer
          ? ['MAIN_REVIEWER', 'DORMANT_REVIEWER'].includes(p.role)
          : ['LEAD_AUTHOR', 'AUTHOR'].includes(p.role)) &&
        p.title.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'active'
            ? ['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(p.status)
            : filter === 'completed'
              ? p.status === 'COMPLETED'
              : filter === 'review'
                ? p.status === 'PROPOSAL_IN_REVIEW'
                : ['SETUP', 'PROPOSAL_CHANGES_REQUESTED'].includes(p.status))),
    )
    .sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : 0));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ROOM FOR YOUR IDEAS</p>
          <h1>
            {reviewer ? 'Assigned projects' : 'My projects'}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {reviewer
              ? 'Review submissions and follow up on feedback for your assigned projects.'
              : 'Keep the work, the thinking, and the conversations together.'}
          </p>
        </div>
        <Link className="button primary" to="/projects/new">
          <Plus size={17} />
          New project
        </Link>
      </div>
      <div className="project-toolbar">
        <div className="filter-tabs" aria-label="Filter projects">
          {['all', 'active', 'setup', 'review', 'completed'].map((value) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? 'selected' : ''}
              onClick={() => setFilter(value)}
            >
              {value === 'all'
                ? 'All projects'
                : value === 'setup'
                  ? 'Getting started'
                  : value === 'active'
                    ? 'In progress'
                    : value === 'completed'
                      ? 'Completed'
                      : 'Proposal review'}
            </button>
          ))}
        </div>
        <div className="toolbar-controls">
          <label className="search-field">
            <Search size={17} />
            <span className="sr-only">Search project titles</span>
            <input
              placeholder="Find a project…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="sort-control">
            <SlidersHorizontal size={16} />
            <span className="sr-only">Sort projects</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="recent">Recently updated</option>
              <option value="title">Project name</option>
            </select>
          </label>
        </div>
      </div>
      {reviewing && (
        <p>
          Projects where you are the Main Reviewer. Open a project to review proposals, milestone
          submissions and feedback.
        </p>
      )}
      {projects && projects.length >= 100 && (
        <p>Showing your 100 most recently updated projects.</p>
      )}
      {!projects || error ? (
        <ProjectListState error={error} retry={retry} />
      ) : visible.length > 0 ? (
        <div className="project-grid projects-full-grid">
          {visible.map((p) => (
            <ProjectCard project={p} key={p.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="A little room for something new"
          description="No projects match this view. Try another filter or start your next project."
        >
          <button
            className="button secondary"
            onClick={() => {
              setSearch('');
              setFilter('all');
            }}
          >
            Clear filters
          </button>
        </EmptyState>
      )}
    </>
  );
}
