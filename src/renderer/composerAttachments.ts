export interface ComposerAttachment {
  id: string;
  name: string;
  path: string;
  kind?: 'image' | 'file';
}

export type ComposerImageAttachment = ComposerAttachment;

export interface ComposerSkillReference {
  id: string;
  name: string;
  description?: string;
}

export interface ComposerFileReference {
  path: string;
  relativePath: string;
}

export interface ComposerPromptParts {
  attachments: ComposerAttachment[];
  skills: ComposerSkillReference[];
  files: ComposerFileReference[];
}

export function buildPromptWithAttachments(text: string, parts: ComposerAttachment[] | ComposerPromptParts): string {
  const normalizedParts = Array.isArray(parts) ? { attachments: parts, skills: [], files: [] } : parts;
  const skillTags = normalizedParts.skills.map((skill) => `Use skill: ${skill.name}`);
  const fileTags = normalizedParts.files.map((file) => `Use file: @${file.relativePath}`);
  const attachmentTags = normalizedParts.attachments.map((attachment) => {
    if ((attachment.kind ?? 'image') === 'image') return `<image name=[${attachment.name}] path="${attachment.path}">\n</image>`;
    return `Use attached file: ${attachment.name} (${attachment.path})`;
  });
  return [...skillTags, ...fileTags, ...attachmentTags, text.trim()].filter(Boolean).join('\n');
}
