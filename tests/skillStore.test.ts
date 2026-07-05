import { describe, expect, it } from 'vitest';
import { buildSkillFolderLabel, parseSkillFrontmatter } from '../src/main/skillStoreHelpers.js';

describe('parseSkillFrontmatter', () => {
  it('reads name and description from a skill frontmatter block', () => {
    expect(parseSkillFrontmatter(`---\nname: pdf-skill\ndescription: Create PDFs\n---\nBody`)).toEqual({
      name: 'pdf-skill',
      description: 'Create PDFs'
    });
  });
});

describe('buildSkillFolderLabel', () => {
  it('uses a concise label for superpowers skills and regular skills', () => {
    expect(buildSkillFolderLabel('/Users/mac/.codex/superpowers/skills/pdf-skill')).toBe('superpowers');
    expect(buildSkillFolderLabel('/Users/mac/.codex/skills/html-ppt')).toBe('skills');
  });
});
