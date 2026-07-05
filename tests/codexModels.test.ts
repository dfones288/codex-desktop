import { describe, expect, it } from 'vitest';
import { buildCodexModelsEnv, parseListedModelSlugs, parseListedModels } from '../src/main/codexModels.js';

describe('parseListedModelSlugs', () => {
  it('returns only visible model slugs', () => {
    const output = JSON.stringify({
      models: [
        { slug: 'gpt-5.5', visibility: 'list' },
        { slug: 'hidden-model', visibility: 'hidden' },
        { slug: 'gpt-5.2', visibility: 'list' }
      ]
    });

    expect(parseListedModelSlugs(output)).toEqual(['gpt-5.5', 'gpt-5.2']);
  });

  it('ignores malformed model entries', () => {
    const output = JSON.stringify({
      models: [
        { slug: '', visibility: 'list' },
        { visibility: 'list' },
        { slug: 'gpt-5.5', visibility: 'list' }
      ]
    });

    expect(parseListedModelSlugs(output)).toEqual(['gpt-5.5']);
  });
});

describe('parseListedModels', () => {
  it('returns visible models with default and supported reasoning levels', () => {
    const output = JSON.stringify({
      models: [
        {
          slug: 'gpt-5.5',
          visibility: 'list',
          default_reasoning_level: 'medium',
          supported_reasoning_levels: ['low', 'medium', 'high', 'xhigh']
        },
        {
          slug: 'hidden-model',
          visibility: 'hidden',
          default_reasoning_level: 'low',
          supported_reasoning_levels: ['low']
        }
      ]
    });

    expect(parseListedModels(output)).toEqual([
      {
        slug: 'gpt-5.5',
        defaultReasoningLevel: 'medium',
        supportedReasoningLevels: ['low', 'medium', 'high', 'xhigh']
      }
    ]);
  });

  it('normalizes extra-high reasoning from model metadata', () => {
    const output = JSON.stringify({
      models: [
        {
          slug: 'gpt-5.5',
          visibility: 'list',
          default_reasoning_level: 'extra-high',
          supported_reasoning_levels: ['minimal', 'extra-high']
        }
      ]
    });

    expect(parseListedModels(output)).toEqual([
      {
        slug: 'gpt-5.5',
        defaultReasoningLevel: 'xhigh',
        supportedReasoningLevels: ['minimal', 'xhigh']
      }
    ]);
  });
});


describe('buildCodexModelsEnv', () => {
  it('uses the packaged app PATH when reading models', () => {
    const env = buildCodexModelsEnv({ platform: 'darwin', path: '/usr/bin:/bin', home: '/Users/alice' });

    expect(env.PATH?.split(':')).toEqual(expect.arrayContaining(['/opt/homebrew/bin', '/Users/alice/.codex/bin']));
  });
});
