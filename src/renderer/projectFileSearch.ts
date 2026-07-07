import type { ProjectFileInfo } from '../shared/types.js';

const sourceRoots = /^(src|app|lib|components|pages)[\\/]/i;
const generatedSegments = new Set(['.cache', '.git', '.next', '.turbo', '.vite', 'build', 'coverage', 'dist', 'node_modules', 'out', 'release']);
const sourceExtensions = new Set(['.c', '.cpp', '.cs', '.css', '.go', '.html', '.java', '.js', '.json', '.jsx', '.md', '.mjs', '.py', '.rs', '.scss', '.sh', '.sql', '.svelte', '.swift', '.ts', '.tsx', '.vue', '.yaml', '.yml']);

export function searchProjectFiles(files: ProjectFileInfo[], query: string, limit = 18): ProjectFileInfo[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return rankProjectFiles(files).slice(0, limit);

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return files
    .map((file) => ({ file, score: scoreFile(file, terms) }))
    .filter((item) => item.score < Number.POSITIVE_INFINITY)
    .sort((a, b) => a.score - b.score || a.file.relativePath.localeCompare(b.file.relativePath))
    .map((item) => item.file)
    .slice(0, limit);
}

function rankProjectFiles(files: ProjectFileInfo[]): ProjectFileInfo[] {
  return [...files].sort((a, b) => fileRank(a) - fileRank(b) || a.relativePath.localeCompare(b.relativePath));
}

function fileRank(file: ProjectFileInfo): number {
  if (hasHiddenPathSegment(file.relativePath)) return 7;
  if (hasGeneratedPathSegment(file.relativePath)) return 6;
  if (sourceRoots.test(file.relativePath)) return 0;
  const name = basename(file.relativePath);
  const extension = extensionName(name);
  if (name.startsWith('.')) return 5;
  if (sourceExtensions.has(extension)) return 1;
  if (!extension) return 3;
  return 2;
}

function scoreFile(file: ProjectFileInfo, terms: string[]): number {
  const relativePath = file.relativePath.toLowerCase();
  const fileName = basename(relativePath);
  let score = fileRank(file) * 100;

  for (const term of terms) {
    const pathIndex = relativePath.indexOf(term);
    if (pathIndex < 0) return Number.POSITIVE_INFINITY;
    const nameIndex = fileName.indexOf(term);
    score += nameIndex >= 0 ? nameIndex : 40 + pathIndex;
  }

  return score;
}

function hasHiddenPathSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => segment.startsWith('.'));
}

function hasGeneratedPathSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => generatedSegments.has(segment));
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]+/).filter(Boolean).at(-1) || filePath;
}

function extensionName(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index > 0 ? fileName.slice(index).toLowerCase() : '';
}
