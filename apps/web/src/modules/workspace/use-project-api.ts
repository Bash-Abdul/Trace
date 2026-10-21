import { useCallback } from 'react';
import type { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { ProjectError, projectRequest } from './workspace-api';

export function useProjectApi() {
  const { session, clear } = useAuth();
  const csrfToken = session?.csrfToken;
  return useCallback(
    async <T>(
      path: string,
      schema: z.ZodType<T>,
      options: Parameters<typeof projectRequest>[2] = {},
    ) => {
      try {
        return await projectRequest(path, schema, {
          ...options,
          ...(csrfToken ? { csrfToken } : {}),
        });
      } catch (error) {
        if (error instanceof ProjectError && error.status === 401) clear();
        throw error;
      }
    },
    [csrfToken, clear],
  );
}
