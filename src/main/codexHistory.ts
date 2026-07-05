import { homedir } from 'node:os';
import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extractCodexErrorText, extractCodexProcessText } from './codexEvents.js';
import type { CodexProjectCandidate, SessionMessage } from '../shared/types.js';

interface JsonObject { [key: string]: unknown }

export interface CodexThreadHistory {
  id: string;
  cwd: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  filePath: string;
}

export async function listCodexHistories(): Promise<CodexThreadHistory[]> {
  const root = path.join(homedir(), '.codex', 'sessions');
  const files = await findJsonlFiles(root).catch(() => []);
  const histories = await Promise.all(files.map(async (file) => parseSessionHistoryLines(file, (await readFile(file, 'utf8')).split(/\r?\n/))));
  return histories
    .filter((history): history is CodexThreadHistory => Boolean(history))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function listCodexProjectCandidates(): Promise<CodexProjectCandidate[]> {
  const histories = await listCodexHistories();
  const candidates = projectCandidatesFromHistories(histories);
  const existing = await Promise.all(candidates.map(async (candidate) => {
    const info = await stat(candidate.path).catch(() => undefined);
    return info?.isDirectory() ? candidate : undefined;
  }));
  return existing.filter((candidate): candidate is CodexProjectCandidate => Boolean(candidate));
}

export function projectCandidatesFromHistories(histories: CodexThreadHistory[]): CodexProjectCandidate[] {
  const byPath = new Map<string, CodexProjectCandidate>();
  for (const history of histories) {
    const resolvedPath = normalizePath(history.cwd);
    const current = byPath.get(resolvedPath);
    if (!current) {
      byPath.set(resolvedPath, {
        id: resolvedPath,
        name: titleForProjectPath(resolvedPath),
        path: resolvedPath,
        lastUsedAt: history.updatedAt,
        threadCount: 1
      });
      continue;
    }
    current.threadCount += 1;
    if (Date.parse(history.updatedAt) > Date.parse(current.lastUsedAt)) {
      current.lastUsedAt = history.updatedAt;
    }
  }
  return [...byPath.values()].sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt));
}

export async function listCodexHistoriesByCwd(cwd: string): Promise<CodexThreadHistory[]> {
  const histories = await listCodexHistories();
  return histories.filter((history) => normalizePath(history.cwd) === normalizePath(cwd));
}

export async function loadCodexHistoryMessages(filePath: string): Promise<SessionMessage[]> {
  return parseSessionMessagesLines((await readFile(filePath, 'utf8')).split(/\r?\n/));
}

export function parseSessionHistoryLines(filePath: string, lines: string[]): CodexThreadHistory | undefined {
  let id: string | undefined;
  let cwd: string | undefined;
  let createdAt: string | undefined;
  let updatedAt: string | undefined;
  let title: string | undefined;

  for (const line of lines) {
    const event = parseJson(line);
    if (!event) continue;
    const timestamp = stringValue(event.timestamp);
    if (timestamp) updatedAt = timestamp;

    if (event.type === 'session_meta') {
      const payload = objectValue(event.payload);
      id = stringValue(payload?.id) || id;
      cwd = stringValue(payload?.cwd) || cwd;
      createdAt = stringValue(payload?.timestamp) || timestamp || createdAt;
    }

    const payload = objectValue(event.payload);
    if (!title && payload?.type === 'user_message') {
      title = cleanTitle(stringValue(payload.message));
    }

    if (!title && event.type === 'response_item') {
      const payloadType = stringValue(payload?.type);
      const role = stringValue(payload?.role);
      if (payloadType === 'message' && role === 'user') {
        title = cleanTitle(extractContentText(payload?.content));
      }
    }
  }

  if (!id || !cwd) return undefined;
  return {
    id,
    cwd,
    title: title || 'New thread',
    createdAt: createdAt || updatedAt || new Date(0).toISOString(),
    updatedAt: updatedAt || createdAt || new Date(0).toISOString(),
    filePath
  };
}

