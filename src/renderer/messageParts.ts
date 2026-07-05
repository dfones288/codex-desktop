export type UserMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; name: string; path: string };

export function splitUserMessageParts(text: string): UserMessagePart[] {
  const parts: UserMessagePart[] = [];
  const pattern = /<image\s+name=\[([^\]]+)\]\s+path="([^"]+)">\s*<\/image>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push({ type: 'text', text: text.slice(cursor, match.index) });
    }
    parts.push({ type: 'image', name: match[1], path: match[2] });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push({ type: 'text', text: text.slice(cursor) });
  }

  return cleanupUserMessageParts(parts.length > 0 ? parts : [{ type: 'text', text }]);
}

function cleanupUserMessageParts(parts: UserMessagePart[]): UserMessagePart[] {
  const cleaned = parts
    .map((part) => {
      if (part.type !== 'text') return part;
      return { type: 'text' as const, text: dedupeTextBlocks(part.text) };
    })
    .filter((part) => part.type === 'image' || part.text.trim().length > 0);

  return dedupeTextParts(cleaned);
}

function dedupeTextBlocks(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => {
      const normalized = block.replace(/\s+/g, ' ');
      if (!normalized) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join('\n\n');
}

function dedupeTextParts(parts: UserMessagePart[]): UserMessagePart[] {
  const seen = new Set<string>();
  return parts.filter((part) => {
    if (part.type === 'image') return true;
    const normalized = part.text.trim().replace(/\s+/g, ' ');
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
