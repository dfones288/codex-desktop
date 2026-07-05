import { randomUUID } from 'node:crypto';
import { DEFAULT_CODEX_MODEL, DEFAULT_PERMISSION_MODE, DEFAULT_REASONING_EFFORT } from './codexCommand.js';
import type { CodexSession, MessageRole, PermissionMode, ReasoningEffort, SessionMessage, SessionStatus } from '../shared/types.js';

type NowProvider = () => string;
type IdProvider = () => string;

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultId(): string {
  return randomUUID();
}

export class SessionStore {
  private readonly sessions = new Map<string, CodexSession>();

  constructor(
    private readonly now: NowProvider = defaultNow,
    private readonly nextId: IdProvider = defaultId
  ) {}

  create(cwd: string, model = DEFAULT_CODEX_MODEL, reasoningEffort: ReasoningEffort = DEFAULT_REASONING_EFFORT, permissionMode: PermissionMode = DEFAULT_PERMISSION_MODE, webSearch = false): CodexSession {
    const timestamp = this.now();
    const session: CodexSession = {
      id: this.nextId(),
      cwd,
      model,
      reasoningEffort,
      permissionMode,
      webSearch,
      status: 'idle',
      messages: [],
      startedAt: timestamp,
      updatedAt: timestamp
    };
    this.sessions.set(session.id, session);
    return structuredClone(session);
  }

  get(sessionId: string): CodexSession | undefined {
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session) : undefined;
  }

  updateStatus(sessionId: string, status: SessionStatus, error?: string): CodexSession {
    const session = this.requireSession(sessionId);
    session.status = status;
    session.error = error;
    session.updatedAt = this.now();
    return structuredClone(session);
  }

  createFromHistory(cwd: string, codexConversationId: string, title: string, model = DEFAULT_CODEX_MODEL, reasoningEffort: ReasoningEffort = DEFAULT_REASONING_EFFORT, permissionMode: PermissionMode = DEFAULT_PERMISSION_MODE): CodexSession {
    const session = this.create(cwd, model, reasoningEffort, permissionMode, false);
    const stored = this.requireSession(session.id);
    stored.codexConversationId = codexConversationId;
    stored.messages.push({ id: this.nextId(), role: 'user', text: title, createdAt: this.now() });
    return structuredClone(stored);
  }

  createFromHistoryMessages(cwd: string, codexConversationId: string, messages: SessionMessage[], model = DEFAULT_CODEX_MODEL, reasoningEffort: ReasoningEffort = DEFAULT_REASONING_EFFORT, permissionMode: PermissionMode = DEFAULT_PERMISSION_MODE): CodexSession {
    const session = this.create(cwd, model, reasoningEffort, permissionMode, false);
    const stored = this.requireSession(session.id);
    stored.codexConversationId = codexConversationId;
    stored.messages = structuredClone(messages);
    const lastMessage = stored.messages.at(-1);
    if (lastMessage) stored.updatedAt = lastMessage.createdAt;
    return structuredClone(stored);
  }

  setCodexConversationId(sessionId: string, codexConversationId: string): CodexSession {
    const session = this.requireSession(sessionId);
    session.codexConversationId = codexConversationId;
    session.updatedAt = this.now();
    return structuredClone(session);
  }

  appendMessage(sessionId: string, role: MessageRole, text: string): SessionMessage {
    const session = this.requireSession(sessionId);
    const message: SessionMessage = {
      id: this.nextId(),
      role,
      text,
      createdAt: this.now()
    };
    session.messages.push(message);
    session.updatedAt = message.createdAt;
    return structuredClone(message);
  }

  appendToLastCodexMessage(sessionId: string, chunk: string): SessionMessage {
    const session = this.requireSession(sessionId);
    const last = session.messages.at(-1);
    if (last?.role === 'codex') {
      last.text += chunk;
      session.updatedAt = this.now();
      return structuredClone(last);
    }
    return this.appendMessage(sessionId, 'codex', chunk);
  }

  markTurnComplete(sessionId: string, exitCode?: number): CodexSession {
    const session = this.requireSession(sessionId);
    session.status = 'idle';
    session.exitCode = exitCode;
    session.updatedAt = this.now();
    return structuredClone(session);
  }

  private requireSession(sessionId: string): CodexSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return session;
  }
}
