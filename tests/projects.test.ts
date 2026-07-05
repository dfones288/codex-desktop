import { describe, expect, it } from 'vitest';
import { addProject, removeProject, titleForPath } from '../src/renderer/projects.js';

describe('project model', () => {
  it('adds a project once and selects it', () => {
    const state = addProject({ projects: [], activeProjectId: undefined }, '/tmp/codex_datas');

    expect(state.projects).toEqual([{ id: '/tmp/codex_datas', name: 'codex_datas', path: '/tmp/codex_datas' }]);
    expect(state.activeProjectId).toBe('/tmp/codex_datas');
  });

  it('does not duplicate existing project paths', () => {
    const first = addProject({ projects: [], activeProjectId: undefined }, '/tmp/codex_datas');
    const second = addProject(first, '/tmp/codex_datas');

    expect(second.projects).toHaveLength(1);
    expect(second.activeProjectId).toBe('/tmp/codex_datas');
  });

  it('removes a project and selects the nearest remaining project', () => {
    const state = {
      projects: [
        { id: '/tmp/a', name: 'a', path: '/tmp/a' },
        { id: '/tmp/b', name: 'b', path: '/tmp/b' }
      ],
      activeProjectId: '/tmp/a'
    };

    const next = removeProject(state, '/tmp/a');

    expect(next.projects.map((project) => project.id)).toEqual(['/tmp/b']);
    expect(next.activeProjectId).toBe('/tmp/b');
  });

  it('builds a title from the last path segment', () => {
    expect(titleForPath('/Users/mac/Desktop/codex_datas')).toBe('codex_datas');
  });

  it('builds a title from a Windows path segment', () => {
    expect(titleForPath('C:\\Users\\alice\\Desktop\\mywebsite')).toBe('mywebsite');
  });
});
