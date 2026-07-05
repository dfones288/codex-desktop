import { describe, expect, it } from 'vitest';
import { visibleTranscriptMessages } from '../src/renderer/displayMessages.js';
import type { SessionMessage } from '../src/shared/types.js';

describe('visibleTranscriptMessages', () => {
  it('hides adjacent duplicate user messages from optimistic and stored copies', () => {
    const messages: SessionMessage[] = [
      { id: '1', role: 'user', text: '<image name=[Image #1] path="/tmp/a.png">\n</image>\n[Image #1] 看图', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', role: 'user', text: '<image name=[Image #1] path="/tmp/a.png">\n</image>\n看图', createdAt: '2026-01-01T00:00:01.000Z' },
      { id: '3', role: 'codex', text: '收到', createdAt: '2026-01-01T00:00:02.000Z' }
    ];

    expect(visibleTranscriptMessages(messages).map((message) => message.id)).toEqual(['1', '3']);
  });
});
