import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useDemo } from './DemoProvider';
import { useReviewQueue } from '../../modules/reviews/use-review-queue';
import { useProjectList } from '../../modules/projects/use-project-list';
import type { Persona } from '../../modules/projects/model/project';
const Context = createContext<
  | (ReturnType<typeof useProjectList> & {
      persona: Persona;
      queue: ReturnType<typeof useReviewQueue>;
    })
  | null
>(null);
export function WorkspaceViewProvider({ children }: { children: ReactNode }) {
  const list = useProjectList();
  const queue = useReviewQueue();
  const demo = useDemo();
  const { pathname } = useLocation();
  const currentProject = list.projects?.find((project) =>
    pathname.startsWith(`/projects/${project.id}`),
  );
  const reviewerOnly =
    !!list.projects?.length &&
    list.projects.every((p) => ['MAIN_REVIEWER', 'DORMANT_REVIEWER'].includes(p.role));
  const persona: Persona = (
    currentProject
      ? ['MAIN_REVIEWER', 'DORMANT_REVIEWER'].includes(currentProject.role)
      : (pathname === '/reviews' &&
          list.projects?.some((project) => project.role === 'MAIN_REVIEWER')) ||
        reviewerOnly
  )
    ? 'reviewer'
    : 'author';
  const setDemoPersona = demo.setPersona;
  useEffect(() => {
    setDemoPersona(persona);
  }, [persona, setDemoPersona]);
  return <Context.Provider value={{ ...list, persona, queue }}>{children}</Context.Provider>;
}
export function useWorkspaceView() {
  const value = useContext(Context);
  if (!value) throw new Error('WorkspaceViewProvider required');
  return value;
}
