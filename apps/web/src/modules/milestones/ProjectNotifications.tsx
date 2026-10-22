import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjectApi } from '../workspace/use-project-api';
import { projectMessage } from '../workspace/workspace-api';
import { notificationSchema } from './milestones-api';
import type { z } from 'zod';

export function ProjectNotifications({ projectId }: { projectId: string }) {
  const api = useProjectApi();
  const [notifications, setNotifications] = useState<z.infer<typeof notificationSchema>>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api(`/${projectId}/notifications`, notificationSchema, { signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) setNotifications(items);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(failure));
      });
    return () => controller.abort();
  }, [api, projectId]);
  return (
    <section className="panel form-panel live-section">
      <h2>Your milestone notifications</h2>
      {error && <p role="alert">{error}</p>}
      {!error && !notifications.length && <p>No milestone notifications yet.</p>}
      <ul>
        {notifications.map((notification) => (
          <li key={notification.id}>
            <Link to={`/workspace/projects/${projectId}/milestones/${notification.milestone_id}`}>
              {notification.action.replaceAll('_', ' ').toLowerCase()}
            </Link>{' '}
            · {new Date(notification.created_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
}
