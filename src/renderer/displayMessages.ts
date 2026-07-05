import type { SessionMessage } from '../shared/types.js';

export function visibleTranscriptMessages(messages: SessionMessage[]): SessionMessage[] {
  const visible: SessionMessage[] = [];
  for (const message of messages) {
    const previous = visible.at(-1);
    if (previous?.role === 'user' && message.role === 'user' && normalizedUserText(previous.text) === normalizedUserText(message.text)) {
      continue;
    }
    visible.push(message);
  }
  return visible;
}

function normalizedUserText(text: string): string {
  return text
    .replace(/<image\s+name=\[[^\]]+\]\s+path="[^"]+">\s*<\/image>/g, '<image>')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
