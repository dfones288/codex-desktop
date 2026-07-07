import { execFile } from 'node:child_process';
import { buildChildProcessEnv, buildPackagedAppPath as buildPackagedPath } from './processEnv.js';
import { resolveCodexCommand } from './codexLocator.js';
import type { CodexBootstrapStatus, CodexInstallLogEvent } from '../shared/types.js';

export interface CommandAvailability {
  codexInstalled: boolean;
  brewInstalled: boolean;
  wingetInstalled: boolean;
}

export interface InstallStep {
  label: string;
  command: string;
  args: string[];
}

export async function getCodexBootstrapStatus(): Promise<CodexBootstrapStatus> {
  const availability = await detectCommandAvailability(process.platform);
  return {
    installed: availability.codexInstalled,
    platform: process.platform,
    missing: availability.codexInstalled ? [] : ['Codex CLI'],
    canInstall: buildCodexInstallPlan(process.platform, availability).length > 0
  };
}

export async function installCodexCli(onLog?: (event: CodexInstallLogEvent) => void): Promise<CodexBootstrapStatus> {
  const availability = await detectCommandAvailability(process.platform);
  const plan = buildCodexInstallPlan(process.platform, availability);
  if (plan.length === 0) return getCodexBootstrapStatus();

  for (const step of plan) {
    onLog?.({ level: 'info', message: `${step.label}: ${step.command} ${step.args.join(' ')}` });
    await runInstallStep(step, onLog);
  }

  const status = await getCodexBootstrapStatus();
  onLog?.({ level: status.installed ? 'success' : 'error', message: status.installed ? 'Codex CLI installed successfully.' : 'Codex CLI installation finished, but codex was not found on PATH.' });
  return status;
}

export async function detectCommandAvailability(platform: NodeJS.Platform): Promise<CommandAvailability> {
  const codexInstalled = Boolean(await resolveCodexCommand(platform));
  const brewInstalled = platform === 'darwin' || platform === 'linux' ? await commandExists('brew', ['--version'], platform) : false;
  const wingetInstalled = platform === 'win32' ? await commandExists('winget', ['--version'], platform) : false;
  return { codexInstalled, brewInstalled, wingetInstalled };
}

export function buildCodexInstallPlan(platform: NodeJS.Platform, availability: CommandAvailability): InstallStep[] {
  if (availability.codexInstalled) return [];
  const steps: InstallStep[] = [];

  if (!availability.codexInstalled) {
    steps.push({ label: 'Install Codex CLI', command: 'npm', args: ['install', '-g', '@openai/codex'] });
  }

  return steps;
}

export function buildPackagedAppPath(platform: NodeJS.Platform, currentPath = process.env.PATH || '', home = requireHome()): string {
  return buildPackagedPath({ platform, path: currentPath, home });
}

function requireHome(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}

async function commandExists(command: string, args: string[], platform: NodeJS.Platform): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(command, args, { timeout: 8000, env: buildChildProcessEnv({ platform }) }, (error) => {
        if (error) reject(error);
        else resolve();
      });
      child.on('error', reject);
    });
    return true;
  } catch {
    return false;
  }
}

function runInstallStep(step: InstallStep, onLog?: (event: CodexInstallLogEvent) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(step.command, step.args, { maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
      if (stdout.trim()) onLog?.({ level: 'info', message: stdout.trim() });
      if (stderr.trim()) onLog?.({ level: error ? 'error' : 'info', message: stderr.trim() });
      if (error) reject(error);
      else resolve();
    });
    child.on('error', reject);
  });
}
