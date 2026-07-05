import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { buildCodexExecSpawnOptions } from './codexCommand.js';
import { extractCodexErrorText, extractCodexEventText, extractCodexProcessText, extractConversationId, parseJsonLine } from './codexEvents.js';
import { loadCodexHistoryMessages } from './codexHistory.js';
import { resolveCodexCommand } from './codexLocator.js';
import { SessionStore } from './sessionStore.js';
import type { CodexExitEvent, CodexOutputEvent, CodexSession, ResumeSessionRequest, SendInputRequest, StartSessionRequest, StopSessionRequest } from '../shared/types.js';

interface ExecManagerEvents {
  output: [CodexOutputEvent];
  exit: [CodexExitEvent];
}

type TypedEventEmitter = EventEmitter & {
  on<K extends keyof ExecManagerEvents>(eventName: K, listener: (...args: ExecManagerEvents[K]) => void): TypedEventEmitter;
  off<K extends keyof ExecManagerEvents>(eventName: K, listener: (...args: ExecManagerEvents[K]) => void): TypedEventEmitter;
  emit<K extends keyof ExecManagerEvents>(eventName: K, ...args: ExecManagerEvents[K]): boolean;
};

export class CodexExecManager {
  private readonly processes = new Map<string, ChildProcess>();
  private readonly emitter = new EventEmitter() as TypedEventEmitter;

  constructor(private readonly sessions: SessionStore) {}

  on<K extends keyof ExecManagerEvents>(eventName: K, listener: (...args: ExecManagerEvents[K]) => void): () => void {
    this.emitter.on(eventName, listener);
    return () => this.emitter.off(eventName, listener);
  }

  start(request: StartSessionRequest): CodexSession {
    this.assertProjectDirectory(request.cwd);
    return this.sessions.create(request.cwd, request.model, request.reasoningEffort, request.permissionMode, request.webSearch);
  }

  async resume(request: ResumeSessionRequest): Promise<CodexSession> {
    this.assertProjectDirectory(request.cwd);
    const historyMessages = request.filePath ? await loadCodexHistoryMessages(request.filePath).catch(() => []) : [];
    if (historyMessages.length > 0) {
      return this.sessions.createFromHistoryMessages(request.cwd, request.codexConversationId, historyMessages, request.model, request.reasoningEffort, request.permissionMode);
    }
    return this.sessions.createFromHistory(request.cwd, request.codexConversationId, request.title, request.model, request.reasoningEffort, request.permissionMode);
  }

  async sendInput(request: SendInputRequest): Promise<void> {
    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${request.sessionId}`);
    }
    if (session.status === 'running') {
      throw new Error('Codex is already running for this session');
    }

    const prompt = request.input.trim();
    if (!prompt) {
      throw new Error('Prompt cannot be empty');
    }

    if (!request.skipUserAppend) {
      this.sessions.appendMessage(session.id, 'user', prompt);
    }
    this.sessions.updateStatus(session.id, 'running');

    const spawnOptions = buildCodexExecSpawnOptions({
      cwd: session.cwd,
      prompt,
      command: await resolveCodexCommand() || 'codex',
      model: request.model || session.model,
      reasoningEffort: request.reasoningEffort || session.reasoningEffort,
      permissionMode: request.permissionMode || session.permissionMode,
      webSearch: request.webSearch ?? session.webSearch,
      codexConversationId: session.codexConversationId
    });

    const child = spawn(spawnOptions.file, spawnOptions.args, {
      cwd: spawnOptions.cwd,
      env: spawnOptions.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.processes.set(session.id, child);

    let stdoutBuffer = '';
    let stderrBuffer = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer = this.consumeStdout(session.id, stdoutBuffer + chunk.toString('utf8'));
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderrBuffer += text;
      if (!isIgnorableStderr(text)) {
        this.emitOutput(session.id, text, true);
      }
    });

    child.on('error', (error) => {
      this.processes.delete(session.id);
      const message = error instanceof Error ? error.message : String(error);
      this.sessions.updateStatus(session.id, 'error', message);
      this.sessions.appendMessage(session.id, 'system', `Codex failed to start: ${message}`);
      this.emitter.emit('exit', { sessionId: session.id, status: 'error', error: message, session: this.sessions.get(session.id) });
    });

    child.on('close', (exitCode, signal) => {
      this.processes.delete(session.id);
      stdoutBuffer = this.consumeStdout(session.id, `${stdoutBuffer}\n`);

      if (exitCode === 0) {
        const completedSession = this.sessions.markTurnComplete(session.id, exitCode ?? undefined);
        this.emitter.emit('exit', { sessionId: session.id, exitCode: exitCode ?? undefined, signal: signal ?? undefined, status: 'idle', session: completedSession });
        return;
      }

      const error = stderrBuffer.trim() || `Codex exited with code ${exitCode ?? 'unknown'}`;
      this.sessions.updateStatus(session.id, 'error', error);
      this.sessions.appendMessage(session.id, 'system', error);
      this.emitter.emit('exit', { sessionId: session.id, exitCode: exitCode ?? undefined, signal: signal ?? undefined, status: 'error', error, session: this.sessions.get(session.id) });
    });
  }

  stop(request: StopSessionRequest): void {
    const child = this.processes.get(request.sessionId);
    if (!child) {
      return;
    }

    child.kill('SIGTERM');
    this.processes.delete(request.sessionId);
    const completedSession = this.sessions.markTurnComplete(request.sessionId);
    this.emitter.emit('exit', { sessionId: request.sessionId, status: 'idle', session: completedSession });
  }

  private consumeStdout(sessionId: string, buffer: string): string {
    const lines = buffer.split(/\r?\n/);
    const remainder = lines.pop() ?? '';

    for (const line of lines) {
      const event = parseJsonLine(line);
      if (!event) {
        if (line.trim()) {
          this.emitOutput(sessionId, `${line}\n`);
        }
        continue;
      }

      const codexConversationId = extractConversationId(event);
      if (codexConversationId) {
        this.sessions.setCodexConversationId(sessionId, codexConversationId);
      }

      const errorText = extractCodexErrorText(event);
      if (errorText) {
        this.emitOutput(sessionId, errorText, true);
        continue;
      }

      const processText = extractCodexProcessText(event);
      if (processText) {
        this.emitOutput(sessionId, processText, true);
      }

      const text = extractCodexEventText(event);
      if (text) {
        this.emitOutput(sessionId, text);
      }
    }

    return remainder;
  }

  private emitOutput(sessionId: string, chunk: string, system = false): void {
    if (!chunk) {
      return;
    }

    if (system) {
      this.sessions.appendMessage(sessionId, 'system', chunk);
    } else {
      this.sessions.appendToLastCodexMessage(sessionId, chunk);
    }
    this.emitter.emit('output', { sessionId, chunk, role: system ? 'system' : 'codex' });
  }

  private assertProjectDirectory(cwd: string): void {
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      throw new Error(`Project directory does not exist: ${cwd}`);
    }
  }
}

function isIgnorableStderr(text: string): boolean {
  return text.trim() === 'Reading additional input from stdin...';
}
