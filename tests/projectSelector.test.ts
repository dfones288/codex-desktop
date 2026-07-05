import { describe, expect, it } from 'vitest';
import { projectSelectorRows } from '../src/renderer/projectSelector.js';

describe('projectSelectorRows', () => {
  it('marks the active project among available projects', () => {
    expect(projectSelectorRows([
      { id: 'a', name: 'codex_workplace', path: '/tmp/a' },
      { id: 'b', name: 'codex_datas', path: '/tmp/b' }
    ], 'b')).toEqual([
      { id: 'a', name: 'codex_workplace', path: '/tmp/a', active: false },
      { id: 'b', name: 'codex_datas', path: '/tmp/b', active: true }
    ]);
  });
});
