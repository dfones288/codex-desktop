import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { wrapCodexCommandForPlatform } from './codexCommand.js';
import { buildChildProcessEnv, rememberDiscoveredPath } from './processEnv.js';

const execFileAsync = promisify(execFile);

let cachedCodexCommand: string | undefined;

export async function resolveCodexCommand(platform: NodeJS.Platform = process.platform): Promise<string | undefined> {
  if (cachedCodexCommand && await commandWorks(cachedCodexCommand, platform)) return cachedCodexCommand;

  if (await commandWorks('codex', platform)) {
    cachedCodexCommand = 'codex';
    return cachedCodexCommand;
  }

  const shellPath = await resolveCodexFromShell(platform);
  if (shellPath && await commandWorks(shellPath, platform)) {
    cachedCodexCommand = shellPath;
    return cachedCodexCommand;
  }

  cachedCodexCommand = undefined;
  return undefined;
}

export function cachedCodexCommandOrDefault(): string {
  return cachedCodexCommand || 'codex';
}

export function resetCodexCommandCacheForTests(): void {
  cachedCodexCommand = undefined;
}

async function commandWorks(command: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    const invocation = wrapCodexCommandForPlatform(command, ['--version'], platform);
    await execFileAsync(invocation.file, invocation.args, { timeout: 8000, env: buildChildProcessEnv({ platform }) });
    return true;
  } catch {
    return false;
  }
}

async function resolveCodexFromShell(platform: NodeJS.Platform): Promise<string | undefined> {
  if (platform === 'win32') return resolveCodexFromWindowsShell(platform);
  return resolveCodexFromPosixShell(platform);
}

async function resolveCodexFromPosixShell(platform: NodeJS.Platform): Promise<string | undefined> {
  const shells = [...new Set([process.env.SHELL, '/bin/zsh', '/bin/bash'].filter(Boolean))] as string[];
  for (const shell of shells) {
    try {
      const { stdout } = await execFileAsync(shell, ['-lic', 'printf "__CODEX_DESKTOP_PATH__%s\\n" "$PATH"; command -v codex'], {
        timeout: 8000,
        env: buildChildProcessEnv({ platform })
      });
      const shellPath = shellPathFromOutput(stdout);
      if (shellPath) rememberDiscoveredPath(shellPath, platform);
      const commandPath = firstExecutablePath(stdout);
      if (commandPath) return commandPath;
    } catch {
      // Try the next shell; GUI apps often need shell startup files to find user installs.
    }
  }
  return undefined;
}

async function resolveCodexFromWindowsShell(platform: NodeJS.Platform): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', 'Write-Output "__CODEX_DESKTOP_PATH__$env:Path"; (Get-Command codex -ErrorAction SilentlyContinue).Source'], {
      timeout: 8000,
      env: buildChildProcessEnv({ platform })
    });
    const shellPath = shellPathFromOutput(stdout);
    if (shellPath) rememberDiscoveredPath(shellPath, platform);
    return firstExecutablePath(stdout);
  } catch {
    return undefined;
  }
}

function shellPathFromOutput(output: string): string | undefined {
  const prefix = '__CODEX_DESKTOP_PATH__';
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length);
}

function firstExecutablePath(output: string): string | undefined {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('/') || /^[A-Za-z]:[\\/]/.test(line) || line.startsWith('\\\\'));
}
