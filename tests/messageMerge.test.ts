import { describe, expect, it } from 'vitest';
import { mergeOutputIntoMessages } from '../src/renderer/messageMerge.js';
import type { SessionMessage } from '../src/shared/types.js';

const base: SessionMessage[] = [{ id: '1', role: 'codex', text: '第一段。', createdAt: '2026-06-20T00:00:00.000Z' }];

describe('mergeOutputIntoMessages', () => {
  it('separates consecutive codex text chunks with a blank line when needed', () => {
    const result = mergeOutputIntoMessages(base, { role: 'codex', chunk: '第二段。', id: '2', createdAt: '2026-06-20T00:00:01.000Z' });

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('第一段。\n\n第二段。');
  });

  it('does not add extra blank lines for streaming chunks that already start with whitespace', () => {
    const result = mergeOutputIntoMessages(base, { role: 'codex', chunk: '\n第二段。', id: '2', createdAt: '2026-06-20T00:00:01.000Z' });

    expect(result[0].text).toBe('第一段。\n第二段。');
  });

  it('keeps activity messages separate from codex output', () => {
    const result = mergeOutputIntoMessages(base, { role: 'system', chunk: 'Ran ls\n', id: '2', createdAt: '2026-06-20T00:00:01.000Z' });

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ role: 'system', text: 'Ran ls\n' });
  });

  it('does not append duplicate adjacent activity chunks', () => {
    const messages: SessionMessage[] = [{ id: '1', role: 'system', text: 'Ran npm test\n', createdAt: '2026-06-20T00:00:00.000Z' }];

    const result = mergeOutputIntoMessages(messages, { role: 'system', chunk: 'Ran npm test\n', id: '2', createdAt: '2026-06-20T00:00:01.000Z' });

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Ran npm test\n');
  });
});
