import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Check, FolderOpen, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Milestone } from '../../modules/projects/model/project';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Avatar({
  name = 'Bashir Abdul',
  small = false,
}: {
  name?: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? 'avatar-small' : ''} ${name.includes('Maya') ? 'avatar-maya' : ''}`}
      aria-label={name}
    >
      {name
        .replace('Dr. ', '')
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')}
    </span>
  );
}
export function SectionHeading({
  title,
  count,
  to,
  label = 'View all',
}: {
  title: string;
  count?: number;
  to?: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <h2>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </h2>
      {to && (
        <Link className="text-link" to={to}>
          {label}
          <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <FolderOpen size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function MilestoneProgress({ milestones }: { milestones: Milestone[] }) {
  const approved = milestones.filter((m) => m.status === 'approved').length;
  return (
    <div className="milestone-progress">
      <div className="progress-label">
        <span>Milestones approved</span>
        <strong>
          {approved}
          <span> / {milestones.length}</span>
        </strong>
      </div>
      <div
        className="progress-track"
        aria-label={`${approved} of ${milestones.length} milestones approved`}
      >
        {milestones.map((m) => (
          <span key={m.id} className={m.status === 'approved' ? 'segment approved' : 'segment'} />
        ))}
      </div>
    </div>
  );
}
export function CheckItem({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <div className={`check-item ${done ? 'is-done' : ''}`}>
      <span>{done && <Check size={13} />}</span>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(
    new Date(value),
  );
}
