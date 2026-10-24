import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { z } from 'zod';
import { useProjectApi } from '../workspace/use-project-api';
import { summarySchema, projectMessage, type ProjectSummary } from '../workspace/workspace-api';
const listSchema = z.object({ projects: z.array(summarySchema) });
export function useProjectList() {
  const api = useProjectApi();
  const { pathname } = useLocation();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api('', listSchema, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setProjects(data.projects);
          setError('');
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(error));
      });
    return () => controller.abort();
  }, [api, attempt, pathname]);
  return { projects, error, retry: () => setAttempt((value) => value + 1) };
}
