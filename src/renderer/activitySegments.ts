export type ActivitySegment =
  | { type: 'text'; text: string }
  | { type: 'diff'; text: string };

export function normalizeTerminalText(text: string): string {
  return text.replace(/\r/g, '\n');
}

export function splitActivitySegments(text: string): ActivitySegment[] {
  return splitEmbeddedMarkdownSegments(splitRawPatchSegments(splitFencedDiffSegments(normalizeTerminalText(text))));
}

export function diffLineClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'diff-line added';
  if (line.startsWith('-') && !line.startsWith('---')) return 'diff-line removed';
  if (line.startsWith('@@')) return 'diff-line hunk';
  return 'diff-line';
}

export function isMarkdownActivityText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (startsWithTerminalMetadata(trimmed)) return false;
  return /^---\n[\s\S]*?\n---\n/.test(trimmed) ||
    /(^|\n)#{1,6}\s+\S/.test(trimmed) ||
    /(^|\n)[*-]\s+\S/.test(trimmed) ||
    /(^|\n)```/.test(trimmed) ||
    /(^|\n)>\s+\S/.test(trimmed);
}

function startsWithTerminalMetadata(text: string): boolean {
  return /^(Output|Exit code:|Wall time:|Process exited|Chunk ID:|cwd |Ran )/m.test(text);
}

function splitFencedDiffSegments(normalized: string): ActivitySegment[] {
  const segments: ActivitySegment[] = [];
  const pattern = /```diff\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalized)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: 'text', text: normalized.slice(cursor, match.index) });
    }
    segments.push({ type: 'diff', text: match[1] });
    cursor = match.index + match[0].length;
  }

  if (cursor < normalized.length) {
    segments.push({ type: 'text', text: normalized.slice(cursor) });
  }

  return segments;
}

function splitRawPatchSegments(segments: ActivitySegment[]): ActivitySegment[] {
  return segments.flatMap((segment) => segment.type === 'text' ? splitRawPatchText(segment.text) : [segment]);
}

function splitEmbeddedMarkdownSegments(segments: ActivitySegment[]): ActivitySegment[] {
  return segments.flatMap((segment) => segment.type === 'text' ? splitEmbeddedMarkdownText(segment.text) : [segment]);
}

function splitEmbeddedMarkdownText(text: string): ActivitySegment[] {
  const index = embeddedMarkdownStart(text);
  if (index <= 0) return [{ type: 'text', text }];
  return [
    { type: 'text', text: text.slice(0, index) },
    { type: 'text', text: text.slice(index) }
  ];
}

function embeddedMarkdownStart(text: string): number {
  const frontmatter = text.search(/\n---\n[\s\S]*?\n---\n\n(?=#{1,6}\s)/);
  if (frontmatter >= 0) return frontmatter + 1;

  const heading = text.search(/\n#{1,6}\s+\S/);
  if (heading >= 0 && startsWithTerminalMetadata(text.slice(0, heading).trim())) return heading + 1;

  return -1;
}

function splitRawPatchText(text: string): ActivitySegment[] {
  const begin = text.indexOf('*** Begin Patch');
  if (begin < 0) return [{ type: 'text', text }];

  const endMarker = '*** End Patch';
  const end = text.indexOf(endMarker, begin);
  if (end < 0) return [{ type: 'text', text }];

  const endExclusive = end + endMarker.length;
  const result: ActivitySegment[] = [];
  if (begin > 0) result.push({ type: 'text', text: text.slice(0, begin) });
  result.push({ type: 'diff', text: text.slice(begin, endExclusive) });
  if (endExclusive < text.length) result.push(...splitRawPatchText(text.slice(endExclusive)));
  return result;
}
