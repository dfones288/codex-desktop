import { describe, expect, it } from 'vitest';
import { buildCodexInstallPlan, buildPackagedAppPath } from '../src/main/codexBootstrap.js';

describe('buildCodexInstallPlan', () => {
  it('prefers the official macOS shell installer when Codex CLI is missing', () => {
    expect(buildCodexInstallPlan('darwin', {
      codexInstalled: false,
      brewInstalled: true,
      wingetInstalled: false
    })).toEqual([
      { label: 'Install Codex CLI', command: 'bash', args: ['-lc', 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'] }
    ]);
  });

  it('uses the Windows PowerShell installer when Codex CLI is missing', () => {
    expect(buildCodexInstallPlan('win32', {
      codexInstalled: false,
      brewInstalled: false,
      wingetInstalled: true
    })).toEqual([
      { label: 'Install Codex CLI', command: 'powershell', args: ['-ExecutionPolicy', 'ByPass', '-c', 'irm https://chatgpt.com/codex/install.ps1 | iex'] }
    ]);
  });

  it('does nothing when Codex CLI exists, regardless of Git or Node.js', () => {
    expect(buildCodexInstallPlan('darwin', {
      codexInstalled: true,
      brewInstalled: true,
      wingetInstalled: false
    })).toEqual([]);
  });
});


describe('buildPackagedAppPath', () => {
  it('adds common macOS shell install locations for packaged GUI apps', () => {
    const nextPath = buildPackagedAppPath('darwin', '/usr/bin:/bin', '/Users/alice');

    expect(nextPath.split(':')).toEqual(expect.arrayContaining([
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/Users/alice/.local/bin',
      '/Users/alice/.codex/bin'
    ]));
  });

  it('adds Windows user install locations without removing existing PATH', () => {
    const nextPath = buildPackagedAppPath('win32', 'C:\\Windows\\System32', 'C:\\Users\\Alice');

    expect(nextPath).toContain('C:\\Windows\\System32');
    expect(nextPath).toContain('C:\\Users\\Alice\\.codex\\bin');
  });
});
