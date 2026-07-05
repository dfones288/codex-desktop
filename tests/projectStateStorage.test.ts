import { describe, expect, it } from 'vitest';
import { parseStoredProjectState } from '../src/renderer/projectStateStorage.js';

describe('parseStoredProjectState', () => {
  it('does not inject a developer machine project when storage is empty', () => {
    expect(parseStoredProjectState(null)).toEqual({ projects: [], activeProjectId: undefined });
  });

  it('keeps valid stored projects without adding defaults', () => {
    const stored = JSON.stringify({ projects: [{ id: '/tmp/app', name: 'app', path: '/tmp/app' }], activeProjectId: '/tmp/app' });

    expect(parseStoredProjectState(stored)).toEqual({ projects: [{ id: '/tmp/app', name: 'app', path: '/tmp/app' }], activeProjectId: '/tmp/app' });
  });

  it('removes the old bundled icode project that earlier builds wrote into storage', () => {
    const stored = JSON.stringify({
      projects: [
        { id: '/Users/mac/Documents/MangoWork/ai_place/icode', name: 'icode', path: '/Users/mac/Documents/MangoWork/ai_place/icode' }
      ],
      activeProjectId: '/Users/mac/Documents/MangoWork/ai_place/icode'
    });

    expect(parseStoredProjectState(stored)).toEqual({ projects: [], activeProjectId: undefined });
  });

  it('removes Windows-shaped stale icode defaults while keeping real user projects', () => {
    const stored = JSON.stringify({
      projects: [
        { id: 'C:\\Users\\builder\\icode', name: 'icode', path: 'C:\\Users\\builder\\icode' },
        { id: 'D:\\work\\real-app', name: 'real-app', path: 'D:\\work\\real-app' }
      ],
      activeProjectId: 'C:\\Users\\builder\\icode'
    });

    expect(parseStoredProjectState(stored)).toEqual({
      projects: [{ id: 'D:\\work\\real-app', name: 'real-app', path: 'D:\\work\\real-app' }],
      activeProjectId: 'D:\\work\\real-app'
    });
  });
});
