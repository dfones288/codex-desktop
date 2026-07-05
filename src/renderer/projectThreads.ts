import type { CodexSession, CodexThreadHistory } from '../shared/types.js';

export type ProjectThreadRow =
  | { kind: 'new-thread'; projectId: string; active: boolean }
  | { kind: 'session'; projectId: string; session: CodexSession; title: string; active: boolean; running: boolean }
  | { kind: 'history'; projectId: string; history: CodexThreadHistory; active: boolean; running: boolean };

interface ProjectThreadRowsInput {
  projectId: string;
  activeProjectId?: string;
  activeConversationId?: string;
  activeSessionId?: string;
  hasDraftSession: boolean;
  expandedProjectIds: ReadonlySet<string>;
  histories: CodexThreadHistory[];
  sessions?: CodexSession[];
}

export function toggleExpandedProject(current: ReadonlySet<string>, projectId: string): Set<string> {
  const next = new Set(current);
  if (next.has(projectId)) next.delete(projectId);
  else next.add(projectId);
  return next;
}

export function ensureExpandedProject(current: ReadonlySet<string>, projectId: string): Set<string> {
  return new Set(current).add(projectId);
}

export function removeExpandedProject(current: ReadonlySet<string>, projectId: string): Set<string> {
  const next = new Set(current);
  next.delete(projectId);
  return next;
}

export function reconcileExpandedProjects(current: ReadonlySet<string>, projectIds: string[], fallbackProjectId?: string): Set<string> {
  const knownProjectIds = new Set(projectIds);
  const next = new Set([...current].filter((projectId) => knownProjectIds.has(projectId)));
  if (fallbackProjectId) next.add(fallbackProjectId);
  return next;
}

export function getProjectThreadRows(input: ProjectThreadRowsInput): ProjectThreadRow[] {
  if (!input.expandedProjectIds.has(input.projectId)) return [];

  const isActiveProject = input.projectId === input.activeProjectId;
  const sessions = input.sessions ?? [];
  const sessionsByConversationId = new Map(
    sessions
      .filter((session) => session.codexConversationId)
      .map((session) => [session.codexConversationId!, session])
  );
  const representedSessionIds = new Set<string>();
  const historyRows = input.histories.map((history) => {
    const matchingSession = sessionsByConversationId.get(history.id);
    if (matchingSession) representedSessionIds.add(matchingSession.id);
    return {
      kind: 'history' as const,
      projectId: input.projectId,
      history,
      active: isActiveProject && (input.activeConversationId === history.id || Boolean(matchingSession && input.activeSessionId === matchingSession.id)),
      running: matchingSession?.status === 'running'
    };
  });

  const sessionRows = sessions
    .filter((session) => !representedSessionIds.has(session.id))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((session) => ({
      kind: 'session' as const,
      projectId: input.projectId,
      session,
      title: sessionTitle(session),
      active: isActiveProject && input.activeSessionId === session.id,
      running: session.status === 'running'
    }));

  return [
    { kind: 'new-thread', projectId: input.projectId, active: isActiveProject && !input.hasDraftSession },
    ...sessionRows,
    ...historyRows
  ];
}

function sessionTitle(session: CodexSession): string {
  return session.messages
    .find((message) => message.role === 'user')
    ?.text.trim()
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 42) || 'New thread';
}
