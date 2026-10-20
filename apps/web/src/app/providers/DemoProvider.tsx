import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { createDemoProjects } from '../../modules/projects/data/demo-projects';
import { projectSchema, type Persona, type Project } from '../../modules/projects/model/project';
import { transitionProject, type ProjectAction } from '../../modules/projects/model/workflow';

const storageKey = 'trace.visual-demo.v1';
function loadProjects() {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    const parsed = z.array(projectSchema).min(1).max(50).safeParse(stored);
    return parsed.success ? parsed.data : createDemoProjects();
  } catch {
    return createDemoProjects();
  }
}
interface DemoContextValue {
  projects: Project[];
  persona: Persona;
  setPersona: (role: Persona) => void;
  perform: (projectId: string, action: ProjectAction) => boolean;
  addProject: (project: Project) => void;
  reset: () => void;
  notify: (message: string) => void;
  toast: string;
  dismiss: () => void;
  storageAvailable: boolean;
}
const DemoContext = createContext<DemoContextValue | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState(loadProjects);
  const [persona, setPersona] = useState<Persona>('author');
  const [toast, setToast] = useState('');
  const [storageAvailable, setStorageAvailable] = useState(true);
  function updateProjects(next: Project[]) {
    setProjects(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageAvailable(true);
      return true;
    } catch {
      setStorageAvailable(false);
      return false;
    }
  }
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  function perform(projectId: string, action: ProjectAction) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return false;
    try {
      const updated = transitionProject(project, action, persona);
      const saved = updateProjects(projects.map((p) => (p.id === projectId ? updated : p)));
      setToast(
        saved
          ? 'Demo updated. Your changes are saved in this browser.'
          : 'Demo updated for this visit. Browser storage is unavailable.',
      );
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not update the demo.');
      return false;
    }
  }
  return (
    <DemoContext.Provider
      value={{
        projects,
        persona,
        setPersona,
        perform,
        addProject: (project) => updateProjects([project, ...projects]),
        reset: () => {
          updateProjects(createDemoProjects());
          setPersona('author');
          setToast('The original demo projects have been restored.');
        },
        notify: setToast,
        toast,
        dismiss: () => setToast(''),
        storageAvailable,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}
export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('DemoProvider is required.');
  return context;
}
