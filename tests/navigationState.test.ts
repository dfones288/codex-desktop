import { describe, expect, it } from 'vitest';
import { viewAfterOpeningThread } from '../src/renderer/navigationState.js';

describe('navigation state', () => {
  it('returns to chat when opening a project history from the skills page', () => {
    expect(viewAfterOpeningThread('skills')).toBe('chat');
  });

  it('keeps chat visible when opening a thread from chat', () => {
    expect(viewAfterOpeningThread('chat')).toBe('chat');
  });
});
