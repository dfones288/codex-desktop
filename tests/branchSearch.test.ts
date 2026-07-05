import { describe, expect, it } from 'vitest';
import { filterBranches } from '../src/renderer/branchSearch.js';

describe('filterBranches', () => {
  const branches = [
    { name: 'main', current: true },
    { name: 'feature/git-branch-menu', current: false },
    { name: 'bugfix/sidebar-overflow', current: false }
  ];

  it('filters branches case-insensitively by name', () => {
    expect(filterBranches(branches, 'GIT')).toEqual([{ name: 'feature/git-branch-menu', current: false }]);
  });

  it('returns all branches for blank search text', () => {
    expect(filterBranches(branches, '   ')).toEqual(branches);
  });
});
