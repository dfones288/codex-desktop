import { describe, expect, it } from 'vitest';
import { extractCodexErrorText, extractCodexEventText, extractCodexProcessText, extractConversationId } from '../src/main/codexEvents.js';

describe('extractCodexEventText', () => {
  it('returns message text from common json event shapes', () => {
    expect(extractCodexEventText({ type: 'agent_message', message: 'hello' })).toBe('hello');
    expect(extractCodexEventText({ type: 'message', content: [{ type: 'output_text', text: 'world' }] })).toBe('world');
    expect(extractCodexEventText({ delta: 'partial' })).toBe('partial');
  });

  it('ignores non-text and warning event objects', () => {
    expect(extractCodexEventText({ type: 'turn_started' })).toBeUndefined();
    expect(extractCodexEventText({ type: 'item.completed', item: { type: 'error', message: 'warning' } })).toBeUndefined();
  });
});

describe('extractCodexProcessText', () => {
  it('formats command execution events for the transcript', () => {
    expect(extractCodexProcessText({ type: 'item.started', item: { type: 'command_execution', command: 'python3 script.py' } })).toBe('Ran python3 script.py\n');
    expect(extractCodexProcessText({ type: 'exec_command', command: 'ls -la' })).toBe('Ran ls -la\n');
  });

  it('includes exec_command arguments and command output details', () => {
    expect(extractCodexProcessText({
      type: 'function_call',
      name: 'exec_command',
      arguments: JSON.stringify({ cmd: 'npm test -- tests/codexHistory.test.ts', workdir: '/tmp/project' })
    })).toBe('Ran npm test -- tests/codexHistory.test.ts\ncwd /tmp/project\n');

    expect(extractCodexProcessText({
      type: 'function_call_output',
      call_id: 'call-1',
      output: 'Chunk ID: abc\nWall time: 1.2 seconds\nProcess exited with code 0\nOutput:\nPASS tests\n'
    })).toBe('Output\nChunk ID: abc\nWall time: 1.2 seconds\nProcess exited with code 0\nOutput:\nPASS tests\n');
  });

  it('formats apply_patch and patch result events with file diffs', () => {
    expect(extractCodexProcessText({
      type: 'custom_tool_call',
      name: 'apply_patch',
      input: '*** Begin Patch\n*** Update File: src/shared/types.ts\n@@\n+filePath?: string;\n*** End Patch\n'
    })).toBe('Applied patch\n```diff\n*** Begin Patch\n*** Update File: src/shared/types.ts\n@@\n+filePath?: string;\n*** End Patch\n```\n');

    expect(extractCodexProcessText({
      type: 'patch_apply_end',
      stdout: 'Success. Updated the following files:\nM src/shared/types.ts\n',
      changes: {
        '/tmp/project/src/shared/types.ts': {
          type: 'update',
          unified_diff: '@@ -45,2 +45,3 @@\n title: string;\n+filePath?: string;\n model?: string;\n'
        }
      }
    })).toBe('Edited src/shared/types.ts (+1 -0)\n```diff\n@@ -45,2 +45,3 @@\n title: string;\n+filePath?: string;\n model?: string;\n```\nSuccess. Updated the following files:\nM src/shared/types.ts\n');
  });

  it('formats web search events for the transcript', () => {
    expect(extractCodexProcessText({ type: 'web_search_call', query: 'OpenAI Codex' })).toBe('Searched web for OpenAI Codex\n');
  });
});

describe('extractCodexErrorText', () => {
  it('formats top-level Codex error events for the transcript', () => {
    expect(extractCodexErrorText({
      type: 'error',
      message: 'stream error: request timed out'
    })).toBe('Error\nstream error: request timed out\n');
  });

  it('formats nested tool and response error events for the transcript', () => {
    expect(extractCodexErrorText({
      type: 'item.completed',
      item: { type: 'error', message: 'browser open failed' }
    })).toBe('Error\nbrowser open failed\n');

    expect(extractCodexErrorText({
      type: 'response.failed',
      response: {
        status: 'failed',
        error: { message: 'Connection timed out while loading https://example.com' }
      }
    })).toBe('Error\nConnection timed out while loading https://example.com\n');
  });
});

describe('extractConversationId', () => {
  it('finds conversation ids in common event fields', () => {
    expect(extractConversationId({ conversation_id: 'conv-1' })).toBe('conv-1');
    expect(extractConversationId({ session_id: 'session-1' })).toBe('session-1');
    expect(extractConversationId({ thread_id: 'thread-top-level' })).toBe('thread-top-level');
    expect(extractConversationId({ thread: { id: 'thread-1' } })).toBe('thread-1');
  });
});
