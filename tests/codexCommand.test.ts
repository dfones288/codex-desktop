import { describe, expect, it } from 'vitest';
import { buildCodexExecSpawnOptions, normalizeCodexCommand } from '../src/main/codexCommand.js';

describe('normalizeCodexCommand', () => {
  it('uses codex when no override is provided', () => {
    expect(normalizeCodexCommand()).toBe('codex');
  });

  it('trims an override command', () => {
    expect(normalizeCodexCommand('  /usr/local/bin/codex  ')).toBe('/usr/local/bin/codex');
  });

  it('rejects an empty override command', () => {
    expect(() => normalizeCodexCommand('   ')).toThrow('Codex command cannot be empty');
  });
});

describe('buildCodexExecSpawnOptions', () => {
  it('starts a real codex exec run with gpt-5.5 by default', () => {
    const options = buildCodexExecSpawnOptions({ cwd: '/tmp/demo', prompt: '你好' });

    expect(options.file).toBe('codex');
    expect(options.args).toEqual([
      'exec',
      '--json',
      '--color',
      'never',
      '--skip-git-repo-check',
      '-m',
      'gpt-5.5',
      '-c',
      'model_reasoning_effort="high"',
      '-s',
      'workspace-write',
      '-C',
      '/tmp/demo',
      '你好'
    ]);
    expect(options.cwd).toBe('/tmp/demo');
    expect(options.env.TERM).toBe('xterm-256color');
  });

  it('resumes a prior codex exec session when session id is known', () => {
    const options = buildCodexExecSpawnOptions({ cwd: '/tmp/demo', prompt: '继续', codexConversationId: 'abc-123' });

    expect(options.args).toEqual([
      'exec',
      'resume',
      '--json',
      '--skip-git-repo-check',
      '-m',
      'gpt-5.5',
      '-c',
      'model_reasoning_effort="high"',
      'abc-123',
      '继续'
    ]);
  });

  it('allows callers to override model, reasoning, permission, and web search', () => {
    const options = buildCodexExecSpawnOptions({
      cwd: '/tmp/demo',
      prompt: 'test',
      model: 'gpt-5.2',
      reasoningEffort: 'low',
      permissionMode: 'full-access',
      webSearch: true
    });

    expect(options.args).toContain('gpt-5.2');
    expect(options.args).toContain('model_reasoning_effort="low"');
    expect(options.args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(options.args).toContain('--search');
  });

  it('passes selected model and reasoning into resumed codex exec sessions', () => {
    const options = buildCodexExecSpawnOptions({
      cwd: '/tmp/demo',
      prompt: 'continue with this model',
      codexConversationId: 'session-456',
      model: 'o4-mini',
      reasoningEffort: 'medium'
    });

    expect(options.args).toContain('o4-mini');
    expect(options.args).toContain('model_reasoning_effort="medium"');
  });

  it('maps extra-high UI reasoning to the codex CLI xhigh value', () => {
    const options = buildCodexExecSpawnOptions({
      cwd: '/tmp/demo',
      prompt: 'deep work',
      reasoningEffort: 'extra-high'
    });

    expect(options.args).toContain('model_reasoning_effort="xhigh"');
  });

  it('uses the packaged app PATH for codex exec on macOS and Windows', () => {
    const macOptions = buildCodexExecSpawnOptions({ cwd: '/tmp/demo', prompt: '你好' }, { platform: 'darwin', path: '/usr/bin:/bin', home: '/Users/alice' });
    expect(macOptions.env.PATH?.split(':')).toEqual(expect.arrayContaining(['/opt/homebrew/bin', '/Users/alice/.codex/bin']));

    const winOptions = buildCodexExecSpawnOptions({ cwd: String.raw`C:\demo`, prompt: 'hi' }, { platform: 'win32', path: String.raw`C:\Windows\System32`, home: String.raw`C:\Users\Alice` });
    expect(winOptions.env.PATH).toContain(String.raw`C:\Users\Alice\.codex\bin`);
  });

  it('runs Windows npm .cmd shims through cmd.exe', () => {
    const options = buildCodexExecSpawnOptions({
      cwd: String.raw`C:\demo`,
      prompt: 'hi',
      command: String.raw`C:\Users\Alice\AppData\Roaming\npm\codex.cmd`
    }, { platform: 'win32', path: String.raw`C:\Windows\System32`, home: String.raw`C:\Users\Alice` });

    expect(options.file).toBe('cmd.exe');
    expect(options.args.slice(0, 5)).toEqual([
      '/d',
      '/s',
      '/c',
      'call',
      String.raw`C:\Users\Alice\AppData\Roaming\npm\codex.cmd`
    ]);
    expect(options.args).toContain('exec');
    expect(options.args).toContain('hi');
  });

  it('runs Windows PATH-resolved codex commands through cmd.exe', () => {
    const options = buildCodexExecSpawnOptions({
      cwd: String.raw`C:\demo`,
      prompt: 'hi',
      command: 'codex'
    }, { platform: 'win32', path: String.raw`C:\Windows\System32`, home: String.raw`C:\Users\Alice` });

    expect(options.file).toBe('cmd.exe');
    expect(options.args.slice(0, 5)).toEqual(['/d', '/s', '/c', 'call', 'codex']);
  });

  it('normalizes Windows PowerShell npm shims to the .cmd shim', () => {
    const options = buildCodexExecSpawnOptions({
      cwd: String.raw`C:\demo`,
      prompt: 'hi',
      command: String.raw`C:\Users\Alice\AppData\Roaming\npm\codex.ps1`
    }, { platform: 'win32', path: String.raw`C:\Windows\System32`, home: String.raw`C:\Users\Alice` });

    expect(options.file).toBe('cmd.exe');
    expect(options.args[4]).toBe(String.raw`C:\Users\Alice\AppData\Roaming\npm\codex.cmd`);
  });
});
