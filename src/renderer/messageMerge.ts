import type { CodexOutputEvent, SessionMessage } from '../shared/types.js';

interface MergeEvent extends Pick<CodexOutputEvent, 'role' | 'chunk'> {
  id: string;
  createdAt: string;
}

export function mergeOutputIntoMessages(messages: SessionMessage[], event: MergeEvent): SessionMessage[] {
  const next = [...messages];
  const last = next.at(-1);

  if (last?.role === event.role && event.role === 'codex') {
    next[next.length - 1] = {
      ...last,
      text: last.text + separatorFor(last.text, event.chunk) + event.chunk
    };
    return next;
  }

  if (last?.role === event.role && event.role === 'system') {
    if (isDuplicateAdjacentActivity(last.text, event.chunk)) {
      return next;
    }
    next[next.length - 1] = {
      ...last,
      text: last.text + event.chunk
    };
    return next;
  }

  next.push({
    id: event.id,
    role: event.role,
    text: event.chunk,
    createdAt: event.createdAt
  });
  return next;
}

function isDuplicateAdjacentActivity(previous: string, chunk: string): boolean {
  const previousParts = previous.split(/\n{1,}/).map((part) => part.trim()).filter(Boolean);
  const chunkParts = chunk.split(/\n{1,}/).map((part) => part.trim()).filter(Boolean);
  if (chunkParts.length === 0) return true;
  const tail = previousParts.slice(-chunkParts.length);
  return tail.length === chunkParts.length && tail.every((part, index) => part === chunkParts[index]);
}

function separatorFor(previous: string, chunk: string): string {
  if (!previous || !chunk) {
    return '';
  }
  if (/\s$/.test(previous) || /^\s/.test(chunk)) {
    return '';
  }
  return '\n\n';
}
