import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listProjectFiles } from '../src/main/projectFiles.js';
import { searchProjectFiles } from '../src/renderer/projectFileSearch.js';
import type { ProjectFileInfo } from '../src/shared/types.js';

const files: ProjectFileInfo[] = [
  { path: '/repo/.git/config', relativePath: '.git/config' },
  { path: '/repo/dist/index.js', relativePath: 'dist/index.js' },
  { path: '/repo/src/renderer/main.tsx', relativePath: 'src/renderer/main.tsx' },
  { path: '/repo/src/main/ipc.ts', relativePath: 'src/main/ipc.ts' },
  { path: '/repo/package-lock.json', relativePath: 'package-lock.json' },
  { path: '/repo/README.md', relativePath: 'README.md' }
];

describe('searchProjectFiles', () => {
  it('prioritizes source files over hidden and generated paths for blank queries', () => {
    expect(searchProjectFiles(files, '').map((file) => file.relativePath)).toEqual([
      'src/main/ipc.ts',
      'src/renderer/main.tsx',
      'package-lock.json',
      'README.md',
      'dist/index.js',
      '.git/config'
    ]);
  });

  it('filters current project files by path terms', () => {
    expect(searchProjectFiles(files, 'renderer main').map((file) => file.relativePath)).toEqual([
      'src/renderer/main.tsx'
    ]);
  });
});

describe('listProjectFiles', () => {
  it('scans current project source files while skipping hidden and generated directories', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-project-files-'));
    await fs.mkdir(path.join(root, 'src', 'renderer'), { recursive: true });
    await fs.mkdir(path.join(root, 'dist'), { recursive: true });
    await fs.mkdir(path.join(root, '.git'), { recursive: true });
    await fs.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'renderer', 'main.tsx'), '');
    await fs.writeFile(path.join(root, 'README.md'), '');
    await fs.writeFile(path.join(root, 'dist', 'bundle.js'), '');
    await fs.writeFile(path.join(root, '.git', 'config'), '');
    await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), '');

    const relativePaths = (await listProjectFiles(root)).map((file) => file.relativePath);

    expect(relativePaths).toEqual(['src/renderer/main.tsx', 'README.md']);
  });
});
