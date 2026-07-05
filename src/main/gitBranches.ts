import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildChildProcessEnv, type PackagedPathOptions } from './processEnv.js';
import type { GitBranchInfo, GitBranchStatus } from '../shared/types.js';

const execFileAsync = promisify(execFile);

export async function listGitBranches(cwd: string): Promise<GitBranchInfo> {
  const [{ stdout: branchOutput }, status] = await Promise.all([
    execFileAsync('git', ['branch', '--format=%(refname:short)|%(HEAD)'], { cwd, env: buildGitEnv() }),
    readGitBranchStatus(cwd)
  ]);
  return { ...parseGitBranches(branchOutput), status };
}

export async function switchGitBranch(cwd: string, branch: string): Promise<GitBranchInfo> {
  await execFileAsync('git', ['switch', branch], { cwd, env: buildGitEnv() });
  return listGitBranches(cwd);
}

export function buildGitEnv(options: PackagedPathOptions = {}): NodeJS.ProcessEnv {
  return buildChildProcessEnv(options);
}

export function parseGitBranches(output: string): GitBranchInfo {
  const branches = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, head] = line.split('|');
      return { name, current: head === '*' };
    });
  return { current: branches.find((branch) => branch.current)?.name || branches[0]?.name || '', branches };
}

async function readGitBranchStatus(cwd: string): Promise<GitBranchStatus> {
  const [{ stdout: statusOutput }, diff] = await Promise.all([
    execFileAsync('git', ['status', '--porcelain'], { cwd, env: buildGitEnv() }).catch(() => ({ stdout: '' })),
    execFileAsync('git', ['diff', '--numstat', 'HEAD', '--'], { cwd, env: buildGitEnv() }).catch(() => ({ stdout: '' }))
  ]);
  return {
    uncommittedFiles: parseGitPorcelainStatus(statusOutput),
    ...parseGitNumstat(diff.stdout)
  };
}

export function parseGitPorcelainStatus(output: string): number {
  return output.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

export function parseGitNumstat(output: string): Pick<GitBranchStatus, 'added' | 'removed'> {
  return output.split(/\r?\n/).reduce(
    (total, line) => {
      const [added, removed] = line.split(/\s+/);
      const addedCount = Number.parseInt(added, 10);
      const removedCount = Number.parseInt(removed, 10);
      if (Number.isFinite(addedCount)) total.added += addedCount;
      if (Number.isFinite(removedCount)) total.removed += removedCount;
      return total;
    },
    { added: 0, removed: 0 }
  );
}
