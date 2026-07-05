import { describe, expect, it } from 'vitest';
import { projectCandidatesFromHistories, parseSessionHistoryLines, parseSessionMessagesLines, relativeTimeLabel } from '../src/main/codexHistory.js';

const lines = [
  JSON.stringify({ timestamp: '2026-06-21T05:25:00.066Z', type: 'session_meta', payload: { id: 'thread-1', cwd: '/tmp/project', timestamp: '2026-06-21T05:24:57.616Z' } }),
  JSON.stringify({ timestamp: '2026-06-21T05:25:00.099Z', type: 'event_msg', payload: { type: 'user_message', message: '今天几号？' } }),
  JSON.stringify({ timestamp: '2026-06-21T05:26:00.099Z', type: 'event_msg', payload: { type: 'agent_message', message: '回答' } })
];

describe('parseSessionHistoryLines', () => {
  it('extracts project path, thread id, title, and updated time', () => {
    const history = parseSessionHistoryLines('/tmp/session.jsonl', lines);

    expect(history).toMatchObject({
      id: 'thread-1',
      cwd: '/tmp/project',
      title: '今天几号？',
      filePath: '/tmp/session.jsonl'
    });
    expect(history?.updatedAt).toBe('2026-06-21T05:26:00.099Z');
  });

  it('ignores environment and AGENTS context when choosing a title', () => {
    const history = parseSessionHistoryLines('/tmp/session.jsonl', [
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'session_meta', payload: { id: 'thread-1', cwd: '/tmp/project' } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>noise</environment_context>' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:02.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions for /tmp/project' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:03.000Z', type: 'event_msg', payload: { type: 'user_message', message: '真实问题是什么？' } })
    ]);

    expect(history?.title).toBe('真实问题是什么？');
  });

  it('returns undefined when metadata is missing', () => {
    expect(parseSessionHistoryLines('/tmp/session.jsonl', ['{}'])).toBeUndefined();
  });
});


describe('projectCandidatesFromHistories', () => {
  it('deduplicates history cwd values and sorts by most recent use', () => {
    expect(projectCandidatesFromHistories([
      { id: 'old-a', cwd: '/tmp/app', title: 'Old', createdAt: '2026-06-21T01:00:00.000Z', updatedAt: '2026-06-21T01:00:00.000Z', filePath: '/tmp/old.jsonl' },
      { id: 'new-b', cwd: '/tmp/tooling', title: 'New', createdAt: '2026-06-21T03:00:00.000Z', updatedAt: '2026-06-21T03:00:00.000Z', filePath: '/tmp/new.jsonl' },
      { id: 'new-a', cwd: '/tmp/app', title: 'Newer', createdAt: '2026-06-21T02:00:00.000Z', updatedAt: '2026-06-21T02:00:00.000Z', filePath: '/tmp/newer.jsonl' },
      { id: 'win', cwd: 'C:\\Users\\alice\\Desktop\\mywebsite', title: 'Win', createdAt: '2026-06-21T01:30:00.000Z', updatedAt: '2026-06-21T01:30:00.000Z', filePath: '/tmp/win.jsonl' }
    ])).toEqual([
      { id: '/tmp/tooling', name: 'tooling', path: '/tmp/tooling', lastUsedAt: '2026-06-21T03:00:00.000Z', threadCount: 1 },
      { id: '/tmp/app', name: 'app', path: '/tmp/app', lastUsedAt: '2026-06-21T02:00:00.000Z', threadCount: 2 },
      { id: '/Users/mac/Documents/MangoWork/ai_place/icode/C:\\Users\\alice\\Desktop\\mywebsite', name: 'mywebsite', path: '/Users/mac/Documents/MangoWork/ai_place/icode/C:\\Users\\alice\\Desktop\\mywebsite', lastUsedAt: '2026-06-21T01:30:00.000Z', threadCount: 1 }
    ]);
  });
});

describe('parseSessionMessagesLines', () => {
  it('restores visible user and assistant messages from Codex history lines', () => {
    const messages = parseSessionMessagesLines(lines);

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['user', '今天几号？'],
      ['codex', '回答']
    ]);
  });

  it('restores response_item messages and skips environment context noise', () => {
    const messages = parseSessionMessagesLines([
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>noise</environment_context>' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '继续优化 UI' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:02.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '已优化。' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:03.000Z', type: 'response_item', payload: { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"npm test"}' } })
    ]);

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['user', '继续优化 UI'],
      ['codex', '已优化。'],
      ['system', 'Ran npm test']
    ]);
  });

  it('restores Codex error events as system messages', () => {
    const messages = parseSessionMessagesLines([
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'response_item', payload: { type: 'error', message: 'stream error: request timed out' } })
    ]);

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['system', 'Error\nstream error: request timed out']
    ]);
  });

  it('deduplicates matching event_msg and response_item assistant text', () => {
    const messages = parseSessionMessagesLines([
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'event_msg', payload: { type: 'agent_message', message: '同一段回答' } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.001Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '同一段回答' }] } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:01.000Z', type: 'event_msg', payload: { type: 'agent_message', message: '下一段回答' } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:01.001Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '下一段回答' }] } })
    ]);

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['codex', '同一段回答\n\n下一段回答']
    ]);
  });

  it('deduplicates user response_item text already contained in an image user_message', () => {
    const messages = parseSessionMessagesLines([
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.000Z', type: 'event_msg', payload: { type: 'user_message', message: '<image name=[Image #1] path="/tmp/a.png">\n</image>\n[Image #1] 如图用户发送的消息' } }),
      JSON.stringify({ timestamp: '2026-06-21T05:25:00.001Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '[Image #1] 如图用户发送的消息' }] } })
    ]);

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['user', '<image name=[Image #1] path="/tmp/a.png">\n</image>\n[Image #1] 如图用户发送的消息']
    ]);
  });
});

describe('relativeTimeLabel', () => {
  it('formats recent sessions compactly', () => {
    expect(relativeTimeLabel('2026-06-21T05:20:00.000Z', new Date('2026-06-21T05:25:00.000Z'))).toBe('5m');
    expect(relativeTimeLabel('2026-06-20T05:25:00.000Z', new Date('2026-06-21T05:25:00.000Z'))).toBe('1d');
  });
});
