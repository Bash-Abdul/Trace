import { useEffect, useState } from 'react';
export interface ActionToast {
  message: string;
  error: boolean;
}
const eventName = 'trace:action-toast';
export const projectChangedEvent = 'trace:project-changed';
export function announceAction(message: string, error = false) {
  window.dispatchEvent(new CustomEvent<ActionToast>(eventName, { detail: { message, error } }));
  if (!error) window.dispatchEvent(new Event(projectChangedEvent));
}
export function actionMessage(path: string, method: string) {
  if (path.includes('/invitations'))
    return method === 'DELETE'
      ? 'Invitation cancelled.'
      : path.endsWith('/accept')
        ? 'Invitation accepted.'
        : 'Invitation link created.';
  if (path.includes('/feedback')) return 'Milestone feedback saved.';
  if (path.endsWith('/decision'))
    return path.includes('/milestones/') ? 'Milestone decision saved.' : 'Proposal decision saved.';
  if (path.endsWith('/submissions')) return 'Milestone submitted for review.';
  if (path.endsWith('/draft')) return 'Evidence draft saved.';
  if (path.endsWith('/proposals')) return 'Proposal submitted for review.';
  return path === '' && method === 'POST' ? 'Project created.' : 'Project saved.';
}
export function useActionToast() {
  const [toast, setToast] = useState<ActionToast | null>(null);
  useEffect(() => {
    function received(event: Event) {
      setToast((event as CustomEvent<ActionToast>).detail);
    }
    window.addEventListener(eventName, received);
    return () => window.removeEventListener(eventName, received);
  }, []);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return { toast, dismiss: () => setToast(null) };
}
