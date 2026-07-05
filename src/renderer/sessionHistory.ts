import type { CodexSession, CodexThreadHistory } from '../shared/types.js';

export function mergeSessionIntoProjectHistories(histories: CodexThreadHistory[], session: CodexSession): CodexThreadHistory[] {
  const conversationId = session.codexConversationId?.trim();
  if (!conversationId) return histories;
  if (histories.some((history) => history.id === conversationId)) return histories;

  const title = session.messages.find((message) => message.role === 'user')?.text.trim().replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 42) || 'New thread';
  const syntheticHistory: CodexThreadHistory = {
    id: conversationId,
    cwd: session.cwd,
    title,
    createdAt: session.startedAt,
    updatedAt: session.updatedAt,
    filePath: ''
  };

  return [syntheticHistory, ...histories].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function findProjectIdForSession(projects: Array<{ id: string; path: string }>, session: CodexSession): string | undefined {
  const sessionPath = normalizePathForCompare(session.cwd);
  return projects.find((project) => normalizePathForCompare(project.path) === sessionPath)?.id;
}

function normalizePathForCompare(value: string): string {
  return value.replace(/\/+$/, '');
}
