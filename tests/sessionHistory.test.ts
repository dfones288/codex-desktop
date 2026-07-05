import { describe, expect, it } from 'vitest';
import { mergeSessionIntoProjectHistories } from '../src/renderer/sessionHistory.js';
import type { CodexSession, CodexThreadHistory } from '../src/shared/types.js';

const session = (overrides: Partial<CodexSession> = {}): CodexSession => ({
  id: 'ui-session-1',
  cwd: '/tmp/project',
  status: 'idle',
  messages: [
    { id: 'm1', role: 'user', text: '刚刚新开的对话内容，需要留在左侧历史里', createdAt: '2026-06-26T01:00:00.000Z' },
    { id: 'm2', role: 'codex', text: '完成', createdAt: '2026-06-26T01:01:00.000Z' }
  ],
  model: 'gpt-5.5',
  reasoningEffort: 'high',
  permissionMode: 'full-access',
  webSearch: false,
  codexConversationId: 'codex-thread-1',
  startedAt: '2026-06-26T01:00:00.000Z',
  updatedAt: '2026-06-26T01:02:00.000Z',
  ...overrides
});

const history = (id: string): CodexThreadHistory => ({
  id,
  cwd: '/tmp/project',
  title: `History ${id}`,
  createdAt: '2026-06-25T01:00:00.000Z',
  updatedAt: '2026-06-25T01:02:00.000Z',
  filePath: `/tmp/${id}.jsonl`
});

describe('mergeSessionIntoProjectHistories', () => {
  it('keeps a completed new Codex conversation visible before the disk history refresh catches up', () => {
    const merged = mergeSessionIntoProjectHistories([history('old-thread')], session());

    expect(merged.map((item) => item.id)).toEqual(['codex-thread-1', 'old-thread']);
    expect(merged[0]).toMatchObject({
      cwd: '/tmp/project',
      title: '刚刚新开的对话内容，需要留在左侧历史里',
      updatedAt: '2026-06-26T01:02:00.000Z'
    });
  });

  it('does not duplicate the same Codex conversation after disk history appears', () => {
    const diskHistory = { ...history('codex-thread-1'), title: 'Disk title', updatedAt: '2026-06-26T01:03:00.000Z' };
    const merged = mergeSessionIntoProjectHistories([diskHistory], session());

    expect(merged).toEqual([diskHistory]);
  });

  it('does not create a resumable history row without a Codex conversation id', () => {
    expect(mergeSessionIntoProjectHistories([], session({ codexConversationId: undefined }))).toEqual([]);
  });
});
