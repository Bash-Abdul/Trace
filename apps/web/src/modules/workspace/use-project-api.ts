import { actionMessage, announceAction } from '../notifications/action-toast';
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
        const result = await projectRequest(path, schema, {
          ...options,
          ...(csrfToken ? { csrfToken } : {}),
        });
        if (options.method && !path.startsWith('/notifications'))
          announceAction(actionMessage(path, options.method));
        return result;
      } catch (error) {
        if (options.method && !path.startsWith('/notifications'))
          announceAction(
            'The change could not be confirmed. Check the message on this page and try again.',
            true,
          );
        if (error instanceof ProjectError && error.status === 401) clear();
        throw error;
      }
    },
    [csrfToken, clear],
  );
}
