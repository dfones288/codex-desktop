import { describe, expect, it } from 'vitest';
import { diffLineClass, isMarkdownActivityText, splitActivitySegments } from '../src/renderer/activitySegments.js';

describe('splitActivitySegments', () => {
  it('treats raw apply_patch output as diff content', () => {
    const segments = splitActivitySegments(`Ran apply_patch <<'PATCH'
*** Begin Patch
*** Update File: src/main/codexModels.ts
@@
-    .map((model) => {
+    .map((model): CodexModelInfo | undefined => {
*** End Patch
PATCH
`);

    expect(segments).toEqual([
      { type: 'text', text: "Ran apply_patch <<'PATCH'\n" },
      {
        type: 'diff',
        text: `*** Begin Patch
*** Update File: src/main/codexModels.ts
@@
-    .map((model) => {
+    .map((model): CodexModelInfo | undefined => {
*** End Patch`
      },
      { type: 'text', text: '\nPATCH\n' }
    ]);
  });

  it('splits terminal command metadata from embedded markdown output', () => {
    const segments = splitActivitySegments(`Ran sed -n '1,220p' /Users/mac/.codex/superpowers/skills/using-superpowers/SKILL.md

Output
Chunk ID: 11d054
Wall time: 0.0000 seconds
Process exited with code 0
Output:
---
name: using-superpowers
description: Use when starting any conversation
---

# Using Skills

## The Rule

**Invoke relevant or requested skills BEFORE any response or action.**
`);

    expect(segments).toEqual([
      {
        type: 'text',
        text: `Ran sed -n '1,220p' /Users/mac/.codex/superpowers/skills/using-superpowers/SKILL.md

Output
Chunk ID: 11d054
Wall time: 0.0000 seconds
Process exited with code 0
Output:
`
      },
      {
        type: 'text',
        text: `---
name: using-superpowers
description: Use when starting any conversation
---

# Using Skills

## The Rule

**Invoke relevant or requested skills BEFORE any response or action.**
`
      }
    ]);
    expect(isMarkdownActivityText(segments[1].text)).toBe(true);
  });
});

describe('diffLineClass', () => {
  it('classifies added and removed patch lines', () => {
    expect(diffLineClass('+    next line')).toBe('diff-line added');
    expect(diffLineClass('-    previous line')).toBe('diff-line removed');
    expect(diffLineClass('@@')).toBe('diff-line hunk');
  });
});

describe('isMarkdownActivityText', () => {
  it('detects markdown-like activity output from skills or docs', () => {
    expect(isMarkdownActivityText(`# OpenAI Docs

Provide authoritative guidance.

## API Key Setup

- Use current docs.
`)).toBe(true);
  });

  it('keeps ordinary terminal output as raw text', () => {
    expect(isMarkdownActivityText('Output\nExit code: 0\nWall time: 0.7 seconds\nSuccess. Updated files.\n')).toBe(false);
  });
});
