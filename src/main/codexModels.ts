import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { wrapCodexCommandForPlatform } from './codexCommand.js';
import { buildChildProcessEnv, type PackagedPathOptions } from './processEnv.js';
import { resolveCodexCommand } from './codexLocator.js';
import type { CodexModelInfo, CodexReasoningLevel } from '../shared/types.js';

const execFileAsync = promisify(execFile);
const defaultModels: CodexModelInfo[] = [{ slug: 'gpt-5.5', defaultReasoningLevel: 'high', supportedReasoningLevels: ['minimal', 'low', 'medium', 'high', 'xhigh'] }];

interface JsonObject { [key: string]: unknown }

export async function listCodexModels(): Promise<CodexModelInfo[]> {
  try {
    const command = await resolveCodexCommand() || 'codex';
    const invocation = wrapCodexCommandForPlatform(command, ['debug', 'models']);
    const { stdout } = await execFileAsync(invocation.file, invocation.args, { maxBuffer: 1024 * 1024 * 8, env: buildCodexModelsEnv() });
    const models = parseListedModels(stdout);
    return models.length > 0 ? models : defaultModels;
  } catch {
    return defaultModels;
  }
}


export function buildCodexModelsEnv(options: PackagedPathOptions = {}): NodeJS.ProcessEnv {
  return buildChildProcessEnv(options);
}

export function parseListedModelSlugs(output: string): string[] {
  return parseListedModels(output).map((model) => model.slug);
}

export function parseListedModels(output: string): CodexModelInfo[] {
  const parsed = parseJson(output);
  const models = Array.isArray(parsed?.models) ? parsed.models : [];
  return models
    .map((model) => objectValue(model))
    .filter((model): model is JsonObject => Boolean(model))
    .filter((model) => model.visibility === 'list')
    .map((model): CodexModelInfo | undefined => {
      const slug = stringValue(model.slug);
      if (!slug) return undefined;
      const supportedReasoningLevels = arrayValue(model.supported_reasoning_levels)
        .map((level) => reasoningLevelValue(level))
        .filter((level): level is CodexReasoningLevel => Boolean(level));
      const defaultReasoningLevel = reasoningLevelValue(model.default_reasoning_level);
      const modelInfo: CodexModelInfo = {
        slug,
        supportedReasoningLevels
      };
      if (defaultReasoningLevel) modelInfo.defaultReasoningLevel = defaultReasoningLevel;
      return modelInfo;
    })
    .filter((model): model is CodexModelInfo => Boolean(model));
}

function parseJson(output: string): JsonObject | undefined {
  try {
    return objectValue(JSON.parse(output));
  } catch {
    return undefined;
  }
}

function objectValue(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function reasoningLevelValue(value: unknown): CodexReasoningLevel | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'extra-high') return 'xhigh';
  if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') return value;
  return undefined;
}
