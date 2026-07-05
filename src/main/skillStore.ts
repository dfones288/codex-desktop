import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSkillFolderLabel, parseSkillFrontmatter, titleCaseSkillName } from './skillStoreHelpers.js';
import type { CodexSkillDetail, CodexSkillInfo } from '../shared/types.js';

const skillRoots = [path.join(os.homedir(), '.codex', 'skills'), path.join(os.homedir(), '.codex', 'superpowers', 'skills')];
const disabledSkillsPath = path.join(os.homedir(), '.codex', 'disabled-skills.json');

export type SkillDetail = CodexSkillDetail;

export async function listLocalSkills(): Promise<CodexSkillInfo[]> {
  const details = await listLocalSkillDetails();
  return details.map(({ path: _path, sourceRoot: _sourceRoot, enabled: _enabled, installType: _installType, frontmatter: _frontmatter, content: _content, ...skill }) => skill).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listLocalSkillDetails(): Promise<SkillDetail[]> {
  const disabled = new Set(await loadDisabledSkillIds());
  const files = (await Promise.all(skillRoots.map((root) => findSkillFiles(root).catch(() => [])))).flat();
  const skills = await Promise.all(files.map(async (file) => parseSkillFile(file, disabled)));
  return skills.filter((skill): skill is SkillDetail => Boolean(skill)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSkillDetail(skillId: string): Promise<SkillDetail | undefined> {
  const skills = await listLocalSkillDetails();
  return skills.find((skill) => skill.id === skillId);
}

export async function disableSkill(skillId: string): Promise<void> {
  const disabled = new Set(await loadDisabledSkillIds());
  disabled.add(skillId);
  await saveDisabledSkillIds(disabled);
}

export async function enableSkill(skillId: string): Promise<void> {
  const disabled = new Set(await loadDisabledSkillIds());
  disabled.delete(skillId);
  await saveDisabledSkillIds(disabled);
}

export async function uninstallSkill(skillId: string): Promise<void> {
  const skill = await getSkillDetail(skillId);
  if (!skill) return;
  await fs.rm(skill.path, { recursive: true, force: true });
  await enableSkill(skillId);
}

export async function openSkillFolder(skillId: string): Promise<string | undefined> {
  const skill = await getSkillDetail(skillId);
  return skill?.sourceRoot;
}

async function findSkillFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return findSkillFiles(fullPath);
    return entry.isFile() && entry.name === 'SKILL.md' ? [fullPath] : [];
  }));
  return nested.flat();
}

async function parseSkillFile(filePath: string, disabled: Set<string>): Promise<SkillDetail | undefined> {
  const text = await fs.readFile(filePath, 'utf8');
  const frontmatter = parseSkillFrontmatter(text);
  const name = frontmatter.name || path.basename(path.dirname(filePath));
  if (!name) return undefined;
  const sourceRoot = path.dirname(filePath);
  return {
    id: name,
    name: titleCaseSkillName(name),
    description: frontmatter.description,
    source: filePath,
    path: sourceRoot,
    sourceRoot,
    enabled: !disabled.has(name),
    installType: buildSkillFolderLabel(sourceRoot),
    frontmatter,
    content: text
  };
}

async function loadDisabledSkillIds(): Promise<string[]> {
  try {
    const raw = await fs.readFile(disabledSkillsPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

async function saveDisabledSkillIds(disabled: Set<string>): Promise<void> {
  await fs.mkdir(path.dirname(disabledSkillsPath), { recursive: true });
  await fs.writeFile(disabledSkillsPath, `${JSON.stringify([...disabled].sort(), null, 2)}\n`, 'utf8');
}
