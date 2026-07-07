import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectFileInfo } from '../shared/types.js';

const ignoredDirectories = new Set([
  '.cache',
  '.git',
  '.next',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release'
]);

const ignoredFiles = new Set(['.DS_Store']);
const sourceExtensions = new Set([
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svelte',
  '.swift',
  '.ts',
  '.tsx',
  '.vue',
  '.yaml',
  '.yml'
]);

export async function listProjectFiles(cwd: string, limit = 2000): Promise<ProjectFileInfo[]> {
  const root = path.resolve(cwd);
  const files = await findProjectFiles(root, root, limit);
  return rankProjectFiles(files).slice(0, limit);
}

async function findProjectFiles(root: string, current: string, limit: number): Promise<ProjectFileInfo[]> {
  const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
  const files: ProjectFileInfo[] = [];

  for (const entry of entries) {
    if (files.length >= limit) break;
    if (shouldIgnoreEntry(entry.name, entry.isDirectory())) continue;

    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findProjectFiles(root, fullPath, limit - files.length));
      continue;
    }

    if (!entry.isFile()) continue;
    files.push({ path: fullPath, relativePath: path.relative(root, fullPath) });
  }

  return files;
}

function rankProjectFiles(files: ProjectFileInfo[]): ProjectFileInfo[] {
  return [...files].sort((a, b) => fileRank(a) - fileRank(b) || a.relativePath.localeCompare(b.relativePath));
}

function fileRank(file: ProjectFileInfo): number {
  if (hasHiddenPathSegment(file.relativePath)) return 7;
  if (hasGeneratedPathSegment(file.relativePath)) return 6;
  if (/^(src|app|lib|components|pages)[\\/]/i.test(file.relativePath)) return 0;
  const name = path.basename(file.relativePath);
  const extension = path.extname(name).toLowerCase();
  if (name.startsWith('.')) return 5;
  if (sourceExtensions.has(extension)) return 1;
  if (!extension) return 3;
  return 2;
}

function shouldIgnoreEntry(name: string, isDirectory: boolean): boolean {
  if (isDirectory) return ignoredDirectories.has(name) || name.startsWith('.');
  return ignoredFiles.has(name);
}

function hasHiddenPathSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => segment.startsWith('.'));
}

function hasGeneratedPathSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => ignoredDirectories.has(segment));
}
