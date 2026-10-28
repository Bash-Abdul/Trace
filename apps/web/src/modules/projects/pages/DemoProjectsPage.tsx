import { useState } from 'react';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../../app/providers/DemoProvider';
import { EmptyState } from '../../../shared/ui/Primitives';
import { ProjectCard } from '../components/ProjectCard';

export function DemoProjectsPage() {
  const { projects } = useDemo();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const visible = projects
    .filter(
      (p) =>
        p.title.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'active'
            ? p.state === 'active'
            : filter === 'completed'
              ? p.state === 'completed'
              : ['setup', 'proposal-review'].includes(p.state))),
    )
    .sort((a, b) =>
      sort === 'title' ? a.title.localeCompare(b.title) : b.updated.localeCompare(a.updated),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ROOM FOR YOUR IDEAS</p>
          <h1>
            My projects<span className="heading-dot">.</span>
          </h1>
          <p>Keep the work, the thinking, and the conversations together.</p>
        </div>
        <Link className="button primary" to="/demo/projects/new">
          <Plus size={17} />
          New project
        </Link>
      </div>
      <div className="project-toolbar">
        <div className="filter-tabs" aria-label="Filter projects">
          {['all', 'active', 'setup', 'completed'].map((value) => (
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
                    : 'Completed'}
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
      {visible.length > 0 ? (
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
