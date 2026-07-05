import { describe, expect, it } from 'vitest';
import { getProjectThreadRows, reconcileExpandedProjects, toggleExpandedProject } from '../src/renderer/projectThreads.js';
import type { CodexSession, CodexThreadHistory } from '../src/shared/types.js';

const history = (id: string, title: string): CodexThreadHistory => ({
  id,
  cwd: `/tmp/${id}`,
  title,
  createdAt: '2026-06-21T01:00:00.000Z',
  updatedAt: '2026-06-21T02:00:00.000Z',
  filePath: `/tmp/${id}.jsonl`
});

const session = (overrides: Partial<CodexSession> & Pick<CodexSession, 'id' | 'cwd'>): CodexSession => ({
  id: overrides.id,
  cwd: overrides.cwd,
  status: overrides.status ?? 'running',
  messages: overrides.messages ?? [{ id: `${overrides.id}-user`, role: 'user', text: 'Implement concurrent sessions', createdAt: '2026-06-21T02:05:00.000Z' }],
  model: 'gpt-5.5',
  reasoningEffort: 'high',
  permissionMode: 'full-access',
  webSearch: false,
  codexConversationId: overrides.codexConversationId,
  exitCode: overrides.exitCode,
  error: overrides.error,
  startedAt: overrides.startedAt ?? '2026-06-21T02:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-06-21T02:05:00.000Z'
});

describe('project thread rows', () => {
  it('keeps multiple projects expanded when toggling independent ids', () => {
    const first = toggleExpandedProject(new Set<string>(), 'project-a');
    const second = toggleExpandedProject(first, 'project-b');

    expect([...second].sort()).toEqual(['project-a', 'project-b']);
  });

  it('shows a project-scoped new thread row for every expanded project', () => {
    const rows = getProjectThreadRows({
      projectId: 'project-b',
      activeProjectId: 'project-a',
      activeConversationId: undefined,
      activeSessionId: undefined,
      hasDraftSession: false,
      expandedProjectIds: new Set(['project-a', 'project-b']),
      histories: [],
      sessions: []
    });

    expect(rows).toEqual([{ kind: 'new-thread', projectId: 'project-b', active: false }]);
  });

  it('keeps known expanded projects while ensuring the fallback project is visible', () => {
    const expanded = reconcileExpandedProjects(new Set(['project-a', 'deleted-project']), ['project-a', 'project-b'], 'project-b');

    expect([...expanded].sort()).toEqual(['project-a', 'project-b']);
  });

  it('only marks the current project history active when conversation ids overlap', () => {
    const rows = getProjectThreadRows({
      projectId: 'project-b',
      activeProjectId: 'project-a',
      activeConversationId: 'shared-thread',
      activeSessionId: undefined,
      hasDraftSession: true,
      expandedProjectIds: new Set(['project-a', 'project-b']),
      histories: [history('shared-thread', 'Other project duplicate id')],
      sessions: []
    });

    expect(rows).toEqual([
      { kind: 'new-thread', projectId: 'project-b', active: false },
      { kind: 'history', projectId: 'project-b', history: history('shared-thread', 'Other project duplicate id'), active: false, running: false }
    ]);
  });


  it('does not mark history rows active when a project new thread is selected', () => {
    const rows = getProjectThreadRows({
      projectId: 'project-a',
      activeProjectId: 'project-a',
      activeConversationId: undefined,
      activeSessionId: undefined,
      hasDraftSession: false,
      expandedProjectIds: new Set(['project-a']),
      histories: [history('thread-1', 'First thread'), history('thread-2', 'Second thread')],
      sessions: []
    });

    expect(rows).toEqual([
      { kind: 'new-thread', projectId: 'project-a', active: true },
      { kind: 'history', projectId: 'project-a', history: history('thread-1', 'First thread'), active: false, running: false },
      { kind: 'history', projectId: 'project-a', history: history('thread-2', 'Second thread'), active: false, running: false }
    ]);
  });

  it('shows a running in-memory session before Codex history exists', () => {
    const runningSession = session({ id: 'session-1', cwd: '/tmp/project-a' });

    const rows = getProjectThreadRows({
      projectId: 'project-a',
      activeProjectId: 'project-a',
      activeConversationId: undefined,
      activeSessionId: 'session-1',
      hasDraftSession: true,
      expandedProjectIds: new Set(['project-a']),
      histories: [],
      sessions: [runningSession]
    });

    expect(rows).toEqual([
      { kind: 'new-thread', projectId: 'project-a', active: false },
      { kind: 'session', projectId: 'project-a', session: runningSession, title: 'Implement concurrent sessions', active: true, running: true }
    ]);
  });

  it('marks a history row as running when a cached session matches its conversation id', () => {
    const runningSession = session({ id: 'session-1', cwd: '/tmp/project-a', codexConversationId: 'thread-1' });
    const thread = history('thread-1', 'Existing thread');

    const rows = getProjectThreadRows({
      projectId: 'project-a',
      activeProjectId: 'project-a',
      activeConversationId: 'thread-1',
      activeSessionId: 'session-1',
      hasDraftSession: true,
      expandedProjectIds: new Set(['project-a']),
      histories: [thread],
      sessions: [runningSession]
    });

    expect(rows).toEqual([
      { kind: 'new-thread', projectId: 'project-a', active: false },
      { kind: 'history', projectId: 'project-a', history: thread, active: true, running: true }
    ]);
  });

  it('does not duplicate a cached session that is already represented by history', () => {
    const runningSession = session({ id: 'session-1', cwd: '/tmp/project-a', codexConversationId: 'thread-1' });

    const rows = getProjectThreadRows({
      projectId: 'project-a',
      activeProjectId: 'project-a',
      activeConversationId: undefined,
      activeSessionId: undefined,
      hasDraftSession: false,
      expandedProjectIds: new Set(['project-a']),
      histories: [history('thread-1', 'Existing thread')],
      sessions: [runningSession]
    });

    expect(rows.filter((row) => row.kind !== 'new-thread')).toHaveLength(1);
  });
});
