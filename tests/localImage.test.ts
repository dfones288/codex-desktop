import { describe, expect, it } from 'vitest';
import { readLocalImage } from '../src/main/ipc.js';

describe('readLocalImage', () => {
  it('returns a missing result instead of throwing when a temp image was cleaned up', async () => {
    await expect(readLocalImage({ path: '/tmp/codex-desktop-missing-image.png' })).resolves.toEqual({ missing: true });
  });
});
