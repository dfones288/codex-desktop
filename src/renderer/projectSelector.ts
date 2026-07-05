import type { ProjectEntry } from './projects.js';

export interface ProjectSelectorRow extends ProjectEntry {
  active: boolean;
}

export function projectSelectorRows(projects: ProjectEntry[], activeProjectId?: string): ProjectSelectorRow[] {
  return projects.map((project) => ({ ...project, active: project.id === activeProjectId }));
}
