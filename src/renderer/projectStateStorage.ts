import type { ProjectState } from './projects.js';

export function emptyProjectState(): ProjectState {
  return { projects: [], activeProjectId: undefined };
}

export function parseStoredProjectState(raw: string | null): ProjectState {
  if (!raw) return emptyProjectState();

  try {
    const parsed = JSON.parse(raw) as ProjectState;
    if (!Array.isArray(parsed.projects)) return emptyProjectState();
    const projects = parsed.projects
      .filter((project) => typeof project?.id === 'string' && typeof project.name === 'string' && typeof project.path === 'string')
      .filter((project) => !isBundledDeveloperProject(project));
    const activeProjectId = projects.some((project) => project.id === parsed.activeProjectId) ? parsed.activeProjectId : projects[0]?.id;
    return { projects, activeProjectId };
  } catch {
    return emptyProjectState();
  }
}


function isBundledDeveloperProject(project: { name: string; path: string }): boolean {
  const normalized = project.path.replace(/\\/g, '/').toLowerCase();
  if (project.name.toLowerCase() !== 'icode') return false;
  return normalized.endsWith('/icode') && (
    normalized.includes('/mangowork/ai_place/') ||
    normalized.includes('/users/mac/documents/') ||
    normalized.includes('/users/builder/')
  );
}
