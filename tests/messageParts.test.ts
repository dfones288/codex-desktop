import { describe, expect, it } from 'vitest';
import { splitUserMessageParts } from '../src/renderer/messageParts.js';

describe('splitUserMessageParts', () => {
  it('extracts codex image tags into previewable image parts', () => {
    expect(splitUserMessageParts(`before
<image name=[Image #1] path="/tmp/a.png">
</image>
after`)).toEqual([
      { type: 'text', text: 'before' },
      { type: 'image', name: 'Image #1', path: '/tmp/a.png' },
      { type: 'text', text: 'after' }
    ]);
  });

  it('keeps the matching image reference marker in adjacent text', () => {
    expect(splitUserMessageParts(`<image name=[Image #1] path="/tmp/a.png">
</image>
[Image #1] 如图，显示图片预览`)).toEqual([
      { type: 'image', name: 'Image #1', path: '/tmp/a.png' },
      { type: 'text', text: '[Image #1] 如图，显示图片预览' }
    ]);
  });

  it('deduplicates repeated text after an image preview while preserving image references', () => {
    expect(splitUserMessageParts(`<image name=[Image #1] path="/tmp/a.png">
</image>
[Image #1] 如图，显示图片预览

[Image #1] 如图，显示图片预览`)).toEqual([
      { type: 'image', name: 'Image #1', path: '/tmp/a.png' },
      { type: 'text', text: '[Image #1] 如图，显示图片预览' }
    ]);
  });

  it('deduplicates repeated numbered-list user text after multiple images while preserving image references', () => {
    expect(splitUserMessageParts(`<image name=[Image #1] path="/tmp/a.png">
</image>
<image name=[Image #2] path="/tmp/b.png">
</image>
1、[Image #1] 如图用户发送的消息，这个 user 标注去掉
2、整个页面页面文案字体偏大了，建议全部缩小2号试试
3、[Image #2] 还有这个行间距也太大了

1、[Image #1] 如图用户发送的消息，这个 user 标注去掉
2、整个页面页面文案字体偏大了，建议全部缩小2号试试
3、[Image #2] 还有这个行间距也太大了`)).toEqual([
      { type: 'image', name: 'Image #1', path: '/tmp/a.png' },
      { type: 'image', name: 'Image #2', path: '/tmp/b.png' },
      { type: 'text', text: '1、[Image #1] 如图用户发送的消息，这个 user 标注去掉\n2、整个页面页面文案字体偏大了，建议全部缩小2号试试\n3、[Image #2] 还有这个行间距也太大了' }
    ]);
  });
});
