import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { z } from 'zod';
import { useProjectApi } from '../workspace/use-project-api';
import { projectMessage } from '../workspace/workspace-api';
import { queueSchema } from './reviews-api';
export function useReviewQueue() {
  const api = useProjectApi();
  const { pathname } = useLocation();
  const [data, setData] = useState<z.infer<typeof queueSchema> | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let controller: AbortController;
    function load() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      api('/reviews', queueSchema, { signal: request.signal })
        .then((result) => {
          if (!request.signal.aborted) {
            setData(result);
            setError('');
          }
        })
        .catch((error: unknown) => {
          if (!request.signal.aborted) setError(projectMessage(error));
        });
    }
    function refreshVisible() {
      if (document.visibilityState === 'visible') load();
    }
    load();
    const timer = window.setInterval(refreshVisible, 30000);
    window.addEventListener('focus', refreshVisible);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
    };
  }, [api, pathname, attempt]);
  return { data, error, retry: () => setAttempt((value) => value + 1) };
}
