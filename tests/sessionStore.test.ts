import { describe, expect, it } from 'vitest';
import { SessionStore } from '../src/main/sessionStore.js';

describe('SessionStore', () => {
  it('creates an idle session for a project path with gpt-5.5', () => {
    const store = new SessionStore(() => '2026-06-20T00:00:00.000Z', () => 'session-1');

    const session = store.create('/tmp/project');

    expect(session).toMatchObject({
      id: 'session-1',
      cwd: '/tmp/project',
      status: 'idle',
      model: 'gpt-5.5',
      messages: []
    });
  });

  it('stores the codex conversation id used for resume continuity', () => {
    const store = new SessionStore(() => '2026-06-20T00:00:00.000Z', () => 'session-1');
    const session = store.create('/tmp/project');

    store.setCodexConversationId(session.id, 'codex-session-123');

    expect(store.get(session.id)?.codexConversationId).toBe('codex-session-123');
  });

  it('appends user and codex messages in order', () => {
    const store = new SessionStore(() => '2026-06-20T00:00:00.000Z', (() => {
      let count = 0;
      return () => `id-${++count}`;
    })());
    const session = store.create('/tmp/project');

    store.appendMessage(session.id, 'user', 'build this');
    store.appendMessage(session.id, 'codex', 'working');

    expect(store.get(session.id)?.messages.map((message) => [message.role, message.text])).toEqual([
      ['user', 'build this'],
      ['codex', 'working']
    ]);
  });

  it('marks a session as idle after a completed turn', () => {
    const store = new SessionStore(() => '2026-06-20T00:00:00.000Z', () => 'session-1');
    const session = store.create('/tmp/project');

    store.updateStatus(session.id, 'running');
    store.markTurnComplete(session.id, 0);

    expect(store.get(session.id)?.status).toBe('idle');
    expect(store.get(session.id)?.exitCode).toBe(0);
  });
});