export function parseSessionMessagesLines(lines: string[]): SessionMessage[] {
  const messages: SessionMessage[] = [];

  for (const line of lines) {
    const event = parseJson(line);
    if (!event) continue;
    const createdAt = stringValue(event.timestamp) || new Date(0).toISOString();
    const payload = objectValue(event.payload);
    if (!payload) continue;

    if (event.type === 'event_msg') {
      const payloadType = stringValue(payload.type);
      if (payloadType === 'user_message') {
        appendHistoryMessage(messages, 'user', stringValue(payload.message), createdAt);
      } else if (payloadType === 'agent_message') {
        appendHistoryMessage(messages, 'codex', stringValue(payload.message), createdAt);
      }
      continue;
    }

    if (event.type !== 'response_item') continue;

    const errorText = extractCodexErrorText(payload);
    if (errorText) {
      appendHistoryMessage(messages, 'system', errorText, createdAt);
      continue;
    }

    const processText = extractCodexProcessText(payload);
    if (processText) appendHistoryMessage(messages, 'system', processText, createdAt);

    const payloadType = stringValue(payload.type);
    const role = stringValue(payload.role);
    if (payloadType !== 'message') continue;

    const text = extractContentText(payload.content);
    if (role === 'user') {
      appendHistoryMessage(messages, 'user', text, createdAt);
    } else if (role === 'assistant') {
      appendHistoryMessage(messages, 'codex', text, createdAt);
    }
  }

  return messages;
}

export function relativeTimeLabel(iso: string, now = new Date()): string {
  const deltaMs = Math.max(0, now.getTime() - Date.parse(iso));
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function appendHistoryMessage(messages: SessionMessage[], role: SessionMessage['role'], text: string | undefined, createdAt: string): void {
  const cleaned = role === 'system' ? text?.trim() : cleanMessageText(text);
  if (!cleaned) return;
  const last = messages.at(-1);
  if (last?.role === role) {
    if (isDuplicateAdjacentText(last.text, cleaned)) return;
    last.text = joinMessageText(last.text, cleaned);
    return;
  }
  messages.push({
    id: `history-${messages.length + 1}`,
    role,
    text: cleaned,
    createdAt
  });
}

function cleanMessageText(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw || isContextNoise(raw)) return undefined;
  return raw;
}

function joinMessageText(current: string, next: string): string {
  if (current.endsWith('\n') || next.startsWith('\n')) return `${current}${next}`;
  return `${current}\n\n${next}`;
}

function isDuplicateAdjacentText(current: string, next: string): boolean {
  if (current.trim() === next.trim()) return true;
  if (current.includes('<image ') && normalizeDuplicateText(current).endsWith(normalizeDuplicateText(next))) return true;
  const currentParts = current.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return currentParts.at(-1) === next.trim();
}

function normalizeDuplicateText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function findJsonlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return findJsonlFiles(fullPath);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) return [fullPath];
    return [];
  }));
  return nested.flat();
}

function normalizePath(value: string): string {
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return path.win32.normalize(value);
  }
  return path.resolve(value);
}

function cleanTitle(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw || isContextNoise(raw)) return undefined;
  const title = raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!title || isContextNoise(title)) return undefined;
  return title.slice(0, 42);
}

function isContextNoise(value: string): boolean {
  return (
    value.includes('<environment_context>') ||
    value.startsWith('# AGENTS.md instructions') ||
    value.startsWith('<permissions instructions>') ||
    value.startsWith('<collaboration_mode>') ||
    value.startsWith('<skills_instructions>')
  );
}

function parseJson(line: string): JsonObject | undefined {
  if (!line.trim()) return undefined;
  try {
    const parsed = JSON.parse(line) as unknown;
    return objectValue(parsed);
  } catch {
    return undefined;
  }
}

function objectValue(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function extractContentText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  return content.map((item) => stringValue(objectValue(item)?.text)).filter(Boolean).join('\n') || undefined;
}

function titleForProjectPath(value: string): string {
  return value.split(/[\\/]+/).filter(Boolean).at(-1) || value;
}