import os from 'node:os';
import path from 'node:path';

export interface PackagedPathOptions {
  platform?: NodeJS.Platform;
  path?: string;
  home?: string;
}

const discoveredPathEntries: string[] = [];

export function rememberDiscoveredPath(pathValue: string, platform: NodeJS.Platform = process.platform): void {
  const delimiter = platform === 'win32' ? ';' : ':';
  for (const entry of pathValue.split(delimiter).map((item) => item.trim()).filter(Boolean)) {
    if (!discoveredPathEntries.includes(entry)) discoveredPathEntries.push(entry);
  }
}

export function buildPackagedAppPath(options: PackagedPathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const currentPath = options.path ?? process.env.PATH ?? '';
  const home = options.home ?? os.homedir();
  const delimiter = platform === 'win32' ? ';' : ':';
  const additions = platform === 'win32'
    ? [
        path.win32.join(home, '.codex', 'bin'),
        path.win32.join(home, 'AppData', 'Roaming', 'npm'),
        path.win32.join(home, 'AppData', 'Local', 'Programs', 'nodejs')
      ]
    : [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        path.posix.join(home, '.local', 'bin'),
        path.posix.join(home, '.codex', 'bin')
      ];
  return [...new Set([...currentPath.split(delimiter).filter(Boolean), ...discoveredPathEntries, ...additions])].join(delimiter);
}

export function buildChildProcessEnv(options: PackagedPathOptions = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: buildPackagedAppPath(options)
  };
}
