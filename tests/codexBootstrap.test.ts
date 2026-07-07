import { describe, expect, it } from 'vitest';
import { buildCodexInstallPlan, buildPackagedAppPath } from '../src/main/codexBootstrap.js';

describe('buildCodexInstallPlan', () => {
  it('recommends the npm package install command on macOS when Codex CLI is missing', () => {
    expect(buildCodexInstallPlan('darwin', {
      codexInstalled: false,
      brewInstalled: true,
      wingetInstalled: false
    })).toEqual([
      { label: 'Install Codex CLI', command: 'npm', args: ['install', '-g', '@openai/codex'] }
    ]);
  });

  it('recommends the npm package install command on Windows when Codex CLI is missing', () => {
    expect(buildCodexInstallPlan('win32', {
      codexInstalled: false,
      brewInstalled: false,
      wingetInstalled: true
    })).toEqual([
      { label: 'Install Codex CLI', command: 'npm', args: ['install', '-g', '@openai/codex'] }
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
