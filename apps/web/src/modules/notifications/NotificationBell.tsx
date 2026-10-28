import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Modal } from '../../shared/ui/Primitives';
import { useProjectApi } from '../workspace/use-project-api';
import { projectMessage } from '../workspace/workspace-api';
import {
  inboxSchema,
  notificationDestination,
  notificationLabel,
  type Inbox,
  type Notification,
} from './notifications-api';
import { projectChangedEvent, announceAction } from './action-toast';
import './notifications.css';

export function NotificationBell() {
  const api = useProjectApi();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let controller: AbortController;
    function load() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      api(`/notifications${before ? `?before=${before}` : ''}`, inboxSchema, {
        signal: request.signal,
      })
        .then((result) => {
          if (!request.signal.aborted) {
            setData(result);
            setError('');
          }
        })
        .catch((err: unknown) => {
          if (!request.signal.aborted) setError(projectMessage(err));
        });
    }
    function refresh() {
      if (document.visibilityState === 'visible') load();
    }
    load();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener(projectChangedEvent, refresh);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(projectChangedEvent, refresh);
    };
  }, [api, pathname, before, attempt]);
  async function mark(item: Notification | null, read = true) {
    if (busy) return false;
    setBusy(true);
    try {
      await api(item ? `/notifications/${item.id}` : '/notifications/read-all', z.null(), {
        method: item ? 'PATCH' : 'POST',
        body: item ? { read } : {},
      });
      setAttempt((value) => value + 1);
      announceAction(
        item
          ? read
            ? 'Notification marked read.'
            : 'Notification marked unread.'
          : 'All notifications marked read.',
      );
      return true;
    } catch (err) {
      const message = projectMessage(err);
      setError(message);
      announceAction(message, true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="icon-button notification-button"
        aria-label={
          data?.unread_count ? `Notifications (${data.unread_count} unread)` : 'Notifications'
        }
        onClick={() => {
          setOpen(true);
          setBefore(null);
          setAttempt((value) => value + 1);
        }}
      >
        <Bell size={19} />
        {data && data.unread_count > 0 && (
          <span className="notification-count">
            {data.unread_count > 99 ? '99+' : data.unread_count}
          </span>
        )}
      </button>
      {open && (
        <Modal title="Notifications" onClose={() => setOpen(false)}>
          <div className="modal-body notification-inbox">
            <div className="section-heading">
              <p>{data ? `${data.unread_count} unread` : 'Loading notifications…'}</p>
              <button
                className="text-button"
                disabled={busy || !data?.unread_count}
                onClick={() => void mark(null)}
              >
                Mark all as read
              </button>
            </div>
            {error && (
              <p role="alert">
                {error} Notifications may be out of date.{' '}
                <button className="text-button" onClick={() => setAttempt((value) => value + 1)}>
                  Retry notifications
                </button>
              </p>
            )}
            {data && !data.items.length && (
              <p>
                {before
                  ? 'No older notifications.'
                  : 'You’re all caught up. Project and milestone updates will appear here.'}
              </p>
            )}
            {data?.items.map((item) => (
              <article
                key={item.id}
                className={`notification-item ${item.read_at ? '' : 'notification-unread'}`}
              >
                <Link
                  to={notificationDestination(item)}
                  onClick={async (event) => {
                    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    if (item.read_at || (await mark(item))) {
                      setOpen(false);
                      navigate(notificationDestination(item));
                    }
                  }}
                >
                  <strong>{notificationLabel(item)}</strong>
                  <p>
                    {item.project_title}
                    {item.milestone_title ? ` · ${item.milestone_title}` : ''}
                  </p>
                  <time dateTime={item.created_at}>
                    {new Date(item.created_at).toLocaleString()}
                  </time>
                </Link>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void mark(item, !item.read_at)}
                >
                  {item.read_at ? 'Mark unread' : 'Mark read'}
                </button>
              </article>
            ))}
            <div className="form-actions">
              {before && (
                <button
                  className="button secondary small"
                  onClick={() => {
                    setData(null);
                    setBefore(null);
                  }}
                >
                  Newest notifications
                </button>
              )}
              {data?.next_cursor && (
                <button
                  className="button secondary small"
                  onClick={() => {
                    setBefore(data.next_cursor);
                    setData(null);
                  }}
                >
                  Older notifications
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
