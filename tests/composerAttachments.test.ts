import { describe, expect, it } from 'vitest';
import { buildPromptWithAttachments } from '../src/renderer/composerAttachments.js';

describe('buildPromptWithAttachments', () => {
  it('prepends codex image tags before text content', () => {
    expect(buildPromptWithAttachments('请看这张图', [
      { id: '1', name: 'Image #1', path: '/tmp/a.png' },
      { id: '2', name: 'Image #2', path: '/tmp/b.png' }
    ])).toBe(`<image name=[Image #1] path="/tmp/a.png">
</image>
<image name=[Image #2] path="/tmp/b.png">
</image>
请看这张图`);
  });

  it('injects selected skills and files into the prompt sent to codex', () => {
    expect(buildPromptWithAttachments('帮我改一下', {
      attachments: [],
      skills: [{ id: 'html-ppt', name: 'Html Ppt', description: 'slides' }],
      files: [{ path: '/repo/src/main.ts', relativePath: 'src/main.ts' }]
    })).toBe(`Use skill: Html Ppt
Use file: @src/main.ts
帮我改一下`);
  });

  it('keeps image tags and references non-image file attachments by path', () => {
    expect(buildPromptWithAttachments('总结这些文件', {
      attachments: [
        { id: '1', name: 'ScreenShot.png', path: '/tmp/ScreenShot.png', kind: 'image' },
        { id: '2', name: 'notes.pdf', path: '/tmp/notes.pdf', kind: 'file' }
      ],
      skills: [],
      files: []
    })).toBe(`<image name=[ScreenShot.png] path="/tmp/ScreenShot.png">
</image>
Use attached file: notes.pdf (/tmp/notes.pdf)
总结这些文件`);
  });

});
