import { describe, expect, it } from 'vitest';
import { buildGitEnv, parseGitBranches, parseGitNumstat, parseGitPorcelainStatus } from '../src/main/gitBranches.js';

describe('parseGitBranches', () => {
  it('extracts current branch and branch list', () => {
    expect(parseGitBranches('main|*\nfeature/ui|\n')).toEqual({
      current: 'main',
      branches: [
        { name: 'main', current: true },
        { name: 'feature/ui', current: false }
      ]
    });
  });
});

describe('parseGitPorcelainStatus', () => {
  it('counts uncommitted file entries', () => {
    expect(parseGitPorcelainStatus(' M src/app.ts\nA  src/new.ts\n?? notes.md\n')).toBe(3);
  });
});

describe('parseGitNumstat', () => {
  it('totals added and removed line counts while ignoring binary rows', () => {
    expect(parseGitNumstat('244\t0\tsrc/app.ts\n12\t5\tsrc/other.ts\n-\t-\timage.png\n')).toEqual({
      added: 256,
      removed: 5
    });
  });
});

describe('buildGitEnv', () => {
  it('uses the packaged app PATH for git commands', () => {
    const env = buildGitEnv({ platform: 'darwin', path: '/usr/bin:/bin', home: '/Users/alice' });

    expect(env.PATH?.split(':')).toEqual(expect.arrayContaining(['/opt/homebrew/bin', '/Users/alice/.codex/bin']));
  });
});
