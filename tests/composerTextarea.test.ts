import { describe, expect, it } from 'vitest';
import { composerTextareaHeight } from '../src/renderer/composerTextarea.js';

describe('composerTextareaHeight', () => {
  it('grows to fit content until half of the workspace height', () => {
    expect(composerTextareaHeight({ scrollHeight: 160, containerHeight: 700, minHeight: 38 })).toEqual({ height: 160, overflowY: 'hidden' });
  });

  it('caps content at half of the workspace height and enables vertical scrolling', () => {
    expect(composerTextareaHeight({ scrollHeight: 520, containerHeight: 700, minHeight: 38 })).toEqual({ height: 350, overflowY: 'auto' });
  });

  it('keeps the compact minimum height for short content', () => {
    expect(composerTextareaHeight({ scrollHeight: 20, containerHeight: 700, minHeight: 38 })).toEqual({ height: 38, overflowY: 'hidden' });
  });
});
