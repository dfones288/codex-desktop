import { describe, expect, it } from 'vitest';
import { tokenizeCode } from '../src/renderer/codeHighlight.js';

describe('tokenizeCode', () => {
  it('classifies common code tokens for syntax highlighting', () => {
    const tokens = tokenizeCode('def quick_sort(arr):\n  return [1, "x"] # done');

    expect(tokens).toContainEqual({ text: 'def', kind: 'keyword' });
    expect(tokens).toContainEqual({ text: 'quick_sort', kind: 'function' });
    expect(tokens).toContainEqual({ text: 'return', kind: 'keyword' });
    expect(tokens).toContainEqual({ text: '1', kind: 'number' });
    expect(tokens).toContainEqual({ text: '"x"', kind: 'string' });
    expect(tokens).toContainEqual({ text: '# done', kind: 'comment' });
  });
});
