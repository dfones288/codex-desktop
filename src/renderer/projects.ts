export interface ProjectEntry {
  id: string;
  name: string;
  path: string;
}

export interface ProjectState {
  projects: ProjectEntry[];
  activeProjectId?: string;
}

export function titleForPath(path: string): string {
  return path.split(/[\\/]+/).filter(Boolean).at(-1) || path;
}

export function addProject(state: ProjectState, path: string): ProjectState {
  const existing = state.projects.find((project) => project.path === path);
  if (existing) {
    return { ...state, activeProjectId: existing.id };
  }

  const project = { id: path, name: titleForPath(path), path };
  return {
    projects: [...state.projects, project],
    activeProjectId: project.id
  };
}

export function removeProject(state: ProjectState, projectId: string): ProjectState {
  const index = state.projects.findIndex((project) => project.id === projectId);
  const projects = state.projects.filter((project) => project.id !== projectId);
  const activeProjectWasRemoved = state.activeProjectId === projectId;

  if (!activeProjectWasRemoved) {
    return { projects, activeProjectId: state.activeProjectId };
  }

  const fallback = projects[Math.min(index, projects.length - 1)];
  return {
    projects,
    activeProjectId: fallback?.id
  };
}
