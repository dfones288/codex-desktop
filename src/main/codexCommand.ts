import { buildChildProcessEnv, type PackagedPathOptions } from './processEnv.js';
import type { PermissionMode, ReasoningEffort } from '../shared/types.js';

export const DEFAULT_CODEX_MODEL = 'gpt-5.5';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'high';
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'default';

export interface CodexExecSpawnRequest {
  cwd: string;
  prompt: string;
  command?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  permissionMode?: PermissionMode;
  webSearch?: boolean;
  codexConversationId?: string;
}

export interface CodexExecSpawnOptions {
  file: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export function normalizeCodexCommand(command?: string): string {
  if (command === undefined) {
    return 'codex';
  }

  const normalized = command.trim();
  if (normalized.length === 0) {
    throw new Error('Codex command cannot be empty');
  }

  return normalized;
}

export function buildCodexExecSpawnOptions(request: CodexExecSpawnRequest, envOptions: PackagedPathOptions = {}): CodexExecSpawnOptions {
  const command = normalizeCodexCommand(request.command);
  const model = request.model?.trim() || DEFAULT_CODEX_MODEL;
  const reasoningEffort = codexCliReasoningEffort(request.reasoningEffort || DEFAULT_REASONING_EFFORT);
  const permissionMode = request.permissionMode || DEFAULT_PERMISSION_MODE;
  const baseEnv = buildChildProcessEnv(envOptions);
  const env = {
    ...baseEnv,
    TERM: !baseEnv.TERM || baseEnv.TERM === 'dumb' ? 'xterm-256color' : baseEnv.TERM,
    COLORTERM: baseEnv.COLORTERM || 'truecolor'
  };

  const resumeArgs = [
    '--json',
    '--skip-git-repo-check',
    '-m',
    model,
    '-c',
    `model_reasoning_effort="${reasoningEffort}"`,
    ...resumePermissionArgs(permissionMode)
  ];

  if (request.codexConversationId) {
    const args = [
      'exec',
      'resume',
      ...resumeArgs,
      request.codexConversationId,
      request.prompt
    ];
    return {
      ...wrapCodexCommandForPlatform(command, args, envOptions.platform),
      cwd: request.cwd,
      env
    };
  }

  const args = [
    'exec',
    '--json',
    '--color',
    'never',
    '--skip-git-repo-check',
    '-m',
    model,
    '-c',
    `model_reasoning_effort="${reasoningEffort}"`,
    ...permissionArgs(permissionMode),
    ...(request.webSearch ? ['--search'] : []),
    '-C',
    request.cwd,
    request.prompt
  ];
  return {
    ...wrapCodexCommandForPlatform(command, args, envOptions.platform),
    cwd: request.cwd,
    env
  };
}

export function wrapCodexCommandForPlatform(command: string, args: string[], platform: NodeJS.Platform = process.platform): Pick<CodexExecSpawnOptions, 'file' | 'args'> {
  if (platform === 'win32' && shouldRunThroughCmd(command)) {
    return {
      file: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'call', normalizeWindowsCodexShim(command), ...args]
    };
  }
  return { file: command, args };
}

export function isWindowsCommandShim(command: string): boolean {
  return /\.(?:cmd|bat|ps1)$/i.test(command.trim());
}

function shouldRunThroughCmd(command: string): boolean {
  const normalized = command.trim();
  return normalized === 'codex' || isWindowsCommandShim(normalized);
}

function normalizeWindowsCodexShim(command: string): string {
  return command.trim().replace(/\.ps1$/i, '.cmd');
}

export function codexCliReasoningEffort(reasoningEffort: ReasoningEffort): string {
  return reasoningEffort === 'extra-high' ? 'xhigh' : reasoningEffort;
}

function permissionArgs(permissionMode: PermissionMode): string[] {
  switch (permissionMode) {
    case 'default':
      return ['-s', 'workspace-write'];
    case 'full-access':
      return ['--dangerously-bypass-approvals-and-sandbox'];
  }
}

function resumePermissionArgs(permissionMode: PermissionMode): string[] {
  if (permissionMode === 'full-access') {
    return ['--dangerously-bypass-approvals-and-sandbox'];
  }
  return [];
}
