export function parseSkillFrontmatter(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const match = /^---\n([\s\S]*?)\n---/m.exec(text);
  if (!match) return result;
  for (const line of match[1].split('\n')) {
    const item = /^([A-Za-z0-9_-]+):\s*"?([^"\n]+)"?$/.exec(line.trim());
    if (item) result[item[1]] = item[2].trim();
  }
  return result;
}

export function titleCaseSkillName(value: string): string {
  return value.split(/[-_:]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function buildSkillFolderLabel(sourceRoot: string): 'skills' | 'superpowers' {
  return sourceRoot.includes('/superpowers/') || sourceRoot.includes('\\superpowers\\') ? 'superpowers' : 'skills';
}
